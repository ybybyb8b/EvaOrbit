import Foundation
import CryptoKit
import SQLite3

extension AIStore {
    static let contextMigration = """
    BEGIN IMMEDIATE;
    CREATE TABLE IF NOT EXISTS ai_conversation_contexts(
      account_id TEXT NOT NULL,conversation_id TEXT NOT NULL,scope TEXT NOT NULL,version INTEGER NOT NULL,
      from_ordinal INTEGER NOT NULL CHECK(from_ordinal>=0),through_ordinal INTEGER NOT NULL CHECK(through_ordinal>=from_ordinal),status TEXT NOT NULL CHECK(status IN ('active','superseded','invalidated')),payload TEXT NOT NULL,
      PRIMARY KEY(account_id,conversation_id,scope,version),CHECK(version>0),
      CHECK(json_extract(payload,'$.accountId')=account_id AND json_extract(payload,'$.conversationId')=conversation_id AND json_extract(payload,'$.scope')=scope AND json_extract(payload,'$.version')=version AND json_extract(payload,'$.status')=status));
    CREATE TABLE IF NOT EXISTS ai_context_snapshots(
      account_id TEXT NOT NULL,id TEXT NOT NULL,conversation_id TEXT NOT NULL,persona_id TEXT NOT NULL,payload TEXT NOT NULL,
      PRIMARY KEY(account_id,id),CHECK(json_extract(payload,'$.accountId')=account_id AND json_extract(payload,'$.conversationId')=conversation_id AND json_extract(payload,'$.personaId')=persona_id AND json_extract(payload,'$.id')=id),
      CHECK(json_extract(payload,'$.kind')<>'conversation' OR json_array_length(payload,'$.memories')=0));
    CREATE UNIQUE INDEX IF NOT EXISTS ai_context_active ON ai_conversation_contexts(account_id,conversation_id,scope) WHERE status='active';
    CREATE INDEX IF NOT EXISTS ai_context_snapshot_conversation ON ai_context_snapshots(account_id,conversation_id,persona_id);
    CREATE INDEX IF NOT EXISTS ai_message_replacement ON ai_messages(account_id,conversation_id,json_extract(payload,'$.supersedesId'));
    CREATE INDEX IF NOT EXISTS ai_message_round ON ai_messages(account_id,conversation_id,json_extract(payload,'$.roundId'),ordinal);
    CREATE INDEX IF NOT EXISTS ai_message_role ON ai_messages(account_id,conversation_id,json_extract(payload,'$.role'),ordinal);
    CREATE TRIGGER IF NOT EXISTS ai_context_message_updated AFTER UPDATE ON ai_messages
    WHEN OLD.payload<>NEW.payload BEGIN
      UPDATE ai_conversation_contexts SET status='invalidated',payload=json_set(payload,'$.status','invalidated')
        WHERE account_id=OLD.account_id AND conversation_id=OLD.conversation_id AND from_ordinal<=OLD.ordinal AND through_ordinal>=OLD.ordinal;
      UPDATE ai_context_snapshots SET payload=json_set(payload,'$.invalidated',json('true'),'$.inputHash','')
        WHERE account_id=OLD.account_id AND conversation_id=OLD.conversation_id AND
          (json_extract(payload,'$.currentMessageId')=OLD.id OR EXISTS(SELECT 1 FROM json_each(ai_context_snapshots.payload,'$.messages') WHERE json_extract(value,'$.id')=OLD.id) OR
          json_extract(payload,'$.publicSnapshotId') IN (SELECT id FROM ai_context_snapshots s WHERE s.account_id=OLD.account_id AND s.conversation_id=OLD.conversation_id AND (json_extract(s.payload,'$.currentMessageId')=OLD.id OR EXISTS(SELECT 1 FROM json_each(s.payload,'$.messages') WHERE json_extract(value,'$.id')=OLD.id))));
    END;
    CREATE TRIGGER IF NOT EXISTS ai_context_message_deleted AFTER DELETE ON ai_messages BEGIN
      UPDATE ai_conversation_contexts SET status='invalidated',payload=json_set(payload,'$.status','invalidated')
        WHERE account_id=OLD.account_id AND conversation_id=OLD.conversation_id AND from_ordinal<=OLD.ordinal AND through_ordinal>=OLD.ordinal;
      UPDATE ai_context_snapshots SET payload=json_set(payload,'$.invalidated',json('true'),'$.inputHash','')
        WHERE account_id=OLD.account_id AND conversation_id=OLD.conversation_id AND
          (json_extract(payload,'$.currentMessageId')=OLD.id OR EXISTS(SELECT 1 FROM json_each(ai_context_snapshots.payload,'$.messages') WHERE json_extract(value,'$.id')=OLD.id) OR
          json_extract(payload,'$.publicSnapshotId') IN (SELECT id FROM ai_context_snapshots s WHERE s.account_id=OLD.account_id AND s.conversation_id=OLD.conversation_id AND (json_extract(s.payload,'$.currentMessageId')=OLD.id OR EXISTS(SELECT 1 FROM json_each(s.payload,'$.messages') WHERE json_extract(value,'$.id')=OLD.id))));
    END;
    CREATE TRIGGER IF NOT EXISTS ai_context_message_replaced AFTER INSERT ON ai_messages
    WHEN json_extract(NEW.payload,'$.supersedesId') IS NOT NULL BEGIN
      UPDATE ai_conversation_contexts SET status='invalidated',payload=json_set(payload,'$.status','invalidated')
        WHERE account_id=NEW.account_id AND conversation_id=NEW.conversation_id AND
          through_ordinal>=(SELECT ordinal FROM ai_messages WHERE account_id=NEW.account_id AND id=json_extract(NEW.payload,'$.supersedesId')) AND
          from_ordinal<=(SELECT ordinal FROM ai_messages WHERE account_id=NEW.account_id AND id=json_extract(NEW.payload,'$.supersedesId'));
    END;
    CREATE TRIGGER IF NOT EXISTS ai_context_summary_invalidated AFTER UPDATE ON ai_conversation_contexts
    WHEN NEW.status<>'active' BEGIN
      UPDATE ai_context_snapshots SET payload=json_set(payload,'$.invalidated',json('true'),'$.inputHash','')
        WHERE account_id=NEW.account_id AND conversation_id=NEW.conversation_id AND
          (id IN (SELECT id FROM ai_context_snapshots WHERE account_id=NEW.account_id AND conversation_id=NEW.conversation_id AND
            json_extract(payload,'$.summary.scope')=NEW.scope AND json_extract(payload,'$.summary.version')=NEW.version) OR
          json_extract(payload,'$.publicSnapshotId') IN (SELECT id FROM ai_context_snapshots WHERE account_id=NEW.account_id AND conversation_id=NEW.conversation_id AND
            json_extract(payload,'$.summary.scope')=NEW.scope AND json_extract(payload,'$.summary.version')=NEW.version));
    END;
    CREATE TRIGGER IF NOT EXISTS ai_context_memory_withdrawn AFTER UPDATE ON ai_persona_memories
    WHEN NEW.status<>'active' BEGIN
      UPDATE ai_context_snapshots SET payload=json_set(payload,'$.invalidated',json('true'),'$.inputHash','',
          '$.memories',json(COALESCE((SELECT json_group_array(json(value)) FROM json_each(ai_context_snapshots.payload,'$.memories')
            WHERE NOT(json_extract(value,'$.id')=NEW.id AND json_extract(value,'$.version')=NEW.version)),'[]')))
        WHERE account_id=NEW.account_id AND persona_id=NEW.persona_id AND EXISTS(
          SELECT 1 FROM json_each(ai_context_snapshots.payload,'$.memories') WHERE json_extract(value,'$.id')=NEW.id AND json_extract(value,'$.version')=NEW.version);
    END;
    PRAGMA user_version=7;
    COMMIT;
    """

