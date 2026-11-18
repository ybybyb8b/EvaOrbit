import Foundation
import Testing
@testable import EvaOrbitHost

private let contextAccount = "61000000-0000-4000-8000-000000000001"
private let contextOther = "61000000-0000-4000-8000-000000000002"
private let contextProvider = "61000000-0000-4000-8000-000000000003"
private let contextConversation = "61000000-0000-4000-8000-000000000004"
private func contextPersona(_ id: String = "sebastian", name: String = "Sebastian") -> ParlorPersona {
    var p = ParlorPersona.sebastian; p.id = id; p.name = name; p.systemPrompt = "A thoughtful companion."
    p.providerId = contextProvider; p.modelId = "text"; return p
}
private func contextModel(_ window: Int? = 8192) -> AIModel { AIModel(id: "text", name: "Text", contextWindow: window) }
private func contextMemory(_ persona: String = "sebastian", content: String = "Remember our quiet walk near SECRET_RIVER.", visibility: AIMemoryVisibility? = .allChats) -> AIPersonaMemory {
    AIPersonaMemory(id: UUID().uuidString, accountId: contextAccount, personaId: persona, kind: .experience, content: content, importance: 4, nature: .sharedExperience, sources: [], createdAt: aiTimestamp(), updatedAt: aiTimestamp(), version: 1, status: .active, visibility: visibility)
}
private func contextHistory(_ turns: Int, content: String = "A previous useful detail about the walk. ") -> AIContextHistory {
    var records: [AIContextRecord] = []
    for i in 0..<turns {
        let first = Int64(i * 2 + 1)
        for role in ["user", "assistant"] {
            let ordinal = first + (role == "assistant" ? 1 : 0)
            let message = AIMessage(id: UUID().uuidString, conversationId: contextConversation, role: role, content: content + String(i), status: "done", createdAt: aiTimestamp(), personaId: role == "assistant" ? "sebastian" : nil, personaName: role == "assistant" ? "Sebastian" : nil)
            records.append(.init(ordinal: ordinal, unitOrdinal: first, message: message))
        }
    }
    return .init(records: records, total: records.count, watermark: Int64(records.count), truncated: false)
}
private func contextParticipant(_ p: ParlorPersona = contextPersona(), window: Int? = 8192, memories: [AIPersonaMemory] = []) -> AIContextParticipant {
    .init(persona: p, providerId: contextProvider, model: contextModel(window), memories: memories)
}
private func assemble(_ history: AIContextHistory, participants: [AIContextParticipant] = [contextParticipant()], group: Bool = false, summary: AIConversationContext? = nil, tail: String = "Plan a quiet walk") throws -> AIContextPlan {
    try AIContext.assemble(account: contextAccount, conversation: contextConversation, group: group, history: history, summary: summary, participants: participants, tail: tail, currentMessageId: UUID().uuidString, instruction: nil, query: tail)
}
private func contextSummary(_ history: AIContextHistory, content: String = "We agreed on a quiet walk.", scope: String = "sebastian") -> AIConversationContext {
    var value = AIConversationContext(accountId: contextAccount, conversationId: contextConversation, scope: scope, version: 1, content: content, unresolved: ["Confirm the route and budget"], fromOrdinal: 1, throughOrdinal: 2, firstMessageId: history.records.first?.message.id, throughMessageId: history.records.dropFirst().first?.message.id, sourceCount: 2, sourceHash: String(repeating: "a", count: 64), contentHash: "", updatedAt: aiTimestamp(), status: "active", recentMessageLimit: 0)
    value.contentHash = value.semanticHash; return value
}

