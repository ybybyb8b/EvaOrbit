import XCTest
@testable import EvaOrbitHost

private final class BusinessURLProtocol: URLProtocol {
    typealias Handler = (BusinessURLProtocol) -> Void
    private static let lock = NSLock()
    private static var handlers: [String: Handler] = [:]
    static func setHandler(_ handler: Handler?, for url: URL) {
        lock.withLock { handlers[url.host!] = handler }
    }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let handler = Self.lock.withLock { Self.handlers[request.url!.host!] }
        if let handler { handler(self) }
        else { client?.urlProtocol(self, didFailWithError: URLError(.resourceUnavailable)) }
    }
    override func stopLoading() {}
    func respond(status: Int = 200, headers: [String: String] = [:]) {
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!, cacheStoragePolicy: .notAllowed)
    }
    func send(_ data: Data) { client?.urlProtocol(self, didLoad: data) }
    func finish() { client?.urlProtocolDidFinishLoading(self) }
}

final class OnlineBusinessTests: XCTestCase {
    @MainActor func testBusinessResponseRejectsOversizedHeaderWithoutWaitingForTheBody() async throws {
        let url = URL(string: "https://\(UUID().uuidString.lowercased()).example.invalid/api/memory-graph")!
        BusinessURLProtocol.setHandler({ $0.respond(headers: ["Content-Length": "8388609"]) }, for: url)
        defer { BusinessURLProtocol.setHandler(nil, for: url) }
        let configuration = TrackerLocalController.businessConfiguration(echo: true)
        configuration.protocolClasses = [BusinessURLProtocol.self]
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        do {
            _ = try await TrackerLocalController.readBusinessResponse(URLRequest(url: url), using: session)
            XCTFail("An oversized header must fail before the server sends its body")
        } catch let diagnostic as NativeDiagnosticFailure {
            XCTAssertEqual(diagnostic.code, "response_too_large")
        }
    }

    @MainActor func testBusinessResponseBoundsChunksWithNoContentLength() async throws {
        let limit = 8 * 1024 * 1024
        for extra in [0, 1] {
            let url = URL(string: "https://\(UUID().uuidString.lowercased()).example.invalid/api/memory-graph")!
            BusinessURLProtocol.setHandler({ transport in
                transport.respond(headers: ["Transfer-Encoding": "chunked"])
                let chunk = Data(repeating: 65, count: 1024 * 1024)
                for _ in 0..<8 { transport.send(chunk) }
                if extra > 0 {
                    transport.send(Data([66]))
                    // Leave the response open to verify early cancellation.
                } else { transport.finish() }
            }, for: url)
            defer { BusinessURLProtocol.setHandler(nil, for: url) }
            let configuration = TrackerLocalController.businessConfiguration(echo: true)
            configuration.protocolClasses = [BusinessURLProtocol.self]
            let session = URLSession(configuration: configuration)
            defer { session.invalidateAndCancel() }
            do {
                let (body, _) = try await TrackerLocalController.readBusinessResponse(URLRequest(url: url), using: session)
                XCTAssertEqual(extra, 0)
                XCTAssertEqual(body.count, limit)
            } catch let diagnostic as NativeDiagnosticFailure {
                XCTAssertEqual(extra, 1)
                XCTAssertEqual(diagnostic.code, "response_too_large")
            }
        }
    }