    static let eligibleContextSQL = """
      (json_extract(m.payload,'$.role')='user' OR
        (json_extract(m.payload,'$.role')='assistant' AND json_extract(m.payload,'$.status')<>'streaming' AND length(json_extract(m.payload,'$.content'))>0)) AND
      NOT EXISTS(SELECT 1 FROM ai_messages replacement WHERE replacement.account_id=m.account_id AND replacement.conversation_id=m.conversation_id AND json_extract(replacement.payload,'$.supersedesId')=m.id)
    """
    static let contextSelect = """
    SELECT m.ordinal,m.payload,CASE
      WHEN json_extract(m.payload,'$.roundId') IS NOT NULL THEN
        (SELECT MIN(u.ordinal) FROM ai_messages u WHERE u.account_id=m.account_id AND u.conversation_id=m.conversation_id AND json_extract(u.payload,'$.roundId')=json_extract(m.payload,'$.roundId'))
      WHEN json_extract(m.payload,'$.role')='user' THEN m.ordinal
      ELSE COALESCE((SELECT u.ordinal FROM ai_messages u WHERE u.account_id=m.account_id AND u.id=json_extract(m.payload,'$.replyToMessageId')),
        (SELECT MAX(u.ordinal) FROM ai_messages u WHERE u.account_id=m.account_id AND u.conversation_id=m.conversation_id AND u.ordinal<=m.ordinal AND json_extract(u.payload,'$.role')='user'),m.ordinal)
      END
    FROM ai_messages m
    """

