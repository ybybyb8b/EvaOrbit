import Foundation
import SQLite3

extension AIStore {
    static let processingMigration = """
    BEGIN IMMEDIATE;
    CREATE TABLE IF NOT EXISTS ai_memory_processing_config(account_id TEXT NOT NULL,persona_id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(account_id,persona_id),CHECK(json_extract(payload,'$.accountId')=account_id AND json_extract(payload,'$.personaId')=persona_id));
    CREATE TABLE IF NOT EXISTS ai_memory_jobs(account_id TEXT NOT NULL,persona_id TEXT NOT NULL,conversation_id TEXT NOT NULL,id TEXT NOT NULL,input_hash TEXT NOT NULL,status TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(account_id,id),UNIQUE(account_id,persona_id,conversation_id,input_hash),CHECK(json_extract(payload,'$.accountId')=account_id AND json_extract(payload,'$.personaId')=persona_id AND json_extract(payload,'$.conversationId')=conversation_id AND json_extract(payload,'$.id')=id AND json_extract(payload,'$.status')=status AND json_extract(payload,'$.inputHash')=input_hash));
    CREATE TABLE IF NOT EXISTS ai_memory_proposals(account_id TEXT NOT NULL,persona_id TEXT NOT NULL,conversation_id TEXT NOT NULL,id TEXT NOT NULL,task_id TEXT NOT NULL,status TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(account_id,id),CHECK(json_extract(payload,'$.accountId')=account_id AND json_extract(payload,'$.personaId')=persona_id AND json_extract(payload,'$.conversationId')=conversation_id AND json_extract(payload,'$.id')=id AND json_extract(payload,'$.taskId')=task_id AND json_extract(payload,'$.status')=status));
    CREATE INDEX IF NOT EXISTS ai_memory_job_scope ON ai_memory_jobs(account_id,persona_id,conversation_id,status);
    CREATE INDEX IF NOT EXISTS ai_memory_proposal_scope ON ai_memory_proposals(account_id,persona_id,status,task_id);
    CREATE TRIGGER IF NOT EXISTS ai_memory_processing_source_changed AFTER UPDATE ON ai_messages WHEN OLD.payload<>NEW.payload BEGIN
      UPDATE ai_memory_jobs SET status='stale',payload=json_set(payload,'$.status','stale','$.error','Source changed; explicit processing required.') WHERE account_id=OLD.account_id AND conversation_id=OLD.conversation_id AND EXISTS(SELECT 1 FROM json_each(ai_memory_jobs.payload,'$.messages') WHERE json_extract(value,'$.id')=OLD.id);
      UPDATE ai_memory_proposals SET status='invalidated',payload=json_set(payload,'$.status','invalidated') WHERE account_id=OLD.account_id AND status='pending' AND task_id IN (SELECT id FROM ai_memory_jobs WHERE account_id=OLD.account_id AND conversation_id=OLD.conversation_id AND status='stale');
    END;
    CREATE TRIGGER IF NOT EXISTS ai_memory_processing_source_deleted AFTER DELETE ON ai_messages BEGIN
      UPDATE ai_memory_jobs SET status='stale',payload=json_set(payload,'$.status','stale','$.error','Source deleted.') WHERE account_id=OLD.account_id AND conversation_id=OLD.conversation_id AND EXISTS(SELECT 1 FROM json_each(ai_memory_jobs.payload,'$.messages') WHERE json_extract(value,'$.id')=OLD.id);
      UPDATE ai_memory_proposals SET status='invalidated',payload=json_set(payload,'$.status','invalidated') WHERE account_id=OLD.account_id AND status='pending' AND task_id IN (SELECT id FROM ai_memory_jobs WHERE account_id=OLD.account_id AND conversation_id=OLD.conversation_id AND status='stale');
    END;
    CREATE TRIGGER IF NOT EXISTS ai_memory_processing_replaced AFTER INSERT ON ai_messages WHEN json_extract(NEW.payload,'$.supersedesId') IS NOT NULL BEGIN
      UPDATE ai_memory_jobs SET status='stale',payload=json_set(payload,'$.status','stale','$.error','Source replaced; explicit processing required.') WHERE account_id=NEW.account_id AND conversation_id=NEW.conversation_id AND EXISTS(SELECT 1 FROM json_each(ai_memory_jobs.payload,'$.messages') WHERE json_extract(value,'$.id')=json_extract(NEW.payload,'$.supersedesId'));
      UPDATE ai_memory_proposals SET status='invalidated',payload=json_set(payload,'$.status','invalidated') WHERE account_id=NEW.account_id AND status='pending' AND task_id IN (SELECT id FROM ai_memory_jobs WHERE account_id=NEW.account_id AND conversation_id=NEW.conversation_id AND status='stale');
    END;
    CREATE TRIGGER IF NOT EXISTS ai_memory_processing_forgotten AFTER UPDATE ON ai_persona_memories WHEN NEW.status='deleted' BEGIN
      UPDATE ai_memory_jobs SET status='stale',payload=json_set(json_remove(payload,'$.result'),'$.status','stale','$.error','Memory forgotten; cached processing was withdrawn.') WHERE account_id=NEW.account_id AND persona_id=NEW.persona_id AND status IN ('queued','running','failed','interrupted','cancelled');
      UPDATE ai_memory_jobs SET payload=json_remove(payload,'$.result') WHERE account_id=NEW.account_id AND persona_id=NEW.persona_id AND id IN (SELECT task_id FROM ai_memory_proposals WHERE account_id=NEW.account_id AND persona_id=NEW.persona_id AND (json_extract(payload,'$.acceptedMemoryId')=NEW.id OR json_extract(payload,'$.targetId')=NEW.id));
      UPDATE ai_memory_proposals SET status='deleted',payload=json_set(json_remove(payload,'$.memory'),'$.status','deleted','$.reason','Memory forgotten') WHERE account_id=NEW.account_id AND persona_id=NEW.persona_id AND (json_extract(payload,'$.acceptedMemoryId')=NEW.id OR json_extract(payload,'$.targetId')=NEW.id);
    END;
    PRAGMA user_version=8;
    COMMIT;
    """
    static let processingEligibleSQL = """
    json_extract(m.payload,'$.status')<>'streaming' AND NOT EXISTS(SELECT 1 FROM ai_messages r WHERE r.account_id=m.account_id AND r.conversation_id=m.conversation_id AND json_extract(r.payload,'$.supersedesId')=m.id)
    """
    static let processingRecovery = """
    UPDATE ai_memory_jobs SET status='interrupted',payload=json_set(payload,'$.status','interrupted','$.error','The App closed. No inference was automatically retried.') WHERE status IN ('queued','running');
    """
    func processingConfig(persona: String, account: String) throws -> AIMemoryProcessingConfig {
        try requirePersona(persona, account: account)
        return try documents("SELECT payload FROM ai_memory_processing_config WHERE account_id=? AND persona_id=?", [account, persona], as: AIMemoryProcessingConfig.self).first ?? .init(accountId: account, personaId: persona)
    }
    func saveProcessingConfig(_ config: AIMemoryProcessingConfig, account: String) throws {
        try requirePersona(config.personaId, account: account); try config.validate()
        guard config.accountId == account else { throw AIError.ownership }
        if config.modelMode == "dedicated" { guard try providers(account).contains(where: { $0.id == config.providerId && $0.enabled && $0.models.contains(where: { $0.id == config.modelId }) }) else { throw AIError.invalid } }
        try execute("INSERT INTO ai_memory_processing_config VALUES(?,?,?) ON CONFLICT(account_id,persona_id) DO UPDATE SET payload=excluded.payload", [account, config.personaId, try encoded(config)])
    }
    func processingJobs(persona: String, account: String, all: Bool = false) throws -> [AIMemoryJob] {
        try requirePersona(persona, account: account)
        return try documents("SELECT payload FROM ai_memory_jobs WHERE account_id=? AND persona_id=? ORDER BY rowid DESC" + (all ? "" : " LIMIT 50"), [account, persona], as: AIMemoryJob.self)
    }
    func processingJob(_ id: String, persona: String, account: String) throws -> AIMemoryJob {
        try requirePersona(persona, account: account)
        guard let value = try documents("SELECT payload FROM ai_memory_jobs WHERE account_id=? AND persona_id=? AND id=?", [account, persona, id], as: AIMemoryJob.self).first else { throw AIError.invalid }
        return value
    }
    func processingProposals(persona: String, account: String) throws -> [AIMemoryProposal] {
        try requirePersona(persona, account: account)
        return try documents("SELECT payload FROM ai_memory_proposals WHERE account_id=? AND persona_id=? ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END,rowid DESC LIMIT 200", [account, persona], as: AIMemoryProposal.self)
    }
    func writeJob(_ value: AIMemoryJob) throws {
        try execute("INSERT INTO ai_memory_jobs VALUES(?,?,?,?,?,?,?) ON CONFLICT(account_id,id) DO UPDATE SET status=excluded.status,payload=excluded.payload", [value.accountId, value.personaId, value.conversationId, value.id, value.inputHash, value.status, try encoded(value)])
    }
    func writeProposal(_ value: AIMemoryProposal) throws {
        try execute("INSERT INTO ai_memory_proposals VALUES(?,?,?,?,?,?,?) ON CONFLICT(account_id,id) DO UPDATE SET status=excluded.status,payload=excluded.payload", [value.accountId, value.personaId, value.conversationId, value.id, value.taskId, value.status, try encoded(value)])
    }
    func processingRecords(_ job: AIMemoryJob) throws -> [AIContextRecord] {
        _ = try contextScope(job.conversationId, persona: job.personaId, account: job.accountId)
        return try job.messages.map { ref in
            guard let row = try contextRecord(ref.id, conversation: job.conversationId, account: job.accountId), row.ref.seq == ref.seq, row.ref.hash == ref.hash,
                  row.message.status != "streaming", try !isReplaced(ref.id, conversation: job.conversationId, account: job.accountId) else { throw AIError.invalidContext }
            return row
        }
    }
    func previousProcessingSummary(_ job: AIMemoryJob) throws -> AIConversationContext? {
        guard let ref = job.previousSummary else { return nil }
        guard let value = try conversationContext(job.conversationId, scope: ref.scope, account: job.accountId, version: ref.version), value.contentHash == ref.hash,
              value.status != "invalidated" else { throw AIError.invalidContext }
        return value
    }
    func prepareProcessing(account: String, persona: String, conversation: String, trigger: String) throws -> AIMemoryJob? {
        let scope = try contextScope(conversation, persona: persona, account: account), config = try processingConfig(persona: persona, account: account)
        try config.validate()
        guard ["manual", "threshold", "end"].contains(trigger) else { throw AIError.invalid }
        if trigger != "manual" && (!config.automatic || trigger == "end" && !config.onConversationEnd) { return nil }
        let people = try personas(account), group = try groups(account).first { $0.id == conversation }
        guard let person = (group?.participants ?? people).first(where: { $0.id == persona }) else { throw AIError.ownership }
        let choice = try conversationModels(conversation, account: account).first { $0.personaId == persona }
        let binding: (String, String)?
        if config.modelMode == "dedicated", let provider = config.providerId, let model = config.modelId { binding = (provider, model) }
        else if let choice { binding = (choice.providerId, choice.modelId) }
        else if let provider = person.providerId, let model = person.modelId { binding = (provider, model) }
        else {
            // The selected persona's own last actual model is stronger evidence than an implicit first-provider fallback.
            let last = try documents("SELECT payload FROM ai_messages WHERE account_id=? AND conversation_id=? AND json_extract(payload,'$.role')='assistant' AND (json_extract(payload,'$.personaId')=?" + (scope == "public" ? "" : " OR json_extract(payload,'$.personaId') IS NULL") + ") ORDER BY ordinal DESC LIMIT 1", [account, conversation, persona], as: AIMessage.self).first
            if let provider = last?.providerId, let model = last?.model?.id { binding = (provider, model) } else { binding = nil }
        }
        guard let binding, let provider = try providers(account).first(where: { $0.id == binding.0 && $0.enabled }), let model = provider.models.first(where: { $0.id == binding.1 }) else { throw AIError.invalid }
        let summary = try conversationContext(conversation, scope: scope, account: account)
        let previous = summary?.status == "active" && !(summary?.content.isEmpty ?? true) ? summary : nil
        let progress = try processingJobs(persona: persona, account: account, all: true).filter { $0.conversationId == conversation && $0.status == "completed" }.max { ($0.messages.last?.ordinal ?? 0) < ($1.messages.last?.ordinal ?? 0) }
        let from = try progress?.messages.last.flatMap { try contextRecord($0.id, conversation: conversation, account: account)?.ordinal } ?? 0
        let start = previous.map { min(from, $0.throughOrdinal) } ?? 0
        if trigger != "manual", try processingJobs(persona: persona, account: account, all: true).contains(where: { $0.conversationId == conversation && $0.status != "completed" && ($0.messages.last?.ordinal ?? 0) > from }) { return nil }
        let (rows, readBounded) = try contextRecords(Self.contextSelect + " WHERE m.account_id=? AND m.conversation_id=? AND m.ordinal>? AND " + Self.processingEligibleSQL + " ORDER BY m.ordinal LIMIT 201", [account, conversation, String(start)], byteLimit: 2 * 1024 * 1024)
        if rows.isEmpty { return nil }
        if trigger == "threshold" {
            let count = try statement("SELECT COUNT(*) FROM ai_messages m WHERE m.account_id=? AND m.conversation_id=? AND m.ordinal>? AND " + Self.processingEligibleSQL, [account, conversation, String(start)])
            defer { sqlite3_finalize(count) }; guard sqlite3_step(count) == SQLITE_ROW else { throw AIError.storage }
            if sqlite3_column_int64(count, 0) < Int64(config.threshold) { return nil }
        }
        var job = AIMemoryJob(id: UUID().uuidString, accountId: account, personaId: persona, conversationId: conversation, trigger: trigger, status: "queued", messages: [], inputHash: "", summaryVersion: summary?.version ?? 0, previousSummary: previous.map { .init(scope: scope, version: $0.version, hash: $0.contentHash) }, provider: provider, model: model, providerKind: provider.id == "00000000-0000-4000-8000-000000000220" ? "subscription" : "api", group: scope == "public", createdAt: aiTimestamp(), updatedAt: aiTimestamp())
        let budget = try AIContext.budget(model, persona: AIMemoryProcessing.workerPersona, tail: "")
        var chosen: [AIContextRecord] = []
        for count in 1...min(rows.count, 120) {
            let candidate = Array(rows.prefix(count)), used = Set(candidate.map(\.unitOrdinal)), remaining = Set(rows.dropFirst(count).map(\.unitOrdinal))
            if !used.isDisjoint(with: remaining) || (rows.count == 201 || readBounded) && used.contains(rows.last!.unitOrdinal) { continue }
            let input = AIMemoryProcessing.input(job: job, records: candidate, previous: previous)
            if try AIContext.tokens(input) + budget.systemTokens > budget.inputLimit || JSONSerialization.data(withJSONObject: input).count > AIContext.hardBytes / 2 { break }
            if try processingBoundary(candidate.last!, account: account, conversation: conversation) { chosen = candidate }
        }
        guard let last = chosen.last else { throw AIError.contextCapacity }
        let streaming = try statement("SELECT 1 FROM ai_messages WHERE account_id=? AND conversation_id=? AND ordinal<=? AND status='streaming' LIMIT 1", [account, conversation, String(last.ordinal)])
        defer { sqlite3_finalize(streaming) }; guard sqlite3_step(streaming) == SQLITE_DONE else { throw AIError.busy }
        job.messages = chosen.map(\.ref)
        job.inputHash = AIMemoryProcessing.inputHash(job: job, input: AIMemoryProcessing.input(job: job, records: chosen, previous: previous))
        if try documents("SELECT payload FROM ai_memory_jobs WHERE account_id=? AND persona_id=? AND conversation_id=? AND input_hash=?", [account, persona, conversation, job.inputHash], as: AIMemoryJob.self).first != nil { return nil }
        try writeJob(job); return job
    }

