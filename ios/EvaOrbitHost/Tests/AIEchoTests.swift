import Foundation
import Testing
@testable import EvaOrbitHost

private let echoAccount = "81000000-0000-4000-8000-000000000001"
private let echoOther = "81000000-0000-4000-8000-000000000002"
private let echoEntity = "81000000-0000-4000-8000-000000000003"

@Suite("Echo optional shared memory", .serialized)
@MainActor
struct AIEchoTests {
    private func envelope(_ status: String = "complete") throws -> [String: Any] {
        let packet: [String: Any] = ["version": 1, "time": ["mode": "current"], "current_facts": [], "historical_facts": [], "unknown_facts": [], "memos": [], "entities": [], "sources": []]
        var body = packet
        body["query"] = ["original": "quiet walks", "variants": ["quiet walks"], "terms": ["quiet", "walks"]]
        body["notices"] = []; body["context_text"] = try AIEcho.json(packet)
        body["coverage"] = ["status": status, "complete": status == "complete", "truncated": status == "partial", "reasons": status == "partial" ? ["character_budget"] : [], "matched_count": 4, "returned_count": 0]
        body["future_field"] = ["preserve": true]
        return ["protocol": AIEcho.protocolName, "context": body]
    }
    private func fixture() async throws -> (AIStore, String, AIMessage, AIMessage) {
        let store = try AIStore(path: ":memory:")
        try await store.savePersona(.sebastian, account: echoAccount)
        let cid = UUID().uuidString
        let user = AIMessage(id: UUID().uuidString, conversationId: cid, role: "user", content: "I prefer quiet walks", status: "done", createdAt: aiTimestamp())
        let assistant = AIMessage(id: UUID().uuidString, conversationId: cid, role: "assistant", content: "Perhaps crowds are tiring", status: "done", createdAt: aiTimestamp(), personaId: "sebastian")
        try await store.begin(user: user, assistant: assistant, account: echoAccount)
        try await store.configureEcho(echoAccount, read: true, write: true)
        return (store, cid, user, assistant)
    }
    private func draft(_ store: AIStore, cid: String, message: AIMessage) async throws -> AIEchoShare {
        try await store.prepareEchoShare(account: echoAccount, persona: "sebastian", entity: echoEntity, predicate: "preference", memoryId: nil, version: nil, conversation: cid, messageId: message.id, excerpt: message.content)
    }
    private func protocolBody() -> [String: Any] { ["protocol": AIEcho.protocolName, "fullContext": true, "candidateLookup": true, "manualCandidates": true] }
    @Test func completeProtocolPreservesUnknownCoverageAndEvidenceFields() throws {
        let snapshot = try AIEcho.snapshot(account: echoAccount, query: "walks", envelope: envelope("partial"))
        let text = try #require(snapshot.message?["content"])
        #expect(snapshot.truncated && !snapshot.complete)
        #expect(text.contains("future_field") && text.contains("character_budget") && text.contains("historical_facts"))
        #expect(!text.contains("context_text")) // Only the byte-for-byte equivalent JSON packet is deduplicated.
        var legacy = try envelope(); legacy["protocol"] = "legacy"
        #expect(throws: AIError.invalidContext) { try AIEcho.snapshot(account: echoAccount, query: "walks", envelope: legacy) }
        #expect(AIEcho.keywords(String(repeating: "安静散步路线 ", count: 1000)).count <= 160)
    }
    @Test func cacheIsAccountScopedAndDisabledReadsNeverDispatch() async throws {
        let (store, _, _, _) = try await fixture(), packet = try envelope()
        var calls = 0
        let client = AIEchoClient(store: store) { _, _, _, _ in calls += 1; return ["status": 200, "body": packet] }
        let first = try #require(await client.recall(account: echoAccount, text: "quiet walks"))
        let cached = try #require(await client.recall(account: echoAccount, text: "quiet walks"))
        #expect(calls == 1 && first.id == cached.id)
        #expect(try await store.echoSnapshot(first.id, account: echoOther) == nil)
        #expect(await client.recall(account: echoOther, text: "quiet walks") == nil)
        try await client.configure(account: echoAccount, read: false, write: true)
        #expect(await client.recall(account: echoAccount, text: "quiet walks") == nil)
        #expect(try await store.echoSnapshot(first.id, account: echoAccount)?.contextJSON == nil)
        let config = try await store.echoConfig(echoAccount)
        #expect(calls == 1 && config.apiAttempts == 1)
    }
    @Test(.timeLimit(.minutes(1)), arguments: ["disable", "disable_reenable", "clear", "account_switch"])
    func lateRecallCannotSaveOrInjectARevokedResponse(_ action: String) async throws {
        let (store, _, _, _) = try await fixture(), packet = try envelope()
        var startedSignal: AsyncStream<Void>.Continuation?
        let started = AsyncStream<Void> { startedSignal = $0 }
        // The transport deliberately returns a response even if its task is cancelled.
        var resume: CheckedContinuation<Void, Never>?
        let delayedClient = AIEchoClient(store: store) { account, _, _, _ in
            #expect(account == echoAccount)
            await withCheckedContinuation { continuation in
                resume = continuation
                startedSignal?.yield(())
            }
            return ["status": 200, "body": packet]
        }
        let pending = Task { await delayedClient.recall(account: echoAccount, text: "quiet walks", discussion: "old-discussion") }
        var observer = started.makeAsyncIterator()
        _ = await observer.next()
        defer { resume?.resume() }
        switch action {
        case "clear": try await delayedClient.clear(account: echoAccount)
        case "account_switch":
            delayedClient.cancel()
            try await store.configureEcho(echoOther, read: true, write: false)
        default:
            try await delayedClient.configure(account: echoAccount, read: false, write: false)
            if action == "disable_reenable" { try await delayedClient.configure(account: echoAccount, read: true, write: false) }
        }
        resume?.resume(); resume = nil
        #expect(await pending.value == nil)
        #expect(try await store.echoBinding("old-discussion", account: echoAccount) == nil)
        let config = try await store.echoConfig(echoAccount)
        #expect(config.lastSnapshotId == nil)
        #expect(config.readEnabled == (action != "disable"))
        #expect(config.writeEnabled == (action == "clear" || action == "account_switch"))
        #expect(try await store.echoConfig(echoOther).lastSnapshotId == nil)
    }
    @Test(.timeLimit(.minutes(1))) func delayedProtocolCheckCannotResumeAnEntityRequestAfterWriteRevocation() async throws {
        let (store, _, _, _) = try await fixture()
        var signal: AsyncStream<Void>.Continuation?
        let started = AsyncStream<Void> { signal = $0 }
        var resume: CheckedContinuation<Void, Never>?
        var calls = 0
        let body = protocolBody()
        let client = AIEchoClient(store: store) { _, _, _, _ in
            calls += 1
            await withCheckedContinuation { continuation in
                resume = continuation
                signal?.yield(())
            }
            return ["status": 200, "body": body]
        }
        let pending = Task { try await client.entities(account: echoAccount, query: "walks", cursor: nil) }
        var observer = started.makeAsyncIterator()
        _ = await observer.next()
        defer { resume?.resume() }
        try await client.configure(account: echoAccount, read: true, write: false)
        resume?.resume(); resume = nil
        await #expect(throws: CancellationError.self) { _ = try await pending.value }
        let config = try await store.echoConfig(echoAccount)
        #expect(calls == 1 && config.readEnabled && !config.writeEnabled && config.connectionStatus == nil)
    }
    @Test func storeRejectsAnOldPermitAndContextCannotUseAnErasedSnapshot() async throws {
        let (store, conversation, _, _) = try await fixture()
        let snapshot = try AIEcho.snapshot(account: echoAccount, query: "quiet walks", envelope: envelope())
        let access = AIEchoAccess(account: echoAccount, writing: false)
        try await store.recordEchoRecall(snapshot, discussion: nil, access: access)
        access.revoke()
        try await store.configureEcho(echoAccount, read: false, write: true)
        try await store.configureEcho(echoAccount, read: true, write: true)
        await #expect(throws: CancellationError.self) {
            try await store.recordEchoRecall(snapshot, discussion: nil, access: access)
        }
        let model = AIModel(id: "fixture", name: "Fixture", contextWindow: 8192)
        let provider = AIProvider(id: UUID().uuidString, name: "Fixture", baseURL: "https://echo.example.invalid", models: [model], currency: "USD", priceUpdatedAt: aiTimestamp(), enabled: true)
        let member = AIGroupMember(persona: .sebastian, provider: provider, model: model)
        let plan = try await store.makeContextPlan(account: echoAccount, conversation: conversation, group: false, members: [member], tail: "quiet walks", currentMessageId: nil, instruction: nil, query: "quiet walks", echo: snapshot)
        #expect(!plan.publicMessages.contains { $0["content"]?.contains("future_field") == true })
        #expect(try await store.echoSnapshot(snapshot.id, account: echoAccount)?.contextJSON == nil)
    }
    @Test func discussionFreezesExpiredSnapshotAndRefreshesOnlyAtTopicBoundary() async throws {
        let (store, _, _, _) = try await fixture(), packet = try envelope()
        var calls = 0
        let client = AIEchoClient(store: store) { _, _, _, _ in calls += 1; return ["status": 200, "body": packet] }
        let first = try #require(await client.recall(account: echoAccount, text: "quiet walks", discussion: "discussion"))
        try await store.execute("UPDATE ai_echo_snapshots SET payload=json_set(payload,'$.expiresAt','2000-01-01T00:00:00Z') WHERE account_id=?", [echoAccount])
        let frozen = try #require(await client.recall(account: echoAccount, text: "quiet walks", discussion: "discussion"))
        #expect(frozen.id == first.id && calls == 1)
        let fresh = try #require(await client.recall(account: echoAccount, text: "new topic telescope planetary astronomy observatory", discussion: "discussion"))
        #expect(fresh.id != first.id && calls == 2)
    }
    @Test func failedAndLegacyReadsFallBackAndFreezeWithoutAutomaticRetry() async throws {
        let (store, _, _, _) = try await fixture()
        var calls = 0
        let client = AIEchoClient(store: store) { _, _, _, _ in calls += 1; throw URLError(.timedOut) }
        let failed = try #require(await client.recall(account: echoAccount, text: "quiet walks", discussion: "discussion"))
        #expect(failed.message == nil && failed.status == "timeout")
        let frozen = try #require(await client.recall(account: echoAccount, text: "quiet walks", discussion: "discussion"))
        #expect(failed.id == frozen.id && calls == 1)
        let legacy = AIEchoClient(store: store) { _, _, _, _ in ["status": 200, "body": ["facts": []]] }
        #expect(await legacy.recall(account: echoAccount, text: "other question")?.message == nil)
    }
    @Test func parallelUsesOnePublicEchoPacketAndIndependentPrivateMemory() throws {
        let snapshot = try AIEcho.snapshot(account: echoAccount, query: "walks", envelope: envelope())
        var ada = ParlorPersona.sebastian; ada.id = "81000000-0000-4000-8000-000000000004"; ada.name = "Ada"
        let memory = AIPersonaMemory(id: UUID().uuidString, accountId: echoAccount, personaId: "sebastian", kind: .experience, content: "quiet walks PRIVATE_RIVER", importance: 5, nature: .sharedExperience, sources: [], createdAt: aiTimestamp(), updatedAt: aiTimestamp(), version: 1, status: .active, visibility: .allChats)
        let participants = [AIContextParticipant(persona: .sebastian, providerId: "mock", model: .init(id: "a", name: "A", contextWindow: 16384), memories: [memory]), AIContextParticipant(persona: ada, providerId: "mock", model: .init(id: "b", name: "B", contextWindow: 8192), memories: [])]
        let plan = try AIContext.assemble(account: echoAccount, conversation: UUID().uuidString, group: true, history: .init(records: [], total: 0, watermark: 0, truncated: false), summary: nil, participants: participants, tail: "quiet walks", currentMessageId: nil, instruction: nil, query: "quiet walks", echo: snapshot)
        #expect(plan.shared.echo?.id == snapshot.id && plan.shared.budget.contextWindow == 8192)
        #expect(plan.publicMessages.filter { $0["content"]?.contains("echo_shared_memory;") == true }.count == 1)
        #expect(plan.inputs[ada.id]?.description.contains("PRIVATE_RIVER") == false)
        #expect(plan.inputs["sebastian"]?.description.contains("PRIVATE_RIVER") == true)
        #expect(plan.generations.values.allSatisfy { ($0.budget.echoTokens ?? 0) > 0 && $0.publicSnapshotId == plan.shared.id })
    }
    @Test func previewHasStableRequestAndSharingInferenceNeverConfirmsFact() async throws {
        let (store, cid, user, assistant) = try await fixture()
        let first = try await draft(store, cid: cid, message: user), repeated = try await draft(store, cid: cid, message: user)
        #expect(first.requestId == repeated.requestId && first.epistemicType == "direct_statement")
        let inferred = try await draft(store, cid: cid, message: assistant)
        #expect(inferred.epistemicType == "agent_judgment")
        let body = try JSONSerialization.jsonObject(with: Data(try #require(inferred.payloadJSON).utf8)) as? [String: Any]
        let input = try #require(body?["submission"] as? [String: Any])
        #expect(input["reviewMode"] as? String == "manual" && input["proposedBy"] as? String == "model")
        #expect((input["sources"] as? [[String: Any]])?.first?["excerpt"] as? String == assistant.content)
        #expect(try await store.echoConfig(echoAccount).apiAttempts == 0)
        do { _ = try await store.echoShare(first.requestId, persona: "ada", account: echoAccount); Issue.record("Foreign persona read accepted") } catch {}
    }
    @Test func lostPostResponseCanBeRecoveredByLookupWithoutAnotherPost() async throws {
        let (store, cid, user, _) = try await fixture(), share = try await draft(store, cid: cid, message: user)
        let body = try JSONSerialization.jsonObject(with: Data(try #require(share.payloadJSON).utf8)) as? [String: Any]
        let input = try #require(body?["submission"] as? [String: Any])
        let candidate: [String: Any] = ["id": UUID().uuidString, "requestId": share.requestId, "client": "parlor", "reviewMode": "manual", "status": "pending", "proposedFact": input["fact"]!, "proposedSources": input["sources"]!]
        var posts = 0, saved = false
        let client = AIEchoClient(store: store) { _, path, method, _ in
            if path.contains("parlor_protocol") { return ["status": 200, "body": protocolBody()] }
            if method == "POST" { posts += 1; saved = true; throw URLError(.networkConnectionLost) }
            return ["status": 200, "body": ["protocol": AIEcho.protocolName, "candidate": saved ? candidate as Any : NSNull()]]
        }
        do { _ = try await client.share(account: echoAccount, persona: "sebastian", id: share.requestId, confirmed: true, checkOnly: false); Issue.record("Lost response should be unknown") } catch {}
        #expect(try await store.echoShare(share.requestId, persona: "sebastian", account: echoAccount).status == "unknown")
        let receipt = try await client.share(account: echoAccount, persona: "sebastian", id: share.requestId, confirmed: false, checkOnly: true)
        #expect(receipt.candidateId == candidate["id"] as? String && posts == 1)
        #expect(try await store.echoConfig(echoAccount).apiAttempts == 5)
    }
    @Test func backupKeepsReceiptsButRestoresNoEchoBodiesOrPermissions() async throws {
        let (store, cid, user, _) = try await fixture()
        _ = try await draft(store, cid: cid, message: user)
        let snapshot = try AIEcho.snapshot(account: echoAccount, query: "walks", envelope: envelope())
        try await store.saveEchoSnapshot(snapshot, binding: "discussion")
        let backup = try await store.exportBackup(account: echoAccount)
        #expect(backup.version == 4 && backup.payload.echoSnapshots?.first?.contextJSON == nil)
        try await store.validateBackup(backup, account: echoAccount)
        _ = try await store.restoreBackup(backup, account: echoAccount)
        let restored = try await store.echoConfig(echoAccount)
        #expect(!restored.readEnabled && !restored.writeEnabled)
        #expect(try await store.echoBinding("discussion", account: echoAccount) == nil)
        #expect(try await store.echoShares(persona: "sebastian", account: echoAccount).count == 1)
    }
    @Test func oldServerCannotReceiveEvenAConfirmedWrite() async throws {
        let (store, cid, user, _) = try await fixture(), share = try await draft(store, cid: cid, message: user)
        var posts = 0
        let client = AIEchoClient(store: store) { _, _, method, _ in
            if method == "POST" { posts += 1 }
            return ["status": 200, "body": ["facts": []]]
        }
        do { _ = try await client.share(account: echoAccount, persona: "sebastian", id: share.requestId, confirmed: true, checkOnly: false); Issue.record("Legacy server accepted") } catch {}
        #expect(posts == 0)
        #expect(try await store.echoShare(share.requestId, persona: "sebastian", account: echoAccount).status == "preview")
    }
    @Test func restoredOrTamperedDraftCannotRelabelAssistantAsDirectUserEvidence() async throws {
        let (store, cid, _, assistant) = try await fixture()
        var share = try await draft(store, cid: cid, message: assistant)
        share.epistemicType = "direct_statement"
        share.payloadJSON = try #require(share.payloadJSON).replacingOccurrences(of: "agent_judgment", with: "direct_statement")
        share.payloadHash = AIContext.hash(share.payloadJSON!)
        do { try await store.verifyEchoShare(share); Issue.record("Inference relabeled as user evidence") } catch {}
    }
    @Test func budgetDropsWholeEchoWithoutCuttingCurrentQuestion() throws {
        var packet = try envelope(), body = try #require(packet["context"] as? [String: Any])
        body["future_field"] = String(repeating: "private evidence ", count: 5000); packet["context"] = body
        let snapshot = try AIEcho.snapshot(account: echoAccount, query: "walks", envelope: packet)
        let participant = AIContextParticipant(persona: .sebastian, providerId: "mock", model: .init(id: "small", name: "Small", contextWindow: 8192), memories: [])
        let plan = try AIContext.assemble(account: echoAccount, conversation: UUID().uuidString, group: false, history: .init(records: [], total: 0, watermark: 0, truncated: false), summary: nil, participants: [participant], tail: "Keep this current question", currentMessageId: nil, instruction: nil, query: "walks", echo: snapshot)
        #expect(plan.shared.echo == nil && plan.shared.coverage.notices.contains("echo_budget_omitted"))
        #expect(plan.publicMessages.last?["content"] == "Keep this current question")
        #expect(plan.generations["sebastian"]?.budget.echoTokens == 0)
    }
}