    func contextRecords(_ sql: String, _ values: [String], byteLimit: Int = Int.max) throws -> ([AIContextRecord], Bool) {
        let query = try statement(sql, values); defer { sqlite3_finalize(query) }
        var result: [AIContextRecord] = [], bytes = 0, bounded = false
        while true {
            let step = sqlite3_step(query)
            if step == SQLITE_DONE { break }
            guard step == SQLITE_ROW, let raw = sqlite3_column_text(query, 1) else { throw AIError.storage }
            let data = Data(String(cString: raw).utf8)
            if !result.isEmpty && bytes + data.count > byteLimit { bounded = true; break }
            var message = try JSONDecoder().decode(AIMessage.self, from: data)
            let ordinal = sqlite3_column_int64(query, 0); message.ordinal = ordinal
            result.append(.init(ordinal: ordinal, unitOrdinal: sqlite3_column_int64(query, 2), message: message)); bytes += data.count
        }
        return (result, bounded)
    }
    func messageCount(_ conversation: String, account: String, eligible: Bool = false) throws -> Int {
        let query = try statement("SELECT COUNT(*) FROM ai_messages m WHERE m.account_id=? AND m.conversation_id=?" + (eligible ? " AND " + Self.eligibleContextSQL : ""), [account, conversation])
        defer { sqlite3_finalize(query) }; guard sqlite3_step(query) == SQLITE_ROW else { throw AIError.storage }
        return Int(sqlite3_column_int64(query, 0))
    }
    func messageWatermark(_ conversation: String, account: String) throws -> Int64 {
        let query = try statement("SELECT COALESCE(MAX(ordinal),0) FROM ai_messages WHERE account_id=? AND conversation_id=?", [account, conversation])
        defer { sqlite3_finalize(query) }; guard sqlite3_step(query) == SQLITE_ROW else { throw AIError.storage }
        return sqlite3_column_int64(query, 0)
    }
    func messagePage(_ conversation: String, account: String, before: Int64? = nil, limit: Int = 100, eligible: Bool = false, watermark: Int64? = nil) throws -> AIMessagePage {
        guard (1...200).contains(limit), before == nil || before! > 0 else { throw AIError.invalid }
        let upper = try watermark ?? messageWatermark(conversation, account: account)
        let (rows, bounded) = try contextRecords(Self.contextSelect + " WHERE m.account_id=? AND m.conversation_id=? AND m.ordinal<? AND m.ordinal<=?" + (eligible ? " AND " + Self.eligibleContextSQL : "") + " ORDER BY m.ordinal DESC LIMIT ?", [account, conversation, String(before ?? Int64.max), String(upper), String(limit + 1)], byteLimit: 4 * 1024 * 1024)
        let more = bounded || rows.count > limit
        let selected = Array(rows.prefix(limit)).reversed()
        return .init(records: Array(selected), hasMore: more, before: more ? selected.first?.ordinal : nil, watermark: upper, total: try messageCount(conversation, account: account, eligible: eligible))
    }
    func contextRecord(_ id: String, conversation: String, account: String) throws -> AIContextRecord? {
        try contextRecords(Self.contextSelect + " WHERE m.account_id=? AND m.conversation_id=? AND m.id=?", [account, conversation, id]).0.first
    }
    func requestMessage(_ id: String, conversation: String, account: String) throws -> AIMessage? {
        try documents("SELECT payload FROM ai_messages WHERE account_id=? AND conversation_id=? AND json_extract(payload,'$.requestId')=? LIMIT 1", [account, conversation, id], as: AIMessage.self).first
    }
    func lastUserMessage(_ conversation: String, account: String) throws -> AIMessage? {
        try documents("SELECT payload FROM ai_messages WHERE account_id=? AND conversation_id=? AND json_extract(payload,'$.role')='user' ORDER BY ordinal DESC LIMIT 1", [account, conversation], as: AIMessage.self).first
    }
    func roundReplies(_ round: String, conversation: String, account: String) throws -> [AIMessage] {
        try documents("SELECT payload FROM ai_messages WHERE account_id=? AND conversation_id=? AND json_extract(payload,'$.roundId')=? AND json_extract(payload,'$.role')='assistant' ORDER BY ordinal", [account, conversation, round], as: AIMessage.self)
    }
    func contextVersions(_ conversation: String, scope: String, account: String) throws -> [AIConversationContext] {
        try documents("SELECT payload FROM ai_conversation_contexts WHERE account_id=? AND conversation_id=? AND scope=? ORDER BY version DESC LIMIT 20", [account, conversation, scope], as: AIConversationContext.self)
    }
    func isReplaced(_ id: String, conversation: String, account: String) throws -> Bool {
        let query = try statement("SELECT 1 FROM ai_messages WHERE account_id=? AND conversation_id=? AND json_extract(payload,'$.supersedesId')=? LIMIT 1", [account, conversation, id])
        defer { sqlite3_finalize(query) }
        let result = sqlite3_step(query)
        guard result == SQLITE_ROW || result == SQLITE_DONE else { throw AIError.storage }
        return result == SQLITE_ROW
    }
    func contextHistory(_ conversation: String, account: String, tokenLimit: Int) throws -> AIContextHistory {
        var records: [AIContextRecord] = [], before: Int64?, cost = 0, bytes = 0, more = false
        let watermark = try messageWatermark(conversation, account: account)
        repeat {
            let page = try messagePage(conversation, account: account, before: before, eligible: true, watermark: watermark)
            records = page.records + records; more = page.hasMore; before = page.before
            for row in page.records {
                let n = AIContext.tokens([row.rendered])
                if n <= tokenLimit { cost += n }
                bytes += row.message.content.utf8.count
            }
        } while more && cost < tokenLimit * 2 && bytes < 4 * 1024 * 1024 && records.count < 8192
        // Finish boundary units (including a regenerated reply anchored to an older round).
        for unit in Dictionary(grouping: records, by: \.unitOrdinal).values where !unit.contains(where: { $0.ordinal == $0.unitOrdinal }) {
            guard let sample = unit.first else { continue }
            let extra: [AIContextRecord]
            if let round = sample.message.roundId {
                extra = try contextRecords(Self.contextSelect + " WHERE m.account_id=? AND m.conversation_id=? AND json_extract(m.payload,'$.roundId')=? AND " + Self.eligibleContextSQL + " ORDER BY m.ordinal", [account, conversation, round]).0
            } else {
                extra = try contextRecords(Self.contextSelect + " WHERE m.account_id=? AND m.conversation_id=? AND m.ordinal>=? AND m.ordinal<COALESCE((SELECT MIN(ordinal) FROM ai_messages WHERE account_id=? AND conversation_id=? AND ordinal>? AND json_extract(payload,'$.role')='user'),9223372036854775807) AND json_extract(m.payload,'$.roundId') IS NULL AND " + Self.eligibleContextSQL + " ORDER BY m.ordinal", [account, conversation, String(sample.unitOrdinal), account, conversation, String(sample.unitOrdinal)]).0
            }
            let extraBytes = extra.reduce(0) { $0 + $1.message.content.utf8.count }
            records.removeAll { $0.unitOrdinal == sample.unitOrdinal }
            if extraBytes < 4 * 1024 * 1024 { records += extra } else { more = true }
        }
        records = Dictionary(grouping: records, by: { $0.message.id }).compactMap { $0.value.first }.sorted { $0.ordinal < $1.ordinal }
        return .init(records: records, total: try messageCount(conversation, account: account, eligible: true), watermark: watermark, truncated: more)
    }
    func contextScope(_ conversation: String, persona: String, account: String) throws -> String {
        try requirePersona(persona, account: account)
        if try isGroup(conversation, account: account) {
            guard try groups(account).contains(where: { $0.id == conversation && $0.participants.contains(where: { $0.id == persona }) }) else { throw AIError.ownership }
            return "public"
        }
        let owner = try statement("SELECT 1 FROM ai_conversation_owners WHERE account_id=? AND conversation_id=? AND kind='single' AND persona_id=?", [account, conversation, persona])
        defer { sqlite3_finalize(owner) }
        guard sqlite3_step(owner) == SQLITE_ROW else { throw AIError.ownership }
        return persona
    }
    func conversationContext(_ conversation: String, scope: String, account: String, version: Int? = nil) throws -> AIConversationContext? {
        try documents("SELECT payload FROM ai_conversation_contexts WHERE account_id=? AND conversation_id=? AND scope=?" + (version == nil ? " ORDER BY version DESC LIMIT 1" : " AND version=?"), [account, conversation, scope] + (version.map { [String($0)] } ?? []), as: AIConversationContext.self).first
    }
    func contextSourceSignature(_ conversation: String, account: String, from: Int64, through: Int64) throws -> (String, Int, String?, String?) {
        let query = try statement(Self.contextSelect + " WHERE m.account_id=? AND m.conversation_id=? AND m.ordinal>=? AND m.ordinal<=? AND " + Self.eligibleContextSQL + " ORDER BY m.ordinal", [account, conversation, String(from), String(through)])
        defer { sqlite3_finalize(query) }
        var digest = SHA256(), count = 0, first: String?, last: String?
        while true {
            if count % 128 == 0 { try Task.checkCancellation() }
            let step = sqlite3_step(query)
            if step == SQLITE_DONE { break }
            guard step == SQLITE_ROW else { throw AIError.storage }
            guard let raw = sqlite3_column_text(query, 1) else { throw AIError.storage }
            let message = try JSONDecoder().decode(AIMessage.self, from: Data(String(cString: raw).utf8))
            let record = AIContextRecord(ordinal: sqlite3_column_int64(query, 0), unitOrdinal: sqlite3_column_int64(query, 2), message: message)
            digest.update(data: Data(AIContext.hash([message.id, String(message.seq), record.ref.hash]).utf8)); count += 1
            if first == nil { first = message.id }; last = message.id
        }
        return (digest.finalize().map { String(format: "%02x", $0) }.joined(), count, first, last)
    }
    func saveConversationContext(_ conversation: String, persona: String, account: String, content: String, unresolved: [String], throughMessageId: String?, recentLimit: Int, expectedVersion: Int, transaction: Bool = true, processingJob: AIMemoryJob? = nil) throws -> AIConversationContext {
        let scope = try contextScope(conversation, persona: persona, account: account)
        let old = try conversationContext(conversation, scope: scope, account: account)
        guard (old?.version ?? 0) == expectedVersion else { throw AIError.staleMemory }
        guard content.utf8.count <= 32000, !content.contains("\0"), unresolved.count <= 32,
              unresolved.allSatisfy({ !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && $0.utf8.count <= 1000 && !$0.contains("\0") }), (0...5000).contains(recentLimit) else { throw AIError.invalid }
        var through: Int64 = 0
        if let id = throughMessageId {
            guard let record = try contextRecord(id, conversation: conversation, account: account), record.message.status != "streaming" else { throw AIError.invalidContext }
            through = record.ordinal
            if let round = record.message.roundId {
                let later = try statement("SELECT 1 FROM ai_messages WHERE account_id=? AND conversation_id=? AND ordinal>? AND json_extract(payload,'$.roundId')=? LIMIT 1", [account, conversation, String(through), round])
                defer { sqlite3_finalize(later) }
                guard sqlite3_step(later) == SQLITE_DONE else { throw AIError.invalidContext }
            }
            let following = try contextRecords(Self.contextSelect + " WHERE m.account_id=? AND m.conversation_id=? AND m.ordinal>? ORDER BY m.ordinal LIMIT 1", [account, conversation, String(through)]).0.first
            guard following == nil || following?.unitOrdinal != record.unitOrdinal else { throw AIError.invalidContext }
        }
        guard content.isEmpty || through > 0 else { throw AIError.invalidContext }
        if through > 0 {
            let streaming = try statement("SELECT 1 FROM ai_messages WHERE account_id=? AND conversation_id=? AND ordinal<=? AND status='streaming' LIMIT 1", [account, conversation, String(through)])
            defer { sqlite3_finalize(streaming) }
            guard sqlite3_step(streaming) == SQLITE_DONE else { throw AIError.invalidContext }
        }
        let signature = try contextSourceSignature(conversation, account: account, from: 1, through: content.isEmpty ? 0 : through)
        var value = AIConversationContext(accountId: account, conversationId: conversation, scope: scope, version: expectedVersion + 1, content: content, unresolved: unresolved, fromOrdinal: content.isEmpty ? 0 : 1, throughOrdinal: content.isEmpty ? 0 : through, firstMessageId: signature.2, throughMessageId: content.isEmpty ? nil : throughMessageId, sourceCount: signature.1, sourceHash: signature.0, contentHash: "", updatedAt: aiTimestamp(), status: "active", recentMessageLimit: recentLimit)
        value.processingTaskId = processingJob?.id; value.processingInputHash = processingJob?.inputHash; value.processingProviderId = processingJob?.provider.id; value.processingModelId = processingJob?.model.id
        value.contentHash = value.semanticHash
        if transaction { try execute("BEGIN IMMEDIATE") }
        do {
            try execute("UPDATE ai_conversation_contexts SET status='superseded',payload=json_set(payload,'$.status','superseded') WHERE account_id=? AND conversation_id=? AND scope=? AND status='active'", [account, conversation, scope])
            try insertConversationContext(value)
            if transaction { try execute("COMMIT") }
        } catch { if transaction { try? execute("ROLLBACK") }; throw error }
        return value
    }
    func insertConversationContext(_ value: AIConversationContext) throws {
        try execute("INSERT INTO ai_conversation_contexts VALUES(?,?,?,?,?,?,?,?)", [value.accountId, value.conversationId, value.scope, String(value.version), String(value.fromOrdinal), String(value.throughOrdinal), value.status, try encoded(value)])
    }
    func insertContextPlan(_ plan: AIContextPlan) throws {
        for value in [plan.shared] + Array(plan.generations.values) {
            try execute("INSERT INTO ai_context_snapshots VALUES(?,?,?,?,?) ON CONFLICT(account_id,id) DO NOTHING", [value.accountId, value.id, value.conversationId, value.personaId, try encoded(value)])
        }
    }
    func contextSnapshot(_ id: String, conversation: String, account: String) throws -> AIContextSnapshot? {
        try documents("SELECT payload FROM ai_context_snapshots WHERE account_id=? AND conversation_id=? AND id=?", [account, conversation, id], as: AIContextSnapshot.self).first
    }
    func makeContextPlan(account: String, conversation: String, group: Bool, members: [AIGroupMember], tail: String, currentMessageId: String?, instruction: String?, query: String, echo: AIEchoSnapshot? = nil) throws -> AIContextPlan {
        var notices: [String] = []
        var authorizedEcho: AIEchoSnapshot?
        if (try? echoConfig(account).readEnabled) == true {
            if let echo, echo.accountId == account, let stored = try? echoSnapshot(echo.id, account: account), stored.hash == echo.hash {
                authorizedEcho = stored
            }
            if authorizedEcho?.message == nil { notices.append("echo_unavailable") }
        }
        let limit = try members.map { try AIContext.budget($0.model, persona: $0.persona, tail: tail).inputLimit }.min() ?? 8192
        var history: AIContextHistory
        do { history = try contextHistory(conversation, account: account, tokenLimit: limit) }
        catch { history = .init(records: [], total: (try? messageCount(conversation, account: account)) ?? 0, watermark: 0, truncated: true); notices.append("history_read_failed") }
        if instruction != nil, let currentMessageId, let record = try? contextRecord(currentMessageId, conversation: conversation, account: account) {
            history.excludedCurrentOrdinal = record.ordinal
            history.records.removeAll { $0.message.id == currentMessageId }; history.total = max(0, history.total - 1)
        }
        let scope = group ? "public" : members[0].persona.id
        let summary: AIConversationContext?
        do { let value = try conversationContext(conversation, scope: scope, account: account); summary = value?.status == "active" ? value : nil; if value != nil && summary == nil { notices.append("summary_invalidated") } }
        catch { summary = nil; notices.append("summary_read_failed") }
        let participants = members.map { member -> AIContextParticipant in
            let memories: [AIPersonaMemory]
            do { memories = try self.memories(persona: member.persona.id, account: account) } catch { memories = []; notices.append("memory_read_failed") }
            return .init(persona: member.persona, providerId: member.provider.id, model: member.model, memories: memories)
        }
        return try AIContext.assemble(account: account, conversation: conversation, group: group, history: history, summary: summary, participants: participants, tail: tail, currentMessageId: currentMessageId, instruction: instruction, query: query, notices: notices, echo: authorizedEcho)
    }

