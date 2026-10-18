import Foundation

@MainActor
final class TrackerLocalController: NSObject, URLSessionTaskDelegate {
    let database: TrackerLocalDatabase
    private let baseURL: URL
    private let cookies: HTTPCookieStorage
    private var activeSession: URLSession?
    private var generation = 0
    private var acceptanceReceipts: [String: [String: Any]] = [:]
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
        if path == "sync" { throw TrackerLocalError.readOnly }
        let trackerPath = path == "trackers" || path.range(of: "^trackers/[1-9][0-9]*$", options: .regularExpression) != nil
        guard path == "session" || trackerPath && method == "GET" else { throw TrackerLocalError.invalid }
        var request = URLRequest(url: baseURL.appendingPathComponent(trackerPath ? "api/\(path)" : "api/native/\(path)"))
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
        if let previous = try await database.account()?["accountId"] { _ = try await acceptanceStatus(accountId: previous) }
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
        if let previous = try await database.account()?["accountId"] { _ = try await acceptanceStatus(accountId: previous) }
        generation += 1
        try await database.clearAccount()
        // Local logout must work offline. No business records or queue are erased.
        for cookie in cookies.cookies(for: baseURL) ?? [] { cookies.deleteCookie(cookie) }
        activeSession?.invalidateAndCancel()
        activeSession = nil
        // Recreate the session on next login without losing the durable database.
    }
    func synchronize(_ body: [String: Any]) async throws -> Any {
        throw TrackerLocalError.readOnly
    }
    func acceptanceStatus(accountId: String) async throws -> [String: Any] {
        try await database.requireAccount(accountId)
        if let receipt = acceptanceReceipts[accountId] { return receipt }
        let receipt = try await database.acceptanceBackup(accountId: accountId)
        acceptanceReceipts[accountId] = receipt
        return receipt
    }
    func readOnlySnapshot(accountId: String, refresh: Bool) async throws -> Any {
        _ = try await acceptanceStatus(accountId: accountId)
        if !refresh { return try await database.readOnlyCache(accountId: accountId) }
        let expectedGeneration = generation
        guard let identity = try await request(path: "session", method: "GET") as? [String: Any], identity["authenticated"] as? Bool == true, identity["accountId"] as? String == accountId else { throw TrackerLocalError.account }
        guard let summaries = try await request(path: "trackers", method: "GET") as? [[String: Any]] else { throw TrackerLocalError.invalid }
        var details: [[String: Any]] = [], seen = Set<Int>(), seenFields = Set<Int>(), seenEntries = Set<Int>()
        for summary in summaries {
            guard let id = summary["id"] as? Int, id > 0, seen.insert(id).inserted,
                  let detail = try await request(path: "trackers/\(id)", method: "GET") as? [String: Any],
                  let tracker = detail["tracker"] as? [String: Any], tracker["id"] as? Int == id,
                  detail["fields"] is [[String: Any]], let entries = detail["entries"] as? [[String: Any]],
                  let stats = detail["stats"] as? [String: Any], stats["total"] as? Int == entries.count else { throw TrackerLocalError.invalid }
            let fields = detail["fields"] as? [[String: Any]] ?? []
            for field in fields {
                guard let fieldId = field["id"] as? Int, fieldId > 0, seenFields.insert(fieldId).inserted,
                      field["trackerId"] as? Int == id, field["key"] is String, field["name"] is String,
                      field["options"] is [String], let type = field["type"] as? String,
                      ["number", "single_select", "multi_select", "text", "boolean", "rating", "time_range"].contains(type) else { throw TrackerLocalError.invalid }
            }
            for entry in entries {
                guard let entryId = entry["id"] as? Int, entryId > 0, seenEntries.insert(entryId).inserted,
                      entry["trackerId"] as? Int == id, let occurredAt = entry["occurredAt"] as? String, Self.validTimestamp(occurredAt),
                      entry["values"] is [String: Any], entry["note"] is String else { throw TrackerLocalError.invalid }
            }
            details.append(detail)
        }
        guard expectedGeneration == generation,
              let identity = try await request(path: "session", method: "GET") as? [String: Any], identity["authenticated"] as? Bool == true, identity["accountId"] as? String == accountId else { throw TrackerLocalError.account }
        guard expectedGeneration == generation else { throw TrackerLocalError.account }
        try await database.requireAccount(accountId)
        let snapshot: [String: Any] = ["format": "eo-trackers-readonly-v1", "accountId": accountId, "capturedAt": ISO8601DateFormatter().string(from: Date()), "details": details]
        try await database.saveReadOnlyCache(accountId: accountId, snapshot: snapshot)
        return snapshot
    }
    private static func validTimestamp(_ value: String) -> Bool {
        let formatter = ISO8601DateFormatter()
        if formatter.date(from: value) != nil { return true }
        formatter.formatOptions.insert(.withFractionalSeconds)
        return formatter.date(from: value) != nil
    }
    // Never forward session cookies or request bodies through an HTTP redirect.
    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
