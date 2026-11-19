import Foundation
import SQLite3

extension AIStore {
    // Only complete, unique assistant identity evidence is safe to backfill.
    static let memoryMigration = """
    BEGIN IMMEDIATE;
    CREATE TABLE IF NOT EXISTS ai_conversation_owners(
      account_id TEXT NOT NULL,conversation_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('single','group','unresolved')),persona_id TEXT,
      PRIMARY KEY(account_id,conversation_id),CHECK((kind='single')=(persona_id IS NOT NULL)));
    INSERT OR IGNORE INTO ai_conversation_owners(account_id,conversation_id,kind,persona_id)
      SELECT c.account_id,c.id,'group',NULL FROM ai_conversations c WHERE
      EXISTS(SELECT 1 FROM ai_groups g WHERE g.account_id=c.account_id AND g.id=c.id) OR
      EXISTS(SELECT 1 FROM ai_rounds r WHERE r.account_id=c.account_id AND r.conversation_id=c.id) OR
      EXISTS(SELECT 1 FROM ai_discussions d WHERE d.account_id=c.account_id AND d.conversation_id=c.id) OR
      EXISTS(SELECT 1 FROM ai_messages m WHERE m.account_id=c.account_id AND m.conversation_id=c.id AND json_extract(m.payload,'$.roundId') IS NOT NULL);
    INSERT OR IGNORE INTO ai_conversation_owners(account_id,conversation_id,kind,persona_id)
      SELECT c.account_id,c.id,'single',MIN(json_extract(m.payload,'$.personaId'))
      FROM ai_conversations c JOIN ai_messages m ON m.account_id=c.account_id AND m.conversation_id=c.id
      WHERE json_extract(m.payload,'$.role')='assistant'
      GROUP BY c.account_id,c.id HAVING
      COUNT(*)=COUNT(json_extract(m.payload,'$.personaId')) AND COUNT(DISTINCT json_extract(m.payload,'$.personaId'))=1 AND
      COUNT(*)=SUM(CASE WHEN EXISTS(SELECT 1 FROM ai_personas p WHERE p.account_id=c.account_id AND p.id=json_extract(m.payload,'$.personaId')) THEN 1 ELSE 0 END);
    INSERT OR IGNORE INTO ai_conversation_owners(account_id,conversation_id,kind,persona_id)
      SELECT account_id,id,'unresolved',NULL FROM ai_conversations;
    CREATE TABLE IF NOT EXISTS ai_persona_memories(
      account_id TEXT NOT NULL,persona_id TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),
      kind TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('active','superseded','deleted')),payload TEXT NOT NULL,
      PRIMARY KEY(account_id,persona_id,id,version),
      CHECK(json_extract(payload,'$.accountId')=account_id AND json_extract(payload,'$.personaId')=persona_id AND
        json_extract(payload,'$.id')=id AND json_extract(payload,'$.version')=version AND json_extract(payload,'$.status')=status));
    CREATE UNIQUE INDEX IF NOT EXISTS ai_memory_active ON ai_persona_memories(account_id,persona_id,id) WHERE status='active';
    CREATE INDEX IF NOT EXISTS ai_memory_filter ON ai_persona_memories(account_id,persona_id,status,kind);
    PRAGMA user_version=6;
    COMMIT;
    """

    func requirePersona(_ persona: String, account: String) throws {
        guard UUID(uuidString: account) != nil,
              try personas(account).contains(where: { $0.id == persona }) else { throw AIError.invalid }
    }

    func isGroup(_ conversation: String, account: String) throws -> Bool {
        let query = try statement("SELECT 1 FROM ai_conversation_owners WHERE account_id=? AND conversation_id=? AND kind='group'", [account, conversation])
        defer { sqlite3_finalize(query) }
        return sqlite3_step(query) == SQLITE_ROW
    }

    func requireConversationPersona(_ conversation: String, persona: String, account: String) throws {
        try requirePersona(persona, account: account)
        let query = try statement("SELECT kind,persona_id FROM ai_conversation_owners WHERE account_id=? AND conversation_id=?", [account, conversation])
        defer { sqlite3_finalize(query) }
        if sqlite3_step(query) == SQLITE_ROW {
            let kind = String(cString: sqlite3_column_text(query, 0))
            if kind == "single", let raw = sqlite3_column_text(query, 1), String(cString: raw) == persona { return }
            if kind == "unresolved", try messages(conversation, account: account).isEmpty { return }
            throw AIError.ownership
        }
        guard try !hasConversation(conversation, account: account) || messages(conversation, account: account).isEmpty else { throw AIError.ownership }
    }

