import Foundation
import Testing
@testable import EvaOrbitHost

private let accountA = "10000000-0000-4000-8000-000000000001"
private let accountB = "10000000-0000-4000-8000-000000000002"
private let providerID = "10000000-0000-4000-8000-000000000003"

private func fixtureProvider() -> AIProvider {
    AIProvider(id: providerID, name: "Mock", baseURL: "https://mock.example.invalid/v1", models: [AIModel(id: "mock-text", name: "Mock text", inputPrice: 2, outputPrice: 4)], currency: "USD", priceUpdatedAt: "2026-11-16T00:00:00Z", enabled: true)
}
private func temporaryStore() throws -> (AIStore, URL) {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("eva-ai-test-" + UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return (try AIStore(path: directory.appendingPathComponent("ai.sqlite3").path), directory)
}

private final class MemoryAISecrets: AISecretStore {
    var values: [String: String] = [:]
    func read(account: String, provider: String) throws -> String? { values[account + provider] }
    func write(_ value: String, account: String, provider: String) throws { values[account + provider] = value }
    func remove(account: String, provider: String) throws { values.removeValue(forKey: account + provider) }
}

@Suite("Native model directory")
struct AIModelCatalogTests {
    private func decode(_ rows: [[String: Any]], official: Bool = true) throws -> AIModelCatalog {
        try AIModelCatalog.decode(JSONSerialization.data(withJSONObject: ["data": rows]),
                                  endpoint: URL(string: official ? "https://openrouter.ai/api/v1/models" : "https://mock.example.invalid/v1/models")!, secret: "test-secret")
    }
    @Test func directoryPricesHaveExplicitUnitsAndZeroIsNotUnknown() throws {
        let result = try decode([
            ["id": "vendor/chat", "name": "Chat", "context_length": 128000, "pricing": ["prompt": "0.0000025", "completion": "0.00001", "input_cache_read": "0"]],
            ["id": "vendor/unknown", "pricing": ["prompt": "-1", "completion": true]],
            ["id": "vendor/chat"],
            ["id": "images", "architecture": ["output_modalities": ["image"]]],
            ["id": "secret", "name": "test-secret"]
        ])
        #expect(result.models.count == 2)
        #expect(result.models[0].model.inputPrice == 2.5)
        #expect(result.models[0].model.outputPrice == 10)
        #expect(result.models[0].model.cachedInputPrice == 0)
        #expect(result.models[0].model.contextWindow == 128000)
        #expect(result.models[1].model.inputPrice == nil)
        #expect(result.models[1].model.outputPrice == nil)
        #expect(result.currency == "USD")
    }
    @Test func compatibleNamesDoNotEstablishPricingUnitsAndExtraFeesPreventFalseTotals() throws {
        let row: [String: Any] = ["id": "chat", "pricing": ["prompt": "0.000001", "completion": "0.000002", "request": "0.01"]]
        let generic = try decode([row], official: false)
        #expect(generic.models[0].model.inputPrice == nil)
        let official = try decode([row])
        #expect(official.models[0].model.inputPrice == 1)
        #expect(official.models[0].model.priceEstimateLimited == true)
        #expect(AIUsage(inputTokens: 100, outputTokens: 20).cost(model: official.models[0].model) == nil)
        #expect(throws: AIError.self) { try AIModelCatalog.decode(Data("{\"error\":\"test-secret\"}".utf8), endpoint: URL(string: "https://mock.example.invalid/v1/models")!, secret: "test-secret") }
    }
    @Test func longFineTuneIDsSurviveDisplayNameLimitsAndUnknownNamespacesDoNotCrash() throws {
        let id = String(repeating: "x", count: 150)
        let result = try decode([["id": id], ["id": "/"]], official: false)
        #expect(result.models.count == 2)
        #expect(result.models[0].model.id == id)
        #expect(result.models[0].model.name.count == 100)
        #expect(result.models[1].family.isEmpty)
    }
    @MainActor @Test func directoryRequestUsesOnlyProviderCredentialsAndDoesNotMutateModels() async throws {
        let (store, directory) = try temporaryStore(); defer { try? FileManager.default.removeItem(at: directory) }
        let secrets = MemoryAISecrets(); try secrets.write("catalog-key", account: accountA, provider: providerID)
        try await store.saveProvider(fixtureProvider(), account: accountA)
        var requests = 0
        let runtime = AIRuntime(store: store, secrets: secrets, catalog: { request, secret in
            requests += 1
            #expect(request.httpMethod == "GET")
            #expect(request.url?.path == "/v1/models")
            #expect(request.value(forHTTPHeaderField: "Cookie") == nil)
            #expect(!request.httpShouldHandleCookies)
            #expect(secret == "catalog-key")
            return AIModelCatalog(models: [], fetchedAt: aiTimestamp())
        }, stream: { _, _ in Issue.record("Catalog lookup must not run inference") })
        let parameters: [String: Any] = ["providerId": providerID, "baseURL": fixtureProvider().baseURL]
        _ = try await runtime.handle("ai.listModels", account: accountA, parameters: parameters, emit: { _ in })
        #expect(requests == 1)
        #expect(try await store.providers(accountA).first?.models.count == 1)
        do {
            _ = try await runtime.handle("ai.listModels", account: accountB, parameters: parameters, emit: { _ in })
            Issue.record("Another account reused a stored key")
        } catch { #expect(error is AIError) }
        do {
            _ = try await runtime.handle("ai.listModels", account: accountA, parameters: ["providerId": providerID, "baseURL": "https://other.example.invalid/v1"], emit: { _ in })
            Issue.record("A changed endpoint reused a stored key")
        } catch { #expect(error is AIError) }
        #expect(requests == 1)
    }
    @MainActor @Test(arguments: [true, false]) func directoryRequestIsCancelledWithoutInference(interruption: Bool) async throws {
        let (store, directory) = try temporaryStore(); defer { try? FileManager.default.removeItem(at: directory) }
        var started = false
        let runtime = AIRuntime(store: store, secrets: MemoryAISecrets(), catalog: { _, _ in
            started = true
            try await Task.sleep(nanoseconds: 60_000_000_000)
            return AIModelCatalog(models: [], fetchedAt: aiTimestamp())
        })
        let request = Task { try await runtime.handle("ai.listModels", account: accountA, parameters: ["providerId": providerID, "baseURL": fixtureProvider().baseURL, "apiKey": "draft-key"], emit: { _ in }) }
        for _ in 0..<100 { if started { break }; try await Task.sleep(nanoseconds: 10_000_000) }
        if interruption { runtime.interrupt() }
        else {
            _ = try await runtime.handle("ai.cancelModelList", account: accountB, parameters: [:], emit: { _ in })
            _ = try await runtime.handle("ai.cancelModelList", account: accountA, parameters: [:], emit: { _ in })
        }
        do { _ = try await request.value; Issue.record("Cancelled catalog was delivered") }
        catch { #expect(error is CancellationError) }
        #expect(try await store.providers(accountA).isEmpty)
    }
}

@Suite("Native Eva SSE")
struct AIStreamTests {
    @Test func byteSplitsUnicodeCRLFMultilineAndEOF() throws {
        let raw = "\u{feff}: ping\r\ndata: {\r\ndata: \"choices\":[{\"delta\":{\"content\":\"你好🌙\"}}]}\r\n\r\ndata: [DONE]\r"
        var parser = AISSEParser(), parts: [AIStreamPart] = []
        for byte in raw.utf8 {
            for (event, data) in try parser.append(byte) { parts.append(try AIStreamPart.decode(event: event, data: data)) }
        }
        for (event, data) in try parser.finish() { parts.append(try AIStreamPart.decode(event: event, data: data)) }
        #expect(parts.map(\.delta).joined() == "你好🌙")
        #expect(parts.last?.done == true)
    }
    @Test func errorBodiesAreNeverExposedAndFramesAreBounded() throws {
        #expect(throws: AIError.self) { try AIStreamPart.decode(event: "error", data: "secret-echo") }
        #expect(throws: AIError.self) { try AIStreamPart.decode(event: "", data: "{\"error\":{\"message\":\"secret-echo\"}}") }
        #expect(throws: AIError.self) { try AIStreamPart.decode(event: "", data: "{broken") }
        var parser = AISSEParser()
        #expect(throws: AIError.self) { for _ in 0...AISSEParser.maxEventBytes { _ = try parser.append(65) } }
        var invalid = AISSEParser()
        _ = try invalid.append(0xff)
        #expect(throws: AIError.self) { try invalid.finish() }
        #expect(!AIError.http(401).localizedDescription.contains("secret-echo"))
    }
    @Test func usageAndUnknownCost() throws {
        let part = try AIStreamPart.decode(event: "", data: "{\"choices\":[],\"usage\":{\"prompt_tokens\":100,\"completion_tokens\":20,\"prompt_tokens_details\":{\"cached_tokens\":10}}}")
        let usage = try #require(part.usage)
        #expect(usage.inputTokens == 100)
        #expect(usage.cachedTokens == 10)
        #expect(usage.cost(model: fixtureProvider().models[0]) == nil)
        var model = fixtureProvider().models[0]; model.cachedInputPrice = 1
        #expect(abs((usage.cost(model: model) ?? 0) - 0.00027) < 0.00000001)
        #expect(AIUsage().cost(model: model) == nil)
    }
    @Test func providerTransportHasNoCookiesOrCredentialCache() throws {
        let config = AIProviderAdapter.configuration()
        #expect(config.httpCookieStorage == nil)
        #expect(!config.httpShouldSetCookies)
        #expect(config.urlCredentialStorage == nil)
        #expect(config.urlCache == nil)
        var provider = fixtureProvider()
        for url in ["http://mock.example.invalid/v1", "https://key@mock.example.invalid/v1", "https://mock.example.invalid/v1?key=bad"] {
            provider.baseURL = url
            #expect(throws: AIError.self) { try provider.validate() }
        }
    }
}

@Suite("Native Eva storage and requests", .serialized)
@MainActor
struct AIRuntimeTests {
    @Test func defaultPersonaPersistsIndependentlyAndDoesNotRewriteHistory() async throws {
        let (store, directory) = try temporaryStore(); defer { try? FileManager.default.removeItem(at: directory) }
        var persona = try await store.defaultPersona(accountA)
        #expect(persona.id == "sebastian")
        #expect(persona.name == "Sebastian")
        #expect(persona.providerId == nil)
        let conversation = UUID().uuidString
        let user = AIMessage(id: UUID().uuidString, conversationId: conversation, role: "user", content: "hello", status: "done", createdAt: aiTimestamp())
        let reply = AIMessage(id: UUID().uuidString, conversationId: conversation, role: "assistant", content: "hello", status: "done", createdAt: aiTimestamp(), personaId: persona.id, personaName: persona.name)
        try await store.begin(user: user, assistant: reply, account: accountA)
        persona.name = "Sebastian II"; persona.preferredAddress = "Alex"
        try await store.savePersona(persona, account: accountA)
        let reopened = try AIStore(path: directory.appendingPathComponent("ai.sqlite3").path)
        #expect(try await reopened.defaultPersona(accountA).name == "Sebastian II")
        #expect(try await reopened.defaultPersona(accountB).name == "Sebastian")
        #expect(try await reopened.messages(conversation, account: accountA).last?.personaName == "Sebastian")
        #expect(persona.runtimePrompt.contains("没有工具"))
    }
    @Test func storeScopesAccountsAndRecoversPartialTextAfterReopen() async throws {
        let (store, directory) = try temporaryStore()
        defer { try? FileManager.default.removeItem(at: directory) }
        let conversation = UUID().uuidString
        let user = AIMessage(id: UUID().uuidString, conversationId: conversation, role: "user", content: "hello", status: "done", createdAt: aiTimestamp())
        let draft = AIMessage(id: UUID().uuidString, conversationId: conversation, role: "assistant", content: "partial 你好", status: "streaming", createdAt: aiTimestamp(), requestId: UUID().uuidString)
        try await store.saveProvider(fixtureProvider(), account: accountA)
        try await store.begin(user: user, assistant: draft, account: accountA)
        #expect(try await store.messages(conversation, account: accountB).isEmpty)
        #expect(try await store.providers(accountB).isEmpty)
        let reopened = try AIStore(path: directory.appendingPathComponent("ai.sqlite3").path)
        let saved = try await reopened.messages(conversation, account: accountA)
        #expect(saved.last?.content == "partial 你好")
        #expect(saved.last?.status == "interrupted")
        #expect(saved.last?.seq == 1)
        #expect(try await reopened.conversations(accountA).count == 1)
        try await reopened.deleteConversation(conversation, account: accountB)
        #expect(try await reopened.messages(conversation, account: accountA).count == 2)
    }

    @Test func actualKeychainReadUpdateRemoveAndAccountIsolation() throws {
        let store = AICredentialStore(), provider = UUID().uuidString
        defer { try? store.remove(account: accountA, provider: provider); try? store.remove(account: accountB, provider: provider) }
        try store.write("synthetic-key-a", account: accountA, provider: provider)
        try store.write("synthetic-key-b", account: accountB, provider: provider)
        #expect(try store.read(account: accountA, provider: provider) == "synthetic-key-a")
        try store.write("synthetic-key-a-updated", account: accountA, provider: provider)
        #expect(try store.read(account: accountA, provider: provider) == "synthetic-key-a-updated")
        try store.remove(account: accountA, provider: provider)
        #expect(try store.read(account: accountA, provider: provider) == nil)
        #expect(try store.read(account: accountB, provider: provider) == "synthetic-key-b")
    }

    @Test func runtimeProgressCancelAndNoSecretInDatabaseOrEvents() async throws {
        let (store, directory) = try temporaryStore()
        defer { try? FileManager.default.removeItem(at: directory) }
        let secrets = MemoryAISecrets(), key = "synthetic-secret-never-persist"
        try secrets.write(key, account: accountA, provider: providerID)
        try await store.saveProvider(fixtureProvider(), account: accountA)
        var requests = 0, events: [[String: Any]] = []
        let runtime = AIRuntime(store: store, secrets: secrets) { request, receive in
            requests += 1
            #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer " + key)
            #expect(request.value(forHTTPHeaderField: "Cookie") == nil)
            #expect(!request.httpShouldHandleCookies)
            try await receive(AIStreamPart(delta: "first 你好"))
            try await Task.sleep(nanoseconds: 60_000_000_000)
        }
        let conversation = UUID().uuidString, request = UUID().uuidString
        _ = try await runtime.handle("ai.send", account: accountA, parameters: ["conversationId": conversation, "requestId": request, "providerId": providerID, "modelId": "mock-text", "content": "hello"], emit: { events.append($0) })
        for _ in 0..<100 { if events.count > 0 { break }; try await Task.sleep(nanoseconds: 10_000_000) }
        #expect(!events.isEmpty)
        #expect(try await store.messages(conversation, account: accountA).last?.content == "first 你好")
        _ = try await runtime.handle("ai.cancel", account: accountB, parameters: ["requestId": request], emit: { events.append($0) })
        #expect(try await store.messages(conversation, account: accountA).last?.status == "streaming")
        _ = try await runtime.handle("ai.cancel", account: accountA, parameters: ["requestId": request], emit: { events.append($0) })
        for _ in 0..<100 { if try await store.messages(conversation, account: accountA).last?.status == "cancelled" { break }; try await Task.sleep(nanoseconds: 10_000_000) }
        let saved = try await store.messages(conversation, account: accountA)
        #expect(saved.last?.status == "cancelled")
        #expect(saved.last?.content == "first 你好")
        #expect(saved.last?.requestCount == 1)
        #expect(requests == 1)
        #expect(!String(data: try JSONEncoder().encode(saved), encoding: .utf8)!.contains(key))
        #expect(!String(data: try JSONSerialization.data(withJSONObject: events), encoding: .utf8)!.contains(key))
        for file in try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) {
            #expect(try Data(contentsOf: file).range(of: Data(key.utf8)) == nil)
        }
    }

    @Test func endpointChangesRequireNewKeyAndDoNotCallModel() async throws {
        let (store, directory) = try temporaryStore(); defer { try? FileManager.default.removeItem(at: directory) }
        let secrets = MemoryAISecrets()
        try await store.saveProvider(fixtureProvider(), account: accountA)
        try secrets.write("old-key", account: accountA, provider: providerID)
        let runtime = AIRuntime(store: store, secrets: secrets) { _, _ in Issue.record("Configuration must not call a model") }
        var provider = fixtureProvider(); provider.baseURL = "https://other.example.invalid/v1"
        do {
            _ = try await runtime.handle("ai.saveProvider", account: accountA, parameters: ["provider": try aiJSON(provider)], emit: { _ in })
            Issue.record("Endpoint change reused an old Key")
        } catch { #expect(error is AIError) }
        #expect(try await store.providers(accountA).first?.baseURL == fixtureProvider().baseURL)
        #expect(try secrets.read(account: accountA, provider: providerID) == "old-key")
    }

    @Test func successfulUsageIsPersistedAndReplayDoesNotBillAgain() async throws {
        let (store, directory) = try temporaryStore(); defer { try? FileManager.default.removeItem(at: directory) }
        let secrets = MemoryAISecrets(); try secrets.write("mock-key", account: accountA, provider: providerID)
        try await store.saveProvider(fixtureProvider(), account: accountA)
        var count = 0
        let runtime = AIRuntime(store: store, secrets: secrets) { _, receive in
            count += 1
            try await receive(.init(delta: "hello"))
            try await receive(.init(usage: AIUsage(inputTokens: 100, outputTokens: 20, source: "provider")))
            try await receive(.init(done: true))
        }
        let conversation = UUID().uuidString
        let params: [String: Any] = ["conversationId": conversation, "requestId": UUID().uuidString, "providerId": providerID, "modelId": "mock-text", "content": "hello"]
        _ = try await runtime.handle("ai.send", account: accountA, parameters: params, emit: { _ in })
        for _ in 0..<100 { if try await store.messages(conversation, account: accountA).last?.status == "done" { break }; try await Task.sleep(nanoseconds: 10_000_000) }
        _ = try await runtime.handle("ai.send", account: accountA, parameters: params, emit: { _ in })
        let saved = try await store.messages(conversation, account: accountA)
        #expect(count == 1)
        #expect(saved.count == 2)
        #expect(saved.last?.usage?.inputTokens == 100)
        #expect(abs((saved.last?.cost ?? 0) - 0.00028) < 0.00000001)
    }

    @Test func accountInterruptionPreservesOutputAndStopsOldEvents() async throws {
        let (store, directory) = try temporaryStore(); defer { try? FileManager.default.removeItem(at: directory) }
        let secrets = MemoryAISecrets(); try secrets.write("mock-key", account: accountA, provider: providerID)
        try await store.saveProvider(fixtureProvider(), account: accountA)
        var events = 0
        let runtime = AIRuntime(store: store, secrets: secrets) { _, receive in
            try await receive(.init(delta: "saved before switch"))
            try await Task.sleep(nanoseconds: 60_000_000_000)
        }
        let conversation = UUID().uuidString
        _ = try await runtime.handle("ai.send", account: accountA, parameters: ["conversationId": conversation, "requestId": UUID().uuidString, "providerId": providerID, "modelId": "mock-text", "content": "hello"], emit: { _ in events += 1 })
        for _ in 0..<100 { if events > 0 { break }; try await Task.sleep(nanoseconds: 10_000_000) }
        let before = events
        runtime.interrupt()
        _ = try await runtime.handle("ai.getState", account: accountB, parameters: [:], emit: { _ in events += 1 })
        for _ in 0..<100 { if try await store.messages(conversation, account: accountA).last?.status == "interrupted" { break }; try await Task.sleep(nanoseconds: 10_000_000) }
        #expect(events == before)
        #expect(try await store.messages(conversation, account: accountA).last?.content == "saved before switch")
        #expect(try await store.messages(conversation, account: accountA).last?.status == "interrupted")
        #expect(try await store.messages(conversation, account: accountB).isEmpty)
    }

    @Test(arguments: [401, 429, 503]) func providerFailuresAreSafeAndNeverRetried(status: Int) async throws {
        let (store, directory) = try temporaryStore(); defer { try? FileManager.default.removeItem(at: directory) }
        let secrets = MemoryAISecrets(); try secrets.write("mock-secret", account: accountA, provider: providerID)
        try await store.saveProvider(fixtureProvider(), account: accountA)
        var requests = 0
        let runtime = AIRuntime(store: store, secrets: secrets) { _, receive in
            requests += 1
            try await receive(.init(delta: "partial"))
            throw AIError.http(status)
        }
        let conversation = UUID().uuidString
        _ = try await runtime.handle("ai.send", account: accountA, parameters: ["conversationId": conversation, "requestId": UUID().uuidString, "providerId": providerID, "modelId": "mock-text", "content": "hello"], emit: { _ in })
        for _ in 0..<100 { if try await store.messages(conversation, account: accountA).last?.status == "failed" { break }; try await Task.sleep(nanoseconds: 10_000_000) }
        let message = try #require(await store.messages(conversation, account: accountA).last)
        #expect(message.content == "partial")
        #expect(message.status == "failed")
        #expect(message.error?.contains(String(status)) == true)
        #expect(message.error?.contains("mock-secret") == false)
        #expect(requests == 1)
    }
}

@Suite("Parlor parallel groups", .serialized)
@MainActor
struct AIGroupRuntimeTests {
    private func setup(_ store: AIStore, runtime: AIRuntime, secrets: MemoryAISecrets) async throws -> String {
        var first = fixtureProvider()
        var second = first; second.id = "30000000-0000-4000-8000-000000000002"; second.name = "Second"; second.baseURL = "https://second.example.invalid/v1"
        try await store.saveProvider(first, account: accountA); try await store.saveProvider(second, account: accountA)
        try secrets.write("mock-key-a", account: accountA, provider: first.id); try secrets.write("mock-key-b", account: accountA, provider: second.id)
        var sebastian = ParlorPersona.sebastian; sebastian.providerId = first.id; sebastian.modelId = "mock-text"
        var ada = sebastian; ada.id = "40000000-0000-4000-8000-000000000002"; ada.name = "Ada"; ada.providerId = second.id
        try await store.savePersona(sebastian, account: accountA); try await store.savePersona(ada, account: accountA)
        let id = UUID().uuidString
        _ = try await runtime.handle("ai.saveGroup", account: accountA, parameters: ["conversationId": id, "title": "Test group", "personaIds": [sebastian.id, ada.id]], emit: { _ in })
        return id
    }
    private func settled(_ store: AIStore, _ id: String) async throws -> [AIMessage] {
        for _ in 0..<300 {
            let messages = try await store.messages(id, account: accountA)
            if !messages.isEmpty && messages.allSatisfy({ $0.status != "streaming" }) { return messages }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        Issue.record("Group did not settle within bounded wait")
        return try await store.messages(id, account: accountA)
    }
    @Test func independentStreamsShareFrozenContextAndRetryDoesNotDuplicate() async throws {
        let (store, directory) = try temporaryStore(); defer { try? FileManager.default.removeItem(at: directory) }
        let secrets = MemoryAISecrets(); var contexts: [[[String: String]]] = []; var starts = 0
        let runtime = AIRuntime(store: store, secrets: secrets) { request, receive in
            let json = try #require(JSONSerialization.jsonObject(with: #require(request.httpBody)) as? [String: Any])
            contexts.append(Array(try #require(json["messages"] as? [[String: String]]).dropFirst())); starts += 1
            try await receive(.init(delta: "independent partial"))
            try await Task.sleep(nanoseconds: 100_000_000)
            try await receive(.init(delta: " done", usage: AIUsage(inputTokens: request.url?.host == "second.example.invalid" ? 22 : 11, outputTokens: 3, source: "provider"), done: true))
        }
        let id = try await setup(store, runtime: runtime, secrets: secrets), round = UUID().uuidString
        let params: [String: Any] = ["conversationId": id, "requestId": round, "content": "Same question"]
        _ = try await runtime.handle("ai.groupSend", account: accountA, parameters: params, emit: { _ in })
        _ = try await runtime.handle("ai.groupSend", account: accountA, parameters: params, emit: { _ in })
        let messages = try await settled(store, id)
        #expect(starts == 2 && contexts.count == 2 && contexts[0] == contexts[1])
        #expect(messages.count == 3 && messages.filter { $0.role == "user" }.count == 1)
        #expect(messages[1].personaName == "Sebastian" && messages[2].personaName == "Ada")
        #expect(messages[1].usage?.inputTokens == 11 && messages[2].usage?.inputTokens == 22)
        let retry = UUID().uuidString
        _ = try await runtime.handle("ai.groupRegenerate", account: accountA, parameters: ["conversationId": id, "messageId": messages[1].id, "requestId": retry], emit: { _ in })
        _ = try await runtime.handle("ai.groupRegenerate", account: accountA, parameters: ["conversationId": id, "messageId": messages[1].id, "requestId": retry], emit: { _ in })
        let retried = try await settled(store, id)
        #expect(starts == 3 && contexts.last == contexts.first)
        #expect(retried.count == 4 && retried.last?.supersedesId == messages[1].id)
        let reopened = try AIStore(path: directory.appendingPathComponent("ai.sqlite3").path)
        #expect(try await reopened.messages(id, account: accountA).map(\.id) == retried.map(\.id))
        #expect(try await reopened.groups(accountA).first?.participants.count == 2)
        #expect(try await reopened.groups(accountB).isEmpty)
    }
    @Test func oneFailureDoesNotCancelPeersAndPartialOutputIsKept() async throws {
        let (store, directory) = try temporaryStore(); defer { try? FileManager.default.removeItem(at: directory) }
        let secrets = MemoryAISecrets()
        let runtime = AIRuntime(store: store, secrets: secrets) { request, receive in
            try await receive(.init(delta: "partial"))
            if request.url?.host == "second.example.invalid" { throw AIError.http(503) }
            try await Task.sleep(nanoseconds: 50_000_000)
            try await receive(.init(delta: " completed", done: true))
        }
        let id = try await setup(store, runtime: runtime, secrets: secrets)
        _ = try await runtime.handle("ai.groupSend", account: accountA, parameters: ["conversationId": id, "requestId": UUID().uuidString, "content": "Question"], emit: { _ in })
        let messages = try await settled(store, id)
        #expect(messages[1].status == "done" && messages[2].status == "failed")
        #expect(messages[2].content == "partial" && messages[2].requestCount == 1)
    }
    @Test func stopOneThenAllAndAccountInterruptionKeepDurablePartials() async throws {
        let (store, directory) = try temporaryStore(); defer { try? FileManager.default.removeItem(at: directory) }
        let secrets = MemoryAISecrets(); var starts = 0; var events = 0
        let runtime = AIRuntime(store: store, secrets: secrets) { _, receive in
            starts += 1; try await receive(.init(delta: "saved partial")); try await Task.sleep(nanoseconds: 60_000_000_000)
        }
        let id = try await setup(store, runtime: runtime, secrets: secrets)
        _ = try await runtime.handle("ai.groupSend", account: accountA, parameters: ["conversationId": id, "requestId": UUID().uuidString, "content": "Question"], emit: { _ in events += 1 })
        for _ in 0..<100 { if starts == 2 { break }; try await Task.sleep(nanoseconds: 10_000_000) }
        let drafts = try await store.messages(id, account: accountA)
        _ = try await runtime.handle("ai.groupCancel", account: accountA, parameters: ["conversationId": id, "messageId": drafts[1].id], emit: { _ in events += 1 })
        for _ in 0..<100 { if try await store.messages(id, account: accountA)[1].status == "cancelled" { break }; try await Task.sleep(nanoseconds: 10_000_000) }
        let oneStopped = try await store.messages(id, account: accountA)
        #expect(oneStopped[1].status == "cancelled" && oneStopped[2].status == "streaming")
        let before = events; runtime.interrupt()
        _ = try await runtime.handle("ai.getState", account: accountB, parameters: [:], emit: { _ in events += 1 })
        let messages = try await settled(store, id)
        #expect(messages[2].status == "interrupted" && messages[2].content == "saved partial")
        #expect(events == before)
        _ = try await runtime.handle("ai.groupSend", account: accountA, parameters: ["conversationId": id, "requestId": UUID().uuidString, "content": "Again"], emit: { _ in })
        _ = try await runtime.handle("ai.groupCancel", account: accountA, parameters: ["conversationId": id], emit: { _ in })
        let allStopped = try await settled(store, id)
        #expect(allStopped.suffix(2).allSatisfy { $0.status == "cancelled" })
    }
    private func discussionSetup(_ store: AIStore, runtime: AIRuntime, secrets: MemoryAISecrets, rounds: Int = 3) async throws -> String {
        let id = try await setup(store, runtime: runtime, secrets: secrets)
        let group = try #require(await store.groups(accountA).first)
        _ = try await runtime.handle("ai.saveGroup", account: accountA, parameters: ["conversationId": id, "title": "Discussion", "personaIds": group.participants.map(\.id), "mode": "discussion", "maxRounds": rounds], emit: { _ in })
        return id
    }
    private func discussionSettled(_ store: AIStore, _ id: String) async throws -> [AIMessage] {
        for _ in 0..<500 {
            let state = try await store.discussions(accountA).first(where: { $0.conversationId == id })
            if let state, !["running", "summarizing"].contains(state.status) { return try await settled(store, id) }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        Issue.record("Discussion exceeded its bounded wait")
        return try await store.messages(id, account: accountA)
    }
    @Test func discussionFreezesEachRoundReadsPeersAndHonorsCapAndReplay() async throws {
        let (store, directory) = try temporaryStore(); defer { try? FileManager.default.removeItem(at: directory) }
        let secrets = MemoryAISecrets(); var contexts: [[[String: String]]] = []
        let runtime = AIRuntime(store: store, secrets: secrets) { request, receive in
            let body = try #require(JSONSerialization.jsonObject(with: #require(request.httpBody)) as? [String: Any])
            contexts.append(Array(try #require(body["messages"] as? [[String: String]]).dropFirst()))
            let who = request.url?.host == "second.example.invalid" ? "Ada" : "Sebastian"
            try await receive(.init(delta: who + " viewpoint"))
            try await Task.sleep(nanoseconds: 20_000_000)
            try await receive(.init(usage: AIUsage(inputTokens: who == "Ada" ? 22 : 11, outputTokens: 3, source: "provider"), done: true))
        }
        let id = try await discussionSetup(store, runtime: runtime, secrets: secrets)
        let parameters: [String: Any] = ["conversationId": id, "requestId": UUID().uuidString, "content": "Question"]
        _ = try await runtime.handle("ai.groupSend", account: accountA, parameters: parameters, emit: { _ in })
        let messages = try await discussionSettled(store, id)
        #expect(contexts.count == 6 && messages.count == 7)
        for round in 0..<3 { #expect(contexts[round * 2] == contexts[round * 2 + 1]) }
        #expect(contexts[2].contains(where: { ($0["content"] ?? "").contains("[Ada] Ada viewpoint") }))
        #expect(contexts[2].contains(where: { ($0["content"] ?? "").contains("[Sebastian] Sebastian viewpoint") }))
        #expect(messages.filter { $0.discussionRound == 3 }.count == 2)
        #expect(messages.filter { $0.personaName == "Ada" }.allSatisfy { $0.usage?.inputTokens == 22 })
        _ = try await runtime.handle("ai.groupSend", account: accountA, parameters: parameters, emit: { _ in })
        #expect(contexts.count == 6)
        let summary: [String: Any] = ["conversationId": id, "requestId": UUID().uuidString, "personaId": "40000000-0000-4000-8000-000000000002"]
        _ = try await runtime.handle("ai.discussionSummarize", account: accountA, parameters: summary, emit: { _ in })
        let summarized = try await discussionSettled(store, id)
        #expect(summarized.last?.purpose == "summary" && summarized.last?.personaName == "Ada")
        #expect(summarized.last?.usage?.inputTokens == 22)
        _ = try await runtime.handle("ai.discussionSummarize", account: accountA, parameters: summary, emit: { _ in })
        #expect(contexts.count == 7)
        let reopened = try AIStore(path: directory.appendingPathComponent("ai.sqlite3").path)
        #expect(try await reopened.messages(id, account: accountA).map(\.id) == summarized.map(\.id))
        #expect(try await reopened.discussions(accountB).isEmpty)
    }
    @Test func discussionInterjectionDrainsPartialRoundAndCannotResetBudget() async throws {
        let (store, directory) = try temporaryStore(); defer { try? FileManager.default.removeItem(at: directory) }
        let secrets = MemoryAISecrets(); var hold = true; var contexts: [[[String: String]]] = []
        let runtime = AIRuntime(store: store, secrets: secrets) { request, receive in
            let body = try #require(JSONSerialization.jsonObject(with: #require(request.httpBody)) as? [String: Any])
            contexts.append(Array(try #require(body["messages"] as? [[String: String]]).dropFirst()))
            try await receive(.init(delta: "partial viewpoint"))
            while hold { try await Task.sleep(nanoseconds: 10_000_000) }
            try await receive(.init(done: true))
        }
        let id = try await discussionSetup(store, runtime: runtime, secrets: secrets, rounds: 2)
        _ = try await runtime.handle("ai.groupSend", account: accountA, parameters: ["conversationId": id, "requestId": UUID().uuidString, "content": "Question"], emit: { _ in })
        for _ in 0..<100 { if contexts.count == 2 { break }; try await Task.sleep(nanoseconds: 10_000_000) }
        let intervene: [String: Any] = ["conversationId": id, "requestId": UUID().uuidString, "content": "Focus on the budget"]
        _ = try await runtime.handle("ai.discussionIntervene", account: accountA, parameters: intervene, emit: { _ in })
        hold = false
        let messages = try await discussionSettled(store, id)
        #expect(messages.filter { $0.role == "user" }.count == 2)
        #expect(messages.filter { $0.status == "cancelled" }.count == 2)
        #expect(contexts.count == 4 && contexts[2] == contexts[3])
        #expect(contexts[2].contains(where: { $0["content"] == "Focus on the budget" }))
        #expect(contexts[2].contains(where: { ($0["content"] ?? "").contains("incomplete") }))
        _ = try await runtime.handle("ai.discussionIntervene", account: accountA, parameters: intervene, emit: { _ in })
        #expect(contexts.count == 4)
        #expect(try await store.discussions(accountA).first?.roundsStarted == 2)
    }
    @Test func discussionFailureSuspendsOnlyFailedPersonaAndExplicitRetryUsesOriginalContext() async throws {
        let (store, directory) = try temporaryStore(); defer { try? FileManager.default.removeItem(at: directory) }
        let secrets = MemoryAISecrets(); var fail = true; var starts = 0
        let runtime = AIRuntime(store: store, secrets: secrets) { request, receive in
            starts += 1; try await receive(.init(delta: "partial"))
            if fail && request.url?.host == "second.example.invalid" { throw AIError.http(503) }
            try await receive(.init(done: true))
        }
        let id = try await discussionSetup(store, runtime: runtime, secrets: secrets)
        _ = try await runtime.handle("ai.groupSend", account: accountA, parameters: ["conversationId": id, "requestId": UUID().uuidString, "content": "Question"], emit: { _ in })
        let messages = try await discussionSettled(store, id)
        #expect(starts == 4 && messages.filter { $0.personaName == "Ada" }.count == 1)
        #expect(messages.filter { $0.personaName == "Sebastian" }.count == 3)
        let failed = try #require(messages.first(where: { $0.status == "failed" }))
        fail = false
        _ = try await runtime.handle("ai.groupRegenerate", account: accountA, parameters: ["conversationId": id, "messageId": failed.id, "requestId": UUID().uuidString], emit: { _ in })
        let retried = try await settled(store, id)
        #expect(retried.last?.supersedesId == failed.id && retried.last?.roundId == failed.roundId)
        #expect(starts == 5 && retried.last?.status == "done")
    }

    @Test func discussionIndividualStopPauseContinueAndEndNeverRestartCancelledWork() async throws {
        let (store, directory) = try temporaryStore(); defer { try? FileManager.default.removeItem(at: directory) }
        let secrets = MemoryAISecrets(); var starts = 0
        let runtime = AIRuntime(store: store, secrets: secrets) { _, receive in
            starts += 1; try await receive(.init(delta: "kept partial"))
            try await Task.sleep(nanoseconds: 60_000_000_000)
        }
        let id = try await discussionSetup(store, runtime: runtime, secrets: secrets)
        _ = try await runtime.handle("ai.groupSend", account: accountA, parameters: ["conversationId": id, "requestId": UUID().uuidString, "content": "Question"], emit: { _ in })
        for _ in 0..<100 { if starts == 2 { break }; try await Task.sleep(nanoseconds: 10_000_000) }
        let first = try #require(await store.messages(id, account: accountA).first(where: { $0.personaName == "Sebastian" }))
        _ = try await runtime.handle("ai.groupCancel", account: accountA, parameters: ["conversationId": id, "messageId": first.id], emit: { _ in })
        for _ in 0..<100 { if try await store.messages(id, account: accountA).first(where: { $0.id == first.id })?.status == "cancelled" { break }; try await Task.sleep(nanoseconds: 10_000_000) }
        #expect(try await store.messages(id, account: accountA).last?.status == "streaming")
        _ = try await runtime.handle("ai.discussionControl", account: accountA, parameters: ["conversationId": id, "action": "pause"], emit: { _ in })
        let paused = try await settled(store, id)
        #expect(paused.filter { $0.role == "assistant" }.allSatisfy { $0.status == "cancelled" && $0.content == "kept partial" })
        #expect(try await store.discussions(accountA).first?.status == "paused")
        _ = try await runtime.handle("ai.discussionControl", account: accountA, parameters: ["conversationId": id, "action": "continue"], emit: { _ in })
        for _ in 0..<100 { if starts == 4 { break }; try await Task.sleep(nanoseconds: 10_000_000) }
        _ = try await runtime.handle("ai.discussionControl", account: accountA, parameters: ["conversationId": id, "action": "end"], emit: { _ in })
        _ = try await settled(store, id)
        #expect(try await store.discussions(accountA).first?.status == "ended")
        #expect(try await store.discussions(accountA).first?.roundsStarted == 2)
        #expect(starts == 4)
    }

}