    private func processingBoundary(_ row: AIContextRecord, account: String, conversation: String) throws -> Bool {
        if let round = row.message.roundId {
            let later = try statement("SELECT 1 FROM ai_messages WHERE account_id=? AND conversation_id=? AND ordinal>? AND json_extract(payload,'$.roundId')=? LIMIT 1", [account, conversation, String(row.ordinal), round])
            defer { sqlite3_finalize(later) }; let step = sqlite3_step(later)
            guard step == SQLITE_ROW || step == SQLITE_DONE else { throw AIError.storage }
            if step == SQLITE_ROW { return false }
        }
        let next = try contextRecords(Self.contextSelect + " WHERE m.account_id=? AND m.conversation_id=? AND m.ordinal>? ORDER BY m.ordinal LIMIT 1", [account, conversation, String(row.ordinal)]).0.first
        return next == nil || next?.unitOrdinal != row.unitOrdinal
    }
    func validateProcessingResult(_ value: AIMemoryProcessingResult, job: AIMemoryJob, rows: [AIContextRecord]) throws {
        guard !value.summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, value.summary.utf8.count <= 24000, !value.summary.contains("\0"), value.unresolved.count <= 32,
              value.unresolved.allSatisfy({ !$0.isEmpty && $0.utf8.count <= 1000 && !$0.contains("\0") }), value.memories.count <= 8 else { throw AIError.invalid }
        guard (value.resolved?.count ?? 0) <= 32 else { throw AIError.invalid }
        for resolved in value.resolved ?? [] {
            guard !resolved.topic.isEmpty, resolved.topic.utf8.count <= 1000, (1...8).contains(resolved.sourceIds.count), Set(resolved.sourceIds).count == resolved.sourceIds.count, resolved.sourceIds.allSatisfy({ id in rows.contains(where: { $0.message.id == id && $0.message.role == "user" }) }) else { throw AIError.invalidContext }
        }
        for candidate in value.memories {
            guard !candidate.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, candidate.content.utf8.count <= 8000, !candidate.content.contains("\0"), (1...5).contains(candidate.importance), candidate.confidence.isFinite, (0...1).contains(candidate.confidence), (1...8).contains(candidate.sourceIds.count), Set(candidate.sourceIds).count == candidate.sourceIds.count,
                  ["new", "supplement", "replace", "conflict", "expire"].contains(candidate.change) else { throw AIError.invalid }
            let evidence = rows.filter { candidate.sourceIds.contains($0.message.id) }
            guard evidence.count == candidate.sourceIds.count, evidence.allSatisfy({ !$0.message.content.isEmpty }) else { throw AIError.invalidContext }
            if candidate.nature == .userStatement { guard evidence.allSatisfy({ $0.message.role == "user" }) else { throw AIError.invalid } }
            if candidate.nature == .promise { guard evidence.contains(where: { $0.message.role == "assistant" && ($0.message.personaId == job.personaId || !job.group && $0.message.personaId == nil) }) else { throw AIError.invalid } }
            if candidate.nature == .sharedExperience { guard evidence.contains(where: { $0.message.role == "user" || $0.message.personaId == job.personaId || !job.group && $0.message.personaId == nil }) else { throw AIError.invalid } }
            if let time = candidate.eventTime { guard !time.isEmpty, time.utf8.count <= 100, evidence.contains(where: { $0.message.content.contains(time) }) else { throw AIError.invalid } }
        }
    }
    func cacheProcessingResult(_ original: AIMemoryJob, result: AIMemoryProcessingResult) throws {
        var job = try processingJob(original.id, persona: original.personaId, account: original.accountId)
        guard job.status == "running" else { throw AIError.invalidContext }
        let rows = try processingRecords(job); try validateProcessingResult(result, job: job, rows: rows)
        job.result = result
        if !job.attempts.isEmpty { job.attempts[job.attempts.count - 1].finishedAt = job.attempts.last?.finishedAt ?? aiTimestamp(); job.attempts[job.attempts.count - 1].status = "received" }
        try writeJob(job)
    }
    func completeProcessing(_ original: AIMemoryJob, result: AIMemoryProcessingResult) throws -> AIMemoryJob {
        try Task.checkCancellation()
        var job = try processingJob(original.id, persona: original.personaId, account: original.accountId)
        guard job.status == "running" else { throw AIError.invalidContext }
        let rows = try processingRecords(job); try validateProcessingResult(result, job: job, rows: rows)
        let existing = try memories(persona: job.personaId, account: job.accountId)
        var proposals: [AIMemoryProposal] = [], seen = Set<String>()
        let pending = try processingProposals(persona: job.personaId, account: job.accountId).filter { $0.status == "pending" }
        for candidate in result.memories {
            guard seen.insert(AIMemoryProcessing.normalized(candidate.content)).inserted else { continue }
            let pendingDuplicate = pending.contains { $0.memory.map { AIMemoryProcessing.normalized($0.content) == AIMemoryProcessing.normalized(candidate.content) } ?? false }
            let exact = existing.first { AIMemoryProcessing.normalized($0.content) == AIMemoryProcessing.normalized(candidate.content) }
            let similar = existing.map { ($0, AIMemoryProcessing.similarity($0.content, candidate.content)) }.filter { $0.1 >= 0.28 }.max { $0.1 < $1.1 }?.0
            let target = exact ?? similar, id = UUID().uuidString, now = aiTimestamp()
            let evidence = rows.filter { candidate.sourceIds.contains($0.message.id) }
            let sources = evidence.map { AIMemorySource(conversationId: job.conversationId, messageId: $0.message.id, excerpt: String($0.message.content.prefix(1500))) }
            var draft = AIPersonaMemory(id: target?.id ?? id, accountId: job.accountId, personaId: job.personaId, kind: candidate.kind, content: candidate.content, importance: candidate.importance, nature: candidate.nature, sources: sources, createdAt: now, updatedAt: now, version: target?.version ?? 0, status: .active, visibility: target?.visibility ?? .singleChat)
            draft.provenance = .init(taskId: job.id, proposalId: id, providerId: job.provider.id, modelId: job.model.id, confidence: candidate.confidence, eventTime: candidate.eventTime)
            if candidate.change == "expire" { draft.expiredAt = now }
            let literal = candidate.change == "new" && target == nil && candidate.nature == .userStatement && candidate.confidence >= 0.95 && !pendingDuplicate && evidence.contains { $0.message.content.contains(candidate.content) }
            let duplicate = exact != nil && exact?.expiredAt == nil && candidate.change == "new"
            let reason = duplicate ? "duplicate" : target != nil ? (candidate.change == "new" ? "similar_merge" : candidate.change) : candidate.change == "new" ? (literal ? "explicit_quote" : "review_inference") : "unmatched_" + candidate.change
            proposals.append(.init(id: id, accountId: job.accountId, personaId: job.personaId, conversationId: job.conversationId, taskId: job.id, status: !duplicate && !pendingDuplicate ? "pending" : "duplicate", reason: reason, memory: draft, targetId: target?.id, targetVersion: target?.version, createdAt: now, updatedAt: now))
        }
        try execute("BEGIN IMMEDIATE")
        do {
            for var proposal in proposals {
                if proposal.reason == "explicit_quote", let draft = proposal.memory {
                    let saved = try saveMemory(draft, expectedVersion: 0, persona: job.personaId, account: job.accountId, transaction: false)
                    proposal.status = "accepted"; proposal.acceptedMemoryId = saved.id
                }
                try writeProposal(proposal)
            }
            let scope = try contextScope(job.conversationId, persona: job.personaId, account: job.accountId)
            let latest = try conversationContext(job.conversationId, scope: scope, account: job.accountId)
            if (latest?.version ?? 0) == job.summaryVersion, let end = rows.last, (latest?.status != "active" || (latest?.throughOrdinal ?? 0) < end.ordinal) {
                var topics = latest?.unresolved ?? []
                for resolved in result.resolved ?? [] {
                    let explicit = rows.filter { resolved.sourceIds.contains($0.message.id) && $0.message.role == "user" }.contains { row in
                        let text = row.message.content.lowercased(), words = Set(text.components(separatedBy: CharacterSet.alphanumerics.inverted))
                        let positive = !words.isDisjoint(with: ["completed", "finished", "done", "cancelled", "canceled", "confirmed"]) || ["已完成", "做完了", "已确认", "取消", "解决了"].contains(where: { text.contains($0) })
                        let negative = !words.isDisjoint(with: ["not", "never"]) || ["没完成", "未完成", "没确认", "未确认", "别取消", "不要取消"].contains(where: { text.contains($0) })
                        return positive && !negative
                    }
                    if explicit { topics.removeAll { $0 == resolved.topic } }
                }
                for item in result.unresolved where !topics.contains(item) { topics.append(item) }
                _ = try saveConversationContext(job.conversationId, persona: job.personaId, account: job.accountId, content: result.summary, unresolved: Array(topics.prefix(32)), throughMessageId: end.message.id, recentLimit: latest?.recentMessageLimit ?? 0, expectedVersion: job.summaryVersion, transaction: false, processingJob: job)
                job.summaryStatus = "applied"
            } else { job.summaryStatus = "newer_context_kept" }
            job.status = "completed"; job.result = result; job.updatedAt = aiTimestamp()
            if !job.attempts.isEmpty { job.attempts[job.attempts.count - 1].status = "completed"; job.attempts[job.attempts.count - 1].finishedAt = job.attempts.last?.finishedAt ?? aiTimestamp() }
            try writeJob(job); try execute("COMMIT")
        } catch { try? execute("ROLLBACK"); throw error }
        return job
    }
    func reviewProcessingProposal(_ id: String, persona: String, account: String, accept: Bool, edited: String?, targetId: String? = nil, targetVersion: Int? = nil) throws -> AIMemoryProposal {
        guard var proposal = try documents("SELECT payload FROM ai_memory_proposals WHERE account_id=? AND persona_id=? AND id=?", [account, persona, id], as: AIMemoryProposal.self).first, proposal.status == "pending", var draft = proposal.memory else { throw AIError.staleMemory }
        let job = try processingJob(proposal.taskId, persona: persona, account: account)
        _ = try processingRecords(job)
        try execute("BEGIN IMMEDIATE")
        do {
            if accept {
                if let targetId {
                    guard let selected = try memoryVersions(targetId, persona: persona, account: account).first, selected.status == .active, selected.version == targetVersion else { throw AIError.staleMemory }
                    proposal.targetId = selected.id; proposal.targetVersion = selected.version; draft.id = selected.id; draft.visibility = selected.visibility
                }
                if proposal.reason.hasPrefix("unmatched_") && proposal.targetId == nil { throw AIError.invalid }
                if let edited { guard !edited.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, edited.utf8.count <= 8000 else { throw AIError.invalid }; draft.content = edited }
                // Preserve original evidence when supplementing/replacing/expiring.
                if let target = proposal.targetId {
                    guard let old = try memoryVersions(target, persona: persona, account: account).first, old.status == .active, old.version == proposal.targetVersion else { throw AIError.staleMemory }
                    draft.sources = Array((old.sources + draft.sources).reduce(into: [AIMemorySource]()) { if !$0.contains($1) { $0.append($1) } }.suffix(20))
                }
                let saved = try saveMemory(draft, expectedVersion: proposal.targetVersion ?? 0, persona: persona, account: account, transaction: false)
                proposal.acceptedMemoryId = saved.id; proposal.memory = saved; proposal.status = "accepted"
            } else { proposal.status = "rejected" }
            proposal.updatedAt = aiTimestamp(); try writeProposal(proposal); try execute("COMMIT")
        } catch { try? execute("ROLLBACK"); throw error }
        return proposal
    }
}