    func assignConversation(_ conversation: String, persona: String, account: String) throws {
        try requirePersona(persona, account: account)
        guard UUID(uuidString: conversation) != nil else { throw AIError.invalid }
        try execute("UPDATE ai_conversation_owners SET kind='single',persona_id=? WHERE account_id=? AND conversation_id=? AND kind='unresolved'", [persona, account, conversation])
        guard sqlite3_changes(database) == 1 else { throw AIError.ownership }
    }

    func memoryConversations(persona: String, account: String) throws -> [AIConversation] {
        try requirePersona(persona, account: account)
        let historical = try documents("SELECT payload FROM ai_rounds WHERE account_id=?", [account], as: AIGroupRound.self)
        let groupIDs = Set(try groups(account).filter { $0.participants.contains(where: { $0.id == persona }) }.map(\.id) + historical.filter { $0.members.contains(where: { $0.persona.id == persona }) }.map(\.conversationId))
        return try conversations(account, all: true).filter { $0.ownership == "single" && $0.personaId == persona || $0.ownership == "group" && groupIDs.contains($0.id) }
    }

    func memorySources(_ conversation: String, persona: String, account: String) throws -> [AIMessage] {
        guard try memoryConversations(persona: persona, account: account).contains(where: { $0.id == conversation }) else { throw AIError.ownership }
        let history = try messages(conversation, account: account)
        if try !isGroup(conversation, account: account) || groups(account).contains(where: { $0.id == conversation && $0.participants.contains(where: { $0.id == persona }) }) { return history }
        let rounds = try documents("SELECT payload FROM ai_rounds WHERE account_id=? AND conversation_id=?", [account, conversation], as: AIGroupRound.self)
        let allowed = Set(rounds.filter { $0.members.contains(where: { $0.persona.id == persona }) }.map(\.id))
        return history.filter { $0.roundId.map { allowed.contains($0) } ?? false }
    }

    func memories(persona: String, account: String, kind: AIMemoryKind? = nil) throws -> [AIPersonaMemory] {
        try requirePersona(persona, account: account)
        return try documents("SELECT payload FROM ai_persona_memories WHERE account_id=? AND persona_id=? AND status='active'" + (kind == nil ? "" : " AND kind=?") + " ORDER BY json_extract(payload,'$.updatedAt') DESC,id", [account, persona] + (kind.map { [$0.rawValue] } ?? []), as: AIPersonaMemory.self)
    }

    func memoryVersions(_ id: String, persona: String, account: String) throws -> [AIPersonaMemory] {
        try requirePersona(persona, account: account)
        guard UUID(uuidString: id) != nil else { throw AIError.invalid }
        return try documents("SELECT payload FROM ai_persona_memories WHERE account_id=? AND persona_id=? AND id=? ORDER BY version DESC", [account, persona, id], as: AIPersonaMemory.self)
    }

    func saveMemory(_ draft: AIPersonaMemory, expectedVersion: Int, persona: String, account: String, transaction: Bool = true) throws -> AIPersonaMemory {
        try requirePersona(persona, account: account)
        guard draft.accountId == account, draft.personaId == persona, draft.status == .active else { throw AIError.invalid }
        let old = try memoryVersions(draft.id, persona: persona, account: account).first
        guard (old?.version ?? 0) == expectedVersion, old == nil || old?.status == .active else { throw AIError.staleMemory }
        var saved = draft
        saved.version = expectedVersion + 1
        saved.createdAt = old?.createdAt ?? aiTimestamp(); saved.updatedAt = aiTimestamp()
        try saved.validate()
        for source in saved.sources {
            if let id = source.messageId, (try? contextScope(source.conversationId, persona: persona, account: account)) != nil {
                guard let row = try contextRecord(id, conversation: source.conversationId, account: account), row.message.content.contains(source.excerpt) else { throw AIError.invalid }
                continue
            }
            let history = try memorySources(source.conversationId, persona: persona, account: account)
            guard history.contains(where: { (source.messageId == nil || $0.id == source.messageId) && $0.content.contains(source.excerpt) }) else { throw AIError.invalid }
        }
        if transaction { try execute("BEGIN IMMEDIATE") }
        do {
            if var old {
                old.status = .superseded
                try execute("UPDATE ai_persona_memories SET status='superseded',payload=? WHERE account_id=? AND persona_id=? AND id=? AND version=?", [try encoded(old), account, persona, saved.id, String(old.version)])
            }
            try insertMemory(saved)
            if transaction { try execute("COMMIT") }
        } catch { if transaction { try? execute("ROLLBACK") }; throw error }
        return saved
    }