    func replayContext(account: String, round: AIGroupRound, original: AIMessage, member: AIGroupMember) throws -> AIContextPlan {
        let previous = try original.contextSnapshotId.flatMap { try contextSnapshot($0, conversation: round.conversationId, account: account) }
        guard previous == nil || previous?.personaId == member.persona.id else { throw AIError.invalidContext }
        guard let publicID = previous?.publicSnapshotId ?? round.publicContextId,
              var shared = try contextSnapshot(publicID, conversation: round.conversationId, account: account) else {
            // Legacy rounds stored text. Resolve matching original records without resurrecting replacements.
            let raw = try contextRecords(Self.contextSelect + " WHERE m.account_id=? AND m.conversation_id=? ORDER BY m.ordinal", [account, round.conversationId]).0
            let tail = round.context.last?["content"] ?? round.content
            var selected: [AIContextRecord] = []
            for message in round.context.dropLast() {
                if let record = raw.first(where: { record in
                    let old = ["role": record.message.role, "content": record.message.role == "assistant" ? "[\(record.message.personaName ?? "Assistant")\(record.message.status == "done" ? "" : " · incomplete")] \(record.message.content)" : record.message.content]
                    return old == message
                }), try !isReplaced(record.message.id, conversation: round.conversationId, account: account) { selected.append(record) }
            }
            let participant = AIContextParticipant(persona: member.persona, providerId: member.provider.id, model: member.model, memories: [])
            return try AIContext.assemble(account: account, conversation: round.conversationId, group: true, history: .init(records: selected, total: selected.count, watermark: selected.map(\.ordinal).max() ?? 0, truncated: true), summary: nil, participants: [participant], tail: tail, currentMessageId: nil, instruction: tail, query: round.content, notices: ["legacy_text_snapshot"])
        }
        guard shared.kind == "conversation", shared.personaId == "public" else { throw AIError.invalidContext }
        var records: [AIContextRecord] = [], invalidUnits = Set<Int64>(), changed = shared.invalidated, missingRecord = false
        for ref in shared.messages {
            guard let record = try contextRecord(ref.id, conversation: round.conversationId, account: account) else { changed = true; missingRecord = true; continue }
            let replaced = try isReplaced(ref.id, conversation: round.conversationId, account: account)
            if record.message.seq != ref.seq || record.ref.hash != ref.hash || replaced { invalidUnits.insert(record.unitOrdinal); changed = true }
            records.append(record)
        }
        records.removeAll { invalidUnits.contains($0.unitOrdinal) }
        if missingRecord { records = [] }
        var common: [[String: String]] = []
        if let ref = shared.summary, let value = try conversationContext(round.conversationId, scope: ref.scope, account: account, version: ref.version), value.status == "active", value.contentHash == ref.hash {
            if shared.summaryIncluded == true { common.append(AIContext.dataMessage("conversation_summary", ["version": String(value.version), "content": value.content, "sourceHash": value.sourceHash])) }
            let topics = (shared.unresolvedIndices ?? []).compactMap { value.unresolved.indices.contains($0) ? value.unresolved[$0] : nil }
            if !topics.isEmpty { common.append(AIContext.dataMessage("unresolved", topics)) }
        } else if shared.summary != nil { shared.summary = nil; shared.summaryIncluded = false; shared.unresolvedIndices = []; changed = true }
        if let ref = shared.echo {
            if (try? echoConfig(account).readEnabled) == true, let snapshot = try? echoSnapshot(ref.id, account: account), snapshot.hash == ref.hash, let message = snapshot.message { common.insert(message, at: 0) }
            else { shared.echo = nil; changed = true }
        }
        common += records.map(\.rendered)
        let tail: String
        if let id = shared.currentMessageId, let record = try contextRecord(id, conversation: round.conversationId, account: account) {
            tail = shared.instruction.map { AIContext.discussionTail(user: record.message.content, instruction: $0) } ?? record.message.content
        }
        else if let instruction = shared.instruction { tail = instruction }
        else { throw AIError.invalidContext }
        let tailMessage = ["role": "user", "content": tail]
        guard shared.currentMessageHash == nil || shared.currentMessageHash == AIContext.hash(tailMessage) else { throw AIError.invalidContext }
        common.append(tailMessage)
        if shared.inputHash != AIContext.hash(common) { changed = true }
        if changed {
            shared.id = UUID().uuidString; shared.messages = records.map(\.ref); shared.inputHash = AIContext.hash(common); shared.invalidated = false
            shared.budget.publicTokens = AIContext.tokens(common); shared.budget.estimatedInputTokens = AIContext.tokens(common)
            shared.coverage.includedMessages = records.count; shared.coverage.notices.append("frozen_context_degraded")
            if shared.summary == nil { shared.coverage.summarizedThrough = 0 }
        }
        let active = (try? memories(persona: member.persona.id, account: account)) ?? []
        let memories = (previous?.memories ?? []).compactMap { ref in active.first { $0.id == ref.id && $0.version == ref.version && $0.expiredAt == nil && $0.visibility == .allChats && AIContext.hash(AIContext.memoryMessage([$0])) == ref.hash } }
        return try AIContext.replay(shared: shared, common: common, previous: previous, participant: .init(persona: member.persona, providerId: member.provider.id, model: member.model, memories: memories), memories: memories)
    }
}
