import Foundation
import SQLite3

actor AIStore {
    private let database: OpaquePointer
    private let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

    static func live() throws -> AIStore {
        let root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("EvaOrbitAI", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true,
                                               attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
        return try AIStore(path: root.appendingPathComponent("ai.sqlite3").path)
    }

    init(path: String) throws {
        var handle: OpaquePointer?
        guard sqlite3_open_v2(path, &handle, SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX, nil) == SQLITE_OK,
              let opened = handle else { if let handle { sqlite3_close(handle) }; throw AIError.storage }
        do {
            sqlite3_busy_timeout(opened, 5000)
            var statement: OpaquePointer?
            guard sqlite3_prepare_v2(opened, "PRAGMA user_version", -1, &statement, nil) == SQLITE_OK else { throw AIError.storage }
            let version = sqlite3_step(statement) == SQLITE_ROW ? sqlite3_column_int(statement, 0) : -1
            sqlite3_finalize(statement)
            guard (0...2).contains(version) else { throw AIError.storage }
            let migration = """
            PRAGMA journal_mode=WAL;
            PRAGMA synchronous=FULL;
            BEGIN IMMEDIATE;
            CREATE TABLE IF NOT EXISTS ai_providers(account_id TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(account_id,id));
            CREATE TABLE IF NOT EXISTS ai_conversations(account_id TEXT NOT NULL,id TEXT NOT NULL,title TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(account_id,id));
            CREATE TABLE IF NOT EXISTS ai_messages(ordinal INTEGER PRIMARY KEY AUTOINCREMENT,account_id TEXT NOT NULL,id TEXT NOT NULL,conversation_id TEXT NOT NULL,status TEXT NOT NULL,payload TEXT NOT NULL,UNIQUE(account_id,id));
            CREATE INDEX IF NOT EXISTS ai_message_conversation ON ai_messages(account_id,conversation_id,ordinal);
            COMMIT;
            """
            guard sqlite3_exec(opened, migration, nil, nil, nil) == SQLITE_OK else { throw AIError.storage }
            let personaMigration = """
            BEGIN IMMEDIATE;
            CREATE TABLE IF NOT EXISTS ai_personas(account_id TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(account_id,id));
            PRAGMA user_version=2;
            COMMIT;
            """
            guard sqlite3_exec(opened, personaMigration, nil, nil, nil) == SQLITE_OK else { throw AIError.storage }
            // Only a newly opened store recovers orphaned requests. Reading a mounted UI never interrupts live work.
            let recovery = """
            UPDATE ai_messages SET status='interrupted',payload=json_set(payload,'$.status','interrupted','$.error','The App closed during this response. Partial text was kept; nothing was retried.','$.seq',json_extract(payload,'$.seq')+1) WHERE status='streaming';
            """
            guard sqlite3_exec(opened, recovery, nil, nil, nil) == SQLITE_OK else { throw AIError.storage }
            database = opened
        } catch { sqlite3_close(opened); throw AIError.storage }
    }
    deinit { sqlite3_close(database) }

    private func statement(_ sql: String, _ values: [String]) throws -> OpaquePointer {
        var query: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &query, nil) == SQLITE_OK, let query else { throw AIError.storage }
        for (offset, value) in values.enumerated() {
            guard sqlite3_bind_text(query, Int32(offset + 1), value, -1, transient) == SQLITE_OK else { sqlite3_finalize(query); throw AIError.storage }
        }
        return query
    }
    private func execute(_ sql: String, _ values: [String] = []) throws {
        let query = try statement(sql, values); defer { sqlite3_finalize(query) }
        guard sqlite3_step(query) == SQLITE_DONE else { throw AIError.storage }
    }
    private func documents<T: Decodable>(_ sql: String, _ values: [String], as type: T.Type) throws -> [T] {
        let query = try statement(sql, values); defer { sqlite3_finalize(query) }
        var results: [T] = []
        while true {
            let step = sqlite3_step(query)
            if step == SQLITE_DONE { return results }
            guard step == SQLITE_ROW, let raw = sqlite3_column_text(query, 0),
                  let value = try? JSONDecoder().decode(T.self, from: Data(String(cString: raw).utf8)) else { throw AIError.storage }
            results.append(value)
        }
    }
    private func encoded<T: Encodable>(_ value: T) throws -> String {
        guard let result = String(data: try JSONEncoder().encode(value), encoding: .utf8) else { throw AIError.storage }
        return result
    }
    func providers(_ account: String) throws -> [AIProvider] {
        try documents("SELECT payload FROM ai_providers WHERE account_id=? ORDER BY id", [account], as: AIProvider.self)
    }
    func defaultPersona(_ account: String) throws -> ParlorPersona {
        if let saved = try documents("SELECT payload FROM ai_personas WHERE account_id=? AND id=?", [account, ParlorPersona.sebastian.id], as: ParlorPersona.self).first { return saved }
        let persona = ParlorPersona.sebastian
        try savePersona(persona, account: account)
        return persona
    }
    func savePersona(_ persona: ParlorPersona, account: String) throws {
        try persona.validate()
        try execute("INSERT INTO ai_personas(account_id,id,payload) VALUES(?,?,?) ON CONFLICT(account_id,id) DO UPDATE SET payload=excluded.payload", [account, persona.id, try encoded(persona)])
    }
    func saveProvider(_ provider: AIProvider, account: String) throws {
        try provider.validate()
        let existing = try providers(account)
        guard existing.count < 50 || existing.contains(where: { $0.id == provider.id }) else { throw AIError.tooLarge }
        try execute("INSERT INTO ai_providers(account_id,id,payload) VALUES(?,?,?) ON CONFLICT(account_id,id) DO UPDATE SET payload=excluded.payload", [account, provider.id, try encoded(provider)])
    }
    func deleteProvider(_ id: String, account: String) throws {
        try execute("DELETE FROM ai_providers WHERE account_id=? AND id=?", [account, id])
    }
    func conversations(_ account: String) throws -> [AIConversation] {
        // Keep the first version bounded. No history is deleted when the list reaches its display limit.
        let query = try statement("SELECT id,title,updated_at FROM ai_conversations WHERE account_id=? ORDER BY updated_at DESC,rowid DESC LIMIT 200", [account])
        defer { sqlite3_finalize(query) }
        var result: [AIConversation] = []
        while true {
            let step = sqlite3_step(query)
            if step == SQLITE_DONE { return result }
            guard step == SQLITE_ROW else { throw AIError.storage }
            result.append(.init(id: String(cString: sqlite3_column_text(query, 0)), title: String(cString: sqlite3_column_text(query, 1)), updatedAt: String(cString: sqlite3_column_text(query, 2))))
        }
    }
    func messages(_ conversation: String, account: String) throws -> [AIMessage] {
        let result = try documents("SELECT payload FROM ai_messages WHERE account_id=? AND conversation_id=? ORDER BY ordinal LIMIT 1001", [account, conversation], as: AIMessage.self)
        guard result.count <= 1000 else { throw AIError.tooLarge }
        return result
    }
    func begin(user: AIMessage, assistant: AIMessage, account: String) throws {
        try execute("BEGIN IMMEDIATE")
        do {
            try execute("INSERT INTO ai_conversations(account_id,id,title,updated_at) VALUES(?,?,?,?) ON CONFLICT(account_id,id) DO UPDATE SET updated_at=excluded.updated_at",
                        [account, user.conversationId, String(user.content.prefix(60)), user.createdAt])
            for message in [user, assistant] {
                try execute("INSERT INTO ai_messages(account_id,id,conversation_id,status,payload) VALUES(?,?,?,?,?)",
                            [account, message.id, message.conversationId, message.status, try encoded(message)])
            }
            try execute("COMMIT")
        } catch { try? execute("ROLLBACK"); throw AIError.storage }
    }
    func update(_ message: AIMessage, account: String) throws {
        try execute("UPDATE ai_messages SET status=?,payload=? WHERE account_id=? AND id=?", [message.status, try encoded(message), account, message.id])
        guard sqlite3_changes(database) == 1 else { throw AIError.storage }
    }
    func deleteConversation(_ id: String, account: String) throws {
        try execute("BEGIN IMMEDIATE")
        do {
            try execute("DELETE FROM ai_messages WHERE account_id=? AND conversation_id=?", [account, id])
            try execute("DELETE FROM ai_conversations WHERE account_id=? AND id=?", [account, id])
            try execute("COMMIT")
        } catch { try? execute("ROLLBACK"); throw AIError.storage }
    }
}
