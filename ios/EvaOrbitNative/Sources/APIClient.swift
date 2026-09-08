import Foundation

struct NativeSessionResponse: Decodable, Equatable {
    let authenticated: Bool
    let email: String?
}

enum APIClientError: LocalizedError, Equatable {
    case invalidConfiguration
    case invalidResponse
    case server(statusCode: Int, message: String)

    var errorDescription: String? {
        switch self {
        case .invalidConfiguration:
            return "App 的服务器地址配置不正确"
        case .invalidResponse:
            return "服务器返回了无法识别的内容"
        case let .server(_, message):
            return message
        }
    }
}

struct APIConfiguration: Equatable {
    let baseURL: URL

    init(baseURLString: String) throws {
        guard
            let url = URL(string: baseURLString),
            url.scheme == "https",
            url.host != nil,
            url.user == nil,
            url.password == nil,
            url.query == nil,
            url.fragment == nil
        else {
            throw APIClientError.invalidConfiguration
        }
        baseURL = url
    }

    static func bundled() throws -> APIConfiguration {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "EvaOrbitAPIBaseURL") as? String else {
            throw APIClientError.invalidConfiguration
        }
        return try APIConfiguration(baseURLString: value)
    }

    var sessionURL: URL {
        baseURL.appending(path: "api/native/session")
    }
}

final class APIClient {
    private struct LoginRequest: Encodable {
        let email: String
        let password: String
    }

    private struct ErrorResponse: Decodable {
        let error: String
    }

    private let configuration: APIConfiguration
    private let urlSession: URLSession
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    init(configuration: APIConfiguration, urlSession: URLSession = .shared) {
        self.configuration = configuration
        self.urlSession = urlSession
    }

    convenience init() throws {
        try self.init(configuration: .bundled())
    }

    func currentSession() async throws -> NativeSessionResponse {
        try await send(makeRequest(), response: NativeSessionResponse.self)
    }

    func signIn(email: String, password: String) async throws -> NativeSessionResponse {
        var request = makeRequest(method: "POST")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(LoginRequest(email: email, password: password))
        return try await send(request, response: NativeSessionResponse.self)
    }

    func signOut() async throws {
        let request = makeRequest(method: "DELETE")
        let (_, response) = try await urlSession.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIClientError.invalidResponse }
        guard http.statusCode == 204 else {
            throw APIClientError.server(statusCode: http.statusCode, message: "退出登录失败，请重试")
        }
    }

    private func makeRequest(method: String = "GET") -> URLRequest {
        var request = URLRequest(url: configuration.sessionURL)
        request.httpMethod = method
        request.timeoutInterval = 15
        return request
    }

    private func send<T: Decodable>(_ request: URLRequest, response: T.Type) async throws -> T {
        let (data, response) = try await urlSession.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIClientError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? decoder.decode(ErrorResponse.self, from: data).error) ?? "服务器请求失败"
            throw APIClientError.server(statusCode: http.statusCode, message: message)
        }
        guard let decoded = try? decoder.decode(T.self, from: data) else {
            throw APIClientError.invalidResponse
        }
        return decoded
    }
}