    @MainActor func testBusinessRequestFreezesCookieAndRejectsResponseAfterLogout() async throws {
        guard Bundle.main.url(forResource: "business-routes", withExtension: "json", subdirectory: "TrackerWeb") != nil else { throw XCTSkip("Build the local React bundle before testing") }
        let baseURL = URL(string: "https://\(UUID().uuidString.lowercased()).example.invalid")!
        let account = "10000000-0000-4000-8000-000000000001"
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let database = try TrackerLocalDatabase(path: directory.appendingPathComponent("test.sqlite3").path)
        try await database.setAccount(id: account, email: "a@example.invalid")
        let controller = TrackerLocalController(baseURL: baseURL, database: database, protocolClasses: [BusinessURLProtocol.self])
        let cookie = try XCTUnwrap(HTTPCookie(properties: [.name: "session", .value: "fixture-a", .domain: baseURL.host!, .path: "/", .secure: "TRUE"]))
        HTTPCookieStorage.shared.setCookie(cookie)
        defer { HTTPCookieStorage.shared.deleteCookie(cookie) }
        let dispatched = expectation(description: "Frozen request dispatched")
        BusinessURLProtocol.setHandler({ transport in
            if transport.request.url?.path == "/api/native/session" {
                transport.respond()
                transport.send(Data("""
                {"authenticated":true,"accountId":"\(account)","onlineBusinessProtocol":1,"onlineBusinessAccountAllowed":true}
                """.utf8))
                transport.finish()
                return
            }
            XCTAssertEqual(transport.request.value(forHTTPHeaderField: "Cookie"), "session=fixture-a")
            XCTAssertEqual(transport.request.value(forHTTPHeaderField: "X-EvaOrbit-Account"), account)
            transport.respond()
            dispatched.fulfill()
            // The caller logs out while this body is still open.
        }, for: baseURL)
        defer { BusinessURLProtocol.setHandler(nil, for: baseURL) }
        let request = Task {
            try await controller.businessRequest(accountId: account, path: "/api/memory-graph", method: "GET", contentType: "application/json", bodyBase64: nil, offline: false)
        }
        defer { request.cancel() }
        await fulfillment(of: [dispatched], timeout: 4)
        try await controller.signOut()
        do {
            _ = try await request.value
            XCTFail("An old account response crossed the generation boundary")
        } catch TrackerLocalError.account {}
    }