@Suite("Parlor context budget and isolation")
struct AIContextBudgetTests {
    @Test(arguments: [2048, 8192, 32768]) func longHistoryKeepsWholeTurnsAndTheCurrentMessage(_ window: Int) throws {
        let history = contextHistory(1800, content: String(repeating: "Earlier detail. ", count: 12))
        let plan = try assemble(history, participants: [contextParticipant(window: window)])
        let generation = try #require(plan.generations["sebastian"])
        #expect(generation.budget.estimatedInputTokens <= generation.budget.inputLimit)
        #expect(generation.budget.inputLimit + generation.budget.outputTokens < window)
        #expect(generation.budget.contextWindow == window)
        #expect(plan.shared.messages.count < history.records.count)
        #expect(plan.shared.messages.count % 2 == 0)
        #expect(plan.shared.messages.last?.id == history.records.last?.message.id)
        #expect(plan.publicMessages.last?["content"] == "Plan a quiet walk")
        #expect(plan.shared.coverage.notices.contains("history_not_fully_included"))
    }
    @Test func unknownWindowAndImpossibleMandatoryInputAreExplicit() throws {
        let plan = try assemble(contextHistory(1), participants: [contextParticipant(window: nil)])
        #expect(plan.generations["sebastian"]?.budget.windowKnown == false)
        #expect(plan.shared.coverage.notices.contains("context_window_unknown"))
        #expect(throws: AIError.contextCapacity) { try assemble(contextHistory(0), participants: [contextParticipant(window: 32)]) }
    }
    @Test func onlyRelevantActiveOwnedMemoriesAppearOutsideSystemPrompt() throws {
        let good = contextMemory(), other = contextMemory("62000000-0000-4000-8000-000000000001", content: "walk OTHER_PERSONA")
        var deleted = contextMemory(content: "walk DELETED"); deleted.status = .deleted
        var superseded = contextMemory(content: "walk SUPERSEDED"); superseded.status = .superseded
        let unrelated = contextMemory(content: "A telescope and an observatory")
        let participant = contextParticipant(memories: [good, other, deleted, superseded, unrelated])
        let plan = try assemble(contextHistory(1), participants: [participant])
        let input = try #require(plan.inputs["sebastian"])
        #expect(input.first?["content"]?.contains("persona_memory") == true)
        #expect(AIContext.hash(input) != AIContext.hash(plan.publicMessages))
        #expect(input.description.contains("SECRET_RIVER"))
        #expect(!input.description.contains("OTHER_PERSONA") && !input.description.contains("DELETED") && !input.description.contains("SUPERSEDED"))
        #expect(!contextPersona().runtimePrompt.contains("SECRET_RIVER"))
        #expect(plan.generations["sebastian"]?.memories.map(\.id) == [good.id])
        #expect(plan.shared.memories.isEmpty && !plan.publicMessages.description.contains("SECRET_RIVER"))
    }
    @Test func parallelSharesPublicHistoryWithIndependentPrivateBudgetsAndSingleChatPolicy() throws {
        let ada = contextPersona("62000000-0000-4000-8000-000000000001", name: "Ada")
        let own = contextMemory(), adaMemory = contextMemory(ada.id, content: "A quiet walk near PRIVATE_LIBRARY.")
        let singleOnly = contextMemory(content: "walk SINGLE_CHAT_SECRET", visibility: .singleChat)
        let legacy = contextMemory(content: "walk LEGACY_PRIVATE", visibility: nil)
        let plan = try assemble(contextHistory(100), participants: [contextParticipant(window: 4096, memories: [own, singleOnly, legacy]), contextParticipant(ada, window: 16384, memories: [adaMemory])], group: true)
        let a = try #require(plan.generations["sebastian"]), b = try #require(plan.generations[ada.id])
        #expect(a.publicSnapshotId == b.publicSnapshotId)
        #expect(plan.shared.budget.contextWindow == 4096)
        #expect(a.budget.outputTokens != b.budget.outputTokens)
        #expect(plan.inputs["sebastian"]?.last == plan.inputs[ada.id]?.last)
        #expect(plan.inputs["sebastian"]?.description.contains("SINGLE_CHAT_SECRET") == false)
        #expect(plan.inputs[ada.id]?.description.contains("SECRET_RIVER") == false)
        #expect(plan.inputs["sebastian"]?.description.contains("PRIVATE_LIBRARY") == false)
        #expect(plan.shared.messages.isEmpty == false && a.messages.isEmpty && b.messages.isEmpty)
    }
    @Test func summaryWatermarkAndUnresolvedItemsAvoidRepeatingCoveredHistory() throws {
        let history = contextHistory(4), summary = contextSummary(history)
        let plan = try assemble(history, summary: summary)
        #expect(plan.shared.summary?.version == 1)
        #expect(plan.shared.coverage.summarizedThrough == 2)
        #expect(plan.shared.messages.allSatisfy { $0.ordinal > 2 })
        #expect(plan.publicMessages[0]["content"]?.contains("conversation_summary") == true)
        #expect(plan.publicMessages[1]["content"]?.contains("Confirm the route") == true)
        var invalid = summary; invalid.status = "invalidated"
        let fallback = try assemble(history, summary: invalid)
        #expect(fallback.shared.summary == nil)
        #expect(fallback.shared.coverage.notices.contains("summary_invalidated"))
    }
    @Test func oversizedHistoryAndEscapedJSONDegradeWithoutTruncatingCurrentInput() throws {
        var history = contextHistory(2)
        history.records[3].message.content = String(repeating: "HUGE", count: 100000)
        let plan = try assemble(history, participants: [contextParticipant(window: 4096)])
        #expect(!plan.publicMessages.description.contains("HUGE"))
        #expect(plan.publicMessages.last?["content"] == "Plan a quiet walk")
        var summary = contextSummary(history, content: String(repeating: "\u{02}", count: 32000))
        summary.unresolved = Array(repeating: String(repeating: "\u{03}", count: 1000), count: 32); summary.contentHash = summary.semanticHash
        var persona = contextPersona(); persona.systemPrompt = String(repeating: "\u{01}", count: 12000)
        let tail = String(repeating: "\u{01}", count: 20000)
        let escaped = try assemble(history, participants: [contextParticipant(persona, window: 262144)], summary: summary, tail: tail)
        let input = try #require(escaped.inputs["sebastian"])
        #expect(try JSONSerialization.data(withJSONObject: [["role": "system", "content": persona.runtimePrompt]] + input).count < AIContext.hardBytes)
        #expect(input.last?["content"] == tail)
        #expect(escaped.shared.coverage.notices.contains("summary_byte_limit"))
    }
    @Test func failedPartialsKeepTheirStatusWhileEmptyAndStreamingRepliesAreOmitted() throws {
        var history = contextHistory(3)
        history.records[1].message.status = "failed"; history.records[1].message.content = "retained partial"
        history.records[3].message.status = "streaming"
        history.records[5].message.status = "cancelled"; history.records[5].message.content = ""
        let plan = try assemble(history)
        #expect(plan.publicMessages.description.contains("failed") && plan.publicMessages.description.contains("retained partial"))
        #expect(!plan.shared.messages.contains { $0.id == history.records[3].message.id || $0.id == history.records[5].message.id })
        history.records[1].message.status = "done"
        history.records[1].message.contextCoverage = .init(watermark: 0, totalMessages: 0, includedMessages: 0, summarizedThrough: 0, notices: ["output_budget_reached"])
        #expect(try assemble(history).publicMessages.description.contains("output_limited"))
    }
    @Test func outputBudgetClipsOnlyAtUnicodeScalarBoundaries() {
        let delta = String(repeating: "你好🙂", count: 1000)
        let clipped = AIContext.limitedDelta(current: "", delta: delta, tokens: 128)
        #expect(clipped.1 && AIContext.tokens(clipped.0) <= 128)
        #expect(delta.hasPrefix(clipped.0))
        #expect(!clipped.0.contains("�"))
    }
}

