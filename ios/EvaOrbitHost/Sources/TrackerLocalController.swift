import Foundation

@MainActor
final class TrackerLocalController: NSObject, URLSessionTaskDelegate {
    let database: TrackerLocalDatabase
    private let baseURL: URL
    private let cookies: HTTPCookieStorage
    private var activeSession: URLSession?
    private var generation = 0
    private var nativeSettingsAccount: String?
    private var replicaSessions: [String: Int] = [:]
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
            if path.hasPrefix("home-readonly/") && http.statusCode == 404 { throw TrackerLocalError.network("The Home read-only API is unavailable (HTTP 404). Existing cached data is preserved.") }
            if (path == "food-readonly" || path.hasPrefix("food-readonly/")) && http.statusCode == 404 { throw TrackerLocalError.network("The Food & Drink read-only API is unavailable (HTTP 404). Existing cached data is preserved.") }
            if path == "cats-readonly" && http.statusCode == 404 { throw TrackerLocalError.network("The Cats read-only API is unavailable (HTTP 404). Existing cached data is preserved.") }
            if path.hasPrefix("workspace-readonly/") && http.statusCode == 404 { throw TrackerLocalError.network("The workspace read-only API is unavailable (HTTP 404). Existing cached data is preserved.") }
            if path == "media-readonly" && http.statusCode == 404 { throw TrackerLocalError.network("The Media read-only API is unavailable (HTTP 404). Existing cached data is preserved.") }
            if path == "relations-readonly" && http.statusCode == 404 { throw TrackerLocalError.network("The Relations read-only API is unavailable (HTTP 404). Existing cached data is preserved.") }
            if path == "health-readonly" && http.statusCode == 404 { throw TrackerLocalError.network("The Health read-only API is unavailable (HTTP 404). Existing cached data is preserved.") }
            if path == "subscriptions-readonly" && http.statusCode == 404 { throw TrackerLocalError.network("The Subscriptions read-only API is unavailable (HTTP 404). Existing cached data is preserved.") }
            let message = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            throw TrackerLocalError.network(message?["error"] as? String ?? "同步暂时失败，本地记录已保留")
        }
        return http.statusCode == 204 ? NSNull() : try JSONSerialization.jsonObject(with: data)
    }
    private func performRequest(path: String, method: String, body: Any? = nil, replica: Bool = false) async throws -> (Data, HTTPURLResponse) {
        if path == "sync" && !replica { throw TrackerLocalError.readOnly }
        let trackerPath = path == "trackers" || path.range(of: "^trackers/[1-9][0-9]*(/icon)?$", options: .regularExpression) != nil
        let homePath = path.range(of: "^home-readonly/(day/[0-9]{4}-[0-9]{2}-[0-9]{2}|month/[0-9]{4}-[0-9]{2}|due/current)$", options: .regularExpression) != nil
        let workspacePath = path.range(of: "^workspace-readonly/(tasks|projects|lucius)$", options: .regularExpression) != nil
        let foodPath = path.range(of: "^food-readonly/(catalog/current|place/[1-9][0-9]*|item/[1-9][0-9]*)$", options: .regularExpression) != nil
        guard replica && path == "sync" && method == "POST" || path == "session" && ["GET", "POST", "DELETE"].contains(method) || (path == "inbox" || path == "memos" || path == "chronicle" || workspacePath || trackerPath || homePath || foodPath || path == "food-readonly" || path == "cats-readonly" || path == "subscriptions-readonly" || path == "health-readonly" || path == "relations-readonly" || path == "media-readonly") && method == "GET" else { throw TrackerLocalError.invalid }
        var endpoint = baseURL.appendingPathComponent((trackerPath || path == "chronicle" || path == "memos" || path == "inbox") ? "api/\(path)" : "api/native/\(path)")
        if path == "inbox" {
            guard var components = URLComponents(url: endpoint, resolvingAgainstBaseURL: false) else { throw TrackerLocalError.invalid }
            components.queryItems = [URLQueryItem(name: "status", value: "all")]
            guard let address = components.url else { throw TrackerLocalError.invalid }
            endpoint = address
        }
        var request = URLRequest(url: endpoint)
        request.httpMethod = method
        if replica {
            request.httpShouldHandleCookies = false
            request.setValue(HTTPCookie.requestHeaderFields(with: cookies.cookies(for: baseURL) ?? [])["Cookie"], forHTTPHeaderField: "Cookie")
        }
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw TrackerLocalError.invalid }
        return (data, http)
    }

    func signIn(email: String, password: String) async throws -> [String: String] {
        guard nativeSettingsAccount == nil else { throw TrackerLocalError.network("Close native settings before switching accounts.") }
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
        guard nativeSettingsAccount == nil else { throw TrackerLocalError.network("Close native settings before signing out.") }
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
    func synchronizeReplica(_ body: [String: Any]) async throws -> Any {
        guard body["protocolVersion"] as? Int == 2, let account = body["accountId"] as? String, let mutations = body["mutations"] as? [[String: Any]], mutations.count <= 50 else { throw TrackerLocalError.invalid }
        _ = try await acceptanceStatus(accountId: account)
        let expectedGeneration = generation
        try await database.requireReplicaMutations(accountId: account, mutations: mutations)
        guard mutations.isEmpty || replicaSessions[account] == expectedGeneration else { throw TrackerLocalError.invalid }
        guard let identity = try await request(path: "session", method: "GET") as? [String: Any], identity["authenticated"] as? Bool == true, identity["accountId"] as? String == account else { throw TrackerLocalError.account }
        try await database.requireReplicaMutations(accountId: account, mutations: mutations)
        guard expectedGeneration == generation else { throw TrackerLocalError.account }
        let (data, response) = try await performRequest(path: "sync", method: "POST", body: body, replica: true)
        guard (200..<300).contains(response.statusCode) else { throw TrackerLocalError.network("Tracker sync is unavailable (HTTP \(response.statusCode)). Local changes and the original queue are preserved.") }
        guard let result = try JSONSerialization.jsonObject(with: data) as? [String: Any], result["protocolVersion"] as? Int == 2, result["accountId"] as? String == account, let snapshot = result["snapshot"] as? [String: Any], snapshot["complete"] as? Bool == true, snapshot["records"] is [[String: Any]], let revision = snapshot["revision"] as? Int, revision > 0, result["results"] is [[String: Any]] else { throw TrackerLocalError.invalid }
        try await database.requireAccount(account)
        guard expectedGeneration == generation else { throw TrackerLocalError.account }
        if mutations.isEmpty { replicaSessions[account] = expectedGeneration }
        return result
    }
    static func allowsAIConfiguration(path: String, method: String) -> Bool {
        if path == "/api/ai/providers" { return ["GET", "POST"].contains(method) }
        if path == "/api/ai/providers/test" { return method == "POST" }
        if path.range(of: "^/api/ai/providers/[1-9][0-9]*$", options: .regularExpression) != nil { return ["PATCH", "DELETE"].contains(method) }
        if path.range(of: "^/api/ai/providers/[1-9][0-9]*/models$", options: .regularExpression) != nil { return method == "POST" }
        return path.range(of: "^/api/ai/model-configs/[1-9][0-9]*$", options: .regularExpression) != nil && ["PATCH", "DELETE"].contains(method)
    }
    static func allowsSettingsConfiguration(path: String, method: String) -> Bool {
        if path == "/api/preferences/life-day" { return ["GET", "PATCH"].contains(method) }
        return path == "/api/calendar-interpretation" && ["GET", "PUT"].contains(method)
    }
    // The bundle and TypeScript use the very same explicit route/method manifest.
    static func allowsBusinessRequest(path: String, method: String) -> Bool {
        let pathname = String(path.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)[0])
        guard path.utf8.count <= 4096, pathname.hasPrefix("/api/"), !path.contains("#"),
              !pathname.contains("%"), !pathname.contains("\\"), !pathname.contains("//"),
              !pathname.unicodeScalars.contains(where: { $0.value <= 32 }),
              !pathname.split(separator: "/").contains(where: { $0 == "." || $0 == ".." }),
              let file = Bundle.main.url(forResource: "business-routes", withExtension: "json", subdirectory: "TrackerWeb"),
              let data = try? Data(contentsOf: file), let routes = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return false }
        return routes.contains { route in
            guard let pattern = route["pattern"] as? String, let methods = route["methods"] as? [String] else { return false }
            return methods.contains(method) && pathname.range(of: pattern, options: .regularExpression) != nil
        }
    }
    func beginNativeSettings(accountId: String) async throws -> [HTTPCookie] {
        try await database.requireAccount(accountId)
        let expectedGeneration = generation
        guard nativeSettingsAccount == nil,
              let identity = try await request(path: "session", method: "GET") as? [String: Any],
              identity["authenticated"] as? Bool == true, identity["accountId"] as? String == accountId,
              identity["nativeIntegrationsAccountAllowed"] as? Bool == true,
              identity["onlineBusinessTestAccount"] as? Bool != true else {
            throw TrackerLocalError.network("Native integrations require an explicitly enabled primary account. Test account data cannot write to Apple Health or Reminders.")
        }
        try await database.requireAccount(accountId)
        guard generation == expectedGeneration, nativeSettingsAccount == nil else { throw TrackerLocalError.account }
        nativeSettingsAccount = accountId
        return cookies.cookies(for: baseURL) ?? []
    }
    func endNativeSettings(accountId: String) { if nativeSettingsAccount == accountId { nativeSettingsAccount = nil } }

    func businessRequest(accountId: String, path: String, method: String, contentType: String, bodyBase64: String?, offline: Bool) async throws -> Any {
        guard Self.allowsBusinessRequest(path: path, method: method), baseURL.scheme == "https" else { throw TrackerLocalError.invalid }
        try await database.requireAccount(accountId)
        let expectedGeneration = generation
        if offline {
            guard method == "GET" else { throw TrackerLocalError.network("Connect to save. Nothing was uploaded or queued.") }
            let cached = try await database.onlineCache(accountId: accountId, path: path)
            guard expectedGeneration == generation else { throw TrackerLocalError.account }
            return cached
        }
        guard let identity = try await request(path: "session", method: "GET") as? [String: Any], identity["authenticated"] as? Bool == true else { throw TrackerLocalError.sessionExpired }
        guard identity["accountId"] as? String == accountId else { throw TrackerLocalError.account }
        guard identity["onlineBusinessProtocol"] as? Int == 1 else { throw TrackerLocalError.network("The account-safe online API must be published before saving. Downloaded data is preserved.") }
        guard identity["onlineBusinessTestAccount"] as? Bool == true || identity["onlineBusinessAccountAllowed"] as? Bool == true else { throw TrackerLocalError.network("Online saving is not enabled for this account. Downloaded data and Tracker sync are preserved.") }
        try await database.requireAccount(accountId)
        guard expectedGeneration == generation, let endpoint = URL(string: path, relativeTo: baseURL)?.absoluteURL, endpoint.host == baseURL.host, endpoint.scheme == baseURL.scheme, endpoint.port == baseURL.port else { throw TrackerLocalError.account }
        var outgoing = URLRequest(url: endpoint)
        outgoing.httpMethod = method
        outgoing.httpShouldHandleCookies = false
        outgoing.setValue(HTTPCookie.requestHeaderFields(with: cookies.cookies(for: baseURL) ?? [])["Cookie"], forHTTPHeaderField: "Cookie")
        outgoing.setValue(accountId, forHTTPHeaderField: "X-EvaOrbit-Account")
        outgoing.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        if let bodyBase64 {
            guard ["POST", "PATCH", "PUT"].contains(method), bodyBase64.utf8.count <= 12 * 1024 * 1024,
                  let body = Data(base64Encoded: bodyBase64), body.count <= 8 * 1024 * 1024,
                  contentType == "application/json" || contentType.hasPrefix("multipart/form-data; boundary="),
                  contentType.utf8.count <= 200, !contentType.contains("\r"), !contentType.contains("\n") else { throw TrackerLocalError.invalid }
            if contentType == "application/json" { _ = try JSONSerialization.jsonObject(with: body) }
            outgoing.setValue(contentType, forHTTPHeaderField: "Content-Type")
            outgoing.httpBody = body
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = 20
        let connection = URLSession(configuration: configuration, delegate: self, delegateQueue: .main)
        defer { connection.invalidateAndCancel() }
        let networkResult: (Data, URLResponse)
        do { networkResult = try await connection.data(for: outgoing) }
        catch {
            if method != "GET" { throw TrackerLocalError.network("The save result is unknown. Reconnect and refresh before submitting again; nothing retries automatically.") }
            throw error
        }
        let (data, response) = networkResult
        guard let http = response as? HTTPURLResponse, !(300..<400).contains(http.statusCode), data.count <= 8 * 1024 * 1024 else { throw TrackerLocalError.invalid }
        try await database.requireAccount(accountId)
        guard expectedGeneration == generation else { throw TrackerLocalError.account }
        let result: [String: Any] = ["status": http.statusCode, "body": http.statusCode == 204 ? NSNull() : try JSONSerialization.jsonObject(with: data)]
        if method == "GET", (200..<300).contains(http.statusCode) { try await database.saveOnlineCache(accountId: accountId, path: path, response: result) }
        // A cache failure cannot turn an acknowledged cloud write into a failed save.
        if method != "GET", (200..<300).contains(http.statusCode) { try? await database.invalidateOnlineCache(accountId: accountId, module: String(path.split(separator: "?")[0].split(separator: "/")[1])) }
        try await database.requireAccount(accountId)
        guard expectedGeneration == generation else { throw TrackerLocalError.account }
        return result
    }
    // Explicit online settings only; never persists a key or enqueues a request.
    func aiConfiguration(accountId: String, path: String, method: String, body: Any?, settings: Bool = false) async throws -> Any {
        guard (settings ? Self.allowsSettingsConfiguration(path: path, method: method) : Self.allowsAIConfiguration(path: path, method: method)), baseURL.scheme == "https" else { throw TrackerLocalError.invalid }
        try await database.requireAccount(accountId)
        let expectedGeneration = generation
        guard let identity = try await request(path: "session", method: "GET") as? [String: Any], identity["authenticated"] as? Bool == true, identity["accountId"] as? String == accountId else { throw TrackerLocalError.account }
        guard identity[settings ? "settingsConfigurationProtocol" : "aiConfigurationProtocol"] as? Int == 1 else { throw TrackerLocalError.network("The account-safe AI settings API must be deployed before saving configuration.") }
        try await database.requireAccount(accountId)
        guard expectedGeneration == generation else { throw TrackerLocalError.account }
        var outgoing = URLRequest(url: baseURL.appendingPathComponent(String(path.dropFirst())))
        outgoing.httpMethod = method
        outgoing.setValue("application/json", forHTTPHeaderField: "Content-Type")
        outgoing.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        outgoing.setValue(accountId, forHTTPHeaderField: "X-EvaOrbit-Account")
        // Freeze the authenticated cookie snapshot; a later login cannot retarget this write.
        outgoing.httpShouldHandleCookies = false
        let header = HTTPCookie.requestHeaderFields(with: cookies.cookies(for: baseURL) ?? [])
        outgoing.setValue(header["Cookie"], forHTTPHeaderField: "Cookie")
        if let body {
            guard ["POST", "PATCH", "PUT"].contains(method), body is [String: Any] else { throw TrackerLocalError.invalid }
            let encoded = try JSONSerialization.data(withJSONObject: body)
            guard encoded.count <= 32768 else { throw TrackerLocalError.invalid }
            outgoing.httpBody = encoded
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = 20
        let connection = URLSession(configuration: configuration, delegate: self, delegateQueue: .main)
        defer { connection.invalidateAndCancel() }
        let (data, response) = try await connection.data(for: outgoing)
        guard let http = response as? HTTPURLResponse, !(300..<400).contains(http.statusCode), data.count <= 1048576 else { throw TrackerLocalError.invalid }
        try await database.requireAccount(accountId)
        guard expectedGeneration == generation else { throw TrackerLocalError.account }
        return ["status": http.statusCode, "body": http.statusCode == 204 ? NSNull() : try JSONSerialization.jsonObject(with: data)] as [String: Any]
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
    func subscriptionsReadOnlySnapshot(accountId: String, refresh: Bool) async throws -> Any {
        _ = try await acceptanceStatus(accountId: accountId)
        if !refresh { return try await database.subscriptionsReadOnlyCache(accountId: accountId) }
        let expectedGeneration = generation
        guard let identity = try await request(path: "session", method: "GET") as? [String: Any], identity["authenticated"] as? Bool == true, identity["accountId"] as? String == accountId else { throw TrackerLocalError.account }
        guard let snapshot = try await request(path: "subscriptions-readonly", method: "GET") as? [String: Any], snapshot["accountId"] as? String == accountId, let captured = snapshot["capturedAt"] as? String, Self.validTimestamp(captured), snapshot["items"] is [[String: Any]], snapshot["iconSources"] is [String: String] else { throw TrackerLocalError.invalid }
        guard expectedGeneration == generation, let identity = try await request(path: "session", method: "GET") as? [String: Any], identity["authenticated"] as? Bool == true, identity["accountId"] as? String == accountId else { throw TrackerLocalError.account }
        guard expectedGeneration == generation else { throw TrackerLocalError.account }
        try await database.saveSubscriptionsReadOnlyCache(accountId: accountId, snapshot: snapshot)
        return snapshot
    }

    func healthReadOnlySnapshot(accountId: String, refresh: Bool) async throws -> Any {
        _ = try await acceptanceStatus(accountId: accountId)
        if !refresh { return try await database.healthReadOnlyCache(accountId: accountId) }
        let expectedGeneration = generation
        guard let identity = try await request(path: "session", method: "GET") as? [String: Any], identity["authenticated"] as? Bool == true, identity["accountId"] as? String == accountId else { throw TrackerLocalError.account }
        guard let snapshot = try await request(path: "health-readonly", method: "GET") as? [String: Any], snapshot["accountId"] as? String == accountId, let captured = snapshot["capturedAt"] as? String, Self.validTimestamp(captured), snapshot["sleep"] is [String: Any], snapshot["records"] is [[String: Any]] else { throw TrackerLocalError.invalid }
        guard expectedGeneration == generation, let identity = try await request(path: "session", method: "GET") as? [String: Any], identity["authenticated"] as? Bool == true, identity["accountId"] as? String == accountId else { throw TrackerLocalError.account }
        guard expectedGeneration == generation else { throw TrackerLocalError.account }
        try await database.saveHealthReadOnlyCache(accountId: accountId, snapshot: snapshot)
        return snapshot
    }

    func workspaceReadOnlySnapshot(accountId: String, kind: String, refresh: Bool) async throws -> Any {
        guard ["tasks", "projects", "lucius"].contains(kind) else { throw TrackerLocalError.invalid }
        _ = try await acceptanceStatus(accountId: accountId)
        if !refresh { return try await database.workspaceReadOnlyCache(accountId: accountId, kind: kind) }
        let expectedGeneration = generation
        guard let identity = try await request(path: "session", method: "GET") as? [String: Any], identity["authenticated"] as? Bool == true, identity["accountId"] as? String == accountId else { throw TrackerLocalError.account }
        guard let snapshot = try await request(path: "workspace-readonly/\(kind)", method: "GET") as? [String: Any], snapshot["accountId"] as? String == accountId, let captured = snapshot["capturedAt"] as? String, Self.validTimestamp(captured), snapshot["kind"] as? String == kind, snapshot["data"] is [String: Any] else { throw TrackerLocalError.invalid }
        guard expectedGeneration == generation, let identity = try await request(path: "session", method: "GET") as? [String: Any], identity["authenticated"] as? Bool == true, identity["accountId"] as? String == accountId else { throw TrackerLocalError.account }
        guard expectedGeneration == generation else { throw TrackerLocalError.account }
        try await database.saveWorkspaceReadOnlyCache(accountId: accountId, kind: kind, snapshot: snapshot)
        return snapshot
    }

    func mediaReadOnlySnapshot(accountId: String, refresh: Bool) async throws -> Any {
        _ = try await acceptanceStatus(accountId: accountId)
        if !refresh { return try await database.mediaReadOnlyCache(accountId: accountId) }
        let expectedGeneration = generation
        guard let identity = try await request(path: "session", method: "GET") as? [String: Any], identity["authenticated"] as? Bool == true, identity["accountId"] as? String == accountId else { throw TrackerLocalError.account }
        guard let snapshot = try await request(path: "media-readonly", method: "GET") as? [String: Any], snapshot["accountId"] as? String == accountId, let captured = snapshot["capturedAt"] as? String, Self.validTimestamp(captured), snapshot["items"] is [[String: Any]], snapshot["series"] is [[String: Any]] else { throw TrackerLocalError.invalid }
        guard expectedGeneration == generation, let identity = try await request(path: "session", method: "GET") as? [String: Any], identity["authenticated"] as? Bool == true, identity["accountId"] as? String == accountId else { throw TrackerLocalError.account }
        guard expectedGeneration == generation else { throw TrackerLocalError.account }
        try await database.saveMediaReadOnlyCache(accountId: accountId, snapshot: snapshot)
        return snapshot
    }

    func relationsReadOnlySnapshot(accountId: String, refresh: Bool) async throws -> Any {
        _ = try await acceptanceStatus(accountId: accountId)
        if !refresh { return try await database.relationsReadOnlyCache(accountId: accountId) }
        let expectedGeneration = generation
        guard let identity = try await request(path: "session", method: "GET") as? [String: Any], identity["authenticated"] as? Bool == true, identity["accountId"] as? String == accountId else { throw TrackerLocalError.account }
        guard let snapshot = try await request(path: "relations-readonly", method: "GET") as? [String: Any], snapshot["accountId"] as? String == accountId, let captured = snapshot["capturedAt"] as? String, Self.validTimestamp(captured), snapshot["people"] is [[String: Any]], snapshot["details"] is [[String: Any]] else { throw TrackerLocalError.invalid }
        guard expectedGeneration == generation, let identity = try await request(path: "session", method: "GET") as? [String: Any], identity["authenticated"] as? Bool == true, identity["accountId"] as? String == accountId else { throw TrackerLocalError.account }
        guard expectedGeneration == generation else { throw TrackerLocalError.account }
        try await database.saveRelationsReadOnlyCache(accountId: accountId, snapshot: snapshot)
        return snapshot
    }

    func chronicleReadOnlySnapshot(accountId: String, refresh: Bool) async throws -> Any {
        _ = try await acceptanceStatus(accountId: accountId)
        if !refresh { return try await database.chronicleReadOnlyCache(accountId: accountId) }
        let expectedGeneration = generation
        guard let identity = try await request(path: "session", method: "GET") as? [String: Any], identity["authenticated"] as? Bool == true, identity["accountId"] as? String == accountId else { throw TrackerLocalError.account }
        guard let items = try await request(path: "chronicle", method: "GET") as? [[String: Any]], items.count <= 100 else { throw TrackerLocalError.invalid }
        let snapshot: [String: Any] = ["format": "eo-chronicle-readonly-v1", "accountId": accountId, "capturedAt": ISO8601DateFormatter().string(from: Date()), "items": items, "complete": items.count < 100]
        guard expectedGeneration == generation, let identity = try await request(path: "session", method: "GET") as? [String: Any], identity["authenticated"] as? Bool == true, identity["accountId"] as? String == accountId else { throw TrackerLocalError.account }
        guard expectedGeneration == generation else { throw TrackerLocalError.account }
        try await database.saveChronicleReadOnlyCache(accountId: accountId, snapshot: snapshot)
        return snapshot
    }

    func memoReadOnlySnapshot(accountId: String, refresh: Bool) async throws -> Any {
        _ = try await acceptanceStatus(accountId: accountId)
        if !refresh { return try await database.memoReadOnlyCache(accountId: accountId) }
        let expectedGeneration = generation
        guard let identity = try await request(path: "session", method: "GET") as? [String: Any], identity["authenticated"] as? Bool == true, identity["accountId"] as? String == accountId else { throw TrackerLocalError.account }
        guard let items = try await request(path: "memos", method: "GET") as? [[String: Any]], items.count <= 100 else { throw TrackerLocalError.invalid }
        let snapshot: [String: Any] = ["format": "eo-memo-readonly-v1", "accountId": accountId, "capturedAt": ISO8601DateFormatter().string(from: Date()), "items": items, "complete": items.count < 100]
        guard expectedGeneration == generation, let identity = try await request(path: "session", method: "GET") as? [String: Any], identity["authenticated"] as? Bool == true, identity["accountId"] as? String == accountId else { throw TrackerLocalError.account }
        guard expectedGeneration == generation else { throw TrackerLocalError.account }
        try await database.saveMemoReadOnlyCache(accountId: accountId, snapshot: snapshot)
        return snapshot
    }

    func inboxReadOnlySnapshot(accountId: String, refresh: Bool) async throws -> Any {
        _ = try await acceptanceStatus(accountId: accountId)
        if !refresh { return try await database.inboxReadOnlyCache(accountId: accountId) }
        let expectedGeneration = generation
        guard let identity = try await request(path: "session", method: "GET") as? [String: Any], identity["authenticated"] as? Bool == true, identity["accountId"] as? String == accountId else { throw TrackerLocalError.account }
        guard let items = try await request(path: "inbox", method: "GET") as? [[String: Any]] else { throw TrackerLocalError.invalid }
        let snapshot: [String: Any] = ["format": "eo-inbox-readonly-v1", "accountId": accountId, "capturedAt": ISO8601DateFormatter().string(from: Date()), "items": Array(items.prefix(500))]
        guard expectedGeneration == generation, let identity = try await request(path: "session", method: "GET") as? [String: Any], identity["authenticated"] as? Bool == true, identity["accountId"] as? String == accountId else { throw TrackerLocalError.account }
        guard expectedGeneration == generation else { throw TrackerLocalError.account }
        try await database.saveInboxReadOnlyCache(accountId: accountId, snapshot: snapshot)
        return snapshot
    }

    func catsReadOnlySnapshot(accountId: String, refresh: Bool) async throws -> Any {
        _ = try await acceptanceStatus(accountId: accountId)
        if !refresh { return try await database.catsReadOnlyCache(accountId: accountId) }
        let expectedGeneration = generation
        guard let identity = try await request(path: "session", method: "GET") as? [String: Any], identity["authenticated"] as? Bool == true, identity["accountId"] as? String == accountId else { throw TrackerLocalError.account }
        guard let snapshot = try await request(path: "cats-readonly", method: "GET") as? [String: Any], snapshot["accountId"] as? String == accountId, let captured = snapshot["capturedAt"] as? String, Self.validTimestamp(captured), let dashboard = snapshot["dashboard"] as? [String: Any], ["pets", "household", "routines", "oneTimeTasks", "timeline"].allSatisfy({ dashboard[$0] is [[String: Any]] }) else { throw TrackerLocalError.invalid }
        guard expectedGeneration == generation, let identity = try await request(path: "session", method: "GET") as? [String: Any], identity["authenticated"] as? Bool == true, identity["accountId"] as? String == accountId else { throw TrackerLocalError.account }
        guard expectedGeneration == generation else { throw TrackerLocalError.account }
        try await database.saveCatsReadOnlyCache(accountId: accountId, snapshot: snapshot)
        return snapshot
    }

    func foodReadOnlySnapshot(accountId: String, refresh: Bool) async throws -> Any {
        _ = try await acceptanceStatus(accountId: accountId)
        if !refresh { return try await database.foodReadOnlyCache(accountId: accountId) }
        let expectedGeneration = generation
        guard let identity = try await request(path: "session", method: "GET") as? [String: Any], identity["authenticated"] as? Bool == true, identity["accountId"] as? String == accountId else { throw TrackerLocalError.account }
        guard let snapshot = try await request(path: "food-readonly", method: "GET") as? [String: Any], snapshot["format"] as? String == "eo-food-readonly-v1", snapshot["accountId"] as? String == accountId, let capturedAt = snapshot["capturedAt"] as? String, Self.validTimestamp(capturedAt), let home = snapshot["home"] as? [String: Any], let window = snapshot["window"] as? [String: Any], window["to"] as? String == home["date"] as? String else { throw TrackerLocalError.invalid }
        for name in ["foods", "drinks"] {
            guard let rows = snapshot[name] as? [[String: Any]], rows.count <= 500 else { throw TrackerLocalError.invalid }
            var ids = Set<Int>()
            for row in rows {
                guard let id = row["id"] as? Int, id > 0, ids.insert(id).inserted, let occurred = row["occurredAt"] as? String, Self.validTimestamp(occurred) else { throw TrackerLocalError.invalid }
            }
        }
        guard expectedGeneration == generation, let identity = try await request(path: "session", method: "GET") as? [String: Any], identity["authenticated"] as? Bool == true, identity["accountId"] as? String == accountId else { throw TrackerLocalError.account }
        guard expectedGeneration == generation else { throw TrackerLocalError.account }
        try await database.saveFoodReadOnlyCache(accountId: accountId, snapshot: snapshot)
        return snapshot
    }

    func foodReadOnlyResource(accountId: String, kind: String, key: String, refresh: Bool) async throws -> Any {
        _ = try await acceptanceStatus(accountId: accountId)
        guard kind == "catalog" && key == "current" || ["place", "item"].contains(kind) && key.range(of: "^[1-9][0-9]*$", options: .regularExpression) != nil && Int(key).map({ $0 <= 9_007_199_254_740_991 }) == true else { throw TrackerLocalError.invalid }
        let resource = "\(kind)/\(key)"
        if !refresh { return try await database.foodResourceCache(accountId: accountId, resource: resource) }
        let expectedGeneration = generation
        guard let identity = try await request(path: "session", method: "GET") as? [String: Any], identity["authenticated"] as? Bool == true, identity["accountId"] as? String == accountId else { throw TrackerLocalError.account }
        guard let snapshot = try await request(path: "food-readonly/\(resource)", method: "GET") as? [String: Any], snapshot["format"] as? String == "eo-food-resource-v1", snapshot["accountId"] as? String == accountId, snapshot["kind"] as? String == kind, snapshot["key"] as? String == key, let captured = snapshot["capturedAt"] as? String, Self.validTimestamp(captured) else { throw TrackerLocalError.invalid }
        if kind == "catalog" {
            guard let data = snapshot["data"] as? [String: Any], let places = data["places"] as? [[String: Any]], places.count <= 200, let library = data["library"] as? [[String: Any]], library.count <= 100, data["placesComplete"] is Bool, data["libraryComplete"] is Bool else { throw TrackerLocalError.invalid }
        } else if !(snapshot["data"] is NSNull) {
            guard let data = snapshot["data"] as? [String: Any] else { throw TrackerLocalError.invalid }
            if kind == "place" {
                guard let place = data["place"] as? [String: Any], place["id"] as? Int == Int(key), ["dishes", "drinkMenu", "recentFoodLogs", "recentDrinkLogs", "packagedFood"].allSatisfy({ data[$0] is [[String: Any]] }) else { throw TrackerLocalError.invalid }
            } else { guard data["id"] as? Int == Int(key), data["name"] is String, data["referenceType"] is String else { throw TrackerLocalError.invalid } }
        }
        guard expectedGeneration == generation, let identity = try await request(path: "session", method: "GET") as? [String: Any], identity["authenticated"] as? Bool == true, identity["accountId"] as? String == accountId else { throw TrackerLocalError.account }
        guard expectedGeneration == generation else { throw TrackerLocalError.account }
        try await database.saveFoodResourceCache(accountId: accountId, resource: resource, snapshot: snapshot)
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
