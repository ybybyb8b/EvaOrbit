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
}

// Each mock session carries an independent random routing ID; parallel tests cannot share handlers.
private final class SIWCTestTransport {
    typealias Reply = (Int, String, String)
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
            let response = try #require(HTTPURLResponse(url: #require(request.url), statusCode: reply.0,
                httpVersion: "HTTP/1.1", headerFields: ["Content-Type": reply.1]))
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: Data(reply.2.utf8)); client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}
#endif
