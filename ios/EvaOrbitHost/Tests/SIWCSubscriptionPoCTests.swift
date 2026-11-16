#if DEBUG
import Foundation
import Security
import Testing
@testable import EvaOrbitHost

@Suite("Isolated SIWC subscription PoC")
struct SIWCSubscriptionPoCTests {
    @Test func pkceAndRegistrationCallback() throws {
        #expect(SIWCProtocol.challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk") == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
        let attempt = try SIWCAttempt(redirect: URL(string: "http://127.0.0.1:1455/auth/callback")!)
        let auth = try #require(URLComponents(url: attempt.authorizationURL(host: "urn:uuid:test"), resolvingAgainstBaseURL: false))
        #expect(auth.host == "auth.openai.com")
        #expect(auth.queryItems?.first(where: { $0.name == "client_id" })?.value == "dynamic_agent_client")
        #expect(auth.queryItems?.first(where: { $0.name == "scope" })?.value?.contains("chatgpt.tokens.use.direct") == true)
        func callback(_ tail: String) -> URL { URL(string: attempt.redirect.absoluteString + "?code=mock&client_id=oaiapp_test&state=" + attempt.state + tail)! }
        #expect(try attempt.callback(callback("")).client == "oaiapp_test")
        #expect(throws: (any Error).self) { try attempt.callback(callback("&state=duplicate")) }
        #expect(throws: (any Error).self) { try attempt.callback(URL(string: "http://127.0.0.1:1455/auth/callback?state=wrong&code=mock&client_id=oaiapp_test")!) }
        #expect(throws: (any Error).self) { try attempt.callback(URL(string: "http://localhost:1455/auth/callback?state=" + attempt.state)!) }
        let returning = try SIWCAttempt(redirect: attempt.redirect, client: "oaiapp_original")
        #expect(throws: (any Error).self) { try returning.callback(URL(string: attempt.redirect.absoluteString + "?state=" + returning.state + "&code=mock&client_id=oaiapp_other")!) }
        #expect(throws: (any Error).self) { try attempt.callback(URL(string: attempt.redirect.absoluteString + "?state=" + attempt.state + "&error=access_denied")!) }
    }

    @Test func responsesRequestAndSecretFreeError() throws {
        let request = try SIWCProtocol.request(model: "mock-only", token: "test-bearer-never-real")
        #expect(request.url?.absoluteString == "https://api.openai.com/v1/responses")
        #expect(request.value(forHTTPHeaderField: "Cookie") == nil)
        let body = try #require(JSONSerialization.jsonObject(with: #require(request.httpBody)) as? [String: Any])
        #expect(body["store"] as? Bool == false); #expect(body["stream"] as? Bool == true)
        #expect(body["max_output_tokens"] == nil); #expect(body["temperature"] == nil)
        #expect(String(data: request.httpBody!, encoding: .utf8)?.contains("test-bearer") == false)
        #expect(SIWCFailure.serviceError("test-bearer-never-real").errorDescription?.contains("test-bearer") == false)
        let config = AIProviderAdapter.configuration()
        #expect(config.httpCookieStorage == nil && !config.httpShouldSetCookies && config.urlCredentialStorage == nil)
    }

    @Test func utf8SSEAndTerminalEvents() throws {
        let wire = "event: response.output_text.delta\r\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"你好🫖\"}\r\n\r\ndata: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\",\"usage\":{\"input_tokens\":2,\"output_tokens\":3}}}\r\n\r\n"
        var parser = AISSEParser(); var events: [SIWCResponseEvent] = []
        // Every byte is its own fragment, including the interior of each UTF-8 scalar.
        for byte in wire.utf8 {
            for (_, data) in try parser.append(byte) { events.append(try SIWCResponseEvent.decode(data)) }
        }
        #expect(events.count == 2); #expect(events.first?.delta == "你好🫖"); #expect(events.last?.completed == true)
        #expect(throws: (any Error).self) { try SIWCResponseEvent.decode("{\"type\":\"response.incomplete\"}") }
        #expect(throws: (any Error).self) { try SIWCResponseEvent.decode("{\"type\":\"response.failed\",\"response\":{\"error\":{\"code\":\"subscription_sharing_usage_limit_exceeded\"}}}") }
        #expect(throws: (any Error).self) { try SIWCResponseEvent.decode("[DONE]") }
    }

