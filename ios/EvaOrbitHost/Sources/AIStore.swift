import Foundation
import SQLite3

actor AIStore {
    let database: OpaquePointer
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
            guard (0...9).contains(version) else { throw AIError.storage }
            if version > 0 && version < 9 { try Self.safetyBackup(database: opened, path: path) }
            let migration = """
            PRAGMA journal_mode=WAL;
            PRAGMA synchronous=FULL;
            BEGIN IMMEDIATE;
            CREATE TABLE IF NOT EXISTS ai_providers(account_id TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(account_id,id));
            CREATE TABLE IF NOT EXISTS ai_conversations(account_id TEXT NOT NULL,id TEXT NOT NULL,title TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(account_id,id));
            CREATE TABLE IF NOT EXISTS ai_messages(ordinal INTEGER PRIMARY KEY AUTOINCREMENT,account_id TEXT NOT NULL,id TEXT NOT NULL,conversation_id TEXT NOT NULL,status TEXT NOT NULL,payload TEXT NOT NULL,UNIQUE(account_id,id));
            CREATE INDEX IF NOT EXISTS ai_message_conversation ON ai_messages(account_id,conversation_id,ordinal);
            CREATE INDEX IF NOT EXISTS ai_message_replacement ON ai_messages(account_id,conversation_id,json_extract(payload,'$.supersedesId'));
            COMMIT;
            """
            guard sqlite3_exec(opened, migration, nil, nil, nil) == SQLITE_OK else { throw AIError.storage }
            let personaMigration = """
            BEGIN IMMEDIATE;
            CREATE TABLE IF NOT EXISTS ai_personas(account_id TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(account_id,id));
            PRAGMA user_version=2;
            COMMIT;
            """
            if version < 2 { guard sqlite3_exec(opened, personaMigration, nil, nil, nil) == SQLITE_OK else { throw AIError.storage } }
            let groupMigration = """
            BEGIN IMMEDIATE;
            CREATE TABLE IF NOT EXISTS ai_groups(account_id TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(account_id,id));
            CREATE TABLE IF NOT EXISTS ai_rounds(account_id TEXT NOT NULL,id TEXT NOT NULL,conversation_id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(account_id,id));
            PRAGMA user_version=3;
            COMMIT;
            """
            if version < 3 { guard sqlite3_exec(opened, groupMigration, nil, nil, nil) == SQLITE_OK else { throw AIError.storage } }
            let discussionMigration = """
            BEGIN IMMEDIATE;
            CREATE TABLE IF NOT EXISTS ai_discussions(account_id TEXT NOT NULL,conversation_id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(account_id,conversation_id));
            UPDATE ai_discussions SET payload=json_set(payload,'$.status','interrupted','$.revision',json_extract(payload,'$.revision')+1) WHERE json_extract(payload,'$.status') IN ('running','summarizing');
            PRAGMA user_version=4;
            COMMIT;
            """
            if version < 4 { guard sqlite3_exec(opened, discussionMigration, nil, nil, nil) == SQLITE_OK else { throw AIError.storage } }
            let modelSelectionMigration = """
            BEGIN IMMEDIATE;
            CREATE TABLE IF NOT EXISTS ai_conversation_models(account_id TEXT NOT NULL,conversation_id TEXT NOT NULL,persona_id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(account_id,conversation_id,persona_id));
            PRAGMA user_version=5;
            COMMIT;
            """
            if version < 5 { guard sqlite3_exec(opened, modelSelectionMigration, nil, nil, nil) == SQLITE_OK else { throw AIError.storage } }
            if version < 6 { guard sqlite3_exec(opened, Self.memoryMigration, nil, nil, nil) == SQLITE_OK else { throw AIError.storage } }
            if version < 7 { guard sqlite3_exec(opened, Self.contextMigration, nil, nil, nil) == SQLITE_OK else { throw AIError.storage } }
            if version < 8 { guard sqlite3_exec(opened, Self.processingMigration, nil, nil, nil) == SQLITE_OK else { throw AIError.storage } }
            guard sqlite3_exec(opened, Self.processingRecovery, nil, nil, nil) == SQLITE_OK else { throw AIError.storage }
            if version < 9 { guard sqlite3_exec(opened, Self.echoMigration, nil, nil, nil) == SQLITE_OK else { throw AIError.storage } }
            guard sqlite3_exec(opened, "UPDATE ai_echo_shares SET payload=json_set(payload,'$.status','unknown') WHERE json_extract(payload,'$.status')='submitting'", nil, nil, nil) == SQLITE_OK else { throw AIError.storage }
            let discussionRecovery = """
            UPDATE ai_discussions SET payload=json_set(payload,'$.status','interrupted','$.revision',json_extract(payload,'$.revision')+1) WHERE json_extract(payload,'$.status') IN ('running','summarizing');
            """
            guard sqlite3_exec(opened, discussionRecovery, nil, nil, nil) == SQLITE_OK else { throw AIError.storage }
            // Only a newly opened store recovers orphaned requests. Reading a mounted UI never interrupts live work.
            let recovery = """
            UPDATE ai_messages SET status='interrupted',payload=json_set(payload,'$.status','interrupted','$.error','The App closed during this response. Partial text was kept; nothing was retried.','$.seq',json_extract(payload,'$.seq')+1) WHERE status='streaming';
            """
            guard sqlite3_exec(opened, recovery, nil, nil, nil) == SQLITE_OK else { throw AIError.storage }
            database = opened
        } catch { sqlite3_close(opened); throw AIError.storage }
    }
    deinit { sqlite3_close(database) }

    func statement(_ sql: String, _ values: [String]) throws -> OpaquePointer {
        var query: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &query, nil) == SQLITE_OK, let query else { throw AIError.storage }
        for (offset, value) in values.enumerated() {
            guard sqlite3_bind_text(query, Int32(offset + 1), value, -1, transient) == SQLITE_OK else { sqlite3_finalize(query); throw AIError.storage }
        }
        return query
    }
    func execute(_ sql: String, _ values: [String] = []) throws {
        let query = try statement(sql, values); defer { sqlite3_finalize(query) }
        guard sqlite3_step(query) == SQLITE_DONE else { throw AIError.storage }
    }
    func documents<T: Decodable>(_ sql: String, _ values: [String], as type: T.Type) throws -> [T] {
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
    func encoded<T: Encodable>(_ value: T) throws -> String {
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
    func personas(_ account: String) throws -> [ParlorPersona] {
        try documents("SELECT payload FROM ai_personas WHERE account_id=? ORDER BY CASE WHEN id='sebastian' THEN 0 ELSE 1 END,rowid", [account], as: ParlorPersona.self)
    }
    func groups(_ account: String) throws -> [AIGroup] {
        try documents("SELECT payload FROM ai_groups WHERE account_id=? ORDER BY rowid DESC", [account], as: AIGroup.self)
    }
    func saveGroup(_ group: AIGroup, account: String) throws {
        try group.validate()
        if try !isGroup(group.id, account: account) && !messages(group.id, account: account).isEmpty { throw AIError.ownership }
        try execute("BEGIN IMMEDIATE")
        do {
            try execute("INSERT INTO ai_conversations(account_id,id,title,updated_at) VALUES(?,?,?,?) ON CONFLICT(account_id,id) DO UPDATE SET title=excluded.title,updated_at=excluded.updated_at", [account, group.id, group.title, aiTimestamp()])
            try execute("INSERT INTO ai_groups(account_id,id,payload) VALUES(?,?,?) ON CONFLICT(account_id,id) DO UPDATE SET payload=excluded.payload", [account, group.id, try encoded(group)])
            try execute("INSERT INTO ai_conversation_owners(account_id,conversation_id,kind,persona_id) VALUES(?,?,'group',NULL) ON CONFLICT(account_id,conversation_id) DO UPDATE SET kind='group',persona_id=NULL", [account, group.id])
            try execute("COMMIT")
        } catch { try? execute("ROLLBACK"); throw error }
    }
    func round(_ id: String, account: String) throws -> AIGroupRound? {
        try documents("SELECT payload FROM ai_rounds WHERE account_id=? AND id=?", [account, id], as: AIGroupRound.self).first
    }
    func beginRound(_ round: AIGroupRound, user: AIMessage?, assistants: [AIMessage], account: String, saveSnapshot: Bool = false, discussion: AIGroupDiscussion? = nil, insertSnapshot: Bool = true, contextPlan: AIContextPlan? = nil) throws {
        try execute("BEGIN IMMEDIATE")
        do {
            if let discussion { try saveDiscussion(discussion, account: account) }
            if insertSnapshot && (user != nil || saveSnapshot) {
                var saved = round
                if saved.publicContextId != nil { saved.context = [] }
                try execute("INSERT INTO ai_rounds(account_id,id,conversation_id,payload) VALUES(?,?,?,?)", [account, round.id, round.conversationId, try encoded(saved)])
            }
            for message in (user.map { [$0] } ?? []) + assistants {
                try execute("INSERT INTO ai_messages(account_id,id,conversation_id,status,payload) VALUES(?,?,?,?,?)", [account, message.id, message.conversationId, message.status, try encoded(message)])
            }
            if let contextPlan { try insertContextPlan(contextPlan) }
            try execute("UPDATE ai_conversations SET updated_at=? WHERE account_id=? AND id=?", [aiTimestamp(), account, round.conversationId])
            try execute("COMMIT")
        } catch { try? execute("ROLLBACK"); throw error }
    }
    func discussions(_ account: String) throws -> [AIGroupDiscussion] {
        try documents("SELECT payload FROM ai_discussions WHERE account_id=?", [account], as: AIGroupDiscussion.self)
    }
    func saveDiscussion(_ value: AIGroupDiscussion, account: String) throws {
        try execute("INSERT INTO ai_discussions(account_id,conversation_id,payload) VALUES(?,?,?) ON CONFLICT(account_id,conversation_id) DO UPDATE SET payload=excluded.payload WHERE json_extract(ai_discussions.payload,'$.id')<>json_extract(excluded.payload,'$.id') OR json_extract(ai_discussions.payload,'$.revision')<=json_extract(excluded.payload,'$.revision')", [account, value.conversationId, try encoded(value)])
    }
    func conversationModels(_ conversation: String, account: String) throws -> [AIConversationModel] {
        try documents("SELECT payload FROM ai_conversation_models WHERE account_id=? AND conversation_id=? ORDER BY persona_id", [account, conversation], as: AIConversationModel.self)
    }
    func saveConversationModel(_ value: AIConversationModel, title: String, account: String) throws {
        if try !isGroup(value.conversationId, account: account) { try requireConversationPersona(value.conversationId, persona: value.personaId, account: account) }
        try execute("BEGIN IMMEDIATE")
        do {
            try execute("INSERT INTO ai_conversations(account_id,id,title,updated_at) VALUES(?,?,?,?) ON CONFLICT(account_id,id) DO NOTHING", [account, value.conversationId, title, aiTimestamp()])
            try execute("INSERT INTO ai_conversation_models(account_id,conversation_id,persona_id,payload) VALUES(?,?,?,?) ON CONFLICT(account_id,conversation_id,persona_id) DO UPDATE SET payload=excluded.payload", [account, value.conversationId, value.personaId, try encoded(value)])
            if try !isGroup(value.conversationId, account: account) {
                try execute("INSERT INTO ai_conversation_owners VALUES(?,?,'single',?) ON CONFLICT(account_id,conversation_id) DO NOTHING", [account, value.conversationId, value.personaId])
            }
            try execute("COMMIT")
        } catch { try? execute("ROLLBACK"); throw error }
    }
    func savePersona(_ persona: ParlorPersona, account: String) throws {
        try persona.validate()
        let existing = try personas(account)
        guard existing.count < 50 || existing.contains(where: { $0.id == persona.id }) else { throw AIError.tooLarge }
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
    func hasConversation(_ id: String, account: String) throws -> Bool {
        let query = try statement("SELECT 1 FROM ai_conversations WHERE account_id=? AND id=?", [account, id])
        defer { sqlite3_finalize(query) }
        return sqlite3_step(query) == SQLITE_ROW
    }
    func conversations(_ account: String, all: Bool = false) throws -> [AIConversation] {
        // Keep the first version bounded. No history is deleted when the list reaches its display limit.
        let query = try statement("SELECT c.id,c.title,c.updated_at,o.kind,o.persona_id FROM ai_conversations c LEFT JOIN ai_conversation_owners o ON o.account_id=c.account_id AND o.conversation_id=c.id WHERE c.account_id=? ORDER BY c.updated_at DESC,c.rowid DESC" + (all ? "" : " LIMIT 200"), [account])
        defer { sqlite3_finalize(query) }
        var result: [AIConversation] = []
        while true {
            let step = sqlite3_step(query)
            if step == SQLITE_DONE { return result }
            guard step == SQLITE_ROW else { throw AIError.storage }
            result.append(.init(id: String(cString: sqlite3_column_text(query, 0)), title: String(cString: sqlite3_column_text(query, 1)), updatedAt: String(cString: sqlite3_column_text(query, 2)), ownership: sqlite3_column_text(query, 3).map { String(cString: $0) }, personaId: sqlite3_column_text(query, 4).map { String(cString: $0) }))
        }
    }
    func messages(_ conversation: String, account: String) throws -> [AIMessage] {
        try documents("SELECT payload FROM ai_messages WHERE account_id=? AND conversation_id=? ORDER BY ordinal", [account, conversation], as: AIMessage.self)
    }
    func begin(user: AIMessage, assistant: AIMessage, account: String, contextPlan: AIContextPlan? = nil) throws {
        try execute("BEGIN IMMEDIATE")
        do {
            guard let persona = assistant.personaId else { throw AIError.ownership }
            try requireConversationPersona(user.conversationId, persona: persona, account: account)
            try execute("INSERT INTO ai_conversations(account_id,id,title,updated_at) VALUES(?,?,?,?) ON CONFLICT(account_id,id) DO UPDATE SET updated_at=excluded.updated_at",
                        [account, user.conversationId, String(user.content.prefix(60)), user.createdAt])
            try execute("INSERT INTO ai_conversation_owners(account_id,conversation_id,kind,persona_id) VALUES(?,?,'single',?) ON CONFLICT(account_id,conversation_id) DO UPDATE SET kind='single',persona_id=excluded.persona_id", [account, user.conversationId, persona])
            for message in [user, assistant] {
                try execute("INSERT INTO ai_messages(account_id,id,conversation_id,status,payload) VALUES(?,?,?,?,?)",
                            [account, message.id, message.conversationId, message.status, try encoded(message)])
            }
            if let contextPlan { try insertContextPlan(contextPlan) }
            try execute("COMMIT")
        } catch { try? execute("ROLLBACK"); throw AIError.storage }
    }
    func update(_ message: AIMessage, account: String) throws {
        try execute("UPDATE ai_messages SET status=?,payload=? WHERE account_id=? AND id=?", [message.status, try encoded(message), account, message.id])
        guard sqlite3_changes(database) == 1 else { throw AIError.storage }
    }
    func deleteConversation(_ id: String, account: String) throws {
        try purgeSafetyBackups(account: account, conversationID: id)
        try execute("BEGIN IMMEDIATE")
        do {
            try forgetConversationMemories(id, account: account)
            try execute("UPDATE ai_echo_shares SET payload=json_set(json_remove(payload,'$.payloadJSON','$.content'),'$.sourceRefs',json('[]')) WHERE account_id=? AND (conversation_id=? OR EXISTS(SELECT 1 FROM json_each(ai_echo_shares.payload,'$.sourceRefs') WHERE json_extract(value,'$.id') IN (SELECT id FROM ai_messages WHERE account_id=? AND conversation_id=?)))", [account, id, account, id])
            try execute("DELETE FROM ai_memory_proposals WHERE account_id=? AND conversation_id=?", [account, id])
            try execute("DELETE FROM ai_memory_jobs WHERE account_id=? AND conversation_id=?", [account, id])
            try execute("DELETE FROM ai_context_snapshots WHERE account_id=? AND conversation_id=?", [account, id])
            try execute("DELETE FROM ai_conversation_contexts WHERE account_id=? AND conversation_id=?", [account, id])
            try execute("DELETE FROM ai_conversation_owners WHERE account_id=? AND conversation_id=?", [account, id])
            try execute("DELETE FROM ai_conversation_models WHERE account_id=? AND conversation_id=?", [account, id])
            try execute("DELETE FROM ai_messages WHERE account_id=? AND conversation_id=?", [account, id])
            try execute("DELETE FROM ai_discussions WHERE account_id=? AND conversation_id=?", [account, id])
            try execute("DELETE FROM ai_groups WHERE account_id=? AND id=?", [account, id])
            try execute("DELETE FROM ai_rounds WHERE account_id=? AND conversation_id=?", [account, id])
            try execute("DELETE FROM ai_conversations WHERE account_id=? AND id=?", [account, id])
            try execute("COMMIT")
        } catch { try? execute("ROLLBACK"); throw AIError.storage }
    }
}
