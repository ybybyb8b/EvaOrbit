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
        let (data, http) = try await performRequest(path: path, method: method, body: body)
        guard (200..<300).contains(http.statusCode) else {
            if path.hasPrefix("home-readonly/") && http.statusCode == 404 { throw TrackerLocalError.network("The Home read-only API is not deployed. Existing cached data is preserved.") }
            let message = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            throw TrackerLocalError.network(message?["error"] as? String ?? "同步暂时失败，本地记录已保留")
        }
        return http.statusCode == 204 ? NSNull() : try JSONSerialization.jsonObject(with: data)
    }
    private func performRequest(path: String, method: String, body: Any? = nil) async throws -> (Data, HTTPURLResponse) {
        if path == "sync" { throw TrackerLocalError.readOnly }
        let trackerPath = path == "trackers" || path.range(of: "^trackers/[1-9][0-9]*(/icon)?$", options: .regularExpression) != nil
        let homePath = path.range(of: "^home-readonly/(day/[0-9]{4}-[0-9]{2}-[0-9]{2}|month/[0-9]{4}-[0-9]{2}|due/current)$", options: .regularExpression) != nil
        guard path == "session" && ["GET", "POST", "DELETE"].contains(method) || (trackerPath || homePath) && method == "GET" else { throw TrackerLocalError.invalid }
        var request = URLRequest(url: baseURL.appendingPathComponent(trackerPath ? "api/\(path)" : "api/native/\(path)"))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw TrackerLocalError.invalid }
        return (data, http)
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
        let previous = try await database.readOnlyCache(accountId: accountId) as? [String: Any]
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
            for name in ["goals", "reminders"] {
                if let value = detail[name] {
                    guard let rows = value as? [[String: Any]], rows.allSatisfy({ ($0["id"] as? Int ?? 0) > 0 && $0["trackerId"] as? Int == id }) else { throw TrackerLocalError.invalid }
                    if name == "reminders" {
                        for row in rows {
                            guard let next = row["nextDueAt"] as? String, Self.validTimestamp(next), let zone = row["timezone"] as? String, TimeZone(identifier: zone) != nil else { throw TrackerLocalError.invalid }
                        }
                    }
                }
            }
            details.append(detail)
        }
        var images: [String: Any] = [:]
        let oldImages = previous?["images"] as? [String: [String: String]] ?? [:]
        for detail in details {
            guard let tracker = detail["tracker"] as? [String: Any], tracker["iconType"] as? String == "image", let id = tracker["id"] as? Int, let version = tracker["updatedAt"] as? String else { continue }
            let key = String(id), old = oldImages[String(id)]
            if let old, old["version"] == version, Self.validImageURL(old["dataUrl"]) { images[key] = old; continue }
            do {
                let (data, response) = try await performRequest(path: "trackers/\(id)/icon", method: "GET")
                if response.statusCode == 404 || response.statusCode == 410 { continue }
                guard (200..<300).contains(response.statusCode), data.count <= 4 * 1024 * 1024, let mime = response.mimeType, Self.imageMime(data) == mime else { throw TrackerLocalError.invalid }
                images[key] = ["version": version, "dataUrl": "data:\(mime);base64,\(data.base64EncodedString())"]
            } catch { if let old, Self.validImageURL(old["dataUrl"]) { images[key] = old } }
        }
        guard expectedGeneration == generation,
              let identity = try await request(path: "session", method: "GET") as? [String: Any], identity["authenticated"] as? Bool == true, identity["accountId"] as? String == accountId else { throw TrackerLocalError.account }
        guard expectedGeneration == generation else { throw TrackerLocalError.account }
        try await database.requireAccount(accountId)
        let snapshot: [String: Any] = ["format": "eo-trackers-readonly-v1", "accountId": accountId, "capturedAt": ISO8601DateFormatter().string(from: Date()), "details": details, "images": images]
        try await database.saveReadOnlyCache(accountId: accountId, snapshot: snapshot)
        return snapshot
    }
    func homeReadOnlyResource(accountId: String, kind: String, key: String, refresh: Bool) async throws -> Any {
        _ = try await acceptanceStatus(accountId: accountId)
        guard ["day", "month", "due"].contains(kind) else { throw TrackerLocalError.invalid }
        if kind == "day" && key == "latest" && !refresh { return try await database.homeReadOnlyCache(accountId: accountId, resource: "day/latest") }
        let date = kind == "month" ? key + "-01" : key
        let formatter = DateFormatter(); formatter.dateFormat = "yyyy-MM-dd"; formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.timeZone = TimeZone(secondsFromGMT: 0); formatter.isLenient = false
        guard kind == "due" && key == "current" || (kind == "day" || kind == "month") && date.count == 10 && formatter.date(from: date).map({ formatter.string(from: $0) == date }) == true else { throw TrackerLocalError.invalid }
        if !refresh { return try await database.homeReadOnlyCache(accountId: accountId, resource: "\(kind)/\(key)") }
        let expectedGeneration = generation
        guard let identity = try await request(path: "session", method: "GET") as? [String: Any], identity["authenticated"] as? Bool == true, identity["accountId"] as? String == accountId else { throw TrackerLocalError.account }
        guard let snapshot = try await request(path: "home-readonly/\(kind)/\(key)", method: "GET") as? [String: Any], snapshot["format"] as? String == "eo-home-readonly-v1", snapshot["accountId"] as? String == accountId, snapshot["kind"] as? String == kind, snapshot["key"] as? String == key, let capturedAt = snapshot["capturedAt"] as? String, Self.validTimestamp(capturedAt) else { throw TrackerLocalError.invalid }
        if kind == "due" { guard snapshot["data"] is [[String: Any]] else { throw TrackerLocalError.invalid } }
        else {
            guard let data = snapshot["data"] as? [String: Any], data[kind == "day" ? "date" : "month"] as? String == key else { throw TrackerLocalError.invalid }
            if kind == "day" { guard ["events", "tasks", "meals", "journal", "activities", "activityRecords"].allSatisfy({ data[$0] is [[String: Any]] }), data["calendarInterpretation"] is [String: Any] else { throw TrackerLocalError.invalid } }
            else { guard data["days"] is [String: Any], data["periods"] is [[String: Any]] else { throw TrackerLocalError.invalid } }
        }
        guard expectedGeneration == generation, let identity = try await request(path: "session", method: "GET") as? [String: Any], identity["authenticated"] as? Bool == true, identity["accountId"] as? String == accountId else { throw TrackerLocalError.account }
        guard expectedGeneration == generation else { throw TrackerLocalError.account }
        try await database.saveHomeReadOnlyCache(accountId: accountId, resource: "\(kind)/\(key)", snapshot: snapshot)
        return snapshot
    }
    private static func imageMime(_ data: Data) -> String? {
        let bytes = Array(data.prefix(12))
        if bytes.starts(with: [137,80,78,71,13,10,26,10]) { return "image/png" }
        if bytes.starts(with: [255,216,255]) { return "image/jpeg" }
        if bytes.count >= 12, String(bytes: bytes[0..<4], encoding: .ascii) == "RIFF", String(bytes: bytes[8..<12], encoding: .ascii) == "WEBP" { return "image/webp" }
        return nil
    }
    private static func validImageURL(_ value: String?) -> Bool {
        guard let value, value.count <= 5_592_500, let comma = value.firstIndex(of: ","), let data = Data(base64Encoded: String(value[value.index(after: comma)...])), let mime = imageMime(data) else { return false }
        return value.hasPrefix("data:\(mime);base64,")
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