    @Test @MainActor func safeInferenceDiagnostics() throws {
        #expect(SIWCMediaType.classify("text/event-stream; charset=utf-8") == .sse)
        #expect(SIWCMediaType.classify("application/problem+json") == .json)
        #expect(SIWCMediaType.classify(nil) == .missing)
        let secret = "mock-secret-never-show"
        let body = Data("{\"error\":{\"code\":\"subscription_sharing_usage_unavailable\",\"message\":\"\(secret)\"}}".utf8)
        let error = SIWCRuntime.inferenceFailure(status: 200, media: .json, body: body)
        #expect(error.errorDescription?.contains("inference.headers") == true)
        #expect(error.errorDescription?.contains("HTTP 200") == true)
        #expect(error.errorDescription?.contains("subscription_sharing_usage_unavailable") == true)
        #expect(error.errorDescription?.contains(secret) == false)
        let html = SIWCRuntime.inferenceFailure(status: 403, media: .html, body: Data(secret.utf8))
        #expect(html.errorDescription?.contains("HTML") == true)
        #expect(html.errorDescription?.contains(secret) == false)
        do { _ = try SIWCResponseEvent.decode(String(decoding: body, as: UTF8.self)); Issue.record("Untyped error was accepted") }
        catch SIWCFailure.service(let code) { #expect(code == "subscription_sharing_usage_unavailable") }
        do { _ = try SIWCResponseEvent.decode("{\"type\":\"response.output_text.delta\"}"); Issue.record("Missing delta was accepted") }
        catch SIWCFailure.eventShape(let issue) { #expect(issue == .delta) }
    }

    @Test func keychainLifecycleAndProfileIsolation() throws {
        let a = SIWCKeychain(service: "com.evaorbit.test.siwc." + UUID().uuidString)
        let b = SIWCKeychain(service: "com.evaorbit.test.siwc." + UUID().uuidString)
        defer { try? a.remove(); try? b.remove() }
        #expect(try a.read() == nil)
        var profile = SIWCConnection(host: "urn:uuid:mock", client: "oaiapp_test", subject: "mock-user", access: "mock-access", refresh: "mock-refresh")
        try a.write(profile); #expect(try a.read()?.access == "mock-access"); #expect(try b.read() == nil)
        profile.refresh = "mock-rotated"; try a.write(profile)
        #expect(try a.read()?.refresh == "mock-rotated")
        try a.remove(); #expect(try a.read() == nil)
    }

    @Test func signedIdentityValidation() throws {
        let privateKey = try #require(SecKeyCreateRandomKey([
            kSecAttrKeyType: kSecAttrKeyTypeRSA, kSecAttrKeySizeInBits: 2048] as CFDictionary, nil))
        let publicKey = try #require(SecKeyCopyPublicKey(privateKey))
        let exported = try #require(SecKeyCopyExternalRepresentation(publicKey, nil)) as Data
        // Parse Apple's PKCS#1 public-key export solely to build a test JWKS.
        var offset = 0
        func tlv() throws -> Data {
            guard offset + 2 <= exported.count else { throw SIWCFailure.protocolError }
            offset += 1; var length = Int(exported[offset]); offset += 1
            if length & 128 != 0 {
                let count = length & 127; length = 0
                for _ in 0..<count { guard offset < exported.count else { throw SIWCFailure.protocolError }; length = length * 256 + Int(exported[offset]); offset += 1 }
            }
            guard offset + length <= exported.count else { throw SIWCFailure.protocolError }
            let data = exported.subdata(in: offset..<(offset + length)); offset += length; return data
        }
        // Skip only the sequence tag/length, then read its two INTEGERs.
        offset = 2 + (exported[1] & 128 == 0 ? 0 : Int(exported[1] & 127))
        let n = try tlv(); let e = try tlv()
        let jwks = try JSONSerialization.data(withJSONObject: ["keys": [["kty": "RSA", "kid": "test", "use": "sig", "alg": "RS256", "n": SIWCProtocol.base64URL(n), "e": SIWCProtocol.base64URL(e)]]])
        func token(nonce: String = "test-nonce", expiry: Double = Date().addingTimeInterval(300).timeIntervalSince1970) throws -> String {
            let header = SIWCProtocol.base64URL(try JSONSerialization.data(withJSONObject: ["alg": "RS256", "kid": "test"]))
            let claims = SIWCProtocol.base64URL(try JSONSerialization.data(withJSONObject: ["iss": SIWCProtocol.issuer, "aud": "oaiapp_test", "sub": "mock-subject", "nonce": nonce, "exp": expiry]))
            let message = header + "." + claims
            let signature = try #require(SecKeyCreateSignature(privateKey, .rsaSignatureMessagePKCS1v15SHA256, Data(message.utf8) as CFData, nil)) as Data
            return message + "." + SIWCProtocol.base64URL(signature)
        }
        let valid = try token()
        #expect(try SIWCIdentity.validate(valid, jwks: jwks, client: "oaiapp_test", nonce: "test-nonce") == "mock-subject")
        #expect(throws: (any Error).self) { try SIWCIdentity.validate(valid, jwks: jwks, client: "oaiapp_other", nonce: "test-nonce") }
        #expect(throws: (any Error).self) { try SIWCIdentity.validate(valid, jwks: jwks, client: "oaiapp_test", nonce: "wrong") }
        #expect(throws: (any Error).self) { try SIWCIdentity.validate(token(expiry: 1), jwks: jwks, client: "oaiapp_test", nonce: "test-nonce") }
        #expect(throws: (any Error).self) { try SIWCIdentity.validate(String(valid.dropLast(8)) + "AAAAAAAA", jwks: jwks, client: "oaiapp_test", nonce: "test-nonce") }
    }

    @Test @MainActor func mockRefreshPersistenceAndCompletedRequest() async throws {
        let keychain = SIWCKeychain(service: "com.evaorbit.test.siwc." + UUID().uuidString)
        defer { try? keychain.remove() }
        let transport = SIWCTestTransport()
        defer { transport.remove() }
        let saved = SIWCConnection(host: "urn:uuid:mock", client: "oaiapp_test", subject: "mock-user",
            access: "mock-expired", refresh: "mock-old-refresh", expires: Date(timeIntervalSince1970: 1),
            scopes: ["resource.invoke", "chatgpt.tokens.use.direct"])
        try keychain.write(saved)
        transport.install { request in
            switch request.url?.path {
            case "/api/accounts/oauth/token":
                var bytes = request.httpBody ?? Data()
                if bytes.isEmpty, let stream = request.httpBodyStream {
                    stream.open(); defer { stream.close() }
                    var buffer = [UInt8](repeating: 0, count: 1024)
                    while stream.hasBytesAvailable {
                        let count = stream.read(&buffer, maxLength: buffer.count)
                        if count <= 0 { break }
                        bytes.append(contentsOf: buffer.prefix(count))
                    }
                }
                let body = String(data: bytes, encoding: .utf8) ?? ""
                #expect(body.contains("mock-old-refresh")); #expect(body.contains("client_id=oaiapp_test"))
                #expect(!body.contains("dynamic_agent_client"))
                return (200, "application/json", "{\"access_token\":\"mock-new-access\",\"refresh_token\":\"mock-new-refresh\",\"token_type\":\"Bearer\",\"expires_in\":3600}")
            case "/v1/responses":
                #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer mock-new-access")
                #expect(request.value(forHTTPHeaderField: "Cookie") == nil)
                return (200, "text/event-stream", "data: {\"type\":\"response.output_text.delta\",\"delta\":\"mock-success\"}\n\ndata: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\"}}\n\n")
            default: throw SIWCFailure.protocolError
            }
        }
        let runtime = SIWCRuntime(keychain: keychain, configuration: transport.configuration)
        var text = ""; var completed = false
        try await runtime.infer(model: "mock-only") { text += $0.delta; completed = $0.completed }
        #expect(text == "mock-success" && completed)
        #expect(try keychain.read()?.refresh == "mock-new-refresh")
        #expect(try SIWCRuntime(keychain: keychain, configuration: transport.configuration).connection().access == "mock-new-access")
        #expect(transport.count == 2) // Exactly one refresh + one inference, never an automatic replay.
    }

    @Test @MainActor func mockPartialFailureAndCancellation() async throws {
        let keychain = SIWCKeychain(service: "com.evaorbit.test.siwc." + UUID().uuidString)
        defer { try? keychain.remove() }
        let transport = SIWCTestTransport(); defer { transport.remove() }
        try keychain.write(SIWCConnection(host: "urn:uuid:mock", client: "oaiapp_test", subject: "mock-user",
            access: "mock-access", expires: Date().addingTimeInterval(3600), scopes: ["resource.invoke", "chatgpt.tokens.use.direct"]))
        transport.install { _ in
            (200, "text/event-stream", "data: {\"type\":\"response.output_text.delta\",\"delta\":\"partial\"}\n\n")
        }
        let runtime = SIWCRuntime(keychain: keychain, configuration: transport.configuration)
        var text = ""
        do { try await runtime.infer(model: "mock-only") { text += $0.delta }; Issue.record("Truncated stream was accepted") }
        catch SIWCFailure.interrupted { #expect(text == "partial") }
        let count = transport.count
        let cancelled = Task { @MainActor in try await runtime.infer(model: "mock-only") { _ in } }
        cancelled.cancel()
        do { try await cancelled.value; Issue.record("Cancelled request completed") }
        catch { #expect(error is CancellationError || (error as? URLError)?.code == .cancelled) }
        #expect(transport.count <= count + 1)
    }

    @Test @MainActor func mockNonSSESuccessMustNotCountAsInference() async throws {
        let keychain = SIWCKeychain(service: "com.evaorbit.test.siwc." + UUID().uuidString)
        defer { try? keychain.remove() }
        let transport = SIWCTestTransport(); defer { transport.remove() }
        try keychain.write(SIWCConnection(host: "urn:uuid:mock", client: "oaiapp_test", subject: "mock-user",
            access: "mock-access", expires: Date().addingTimeInterval(3600), scopes: ["resource.invoke", "chatgpt.tokens.use.direct"]))
        transport.install { _ in (200, "application/json", "{\"error\":{\"code\":\"subscription_sharing_usage_unavailable\",\"message\":\"mock-secret-never-show\"}}") }
        let runtime = SIWCRuntime(keychain: keychain, configuration: transport.configuration)
        var delivered = 0
        do { try await runtime.infer(model: "mock-only") { _ in delivered += 1 }; Issue.record("Non-SSE counted as success") }
        catch SIWCFailure.inferenceHTTP(let status, let media, let code) {
            #expect(status == 200 && media == .json && code == "subscription_sharing_usage_unavailable")
        }
        #expect(delivered == 0 && transport.count == 1)
    }

    @Test @MainActor func parlorHistoryAndPersonaUseResponsesWithoutAPIPrices() async throws {
        let keychain = SIWCKeychain(service: "com.evaorbit.test.siwc." + UUID().uuidString)
        defer { try? keychain.remove() }
        let transport = SIWCTestTransport(); defer { transport.remove() }
        try keychain.write(SIWCConnection(host: "urn:uuid:mock", client: "oaiapp_test", subject: "mock-user",
            access: "mock-access", expires: Date().addingTimeInterval(3600), scopes: ["resource.invoke", "chatgpt.tokens.use.direct"]))
        transport.install { request in
            let body = try #require(JSONSerialization.jsonObject(with: #require(request.httpBody)) as? [String: Any])
            #expect(body["instructions"] as? String == "Persona prompt")
            let input = try #require(body["input"] as? [[String: String]])
            #expect(input.map { $0["role"] ?? "" } == ["user", "assistant", "user"])
            #expect(input.last?["content"] == "Next question")
            #expect(body["store"] as? Bool == false)
            return (200, "text/event-stream", "data: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\",\"usage\":{\"input_tokens\":12,\"output_tokens\":4}}}\n\n")
        }
        let runtime = SIWCRuntime(keychain: keychain, configuration: transport.configuration)
        var usage: AIUsage?
        try await runtime.infer(model: "mock-only", input: [["role": "user", "content": "Earlier"], ["role": "assistant", "content": "Reply"], ["role": "user", "content": "Next question"]], instructions: "Persona prompt") { usage = $0.tokenUsage }
        #expect(usage?.inputTokens == 12 && usage?.outputTokens == 4)
        #expect(usage?.cost(model: AIModel(id: "mock-only", name: "Mock")) == nil)
        #expect(transport.count == 1)
    }

    @Test @MainActor func missingMIMERequiresRealSSEAndCompletion() async throws {
        let keychain = SIWCKeychain(service: "com.evaorbit.test.siwc." + UUID().uuidString)
        defer { try? keychain.remove() }
        let transport = SIWCTestTransport(); defer { transport.remove() }
        try keychain.write(SIWCConnection(host: "urn:uuid:mock", client: "oaiapp_test", subject: "mock-user",
            access: "mock-access", expires: Date().addingTimeInterval(3600), scopes: ["resource.invoke", "chatgpt.tokens.use.direct"]))
        let runtime = SIWCRuntime(keychain: keychain, configuration: transport.configuration)
        let delta = "data: {\"type\":\"response.output_text.delta\",\"delta\":\"你好🫖\"}\r\n\r\n"
        let completed = "data: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\"}}\r\n\r\n"
        transport.install { _ in (200, nil, delta + completed) }
        var text = ""; var done = false
        try await runtime.infer(model: "mock-only") { text += $0.delta; done = $0.completed }
        #expect(text == "你好🫖" && done && transport.count == 1)

        for body in ["{\"output_text\":\"not a streamed answer\"}", "<html>not SSE</html>", ""] {
            transport.install { _ in (200, nil, body) }
            var delivered = 0
            do { try await runtime.infer(model: "mock-only") { _ in delivered += 1 }; Issue.record("Non-SSE body was accepted") }
            catch SIWCFailure.eventShape(let issue) { #expect(issue == .notSSE) }
            #expect(delivered == 0 && transport.count == 1)
        }
        transport.install { _ in (200, nil, delta) }
        text = ""
        do { try await runtime.infer(model: "mock-only") { text += $0.delta }; Issue.record("Missing completion was accepted") }
        catch SIWCFailure.interrupted { #expect(text == "你好🫖") }
        #expect(transport.count == 1)
    }
    @Test @MainActor func concurrentParticipantsShareOneRotatingRefresh() async throws {
        let keychain = SIWCKeychain(service: "com.evaorbit.test.parallel-refresh." + UUID().uuidString)
        defer { try? keychain.remove() }
        let transport = SIWCTestTransport(); defer { transport.remove() }
        try keychain.write(SIWCConnection(host: "urn:uuid:mock", client: "oaiapp_test", subject: "mock-user",
            access: "expired", refresh: "old-refresh", expires: Date().addingTimeInterval(-1), scopes: ["resource.invoke", "chatgpt.tokens.use.direct"]))
        transport.install { request in
            #expect(request.url?.path == "/api/accounts/oauth/token")
            return (200, "application/json", "{\"access_token\":\"new-access\",\"refresh_token\":\"rotated-refresh\",\"token_type\":\"bearer\",\"expires_in\":3600}")
        }
        let runtime = SIWCRuntime(keychain: keychain, configuration: transport.configuration)
        async let first = runtime.access()
        async let second = runtime.access()
        let (firstToken, secondToken) = try await (first, second)
        #expect(firstToken == "new-access" && secondToken == "new-access" && transport.count == 1)
        #expect(try keychain.read()?.refresh == "rotated-refresh")
    }

    @Test @MainActor func cancellingOneRefreshWaiterKeepsPeerAndRotation() async throws {
        let keychain = SIWCKeychain(service: "com.evaorbit.test.refresh-waiter." + UUID().uuidString)
        defer { try? keychain.remove() }
        let transport = SIWCTestTransport(); defer { transport.remove() }
        try keychain.write(SIWCConnection(host: "urn:uuid:mock", client: "oaiapp_test", subject: "mock-user",
            access: "expired", refresh: "old-refresh", expires: Date().addingTimeInterval(-1), scopes: ["resource.invoke", "chatgpt.tokens.use.direct"]))
        transport.install { _ in
            Thread.sleep(forTimeInterval: 0.2)
            return (200, "application/json", "{\"access_token\":\"new-access\",\"refresh_token\":\"rotated-refresh\",\"token_type\":\"bearer\",\"expires_in\":3600}")
        }
        let runtime = SIWCRuntime(keychain: keychain, configuration: transport.configuration)
        let first = Task { try await runtime.access() }
        let second = Task { try await runtime.access() }
        try await Task.sleep(nanoseconds: 30_000_000)
        first.cancel()
        do { _ = try await first.value; Issue.record("Cancelled participant kept waiting") }
        catch { #expect(error is CancellationError) }
        #expect(try await second.value == "new-access")
        #expect(transport.count == 1)
        #expect(try keychain.read()?.refresh == "rotated-refresh")
    }

    @Test @MainActor func mixedSubscriptionAndAPIGroupUsesSeparateTransportsAndUsage() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("siwc-group-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = try AIStore(path: directory.appendingPathComponent("ai.sqlite3").path)
        let account = "50000000-0000-4000-8000-000000000001"
        let keychain = SIWCKeychain(service: "com.evaorbit.test.group." + UUID().uuidString)
        defer { try? keychain.remove() }
        let transport = SIWCTestTransport(); defer { transport.remove() }
        try keychain.write(SIWCConnection(host: "urn:uuid:mock", client: "oaiapp_test", subject: "mock-user",
            access: "mock-siwc-only", expires: Date().addingTimeInterval(3600), scopes: ["resource.invoke", "chatgpt.tokens.use.direct"]))
        transport.install { request in
            #expect(request.url?.absoluteString == "https://api.openai.com/v1/responses")
            #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer mock-siwc-only")
            return (200, "text/event-stream", "data: {\"type\":\"response.output_text.delta\",\"delta\":\"subscription response\"}\n\ndata: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\",\"usage\":{\"input_tokens\":21,\"output_tokens\":7}}}\n\n")
        }
        let apiID = "50000000-0000-4000-8000-000000000002"
        let model = AIModel(id: "mock-text", name: "Mock")
        try await store.saveProvider(AIProvider(id: apiID, name: "API", baseURL: "https://api.example.invalid/v1", models: [model], currency: "USD", priceUpdatedAt: "", enabled: true), account: account)
        try await store.saveProvider(AIProvider(id: AIRuntime.subscriptionID, name: "ChatGPT", baseURL: SIWCProtocol.resource, models: [model], currency: "USD", priceUpdatedAt: "", enabled: true), account: account)
        var sebastian = ParlorPersona.sebastian; sebastian.providerId = apiID; sebastian.modelId = model.id
        var ada = sebastian; ada.id = UUID().uuidString; ada.name = "Ada"; ada.providerId = AIRuntime.subscriptionID
        try await store.savePersona(sebastian, account: account); try await store.savePersona(ada, account: account)
        var apiRequests = 0
        let runtime = AIRuntime(store: store, secrets: SIWCGroupSecrets(), subscriptionFactory: { _ in SIWCRuntime(keychain: keychain, configuration: transport.configuration) }) { request, receive in
            apiRequests += 1
            #expect(request.url?.host == "api.example.invalid")
            #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer mock-api-only")
            try await receive(.init(delta: "API response", usage: AIUsage(inputTokens: 11, outputTokens: 3, source: "provider"), done: true))
        }
        let id = UUID().uuidString
        _ = try await runtime.handle("ai.saveGroup", account: account, parameters: ["conversationId": id, "title": "Mixed", "personaIds": [sebastian.id, ada.id]], emit: { _ in })
        _ = try await runtime.handle("ai.groupSend", account: account, parameters: ["conversationId": id, "requestId": UUID().uuidString, "content": "Question"], emit: { _ in })
        for _ in 0..<300 { if try await store.messages(id, account: account).filter({ $0.status == "done" }).count == 3 { break }; try await Task.sleep(nanoseconds: 10_000_000) }
        let replies = try await store.messages(id, account: account).filter { $0.role == "assistant" }
        #expect(replies.count == 2 && replies.allSatisfy { $0.status == "done" })
        #expect(replies[0].usage?.inputTokens == 11 && replies[1].usage?.inputTokens == 21)
        #expect(replies[0].providerId == apiID && replies[1].providerId == AIRuntime.subscriptionID)
        #expect(replies[1].cost == nil && apiRequests == 1 && transport.count == 1)
    }

}

// Each mock session carries an independent random routing ID; parallel tests cannot share handlers.
private final class SIWCTestTransport {
    typealias Reply = (Int, String?, String)
    let id = UUID().uuidString
    var configuration: URLSessionConfiguration {
        let config = AIProviderAdapter.configuration(); config.protocolClasses = [SIWCMockURLProtocol.self]
        config.httpAdditionalHeaders = ["X-SIWC-PoC-Test-ID": id]; return config
    }
    var count: Int { SIWCMockURLProtocol.lock.withLock { SIWCMockURLProtocol.counts[id] ?? 0 } }
    func install(_ handler: @escaping (URLRequest) throws -> Reply) {
        SIWCMockURLProtocol.lock.withLock { SIWCMockURLProtocol.handlers[id] = handler; SIWCMockURLProtocol.counts[id] = 0 }
    }
    func remove() {
        SIWCMockURLProtocol.lock.withLock { SIWCMockURLProtocol.handlers.removeValue(forKey: id); SIWCMockURLProtocol.counts.removeValue(forKey: id) }
    }
}
private final class SIWCMockURLProtocol: URLProtocol {
    static let lock = NSLock()
    static var handlers: [String: (URLRequest) throws -> SIWCTestTransport.Reply] = [:]
    static var counts: [String: Int] = [:]
    override class func canInit(with request: URLRequest) -> Bool { true } // Fail closed: tests never fall through to the network.
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let id = request.value(forHTTPHeaderField: "X-SIWC-PoC-Test-ID") ?? ""
            let handler = Self.lock.withLock { () -> ((URLRequest) throws -> SIWCTestTransport.Reply)? in
                Self.counts[id, default: 0] += 1; return Self.handlers[id]
            }
            let resolved = try #require(handler)
            let reply = try resolved(request)
            let headers: [String: String] = reply.1.map { ["Content-Type": $0] } ?? [:]
            let response = try #require(HTTPURLResponse(url: #require(request.url), statusCode: reply.0,
                httpVersion: "HTTP/1.1", headerFields: headers))
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: Data(reply.2.utf8)); client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}
#endif

private final class SIWCGroupSecrets: AISecretStore {
    func read(account: String, provider: String) throws -> String? { "mock-api-only" }
    func write(_ value: String, account: String, provider: String) throws {}
    func remove(account: String, provider: String) throws {}
}
