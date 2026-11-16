#if DEBUG || PARLOR_SUBSCRIPTION_POC
import Foundation

// Direct SIWC Responses client, not a Parlor provider adapter or a Codex subprocess.
@MainActor
final class SIWCRuntime {
    let keychain: SIWCKeychain
    private let testConfiguration: URLSessionConfiguration?
    private var refreshing = false
    private let transport = AIProviderAdapter() // Reuse only its cookie-free session policy / redirect refusal.
    private var session: URLSession {
        URLSession(configuration: testConfiguration ?? AIProviderAdapter.configuration(), delegate: transport, delegateQueue: nil)
    }
    init(keychain: SIWCKeychain = SIWCKeychain(), configuration: URLSessionConfiguration? = nil) {
        self.keychain = keychain; self.testConfiguration = configuration
    }

    func connection() throws -> SIWCConnection {
        if let saved = try keychain.read() { return saved }
        let new = SIWCConnection(host: "urn:uuid:" + UUID().uuidString.lowercased())
        try keychain.write(new)
        return new
    }
    func exchange(attempt: SIWCAttempt, code: String, client: String) async throws {
        var saved = try connection()
        guard saved.client == nil || saved.client == client else { throw SIWCFailure.invalidIdentity }
        // Retain an issued registration even if its single-use authorization code expires.
        saved.client = client; try keychain.write(saved)
        let json = try await token(["grant_type": "authorization_code", "client_id": client, "code": code,
            "code_verifier": attempt.verifier, "redirect_uri": attempt.redirect.absoluteString,
            "resource": SIWCProtocol.resource])
        try await install(json, into: saved, nonce: attempt.nonce, requireID: true)
    }
    private func install(_ json: [String: Any], into saved: SIWCConnection, nonce: String?, requireID: Bool) async throws {
        guard let client = saved.client, let access = json["access_token"] as? String, !access.isEmpty,
              (json["token_type"] as? String)?.lowercased() == "bearer",
              let lifetime = json["expires_in"] as? Double, lifetime.isFinite, lifetime > 0 else { throw SIWCFailure.protocolError }
        var next = saved
        if let id = json["id_token"] as? String {
            let jwks = try await data(URLRequest(url: URL(string: SIWCProtocol.issuer + "/.well-known/jwks.json")!))
            let subject = try SIWCIdentity.validate(id, jwks: jwks, client: client, nonce: nonce)
            guard saved.subject == nil || saved.subject == subject else { throw SIWCFailure.invalidIdentity }
            next.subject = subject; next.idToken = id
        } else if requireID { throw SIWCFailure.invalidIdentity }
        guard next.subject != nil else { throw SIWCFailure.invalidIdentity }
        next.access = access; next.expires = Date().addingTimeInterval(lifetime)
        next.refresh = json["refresh_token"] as? String ?? saved.refresh
        if let scopes = json["scope"] as? String { next.scopes = scopes.split(separator: " ").map(String.init) }
        else if requireID { next.scopes = [] }
        // One UI operation at a time; the entire rotating token set replaces one Keychain item.
        // Once a validated rotation has arrived, persist it even if Stop was just tapped.
        try keychain.write(next)
        guard next.enabled else { throw SIWCFailure.permission }
    }
    func access() async throws -> String {
        let saved = try connection()
        guard saved.enabled else { throw SIWCFailure.permission }
        if let expiry = saved.expires, expiry > Date().addingTimeInterval(60), let token = saved.access { return token }
        guard let refresh = saved.refresh, let client = saved.client else { throw SIWCFailure.credentials }
        guard !refreshing else { throw SIWCFailure.protocolError }
        refreshing = true; defer { refreshing = false }
        let json = try await token(["grant_type": "refresh_token", "client_id": client,
                                   "refresh_token": refresh, "resource": SIWCProtocol.resource])
        try await install(json, into: saved, nonce: nil, requireID: false)
        guard let value = try keychain.read()?.access else { throw SIWCFailure.credentials }
        return value
    }
    func models() async throws -> [(id: String, name: String)] {
        var request = URLRequest(url: URL(string: SIWCProtocol.resource + "/models")!)
        request.setValue("Bearer " + (try await access()), forHTTPHeaderField: "Authorization")
        let bytes = try await data(request)
        guard let json = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              let rows = json["models"] as? [[String: Any]] else { throw SIWCFailure.protocolError }
        return rows.compactMap { row in
            guard row["visibility"] as? String == "list", let id = row["slug"] as? String, !id.isEmpty else { return nil }
            return (id, row["display_name"] as? String ?? id)
        }
    }
    func infer(model: String, receive: @escaping @MainActor (SIWCResponseEvent) -> Void) async throws {
        let token = try await access()
        try Task.checkCancellation()
        let request = try SIWCProtocol.request(model: model, token: token)
        let session = self.session; defer { session.invalidateAndCancel() }
        let (bytes, response) = try await session.bytes(for: request)
        guard let http = response as? HTTPURLResponse else { throw SIWCFailure.protocolError }
        let media = SIWCMediaType.classify(http.value(forHTTPHeaderField: "Content-Type"))
        guard (200..<300).contains(http.statusCode), media == .sse else {
            // Read a bounded error prefix to extract only an allowlisted code. Never show raw JSON/HTML.
            var prefix = Data()
            for try await byte in bytes {
                try Task.checkCancellation()
                if prefix.count >= 16 * 1024 { break }
                prefix.append(byte)
            }
            throw Self.inferenceFailure(status: http.statusCode, media: media, body: prefix)
        }
        var parser = AISSEParser(); var textBytes = 0
        func consume(_ frames: [(String, String)]) throws -> Bool {
            for (name, value) in frames {
                if name == "error", value.isEmpty { throw SIWCFailure.service("unclassified_error") }
                let event = try SIWCResponseEvent.decode(value)
                textBytes += event.delta.utf8.count
                guard textBytes <= 512 * 1024 else { throw SIWCFailure.eventShape(.limit) }
                receive(event)
                if event.completed { return true }
            }
            return false
        }
        for try await byte in bytes {
            try Task.checkCancellation()
            let frames: [(String, String)]
            do { frames = try parser.append(byte) }
            catch AIError.tooLarge { throw SIWCFailure.eventShape(.limit) }
            catch { throw SIWCFailure.eventShape(.utf8) }
            if try consume(frames) { return }
        }
        if try consume(parser.finish()) { return }
        throw SIWCFailure.interrupted
    }
    static func inferenceFailure(status: Int, media: SIWCMediaType, body: Data) -> SIWCFailure {
        let json = try? JSONSerialization.jsonObject(with: body) as? [String: Any]
        let error = json?["error"] as? [String: Any]
        let rawCode = error?["code"] ?? json?["error"] as? String
        let code = rawCode.map { SIWCFailure.safeServiceCode($0) }
        return .inferenceHTTP(status, media, code)
    }
    func signOut() async throws {
        let saved = try connection()
        var remoteConfirmed = saved.refresh == nil
        if let refresh = saved.refresh, let client = saved.client {
            var request = URLRequest(url: URL(string: SIWCProtocol.issuer + "/api/accounts/oauth/revoke")!)
            request.httpMethod = "POST"; request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
            request.httpBody = SIWCProtocol.form(["token": refresh, "token_type_hint": "refresh_token", "client_id": client])
            do { _ = try await data(request); remoteConfirmed = true } catch { remoteConfirmed = false }
        }
        // Keep host + registration, clear all credentials even if remote revocation was unreachable.
        var cleared = SIWCConnection(host: saved.host, client: saved.client, subject: saved.subject)
        cleared.scopes = []
        try keychain.write(cleared)
        if !remoteConfirmed { throw SIWCFailure.service("remote_revocation_unconfirmed") }
    }
    private func token(_ values: [String: String]) async throws -> [String: Any] {
        var request = URLRequest(url: URL(string: SIWCProtocol.issuer + "/api/accounts/oauth/token")!)
        request.httpMethod = "POST"; request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = SIWCProtocol.form(values)
        let bytes = try await data(request)
        guard let json = try JSONSerialization.jsonObject(with: bytes) as? [String: Any] else { throw SIWCFailure.protocolError }
        return json
    }
    private func check(_ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else { throw SIWCFailure.protocolError }
        guard (200..<300).contains(http.statusCode) else { throw SIWCFailure.http(http.statusCode) }
    }
    private func data(_ request: URLRequest) async throws -> Data {
        try Task.checkCancellation()
        let session = self.session; defer { session.invalidateAndCancel() }
        let (bytes, response) = try await session.bytes(for: request)
        var data = Data()
        for try await byte in bytes {
            try Task.checkCancellation(); data.append(byte)
            guard data.count <= 2 * 1024 * 1024 else { throw SIWCFailure.protocolError }
        }
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            let error = json["error"] as? [String: Any]
            if let code = (error?["code"] as? String) ?? (json["error"] as? String) { throw SIWCFailure.serviceError(code) }
        }
        try check(response)
        return data
    }
}
#endif
