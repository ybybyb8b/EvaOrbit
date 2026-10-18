import Foundation
import SQLite3

enum TrackerLocalError: LocalizedError {
    case storage, account, invalid, network(String)
    var errorDescription: String? {
        switch self {
        case .storage: return "本地数据库读写失败，原有数据已保留，请检查设备存储空间"
        case .account: return "本地账户与同步账户不同，请重新连接账户"
        case .invalid: return "Tracker 请求或数据版本不正确，原有数据已保留"
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
    func read(accountId: String) throws -> Any {
        try requireAccount(accountId)
        let query = try statement("SELECT state_json FROM tracker_state WHERE account_id=?", [accountId]); defer { sqlite3_finalize(query) }
        let result = sqlite3_step(query)
        if result == SQLITE_DONE { return NSNull() }
        guard result == SQLITE_ROW, let bytes = sqlite3_column_blob(query, 0) else { throw TrackerLocalError.storage }
        let data = Data(bytes: bytes, count: Int(sqlite3_column_bytes(query, 0)))
        return try JSONSerialization.jsonObject(with: data)
    }
    func commit(accountId: String, expectedRevision: Int, state: [String: Any]) throws -> Bool {
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
            let query = try statement("SELECT revision FROM tracker_state WHERE account_id=?", [accountId])
            let step = sqlite3_step(query)
            let revision = step == SQLITE_ROW ? Int(sqlite3_column_int64(query, 0)) : 0
            sqlite3_finalize(query)
            guard step == SQLITE_ROW || step == SQLITE_DONE else { throw TrackerLocalError.storage }
            guard revision == expectedRevision else { try execute("ROLLBACK"); return false }
            let write = try statement("INSERT INTO tracker_state(account_id,revision,state_json) VALUES(?,?,?) ON CONFLICT(account_id) DO UPDATE SET revision=excluded.revision,state_json=excluded.state_json", [accountId, String(expectedRevision + 1)])
            defer { sqlite3_finalize(write) }
            let bound = data.withUnsafeBytes { sqlite3_bind_blob(write, 3, $0.baseAddress, Int32(data.count), transient) }
            guard bound == SQLITE_OK, sqlite3_step(write) == SQLITE_DONE else { throw TrackerLocalError.storage }
            try execute("COMMIT"); return true
        } catch { try? execute("ROLLBACK"); throw error }
    }
}