    @MainActor func testBusinessRedirectIsBlockedAndTimeoutUsesSafeDiagnostics() async throws {
        let configuration = TrackerLocalController.businessConfiguration(echo: true)
        XCTAssertEqual(configuration.timeoutIntervalForRequest, 5)
        XCTAssertEqual(configuration.timeoutIntervalForResource, 8)
        XCTAssertEqual(TrackerLocalController.businessConfiguration(echo: false).timeoutIntervalForRequest, 20)
        XCTAssertNil(configuration.httpCookieStorage)
        XCTAssertFalse(configuration.httpShouldSetCookies)
        configuration.protocolClasses = [BusinessURLProtocol.self]
        let base = URL(string: "https://\(UUID().uuidString.lowercased()).example.invalid")!
        BusinessURLProtocol.setHandler({ transport in
            if transport.request.url?.path == "/redirect" {
                transport.respond(status: 302, headers: ["Location": "https://redirect.example.invalid/"])
                transport.finish()
            } else {
                transport.client?.urlProtocol(transport, didFailWithError: URLError(.timedOut))
            }
        }, for: base)
        defer { BusinessURLProtocol.setHandler(nil, for: base) }
        let controller = TrackerLocalController(baseURL: base, database: try TrackerLocalDatabase(path: ":memory:"))
        let session = URLSession(configuration: configuration, delegate: controller, delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        let redirect = URLRequest(url: base.appendingPathComponent("redirect"))
        let other = URLRequest(url: URL(string: "https://redirect.example.invalid/")!)
        let response = HTTPURLResponse(url: redirect.url!, statusCode: 302, httpVersion: "HTTP/1.1", headerFields: nil)!
        controller.urlSession(session, task: session.dataTask(with: redirect), willPerformHTTPRedirection: response, newRequest: other) { XCTAssertNil($0) }
        do {
            _ = try await TrackerLocalController.readBusinessResponse(redirect, using: session)
            XCTFail("Redirected responses must be rejected")
        } catch let diagnostic as NativeDiagnosticFailure {
            XCTAssertEqual(diagnostic.code, "http_redirect_blocked")
        }
        do {
            _ = try await TrackerLocalController.readBusinessResponse(URLRequest(url: base.appendingPathComponent("timeout")), using: session)
            XCTFail("Timeout must propagate to the caller")
        } catch {
            XCTAssertEqual(NativeDiagnostics.describe(error).code, "network_timeout")
        }
    }
    @MainActor func testUncertainSaveIncludesSafeNetworkDiagnosticWithoutQueryOrErrorPayload() {
        let error = NSError(domain: NSURLErrorDomain, code: NSURLErrorTimedOut, userInfo: [NSLocalizedDescriptionKey: "private payload"])
        let diagnostic = NativeDiagnostics.capture(error, operation: "PUT /api/eventkit/links · connection", writeResultUnknown: true)
        let message = diagnostic.message
        XCTAssertTrue(message.contains("save result is unknown"))
        XCTAssertTrue(message.contains("nothing retries automatically"))
        XCTAssertTrue(message.contains("PUT /api/eventkit/links"))
        XCTAssertEqual(diagnostic.code, "network_timeout")
        XCTAssertFalse(message.contains("secret"))
        XCTAssertFalse(message.contains("private payload"))
        let offline = NativeDiagnostics.capture(URLError(.notConnectedToInternet), operation: "POST /api/eventkit/calendar-import", writeResultUnknown: true)
        XCTAssertEqual(offline.code, "network_offline")
    }
    @MainActor func testBundledRouteManifestRejectsPrivilegedAndEscapedPaths() throws {
        guard Bundle.main.url(forResource: "business-routes", withExtension: "json", subdirectory: "TrackerWeb") != nil else { throw XCTSkip("Local React bundle was not built for this Host variant") }
        XCTAssertTrue(NativeBridge.trackerMethods.contains("business.request"))
        XCTAssertTrue(TrackerLocalController.allowsBusinessRequest(path: "/api/trackers/1", method: "DELETE"))
        XCTAssertTrue(TrackerLocalController.allowsBusinessRequest(path: "/api/trackers/1", method: "PATCH"))
        XCTAssertTrue(TrackerLocalController.allowsBusinessRequest(path: "/api/health/weight", method: "POST"))
        XCTAssertTrue(TrackerLocalController.allowsBusinessRequest(path: "/api/memos?q=old%20note", method: "GET"))
        for path in ["https://evil.invalid/api/tasks", "/api/tasks/../ai/providers", "/api/tasks/%2e%2e/ai/providers", "/api/native/sync", "/api/trackers/1", "/api/ai/providers", "/api/eventkit/links", "/api/reminders/deliver"] {
            XCTAssertFalse(TrackerLocalController.allowsBusinessRequest(path: path, method: "POST"), path)
        }
    }
    func testOnlineCachePersistsAndCannotCrossAccountsOrEraseOtherModules() async throws {
        let accountA = "10000000-0000-4000-8000-000000000001"
        let accountB = "20000000-0000-4000-8000-000000000002"
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appendingPathComponent("test.sqlite3").path
        let database = try TrackerLocalDatabase(path: path)
        try await database.setAccount(id: accountA, email: "a@example.invalid")
        try await database.saveOnlineCache(accountId: accountA, path: "/api/memos", response: ["status": 200, "body": [["id": 1]]])
        try await database.saveOnlineCache(accountId: accountA, path: "/api/tasks?status=open", response: ["status": 200, "body": []])
        let reopened = try TrackerLocalDatabase(path: path)
        let cached = try await reopened.onlineCache(accountId: accountA, path: "/api/memos") as? [String: Any]
        XCTAssertEqual(cached?["status"] as? Int, 200)
        try await database.invalidateOnlineCache(accountId: accountA, module: "tasks")
        let memo = try await database.onlineCache(accountId: accountA, path: "/api/memos")
        let tasks = try await database.onlineCache(accountId: accountA, path: "/api/tasks?status=open")
        XCTAssertTrue(memo is [String: Any]); XCTAssertTrue(tasks is NSNull)
        try await database.setAccount(id: accountB, email: "b@example.invalid")
        do { _ = try await database.onlineCache(accountId: accountA, path: "/api/memos"); XCTFail("Previous account must be rejected") } catch TrackerLocalError.account { }
        let empty = try await database.onlineCache(accountId: accountB, path: "/api/memos")
        XCTAssertTrue(empty is NSNull)
        try await database.setAccount(id: accountA, email: "a@example.invalid")
        let preserved = try await database.onlineCache(accountId: accountA, path: "/api/memos")
        XCTAssertTrue(preserved is [String: Any])
    }
}
