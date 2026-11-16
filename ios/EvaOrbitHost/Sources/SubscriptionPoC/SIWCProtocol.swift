#if DEBUG || PARLOR_SUBSCRIPTION_POC
import Foundation
import CryptoKit
import Security

// Independent, opt-in experiment. Never imported by AIRuntime or the JS bridge.
enum SIWCFailure: LocalizedError {
    case invalidCallback, invalidIdentity, permission, credentials, cancelled, timeout, interrupted, protocolError
    case http(Int), service(String)
    var errorDescription: String? {
        switch self {
        case .invalidCallback: return "OAuth 回调校验失败。"
        case .invalidIdentity: return "OpenAI 身份签名或账户校验失败。"
        case .permission: return "尚未授予 ChatGPT 订阅用量权限。"
        case .credentials: return "独立 Keychain 凭据不可用。"
        case .cancelled: return "已取消；不会自动重试。"
        case .timeout: return "登录等待超时，请重新授权。"
        case .interrupted: return "响应未正常完成，保留已收到的文字。"
        case .protocolError: return "服务响应格式不符合 PoC 协议。"
        case .http(let status): return "OpenAI HTTP \(status)；未自动重试。"
        case .service(let code): return "OpenAI：\(code)；未自动重试。"
        }
    }
    // Only known codes can enter status text. Provider descriptions can contain secrets.
    static func serviceError(_ raw: Any?) -> SIWCFailure {
        let allowed: Set<String> = ["access_denied", "invalid_grant", "invalid_scope", "invalid_client",
            "subscription_sharing_usage_limit_exceeded", "subscription_sharing_usage_unavailable",
            "rate_limit_exceeded", "model_not_found", "insufficient_quota"]
        return .service((raw as? String).flatMap { allowed.contains($0) ? $0 : nil } ?? "unclassified_error")
    }
}

enum SIWCProtocol {
    static let resource = "https://api.openai.com/v1"
    static let issuer = "https://auth.openai.com"
    static let scopes = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct"
    static func base64URL(_ data: Data) -> String {
        data.base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
    static func decode64(_ value: String) throws -> Data {
        var text = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        text += String(repeating: "=", count: (4 - text.count % 4) % 4)
        guard let data = Data(base64Encoded: text) else { throw SIWCFailure.invalidIdentity }
        return data
    }
    static func random() throws -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw SIWCFailure.credentials }
        return base64URL(Data(bytes))
    }
    static func challenge(_ verifier: String) -> String { base64URL(Data(SHA256.hash(data: Data(verifier.utf8)))) }
    static func form(_ values: [String: String]) -> Data {
        let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        return Data(values.sorted { $0.key < $1.key }.map {
            $0.key.addingPercentEncoding(withAllowedCharacters: allowed)! + "=" + $0.value.addingPercentEncoding(withAllowedCharacters: allowed)!
        }.joined(separator: "&").utf8)
    }
    static func request(model: String, token: String) throws -> URLRequest {
        var request = URLRequest(url: URL(string: resource + "/responses")!)
        request.httpMethod = "POST"
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["model": model,
            "input": [["role": "user", "content": "请只回复：Parlor 订阅接入成功。"]], "store": false, "stream": true])
        return request
    }
}

struct SIWCAttempt {
    let state: String
    let nonce: String
    let verifier: String
    let redirect: URL
    let client: String?

    init(redirect: URL, client: String? = nil) throws {
        self.redirect = redirect; self.client = client
        state = try SIWCProtocol.random(); nonce = try SIWCProtocol.random(); verifier = try SIWCProtocol.random()
    }
    func authorizationURL(host: String) -> URL {
        var parts = URLComponents(string: SIWCProtocol.issuer + "/api/accounts/authorize")!
        var values = ["client_id": client ?? "dynamic_agent_client", "ext_agent_host_id": host,
            "response_type": "code", "redirect_uri": redirect.absoluteString, "scope": SIWCProtocol.scopes,
            "resource": SIWCProtocol.resource, "state": state, "nonce": nonce,
            "code_challenge_method": "S256", "code_challenge": SIWCProtocol.challenge(verifier)]
        if client == nil { values["agent_name_hint"] = "EvaOrbit Parlor PoC" }
        parts.queryItems = values.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }
        return parts.url!
    }
    func callback(_ url: URL) throws -> (code: String, client: String) {
        guard url.scheme == redirect.scheme, url.host == "127.0.0.1", url.port == redirect.port,
              url.path == redirect.path, url.fragment == nil, url.user == nil, url.password == nil,
              let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
              Set(items.map(\.name)).count == items.count,
              items.first(where: { $0.name == "state" })?.value == state else { throw SIWCFailure.invalidCallback }
        let fields = Dictionary(uniqueKeysWithValues: items.map { ($0.name, $0.value ?? "") })
        if let error = fields["error"] { throw SIWCFailure.serviceError(error) }
        guard let code = fields["code"], !code.isEmpty, code.count <= 8192,
              let issued = fields["client_id"] ?? client, !issued.isEmpty, issued != "dynamic_agent_client",
              issued.count <= 512, client == nil || issued == client else { throw SIWCFailure.invalidCallback }
        return (code, issued)
    }
}

struct SIWCConnection: Codable {
    var host: String
    var client: String?
    var subject: String?
    var access: String?
    var refresh: String?
    var idToken: String?
    var expires: Date?
    var scopes: [String] = []
    var enabled: Bool { access != nil && scopes.contains("resource.invoke") && scopes.contains("chatgpt.tokens.use.direct") }
}