    func insertMemory(_ memory: AIPersonaMemory) throws {
        try execute("INSERT INTO ai_persona_memories(account_id,persona_id,id,version,kind,status,payload) VALUES(?,?,?,?,?,?,?)", [memory.accountId, memory.personaId, memory.id, String(memory.version), memory.kind.rawValue, memory.status.rawValue, try encoded(memory)])
    }

    func deleteMemory(_ id: String, expectedVersion: Int, persona: String, account: String) throws {
        let versions = try memoryVersions(id, persona: persona, account: account)
        guard let latest = versions.first, latest.version == expectedVersion else { throw AIError.staleMemory }
        try purgeSafetyBackups(account: account, personaID: persona, memoryID: id)
        try execute("BEGIN IMMEDIATE")
        do {
            try redactMemory(versions, persona: persona, account: account)
            try execute("COMMIT")
        } catch { try? execute("ROLLBACK"); throw error }
    }

    private func redactMemory(_ versions: [AIPersonaMemory], persona: String, account: String) throws {
        for var value in versions {
            value.content = ""; value.sources = []; value.provenance = nil; value.expiredAt = nil; value.status = .deleted; value.updatedAt = aiTimestamp()
            try execute("UPDATE ai_persona_memories SET status='deleted',payload=? WHERE account_id=? AND persona_id=? AND id=? AND version=?", [try encoded(value), account, persona, value.id, String(value.version)])
        }
    }

    func forgetConversationMemories(_ conversation: String, account: String) throws {
        let all = try documents("SELECT payload FROM ai_persona_memories WHERE account_id=? AND status<>'deleted'", [account], as: AIPersonaMemory.self)
        let affected = all.filter { $0.sources.contains(where: { $0.conversationId == conversation }) }
        for value in affected {
            try redactMemory(all.filter { $0.personaId == value.personaId && $0.id == value.id }, persona: value.personaId, account: account)
        }
    }

    func detachMessageSources(_ message: AIMessage, account: String) throws {
        let conversation = message.conversationId
        func retainedSources(_ sources: [AIMemorySource]) throws -> [AIMemorySource] {
            try sources.filter { source in
                guard source.conversationId == conversation else { return true }
                if let id = source.messageId { return id != message.id }
                guard message.content.contains(source.excerpt) else { return true }
                let query = try statement("SELECT 1 FROM ai_messages WHERE account_id=? AND conversation_id=? AND id<>? AND instr(json_extract(payload,'$.content'),?)>0 LIMIT 1", [account, conversation, message.id, source.excerpt])
                defer { sqlite3_finalize(query) }
                let step = sqlite3_step(query)
                guard step == SQLITE_ROW || step == SQLITE_DONE else { throw AIError.storage }
                return step == SQLITE_ROW
            }
        }
        let memories = try documents("SELECT payload FROM ai_persona_memories WHERE account_id=? AND EXISTS(SELECT 1 FROM json_each(payload,'$.sources') WHERE json_extract(value,'$.conversationId')=?)", [account, conversation], as: AIPersonaMemory.self)
        for var memory in memories {
            let retained = try retainedSources(memory.sources)
            guard retained != memory.sources else { continue }
            memory.sources = retained
            try execute("UPDATE ai_persona_memories SET payload=? WHERE account_id=? AND persona_id=? AND id=? AND version=?", [try encoded(memory), account, memory.personaId, memory.id, String(memory.version)])
            try execute("""
                UPDATE ai_context_snapshots SET payload=json_set(payload,'$.invalidated',json('true'),'$.inputHash','')
                  WHERE account_id=? AND persona_id=? AND EXISTS(SELECT 1 FROM json_each(payload,'$.memories')
                    WHERE json_extract(value,'$.id')=? AND json_extract(value,'$.version')=CAST(? AS INTEGER))
                """, [account, memory.personaId, memory.id, String(memory.version)])
        }
        let proposals = try documents("SELECT payload FROM ai_memory_proposals WHERE account_id=? AND conversation_id=? AND EXISTS(SELECT 1 FROM json_each(payload,'$.memory.sources') WHERE json_extract(value,'$.messageId')=?)", [account, conversation, message.id], as: AIMemoryProposal.self)
        for var proposal in proposals {
            proposal.memory?.sources.removeAll { $0.messageId == message.id }
            try writeProposal(proposal)
        }
        try execute("""
            UPDATE ai_memory_jobs SET payload=json_remove(payload,'$.result')
              WHERE account_id=? AND conversation_id=? AND status='stale'
                AND EXISTS(SELECT 1 FROM json_each(payload,'$.messages') WHERE json_extract(value,'$.id')=?)
            """, [account, conversation, message.id])
    }
}
