import Foundation

@MainActor
final class TrackerLocalController: NSObject, URLSessionTaskDelegate {
    let database: TrackerLocalDatabase
    private let baseURL: URL
    private let cookies: HTTPCookieStorage
    private var activeSession: URLSession?
    private var generation = 0
    private var session: URLSession {
        if let activeSession { return activeSession }
        let configuration = URLSessionConfiguration.default
        configuration.httpCookieStorage = cookies
        configuration.httpShouldSetCookies = true
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = 20
        let created = URLSession(configuration: configuration, delegate: self, delegateQueue: .main)
        activeSession = created
        return created
    }

    init(baseURL: URL, database: TrackerLocalDatabase) {
        self.baseURL = baseURL
        self.database = database
        cookies = HTTPCookieStorage.shared
        super.init()
    }

    func request(path: String, method: String, body: Any? = nil) async throws -> Any {
        guard ["session", "sync"].contains(path) else { throw TrackerLocalError.invalid }
        var request = URLRequest(url: baseURL.appendingPathComponent("api/native/\(path)"))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw TrackerLocalError.invalid }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            throw TrackerLocalError.network(message?["error"] as? String ?? "同步暂时失败，本地记录已保留")
        }
        return http.statusCode == 204 ? NSNull() : try JSONSerialization.jsonObject(with: data)
    }

    func signIn(email: String, password: String) async throws -> [String: String] {
        generation += 1
        let expectedGeneration = generation
        guard !email.isEmpty, email.count <= 254, !password.isEmpty, password.count <= 1024 else { throw TrackerLocalError.invalid }
        guard let response = try await request(path: "session", method: "POST", body: ["email": email, "password": password]) as? [String: Any],
              response["authenticated"] as? Bool == true, let id = response["accountId"] as? String, let email = response["email"] as? String else { throw TrackerLocalError.invalid }
        guard expectedGeneration == generation else { throw TrackerLocalError.account }
        try await database.setAccount(id: id, email: email)
        return ["accountId": id, "email": email]
    }
    func signOut() async throws {
        generation += 1
        try await database.clearAccount()
        // Local logout must work offline. No business records or queue are erased.
        for cookie in cookies.cookies(for: baseURL) ?? [] { cookies.deleteCookie(cookie) }
        activeSession?.invalidateAndCancel()
        activeSession = nil
        // Recreate the session on next login without losing the durable database.
    }
    func synchronize(_ body: [String: Any]) async throws -> Any {
        let expectedGeneration = generation
        guard let account = body["accountId"] as? String, body["protocolVersion"] as? Int == 2,
              let mutations = body["mutations"] as? [[String: Any]], mutations.count <= 50 else { throw TrackerLocalError.invalid }
        try await database.requireAccount(account)
        let response = try await request(path: "sync", method: "POST", body: body)
        guard expectedGeneration == generation else { throw TrackerLocalError.account }
        try await database.requireAccount(account)
        return response
    }
    // Never forward session cookies or request bodies through an HTTP redirect.
    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