@Suite("Parlor context persistence")
struct AIContextStoreTests {
    private func fixture() async throws -> (AIStore, AIGroupMember) {
        let store = try AIStore(path: ":memory:")
        let provider = AIProvider(id: contextProvider, name: "Mock", baseURL: "https://mock.example.invalid/v1", models: [contextModel()], currency: "USD", priceUpdatedAt: aiTimestamp(), enabled: true)
        let persona = contextPersona(); try await store.savePersona(persona, account: contextAccount); try await store.saveProvider(provider, account: contextAccount)
        return (store, AIGroupMember(persona: persona, provider: provider, model: provider.models[0]))
    }
    private func append(_ count: Int, store: AIStore, conversation: String = contextConversation, account: String = contextAccount) async throws {
        for _ in 0..<count {
            let user = AIMessage(id: UUID().uuidString, conversationId: conversation, role: "user", content: "A walk question", status: "done", createdAt: aiTimestamp())
            let reply = AIMessage(id: UUID().uuidString, conversationId: conversation, role: "assistant", content: "A walk answer", status: "done", createdAt: aiTimestamp(), personaId: "sebastian", personaName: "Sebastian")
            try await store.begin(user: user, assistant: reply, account: account)
        }
    }
    @Test func pagingAndBudgetedReadsContinueBeyondThousandsOfMessages() async throws {
        let (store, member) = try await fixture(); try await append(1600, store: store)
        let newest = try await store.messagePage(contextConversation, account: contextAccount, limit: 200)
        #expect(newest.total == 3200 && newest.hasMore && newest.records.count == 200)
        let older = try await store.messagePage(contextConversation, account: contextAccount, before: newest.before, limit: 100)
        #expect(older.records.last!.ordinal < newest.records.first!.ordinal)
        let plan = try await store.makeContextPlan(account: contextAccount, conversation: contextConversation, group: false, members: [member], tail: "Continue the walk plan", currentMessageId: UUID().uuidString, instruction: nil, query: "walk")
        #expect(plan.shared.coverage.totalMessages == 3200 && plan.shared.messages.count < 3200)
        #expect(plan.publicMessages.last?["content"] == "Continue the walk plan")
    }
    @Test func summaryVersionsRejectPartialOrChangedRangesAndKeepRawMessages() async throws {
        let (store, _) = try await fixture(); try await append(3, store: store)
        let rows = try await store.messagePage(contextConversation, account: contextAccount)
        do { _ = try await store.saveConversationContext(contextConversation, persona: "sebastian", account: contextAccount, content: "Half a turn", unresolved: [], throughMessageId: rows.records[0].message.id, recentLimit: 0, expectedVersion: 0); Issue.record("Partial turn accepted") } catch {}
        let first = try await store.saveConversationContext(contextConversation, persona: "sebastian", account: contextAccount, content: "We discussed the route.", unresolved: ["Confirm a date"], throughMessageId: rows.records.last!.message.id, recentLimit: 0, expectedVersion: 0)
        var changed = rows.records.last!.message; changed.content += " corrected"; changed.seq += 1
        try await store.update(changed, account: contextAccount)
        #expect(try await store.conversationContext(contextConversation, scope: "sebastian", account: contextAccount)?.status == "invalidated")
        let second = try await store.saveConversationContext(contextConversation, persona: "sebastian", account: contextAccount, content: "Corrected route.", unresolved: [], throughMessageId: changed.id, recentLimit: 0, expectedVersion: 1)
        #expect(first.sourceHash != second.sourceHash && second.version == 2)
        #expect(try await store.messageCount(contextConversation, account: contextAccount) == 6)
        do { _ = try await store.saveConversationContext(contextConversation, persona: "sebastian", account: contextAccount, content: "Stale", unresolved: [], throughMessageId: changed.id, recentLimit: 0, expectedVersion: 1); Issue.record("Stale context version accepted") } catch {}
    }
    @Test func memoryDeletionClearsSnapshotReferencesAndPrivateHashes() async throws {
        let (store, member) = try await fixture(); try await append(1, store: store)
        let memory = try await store.saveMemory(contextMemory(), expectedVersion: 0, persona: "sebastian", account: contextAccount)
        let user = AIMessage(id: UUID().uuidString, conversationId: contextConversation, role: "user", content: "quiet walk", status: "done", createdAt: aiTimestamp())
        let plan = try await store.makeContextPlan(account: contextAccount, conversation: contextConversation, group: false, members: [member], tail: user.content, currentMessageId: user.id, instruction: nil, query: user.content)
        var reply = AIMessage(id: UUID().uuidString, conversationId: contextConversation, role: "assistant", content: "A public answer", status: "done", createdAt: aiTimestamp(), providerId: contextProvider, model: member.model, personaId: "sebastian")
        reply.contextSnapshotId = plan.generations["sebastian"]?.id; reply.contextBudget = plan.generations["sebastian"]?.budget
        try await store.begin(user: user, assistant: reply, account: contextAccount, contextPlan: plan)
        #expect(plan.generations["sebastian"]?.memories.count == 1)
        try await store.deleteMemory(memory.id, expectedVersion: 1, persona: "sebastian", account: contextAccount)
        let receipt = try #require(await store.contextSnapshot(reply.contextSnapshotId!, conversation: contextConversation, account: contextAccount))
        #expect(receipt.memories.isEmpty && receipt.inputHash.isEmpty && receipt.invalidated)
        let exported = try await store.exportBackup(account: contextAccount)
        #expect(!String(decoding: try JSONEncoder().encode(exported), as: UTF8.self).contains("SECRET_RIVER"))
    }
    @Test func malformedOptionalMemoryDegradesToHistoryWithoutAnExtraInference() async throws {
        let (store, member) = try await fixture(); try await append(1, store: store)
        let id = UUID().uuidString, payload = "{\"accountId\":\"\(contextAccount)\",\"personaId\":\"sebastian\",\"id\":\"\(id)\",\"version\":1,\"status\":\"active\"}"
        try await store.execute("INSERT INTO ai_persona_memories VALUES(?,?,?,?,?,?,?)", [contextAccount, "sebastian", id, "1", "experience", "active", payload])
        let plan = try await store.makeContextPlan(account: contextAccount, conversation: contextConversation, group: false, members: [member], tail: "Current question", currentMessageId: UUID().uuidString, instruction: nil, query: "walk")
        #expect(plan.shared.coverage.notices.contains("memory_read_failed") && !plan.shared.messages.isEmpty)
        #expect(plan.publicMessages.last?["content"] == "Current question")
    }
    @Test func backupRemapsWatermarksByStableIDsWithoutTouchingOtherAccounts() async throws {
        let (store, member) = try await fixture(); try await append(3, store: store)
        let last = try #require(await store.messagePage(contextConversation, account: contextAccount).records.last)
        let summary = try await store.saveConversationContext(contextConversation, persona: "sebastian", account: contextAccount, content: "Earlier walk plan", unresolved: ["Choose date"], throughMessageId: last.message.id, recentLimit: 0, expectedVersion: 0)
        try await append(1, store: store)
        let user = AIMessage(id: UUID().uuidString, conversationId: contextConversation, role: "user", content: "Continue", status: "done", createdAt: aiTimestamp())
        let plan = try await store.makeContextPlan(account: contextAccount, conversation: contextConversation, group: false, members: [member], tail: user.content, currentMessageId: user.id, instruction: nil, query: user.content)
        var reply = AIMessage(id: UUID().uuidString, conversationId: contextConversation, role: "assistant", content: "Next step", status: "done", createdAt: aiTimestamp(), providerId: contextProvider, model: member.model, personaId: "sebastian")
        reply.contextSnapshotId = plan.generations["sebastian"]?.id
        try await store.begin(user: user, assistant: reply, account: contextAccount, contextPlan: plan)
        let backup = try await store.exportBackup(account: contextAccount)
        _ = try await store.defaultPersona(contextOther); try await append(10, store: store, conversation: UUID().uuidString, account: contextOther)
        try await store.restoreBackup(backup, account: contextAccount)
        let restored = try #require(await store.conversationContext(contextConversation, scope: "sebastian", account: contextAccount))
        #expect(restored.throughOrdinal > summary.throughOrdinal && restored.sourceHash == summary.sourceHash)
        let publicSnapshot = try #require(await store.contextSnapshot(plan.shared.id, conversation: contextConversation, account: contextAccount))
        #expect(publicSnapshot.messages.first!.ordinal > plan.shared.messages.first!.ordinal)
        #expect(publicSnapshot.messages.map(\.id) == plan.shared.messages.map(\.id))
        #expect(try await store.conversations(contextOther).count == 1)
        try await store.validateBackup(await store.exportBackup(account: contextAccount), account: contextAccount)
    }
}
