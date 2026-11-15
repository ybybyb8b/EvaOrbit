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
