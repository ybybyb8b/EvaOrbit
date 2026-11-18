import Foundation
import CryptoKit

extension AIStore {
    func validateContextBackup(_ document: AIBackupDocument) throws {
        let value = document.payload
        if document.version == 1 {
            guard value.contexts == nil, value.contextSnapshots == nil, value.messageOrdinals == nil,
                  value.messages.allSatisfy({ $0.contextSnapshotId == nil }), value.rounds.allSatisfy({ $0.publicContextId == nil }) else { throw AIError.invalidContext }
            return
        }
        guard let contexts = value.contexts, let snapshots = value.contextSnapshots, let ordinals = value.messageOrdinals,
              Set(ordinals.keys) == Set(value.messages.map(\.id)), Set(ordinals.values).count == ordinals.count,
              ordinals.values.allSatisfy({ $0 > 0 }) else { throw AIError.invalidContext }
        let ordered = value.messages.map { ordinals[$0.id]! }
        guard ordered == ordered.sorted(), Set(contexts.map { $0.conversationId + ":" + $0.scope + ":" + String($0.version) }).count == contexts.count,
              Set(snapshots.map(\.id)).count == snapshots.count else { throw AIError.invalidContext }
        let conversations = Dictionary(uniqueKeysWithValues: value.conversations.map { ($0.id, $0) })
        let messages = Dictionary(uniqueKeysWithValues: value.messages.map { ($0.id, $0) })
        let snapshotMap = Dictionary(uniqueKeysWithValues: snapshots.map { ($0.id, $0) })
        let personas = Set(value.personas.map(\.id))
        let replaced = Set(value.messages.compactMap(\.supersedesId))
        for context in contexts {
            guard context.accountId == value.accountId, let conversation = conversations[context.conversationId],
                  context.scope == (conversation.ownership == "group" ? "public" : conversation.personaId), context.version > 0,
                  ["active", "superseded", "invalidated"].contains(context.status), context.contentHash == context.semanticHash,
                  context.content.utf8.count <= 32000, !context.content.contains("\0"), context.unresolved.count <= 32,
                  context.unresolved.allSatisfy({ !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && $0.utf8.count <= 1000 && !$0.contains("\0") }),
                  context.sourceCount >= 0, context.fromOrdinal >= 0, context.throughOrdinal >= context.fromOrdinal,
                  (0...5000).contains(context.recentMessageLimit), ISO8601DateFormatter().date(from: context.updatedAt) != nil else { throw AIError.invalidContext }
            if context.status == "active" {
                if !context.content.isEmpty {
                    guard let end = context.throughMessageId, ordinals[end] == context.throughOrdinal, messages[end]?.conversationId == context.conversationId else { throw AIError.invalidContext }
                } else { guard context.throughOrdinal == 0 else { throw AIError.invalidContext } }
                let source = value.messages.filter { m in
                    let ordinal = ordinals[m.id]!
                    return m.conversationId == context.conversationId && ordinal >= context.fromOrdinal && ordinal <= context.throughOrdinal && !replaced.contains(m.id)
                }
                guard source.allSatisfy({ $0.status != "streaming" }) else { throw AIError.invalidContext }
                let eligible = source.filter { $0.role == "user" || !$0.content.isEmpty }
                var digest = SHA256()
                for message in eligible {
                    let record = AIContextRecord(ordinal: ordinals[message.id]!, unitOrdinal: 0, message: message)
                    digest.update(data: Data(AIContext.hash([message.id, String(message.seq), record.ref.hash]).utf8))
                }
                let hash = digest.finalize().map { String(format: "%02x", $0) }.joined()
                guard context.sourceHash == hash, context.sourceCount == eligible.count, context.firstMessageId == eligible.first?.id else { throw AIError.invalidContext }
            }
        }
        for versions in Dictionary(grouping: contexts, by: { $0.conversationId + ":" + $0.scope }).values {
            let sorted = versions.sorted { $0.version < $1.version }
            guard sorted.map(\.version) == Array(1...sorted.count), sorted.filter({ $0.status == "active" }).count <= 1,
                  sorted.first(where: { $0.status == "active" }).map({ $0.version == sorted.last?.version }) ?? true else { throw AIError.invalidContext }
        }
        for snapshot in snapshots {
            guard UUID(uuidString: snapshot.id) != nil, snapshot.accountId == value.accountId, let conversation = conversations[snapshot.conversationId],
                  ["conversation", "generation"].contains(snapshot.kind), ISO8601DateFormatter().date(from: snapshot.createdAt) != nil,
                  snapshot.invalidated || snapshot.inputHash.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil,
                  snapshot.budget.contextWindow > 0, snapshot.budget.inputLimit > 0, snapshot.budget.inputLimit <= snapshot.budget.contextWindow,
                  snapshot.budget.outputTokens >= 0, snapshot.budget.outputTokens < snapshot.budget.contextWindow,
                  snapshot.budget.estimatedInputTokens >= 0, snapshot.budget.estimatedInputTokens <= snapshot.budget.inputLimit,
                  snapshot.budget.systemTokens >= 0, snapshot.budget.publicTokens >= 0, snapshot.budget.memoryTokens >= 0,
                  snapshot.coverage.watermark >= 0, snapshot.coverage.includedMessages >= 0, snapshot.coverage.totalMessages >= 0,
                  (snapshot.instruction?.utf8.count ?? 0) <= 80000 else { throw AIError.invalidContext }
            if snapshot.kind == "conversation" {
                guard snapshot.personaId == (conversation.ownership == "group" ? "public" : conversation.personaId), snapshot.memories.isEmpty, snapshot.publicSnapshotId == nil else { throw AIError.invalidContext }
            } else {
                guard personas.contains(snapshot.personaId), snapshot.messages.isEmpty, let parent = snapshot.publicSnapshotId,
                      let shared = snapshotMap[parent], shared.kind == "conversation", shared.conversationId == snapshot.conversationId,
                      conversation.ownership == "group" || conversation.personaId == snapshot.personaId else { throw AIError.invalidContext }
            }
            for ref in snapshot.messages {
                if snapshot.invalidated && messages[ref.id] == nil { continue }
                guard let message = messages[ref.id], message.conversationId == snapshot.conversationId, ordinals[ref.id] == ref.ordinal else { throw AIError.invalidContext }
                if !snapshot.invalidated { guard message.seq == ref.seq, message.status != "streaming", AIContextRecord(ordinal: ref.ordinal, unitOrdinal: 0, message: message).ref.hash == ref.hash else { throw AIError.invalidContext } }
            }
            if let id = snapshot.currentMessageId {
                guard let message = messages[id], message.conversationId == snapshot.conversationId, message.role == "user" else { throw AIError.invalidContext }
                let tail = snapshot.instruction.map { AIContext.discussionTail(user: message.content, instruction: $0) } ?? message.content
                guard snapshot.invalidated || snapshot.currentMessageHash == AIContext.hash(["role": "user", "content": tail]) else { throw AIError.invalidContext }
            }
            if let ref = snapshot.summary {
                guard let context = contexts.first(where: { $0.conversationId == snapshot.conversationId && $0.scope == ref.scope && $0.version == ref.version }), context.contentHash == ref.hash,
                      snapshot.invalidated || context.status == "active", (snapshot.unresolvedIndices ?? []).allSatisfy({ context.unresolved.indices.contains($0) }) else { throw AIError.invalidContext }
            }
            for ref in snapshot.memories {
                guard let memory = value.memories.first(where: { $0.personaId == snapshot.personaId && $0.id == ref.id && $0.version == ref.version }),
                      snapshot.invalidated || (memory.status == .active && (conversation.ownership != "group" || memory.visibility == .allChats) && AIContext.hash(AIContext.memoryMessage([memory])) == ref.hash) else { throw AIError.invalidContext }
            }
        }
        for message in value.messages {
            if let id = message.contextSnapshotId {
                guard let snapshot = snapshotMap[id], snapshot.kind == "generation", snapshot.conversationId == message.conversationId,
                      snapshot.personaId == message.personaId, snapshot.providerId == message.providerId, snapshot.modelId == message.model?.id else { throw AIError.invalidContext }
            }
        }
        for round in value.rounds {
            if let id = round.publicContextId { guard snapshotMap[id]?.kind == "conversation", snapshotMap[id]?.personaId == "public", snapshotMap[id]?.conversationId == round.conversationId, round.context.isEmpty else { throw AIError.invalidContext } }
        }
    }

