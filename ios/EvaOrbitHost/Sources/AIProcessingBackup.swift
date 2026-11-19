import Foundation

extension AIStore {
    func validateProcessingBackup(_ document: AIBackupDocument) throws {
        let value = document.payload
        if document.version < 3 {
            guard value.processingConfigs == nil, value.processingJobs == nil, value.processingProposals == nil, value.contexts?.allSatisfy({ $0.processingTaskId == nil }) ?? true else { throw AIError.invalid }
            return
        }
        guard let configs = value.processingConfigs, let jobs = value.processingJobs, let proposals = value.processingProposals,
              Set(configs.map(\.personaId)).count == configs.count, Set(jobs.map(\.id)).count == jobs.count, Set(proposals.map(\.id)).count == proposals.count else { throw AIError.invalid }
        let personas = Set(value.personas.map(\.id)), conversations = Dictionary(uniqueKeysWithValues: value.conversations.map { ($0.id, $0) }), messages = Dictionary(uniqueKeysWithValues: value.messages.map { ($0.id, $0) })
        let jobMap = Dictionary(uniqueKeysWithValues: jobs.map { ($0.id, $0) })
        guard Set(jobs.map { $0.personaId + ":" + $0.conversationId + ":" + $0.inputHash }).count == jobs.count else { throw AIError.invalid }
        for config in configs { try config.validate(); guard config.accountId == value.accountId, personas.contains(config.personaId) else { throw AIError.ownership } }
        for job in jobs {
            guard UUID(uuidString: job.id) != nil, job.accountId == value.accountId, personas.contains(job.personaId), let conversation = conversations[job.conversationId],
                  job.group == (conversation.ownership == "group"), conversation.ownership == "group" || conversation.personaId == job.personaId,
                  ["queued", "running", "completed", "failed", "cancelled", "interrupted", "stale"].contains(job.status), ["manual", "threshold", "end"].contains(job.trigger), ["api", "subscription"].contains(job.providerKind),
                  job.inputHash.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil,
                  (1...200).contains(job.messages.count), job.summaryVersion >= 0, job.attempts.count <= 1000, job.provider.models.contains(job.model),
                  ISO8601DateFormatter().date(from: job.createdAt) != nil, ISO8601DateFormatter().date(from: job.updatedAt) != nil else { throw AIError.invalid }
            try job.provider.validate()
            for ref in job.messages {
                if job.status == "stale" && messages[ref.id] == nil { continue }
                guard let source = messages[ref.id], source.conversationId == job.conversationId, value.messageOrdinals?[ref.id] == ref.ordinal else { throw AIError.invalidContext }
                if job.status == "completed" { guard source.seq == ref.seq, AIContextRecord(ordinal: ref.ordinal, unitOrdinal: 0, message: source).ref.hash == ref.hash else { throw AIError.invalidContext } }
            }
            for attempt in job.attempts {
                guard ISO8601DateFormatter().date(from: attempt.startedAt) != nil, [attempt.usage.inputTokens, attempt.usage.outputTokens, attempt.usage.cachedTokens].compactMap({ $0 }).allSatisfy({ $0 >= 0 }), attempt.cost.map({ $0.isFinite && $0 >= 0 }) ?? true else { throw AIError.invalid }
            }
            if let result = job.result, job.status != "stale" {
                let rows = job.messages.compactMap { ref -> AIContextRecord? in messages[ref.id].map { .init(ordinal: ref.ordinal, unitOrdinal: 0, message: $0) } }
                try validateProcessingResult(result, job: job, rows: rows)
            }
        }
        for context in value.contexts ?? [] {
            if let id = context.processingTaskId { guard let job = jobMap[id], job.conversationId == context.conversationId, context.scope == "public" || context.scope == job.personaId, job.inputHash == context.processingInputHash, job.provider.id == context.processingProviderId, job.model.id == context.processingModelId else { throw AIError.invalidContext } }
        }
        for proposal in proposals {
            guard UUID(uuidString: proposal.id) != nil, proposal.accountId == value.accountId, let job = jobMap[proposal.taskId], job.personaId == proposal.personaId, job.conversationId == proposal.conversationId,
                  ["pending", "accepted", "rejected", "duplicate", "invalidated", "deleted"].contains(proposal.status) else { throw AIError.invalid }
            if var memory = proposal.memory {
                memory.version = max(1, memory.version); try memory.validate()
                guard memory.accountId == value.accountId, memory.personaId == proposal.personaId, memory.provenance?.taskId == job.id, memory.provenance?.proposalId == proposal.id else { throw AIError.ownership }
                for source in memory.sources { guard let id = source.messageId, let message = messages[id], message.conversationId == source.conversationId else { throw AIError.invalidContext }; if proposal.status == "pending" { guard message.content.contains(source.excerpt) else { throw AIError.invalidContext } } }
            } else { guard proposal.status == "deleted" else { throw AIError.invalid } }
            for id in [proposal.targetId, proposal.acceptedMemoryId].compactMap({ $0 }) { guard value.memories.contains(where: { $0.id == id && $0.personaId == proposal.personaId }) else { throw AIError.ownership } }
        }
    }
    func restoreProcessingBackup(_ value: AIBackupPayload, account: String) throws {
        for var config in value.processingConfigs ?? [] { config.automatic = false; try execute("INSERT INTO ai_memory_processing_config VALUES(?,?,?)", [account, config.personaId, try encoded(config)]) }
        for var job in value.processingJobs ?? [] {
            job.messages = try job.messages.map { ref in
                if let row = try contextRecord(ref.id, conversation: job.conversationId, account: account) {
                    var copy = ref; copy.ordinal = row.ordinal; return copy
                }
                guard job.status == "stale" else { throw AIError.invalidContext }
                return ref
            }
            if ["queued", "running"].contains(job.status) { job.status = "interrupted"; job.error = "Restored task. No automatic retry." }
            try writeJob(job)
        }
        for proposal in value.processingProposals ?? [] { try writeProposal(proposal) }
    }
}
