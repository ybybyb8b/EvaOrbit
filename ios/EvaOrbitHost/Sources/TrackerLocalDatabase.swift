import Foundation
import SQLite3

enum TrackerLocalError: LocalizedError {
    case storage, account, invalid, readOnly, network(String)
    var errorDescription: String? {
        switch self {
        case .storage: return "本地数据库读写失败，原有数据已保留，请检查设备存储空间"
        case .account: return "本地账户与同步账户不同，请重新连接账户"
        case .invalid: return "Tracker 请求或数据版本不正确，原有数据已保留"
        case .readOnly: return "当前为真实数据只读验收，写入和旧队列上传已停用"
        case .network(let message): return message
        }
    }
}

// SQLite owns the atomic boundary for records AND outbox. The shared TypeScript
// reducer runs in both Windows preview and the Host; no duplicate Swift rules.
actor TrackerLocalDatabase {
    private let database: OpaquePointer
    private let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

    static func live() throws -> TrackerLocalDatabase {
        let root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("EvaOrbitTrackers", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
        return try TrackerLocalDatabase(path: root.appendingPathComponent("trackers.sqlite3").path)
    }

    init(path: String) throws {
        var handle: OpaquePointer?
        guard sqlite3_open_v2(path, &handle, SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX, nil) == SQLITE_OK, let opened = handle else {
            if let handle { sqlite3_close(handle) }; throw TrackerLocalError.storage
        }
        sqlite3_busy_timeout(opened, 5000)
        // An unknown future schema is never opened and silently downgraded.
        var statement: OpaquePointer?
        sqlite3_prepare_v2(opened, "PRAGMA user_version", -1, &statement, nil)
        let version = sqlite3_step(statement) == SQLITE_ROW ? sqlite3_column_int(statement, 0) : -1
        sqlite3_finalize(statement)
        guard version == 0 || version == 1 else { sqlite3_close(opened); throw TrackerLocalError.invalid }
        let migration = """
        PRAGMA journal_mode=WAL;
        PRAGMA synchronous=FULL;
        BEGIN IMMEDIATE;
        CREATE TABLE IF NOT EXISTS tracker_account(singleton INTEGER PRIMARY KEY CHECK(singleton=1),account_id TEXT NOT NULL,email TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS tracker_state(account_id TEXT PRIMARY KEY,revision INTEGER NOT NULL CHECK(revision>0),state_json BLOB NOT NULL);
        CREATE TABLE IF NOT EXISTS tracker_replica_state(account_id TEXT PRIMARY KEY,revision INTEGER NOT NULL CHECK(revision>0),state_json BLOB NOT NULL);
        CREATE TABLE IF NOT EXISTS tracker_readonly_cache(account_id TEXT PRIMARY KEY,snapshot_json BLOB NOT NULL);
        CREATE TABLE IF NOT EXISTS online_business_cache(account_id TEXT NOT NULL,path TEXT NOT NULL,response_json BLOB NOT NULL,saved_at INTEGER NOT NULL,PRIMARY KEY(account_id,path));
        CREATE TABLE IF NOT EXISTS home_readonly_cache(account_id TEXT NOT NULL,resource_key TEXT NOT NULL,snapshot_json BLOB NOT NULL,saved_at INTEGER NOT NULL,PRIMARY KEY(account_id,resource_key));
        CREATE TABLE IF NOT EXISTS inbox_readonly_cache(account_id TEXT PRIMARY KEY,snapshot_json BLOB NOT NULL);
        CREATE TABLE IF NOT EXISTS memo_readonly_cache(account_id TEXT PRIMARY KEY,snapshot_json BLOB NOT NULL);
        CREATE TABLE IF NOT EXISTS chronicle_readonly_cache(account_id TEXT PRIMARY KEY,snapshot_json BLOB NOT NULL);
        CREATE TABLE IF NOT EXISTS workspace_readonly_cache(account_id TEXT NOT NULL,kind TEXT NOT NULL,snapshot_json BLOB NOT NULL,PRIMARY KEY(account_id,kind));
        CREATE TABLE IF NOT EXISTS media_readonly_cache(account_id TEXT PRIMARY KEY,snapshot_json BLOB NOT NULL);
        CREATE TABLE IF NOT EXISTS relations_readonly_cache(account_id TEXT PRIMARY KEY,snapshot_json BLOB NOT NULL);
        CREATE TABLE IF NOT EXISTS health_readonly_cache(account_id TEXT PRIMARY KEY,snapshot_json BLOB NOT NULL);
        CREATE TABLE IF NOT EXISTS subscriptions_readonly_cache(account_id TEXT PRIMARY KEY,snapshot_json BLOB NOT NULL);
        CREATE TABLE IF NOT EXISTS cats_readonly_cache(account_id TEXT PRIMARY KEY,snapshot_json BLOB NOT NULL);
        CREATE TABLE IF NOT EXISTS food_readonly_cache(account_id TEXT PRIMARY KEY,snapshot_json BLOB NOT NULL);
        CREATE TABLE IF NOT EXISTS food_resource_cache(account_id TEXT NOT NULL,resource_key TEXT NOT NULL,snapshot_json BLOB NOT NULL,saved_at INTEGER NOT NULL,PRIMARY KEY(account_id,resource_key));
        PRAGMA user_version=1;
        COMMIT;
        """
        guard sqlite3_exec(opened, migration, nil, nil, nil) == SQLITE_OK else { sqlite3_close(opened); throw TrackerLocalError.storage }
        database = opened
    }
    deinit { sqlite3_close(database) }

    private func statement(_ sql: String, _ values: [String] = []) throws -> OpaquePointer {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else { throw TrackerLocalError.storage }
        for (offset, value) in values.enumerated() {
            guard sqlite3_bind_text(statement, Int32(offset + 1), value, -1, transient) == SQLITE_OK else { sqlite3_finalize(statement); throw TrackerLocalError.storage }
        }
        return statement
    }
    private func execute(_ sql: String, _ values: [String] = []) throws {
        let query = try statement(sql, values); defer { sqlite3_finalize(query) }
        guard sqlite3_step(query) == SQLITE_DONE else { throw TrackerLocalError.storage }
    }
    func account() throws -> [String: String]? {
        let query = try statement("SELECT account_id,email FROM tracker_account WHERE singleton=1"); defer { sqlite3_finalize(query) }
        let result = sqlite3_step(query)
        if result == SQLITE_DONE { return nil }
        guard result == SQLITE_ROW, let id = sqlite3_column_text(query, 0), let email = sqlite3_column_text(query, 1) else { throw TrackerLocalError.storage }
        return ["accountId": String(cString: id), "email": String(cString: email)]
    }
    func setAccount(id: String, email: String) throws {
        guard UUID(uuidString: id) != nil, !email.isEmpty else { throw TrackerLocalError.invalid }
        try execute("INSERT INTO tracker_account(singleton,account_id,email) VALUES(1,?,?) ON CONFLICT(singleton) DO UPDATE SET account_id=excluded.account_id,email=excluded.email", [id, email])
    }
    func clearAccount() throws { try execute("DELETE FROM tracker_account") }
    func requireAccount(_ id: String) throws {
        guard try account()?["accountId"] == id else { throw TrackerLocalError.account }
    }
    func read(accountId: String, replica: Bool = false) throws -> Any {
        let table = replica ? "tracker_replica_state" : "tracker_state"
        try requireAccount(accountId)
        let query = try statement("SELECT state_json FROM \(table) WHERE account_id=?", [accountId]); defer { sqlite3_finalize(query) }
        let result = sqlite3_step(query)
        if result == SQLITE_DONE { return NSNull() }
        guard result == SQLITE_ROW, let bytes = sqlite3_column_blob(query, 0) else { throw TrackerLocalError.storage }
        let data = Data(bytes: bytes, count: Int(sqlite3_column_bytes(query, 0)))
        return try JSONSerialization.jsonObject(with: data)
    }
    func commit(accountId: String, expectedRevision: Int, state: [String: Any], replica: Bool = false) throws -> Bool {
        let table = replica ? "tracker_replica_state" : "tracker_state"
        try requireAccount(accountId)
        guard expectedRevision >= 0, state["accountId"] as? String == accountId,
              state["schemaVersion"] as? Int == 1, state["revision"] as? Int == expectedRevision + 1,
              state["records"] is [[String: Any]], state["outbox"] is [[String: Any]], JSONSerialization.isValidJSONObject(state)
        else { throw TrackerLocalError.invalid }
        // ponytail: one versioned document per account for the Tracker-only PoC.
        // Move to indexed record tables before broadening the replica to other modules.
        let data = try JSONSerialization.data(withJSONObject: state)
        guard data.count <= 64 * 1024 * 1024 else { throw TrackerLocalError.storage }
        try execute("BEGIN IMMEDIATE")
        do {
            let query = try statement("SELECT revision FROM \(table) WHERE account_id=?", [accountId])
            let step = sqlite3_step(query)
            let revision = step == SQLITE_ROW ? Int(sqlite3_column_int64(query, 0)) : 0
            sqlite3_finalize(query)
            guard step == SQLITE_ROW || step == SQLITE_DONE else { throw TrackerLocalError.storage }
            guard revision == expectedRevision else { try execute("ROLLBACK"); return false }
            let write = try statement("INSERT INTO \(table)(account_id,revision,state_json) VALUES(?,?,?) ON CONFLICT(account_id) DO UPDATE SET revision=excluded.revision,state_json=excluded.state_json", [accountId, String(expectedRevision + 1)])
            defer { sqlite3_finalize(write) }
            let bound = data.withUnsafeBytes { sqlite3_bind_blob(write, 3, $0.baseAddress, Int32(data.count), transient) }
            guard bound == SQLITE_OK, sqlite3_step(write) == SQLITE_DONE else { throw TrackerLocalError.storage }
            try execute("COMMIT"); return true
        } catch { try? execute("ROLLBACK"); throw error }
    }

    func readOnlyCache(accountId: String) throws -> Any {
        try requireAccount(accountId)
        let query = try statement("SELECT snapshot_json FROM tracker_readonly_cache WHERE account_id=?", [accountId]); defer { sqlite3_finalize(query) }
        let result = sqlite3_step(query)
        if result == SQLITE_DONE { return NSNull() }
        guard result == SQLITE_ROW, let bytes = sqlite3_column_blob(query, 0) else { throw TrackerLocalError.storage }
        return try JSONSerialization.jsonObject(with: Data(bytes: bytes, count: Int(sqlite3_column_bytes(query, 0))))
    }

    func requireReplicaMutations(accountId: String, mutations: [[String: Any]]) throws {
        try requireAccount(accountId)
        if mutations.isEmpty { return }
        guard let state = try read(accountId: accountId, replica: true) as? [String: Any], let outbox = state["outbox"] as? [[String: Any]] else { throw TrackerLocalError.invalid }
        for mutation in mutations {
            guard let id = mutation["mutationId"] as? String, outbox.contains(where: { item in
                item["mutationId"] as? String == id && (item["wire"] as? NSDictionary)?.isEqual(to: mutation) == true
            }) else { throw TrackerLocalError.invalid }
        }
    }

    func saveReadOnlyCache(accountId: String, snapshot: [String: Any]) throws {
        try requireAccount(accountId)
        guard snapshot["accountId"] as? String == accountId, snapshot["format"] as? String == "eo-trackers-readonly-v1", snapshot["details"] is [[String: Any]] else { throw TrackerLocalError.invalid }
        let data = try JSONSerialization.data(withJSONObject: snapshot)
        guard data.count <= 64 * 1024 * 1024 else { throw TrackerLocalError.storage }
        let query = try statement("INSERT INTO tracker_readonly_cache(account_id,snapshot_json) VALUES(?,?) ON CONFLICT(account_id) DO UPDATE SET snapshot_json=excluded.snapshot_json", [accountId]); defer { sqlite3_finalize(query) }
        let bound = data.withUnsafeBytes { sqlite3_bind_blob(query, 2, $0.baseAddress, Int32(data.count), transient) }
        guard bound == SQLITE_OK, sqlite3_step(query) == SQLITE_DONE else { throw TrackerLocalError.storage }
    }

    func homeReadOnlyCache(accountId: String, resource: String) throws -> Any {
        try requireAccount(accountId)
        let query = try statement(resource == "day/latest" ? "SELECT snapshot_json FROM home_readonly_cache WHERE account_id=? AND resource_key LIKE 'day/%' ORDER BY resource_key DESC LIMIT 1" : "SELECT snapshot_json FROM home_readonly_cache WHERE account_id=? AND resource_key=?", resource == "day/latest" ? [accountId] : [accountId, resource])
        defer { sqlite3_finalize(query) }
        let result = sqlite3_step(query)
        if result == SQLITE_DONE { return NSNull() }
        guard result == SQLITE_ROW, let bytes = sqlite3_column_blob(query, 0) else { throw TrackerLocalError.storage }
        return try JSONSerialization.jsonObject(with: Data(bytes: bytes, count: Int(sqlite3_column_bytes(query, 0))))
    }
    func saveHomeReadOnlyCache(accountId: String, resource: String, snapshot: [String: Any]) throws {
        try requireAccount(accountId)
        guard snapshot["accountId"] as? String == accountId, snapshot["format"] as? String == "eo-home-readonly-v1" else { throw TrackerLocalError.invalid }
        let data = try JSONSerialization.data(withJSONObject: snapshot)
        guard data.count <= 4 * 1024 * 1024 else { throw TrackerLocalError.storage }
        try execute("BEGIN IMMEDIATE")
        do {
            let query = try statement("INSERT INTO home_readonly_cache(account_id,resource_key,snapshot_json,saved_at) VALUES(?,?,?,?) ON CONFLICT(account_id,resource_key) DO UPDATE SET snapshot_json=excluded.snapshot_json,saved_at=excluded.saved_at", [accountId, resource])
            defer { sqlite3_finalize(query) }
            let bound = data.withUnsafeBytes { sqlite3_bind_blob(query, 3, $0.baseAddress, Int32(data.count), transient) }
            guard bound == SQLITE_OK, sqlite3_bind_int64(query, 4, Int64(Date().timeIntervalSince1970 * 1000)) == SQLITE_OK, sqlite3_step(query) == SQLITE_DONE else { throw TrackerLocalError.storage }
            // Only disposable Home snapshots are bounded; never touch records or outbox.
            try execute("DELETE FROM home_readonly_cache WHERE account_id=? AND rowid IN (SELECT rowid FROM home_readonly_cache WHERE account_id=? ORDER BY saved_at DESC,rowid DESC LIMIT -1 OFFSET 128)", [accountId, accountId])
            while true {
                let size = try statement("SELECT COALESCE(SUM(length(snapshot_json)),0) FROM home_readonly_cache WHERE account_id=?", [accountId])
                guard sqlite3_step(size) == SQLITE_ROW else { sqlite3_finalize(size); throw TrackerLocalError.storage }
                let bytes = sqlite3_column_int64(size, 0); sqlite3_finalize(size)
                if bytes <= 64 * 1024 * 1024 { break }
                try execute("DELETE FROM home_readonly_cache WHERE rowid=(SELECT rowid FROM home_readonly_cache WHERE account_id=? AND resource_key<>? ORDER BY saved_at,rowid LIMIT 1)", [accountId, resource])
            }
            try execute("COMMIT")
        } catch { try? execute("ROLLBACK"); throw error }
    }

    func foodReadOnlyCache(accountId: String) throws -> Any {
        try requireAccount(accountId)
        let query = try statement("SELECT snapshot_json FROM food_readonly_cache WHERE account_id=?", [accountId]); defer { sqlite3_finalize(query) }
        let step = sqlite3_step(query)
        if step == SQLITE_DONE { return NSNull() }
        guard step == SQLITE_ROW, let bytes = sqlite3_column_blob(query, 0) else { throw TrackerLocalError.storage }
        return try JSONSerialization.jsonObject(with: Data(bytes: bytes, count: Int(sqlite3_column_bytes(query, 0))))
    }
    func saveFoodReadOnlyCache(accountId: String, snapshot: [String: Any]) throws {
        try requireAccount(accountId)
        guard snapshot["accountId"] as? String == accountId, snapshot["format"] as? String == "eo-food-readonly-v1", snapshot["home"] is [String: Any], let foods = snapshot["foods"] as? [[String: Any]], let drinks = snapshot["drinks"] as? [[String: Any]], foods.count <= 500, drinks.count <= 500 else { throw TrackerLocalError.invalid }
        let data = try JSONSerialization.data(withJSONObject: snapshot)
        guard data.count <= 8 * 1024 * 1024 else { throw TrackerLocalError.storage }
        let query = try statement("INSERT INTO food_readonly_cache(account_id,snapshot_json) VALUES(?,?) ON CONFLICT(account_id) DO UPDATE SET snapshot_json=excluded.snapshot_json", [accountId]); defer { sqlite3_finalize(query) }
        let bound = data.withUnsafeBytes { sqlite3_bind_blob(query, 2, $0.baseAddress, Int32(data.count), transient) }
        guard bound == SQLITE_OK, sqlite3_step(query) == SQLITE_DONE else { throw TrackerLocalError.storage }
    }

    func chronicleReadOnlyCache(accountId: String) throws -> Any {
        try requireAccount(accountId)
        let query = try statement("SELECT snapshot_json FROM chronicle_readonly_cache WHERE account_id=?", [accountId]); defer { sqlite3_finalize(query) }
        let step = sqlite3_step(query)
        if step == SQLITE_DONE { return NSNull() }
        guard step == SQLITE_ROW, let bytes = sqlite3_column_blob(query, 0) else { throw TrackerLocalError.storage }
        return try JSONSerialization.jsonObject(with: Data(bytes: bytes, count: Int(sqlite3_column_bytes(query, 0))))
    }
    func saveChronicleReadOnlyCache(accountId: String, snapshot: [String: Any]) throws {
        try requireAccount(accountId)
        guard snapshot["accountId"] as? String == accountId, snapshot["format"] as? String == "eo-chronicle-readonly-v1", let items = snapshot["items"] as? [[String: Any]], items.count <= 100, snapshot["complete"] as? Bool == (items.count < 100), let captured = snapshot["capturedAt"] as? String, ISO8601DateFormatter().date(from: captured) != nil else { throw TrackerLocalError.invalid }
        var ids = Set<Int>()
        let formatter = DateFormatter(); formatter.dateFormat = "yyyy-MM-dd"; formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.timeZone = TimeZone(secondsFromGMT: 0); formatter.isLenient = false
        let timestamp = ISO8601DateFormatter(), fractional = ISO8601DateFormatter(); fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        for item in items {
            guard let id = item["id"] as? Int, id > 0, ids.insert(id).inserted, let date = item["date"] as? String, date.count == 10, formatter.date(from: date).map({ formatter.string(from: $0) == date }) == true, let title = item["title"] as? String, !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, title.utf16.count <= 300, let body = item["contentMd"] as? String, !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, body.utf16.count <= 100000, let source = item["source"] as? String, ["manual", "chatgpt"].contains(source), let created = item["createdAt"] as? String, let updated = item["updatedAt"] as? String, timestamp.date(from: created) != nil || fractional.date(from: created) != nil, timestamp.date(from: updated) != nil || fractional.date(from: updated) != nil else { throw TrackerLocalError.invalid }
        }
        let data = try JSONSerialization.data(withJSONObject: snapshot)
        guard data.count <= 8 * 1024 * 1024 else { throw TrackerLocalError.storage }
        let query = try statement("INSERT INTO chronicle_readonly_cache(account_id,snapshot_json) VALUES(?,?) ON CONFLICT(account_id) DO UPDATE SET snapshot_json=excluded.snapshot_json", [accountId]); defer { sqlite3_finalize(query) }
        let bound = data.withUnsafeBytes { sqlite3_bind_blob(query, 2, $0.baseAddress, Int32(data.count), transient) }
        guard bound == SQLITE_OK, sqlite3_step(query) == SQLITE_DONE else { throw TrackerLocalError.storage }
    }
    func memoReadOnlyCache(accountId: String) throws -> Any {
        try requireAccount(accountId)
        let query = try statement("SELECT snapshot_json FROM memo_readonly_cache WHERE account_id=?", [accountId]); defer { sqlite3_finalize(query) }
        let step = sqlite3_step(query)
        if step == SQLITE_DONE { return NSNull() }
        guard step == SQLITE_ROW, let bytes = sqlite3_column_blob(query, 0) else { throw TrackerLocalError.storage }
        return try JSONSerialization.jsonObject(with: Data(bytes: bytes, count: Int(sqlite3_column_bytes(query, 0))))
    }
    func saveMemoReadOnlyCache(accountId: String, snapshot: [String: Any]) throws {
        try requireAccount(accountId)
        guard snapshot["accountId"] as? String == accountId, snapshot["format"] as? String == "eo-memo-readonly-v1", let items = snapshot["items"] as? [[String: Any]], items.count <= 100, snapshot["complete"] as? Bool == (items.count < 100), let captured = snapshot["capturedAt"] as? String, ISO8601DateFormatter().date(from: captured) != nil else { throw TrackerLocalError.invalid }
        var ids = Set<Int>()
        let formatter = DateFormatter(); formatter.dateFormat = "yyyy-MM-dd"; formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.timeZone = TimeZone(secondsFromGMT: 0); formatter.isLenient = false
        let timestamp = ISO8601DateFormatter(), fractional = ISO8601DateFormatter(); fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        for item in items {
            guard let id = item["id"] as? Int, id > 0, ids.insert(id).inserted, let title = item["title"] as? String, !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, title.utf16.count <= 300, let body = item["content"] as? String, !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, body.utf16.count <= 100000, let type = item["type"] as? String, ["basic", "supplement", "event", "note"].contains(type), let status = item["status"] as? String, ["active", "merged", "archived", "historical"].contains(status), item["tags"] is [String], let created = item["createdAt"] as? String, let updated = item["updatedAt"] as? String, timestamp.date(from: created) != nil || fractional.date(from: created) != nil, timestamp.date(from: updated) != nil || fractional.date(from: updated) != nil else { throw TrackerLocalError.invalid }
            if let date = item["eventDate"] as? String { guard date.count == 10, formatter.date(from: date).map({ formatter.string(from: $0) == date }) == true else { throw TrackerLocalError.invalid } }
            else { guard item["eventDate"] is NSNull else { throw TrackerLocalError.invalid } }
            if let confirmed = item["confirmedAt"] as? String { guard timestamp.date(from: confirmed) != nil || fractional.date(from: confirmed) != nil else { throw TrackerLocalError.invalid } }
            else { guard item["confirmedAt"] is NSNull else { throw TrackerLocalError.invalid } }
            if let merged = item["mergedIntoId"] as? Int { guard merged > 0 else { throw TrackerLocalError.invalid } }
            else { guard item["mergedIntoId"] is NSNull else { throw TrackerLocalError.invalid } }

        }
        let data = try JSONSerialization.data(withJSONObject: snapshot)
        guard data.count <= 8 * 1024 * 1024 else { throw TrackerLocalError.storage }
        let query = try statement("INSERT INTO memo_readonly_cache(account_id,snapshot_json) VALUES(?,?) ON CONFLICT(account_id) DO UPDATE SET snapshot_json=excluded.snapshot_json", [accountId]); defer { sqlite3_finalize(query) }
        let bound = data.withUnsafeBytes { sqlite3_bind_blob(query, 2, $0.baseAddress, Int32(data.count), transient) }
        guard bound == SQLITE_OK, sqlite3_step(query) == SQLITE_DONE else { throw TrackerLocalError.storage }
    }
    func inboxReadOnlyCache(accountId: String) throws -> Any {
        try requireAccount(accountId)
        let query = try statement("SELECT snapshot_json FROM inbox_readonly_cache WHERE account_id=?", [accountId]); defer { sqlite3_finalize(query) }
        let step = sqlite3_step(query)
        if step == SQLITE_DONE { return NSNull() }
        guard step == SQLITE_ROW, let bytes = sqlite3_column_blob(query, 0) else { throw TrackerLocalError.storage }
        return try JSONSerialization.jsonObject(with: Data(bytes: bytes, count: Int(sqlite3_column_bytes(query, 0))))
    }
    func saveInboxReadOnlyCache(accountId: String, snapshot: [String: Any]) throws {
        try requireAccount(accountId)
        guard snapshot["accountId"] as? String == accountId, snapshot["format"] as? String == "eo-inbox-readonly-v1", let items = snapshot["items"] as? [[String: Any]], items.count <= 500, let captured = snapshot["capturedAt"] as? String, ISO8601DateFormatter().date(from: captured) != nil else { throw TrackerLocalError.invalid }
        var ids = Set<Int>()
        let timestamp = ISO8601DateFormatter(), fractional = ISO8601DateFormatter(); fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        for item in items {
            guard let id = item["id"] as? Int, id > 0, id <= 9_007_199_254_740_991, ids.insert(id).inserted, let content = item["content"] as? String, !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, content.utf16.count <= 10000, item["source"] is String, let status = item["status"] as? String, ["inbox", "processed", "archived"].contains(status), let created = item["createdAt"] as? String, let updated = item["updatedAt"] as? String, timestamp.date(from: created) != nil || fractional.date(from: created) != nil, timestamp.date(from: updated) != nil || fractional.date(from: updated) != nil else { throw TrackerLocalError.invalid }
            if let processed = item["processedAt"] as? String { guard timestamp.date(from: processed) != nil || fractional.date(from: processed) != nil else { throw TrackerLocalError.invalid } }
            else { guard item["processedAt"] is NSNull else { throw TrackerLocalError.invalid } }
            guard item["convertedType"] is String || item["convertedType"] is NSNull else { throw TrackerLocalError.invalid }
            if let converted = item["convertedId"] as? Int { guard converted > 0, converted <= 9_007_199_254_740_991 else { throw TrackerLocalError.invalid } }
            else { guard item["convertedId"] is NSNull else { throw TrackerLocalError.invalid } }
        }
        let data = try JSONSerialization.data(withJSONObject: snapshot)
        guard data.count <= 8 * 1024 * 1024 else { throw TrackerLocalError.storage }
        let query = try statement("INSERT INTO inbox_readonly_cache(account_id,snapshot_json) VALUES(?,?) ON CONFLICT(account_id) DO UPDATE SET snapshot_json=excluded.snapshot_json", [accountId]); defer { sqlite3_finalize(query) }
        let bound = data.withUnsafeBytes { sqlite3_bind_blob(query, 2, $0.baseAddress, Int32(data.count), transient) }
        guard bound == SQLITE_OK, sqlite3_step(query) == SQLITE_DONE else { throw TrackerLocalError.storage }
    }
    func healthReadOnlyCache(accountId: String) throws -> Any {
        try requireAccount(accountId)
        let query = try statement("SELECT snapshot_json FROM health_readonly_cache WHERE account_id=?", [accountId]); defer { sqlite3_finalize(query) }
        let step = sqlite3_step(query)
        if step == SQLITE_DONE { return NSNull() }
        guard step == SQLITE_ROW, let bytes = sqlite3_column_blob(query, 0) else { throw TrackerLocalError.storage }
        return try JSONSerialization.jsonObject(with: Data(bytes: bytes, count: Int(sqlite3_column_bytes(query, 0))))
    }
    func saveHealthReadOnlyCache(accountId: String, snapshot: [String: Any]) throws {
        try requireAccount(accountId)
        guard snapshot["accountId"] as? String == accountId, snapshot["format"] as? String == "eo-health-readonly-v1", let today = snapshot["today"] as? String, today.range(of: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$", options: .regularExpression) != nil, let captured = snapshot["capturedAt"] as? String, !captured.isEmpty, let sleep = snapshot["sleep"] as? [String: Any], sleep["date"] as? String == today, snapshot["energy"] is [String: Any], snapshot["weightSettings"] is [String: Any], snapshot["suggestions"] is [String: Any], snapshot["plan"] is NSNull || snapshot["plan"] is [String: Any] else { throw TrackerLocalError.invalid }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        guard formatter.date(from: captured) != nil || plain.date(from: captured) != nil else { throw TrackerLocalError.invalid }
        let limits = ["records": 100, "training": 100, "recentTraining": 100, "weights": 1000, "periods": 31, "flows": 60, "presets": 100, "doses": 60, "reminders": 1000]
        for (key, limit) in limits {
            guard let rows = snapshot[key] as? [[String: Any]], rows.count <= limit else { throw TrackerLocalError.invalid }
            var ids = Set<Int>()
            for row in rows {
                guard let id = row["id"] as? Int, id > 0, id <= 9007199254740991, ids.insert(id).inserted else { throw TrackerLocalError.invalid }
                if ["records", "training", "recentTraining", "weights", "flows"].contains(key) {
                    guard row["occurredAt"] is String, row["occurredHasExplicitTime"] is Bool else { throw TrackerLocalError.invalid }
                }
            }
        }
        guard let history = snapshot["energyHistory"] as? [[String: Any]], history.count <= 7 else { throw TrackerLocalError.invalid }
        let data = try JSONSerialization.data(withJSONObject: snapshot)
        guard data.count <= 8 * 1024 * 1024 else { throw TrackerLocalError.storage }
        let query = try statement("INSERT INTO health_readonly_cache(account_id,snapshot_json) VALUES(?,?) ON CONFLICT(account_id) DO UPDATE SET snapshot_json=excluded.snapshot_json", [accountId]); defer { sqlite3_finalize(query) }
        let bound = data.withUnsafeBytes { sqlite3_bind_blob(query, 2, $0.baseAddress, Int32(data.count), transient) }
        guard bound == SQLITE_OK, sqlite3_step(query) == SQLITE_DONE else { throw TrackerLocalError.storage }
    }

    func workspaceReadOnlyCache(accountId: String, kind: String) throws -> Any {
        try requireAccount(accountId)
        guard ["tasks", "projects", "lucius"].contains(kind) else { throw TrackerLocalError.invalid }
        let query = try statement("SELECT snapshot_json FROM workspace_readonly_cache WHERE account_id=? AND kind=?", [accountId, kind]); defer { sqlite3_finalize(query) }
        let step = sqlite3_step(query)
        if step == SQLITE_DONE { return NSNull() }
        guard step == SQLITE_ROW, let bytes = sqlite3_column_blob(query, 0) else { throw TrackerLocalError.storage }
        return try JSONSerialization.jsonObject(with: Data(bytes: bytes, count: Int(sqlite3_column_bytes(query, 0))))
    }
    func saveWorkspaceReadOnlyCache(accountId: String, kind: String, snapshot: [String: Any]) throws {
        try requireAccount(accountId)
        guard ["tasks", "projects", "lucius"].contains(kind), snapshot["format"] as? String == "eo-workspace-readonly-v1", snapshot["accountId"] as? String == accountId, snapshot["kind"] as? String == kind, let data = snapshot["data"] as? [String: Any], data["complete"] is Bool else { throw TrackerLocalError.invalid }
        let iso = ISO8601DateFormatter(), fractional = ISO8601DateFormatter(); fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        func timestamp(_ value: Any?) -> Bool { guard let raw = value as? String else { return false }; return iso.date(from: raw) != nil || fractional.date(from: raw) != nil }
        let date = DateFormatter(); date.dateFormat = "yyyy-MM-dd"; date.locale = Locale(identifier: "en_US_POSIX"); date.timeZone = TimeZone(secondsFromGMT: 0); date.isLenient = false
        func day(_ value: Any?) -> Bool { guard let raw = value as? String, raw.count == 10, let parsed = date.date(from: raw) else { return false }; return date.string(from: parsed) == raw }
        func time(_ value: Any?) -> Bool { guard let raw = value as? String else { return false }; return raw.range(of: "^([01][0-9]|2[0-3]):[0-5][0-9]$", options: .regularExpression) != nil }
        func rows(_ key: String, _ maximum: Int) throws -> [[String: Any]] {
            guard let values = data[key] as? [[String: Any]], values.count <= maximum else { throw TrackerLocalError.invalid }
            var ids = Set<Int>()
            for row in values { guard let id = row["id"] as? Int, id > 0, id <= 9007199254740991, ids.insert(id).inserted, timestamp(row["createdAt"]), timestamp(row["updatedAt"]) else { throw TrackerLocalError.invalid } }
            return values
        }
        guard timestamp(snapshot["capturedAt"]) else { throw TrackerLocalError.invalid }
        if kind == "tasks" {
            var ruleIds = Set<Int>()
            for task in try rows("tasks", 1000) {
                guard let id = task["id"] as? Int, task["title"] is String, task["notes"] is String, task["completed"] is Bool, task["tags"] is [String], let priority = task["priority"] as? String, ["low", "medium", "high"].contains(priority), task["dueDate"] is NSNull || day(task["dueDate"]), task["dueTime"] is NSNull || (day(task["dueDate"]) && time(task["dueTime"])), task["completedAt"] is NSNull || timestamp(task["completedAt"]), let rules = task["reminders"] as? [[String: Any]] else { throw TrackerLocalError.invalid }
                for rule in rules {
                    guard let key = rule["id"] as? Int, key > 0, ruleIds.insert(key).inserted, rule["taskId"] as? Int == id, let trigger = rule["triggerType"] as? String, ["absolute", "relative"].contains(trigger), rule["repeatWhileOverdue"] is Bool, rule["timezone"] is String, let channel = rule["deliveryChannel"] as? String, ["pwa", "apple_reminders"].contains(channel), timestamp(rule["createdAt"]), timestamp(rule["updatedAt"]), rule["absoluteDate"] is NSNull || day(rule["absoluteDate"]), rule["absoluteTime"] is NSNull || time(rule["absoluteTime"]) else { throw TrackerLocalError.invalid }
                }
            }
        } else if kind == "projects" {
            let projects = try rows("projects", 200), items = try rows("items", 5000), parentIds = Set(projects.compactMap { $0["id"] as? Int })
            for item in items {
                guard let project = item["projectId"] as? Int, parentIds.contains(project), item["title"] is String, let type = item["type"] as? String, ["feature", "bug", "ui", "migration", "research", "tech_debt", "other"].contains(type), let status = item["status"] as? String, ["to_solve", "doing", "blocked", "done", "verified", "dropped"].contains(status) else { throw TrackerLocalError.invalid }
                for key in ["description", "module", "priority", "nextStep", "resolution"] { guard item[key] is NSNull || item[key] is String else { throw TrackerLocalError.invalid } }
                for key in ["startedAt", "completedAt", "verifiedAt"] { guard item[key] is NSNull || timestamp(item[key]) else { throw TrackerLocalError.invalid } }
            }
            for project in projects {
                guard project["name"] is String, project["description"] is NSNull || project["description"] is String, let status = project["status"] as? String, ["active", "paused", "archived"].contains(status), let doing = project["doingCount"] as? Int, doing >= 0, let open = project["toSolveCount"] as? Int, open >= 0 else { throw TrackerLocalError.invalid }
                if data["complete"] as? Bool == true {
                    let own = items.filter { $0["projectId"] as? Int == project["id"] as? Int }
                    guard own.filter({ $0["status"] as? String == "doing" }).count == doing, own.filter({ $0["status"] as? String == "to_solve" }).count == open else { throw TrackerLocalError.invalid }
                }
            }
        } else {
            guard let state = data["state"] as? [String: Any], state["status"] is String, state["mood"] is String, state["updatedAt"] is NSNull || timestamp(state["updatedAt"]) else { throw TrackerLocalError.invalid }
            let posts = try rows("posts", 50), postIds = Set(posts.compactMap { $0["id"] as? Int })
            for post in posts { guard post["content"] is String, timestamp(post["publishedAt"]) else { throw TrackerLocalError.invalid } }
            for comment in try rows("comments", 500) { guard let post = comment["postId"] as? Int, postIds.contains(post), comment["content"] is String, let author = comment["author"] as? String, ["user", "lucius"].contains(author) else { throw TrackerLocalError.invalid } }
            for entry in try rows("diary", 100) { guard entry["content"] is String, entry["tags"] is [String], day(entry["date"]) else { throw TrackerLocalError.invalid } }
            for entry in try rows("cases", 100) {
                guard let type = entry["errorType"] as? String, ["naming", "memory_omission", "factual", "tool_misuse", "expression", "other"].contains(type), let severity = entry["severity"] as? String, ["minor", "moderate", "serious", "habitual"].contains(severity), let status = entry["status"] as? String, ["serving", "probation", "temporary_release", "permanent_record"].contains(status), entry["triggerScenes"] is [String], day(entry["firstOccurredDate"]), day(entry["latestOccurredDate"]), let first = entry["firstOccurredDate"] as? String, let latest = entry["latestOccurredDate"] as? String, first <= latest, let count = entry["occurrenceCount"] as? Int, count >= 1, let correct = entry["consecutiveCorrectCount"] as? Int, correct >= 0, let threshold = entry["resetThreshold"] as? Int, threshold >= 1, entry["isRecurrence"] is Bool else { throw TrackerLocalError.invalid }
                for key in ["title", "errorQuote", "cause", "correctBehavior", "mandatoryRule", "punishment"] { guard entry[key] is String else { throw TrackerLocalError.invalid } }
                guard entry["nextCheck"] is NSNull || day(entry["nextCheck"]), entry["recurrenceIntervalDays"] is NSNull || (entry["recurrenceIntervalDays"] as? Int ?? -1) > 0 else { throw TrackerLocalError.invalid }
            }
        }
        let bytes = try JSONSerialization.data(withJSONObject: snapshot)
        guard bytes.count <= 8 * 1024 * 1024 else { throw TrackerLocalError.storage }
        let query = try statement("INSERT INTO workspace_readonly_cache(account_id,kind,snapshot_json) VALUES(?,?,?) ON CONFLICT(account_id,kind) DO UPDATE SET snapshot_json=excluded.snapshot_json", [accountId, kind]); defer { sqlite3_finalize(query) }
        let bound = bytes.withUnsafeBytes { sqlite3_bind_blob(query, 3, $0.baseAddress, Int32(bytes.count), transient) }
        guard bound == SQLITE_OK, sqlite3_step(query) == SQLITE_DONE else { throw TrackerLocalError.storage }
    }

    func mediaReadOnlyCache(accountId: String) throws -> Any {
        try requireAccount(accountId)
        let query = try statement("SELECT snapshot_json FROM media_readonly_cache WHERE account_id=?", [accountId]); defer { sqlite3_finalize(query) }
        let step = sqlite3_step(query)
        if step == SQLITE_DONE { return NSNull() }
        guard step == SQLITE_ROW, let bytes = sqlite3_column_blob(query, 0) else { throw TrackerLocalError.storage }
        return try JSONSerialization.jsonObject(with: Data(bytes: bytes, count: Int(sqlite3_column_bytes(query, 0))))
    }
    func saveMediaReadOnlyCache(accountId: String, snapshot: [String: Any]) throws {
        try requireAccount(accountId)
        guard snapshot["accountId"] as? String == accountId, snapshot["format"] as? String == "eo-media-readonly-v1", let captured = snapshot["capturedAt"] as? String, let items = snapshot["items"] as? [[String: Any]], items.count <= 1000, let series = snapshot["series"] as? [[String: Any]], series.count <= 1000 else { throw TrackerLocalError.invalid }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard formatter.date(from: captured) != nil || ISO8601DateFormatter().date(from: captured) != nil else { throw TrackerLocalError.invalid }
        let dayFormatter = DateFormatter(); dayFormatter.dateFormat = "yyyy-MM-dd"; dayFormatter.locale = Locale(identifier: "en_US_POSIX"); dayFormatter.timeZone = TimeZone(secondsFromGMT: 0); dayFormatter.isLenient = false
        func validTimestamp(_ value: Any?) -> Bool {
            guard let raw = value as? String else { return false }
            return formatter.date(from: raw) != nil || ISO8601DateFormatter().date(from: raw) != nil
        }
        var ids = Set<Int>(), groupIds = Set<Int>(), viewingIds = Set<Int>()
        for group in series {
            guard let id = group["id"] as? Int, id > 0, id <= 9007199254740991, groupIds.insert(id).inserted, group["name"] is String, validTimestamp(group["createdAt"]), validTimestamp(group["updatedAt"]), let count = group["itemCount"] as? Int, count >= 0 else { throw TrackerLocalError.invalid }
        }
        for item in items {
            guard let id = item["id"] as? Int, id > 0, id <= 9007199254740991, ids.insert(id).inserted, item["title"] is String, item["isFavorite"] is Bool, validTimestamp(item["createdAt"]), validTimestamp(item["updatedAt"]), let type = item["mediaType"] as? String, ["movie", "tv", "anime", "documentary", "other"].contains(type), let status = item["status"] as? String, ["planned", "watching", "completed", "paused", "dropped"].contains(status), let history = item["viewings"] as? [[String: Any]], history.count < 1000 else { throw TrackerLocalError.invalid }
            for key in ["originalTitle", "translatedTitle", "seasonTitle", "note"] { guard item[key] is NSNull || item[key] is String else { throw TrackerLocalError.invalid } }
            if let group = item["seriesId"] as? Int { guard groupIds.contains(group), series.first(where: { $0["id"] as? Int == group })?["name"] as? String == item["seriesName"] as? String else { throw TrackerLocalError.invalid } }
            else { guard item["seriesId"] is NSNull, item["seriesName"] is NSNull else { throw TrackerLocalError.invalid } }
            if let season = item["seasonNumber"] as? Int { guard (1...999).contains(season), ["tv", "anime"].contains(type) else { throw TrackerLocalError.invalid } }
            else { guard item["seasonNumber"] is NSNull else { throw TrackerLocalError.invalid } }
            if !["tv", "anime"].contains(type) { guard item["seasonTitle"] is NSNull else { throw TrackerLocalError.invalid } }
            if let rating = item["rating"] as? String { guard rating.range(of: "^(goat|dope|mid|nope|shit)[+-]?$", options: .regularExpression) != nil else { throw TrackerLocalError.invalid } }
            else { guard item["rating"] is NSNull else { throw TrackerLocalError.invalid } }
            guard item["coverUrl"] is NSNull || item["coverUrl"] is String else { throw TrackerLocalError.invalid }
            if let image = item["coverUrl"] as? String { guard image.range(of: "^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$", options: .regularExpression) != nil else { throw TrackerLocalError.invalid } }
            for (index, viewing) in history.enumerated() {
                guard let key = viewing["id"] as? Int, key > 0, key <= 9007199254740991, viewingIds.insert(key).inserted, viewing["mediaId"] as? Int == id, validTimestamp(viewing["createdAt"]), viewing["viewingNumber"] as? Int == index + 1, let day = viewing["watchedDate"] as? String, day.count == 10, let parsedDay = dayFormatter.date(from: day), dayFormatter.string(from: parsedDay) == day else { throw TrackerLocalError.invalid }
            }
        }
        let data = try JSONSerialization.data(withJSONObject: snapshot)
        guard data.count <= 8 * 1024 * 1024 else { throw TrackerLocalError.storage }
        for group in series {
            guard let id = group["id"] as? Int, group["itemCount"] as? Int == items.filter({ $0["seriesId"] as? Int == id }).count else { throw TrackerLocalError.invalid }
        }
        let query = try statement("INSERT INTO media_readonly_cache(account_id,snapshot_json) VALUES(?,?) ON CONFLICT(account_id) DO UPDATE SET snapshot_json=excluded.snapshot_json", [accountId]); defer { sqlite3_finalize(query) }
        let bound = data.withUnsafeBytes { sqlite3_bind_blob(query, 2, $0.baseAddress, Int32(data.count), transient) }
        guard bound == SQLITE_OK, sqlite3_step(query) == SQLITE_DONE else { throw TrackerLocalError.storage }
    }

    func relationsReadOnlyCache(accountId: String) throws -> Any {
        try requireAccount(accountId)
        let query = try statement("SELECT snapshot_json FROM relations_readonly_cache WHERE account_id=?", [accountId]); defer { sqlite3_finalize(query) }
        let step = sqlite3_step(query)
        if step == SQLITE_DONE { return NSNull() }
        guard step == SQLITE_ROW, let bytes = sqlite3_column_blob(query, 0) else { throw TrackerLocalError.storage }
        return try JSONSerialization.jsonObject(with: Data(bytes: bytes, count: Int(sqlite3_column_bytes(query, 0))))
    }
    func saveRelationsReadOnlyCache(accountId: String, snapshot: [String: Any]) throws {
        try requireAccount(accountId)
        guard snapshot["accountId"] as? String == accountId, snapshot["format"] as? String == "eo-relations-readonly-v1", let captured = snapshot["capturedAt"] as? String, let people = snapshot["people"] as? [[String: Any]], people.count <= 100, let details = snapshot["details"] as? [[String: Any]], details.count == people.count else { throw TrackerLocalError.invalid }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        guard formatter.date(from: captured) != nil || plain.date(from: captured) != nil else { throw TrackerLocalError.invalid }
        var ids = Set<Int>(), detailIds = Set<Int>()
        for person in people {
            guard let id = person["id"] as? Int, id > 0, id <= 9007199254740991, ids.insert(id).inserted, person["name"] is String, let status = person["relationshipStatus"] as? String, ["active", "ended"].contains(status), let balance = person["balance"] as? [String: Any], balance["socialMinor"] is Int, balance["settlementMinor"] is Int else { throw TrackerLocalError.invalid }
            if let photo = person["photoPath"] as? String {
                guard photo.range(of: "^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$", options: .regularExpression) != nil else { throw TrackerLocalError.invalid }
            }
        }
        for detail in details {
            guard let person = detail["person"] as? [String: Any], let id = person["id"] as? Int, ids.contains(id), detailIds.insert(id).inserted, let events = detail["events"] as? [[String: Any]], events.count < 500, let notes = detail["memoryNotes"] as? [[String: Any]], notes.count < 1000, let balance = detail["balance"] as? [String: Any], balance["socialMinor"] is Int, balance["settlementMinor"] is Int else { throw TrackerLocalError.invalid }
            var eventIds = Set<Int>(), noteIds = Set<Int>()
            for event in events {
                guard let key = event["id"] as? Int, key > 0, key <= 9007199254740991, eventIds.insert(key).inserted, event["occurredAt"] is String, event["occurredHasExplicitTime"] is Bool, event["parties"] is [[String: Any]], event["items"] is [[String: Any]], event["flows"] is [[String: Any]] else { throw TrackerLocalError.invalid }
            }
            for note in notes {
                guard note["personId"] as? Int == id, let key = note["id"] as? Int, key > 0, noteIds.insert(key).inserted, note["content"] is String else { throw TrackerLocalError.invalid }
            }
        }
        let data = try JSONSerialization.data(withJSONObject: snapshot)
        guard data.count <= 8 * 1024 * 1024 else { throw TrackerLocalError.storage }
        let query = try statement("INSERT INTO relations_readonly_cache(account_id,snapshot_json) VALUES(?,?) ON CONFLICT(account_id) DO UPDATE SET snapshot_json=excluded.snapshot_json", [accountId]); defer { sqlite3_finalize(query) }
        let bound = data.withUnsafeBytes { sqlite3_bind_blob(query, 2, $0.baseAddress, Int32(data.count), transient) }
        guard bound == SQLITE_OK, sqlite3_step(query) == SQLITE_DONE else { throw TrackerLocalError.storage }
    }

    func subscriptionsReadOnlyCache(accountId: String) throws -> Any {
        try requireAccount(accountId)
        let query = try statement("SELECT snapshot_json FROM subscriptions_readonly_cache WHERE account_id=?", [accountId]); defer { sqlite3_finalize(query) }
        let step = sqlite3_step(query)
        if step == SQLITE_DONE { return NSNull() }
        guard step == SQLITE_ROW, let bytes = sqlite3_column_blob(query, 0) else { throw TrackerLocalError.storage }
        return try JSONSerialization.jsonObject(with: Data(bytes: bytes, count: Int(sqlite3_column_bytes(query, 0))))
    }
    func saveSubscriptionsReadOnlyCache(accountId: String, snapshot: [String: Any]) throws {
        try requireAccount(accountId)
        guard snapshot["accountId"] as? String == accountId, snapshot["format"] as? String == "eo-subscriptions-readonly-v1", snapshot["today"] is String, let items = snapshot["items"] as? [[String: Any]], items.count <= 200, let icons = snapshot["iconSources"] as? [String: String] else { throw TrackerLocalError.invalid }
        var ids = Set<Int>(), paymentIds = Set<Int>(), changeIds = Set<Int>(), history = 0
        for item in items {
            guard let id = item["id"] as? Int, id > 0, ids.insert(id).inserted, item["name"] is String, let status = item["status"] as? String, ["active", "paused", "ended"].contains(status), let payments = item["payments"] as? [[String: Any]], payments.count < 1000, let changes = item["priceChanges"] as? [[String: Any]], changes.count < 1000, item["paymentCount"] as? Int == payments.count else { throw TrackerLocalError.invalid }
            history += payments.count + changes.count
            for row in payments {
                guard row["subscriptionId"] as? Int == id, let key = row["id"] as? Int, key > 0, paymentIds.insert(key).inserted, let amount = row["amountMinor"] as? Int, amount >= 0, row["paidOn"] is String, row["scheduledFor"] is String else { throw TrackerLocalError.invalid }
            }
            for row in changes {
                guard row["subscriptionId"] as? Int == id, let key = row["id"] as? Int, key > 0, changeIds.insert(key).inserted else { throw TrackerLocalError.invalid }
            }
            if let icon = item["iconPath"] as? String, !icon.isEmpty, icons[String(id)] == nil { throw TrackerLocalError.invalid }
        }
        guard history <= 5000 else { throw TrackerLocalError.invalid }
        for (key, icon) in icons {
            guard let id = Int(key), ids.contains(id), String(id) == key, icon.range(of: "^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$", options: .regularExpression) != nil else { throw TrackerLocalError.invalid }
        }
        let data = try JSONSerialization.data(withJSONObject: snapshot)
        guard data.count <= 8 * 1024 * 1024 else { throw TrackerLocalError.storage }
        let query = try statement("INSERT INTO subscriptions_readonly_cache(account_id,snapshot_json) VALUES(?,?) ON CONFLICT(account_id) DO UPDATE SET snapshot_json=excluded.snapshot_json", [accountId]); defer { sqlite3_finalize(query) }
        let bound = data.withUnsafeBytes { sqlite3_bind_blob(query, 2, $0.baseAddress, Int32(data.count), transient) }
        guard bound == SQLITE_OK, sqlite3_step(query) == SQLITE_DONE else { throw TrackerLocalError.storage }
    }

    func catsReadOnlyCache(accountId: String) throws -> Any {
        try requireAccount(accountId)
        let query = try statement("SELECT snapshot_json FROM cats_readonly_cache WHERE account_id=?", [accountId]); defer { sqlite3_finalize(query) }
        let step = sqlite3_step(query)
        if step == SQLITE_DONE { return NSNull() }
        guard step == SQLITE_ROW, let bytes = sqlite3_column_blob(query, 0) else { throw TrackerLocalError.storage }
        return try JSONSerialization.jsonObject(with: Data(bytes: bytes, count: Int(sqlite3_column_bytes(query, 0))))
    }
    func saveCatsReadOnlyCache(accountId: String, snapshot: [String: Any]) throws {
        try requireAccount(accountId)
        guard snapshot["accountId"] as? String == accountId, snapshot["format"] as? String == "eo-cats-readonly-v1", let dashboard = snapshot["dashboard"] as? [String: Any], let pets = dashboard["pets"] as? [[String: Any]], pets.count <= 50, let details = snapshot["details"] as? [[String: Any]], details.count == pets.count, let records = snapshot["records"] as? [[String: Any]], records.count <= 2000, let foods = snapshot["foods"] as? [[String: Any]], foods.count <= 200 else { throw TrackerLocalError.invalid }
        var petIds = Set<Int>(), detailIds = Set<Int>(), recordKeys = Set<String>()
        for card in pets {
            guard let pet = card["pet"] as? [String: Any], let id = pet["id"] as? Int, id > 0, petIds.insert(id).inserted, pet["name"] is String else { throw TrackerLocalError.invalid }
            if let avatar = pet["avatarUrl"] as? String, !avatar.isEmpty {
                guard avatar.range(of: "^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$", options: .regularExpression) != nil else { throw TrackerLocalError.invalid }
            }
        }
        for record in records {
            guard let kind = record["kind"] as? String, ["event", "symptom", "vet_visit", "medication", "measurement"].contains(kind), let id = record["id"] as? Int, id > 0, recordKeys.insert("\(kind):\(id)").inserted, let raw = record["record"] as? [String: Any], raw["id"] as? Int == id else { throw TrackerLocalError.invalid }
            guard raw["petId"] is NSNull || (raw["petId"] as? Int).map({ petIds.contains($0) }) == true else { throw TrackerLocalError.invalid }
        }
        func checkTimeline(_ value: Any?) throws {
            guard let rows = value as? [[String: Any]], rows.count <= 2000 else { throw TrackerLocalError.invalid }
            for row in rows {
                guard let kind = row["kind"] as? String, let id = row["id"] as? Int, recordKeys.contains("\(kind):\(id)") else { throw TrackerLocalError.invalid }
            }
        }
        try checkTimeline(dashboard["timeline"])
        for key in ["household", "routines", "oneTimeTasks"] {
            guard let rows = dashboard[key] as? [[String: Any]], rows.count <= 2000 else { throw TrackerLocalError.invalid }
        }
        for detail in details {
            guard let pet = detail["pet"] as? [String: Any], let id = pet["id"] as? Int, petIds.contains(id), detailIds.insert(id).inserted else { throw TrackerLocalError.invalid }
            try checkTimeline(detail["timeline"])
            for key in ["reminders", "routines", "medications", "measurements"] {
                guard let rows = detail[key] as? [[String: Any]], rows.count <= 2000 else { throw TrackerLocalError.invalid }
            }
        }
        for food in foods {
            guard let id = food["id"] as? Int, id > 0, let purchases = food["purchases"] as? [[String: Any]], purchases.count <= 2000, purchases.allSatisfy({ $0["itemId"] as? Int == id }) else { throw TrackerLocalError.invalid }
        }
        let data = try JSONSerialization.data(withJSONObject: snapshot)
        guard data.count <= 8 * 1024 * 1024 else { throw TrackerLocalError.storage }
        let query = try statement("INSERT INTO cats_readonly_cache(account_id,snapshot_json) VALUES(?,?) ON CONFLICT(account_id) DO UPDATE SET snapshot_json=excluded.snapshot_json", [accountId]); defer { sqlite3_finalize(query) }
        let bound = data.withUnsafeBytes { sqlite3_bind_blob(query, 2, $0.baseAddress, Int32(data.count), transient) }
        guard bound == SQLITE_OK, sqlite3_step(query) == SQLITE_DONE else { throw TrackerLocalError.storage }
    }

    func foodResourceCache(accountId: String, resource: String) throws -> Any {
        try requireAccount(accountId)
        let query = try statement("SELECT snapshot_json FROM food_resource_cache WHERE account_id=? AND resource_key=?", [accountId, resource]); defer { sqlite3_finalize(query) }
        let step = sqlite3_step(query)
        if step == SQLITE_DONE { return NSNull() }
        guard step == SQLITE_ROW, let bytes = sqlite3_column_blob(query, 0) else { throw TrackerLocalError.storage }
        return try JSONSerialization.jsonObject(with: Data(bytes: bytes, count: Int(sqlite3_column_bytes(query, 0))))
    }
    func saveFoodResourceCache(accountId: String, resource: String, snapshot: [String: Any]) throws {
        try requireAccount(accountId)
        guard snapshot["accountId"] as? String == accountId, snapshot["format"] as? String == "eo-food-resource-v1" else { throw TrackerLocalError.invalid }
        let data = try JSONSerialization.data(withJSONObject: snapshot)
        guard data.count <= (resource == "catalog/current" ? 8 * 1024 * 1024 : 512 * 1024) else { throw TrackerLocalError.storage }
        try execute("BEGIN IMMEDIATE")
        do {
            let query = try statement("INSERT INTO food_resource_cache(account_id,resource_key,snapshot_json,saved_at) VALUES(?,?,?,?) ON CONFLICT(account_id,resource_key) DO UPDATE SET snapshot_json=excluded.snapshot_json,saved_at=excluded.saved_at", [accountId, resource]); defer { sqlite3_finalize(query) }
            let bound = data.withUnsafeBytes { sqlite3_bind_blob(query, 3, $0.baseAddress, Int32(data.count), transient) }
            guard bound == SQLITE_OK, sqlite3_bind_int64(query, 4, Int64(Date().timeIntervalSince1970 * 1000)) == SQLITE_OK, sqlite3_step(query) == SQLITE_DONE else { throw TrackerLocalError.storage }
            try execute("DELETE FROM food_resource_cache WHERE account_id=? AND resource_key<>'catalog/current' AND rowid IN (SELECT rowid FROM food_resource_cache WHERE account_id=? AND resource_key<>'catalog/current' ORDER BY saved_at DESC,rowid DESC LIMIT -1 OFFSET 63)", [accountId, accountId])
            try execute("COMMIT")
        } catch { try? execute("ROLLBACK"); throw error }
    }

    func onlineCache(accountId: String, path: String) throws -> Any {
        try requireAccount(accountId)
        let query = try statement("SELECT response_json FROM online_business_cache WHERE account_id=? AND path=?", [accountId, path]); defer { sqlite3_finalize(query) }
        if sqlite3_step(query) == SQLITE_DONE { return NSNull() }
        guard let bytes = sqlite3_column_blob(query, 0) else { throw TrackerLocalError.storage }
        return try JSONSerialization.jsonObject(with: Data(bytes: bytes, count: Int(sqlite3_column_bytes(query, 0))))
    }
    func saveOnlineCache(accountId: String, path: String, response: [String: Any]) throws {
        try requireAccount(accountId)
        let data = try JSONSerialization.data(withJSONObject: response)
        guard data.count <= 8 * 1024 * 1024 else { throw TrackerLocalError.storage }
        try execute("BEGIN IMMEDIATE")
        do {
            let query = try statement("INSERT INTO online_business_cache(account_id,path,response_json,saved_at) VALUES(?,?,?,?) ON CONFLICT(account_id,path) DO UPDATE SET response_json=excluded.response_json,saved_at=excluded.saved_at", [accountId, path]); defer { sqlite3_finalize(query) }
            let bound = data.withUnsafeBytes { sqlite3_bind_blob(query, 3, $0.baseAddress, Int32(data.count), transient) }
            guard bound == SQLITE_OK, sqlite3_bind_int64(query, 4, Int64(Date().timeIntervalSince1970 * 1000)) == SQLITE_OK, sqlite3_step(query) == SQLITE_DONE else { throw TrackerLocalError.storage }
            try execute("DELETE FROM online_business_cache WHERE account_id=? AND rowid IN (SELECT rowid FROM (SELECT rowid,ROW_NUMBER() OVER (ORDER BY saved_at DESC,rowid DESC) AS position,SUM(length(response_json)) OVER (ORDER BY saved_at DESC,rowid DESC) AS bytes FROM online_business_cache WHERE account_id=?) WHERE position>128 OR bytes>67108864)", [accountId, accountId])
            try execute("COMMIT")
        } catch { try? execute("ROLLBACK"); throw error }
    }
    func invalidateOnlineCache(accountId: String, module: String) throws {
        try requireAccount(accountId)
        for domain in (module == "food" || module == "drinks" ? ["food", "drinks", "food-drink"] : module == "projects" || module == "project-items" ? ["projects", "project-items"] : [module]) {
            try execute("DELETE FROM online_business_cache WHERE account_id=? AND (path=? OR path LIKE ? OR path LIKE ?)", [accountId, "/api/\(domain)", "/api/\(domain)/%", "/api/\(domain)?%"])
        }
    }

    // SQLite's online backup includes WAL contents. Never copy only the .sqlite3 file.
    func acceptanceBackup(accountId: String) throws -> [String: Any] {
        try requireAccount(accountId)
        guard let filename = sqlite3_db_filename(database, "main") else { throw TrackerLocalError.storage }
        let directory = URL(fileURLWithPath: String(cString: filename)).deletingLastPathComponent().appendingPathComponent("AcceptanceBackups", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
        let target = directory.appendingPathComponent(UUID().uuidString + ".sqlite3")
        var destination: OpaquePointer?
        guard sqlite3_open_v2(target.path, &destination, SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE, nil) == SQLITE_OK, let destination else { if let destination { sqlite3_close(destination) }; throw TrackerLocalError.storage }
        defer { sqlite3_close(destination) }
        guard let backup = sqlite3_backup_init(destination, "main", database, "main") else { throw TrackerLocalError.storage }
        let copied = sqlite3_backup_step(backup, -1), finished = sqlite3_backup_finish(backup)
        guard copied == SQLITE_DONE, finished == SQLITE_OK else { throw TrackerLocalError.storage }
        var check: OpaquePointer?
        guard sqlite3_prepare_v2(destination, "PRAGMA quick_check", -1, &check, nil) == SQLITE_OK else { throw TrackerLocalError.storage }
        defer { sqlite3_finalize(check) }
        guard sqlite3_step(check) == SQLITE_ROW, let result = sqlite3_column_text(check, 0), String(cString: result) == "ok" else { throw TrackerLocalError.storage }
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: target.path)
        let original = try read(accountId: accountId) as? [String: Any]
        let outbox = original?["outbox"] as? [[String: Any]] ?? []
        return ["readOnly": true, "backupFile": target.lastPathComponent, "sqliteVerified": true, "pending": outbox.count, "frozen": outbox.filter { $0["wire"] != nil }.count, "revision": original?["revision"] as? Int ?? 0]
    }
}
