import Foundation
import SQLite3

private let evaOrbitSQLiteTransient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

struct HealthDeletedDateLookup {
    let dates: Set<String>
    let unknownCount: Int
}

final class HealthLocalStore {
    private let lock = NSRecursiveLock()
    private var database: OpaquePointer?

    init(databaseURL: URL? = nil) throws {
        let url: URL
        if let databaseURL {
            url = databaseURL
        } else {
            url = try Self.defaultDatabaseURL()
        }
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        guard sqlite3_open_v2(url.path, &database, SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX, nil) == SQLITE_OK else {
            throw HealthLocalStoreError.openFailed
        }
        sqlite3_busy_timeout(database, 5_000)
        try execute("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
        try migrate()
    }

    deinit { sqlite3_close(database) }

    private static func defaultDatabaseURL() throws -> URL {
        let root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        return root.appendingPathComponent("EvaOrbitHealth", isDirectory: true).appendingPathComponent("health.sqlite3")
    }

    private func migrate() throws {
        try execute("""
        CREATE TABLE IF NOT EXISTS anchors (
          metric TEXT PRIMARY KEY,
          anchor BLOB NOT NULL,
          updated_at REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS samples (
          uuid TEXT PRIMARY KEY,
          metric TEXT NOT NULL,
          start_at REAL NOT NULL,
          end_at REAL NOT NULL,
          value_kcal REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sample_days (
          uuid TEXT NOT NULL REFERENCES samples(uuid) ON DELETE CASCADE,
          metric TEXT NOT NULL,
          local_date TEXT NOT NULL,
          PRIMARY KEY(uuid, local_date)
        );
        CREATE INDEX IF NOT EXISTS idx_sample_days_metric_date ON sample_days(metric, local_date);
        CREATE TABLE IF NOT EXISTS daily_aggregates (
          local_date TEXT NOT NULL,
          metric TEXT NOT NULL,
          kcal REAL NOT NULL,
          sample_count INTEGER NOT NULL,
          revision INTEGER NOT NULL,
          calculated_at TEXT NOT NULL,
          PRIMARY KEY(local_date, metric)
        );
        CREATE TABLE IF NOT EXISTS outbox (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          local_date TEXT NOT NULL,
          metric TEXT NOT NULL,
          kcal REAL NOT NULL,
          revision INTEGER NOT NULL,
          sample_count INTEGER NOT NULL,
          calculated_at TEXT NOT NULL,
          state TEXT NOT NULL CHECK(state IN ('pending','inflight')),
          attempt INTEGER NOT NULL DEFAULT 0,
          next_retry REAL NOT NULL DEFAULT 0,
          created_at REAL NOT NULL,
          updated_at REAL NOT NULL,
          UNIQUE(local_date, metric, revision)
        );
        CREATE INDEX IF NOT EXISTS idx_outbox_ready ON outbox(state, next_retry, id);
        CREATE TABLE IF NOT EXISTS body_mass_samples (
          uuid TEXT PRIMARY KEY, occurred_at REAL NOT NULL, kilograms REAL NOT NULL,
          source_bundle TEXT NOT NULL, source_name TEXT NOT NULL, sync_identifier TEXT, sync_version INTEGER
        );
        CREATE TABLE IF NOT EXISTS body_mass_outbox (
          id INTEGER PRIMARY KEY AUTOINCREMENT, operation TEXT NOT NULL CHECK(operation IN ('upsert','delete')),
          sample_id TEXT NOT NULL, occurred_at TEXT, weight_kg REAL, source_bundle TEXT, source_name TEXT,
          sync_identifier TEXT, sync_version INTEGER, state TEXT NOT NULL CHECK(state IN ('pending','inflight')),
          attempt INTEGER NOT NULL DEFAULT 0, next_retry REAL NOT NULL DEFAULT 0, created_at REAL NOT NULL, updated_at REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_body_mass_outbox_ready ON body_mass_outbox(state,next_retry,id);
        CREATE TABLE IF NOT EXISTS metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        PRAGMA user_version=1;
        """)
    }

    func anchor(for metric: HealthMetric) throws -> Data? {
        try locked {
            let statement = try prepare("SELECT anchor FROM anchors WHERE metric=?")
            defer { sqlite3_finalize(statement) }
            bind(metric.rawValue, at: 1, in: statement)
            guard sqlite3_step(statement) == SQLITE_ROW, let bytes = sqlite3_column_blob(statement, 0) else { return nil }
            return Data(bytes: bytes, count: Int(sqlite3_column_bytes(statement, 0)))
        }
    }

    func deletedDates(for uuids: [String], metric: HealthMetric) throws -> HealthDeletedDateLookup {
        try locked {
            var dates = Set<String>()
            var known = Set<String>()
            let statement = try prepare("SELECT uuid,local_date FROM sample_days WHERE metric=? AND uuid=?")
            defer { sqlite3_finalize(statement) }
            for uuid in uuids {
                sqlite3_reset(statement)
                sqlite3_clear_bindings(statement)
                bind(metric.rawValue, at: 1, in: statement)
                bind(uuid, at: 2, in: statement)
                while sqlite3_step(statement) == SQLITE_ROW {
                    known.insert(uuid)
                    dates.insert(columnText(statement, 1))
                }
            }
            return HealthDeletedDateLookup(dates: dates, unknownCount: uuids.filter { !known.contains($0) }.count)
        }
    }

    func commitDelta(
        metric: HealthMetric,
        samples: [HealthEnergySample],
        deletedUUIDs: [String],
        encodedAnchor: Data,
        totals: [String: Double],
        affectedDates: Set<String>,
        replaceWindow: HealthDateWindow? = nil,
        now: Date = Date()
    ) throws {
        try locked {
            try execute("BEGIN IMMEDIATE")
            do {
                if let replaceWindow {
                    let statement = try prepare("DELETE FROM samples WHERE metric=? AND start_at>=? AND start_at<?")
                    bind(metric.rawValue, at: 1, in: statement)
                    sqlite3_bind_double(statement, 2, replaceWindow.start.timeIntervalSince1970)
                    sqlite3_bind_double(statement, 3, replaceWindow.end.timeIntervalSince1970)
                    try stepDone(statement)
                    sqlite3_finalize(statement)
                } else {
                    let statement = try prepare("DELETE FROM samples WHERE metric=? AND uuid=?")
                    for uuid in deletedUUIDs {
                        sqlite3_reset(statement)
                        sqlite3_clear_bindings(statement)
                        bind(metric.rawValue, at: 1, in: statement)
                        bind(uuid, at: 2, in: statement)
                        try stepDone(statement)
                    }
                    sqlite3_finalize(statement)
                }

                for sample in samples { try upsertSample(sample) }

                let calculatedAt = HealthDateFormatter.iso8601.string(from: now)
                for localDate in affectedDates.sorted() {
                    guard let kcal = totals[localDate] else { throw HealthLocalStoreError.missingDailyTotal(localDate) }
                    let count = try sampleCount(metric: metric, localDate: localDate)
                    let revision = try nextRevision(metric: metric, localDate: localDate)
                    try upsertAggregateAndOutbox(metric: metric, localDate: localDate, kcal: kcal, sampleCount: count, revision: revision, calculatedAt: calculatedAt, now: now)
                    if count > 0 { try setMetadataUnlocked("hasReadData", value: "true") }
                }

                let anchorStatement = try prepare("INSERT INTO anchors(metric,anchor,updated_at) VALUES(?,?,?) ON CONFLICT(metric) DO UPDATE SET anchor=excluded.anchor,updated_at=excluded.updated_at")
                bind(metric.rawValue, at: 1, in: anchorStatement)
                encodedAnchor.withUnsafeBytes { bytes in
                    sqlite3_bind_blob(anchorStatement, 2, bytes.baseAddress, Int32(bytes.count), evaOrbitSQLiteTransient)
                }
                sqlite3_bind_double(anchorStatement, 3, now.timeIntervalSince1970)
                try stepDone(anchorStatement)
                sqlite3_finalize(anchorStatement)
                try setMetadataUnlocked("lastLocalSync", value: HealthDateFormatter.iso8601.string(from: now))
                try setMetadataUnlocked("lastError", value: "")
                try execute("COMMIT")
            } catch {
                try? execute("ROLLBACK")
                throw error
            }
        }
    }

    func recoverInflight(now: Date = Date()) throws {
        try locked {
            let statement = try prepare("UPDATE outbox SET state='pending',next_retry=0,updated_at=? WHERE state='inflight'")
            sqlite3_bind_double(statement, 1, now.timeIntervalSince1970)
            try stepDone(statement)
            sqlite3_finalize(statement)
            let bodyMass = try prepare("UPDATE body_mass_outbox SET state='pending',next_retry=0,updated_at=? WHERE state='inflight'")
            sqlite3_bind_double(bodyMass, 1, now.timeIntervalSince1970)
            try stepDone(bodyMass)
            sqlite3_finalize(bodyMass)
        }
    }

    func commitBodyMassDelta(samples: [HealthBodyMassSample], deletedUUIDs: [String], encodedAnchor: Data, now: Date = Date()) throws {
        try locked {
            try execute("BEGIN IMMEDIATE")
            do {
                let removeSample = try prepare("DELETE FROM body_mass_samples WHERE uuid=?")
                let clearPending = try prepare("DELETE FROM body_mass_outbox WHERE sample_id=? AND state='pending'")
                let deletion = try prepare("INSERT INTO body_mass_outbox(operation,sample_id,state,attempt,next_retry,created_at,updated_at) VALUES('delete',?,'pending',0,0,?,?)")
                for uuid in deletedUUIDs {
                    for statement in [removeSample, clearPending] { sqlite3_reset(statement); sqlite3_clear_bindings(statement); bind(uuid, at: 1, in: statement); try stepDone(statement) }
                    sqlite3_reset(deletion); sqlite3_clear_bindings(deletion); bind(uuid, at: 1, in: deletion); sqlite3_bind_double(deletion, 2, now.timeIntervalSince1970); sqlite3_bind_double(deletion, 3, now.timeIntervalSince1970); try stepDone(deletion)
                }
                sqlite3_finalize(removeSample); sqlite3_finalize(clearPending); sqlite3_finalize(deletion)
                let upsert = try prepare("INSERT INTO body_mass_samples(uuid,occurred_at,kilograms,source_bundle,source_name,sync_identifier,sync_version) VALUES(?,?,?,?,?,?,?) ON CONFLICT(uuid) DO UPDATE SET occurred_at=excluded.occurred_at,kilograms=excluded.kilograms,source_bundle=excluded.source_bundle,source_name=excluded.source_name,sync_identifier=excluded.sync_identifier,sync_version=excluded.sync_version")
                let enqueue = try prepare("INSERT INTO body_mass_outbox(operation,sample_id,occurred_at,weight_kg,source_bundle,source_name,sync_identifier,sync_version,state,attempt,next_retry,created_at,updated_at) VALUES('upsert',?,?,?,?,?,?,?,'pending',0,0,?,?)")
                let clearUpsert = try prepare("DELETE FROM body_mass_outbox WHERE sample_id=? AND state='pending'")
                for sample in samples {
                    sqlite3_reset(upsert); sqlite3_clear_bindings(upsert); bind(sample.uuid, at: 1, in: upsert); sqlite3_bind_double(upsert, 2, sample.occurredAt.timeIntervalSince1970); sqlite3_bind_double(upsert, 3, sample.kilograms); bind(sample.sourceBundle, at: 4, in: upsert); bind(sample.sourceName, at: 5, in: upsert); bindOptional(sample.syncIdentifier, at: 6, in: upsert); bindOptionalInteger(sample.syncVersion, at: 7, in: upsert); try stepDone(upsert)
                    sqlite3_reset(clearUpsert); sqlite3_clear_bindings(clearUpsert); bind(sample.uuid, at: 1, in: clearUpsert); try stepDone(clearUpsert)
                    sqlite3_reset(enqueue); sqlite3_clear_bindings(enqueue); bind(sample.uuid, at: 1, in: enqueue); bind(HealthDateFormatter.iso8601.string(from: sample.occurredAt), at: 2, in: enqueue); sqlite3_bind_double(enqueue, 3, sample.kilograms); bind(sample.sourceBundle, at: 4, in: enqueue); bind(sample.sourceName, at: 5, in: enqueue); bindOptional(sample.syncIdentifier, at: 6, in: enqueue); bindOptionalInteger(sample.syncVersion, at: 7, in: enqueue); sqlite3_bind_double(enqueue, 8, now.timeIntervalSince1970); sqlite3_bind_double(enqueue, 9, now.timeIntervalSince1970); try stepDone(enqueue)
                }
                sqlite3_finalize(upsert); sqlite3_finalize(enqueue); sqlite3_finalize(clearUpsert)
                let anchor = try prepare("INSERT INTO anchors(metric,anchor,updated_at) VALUES('body_mass',?,?) ON CONFLICT(metric) DO UPDATE SET anchor=excluded.anchor,updated_at=excluded.updated_at")
                encodedAnchor.withUnsafeBytes { sqlite3_bind_blob(anchor, 1, $0.baseAddress, Int32($0.count), evaOrbitSQLiteTransient) }; sqlite3_bind_double(anchor, 2, now.timeIntervalSince1970); try stepDone(anchor); sqlite3_finalize(anchor)
                if !samples.isEmpty { try setMetadataUnlocked("hasReadData", value: "true") }
                try setMetadataUnlocked("lastLocalSync", value: HealthDateFormatter.iso8601.string(from: now)); try setMetadataUnlocked("lastError", value: ""); try execute("COMMIT")
            } catch { try? execute("ROLLBACK"); throw error }
        }
    }

    func takePendingBodyMassBatch(limit: Int, now: Date = Date()) throws -> [HealthBodyMassChange] {
        try locked {
            try execute("BEGIN IMMEDIATE")
            do {
                let statement = try prepare("SELECT id,operation,sample_id,occurred_at,weight_kg,source_bundle,source_name,sync_identifier,sync_version FROM body_mass_outbox WHERE state='pending' AND next_retry<=? ORDER BY id LIMIT ?")
                sqlite3_bind_double(statement, 1, now.timeIntervalSince1970)
                sqlite3_bind_int(statement, 2, Int32(limit))
                var changes: [HealthBodyMassChange] = []
                while sqlite3_step(statement) == SQLITE_ROW {
                    guard let operation = HealthBodyMassChange.Operation(rawValue: columnText(statement, 1)) else { continue }
                    changes.append(HealthBodyMassChange(
                        id: sqlite3_column_int64(statement, 0),
                        operation: operation,
                        sampleId: columnText(statement, 2),
                        occurredAt: columnOptionalText(statement, 3),
                        weightKg: sqlite3_column_type(statement, 4) == SQLITE_NULL ? nil : sqlite3_column_double(statement, 4),
                        sourceBundle: columnOptionalText(statement, 5),
                        sourceName: columnOptionalText(statement, 6),
                        syncIdentifier: columnOptionalText(statement, 7),
                        syncVersion: sqlite3_column_type(statement, 8) == SQLITE_NULL ? nil : Int(sqlite3_column_int(statement, 8))
                    ))
                }
                sqlite3_finalize(statement)
                let update = try prepare("UPDATE body_mass_outbox SET state='inflight',updated_at=? WHERE id=?")
                for change in changes {
                    sqlite3_reset(update)
                    sqlite3_clear_bindings(update)
                    sqlite3_bind_double(update, 1, now.timeIntervalSince1970)
                    sqlite3_bind_int64(update, 2, change.id)
                    try stepDone(update)
                }
                sqlite3_finalize(update)
                try execute("COMMIT")
                return changes
            } catch {
                try? execute("ROLLBACK")
                throw error
            }
        }
    }

    func completeBodyMassUpload(ids: [Int64], now: Date = Date()) throws {
        try locked {
            let statement = try prepare("DELETE FROM body_mass_outbox WHERE id=? AND state='inflight'")
            defer { sqlite3_finalize(statement) }
            for id in ids {
                sqlite3_reset(statement)
                sqlite3_clear_bindings(statement)
                sqlite3_bind_int64(statement, 1, id)
                try stepDone(statement)
            }
            if !ids.isEmpty {
                try setMetadataUnlocked("lastSuccessfulUpload", value: HealthDateFormatter.iso8601.string(from: now))
                try setMetadataUnlocked("lastError", value: "")
            }
        }
    }

    func failBodyMassUpload(ids: [Int64], reason: String, now: Date = Date()) throws {
        try locked {
            let select = try prepare("SELECT attempt FROM body_mass_outbox WHERE id=?")
            let update = try prepare("UPDATE body_mass_outbox SET state='pending',attempt=?,next_retry=?,updated_at=? WHERE id=?")
            defer { sqlite3_finalize(select); sqlite3_finalize(update) }
            for id in ids {
                sqlite3_reset(select)
                sqlite3_clear_bindings(select)
                sqlite3_bind_int64(select, 1, id)
                let currentAttempt = sqlite3_step(select) == SQLITE_ROW ? Int(sqlite3_column_int(select, 0)) : 0
                let attempt = min(currentAttempt + 1, 20)
                let delay = min(15.0 * pow(2.0, Double(min(attempt - 1, 10))), 21_600.0)
                sqlite3_reset(update)
                sqlite3_clear_bindings(update)
                sqlite3_bind_int(update, 1, Int32(attempt))
                sqlite3_bind_double(update, 2, now.addingTimeInterval(delay).timeIntervalSince1970)
                sqlite3_bind_double(update, 3, now.timeIntervalSince1970)
                sqlite3_bind_int64(update, 4, id)
                try stepDone(update)
            }
            if !ids.isEmpty { try setMetadataUnlocked("lastError", value: String(reason.prefix(240))) }
        }
    }

    func takePendingBatch(limit: Int, now: Date = Date()) throws -> [HealthOutboxSnapshot] {
        try locked {
            try execute("BEGIN IMMEDIATE")
            do {
                let statement = try prepare("SELECT id,local_date,metric,kcal,revision,sample_count,calculated_at FROM outbox WHERE state='pending' AND next_retry<=? ORDER BY id LIMIT ?")
                sqlite3_bind_double(statement, 1, now.timeIntervalSince1970)
                sqlite3_bind_int(statement, 2, Int32(limit))
                var snapshots: [HealthOutboxSnapshot] = []
                while sqlite3_step(statement) == SQLITE_ROW {
                    guard let metric = HealthMetric(rawValue: columnText(statement, 2)) else { continue }
                    snapshots.append(HealthOutboxSnapshot(
                        id: sqlite3_column_int64(statement, 0),
                        localDate: columnText(statement, 1),
                        metric: metric,
                        kcal: sqlite3_column_double(statement, 3),
                        revision: sqlite3_column_int64(statement, 4),
                        sampleCount: Int(sqlite3_column_int(statement, 5)),
                        calculatedAt: columnText(statement, 6)
                    ))
                }
                sqlite3_finalize(statement)
                let update = try prepare("UPDATE outbox SET state='inflight',updated_at=? WHERE id=?")
                for snapshot in snapshots {
                    sqlite3_reset(update)
                    sqlite3_clear_bindings(update)
                    sqlite3_bind_double(update, 1, now.timeIntervalSince1970)
                    sqlite3_bind_int64(update, 2, snapshot.id)
                    try stepDone(update)
                }
                sqlite3_finalize(update)
                try execute("COMMIT")
                return snapshots
            } catch {
                try? execute("ROLLBACK")
                throw error
            }
        }
    }

    func completeUpload(ids: [Int64], now: Date = Date()) throws {
        try locked {
            let statement = try prepare("DELETE FROM outbox WHERE id=? AND state='inflight'")
            for id in ids {
                sqlite3_reset(statement)
                sqlite3_clear_bindings(statement)
                sqlite3_bind_int64(statement, 1, id)
                try stepDone(statement)
            }
            sqlite3_finalize(statement)
            try setMetadataUnlocked("lastSuccessfulUpload", value: HealthDateFormatter.iso8601.string(from: now))
            try setMetadataUnlocked("lastError", value: "")
        }
    }

    func failUpload(ids: [Int64], reason: String, now: Date = Date()) throws {
        try locked {
            let select = try prepare("SELECT attempt FROM outbox WHERE id=?")
            let update = try prepare("UPDATE outbox SET state='pending',attempt=?,next_retry=?,updated_at=? WHERE id=?")
            defer { sqlite3_finalize(select); sqlite3_finalize(update) }
            for id in ids {
                sqlite3_reset(select)
                sqlite3_clear_bindings(select)
                sqlite3_bind_int64(select, 1, id)
                let currentAttempt = sqlite3_step(select) == SQLITE_ROW ? Int(sqlite3_column_int(select, 0)) : 0
                let attempt = min(currentAttempt + 1, 20)
                let delay = min(15.0 * pow(2.0, Double(min(attempt - 1, 10))), 21_600.0)
                sqlite3_reset(update)
                sqlite3_clear_bindings(update)
                sqlite3_bind_int(update, 1, Int32(attempt))
                sqlite3_bind_double(update, 2, now.addingTimeInterval(delay).timeIntervalSince1970)
                sqlite3_bind_double(update, 3, now.timeIntervalSince1970)
                sqlite3_bind_int64(update, 4, id)
                try stepDone(update)
            }
            try setMetadataUnlocked("lastError", value: String(reason.prefix(240)))
        }
    }

    func pendingCount() -> Int {
        (try? locked {
            let statement = try prepare("SELECT count(*) FROM outbox")
            defer { sqlite3_finalize(statement) }
            let energy = sqlite3_step(statement) == SQLITE_ROW ? Int(sqlite3_column_int(statement, 0)) : 0
            let bodyMass = try prepare("SELECT count(*) FROM body_mass_outbox"); defer { sqlite3_finalize(bodyMass) }
            return energy + (sqlite3_step(bodyMass) == SQLITE_ROW ? Int(sqlite3_column_int(bodyMass, 0)) : 0)
        }) ?? 0
    }

    func metadata(_ key: String) -> String? {
        try? locked {
            let statement = try prepare("SELECT value FROM metadata WHERE key=?")
            defer { sqlite3_finalize(statement) }
            bind(key, at: 1, in: statement)
            return sqlite3_step(statement) == SQLITE_ROW ? columnText(statement, 0) : nil
        }
    }

    func setMetadata(_ key: String, value: String) throws {
        try locked { try setMetadataUnlocked(key, value: value) }
    }

    private func upsertSample(_ sample: HealthEnergySample) throws {
        let deleteDays = try prepare("DELETE FROM sample_days WHERE uuid=?")
        bind(sample.uuid, at: 1, in: deleteDays)
        try stepDone(deleteDays)
        sqlite3_finalize(deleteDays)

        let statement = try prepare("INSERT INTO samples(uuid,metric,start_at,end_at,value_kcal) VALUES(?,?,?,?,?) ON CONFLICT(uuid) DO UPDATE SET metric=excluded.metric,start_at=excluded.start_at,end_at=excluded.end_at,value_kcal=excluded.value_kcal")
        bind(sample.uuid, at: 1, in: statement)
        bind(sample.metric.rawValue, at: 2, in: statement)
        sqlite3_bind_double(statement, 3, sample.startDate.timeIntervalSince1970)
        sqlite3_bind_double(statement, 4, sample.endDate.timeIntervalSince1970)
        sqlite3_bind_double(statement, 5, sample.kilocalories)
        try stepDone(statement)
        sqlite3_finalize(statement)

        let dayStatement = try prepare("INSERT OR IGNORE INTO sample_days(uuid,metric,local_date) VALUES(?,?,?)")
        for localDate in sample.localDates() {
            sqlite3_reset(dayStatement)
            sqlite3_clear_bindings(dayStatement)
            bind(sample.uuid, at: 1, in: dayStatement)
            bind(sample.metric.rawValue, at: 2, in: dayStatement)
            bind(localDate, at: 3, in: dayStatement)
            try stepDone(dayStatement)
        }
        sqlite3_finalize(dayStatement)
    }

    private func sampleCount(metric: HealthMetric, localDate: String) throws -> Int {
        let statement = try prepare("SELECT count(*) FROM sample_days WHERE metric=? AND local_date=?")
        defer { sqlite3_finalize(statement) }
        bind(metric.rawValue, at: 1, in: statement)
        bind(localDate, at: 2, in: statement)
        return sqlite3_step(statement) == SQLITE_ROW ? Int(sqlite3_column_int(statement, 0)) : 0
    }

    private func nextRevision(metric: HealthMetric, localDate: String) throws -> Int64 {
        let statement = try prepare("SELECT revision FROM daily_aggregates WHERE local_date=? AND metric=?")
        defer { sqlite3_finalize(statement) }
        bind(localDate, at: 1, in: statement)
        bind(metric.rawValue, at: 2, in: statement)
        return (sqlite3_step(statement) == SQLITE_ROW ? sqlite3_column_int64(statement, 0) : 0) + 1
    }

    private func upsertAggregateAndOutbox(metric: HealthMetric, localDate: String, kcal: Double, sampleCount: Int, revision: Int64, calculatedAt: String, now: Date) throws {
        let aggregate = try prepare("INSERT INTO daily_aggregates(local_date,metric,kcal,sample_count,revision,calculated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(local_date,metric) DO UPDATE SET kcal=excluded.kcal,sample_count=excluded.sample_count,revision=excluded.revision,calculated_at=excluded.calculated_at")
        bind(localDate, at: 1, in: aggregate)
        bind(metric.rawValue, at: 2, in: aggregate)
        sqlite3_bind_double(aggregate, 3, kcal)
        sqlite3_bind_int(aggregate, 4, Int32(sampleCount))
        sqlite3_bind_int64(aggregate, 5, revision)
        bind(calculatedAt, at: 6, in: aggregate)
        try stepDone(aggregate)
        sqlite3_finalize(aggregate)

        let clearPending = try prepare("DELETE FROM outbox WHERE local_date=? AND metric=? AND state='pending'")
        bind(localDate, at: 1, in: clearPending)
        bind(metric.rawValue, at: 2, in: clearPending)
        try stepDone(clearPending)
        sqlite3_finalize(clearPending)

        let outbox = try prepare("INSERT INTO outbox(local_date,metric,kcal,revision,sample_count,calculated_at,state,attempt,next_retry,created_at,updated_at) VALUES(?,?,?,?,?,?,'pending',0,0,?,?) ON CONFLICT(local_date,metric,revision) DO UPDATE SET kcal=excluded.kcal,sample_count=excluded.sample_count,calculated_at=excluded.calculated_at,state='pending',attempt=0,next_retry=0,updated_at=excluded.updated_at")
        bind(localDate, at: 1, in: outbox)
        bind(metric.rawValue, at: 2, in: outbox)
        sqlite3_bind_double(outbox, 3, kcal)
        sqlite3_bind_int64(outbox, 4, revision)
        sqlite3_bind_int(outbox, 5, Int32(sampleCount))
        bind(calculatedAt, at: 6, in: outbox)
        sqlite3_bind_double(outbox, 7, now.timeIntervalSince1970)
        sqlite3_bind_double(outbox, 8, now.timeIntervalSince1970)
        try stepDone(outbox)
        sqlite3_finalize(outbox)
    }

    private func setMetadataUnlocked(_ key: String, value: String) throws {
        let statement = try prepare("INSERT INTO metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
        bind(key, at: 1, in: statement)
        bind(value, at: 2, in: statement)
        try stepDone(statement)
        sqlite3_finalize(statement)
    }

    private func locked<T>(_ action: () throws -> T) throws -> T {
        lock.lock()
        defer { lock.unlock() }
        return try action()
    }

    private func execute(_ sql: String) throws {
        guard sqlite3_exec(database, sql, nil, nil, nil) == SQLITE_OK else { throw sqliteError() }
    }

    private func prepare(_ sql: String) throws -> OpaquePointer {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else { throw sqliteError() }
        return statement
    }

    private func bind(_ value: String, at index: Int32, in statement: OpaquePointer) {
        value.withCString { pointer in
            sqlite3_bind_text(statement, index, pointer, -1, evaOrbitSQLiteTransient)
        }
    }
    private func bindOptional(_ value:String?,at index:Int32,in statement:OpaquePointer){if let value{bind(value,at:index,in:statement)}else{sqlite3_bind_null(statement,index)}}
    private func bindOptionalInteger(_ value:Int?,at index:Int32,in statement:OpaquePointer){if let value{sqlite3_bind_int(statement,index,Int32(value))}else{sqlite3_bind_null(statement,index)}}
    private func columnOptionalText(_ statement:OpaquePointer,_ index:Int32)->String?{sqlite3_column_type(statement,index)==SQLITE_NULL ? nil:columnText(statement,index)}

    private func columnText(_ statement: OpaquePointer, _ index: Int32) -> String {
        sqlite3_column_text(statement, index).map { String(cString: $0) } ?? ""
    }

    private func stepDone(_ statement: OpaquePointer) throws {
        guard sqlite3_step(statement) == SQLITE_DONE else { throw sqliteError() }
    }

    private func sqliteError() -> Error {
        guard let database else { return HealthLocalStoreError.sqlite("database is closed") }
        return HealthLocalStoreError.sqlite(String(cString: sqlite3_errmsg(database)))
    }
}

enum HealthLocalStoreError: LocalizedError {
    case openFailed
    case sqlite(String)
    case missingDailyTotal(String)

    var errorDescription: String? {
        switch self {
        case .openFailed: return "Could not open HealthKit local store"
        case .sqlite(let message): return "HealthKit SQLite error: \(message)"
        case .missingDailyTotal(let date): return "Missing HealthKit daily total for \(date)"
        }
    }
}