    func restoreContextBackup(_ value: AIBackupPayload, account: String) throws {
        let rows = try contextRecords("SELECT ordinal,payload,ordinal FROM ai_messages WHERE account_id=? ORDER BY ordinal", [account]).0
        let current = Dictionary(uniqueKeysWithValues: rows.map { ($0.message.id, $0.ordinal) })
        for var context in value.contexts ?? [] {
            context.fromOrdinal = context.firstMessageId.flatMap { current[$0] } ?? 0
            context.throughOrdinal = context.throughMessageId.flatMap { current[$0] } ?? 0
            if !context.content.isEmpty && context.throughOrdinal == 0 { context.status = "invalidated" }
            try insertConversationContext(context)
        }
        for var snapshot in value.contextSnapshots ?? [] {
            let missing = snapshot.messages.contains { current[$0.id] == nil }
            if missing { snapshot.messages = []; snapshot.invalidated = true; snapshot.inputHash = "" }
            snapshot.messages = snapshot.messages.map { ref in var changed = ref; changed.ordinal = current[ref.id] ?? 0; return changed }
            if let old = value.messageOrdinals {
                snapshot.coverage.watermark = rows.filter { $0.message.conversationId == snapshot.conversationId && (old[$0.message.id] ?? Int64.max) <= snapshot.coverage.watermark }.map(\.ordinal).max() ?? 0
                snapshot.coverage.summarizedThrough = rows.filter { $0.message.conversationId == snapshot.conversationId && (old[$0.message.id] ?? Int64.max) <= snapshot.coverage.summarizedThrough }.map(\.ordinal).max() ?? 0
            }
            try execute("INSERT INTO ai_context_snapshots VALUES(?,?,?,?,?)", [account, snapshot.id, snapshot.conversationId, snapshot.personaId, try encoded(snapshot)])
        }
    }
}