struct SIWCKeychain {
    // Separate from API keys; PoC has a single explicit test profile, never an EO account binding.
    let service: String
    init(service: String = "com.evaorbit.nativehost.subscription-poc.v1") { self.service = service }
    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
         kSecAttrAccount as String: "explicit-test-profile", kSecAttrSynchronizable as String: false]
    }
    func read() throws -> SIWCConnection? {
        var q = query; q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let bytes = result as? Data else { throw SIWCFailure.credentials }
        return try JSONDecoder().decode(SIWCConnection.self, from: bytes)
    }
    func write(_ connection: SIWCConnection) throws {
        let bytes = try JSONEncoder().encode(connection)
        let values = [kSecValueData as String: bytes]
        let status = SecItemUpdate(query as CFDictionary, values as CFDictionary)
        if status == errSecSuccess { return }
        guard status == errSecItemNotFound else { throw SIWCFailure.credentials }
        var q = query; q[kSecValueData as String] = bytes
        q[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        guard SecItemAdd(q as CFDictionary, nil) == errSecSuccess else { throw SIWCFailure.credentials }
    }
    func remove() throws {
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw SIWCFailure.credentials }
    }
}

struct SIWCResponseEvent {
    var delta = ""
    var completed = false
    var usage: String?
    static func decode(_ data: String) throws -> Self {
        guard let json = try JSONSerialization.jsonObject(with: Data(data.utf8)) as? [String: Any],
              let type = json["type"] as? String else { throw SIWCFailure.protocolError }
        switch type {
        case "response.output_text.delta":
            guard let delta = json["delta"] as? String else { throw SIWCFailure.protocolError }
            return Self(delta: delta)
        case "response.completed":
            guard let response = json["response"] as? [String: Any], response["status"] as? String == "completed" else { throw SIWCFailure.interrupted }
            let counts = response["usage"] as? [String: Any]
            let input = (counts?["input_tokens"] as? NSNumber)?.intValue
            let output = (counts?["output_tokens"] as? NSNumber)?.intValue
            return Self(completed: true, usage: "输入 \(input.map(String.init) ?? "未知") / 输出 \(output.map(String.init) ?? "未知") tokens；订阅额度计费以 ChatGPT Usage 为准")
        case "response.failed", "error":
            let response = json["response"] as? [String: Any]
            let error = (response?["error"] ?? json["error"]) as? [String: Any]
            throw SIWCFailure.serviceError(error?["code"] ?? json["code"])
        case "response.incomplete": throw SIWCFailure.interrupted
        default: return Self()
        }
    }
}

enum SIWCIdentity {
    // RS256 is the algorithm advertised by OpenAI's OIDC discovery. Never trust decoded claims alone.
    static func validate(_ token: String, jwks: Data, client: String, nonce: String?, now: Date = Date()) throws -> String {
        let parts = token.split(separator: ".", omittingEmptySubsequences: false).map(String.init)
        guard parts.count == 3,
              let header = try JSONSerialization.jsonObject(with: SIWCProtocol.decode64(parts[0])) as? [String: Any],
              header["alg"] as? String == "RS256", header["crit"] == nil,
              let kid = header["kid"] as? String,
              let keys = (try JSONSerialization.jsonObject(with: jwks) as? [String: Any])?["keys"] as? [[String: Any]],
              let jwk = keys.first(where: { $0["kid"] as? String == kid && $0["kty"] as? String == "RSA" }),
              jwk["use"] as? String == "sig", (jwk["alg"] as? String ?? "RS256") == "RS256",
              let n = jwk["n"] as? String, let e = jwk["e"] as? String else { throw SIWCFailure.invalidIdentity }
        func der(_ tag: UInt8, _ bytes: Data) -> Data {
            var length = bytes.count; var encoded = Data()
            if length < 128 { encoded.append(UInt8(length)) } else {
                var octets = [UInt8]()
                while length > 0 { octets.insert(UInt8(length & 255), at: 0); length >>= 8 }
                encoded.append(0x80 | UInt8(octets.count)); encoded.append(contentsOf: octets)
            }
            return Data([tag]) + encoded + bytes
        }
        func integer(_ value: String) throws -> Data {
            var bytes = try SIWCProtocol.decode64(value)
            guard !bytes.isEmpty else { throw SIWCFailure.invalidIdentity }
            if bytes[0] & 0x80 != 0 { bytes.insert(0, at: 0) }
            return der(0x02, bytes)
        }
        let keyData = try der(0x30, integer(n) + integer(e))
        guard let key = SecKeyCreateWithData(keyData as CFData,
            [kSecAttrKeyType: kSecAttrKeyTypeRSA, kSecAttrKeyClass: kSecAttrKeyClassPublic] as CFDictionary, nil),
              SecKeyVerifySignature(key, .rsaSignatureMessagePKCS1v15SHA256,
                Data((parts[0] + "." + parts[1]).utf8) as CFData, try SIWCProtocol.decode64(parts[2]) as CFData, nil),
              let claims = try JSONSerialization.jsonObject(with: SIWCProtocol.decode64(parts[1])) as? [String: Any],
              claims["iss"] as? String == SIWCProtocol.issuer,
              let exp = claims["exp"] as? Double, exp > now.timeIntervalSince1970,
              let subject = claims["sub"] as? String, !subject.isEmpty else { throw SIWCFailure.invalidIdentity }
        let audiences = (claims["aud"] as? [String]) ?? (claims["aud"] as? String).map { [$0] } ?? []
        guard audiences.contains(client), audiences.count == 1 || claims["azp"] as? String == client,
              nonce == nil || claims["nonce"] as? String == nonce,
              (claims["nbf"] as? Double ?? 0) <= now.timeIntervalSince1970 + 30 else { throw SIWCFailure.invalidIdentity }
        return subject
    }
}
#endif
