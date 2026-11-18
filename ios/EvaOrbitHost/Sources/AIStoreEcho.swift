import Foundation

extension AIStore {
    static let echoMigration = """
    BEGIN IMMEDIATE;
    CREATE TABLE IF NOT EXISTS ai_echo_config(account_id TEXT PRIMARY KEY,payload TEXT NOT NULL,CHECK(json_extract(payload,'$.accountId')=account_id));
    CREATE TABLE IF NOT EXISTS ai_echo_snapshots(account_id TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(account_id,id),CHECK(json_extract(payload,'$.accountId')=account_id AND json_extract(payload,'$.id')=id));
    CREATE TABLE IF NOT EXISTS ai_echo_bindings(account_id TEXT NOT NULL,id TEXT NOT NULL,query TEXT NOT NULL,snapshot_id TEXT NOT NULL,PRIMARY KEY(account_id,id));
    CREATE TABLE IF NOT EXISTS ai_echo_shares(account_id TEXT NOT NULL,persona_id TEXT NOT NULL,conversation_id TEXT NOT NULL,request_id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(account_id,request_id),CHECK(json_extract(payload,'$.accountId')=account_id AND json_extract(payload,'$.personaId')=persona_id AND json_extract(payload,'$.requestId')=request_id AND json_extract(payload,'$.conversationId')=conversation_id));
    CREATE TRIGGER IF NOT EXISTS ai_echo_memory_forgotten AFTER UPDATE ON ai_persona_memories WHEN NEW.status='deleted' BEGIN
      UPDATE ai_echo_shares SET payload=json_set(json_remove(payload,'$.payloadJSON','$.content'),'$.sourceRefs',json('[]')) WHERE account_id=NEW.account_id AND persona_id=NEW.persona_id AND json_extract(payload,'$.memoryId')=NEW.id;
    END;
    CREATE TRIGGER IF NOT EXISTS ai_echo_source_changed AFTER UPDATE ON ai_messages WHEN OLD.payload<>NEW.payload BEGIN
      UPDATE ai_echo_shares SET payload=json_set(json_remove(payload,'$.payloadJSON','$.content'),'$.sourceRefs',json('[]')) WHERE account_id=OLD.account_id AND EXISTS(SELECT 1 FROM json_each(ai_echo_shares.payload,'$.sourceRefs') WHERE json_extract(value,'$.id')=OLD.id);
    END;
    CREATE TRIGGER IF NOT EXISTS ai_echo_source_deleted AFTER DELETE ON ai_messages BEGIN
      UPDATE ai_echo_shares SET payload=json_set(json_remove(payload,'$.payloadJSON','$.content'),'$.sourceRefs',json('[]')) WHERE account_id=OLD.account_id AND EXISTS(SELECT 1 FROM json_each(ai_echo_shares.payload,'$.sourceRefs') WHERE json_extract(value,'$.id')=OLD.id);
    END;
    CREATE TRIGGER IF NOT EXISTS ai_echo_source_replaced AFTER INSERT ON ai_messages WHEN json_extract(NEW.payload,'$.supersedesId') IS NOT NULL BEGIN
      UPDATE ai_echo_shares SET payload=json_set(json_remove(payload,'$.payloadJSON','$.content'),'$.sourceRefs',json('[]')) WHERE account_id=NEW.account_id AND EXISTS(SELECT 1 FROM json_each(ai_echo_shares.payload,'$.sourceRefs') WHERE json_extract(value,'$.id')=json_extract(NEW.payload,'$.supersedesId'));
    END;
    PRAGMA user_version=9;
    COMMIT;
    """
    func echoConfig(_ account: String) throws -> AIEchoConfig {
        guard UUID(uuidString: account) != nil else { throw AIError.invalid }
        return try documents("SELECT payload FROM ai_echo_config WHERE account_id=?", [account], as: AIEchoConfig.self).first ?? .init(accountId: account)
    }
    func writeEchoConfig(_ value: AIEchoConfig) throws {
        try execute("INSERT INTO ai_echo_config VALUES(?,?) ON CONFLICT(account_id) DO UPDATE SET payload=json_set(excluded.payload,'$.apiAttempts',MAX(COALESCE(json_extract(ai_echo_config.payload,'$.apiAttempts'),0),COALESCE(json_extract(excluded.payload,'$.apiAttempts'),0)))", [value.accountId, try encoded(value)])
    }
    func requireEchoAccess(_ access: AIEchoAccess) throws {
        try access.check()
        let config = try echoConfig(access.account)
        guard access.writing ? config.writeEnabled : config.readEnabled else { throw AIError.invalid }
    }
    func countEchoAttempt(_ access: AIEchoAccess) throws {
        try requireEchoAccess(access)
        try execute("UPDATE ai_echo_config SET payload=json_set(payload,'$.apiAttempts',COALESCE(json_extract(payload,'$.apiAttempts'),0)+1) WHERE account_id=?", [access.account])
    }
    func markEchoConnected(_ access: AIEchoAccess) throws {
        try requireEchoAccess(access)
        try access.whileValid {
            try execute("UPDATE ai_echo_config SET payload=json_set(payload,'$.connectionStatus','connected') WHERE account_id=?", [access.account])
        }
    }
    func configureEcho(_ account: String, read: Bool? = nil, write: Bool? = nil) throws {
        var config = try echoConfig(account)
        config.readEnabled = read ?? config.readEnabled
        config.writeEnabled = write ?? config.writeEnabled
        try execute("BEGIN IMMEDIATE")
        do {
            if !config.readEnabled || read == nil && write == nil {
                try execute("UPDATE ai_echo_snapshots SET payload=json_remove(payload,'$.contextJSON') WHERE account_id=?", [account])
                try execute("DELETE FROM ai_echo_bindings WHERE account_id=?", [account])
                try execute("UPDATE ai_context_snapshots SET payload=json_set(payload,'$.invalidated',json('true'),'$.inputHash','') WHERE account_id=? AND (json_extract(payload,'$.echo') IS NOT NULL OR json_extract(payload,'$.publicSnapshotId') IN (SELECT id FROM ai_context_snapshots WHERE account_id=? AND json_extract(payload,'$.echo') IS NOT NULL))", [account, account])
                config.lastStatus = "disabled"
            }
            try writeEchoConfig(config); try execute("COMMIT")
        } catch { try? execute("ROLLBACK"); throw error }
    }
    func echoSnapshot(_ id: String, account: String) throws -> AIEchoSnapshot? {
        try documents("SELECT payload FROM ai_echo_snapshots WHERE account_id=? AND id=?", [account, id], as: AIEchoSnapshot.self).first
    }
    func echoCached(_ query: String, account: String) throws -> AIEchoSnapshot? {
        try documents("SELECT payload FROM ai_echo_snapshots WHERE account_id=? AND json_extract(payload,'$.query')=? AND json_extract(payload,'$.expiresAt')>? AND json_extract(payload,'$.contextJSON') IS NOT NULL ORDER BY rowid DESC LIMIT 1", [account, query, aiTimestamp()], as: AIEchoSnapshot.self).first
    }
    func echoBinding(_ id: String, account: String) throws -> AIEchoSnapshot? {
        try documents("SELECT s.payload FROM ai_echo_snapshots s JOIN ai_echo_bindings b ON b.account_id=s.account_id AND b.snapshot_id=s.id WHERE b.account_id=? AND b.id=?", [account, id], as: AIEchoSnapshot.self).first
    }
    func recallEchoCache(_ access: AIEchoAccess, query: String, text: String, discussion: String?) throws -> AIEchoSnapshot? {
        try requireEchoAccess(access)
        if let discussion, var frozen = try echoBinding(discussion, account: access.account), !AIEcho.topicChanged(old: frozen.query, new: query, text: text) {
            if frozen.contextJSON == nil {
                frozen.complete = false
                if frozen.status == "complete" { frozen.status = "unavailable" }
            }
            try access.whileValid {
                try updateEchoRecall(frozen, status: "frozen_" + frozen.status, time: aiTimestamp())
            }
            return frozen
        }
        guard let cached = try echoCached(query, account: access.account) else { return nil }
        try echoRecallTransaction(access) {
            if let discussion { try bindEchoSnapshot(cached, to: discussion) }
            try updateEchoRecall(cached, status: "cached_" + cached.status, time: aiTimestamp())
        }
        return cached
    }
    func recordEchoRecall(_ snapshot: AIEchoSnapshot, discussion: String?, access: AIEchoAccess) throws {
        try requireEchoAccess(access)
        guard !access.writing, snapshot.accountId == access.account else { throw AIError.invalid }
        try echoRecallTransaction(access) {
            try saveEchoSnapshot(snapshot, binding: discussion)
            try updateEchoRecall(snapshot, status: snapshot.status, time: snapshot.fetchedAt,
                                 connection: snapshot.error == nil ? "connected" : "unavailable")
        }
    }
    private func echoRecallTransaction(_ access: AIEchoAccess, update: () throws -> Void) throws {
        try execute("BEGIN IMMEDIATE")
        do {
            try update()
            try access.whileValid { try execute("COMMIT") }
        } catch { try? execute("ROLLBACK"); throw error }
    }
    private func updateEchoRecall(_ snapshot: AIEchoSnapshot, status: String, time: String, connection: String? = nil) throws {
        try execute("UPDATE ai_echo_config SET payload=json_set(payload,'$.lastSnapshotId',?,'$.lastStatus',?,'$.lastRecallAt',?) WHERE account_id=?", [snapshot.id, status, time, snapshot.accountId])
        if let connection {
            try execute("UPDATE ai_echo_config SET payload=json_set(payload,'$.connectionStatus',?) WHERE account_id=?", [connection, snapshot.accountId])
        }
    }
    private func bindEchoSnapshot(_ snapshot: AIEchoSnapshot, to discussion: String) throws {
        try execute("INSERT INTO ai_echo_bindings VALUES(?,?,?,?) ON CONFLICT(account_id,id) DO UPDATE SET query=excluded.query,snapshot_id=excluded.snapshot_id", [snapshot.accountId, discussion, snapshot.query, snapshot.id])
    }
    func saveEchoSnapshot(_ snapshot: AIEchoSnapshot, binding: String?) throws {
        if snapshot.contextJSON != nil { guard try echoConfig(snapshot.accountId).readEnabled else { throw AIError.invalid } }
        try execute("INSERT INTO ai_echo_snapshots VALUES(?,?,?)", [snapshot.accountId, snapshot.id, try encoded(snapshot)])
        if let binding { try bindEchoSnapshot(snapshot, to: binding) }
        // Retain receipt metadata; never grow an unbounded copy of Echo bodies.
        try execute("UPDATE ai_echo_snapshots SET payload=json_remove(payload,'$.contextJSON') WHERE account_id=? AND id NOT IN (SELECT id FROM ai_echo_snapshots WHERE account_id=? AND json_extract(payload,'$.contextJSON') IS NOT NULL ORDER BY rowid DESC LIMIT 32)", [snapshot.accountId, snapshot.accountId])
    }
    func echoShares(persona: String, account: String) throws -> [AIEchoShare] {
        try requirePersona(persona, account: account)
        return try documents("SELECT payload FROM ai_echo_shares WHERE account_id=? AND persona_id=? ORDER BY rowid DESC LIMIT 100", [account, persona], as: AIEchoShare.self)
    }
    func echoShare(_ id: String, persona: String, account: String) throws -> AIEchoShare {
        try requirePersona(persona, account: account)
        guard let value = try documents("SELECT payload FROM ai_echo_shares WHERE account_id=? AND persona_id=? AND request_id=?", [account, persona, id], as: AIEchoShare.self).first else { throw AIError.invalid }
        return value
    }
    func writeEchoShare(_ value: AIEchoShare) throws {
        try execute("INSERT INTO ai_echo_shares VALUES(?,?,?,?,?) ON CONFLICT(account_id,request_id) DO UPDATE SET payload=CASE WHEN json_extract(ai_echo_shares.payload,'$.payloadJSON') IS NULL THEN json_set(json_remove(excluded.payload,'$.payloadJSON','$.content'),'$.sourceRefs',json('[]')) ELSE excluded.payload END", [value.accountId, value.personaId, value.conversationId, value.requestId, try encoded(value)])
    }
    func writeEchoShare(_ value: AIEchoShare, access: AIEchoAccess) throws {
        try requireEchoAccess(access)
        guard value.accountId == access.account else { throw AIError.invalid }
        _ = try echoShare(value.requestId, persona: value.personaId, account: value.accountId)
        try writeEchoShare(value)
    }
    func markEchoShareUnknown(_ value: AIEchoShare) throws {
        // The POST may have committed. Keep the receipt recoverable without restoring a deleted draft.
        try execute("UPDATE ai_echo_shares SET payload=json_set(payload,'$.status','unknown','$.updatedAt',?) WHERE account_id=? AND request_id=? AND json_extract(payload,'$.status')='submitting' AND json_extract(payload,'$.updatedAt')=?",
                    [aiTimestamp(), value.accountId, value.requestId, value.updatedAt])
    }
    func prepareEchoShare(account: String, persona: String, entity: String, predicate: String, memoryId: String?, version: Int?, conversation: String?, messageId: String?, excerpt: String?) throws -> AIEchoShare {
        guard try echoConfig(account).writeEnabled, UUID(uuidString: entity) != nil, !predicate.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, predicate.count <= 120 else { throw AIError.invalid }
        var memory: AIPersonaMemory?, rows: [AIContextRecord] = [], text: String, nature = AIMemoryNature.personaObservation, importance = 3
        if let memoryId {
            guard let value = try memoryVersions(memoryId, persona: persona, account: account).first, value.status == .active, value.version == version, !value.sources.isEmpty else { throw AIError.staleMemory }
            memory = value; text = excerpt ?? value.content; guard value.content.contains(text) else { throw AIError.invalidContext }; nature = value.nature; importance = value.importance
            for source in value.sources {
                _ = try contextScope(source.conversationId, persona: persona, account: account)
                guard let id = source.messageId, let row = try contextRecord(id, conversation: source.conversationId, account: account), row.message.status != "streaming", try !isReplaced(id, conversation: source.conversationId, account: account), row.message.content.contains(source.excerpt) else { throw AIError.invalidContext }
                rows.append(row)
            }
        } else {
            guard let conversation, let messageId else { throw AIError.invalid }
            _ = try contextScope(conversation, persona: persona, account: account)
            guard let row = try contextRecord(messageId, conversation: conversation, account: account), row.message.status != "streaming", try !isReplaced(messageId, conversation: conversation, account: account) else { throw AIError.invalidContext }
            text = excerpt ?? String(row.message.content.prefix(3000))
            guard row.message.content.contains(text) else { throw AIError.invalidContext }
            rows = [row]; nature = row.message.role == "user" ? .userStatement : .personaObservation
        }
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, text.utf8.count <= 8000, !text.contains("\0"), !rows.isEmpty else { throw AIError.invalid }
        let direct = nature == .userStatement && rows.allSatisfy { $0.message.role == "user" } && rows.contains { $0.message.content.contains(text) }
        let epistemic = direct ? "direct_statement" : nature == .personaObservation ? "agent_judgment" : "derived"
        let sources: [[String: Any]] = rows.enumerated().map { index, row in
            let quote = direct && row.message.content.contains(text) ? text : memory?.sources[index].excerpt ?? text
            return ["sourceResource": "chat", "sourceRecordId": "parlor:\(row.message.conversationId):\(row.message.id)", "sourceUrl": NSNull(), "excerpt": quote,
                    "note": "Parlor sharing_persona=\(persona); original_persona=\(row.message.personaId ?? "user"); message_created_at=\(row.message.createdAt); message_seq=\(row.message.seq); source_hash=\(row.ref.hash); nature=\(nature.rawValue). Sharing consent is not factual confirmation."]
        }
        let key = AIContext.hash([persona, entity, predicate.trimmingCharacters(in: .whitespacesAndNewlines), text, memory?.id ?? "", String(memory?.version ?? 0), AIContext.hash(rows.map { [$0.message.id, String($0.message.seq), $0.ref.hash] })])
        if let existing = try documents("SELECT payload FROM ai_echo_shares WHERE account_id=? AND persona_id=? AND json_extract(payload,'$.draftKey')=? ORDER BY rowid DESC LIMIT 1", [account, persona, key], as: AIEchoShare.self).first, existing.payloadJSON != nil { return existing }
        let id = UUID().uuidString.lowercased(), fact: [String: Any] = ["subjectEntityId": entity, "predicate": predicate.trimmingCharacters(in: .whitespacesAndNewlines), "objectEntityId": NSNull(), "objectValue": text, "perspectiveEntityId": NSNull(), "epistemicType": epistemic, "supersedesFactId": NSNull(), "confidence": memory?.provenance?.confidence ?? (direct ? 1.0 : 0.5), "importance": importance, "validFrom": NSNull(), "validTo": NSNull()]
        var submission: [String: Any] = ["fact": fact, "sources": sources, "proposedBy": direct ? "user" : "model", "proposerModel": NSNull(), "reviewMode": "manual", "writtenBy": NSNull(), "requestId": id]
        if let model = memory?.provenance?.modelId { submission["proposerModel"] = model }
        let payload = try AIEcho.json(["protocol": AIEcho.protocolName, "submission": submission])
        let share = AIEchoShare(requestId: id, accountId: account, personaId: persona, conversationId: rows[0].message.conversationId, memoryId: memory?.id, memoryVersion: memory?.version, memoryHash: memory.map { AIContext.hash($0) }, sourceRefs: rows.map(\.ref), payloadJSON: payload, payloadHash: AIContext.hash(payload), draftKey: key, content: text, epistemicType: epistemic, status: "preview", createdAt: aiTimestamp(), updatedAt: aiTimestamp())
        try writeEchoShare(share); return share
    }
    func verifyEchoShare(_ share: AIEchoShare) throws {
        guard let payload = share.payloadJSON, AIContext.hash(payload) == share.payloadHash else { throw AIError.invalidContext }
        guard let body = try JSONSerialization.jsonObject(with: Data(payload.utf8)) as? [String: Any], body["protocol"] as? String == AIEcho.protocolName,
              let submission = body["submission"] as? [String: Any], submission["requestId"] as? String == share.requestId, submission["reviewMode"] as? String == "manual",
              let fact = submission["fact"] as? [String: Any], let content = share.content, fact["objectValue"] as? String == content,
              fact["epistemicType"] as? String == share.epistemicType, ["direct_statement", "agent_judgment", "derived"].contains(share.epistemicType),
              submission["proposedBy"] as? String == (share.epistemicType == "direct_statement" ? "user" : "model") else { throw AIError.invalidContext }
        if let id = share.memoryId {
            guard let latest = try memoryVersions(id, persona: share.personaId, account: share.accountId).first, latest.status == .active, latest.version == share.memoryVersion, AIContext.hash(latest) == share.memoryHash else { throw AIError.staleMemory }
            if share.epistemicType == "direct_statement", latest.nature != .userStatement { throw AIError.invalidContext }
        }
        let sources = submission["sources"] as? [[String: Any]] ?? []
        guard !sources.isEmpty, sources.count == share.sourceRefs.count else { throw AIError.invalidContext }
        var directQuote = false
        for (i, ref) in share.sourceRefs.enumerated() {
            guard let sourceId = sources[i]["sourceRecordId"] as? String, let quote = sources[i]["excerpt"] as? String else { throw AIError.invalidContext }
            let parts = sourceId.split(separator: ":"); guard parts.count == 3, parts[0] == "parlor", parts[2] == ref.id else { throw AIError.invalidContext }
            _ = try contextScope(String(parts[1]), persona: share.personaId, account: share.accountId)
            guard let row = try contextRecord(ref.id, conversation: String(parts[1]), account: share.accountId), row.ref.seq == ref.seq, row.ref.hash == ref.hash, try !isReplaced(ref.id, conversation: String(parts[1]), account: share.accountId), row.message.content.contains(quote) else { throw AIError.invalidContext }
            if share.epistemicType == "direct_statement" {
                guard row.message.role == "user" else { throw AIError.invalidContext }
                directQuote = directQuote || row.message.content.contains(content) && quote.contains(content)
            }
        }
        if share.epistemicType == "direct_statement", !directQuote { throw AIError.invalidContext }
    }
}
