import Foundation
import Testing
@testable import EvaOrbitHost

private let processingAccount = "71000000-0000-4000-8000-000000000001"
private let processingAda = "71000000-0000-4000-8000-000000000002"
private let processingProvider = "71000000-0000-4000-8000-000000000003"

@Suite("Parlor memory batch processing", .serialized)
@MainActor
struct AIMemoryProcessingTests {
    private func fixture() async throws -> (AIStore, ParlorPersona, AIProvider) {
        let store = try AIStore(path: ":memory:")
        let provider = AIProvider(id: processingProvider, name: "Mock", baseURL: "https://memory.example.invalid/v1", models: [.init(id: "text", name: "Text", inputPrice: 1, outputPrice: 2, contextWindow: 32768)], currency: "USD", priceUpdatedAt: aiTimestamp(), enabled: true)
        var person = ParlorPersona.sebastian; person.providerId = provider.id; person.modelId = "text"
        try await store.saveProvider(provider, account: processingAccount); try await store.savePersona(person, account: processingAccount)
        return (store, person, provider)
    }
    private func append(_ store: AIStore, conversation: String, persona: String = "sebastian", text: String = "I prefer quiet walks") async throws -> AIMessage {
        let user = AIMessage(id: UUID().uuidString, conversationId: conversation, role: "user", content: text, status: "done", createdAt: aiTimestamp())
        let reply = AIMessage(id: UUID().uuidString, conversationId: conversation, role: "assistant", content: "We can plan a walk.", status: "done", createdAt: aiTimestamp(), personaId: persona, personaName: persona)
        try await store.begin(user: user, assistant: reply, account: processingAccount); return user
    }
    private func result(_ source: AIMessage, change: String = "new", content: String? = nil, confidence: Double = 0.99) -> AIMemoryProcessingResult {
        .init(summary: "We discussed quiet walks and must confirm the date.", unresolved: ["Confirm date"], memories: [.init(kind: .understanding, nature: .userStatement, content: content ?? source.content, importance: 4, confidence: confidence, sourceIds: [source.id], change: change)])
    }
    private func running(_ store: AIStore, conversation: String, persona: String = "sebastian") async throws -> AIMemoryJob {
        var job = try #require(await store.prepareProcessing(account: processingAccount, persona: persona, conversation: conversation, trigger: "manual"))
        job.status = "running"; job.attempts = [.init(startedAt: aiTimestamp(), dispatched: true)]
        try await store.writeJob(job); return job
    }
    private func settled(_ store: AIStore, id: String) async throws -> AIMemoryJob {
        for _ in 0..<200 {
            let job = try await store.processingJob(id, persona: "sebastian", account: processingAccount)
            if !["queued", "running"].contains(job.status) { return job }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        throw AIError.busy
    }
    @Test func defaultsThresholdEndAndManualTriggersAreIndependent() async throws {
        let (store, _, _) = try await fixture(), conversation = UUID().uuidString
        _ = try await append(store, conversation: conversation)
        #expect(try await store.prepareProcessing(account: processingAccount, persona: "sebastian", conversation: conversation, trigger: "end") == nil)
        var config = try await store.processingConfig(persona: "sebastian", account: processingAccount)
        #expect(!config.automatic && !config.onConversationEnd)
        config.automatic = true; config.threshold = 10
        try await store.saveProcessingConfig(config, account: processingAccount)
        #expect(try await store.prepareProcessing(account: processingAccount, persona: "sebastian", conversation: conversation, trigger: "threshold") == nil)
        for _ in 0..<4 { _ = try await append(store, conversation: conversation) }
        let threshold = try #require(await store.prepareProcessing(account: processingAccount, persona: "sebastian", conversation: conversation, trigger: "threshold"))
        #expect(threshold.messages.count == 10)
        let endConversation = UUID().uuidString; _ = try await append(store, conversation: endConversation)
        #expect(try await store.prepareProcessing(account: processingAccount, persona: "sebastian", conversation: endConversation, trigger: "end") == nil)
        config.onConversationEnd = true; try await store.saveProcessingConfig(config, account: processingAccount)
        #expect(try await store.prepareProcessing(account: processingAccount, persona: "sebastian", conversation: endConversation, trigger: "end") != nil)
        config.automatic = false; try await store.saveProcessingConfig(config, account: processingAccount)
        let manual = UUID().uuidString; _ = try await append(store, conversation: manual)
        #expect(try await store.prepareProcessing(account: processingAccount, persona: "sebastian", conversation: manual, trigger: "manual") != nil)
    }
    @Test func clearQuoteSavesOneMemoryWithEvidenceAndSummaryWithoutDeletingHistory() async throws {
        let (store, _, _) = try await fixture(), conversation = UUID().uuidString
        let source = try await append(store, conversation: conversation), job = try await running(store, conversation: conversation)
        let completed = try await store.completeProcessing(job, result: result(source))
        #expect(completed.status == "completed" && completed.requestCount == 1)
        let memory = try #require(await store.memories(persona: "sebastian", account: processingAccount).first)
        #expect(memory.provenance?.taskId == job.id && memory.provenance?.confidence == 0.99)
        #expect(memory.sources.first?.messageId == source.id && memory.visibility == .singleChat)
        #expect(try await store.messageCount(conversation, account: processingAccount) == 2)
        #expect(try await store.conversationContext(conversation, scope: "sebastian", account: processingAccount)?.version == 1)
        #expect(try await store.prepareProcessing(account: processingAccount, persona: "sebastian", conversation: conversation, trigger: "manual") == nil)
        let backup = try await store.exportBackup(account: processingAccount); try await store.validateBackup(backup, account: processingAccount)
        #expect(backup.version == 4 && backup.schemaVersion == 9)
    }
    @Test func duplicatesConflictsAndExpiredVersionsRequireTheRightReview() async throws {
        let (store, _, _) = try await fixture(), conversation = UUID().uuidString
        let first = try await append(store, conversation: conversation), initial = try await running(store, conversation: conversation)
        _ = try await store.completeProcessing(initial, result: result(first))
        let second = try await append(store, conversation: conversation), duplicate = try await running(store, conversation: conversation)
        _ = try await store.completeProcessing(duplicate, result: result(second))
        #expect(try await store.processingProposals(persona: "sebastian", account: processingAccount).first?.status == "duplicate")
        let changed = try await append(store, conversation: conversation, text: "I prefer quiet walks only on weekdays"), conflict = try await running(store, conversation: conversation)
        _ = try await store.completeProcessing(conflict, result: result(changed, change: "conflict"))
        let proposal = try #require(await store.processingProposals(persona: "sebastian", account: processingAccount).first)
        #expect(proposal.status == "pending" && proposal.targetVersion == 1)
        #expect(try await store.memories(persona: "sebastian", account: processingAccount).first?.content == first.content)
        _ = try await store.reviewProcessingProposal(proposal.id, persona: "sebastian", account: processingAccount, accept: true, edited: changed.content)
        let saved = try #require(await store.memories(persona: "sebastian", account: processingAccount).first)
        #expect(saved.version == 2 && saved.sources.count == 2)
        let expirySource = try await append(store, conversation: conversation, text: changed.content), expiry = try await running(store, conversation: conversation)
        _ = try await store.completeProcessing(expiry, result: result(expirySource, change: "expire"))
        let expiredProposal = try #require(await store.processingProposals(persona: "sebastian", account: processingAccount).first)
        #expect(expiredProposal.status == "pending" && expiredProposal.reason == "expire")
        _ = try await store.reviewProcessingProposal(expiredProposal.id, persona: "sebastian", account: processingAccount, accept: true, edited: nil)
        let expired = try #require(await store.memories(persona: "sebastian", account: processingAccount).first)
        #expect(expired.expiredAt != nil && expired.version == 3)
        try await store.deleteMemory(expired.id, expectedVersion: 3, persona: "sebastian", account: processingAccount)
        #expect(try await store.processingProposals(persona: "sebastian", account: processingAccount).allSatisfy { $0.memory == nil && $0.status == "deleted" })
        #expect(try await store.processingJobs(persona: "sebastian", account: processingAccount).allSatisfy { $0.result == nil })
    }
    @Test func inferredFactsInvalidSourcesAndInventedTimesCannotAutoSave() async throws {
        let (store, _, _) = try await fixture(), conversation = UUID().uuidString
        let source = try await append(store, conversation: conversation), job = try await running(store, conversation: conversation)
        var invalid = result(source); invalid.memories[0].sourceIds = [UUID().uuidString]
        do { _ = try await store.completeProcessing(job, result: invalid); Issue.record("Foreign evidence accepted") } catch {}
        invalid = result(source); invalid.memories[0].eventTime = "2030-01-01T00:00:00Z"
        do { _ = try await store.completeProcessing(job, result: invalid); Issue.record("Invented time accepted") } catch {}
        var observation = result(source, content: "Perhaps the user dislikes crowds", confidence: 0.6); observation.memories[0].nature = .personaObservation
        _ = try await store.completeProcessing(job, result: observation)
        #expect(try await store.memories(persona: "sebastian", account: processingAccount).isEmpty)
        let proposal = try #require(await store.processingProposals(persona: "sebastian", account: processingAccount).first)
        _ = try await store.reviewProcessingProposal(proposal.id, persona: "sebastian", account: processingAccount, accept: false, edited: nil)
        #expect(try await store.processingProposals(persona: "sebastian", account: processingAccount).first?.status == "rejected")
    }
    @Test(arguments: ["parallel", "discussion"]) func groupInputsArePublicAndPrivateOutcomesArePersonaScoped(_ mode: String) async throws {
        let (store, sebastian, provider) = try await fixture()
        var ada = sebastian; ada.id = processingAda; ada.name = "Ada"; ada.systemPrompt = "PRIVATE_PERSONA_PROMPT"
        try await store.savePersona(ada, account: processingAccount)
        let conversation = UUID().uuidString, group = AIGroup(id: conversation, title: "Group", participants: [sebastian, ada], mode: mode)
        try await store.saveGroup(group, account: processingAccount)
        let round = AIGroupRound(id: UUID().uuidString, conversationId: conversation, content: "Public topic", context: [], members: [sebastian, ada].map { .init(persona: $0, provider: provider, model: provider.models[0]) })
        var user = AIMessage(id: UUID().uuidString, conversationId: conversation, role: "user", content: "I prefer quiet walks", status: "done", createdAt: aiTimestamp()); user.roundId = round.id
        let replies = [sebastian, ada].map { person -> AIMessage in var m = AIMessage(id: UUID().uuidString, conversationId: conversation, role: "assistant", content: "Public response", status: "done", createdAt: aiTimestamp(), personaId: person.id); m.roundId = round.id; return m }
        try await store.beginRound(round, user: user, assistants: replies, account: processingAccount)
        let own = try await running(store, conversation: conversation), peer = try await running(store, conversation: conversation, persona: ada.id)
        #expect(own.personaId != peer.personaId && own.messages.map(\.id) == peer.messages.map(\.id))
        let input = AIMemoryProcessing.input(job: peer, records: try await store.processingRecords(peer), previous: nil)
        #expect(!input.description.contains("PRIVATE_PERSONA_PROMPT"))
        _ = try await store.completeProcessing(own, result: result(user)); _ = try await store.completeProcessing(peer, result: result(user))
        let mine = try #require(await store.memories(persona: "sebastian", account: processingAccount).first), theirs = try #require(await store.memories(persona: ada.id, account: processingAccount).first)
        #expect(mine.id != theirs.id && mine.personaId != theirs.personaId)
        #expect(try await store.conversationContext(conversation, scope: "public", account: processingAccount)?.version == 1)
    }
    @Test func summaryContinuityAndUnknownPaidRetryAreDurable() async throws {
        let (store, _, _) = try await fixture(), conversation = UUID().uuidString
        let first = try await append(store, conversation: conversation), job = try await running(store, conversation: conversation)
        _ = try await store.completeProcessing(job, result: result(first))
        _ = try await append(store, conversation: conversation, text: "Confirm next Saturday")
        let next = try #require(await store.prepareProcessing(account: processingAccount, persona: "sebastian", conversation: conversation, trigger: "manual"))
        #expect(next.messages.count == 2 && next.summaryVersion == 1)
        let previous = try #require(await store.previousProcessingSummary(next))
        #expect(previous.content.contains("quiet walks"))
        let input = AIMemoryProcessing.input(job: next, records: try await store.processingRecords(next), previous: previous)
        #expect(input.description.contains("Confirm date"))
        try await store.execute(AIStore.processingRecovery)
        #expect(try await store.processingJob(next.id, persona: "sebastian", account: processingAccount).status == "interrupted")
        #expect(try await store.prepareProcessing(account: processingAccount, persona: "sebastian", conversation: conversation, trigger: "manual") == nil)
    }
    @Test func transportFailureAndExplicitRetryCountEachDispatchOnceAndReportActualUsage() async throws {
        let (store, _, _) = try await fixture(), conversation = UUID().uuidString
        let source = try await append(store, conversation: conversation)
        var calls = 0, fail = true
        let output = String(decoding: try JSONEncoder().encode(result(source)), as: UTF8.self)
        let processor = AIMemoryProcessor(store: store, transport: { _, _, dispatch, receive in
            try await dispatch(); calls += 1
            if fail { throw AIError.http(503) }
            try await receive(.init(delta: output, usage: .init(inputTokens: 71, outputTokens: 43, source: "provider"), done: true))
        }, idle: { true }, changed: { _ in })
        let id = try #require(await processor.request(account: processingAccount, persona: "sebastian", conversation: conversation))
        #expect(try await settled(store, id: id).status == "failed" && calls == 1)
        await processor.yield()
        fail = false; try await processor.retry(account: processingAccount, persona: "sebastian", id: id)
        let done = try await settled(store, id: id)
        #expect(done.requestCount == 2 && calls == 2 && done.attempts[0].usage.inputTokens == nil)
        #expect(done.attempts[1].usage.inputTokens == 71 && done.attempts[1].cost != nil)
        processor.schedule(account: processingAccount, conversation: conversation)
        await processor.yield(); #expect(calls == 2)
    }
    @Test func chatPreemptionKeepsUnknownAttemptAndDoesNotAutomaticallyResend() async throws {
        let (store, _, _) = try await fixture(), conversation = UUID().uuidString
        _ = try await append(store, conversation: conversation); var calls = 0
        let processor = AIMemoryProcessor(store: store, transport: { _, _, dispatch, _ in try await dispatch(); calls += 1; try await Task.sleep(nanoseconds: 60_000_000_000) }, idle: { true }, changed: { _ in })
        let id = try #require(await processor.request(account: processingAccount, persona: "sebastian", conversation: conversation))
        for _ in 0..<100 { if calls == 1 { break }; try await Task.sleep(nanoseconds: 10_000_000) }
        await processor.yield()
        let interrupted = try await store.processingJob(id, persona: "sebastian", account: processingAccount)
        #expect(interrupted.status == "interrupted" && interrupted.requestCount == 1 && interrupted.attempts[0].usage.inputTokens == nil)
        #expect(try await store.memories(persona: "sebastian", account: processingAccount).isEmpty)
        #expect(try await store.messageCount(conversation, account: processingAccount) == 2)
    }
    @Test(.timeLimit(.minutes(1)), arguments: ["cancel", "account_switch"])
    func manualAndRetryShareOneTaskSlot(_ action: String) async throws {
        let (store, _, _) = try await fixture()
        let firstConversation = UUID().uuidString, retryConversation = UUID().uuidString
        _ = try await append(store, conversation: firstConversation)
        _ = try await append(store, conversation: retryConversation)
        var previous = try await running(store, conversation: retryConversation)
        previous.status = "failed"
        try await store.writeJob(previous)
        let previousID = previous.id
        var signal: AsyncStream<Void>.Continuation?
        let started = AsyncStream<Void> { signal = $0 }
        var calls = 0
        let processor = AIMemoryProcessor(store: store, transport: { _, _, dispatch, _ in
            try await dispatch()
            calls += 1
            signal?.yield(())
            try await Task.sleep(nanoseconds: 60_000_000_000)
        }, idle: { true }, changed: { _ in })
        defer { processor.cancel() }
        // Queue both operations on MainActor before either can resume its preparation.
        let manual = Task { try await processor.request(account: processingAccount, persona: "sebastian", conversation: firstConversation) }
        let retry = Task { try await processor.retry(account: processingAccount, persona: "sebastian", id: previousID) }
        let winner: String
        do {
            winner = try #require(await manual.value)
            await #expect(throws: AIError.busy) { try await retry.value }
        } catch AIError.busy {
            try await retry.value
            winner = previousID
        }
        var observer = started.makeAsyncIterator()
        _ = await observer.next()
        if action == "cancel" {
            try await processor.cancel(account: processingAccount, persona: "sebastian")
        } else {
            processor.cancel() // Runtime interruption on account change.
            await processor.yield()
        }
        let job = try await store.processingJob(winner, persona: "sebastian", account: processingAccount)
        #expect(job.status == (action == "cancel" ? "cancelled" : "interrupted"))
        #expect(calls == 1)
        #expect(try await store.processingJobs(persona: "sebastian", account: processingAccount, all: true).allSatisfy { !["queued", "running"].contains($0.status) })
    }
    @Test func cachedReceivedResultRetriesLocallyWithoutAnotherInference() async throws {
        let (store, _, _) = try await fixture(), conversation = UUID().uuidString
        let source = try await append(store, conversation: conversation), job = try await running(store, conversation: conversation)
        try await store.cacheProcessingResult(job, result: result(source))
        var interrupted = try await store.processingJob(job.id, persona: "sebastian", account: processingAccount)
        interrupted.status = "interrupted"; try await store.writeJob(interrupted)
        var calls = 0
        let processor = AIMemoryProcessor(store: store, transport: { _, _, _, _ in calls += 1; throw AIError.stream }, idle: { true }, changed: { _ in })
        try await processor.retry(account: processingAccount, persona: "sebastian", id: job.id)
        let finished = try await settled(store, id: job.id)
        #expect(finished.status == "completed" && finished.requestCount == 1 && calls == 0)
        #expect(try await store.conversationContext(conversation, scope: "sebastian", account: processingAccount)?.processingInputHash == job.inputHash)
    }
    @Test func backupPreservesJobsAndUsageButDisablesAutomaticProcessingOnRestore() async throws {
        let (store, _, _) = try await fixture(), conversation = UUID().uuidString
        let source = try await append(store, conversation: conversation), job = try await running(store, conversation: conversation)
        _ = try await store.completeProcessing(job, result: result(source))
        var config = try await store.processingConfig(persona: "sebastian", account: processingAccount)
        config.automatic = true; try await store.saveProcessingConfig(config, account: processingAccount)
        let backup = try await store.exportBackup(account: processingAccount)
        try await store.restoreBackup(backup, account: processingAccount, createSafetyBackup: false)
        let restored = try await store.processingJob(job.id, persona: "sebastian", account: processingAccount)
        #expect(restored.requestCount == 1 && restored.status == "completed")
        #expect(try await store.processingConfig(persona: "sebastian", account: processingAccount).automatic == false)
        #expect(try await store.providers(processingAccount).allSatisfy { !$0.enabled })
        try await store.validateBackup(await store.exportBackup(account: processingAccount), account: processingAccount)
    }

    @Test func unresolvedTopicsSurviveOmissionAndRequireExplicitCompletionEvidence() async throws {
        let (store, _, _) = try await fixture(), conversation = UUID().uuidString
        let first = try await append(store, conversation: conversation), initial = try await running(store, conversation: conversation)
        _ = try await store.completeProcessing(initial, result: result(first))
        let second = try await append(store, conversation: conversation, text: "The route is quiet"), next = try await running(store, conversation: conversation)
        var update = result(second); update.unresolved = []; update.memories = []
        _ = try await store.completeProcessing(next, result: update)
        #expect(try await store.conversationContext(conversation, scope: "sebastian", account: processingAccount)?.unresolved == ["Confirm date"])
        let final = try await append(store, conversation: conversation, text: "Confirmed the date"), last = try await running(store, conversation: conversation)
        update.summary = "The date is confirmed."
        update.resolved = [.init(topic: "Confirm date", sourceIds: [final.id])]
        _ = try await store.completeProcessing(last, result: update)
        #expect(try await store.conversationContext(conversation, scope: "sebastian", account: processingAccount)?.unresolved.isEmpty == true)
    }

    @Test func reuseWithoutDefaultUsesOnlyThisPersonasLastActualModel() async throws {
        let (store, person, provider) = try await fixture(), conversation = UUID().uuidString
        _ = try await append(store, conversation: conversation)
        var second = provider; second.id = "71000000-0000-4000-8000-000000000004"; second.name = "Explicitly used model"; second.baseURL = "https://second.example.invalid/v1"
        try await store.saveProvider(second, account: processingAccount)
        var withoutDefault = person; withoutDefault.providerId = nil; withoutDefault.modelId = nil
        try await store.savePersona(withoutDefault, account: processingAccount)
        var reply = try #require(await store.messagePage(conversation, account: processingAccount).records.last?.message)
        reply.providerId = second.id; reply.model = second.models[0]; reply.seq += 1
        try await store.update(reply, account: processingAccount)
        let job = try #require(await store.prepareProcessing(account: processingAccount, persona: "sebastian", conversation: conversation, trigger: "manual"))
        #expect(job.provider.id == second.id && job.provider.id != provider.id)
    }

}
