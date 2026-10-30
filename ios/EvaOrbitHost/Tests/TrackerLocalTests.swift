import XCTest
import SQLite3
import WebKit
import UIKit
@testable import EvaOrbitHost

final class TrackerLocalTests: XCTestCase {
    // XCTest's deadline returns even when WebKit never invokes its callback.
    // A racing TaskGroup would still wait for the stuck WebKit child to finish.
    @MainActor private func runJavaScript(_ script: String, in webView: WKWebView, asyncFunction: Bool = false, timeout: TimeInterval = 10) async throws -> Any? {
        let completed = expectation(description: "WebKit JavaScript completed: \(script.prefix(100))")
        var output: Result<Any?, Error>?
        let receive: (Result<Any?, Error>) -> Void = { result in
            output = result
            completed.fulfill()
        }
        if asyncFunction {
            webView.callAsyncJavaScript(script, arguments: [:], in: nil, in: .page) { result in
                receive(result.map { Optional($0) })
            }
        } else {
            webView.evaluateJavaScript(script) { value, error in
                receive(error.map { .failure($0) } ?? .success(value))
            }
        }
        let waited = await XCTWaiter.fulfillment(of: [completed], timeout: timeout)
        guard waited == .completed else {
            throw NSError(domain: "EvaOrbitHostTests.JavaScriptDeadline", code: 1, userInfo: [NSLocalizedDescriptionKey: "WebKit did not complete within \(timeout)s: \(script.prefix(100))"])
        }
        return try XCTUnwrap(output, "WebKit did not respond; stop this test instead of awaiting another page operation").get()
    }

    @MainActor private func showWebView(_ webView: WKWebView) -> () -> Void {
        let controller = UIViewController()
        let window = UIWindow(frame: webView.frame)
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        let previousKeyWindow = scene?.windows.first { $0.isKeyWindow }
        window.windowScene = scene
        window.rootViewController = controller
        controller.view.addSubview(webView)
        window.makeKeyAndVisible()
        return {
            webView.stopLoading()
            webView.removeFromSuperview()
            window.isHidden = true
            window.rootViewController = nil
            previousKeyWindow?.makeKey()
        }
    }

    @MainActor private func waitForHeading(_ expected: String, in webView: WKWebView) async throws {
        let deadline = Date().addingTimeInterval(40)
        var title: String?
        repeat {
            title = try await runJavaScript("document.querySelector('h1')?.textContent", in: webView, timeout: min(30, max(1, deadline.timeIntervalSinceNow))) as? String
            if title == expected { return }
            try await Task.sleep(nanoseconds: 100_000_000)
        } while Date() < deadline
        let diagnostics = try await runJavaScript("JSON.stringify({url:location.href,state:document.readyState,text:document.body?.innerText?.slice(0,1500),errors:window.__eoTestErrors})", in: webView)
        let attachment = XCTAttachment(string: String(describing: diagnostics))
        attachment.name = "Local React startup diagnostics"
        attachment.lifetime = .keepAlways
        add(attachment)
        // Unlike XCTAssertEqual, a thrown failure stops the following readiness/font waits.
        _ = try XCTUnwrap(title == expected ? title : nil, "Expected \(expected), got \(String(describing: title)). \(String(describing: diagnostics))")
    }

    @MainActor func testWebKitPromiseDeadlineReturnsWithoutWaitingForThePromise() async throws {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 402, height: 874), configuration: configuration)
        let close = showWebView(webView)
        defer { close() }
        webView.loadHTMLString("<h1>Deadline fixture</h1>", baseURL: nil)
        try await waitForHeading("Deadline fixture", in: webView)
        do {
            _ = try await runJavaScript("await new Promise(() => {}); return true;", in: webView, asyncFunction: true, timeout: 0.2)
            XCTFail("An unresolved WebKit promise must time out")
        } catch {
            XCTAssertEqual((error as NSError).domain, "EvaOrbitHostTests.JavaScriptDeadline")
        }
        let responsive = try await runJavaScript("true", in: webView)
        XCTAssertEqual(responsive as? Bool, true, "Timing out one promise must not block later WebKit callbacks")
    }

    @MainActor func testBundledReactBootsFromTheLocalScheme() async throws {
        let root = try XCTUnwrap(Bundle.main.url(forResource: "TrackerWeb", withExtension: nil))
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.ignoresViewportScaleLimits = false
        configuration.userContentController.addUserScript(WKUserScript(source: WebViewController.localViewportScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        configuration.setURLSchemeHandler(TrackerAssetHandler(root: root), forURLScheme: TrackerAssetHandler.scheme)
        // Offline, signed-out bridge fixture: the document must still render a
        // usable entry, without a hosted page or a successful session request.
        configuration.userContentController.addUserScript(WKUserScript(source: "window.__eoTestErrors=[];addEventListener('error',event=>window.__eoTestErrors.push(event.message));addEventListener('unhandledrejection',event=>window.__eoTestErrors.push(String(event.reason)));window.EvaOrbitNative={version:1,call:async()=>({ok:true,result:null})};", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 402, height: 874), configuration: configuration)
        // requestAnimationFrame may be suspended in a detached WKWebView.
        // The production Host is visible, so the test must provide the same lifecycle.
        let close = showWebView(webView)
        defer { close() }
        webView.load(URLRequest(url: TrackerAssetHandler.entryURL))
        try await waitForHeading("Welcome back to EvaOrbit", in: webView)
        let contentReady = try await runJavaScript(WebViewController.localContentReadyScript, in: webView, asyncFunction: true)
        XCTAssertEqual(contentReady as? Bool, true, "Signed-out React must release the native launch overlay")
        let viewport = try await runJavaScript("document.querySelector('meta[name=viewport]').content", in: webView) as? String
        XCTAssertTrue(viewport?.contains("maximum-scale=1") == true)
        XCTAssertTrue(viewport?.contains("user-scalable=no") == true)
        let fontResult = try await runJavaScript("await document.fonts.load('400 24px \"EO August Stories\"'); return Array.from(document.fonts).some(font => font.family.replaceAll('\"','') === 'EO August Stories' && font.status === 'loaded');", in: webView, asyncFunction: true)
        XCTAssertEqual(fontResult as? Bool, true, "The actual August asset must load offline, without falling back")
        _ = try await runJavaScript("localStorage.setItem('evaorbit.englishFont','polyamine'); localStorage.setItem('evaorbit.uiLanguage','zh-CN'); true", in: webView)
        webView.reload()
        try await waitForHeading("回到 EvaOrbit", in: webView)
        let reloadedViewport = try await runJavaScript("document.querySelector('meta[name=viewport]').content", in: webView) as? String
        XCTAssertEqual(reloadedViewport, viewport, "The local viewport constraint must survive a document reload")
        let persistedFont = try await runJavaScript("document.documentElement.dataset.englishFont", in: webView) as? String
        XCTAssertEqual(persistedFont, "polyamine")
        _ = try await runJavaScript("localStorage.removeItem('evaorbit.englishFont'); localStorage.removeItem('evaorbit.uiLanguage'); true", in: webView)
        XCTAssertEqual(webView.url?.scheme, TrackerAssetHandler.scheme)
        let random = try await runJavaScript("crypto.getRandomValues(new Uint8Array(1)).length", in: webView) as? Int
        XCTAssertEqual(random, 1)
    }

    func testSQLitePersistsRecordsAndFrozenOutboxTogetherAcrossReopen() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appendingPathComponent("trackers.sqlite3").path
        let account = "10000000-0000-4000-8000-000000000001"
        let database = try TrackerLocalDatabase(path: path)
        try await database.setAccount(id: account, email: "test@example.invalid")
        let state: [String: Any] = ["schemaVersion": 1, "accountId": account, "revision": 1,
            "records": [["id": "local", "resourceType": "tracker", "payload": ["name": "Offline"]]],
            "outbox": [["mutationId": "stable-request", "localId": "local", "wire": ["payload": ["name": "Offline"]]]]]
        let committed = try await database.commit(accountId: account, expectedRevision: 0, state: state)
        XCTAssertTrue(committed)
        let stale = try await database.commit(accountId: account, expectedRevision: 0, state: state)
        XCTAssertFalse(stale)
        let reopened = try TrackerLocalDatabase(path: path)
        let saved = try await reopened.read(accountId: account) as? NSDictionary
        XCTAssertEqual(saved, state as NSDictionary)
        try await reopened.clearAccount()
        do { _ = try await reopened.read(accountId: account); XCTFail("Signed-out callers must not read private records") }
        catch {}
        try await reopened.setAccount(id: account, email: "test@example.invalid")
        let restored = try await reopened.read(accountId: account) as? NSDictionary
        XCTAssertEqual(restored, state as NSDictionary, "Logout must preserve unsynced data")
        try await reopened.setAccount(id: "10000000-0000-4000-8000-000000000002", email: "other@example.invalid")
        do { _ = try await reopened.read(accountId: account); XCTFail("Another account must not read these records") }
        catch {}
    }

    @MainActor func testReadOnlyCacheAndBackupNeverReplaceTheExistingQueue() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appendingPathComponent("trackers.sqlite3").path
        let account = "10000000-0000-4000-8000-000000000001"
        let database = try TrackerLocalDatabase(path: path)
        try await database.setAccount(id: account, email: "test@example.invalid")
        let original: [String: Any] = ["schemaVersion": 1, "accountId": account, "revision": 1, "records": [], "outbox": [["mutationId": "old-frozen", "wire": ["payload": ["note": "keep"]]]]]
        let committed = try await database.commit(accountId: account, expectedRevision: 0, state: original)
        XCTAssertTrue(committed)
        let controller = TrackerLocalController(baseURL: URL(string: "https://example.invalid")!, database: database)
        let receipt = try await controller.acceptanceStatus(accountId: account)
        XCTAssertEqual(receipt["pending"] as? Int, 1)
        XCTAssertEqual(receipt["frozen"] as? Int, 1)
        XCTAssertEqual(receipt["sqliteVerified"] as? Bool, true)
        let backupName = try XCTUnwrap(receipt["backupFile"] as? String)
        let backup = try TrackerLocalDatabase(path: directory.appendingPathComponent("AcceptanceBackups").appendingPathComponent(backupName).path)
        let backedUp = try await backup.read(accountId: account) as? NSDictionary
        XCTAssertEqual(backedUp, original as NSDictionary)
        for operation in ["sync", "trackers"] {
            do { _ = try await controller.request(path: operation, method: "POST", body: ["accountId": account]); XCTFail("Business writes must fail before networking") }
            catch TrackerLocalError.readOnly { XCTAssertEqual(operation, "sync") }
            catch TrackerLocalError.invalid { XCTAssertEqual(operation, "trackers") }
        }
        do { _ = try await controller.synchronize(["accountId": account, "mutations": []]); XCTFail("Even empty legacy sync calls are disabled") }
        catch TrackerLocalError.readOnly {}
        let snapshot: [String: Any] = ["format": "eo-trackers-readonly-v1", "accountId": account, "capturedAt": "2026-10-19T00:00:00Z", "details": []]
        try await database.saveReadOnlyCache(accountId: account, snapshot: snapshot)
        let reopened = try TrackerLocalDatabase(path: path)
        let restoredSnapshot = try await reopened.readOnlyCache(accountId: account) as? NSDictionary
        let restoredQueue = try await reopened.read(accountId: account) as? NSDictionary
        XCTAssertEqual(restoredSnapshot, snapshot as NSDictionary)
        XCTAssertEqual(restoredQueue, original as NSDictionary)
        try await reopened.setAccount(id: "10000000-0000-4000-8000-000000000002", email: "other@example.invalid")
        do { _ = try await reopened.readOnlyCache(accountId: account); XCTFail("Read-only caches must remain account scoped") } catch {}
    }

    @MainActor func testHomeCachePersistsAcrossReopenWithoutChangingTheLegacyQueue() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appendingPathComponent("trackers.sqlite3").path
        let account = "10000000-0000-4000-8000-000000000001"
        let database = try TrackerLocalDatabase(path: path)
        try await database.setAccount(id: account, email: "test@example.invalid")
        let original: [String: Any] = ["schemaVersion": 1, "accountId": account, "revision": 1, "records": [], "outbox": [["mutationId": "keep-frozen", "wire": ["payload": ["note": "keep"]]]]]
        let committed = try await database.commit(accountId: account, expectedRevision: 0, state: original)
        XCTAssertTrue(committed)
        let snapshot: [String: Any] = ["format": "eo-home-readonly-v1", "accountId": account, "kind": "due", "key": "current", "capturedAt": "2026-10-19T00:00:00Z", "data": []]
        try await database.saveHomeReadOnlyCache(accountId: account, resource: "due/current", snapshot: snapshot)
        let reopened = try TrackerLocalDatabase(path: path)
        let cached = try await reopened.homeReadOnlyCache(accountId: account, resource: "due/current") as? NSDictionary
        let queue = try await reopened.read(accountId: account) as? NSDictionary
        XCTAssertEqual(cached, snapshot as NSDictionary)
        XCTAssertEqual(queue, original as NSDictionary)
        let controller = TrackerLocalController(baseURL: URL(string: "https://example.invalid")!, database: reopened)
        for resource in ["home-day", "timeline", "reminders/due"] {
            do { _ = try await controller.request(path: resource, method: "GET"); XCTFail("Unsafe or invalid resource must be refused") }
            catch TrackerLocalError.invalid {}
        }
        do { _ = try await controller.homeReadOnlyResource(accountId: account, kind: "day", key: "2026-02-30", refresh: true); XCTFail("Invalid dates must fail before networking") }
        catch TrackerLocalError.invalid {}
        try await reopened.setAccount(id: "10000000-0000-4000-8000-000000000002", email: "other@example.invalid")
        do { _ = try await reopened.homeReadOnlyCache(accountId: account, resource: "due/current"); XCTFail("Cache must remain account scoped") } catch {}
    }

    @MainActor func testFoodReadOnlyCachePersistsAndCannotChangeTheQueueOrOtherAccount() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appendingPathComponent("trackers.sqlite3").path
        let account = "10000000-0000-4000-8000-000000000001"
        let database = try TrackerLocalDatabase(path: path)
        try await database.setAccount(id: account, email: "test@example.invalid")
        let original: [String: Any] = ["schemaVersion": 1, "accountId": account, "revision": 1, "records": [], "outbox": [["mutationId": "frozen-food-canary"]]]
        let committed = try await database.commit(accountId: account, expectedRevision: 0, state: original)
        XCTAssertTrue(committed)
        let snapshot: [String: Any] = ["format": "eo-food-readonly-v1", "accountId": account, "capturedAt": "2026-10-19T00:00:00Z", "home": ["date": "2026-10-19"], "foods": [], "drinks": []]
        try await database.saveFoodReadOnlyCache(accountId: account, snapshot: snapshot)
        let reopened = try TrackerLocalDatabase(path: path)
        let cached = try await reopened.foodReadOnlyCache(accountId: account) as? NSDictionary
        let queue = try await reopened.read(accountId: account) as? NSDictionary
        XCTAssertEqual(cached, snapshot as NSDictionary)
        XCTAssertEqual(queue, original as NSDictionary)
        let controller = TrackerLocalController(baseURL: URL(string: "https://example.invalid")!, database: reopened)
        for method in ["POST", "PATCH", "DELETE"] {
            do { _ = try await controller.request(path: "food-readonly", method: method); XCTFail("Food writes must be refused before networking") }
            catch TrackerLocalError.invalid {}
        }
        try await reopened.setAccount(id: "10000000-0000-4000-8000-000000000002", email: "other@example.invalid")
        do { _ = try await reopened.foodReadOnlyCache(accountId: account); XCTFail("Cache must remain account scoped") } catch {}
    }

    @MainActor func testFoodCatalogAndPlaceResourcesPersistPruneAndPreserveTheQueue() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appendingPathComponent("trackers.sqlite3").path
        let account = "10000000-0000-4000-8000-000000000001"
        let database = try TrackerLocalDatabase(path: path)
        try await database.setAccount(id: account, email: "test@example.invalid")
        let original: [String: Any] = ["schemaVersion": 1, "accountId": account, "revision": 1, "records": [], "outbox": [["mutationId": "keep-catalog-frozen"]]]
        let committed = try await database.commit(accountId: account, expectedRevision: 0, state: original)
        XCTAssertTrue(committed)
        let catalog: [String: Any] = ["format": "eo-food-resource-v1", "accountId": account, "kind": "catalog", "key": "current", "capturedAt": "2026-10-19T00:00:00Z", "data": ["places": [], "library": [], "placesComplete": true, "libraryComplete": true] as [String: Any]]
        try await database.saveFoodResourceCache(accountId: account, resource: "catalog/current", snapshot: catalog)
        for id in 1...66 {
            let value: [String: Any] = ["format": "eo-food-resource-v1", "accountId": account, "kind": "place", "key": String(id), "capturedAt": "2026-10-19T00:00:00Z", "data": NSNull()]
            try await database.saveFoodResourceCache(accountId: account, resource: "place/\(id)", snapshot: value)
        }
        let reopened = try TrackerLocalDatabase(path: path)
        let persisted = try await reopened.foodResourceCache(accountId: account, resource: "catalog/current") as? NSDictionary
        XCTAssertEqual(persisted, catalog as NSDictionary)
        let pruned = try await reopened.foodResourceCache(accountId: account, resource: "place/1")
        XCTAssertTrue(pruned is NSNull)
        let deletion = try await reopened.foodResourceCache(accountId: account, resource: "place/66") as? [String: Any]
        XCTAssertTrue(deletion?["data"] is NSNull)
        let queue = try await reopened.read(accountId: account) as? NSDictionary
        XCTAssertEqual(queue, original as NSDictionary)
        let controller = TrackerLocalController(baseURL: URL(string: "https://example.invalid")!, database: reopened)
        for method in ["POST", "PATCH", "DELETE"] {
            do { _ = try await controller.request(path: "food-readonly/catalog/current", method: method); XCTFail("Catalog writes must be refused") }
            catch TrackerLocalError.invalid {}
        }
        do { _ = try await controller.foodReadOnlyResource(accountId: account, kind: "place", key: "../session", refresh: true); XCTFail("Invalid key must fail before networking") }
        catch TrackerLocalError.invalid {}
        try await reopened.setAccount(id: "10000000-0000-4000-8000-000000000002", email: "other@example.invalid")
        do { _ = try await reopened.foodResourceCache(accountId: account, resource: "catalog/current"); XCTFail("Catalog must remain account scoped") } catch {}
    }

    @MainActor func testCatsCachePersistsWithoutChangingQueueAndRefusesWritesOrOtherAccounts() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appendingPathComponent("trackers.sqlite3").path
        let account = "10000000-0000-4000-8000-000000000001"
        let database = try TrackerLocalDatabase(path: path)
        try await database.setAccount(id: account, email: "test@example.invalid")
        let original: [String: Any] = ["schemaVersion": 1, "accountId": account, "revision": 1, "records": [], "outbox": [["mutationId": "keep-cats-frozen"]]]
        let committed = try await database.commit(accountId: account, expectedRevision: 0, state: original)
        XCTAssertTrue(committed)
        let snapshot: [String: Any] = ["format": "eo-cats-readonly-v1", "accountId": account, "capturedAt": "2026-10-19T00:00:00Z", "dashboard": ["pets": [], "household": [], "routines": [], "oneTimeTasks": [], "timeline": []], "details": [], "records": [], "foods": []]
        try await database.saveCatsReadOnlyCache(accountId: account, snapshot: snapshot)
        var invalid = snapshot
        invalid["accountId"] = "wrong"
        do { try await database.saveCatsReadOnlyCache(accountId: account, snapshot: invalid); XCTFail("Wrong account must not replace the cache") } catch TrackerLocalError.invalid {}
        invalid = snapshot
        invalid["padding"] = String(repeating: "x", count: 8 * 1024 * 1024)
        do { try await database.saveCatsReadOnlyCache(accountId: account, snapshot: invalid); XCTFail("Oversized snapshot must not replace the cache") } catch TrackerLocalError.storage {}
        let reopened = try TrackerLocalDatabase(path: path)
        let cached = try await reopened.catsReadOnlyCache(accountId: account) as? NSDictionary
        let queue = try await reopened.read(accountId: account) as? NSDictionary
        XCTAssertEqual(cached, snapshot as NSDictionary)
        XCTAssertEqual(queue, original as NSDictionary)
        let controller = TrackerLocalController(baseURL: URL(string: "https://example.invalid")!, database: reopened)
        for method in ["POST", "PATCH", "PUT", "DELETE"] {
            do { _ = try await controller.request(path: "cats-readonly", method: method); XCTFail("Cats writes must fail before networking") }
            catch TrackerLocalError.invalid {}
        }
        for path in ["cats/pets/1", "cats-readonly/../session", "cats/food/1/consume"] {
            do { _ = try await controller.request(path: path, method: "GET"); XCTFail("Unlisted Cats paths must fail before networking") }
            catch TrackerLocalError.invalid {}
        }
        try await reopened.setAccount(id: "10000000-0000-4000-8000-000000000002", email: "other@example.invalid")
        do { _ = try await reopened.catsReadOnlyCache(accountId: account); XCTFail("Cats cache must remain account scoped") } catch {}
    }

    @MainActor func testSubscriptionsCachePersistsAndCannotTouchPaymentsOrFrozenQueue() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appendingPathComponent("trackers.sqlite3").path
        let account = "10000000-0000-4000-8000-000000000001"
        let database = try TrackerLocalDatabase(path: path)
        try await database.setAccount(id: account, email: "test@example.invalid")
        let original: [String: Any] = ["schemaVersion": 1, "accountId": account, "revision": 1, "records": [], "outbox": [["mutationId": "keep-subscriptions-frozen"]]]
        let committed = try await database.commit(accountId: account, expectedRevision: 0, state: original)
        XCTAssertTrue(committed)
        let snapshot: [String: Any] = ["format": "eo-subscriptions-readonly-v1", "accountId": account, "capturedAt": "2026-10-20T00:00:00Z", "today": "2026-10-20", "items": [], "iconSources": [String: String]()]
        try await database.saveSubscriptionsReadOnlyCache(accountId: account, snapshot: snapshot)
        var invalid = snapshot
        invalid["accountId"] = "wrong"
        do { try await database.saveSubscriptionsReadOnlyCache(accountId: account, snapshot: invalid); XCTFail("Wrong account must not replace the cache") } catch TrackerLocalError.invalid {}
        invalid = snapshot
        invalid["extra"] = String(repeating: "x", count: 8 * 1024 * 1024)
        do { try await database.saveSubscriptionsReadOnlyCache(accountId: account, snapshot: invalid); XCTFail("Oversized snapshot must not replace the cache") } catch TrackerLocalError.storage {}
        let reopened = try TrackerLocalDatabase(path: path)
        let cached = try await reopened.subscriptionsReadOnlyCache(accountId: account) as? NSDictionary
        let queue = try await reopened.read(accountId: account) as? NSDictionary
        XCTAssertEqual(cached, snapshot as NSDictionary)
        XCTAssertEqual(queue, original as NSDictionary)
        let controller = TrackerLocalController(baseURL: URL(string: "https://example.invalid")!, database: reopened)
        for method in ["POST", "PATCH", "PUT", "DELETE"] {
            do { _ = try await controller.request(path: "subscriptions-readonly", method: method); XCTFail("Subscription writes must fail before networking") }
            catch TrackerLocalError.invalid {}
        }
        for path in ["subscriptions", "subscriptions/1", "subscriptions/1/payments", "subscriptions-readonly/../session"] {
            do { _ = try await controller.request(path: path, method: "GET"); XCTFail("Ordinary subscription services must never be a read-only fallback") }
            catch TrackerLocalError.invalid {}
        }
        try await reopened.setAccount(id: "10000000-0000-4000-8000-000000000002", email: "other@example.invalid")
        do { _ = try await reopened.subscriptionsReadOnlyCache(accountId: account); XCTFail("Cache must remain account scoped") } catch {}
    }

    @MainActor func testRelationsCachePersistsAndCannotTouchLedgerOrFrozenQueue() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appendingPathComponent("trackers.sqlite3").path
        let account = "10000000-0000-4000-8000-000000000001"
        let database = try TrackerLocalDatabase(path: path)
        try await database.setAccount(id: account, email: "test@example.invalid")
        let original: [String: Any] = ["schemaVersion": 1, "accountId": account, "revision": 1, "records": [], "outbox": [["mutationId": "keep-relations-frozen"]]]
        let committed = try await database.commit(accountId: account, expectedRevision: 0, state: original)
        XCTAssertTrue(committed)
        let snapshot: [String: Any] = ["format": "eo-relations-readonly-v1", "accountId": account, "capturedAt": "2026-10-20T00:00:00Z", "people": [], "details": []]
        try await database.saveRelationsReadOnlyCache(accountId: account, snapshot: snapshot)
        var invalid = snapshot
        invalid["accountId"] = "wrong"
        do { try await database.saveRelationsReadOnlyCache(accountId: account, snapshot: invalid); XCTFail("Wrong account must not replace the cache") } catch TrackerLocalError.invalid {}
        invalid = snapshot
        invalid["extra"] = String(repeating: "x", count: 8 * 1024 * 1024)
        do { try await database.saveRelationsReadOnlyCache(accountId: account, snapshot: invalid); XCTFail("Oversized snapshot must not replace the cache") } catch TrackerLocalError.storage {}
        let reopened = try TrackerLocalDatabase(path: path)
        let cached = try await reopened.relationsReadOnlyCache(accountId: account) as? NSDictionary
        let queue = try await reopened.read(accountId: account) as? NSDictionary
        XCTAssertEqual(cached, snapshot as NSDictionary)
        XCTAssertEqual(queue, original as NSDictionary)
        let controller = TrackerLocalController(baseURL: URL(string: "https://example.invalid")!, database: reopened)
        for method in ["POST", "PATCH", "PUT", "DELETE"] {
            do { _ = try await controller.request(path: "relations-readonly", method: method); XCTFail("Relations writes must fail before networking") }
            catch TrackerLocalError.invalid {}
        }
        for path in ["relations/people", "relations/events/1", "relations/flows/1/settle", "relations-readonly/../session", "relations-readonly?account=other"] {
            do { _ = try await controller.request(path: path, method: "GET"); XCTFail("Ordinary subscription services must never be a read-only fallback") }
            catch TrackerLocalError.invalid {}
        }
        try await reopened.setAccount(id: "10000000-0000-4000-8000-000000000002", email: "other@example.invalid")
        do { _ = try await reopened.relationsReadOnlyCache(accountId: account); XCTFail("Cache must remain account scoped") } catch {}
    }

    @MainActor func testHealthCachePersistsAndCannotTouchRecordsOrFrozenQueue() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appendingPathComponent("trackers.sqlite3").path
        let account = "10000000-0000-4000-8000-000000000001"
        let database = try TrackerLocalDatabase(path: path)
        try await database.setAccount(id: account, email: "test@example.invalid")
        let original: [String: Any] = ["schemaVersion": 1, "accountId": account, "revision": 1, "records": [], "outbox": [["mutationId": "keep-health-frozen"]]]
        let committed = try await database.commit(accountId: account, expectedRevision: 0, state: original)
        XCTAssertTrue(committed)
        let snapshot: [String: Any] = ["format": "eo-health-readonly-v1", "accountId": account, "capturedAt": "2026-10-20T00:00:00Z", "today": "2026-10-20", "sleep": ["date": "2026-10-20"], "energy": [String: Any](), "weightSettings": [String: Any](), "suggestions": [String: Any](), "plan": NSNull(), "records": [], "training": [], "recentTraining": [], "weights": [], "periods": [], "flows": [], "presets": [], "doses": [], "reminders": [], "energyHistory": []]
        try await database.saveHealthReadOnlyCache(accountId: account, snapshot: snapshot)
        var invalid = snapshot
        invalid["accountId"] = "wrong"
        do { try await database.saveHealthReadOnlyCache(accountId: account, snapshot: invalid); XCTFail("Wrong account must not replace the cache") } catch TrackerLocalError.invalid {}
        invalid = snapshot
        invalid["capturedAt"] = "invalid"
        do { try await database.saveHealthReadOnlyCache(accountId: account, snapshot: invalid); XCTFail("Invalid timestamps must not replace the cache") } catch TrackerLocalError.invalid {}
        invalid = snapshot
        invalid["extra"] = String(repeating: "x", count: 8 * 1024 * 1024)
        do { try await database.saveHealthReadOnlyCache(accountId: account, snapshot: invalid); XCTFail("Oversized snapshot must not replace the cache") } catch TrackerLocalError.storage {}
        let reopened = try TrackerLocalDatabase(path: path)
        let cached = try await reopened.healthReadOnlyCache(accountId: account) as? NSDictionary
        let queue = try await reopened.read(accountId: account) as? NSDictionary
        XCTAssertEqual(cached, snapshot as NSDictionary)
        XCTAssertEqual(queue, original as NSDictionary)
        let controller = TrackerLocalController(baseURL: URL(string: "https://example.invalid")!, database: reopened)
        for method in ["POST", "PATCH", "PUT", "DELETE"] {
            do { _ = try await controller.request(path: "health-readonly", method: method); XCTFail("Health writes must fail before networking") }
            catch TrackerLocalError.invalid {}
        }
        for path in ["health", "health/weight", "health/training/plan/complete", "health-readonly/../session", "health-readonly?account=other"] {
            do { _ = try await controller.request(path: path, method: "GET"); XCTFail("Ordinary subscription services must never be a read-only fallback") }
            catch TrackerLocalError.invalid {}
        }
        try await reopened.setAccount(id: "10000000-0000-4000-8000-000000000002", email: "other@example.invalid")
        do { _ = try await reopened.healthReadOnlyCache(accountId: account); XCTFail("Cache must remain account scoped") } catch {}
    }

    @MainActor func testChronicleCachePersistsWithoutTouchingFrozenQueue() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appendingPathComponent("trackers.sqlite3").path
        let account = "10000000-0000-4000-8000-000000000001"
        let database = try TrackerLocalDatabase(path: path)
        try await database.setAccount(id: account, email: "test@example.invalid")
        let original: [String: Any] = ["schemaVersion": 1, "accountId": account, "revision": 1, "records": [], "outbox": [["mutationId": "keep-chronicle-frozen"]]]
        let committed = try await database.commit(accountId: account, expectedRevision: 0, state: original)
        XCTAssertTrue(committed)
        let snapshot: [String: Any] = ["format": "eo-chronicle-readonly-v1", "accountId": account, "capturedAt": "2026-10-20T00:00:00Z", "items": [["id": 1, "date": "2026-10-20", "title": "Archive canary", "contentMd": "# Keep original Markdown", "source": "chatgpt", "createdAt": "2026-10-20T00:00:00.000Z", "updatedAt": "2026-10-20T00:00:00Z"]], "complete": true]
        try await database.saveChronicleReadOnlyCache(accountId: account, snapshot: snapshot)
        var invalid = snapshot
        invalid["accountId"] = "wrong"
        do { try await database.saveChronicleReadOnlyCache(accountId: account, snapshot: invalid); XCTFail("Wrong account must not replace the cache") } catch TrackerLocalError.invalid {}
        invalid = snapshot
        invalid["items"] = [["id": 1, "date": "2026-02-30"]]
        do { try await database.saveChronicleReadOnlyCache(accountId: account, snapshot: invalid); XCTFail("Malformed entry must not replace the cache") } catch TrackerLocalError.invalid {}
        invalid = snapshot
        invalid["extra"] = String(repeating: "x", count: 8 * 1024 * 1024)
        do { try await database.saveChronicleReadOnlyCache(accountId: account, snapshot: invalid); XCTFail("Oversized snapshot must not replace the cache") } catch TrackerLocalError.storage {}
        let reopened = try TrackerLocalDatabase(path: path)
        let cached = try await reopened.chronicleReadOnlyCache(accountId: account) as? NSDictionary
        let queue = try await reopened.read(accountId: account) as? NSDictionary
        XCTAssertEqual(cached, snapshot as NSDictionary)
        XCTAssertEqual(queue, original as NSDictionary)
        let controller = TrackerLocalController(baseURL: URL(string: "https://example.invalid")!, database: reopened)
        for method in ["POST", "PATCH", "PUT", "DELETE"] {
            do { _ = try await controller.request(path: "chronicle", method: method); XCTFail("Chronicle writes must fail before networking") }
            catch TrackerLocalError.invalid {}
        }
        for path in ["chronicle/1", "chronicle?limit=100", "chronicle/../session"] {
            do { _ = try await controller.request(path: path, method: "GET"); XCTFail("Unlisted Chronicle paths must fail before networking") }
            catch TrackerLocalError.invalid {}
        }
        try await reopened.setAccount(id: "10000000-0000-4000-8000-000000000002", email: "other@example.invalid")
        do { _ = try await reopened.chronicleReadOnlyCache(accountId: account); XCTFail("Cache must remain account scoped") } catch {}
    }

    @MainActor func testMemoCachePersistsWithoutTouchingFrozenQueue() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appendingPathComponent("trackers.sqlite3").path
        let account = "10000000-0000-4000-8000-000000000001"
        let database = try TrackerLocalDatabase(path: path)
        try await database.setAccount(id: account, email: "test@example.invalid")
        let original: [String: Any] = ["schemaVersion": 1, "accountId": account, "revision": 1, "records": [], "outbox": [["mutationId": "keep-memo-frozen"]]]
        let committed = try await database.commit(accountId: account, expectedRevision: 0, state: original)
        XCTAssertTrue(committed)
        let snapshot: [String: Any] = ["format": "eo-memo-readonly-v1", "accountId": account, "capturedAt": "2026-10-20T00:00:00Z", "items": [["id": 1, "eventDate": NSNull(), "confirmedAt": NSNull(), "mergedIntoId": NSNull(), "tags": ["offline"], "type": "note", "status": "active", "title": "Archive canary", "content": "# Keep original Markdown",  "createdAt": "2026-10-20T00:00:00.000Z", "updatedAt": "2026-10-20T00:00:00Z"]], "complete": true]
        try await database.saveMemoReadOnlyCache(accountId: account, snapshot: snapshot)
        var invalid = snapshot
        invalid["accountId"] = "wrong"
        do { try await database.saveMemoReadOnlyCache(accountId: account, snapshot: invalid); XCTFail("Wrong account must not replace the cache") } catch TrackerLocalError.invalid {}
        invalid = snapshot
        invalid["items"] = [["id": 1, "date": "2026-02-30"]]
        do { try await database.saveMemoReadOnlyCache(accountId: account, snapshot: invalid); XCTFail("Malformed entry must not replace the cache") } catch TrackerLocalError.invalid {}
        invalid = snapshot
        invalid["extra"] = String(repeating: "x", count: 8 * 1024 * 1024)
        do { try await database.saveMemoReadOnlyCache(accountId: account, snapshot: invalid); XCTFail("Oversized snapshot must not replace the cache") } catch TrackerLocalError.storage {}
        let reopened = try TrackerLocalDatabase(path: path)
        let cached = try await reopened.memoReadOnlyCache(accountId: account) as? NSDictionary
        let queue = try await reopened.read(accountId: account) as? NSDictionary
        XCTAssertEqual(cached, snapshot as NSDictionary)
        XCTAssertEqual(queue, original as NSDictionary)
        let controller = TrackerLocalController(baseURL: URL(string: "https://example.invalid")!, database: reopened)
        for method in ["POST", "PATCH", "PUT", "DELETE"] {
            do { _ = try await controller.request(path: "memos", method: method); XCTFail("Memo writes must fail before networking") }
            catch TrackerLocalError.invalid {}
        }
        for path in ["memos/1", "memos?limit=100", "memos/../session"] {
            do { _ = try await controller.request(path: path, method: "GET"); XCTFail("Unlisted Memo paths must fail before networking") }
            catch TrackerLocalError.invalid {}
        }
        try await reopened.setAccount(id: "10000000-0000-4000-8000-000000000002", email: "other@example.invalid")
        do { _ = try await reopened.memoReadOnlyCache(accountId: account); XCTFail("Cache must remain account scoped") } catch {}
    }

    @MainActor func testInboxCachePersistsWithoutTouchingFrozenQueue() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appendingPathComponent("trackers.sqlite3").path
        let account = "10000000-0000-4000-8000-000000000001"
        let database = try TrackerLocalDatabase(path: path)
        try await database.setAccount(id: account, email: "test@example.invalid")
        let original: [String: Any] = ["schemaVersion": 1, "accountId": account, "revision": 1, "records": [], "outbox": [["mutationId": "keep-inbox-frozen"]]]
        let committed = try await database.commit(accountId: account, expectedRevision: 0, state: original)
        XCTAssertTrue(committed)
        let snapshot: [String: Any] = ["format": "eo-inbox-readonly-v1", "accountId": account, "capturedAt": "2026-10-20T00:00:00Z", "items": [["id": 1, "content": "Keep literal content", "source": "manual", "status": "processed", "processedAt": "2026-10-20T01:00:00Z", "convertedType": "memory", "convertedId": 999, "createdAt": "2026-10-20T00:00:00Z", "updatedAt": "2026-10-20T00:00:00.000Z"]]]
        try await database.saveInboxReadOnlyCache(accountId: account, snapshot: snapshot)
        var invalid = snapshot
        invalid["accountId"] = "wrong"
        do { try await database.saveInboxReadOnlyCache(accountId: account, snapshot: invalid); XCTFail("Wrong account must not replace the cache") } catch TrackerLocalError.invalid {}
        invalid = snapshot
        invalid["items"] = [["id": 1, "date": "2026-02-30"]]
        do { try await database.saveInboxReadOnlyCache(accountId: account, snapshot: invalid); XCTFail("Malformed entry must not replace the cache") } catch TrackerLocalError.invalid {}
        invalid = snapshot
        invalid["extra"] = String(repeating: "x", count: 8 * 1024 * 1024)
        do { try await database.saveInboxReadOnlyCache(accountId: account, snapshot: invalid); XCTFail("Oversized snapshot must not replace the cache") } catch TrackerLocalError.storage {}
        let reopened = try TrackerLocalDatabase(path: path)
        let cached = try await reopened.inboxReadOnlyCache(accountId: account) as? NSDictionary
        let queue = try await reopened.read(accountId: account) as? NSDictionary
        XCTAssertEqual(cached, snapshot as NSDictionary)
        XCTAssertEqual(queue, original as NSDictionary)
        let controller = TrackerLocalController(baseURL: URL(string: "https://example.invalid")!, database: reopened)
        for method in ["POST", "PATCH", "PUT", "DELETE"] {
            do { _ = try await controller.request(path: "inbox", method: method); XCTFail("Inbox writes must fail before networking") }
            catch TrackerLocalError.invalid {}
        }
        for path in ["inbox/1", "inbox?status=all", "inbox/1/convert", "inbox/../session"] {
            do { _ = try await controller.request(path: path, method: "GET"); XCTFail("Unlisted Inbox paths must fail before networking") }
            catch TrackerLocalError.invalid {}
        }
        try await reopened.setAccount(id: "10000000-0000-4000-8000-000000000002", email: "other@example.invalid")
        do { _ = try await reopened.inboxReadOnlyCache(accountId: account); XCTFail("Cache must remain account scoped") } catch {}
    }

    @MainActor func testMediaCacheKeepsSeasonsHistoryAndFrozenQueueAcrossRestart() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appendingPathComponent("trackers.sqlite3").path
        let account = "10000000-0000-4000-8000-000000000001", stamp = "2026-10-20T00:00:00Z"
        let database = try TrackerLocalDatabase(path: path)
        try await database.setAccount(id: account, email: "test@example.invalid")
        let original: [String: Any] = ["schemaVersion": 1, "accountId": account, "revision": 1, "records": [], "outbox": [["mutationId": "keep-media-frozen"]]]
        let committed = try await database.commit(accountId: account, expectedRevision: 0, state: original)
        XCTAssertTrue(committed)
        let item: [String: Any] = ["id": 1, "title": "Reacher · S1", "originalTitle": NSNull(), "translatedTitle": NSNull(), "mediaType": "tv", "status": "completed", "rating": NSNull(), "isFavorite": false, "note": NSNull(), "coverUrl": NSNull(), "seriesId": 2, "seriesName": "Reacher", "seasonNumber": 1, "seasonTitle": NSNull(), "createdAt": stamp, "updatedAt": stamp, "viewings": [["id": 3, "mediaId": 1, "viewingNumber": 1, "watchedDate": "2026-10-19", "createdAt": stamp]]]
        let snapshot: [String: Any] = ["format": "eo-media-readonly-v1", "accountId": account, "capturedAt": stamp, "items": [item], "series": [["id": 2, "name": "Reacher", "itemCount": 1, "createdAt": stamp, "updatedAt": stamp]]]
        try await database.saveMediaReadOnlyCache(accountId: account, snapshot: snapshot)
        var bad = snapshot
        bad["accountId"] = "wrong"
        do { try await database.saveMediaReadOnlyCache(accountId: account, snapshot: bad); XCTFail("Wrong account") } catch TrackerLocalError.invalid {}
        bad = snapshot
        var badItem = item; badItem["coverUrl"] = "https://example.invalid/private.png"; bad["items"] = [badItem]
        do { try await database.saveMediaReadOnlyCache(accountId: account, snapshot: bad); XCTFail("Remote images must be downloaded") } catch TrackerLocalError.invalid {}
        bad = snapshot; bad["series"] = []
        do { try await database.saveMediaReadOnlyCache(accountId: account, snapshot: bad); XCTFail("Missing parent") } catch TrackerLocalError.invalid {}
        bad = snapshot; bad["extra"] = String(repeating: "x", count: 8 * 1024 * 1024)
        do { try await database.saveMediaReadOnlyCache(accountId: account, snapshot: bad); XCTFail("Oversized snapshot") } catch TrackerLocalError.storage {}
        let reopened = try TrackerLocalDatabase(path: path)
        let cached = try await reopened.mediaReadOnlyCache(accountId: account) as? NSDictionary
        let queue = try await reopened.read(accountId: account) as? NSDictionary
        XCTAssertEqual(cached, snapshot as NSDictionary); XCTAssertEqual(queue, original as NSDictionary)
        let controller = TrackerLocalController(baseURL: URL(string: "https://example.invalid")!, database: reopened)
        for method in ["POST", "PATCH", "PUT", "DELETE"] {
            do { _ = try await controller.request(path: "media-readonly", method: method); XCTFail("Writes must fail before networking") } catch TrackerLocalError.invalid {}
        }
        for path in ["media", "media/1", "media-readonly/1", "media-readonly?q=x", "media-readonly/../session"] {
            do { _ = try await controller.request(path: path, method: "GET"); XCTFail("Unlisted path") } catch TrackerLocalError.invalid {}
        }
        XCTAssertTrue(NativeBridge.trackerMethods.contains("media.readOnlySnapshot"))
        try await reopened.setAccount(id: "10000000-0000-4000-8000-000000000002", email: "other@example.invalid")
        do { _ = try await reopened.mediaReadOnlyCache(accountId: account); XCTFail("Account isolation") } catch {}
    }

    @MainActor func testWorkspaceCachesAreDurableAccountScopedAndNeverReplaceTheQueue() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appendingPathComponent("workspaces.sqlite3").path
        let database = try TrackerLocalDatabase(path: path)
        let account = "10000000-0000-4000-8000-000000000001", stamp = "2026-10-20T00:00:00Z"
        try await database.setAccount(id: account, email: "test@example.invalid")
        let original: [String: Any] = ["schemaVersion": 1, "accountId": account, "revision": 1, "records": [], "outbox": [["mutationId": "keep-workspace-frozen"]]]
        let committed = try await database.commit(accountId: account, expectedRevision: 0, state: original)
        XCTAssertTrue(committed)
        let task: [String: Any] = ["id": 1, "title": "Date only", "notes": "", "completed": false, "tags": [], "priority": "medium", "dueDate": "2026-10-20", "dueTime": NSNull(), "completedAt": NSNull(), "reminders": [], "createdAt": stamp, "updatedAt": stamp]
        let data: [String: [String: Any]] = ["tasks": ["tasks": [task], "complete": true], "projects": ["projects": [], "items": [], "complete": true], "lucius": ["state": ["status": "Quiet", "mood": "composed", "updatedAt": stamp], "posts": [], "comments": [], "diary": [], "cases": [], "complete": true]]
        let reopened = try TrackerLocalDatabase(path: path)
        for kind in ["tasks", "projects", "lucius"] {
            let snapshot: [String: Any] = ["format": "eo-workspace-readonly-v1", "accountId": account, "kind": kind, "capturedAt": stamp, "data": data[kind]!]
            try await database.saveWorkspaceReadOnlyCache(accountId: account, kind: kind, snapshot: snapshot)
            var bad = snapshot; bad["accountId"] = "wrong"
            do { try await database.saveWorkspaceReadOnlyCache(accountId: account, kind: kind, snapshot: bad); XCTFail("Wrong account") } catch TrackerLocalError.invalid {}
            bad = snapshot; bad["kind"] = "ai"
            do { try await database.saveWorkspaceReadOnlyCache(accountId: account, kind: kind, snapshot: bad); XCTFail("Wrong kind") } catch TrackerLocalError.invalid {}
            bad = snapshot; bad["extra"] = String(repeating: "x", count: 8 * 1024 * 1024)
            do { try await database.saveWorkspaceReadOnlyCache(accountId: account, kind: kind, snapshot: bad); XCTFail("Oversized snapshot") } catch TrackerLocalError.storage {}
            let cached = try await reopened.workspaceReadOnlyCache(accountId: account, kind: kind) as? NSDictionary
            XCTAssertEqual(cached, snapshot as NSDictionary)
        }
        var invalidTask = task; invalidTask["dueDate"] = "2026-02-30"
        let bad: [String: Any] = ["format": "eo-workspace-readonly-v1", "accountId": account, "kind": "tasks", "capturedAt": stamp, "data": ["complete": true, "tasks": [invalidTask]]]
        do { try await database.saveWorkspaceReadOnlyCache(accountId: account, kind: "tasks", snapshot: bad); XCTFail("Invalid date") } catch TrackerLocalError.invalid {}
        let queue = try await reopened.read(accountId: account) as? NSDictionary
        XCTAssertEqual(queue, original as NSDictionary)
        let controller = TrackerLocalController(baseURL: URL(string: "https://example.invalid")!, database: reopened)
        for kind in ["tasks", "projects", "lucius"] {
            for method in ["POST", "PATCH", "PUT", "DELETE"] {
                do { _ = try await controller.request(path: "workspace-readonly/\(kind)", method: method); XCTFail("Business writes") } catch TrackerLocalError.invalid {}
            }
        }
        for path in ["workspace-readonly/ai", "workspace-readonly/tasks?q=x", "workspace-readonly/tasks/../projects", "ai/providers"] {
            do { _ = try await controller.request(path: path, method: "GET"); XCTFail("Unlisted path") } catch TrackerLocalError.invalid {}
        }
        try await reopened.setAccount(id: "10000000-0000-4000-8000-000000000002", email: "other@example.invalid")
        for kind in ["tasks", "projects", "lucius"] {
            do { _ = try await reopened.workspaceReadOnlyCache(accountId: account, kind: kind); XCTFail("Account isolation") } catch {}
        }
        XCTAssertTrue(NativeBridge.trackerMethods.contains("workspaces.readOnlySnapshot"))
    }

    @MainActor func testTrackerReplicaNeverUploadsLegacyQueueAndPersistsIndependently() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appendingPathComponent("replica.sqlite3").path
        let database = try TrackerLocalDatabase(path: path), account = "10000000-0000-4000-8000-000000000001"
        try await database.setAccount(id: account, email: "test@example.invalid")
        let legacy: [String: Any] = ["schemaVersion": 1, "accountId": account, "revision": 1, "records": [], "outbox": [["mutationId": "legacy-frozen", "wire": ["mutationId": "legacy-frozen"]]]]
        let oldSaved = try await database.commit(accountId: account, expectedRevision: 0, state: legacy)
        XCTAssertTrue(oldSaved)
        do { try await database.requireReplicaMutations(accountId: account, mutations: [["mutationId": "legacy-frozen"]]); XCTFail("Legacy queue must not be admitted") } catch TrackerLocalError.invalid {}
        let wire: [String: Any] = ["mutationId": "new-replica", "operation": "create", "payload": ["name": "Test"]]
        let replica: [String: Any] = ["schemaVersion": 1, "accountId": account, "revision": 1, "records": [], "outbox": [["mutationId": "new-replica", "wire": wire]]]
        let saved = try await database.commit(accountId: account, expectedRevision: 0, state: replica, replica: true)
        XCTAssertTrue(saved)
        let stale = try await database.commit(accountId: account, expectedRevision: 0, state: replica, replica: true)
        XCTAssertFalse(stale)
        let reopened = try TrackerLocalDatabase(path: path)
        let restored = try await reopened.read(accountId: account, replica: true) as? NSDictionary
        let original = try await reopened.read(accountId: account) as? NSDictionary
        XCTAssertEqual(restored, replica as NSDictionary); XCTAssertEqual(original, legacy as NSDictionary)
        try await reopened.requireReplicaMutations(accountId: account, mutations: [wire])
        var changed = wire; changed["payload"] = ["name": "tampered"]
        do { try await reopened.requireReplicaMutations(accountId: account, mutations: [changed]); XCTFail("Frozen command must match") } catch TrackerLocalError.invalid {}
        try await reopened.setAccount(id: "10000000-0000-4000-8000-000000000002", email: "other@example.invalid")
        do { _ = try await reopened.read(accountId: account, replica: true); XCTFail("Account isolation") } catch {}
    }

    @MainActor func testAIConfigurationIsAnExplicitSettingsException() {
        let rules: [(String, Set<String>)] = [("/api/ai/providers", ["GET", "POST"]), ("/api/ai/providers/test", ["POST"]), ("/api/ai/providers/1", ["PATCH", "DELETE"]), ("/api/ai/providers/1/models", ["POST"]), ("/api/ai/model-configs/2", ["PATCH", "DELETE"])]
        for (path, methods) in rules {
            for method in ["GET", "POST", "PUT", "PATCH", "DELETE"] { XCTAssertEqual(TrackerLocalController.allowsAIConfiguration(path: path, method: method), methods.contains(method)) }
        }
        for path in ["https://evil.invalid/api/ai/providers", "/api/ai/chat", "/api/ai/sessions", "/api/ai/settings", "/api/ai/providers/0", "/api/ai/providers/1?x=1", "/api/ai/providers/1/../test"] {
            for method in ["GET", "POST", "PATCH", "DELETE"] { XCTAssertFalse(TrackerLocalController.allowsAIConfiguration(path: path, method: method)) }
        }
        XCTAssertTrue(NativeBridge.trackerMethods.contains("settings.aiConfiguration"))
    }

    @MainActor func testSettingsConfigurationDoesNotGrantBusinessOrNativeWrites() {
        let rules: [(String, Set<String>)] = [("/api/preferences/life-day", ["GET", "PATCH"]), ("/api/calendar-interpretation", ["GET", "PUT"]), ("/api/timeline-association", ["GET", "PUT"])]
        for (path, methods) in rules {
            for method in ["GET", "POST", "PUT", "PATCH", "DELETE"] { XCTAssertEqual(TrackerLocalController.allowsSettingsConfiguration(path: path, method: method), methods.contains(method)) }
            for suffix in ["/", "?account=other", "#fragment", "/../ai/providers"] { XCTAssertFalse(TrackerLocalController.allowsSettingsConfiguration(path: path + suffix, method: "GET")) }
        }
        for path in ["https://evil.invalid/api/preferences/life-day", "/api/notifications", "/api/native/sync", "/api/ai/providers", "/api/calendar"] { XCTAssertFalse(TrackerLocalController.allowsSettingsConfiguration(path: path, method: "GET")) }
        XCTAssertTrue(NativeBridge.trackerMethods.contains("settings.configuration"))
        for method in ["healthkit.getStatus", "eventkit.getStatus", "notification.getStatus", "notification.openSettings"] { XCTAssertTrue(NativeBridge.localCoreMethods.contains(method)) }
        for method in ["healthkit.configureCredential", "healthkit.syncNow", "eventkit.save", "eventkit.delete", "notification.schedule", "notification.cancel", "notification.requestAuthorization"] { XCTAssertFalse(NativeBridge.localCoreMethods.contains(method)) }
    }

    func testLocalAssetsAreConfinedToBundleAndProductionDoesNotTrustLocalOrigin() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("TrackerWeb")
        let handler = TrackerAssetHandler(root: root)
        XCTAssertEqual(handler.resourceURL(for: TrackerAssetHandler.entryURL)?.lastPathComponent, "index.html")
        for raw in ["eo-local://evil/index.html", "eo-local://user@app/index.html", "eo-local://app:123/index.html", "eo-local://app/%252e%252e/private", "https://example.com/index.html"] {
            XCTAssertNil(handler.resourceURL(for: URL(string: raw)!), raw)
        }
        let production = try XCTUnwrap(HostConfiguration(validating: URL(string: "https://eva-orbit.vercel.app")!))
        XCTAssertFalse(production.allowsTrackerUI(TrackerAssetHandler.entryURL))
        let local = try XCTUnwrap(HostConfiguration(validating: production.baseURL, localTrackers: true))
        XCTAssertTrue(local.allowsTrackerUI(TrackerAssetHandler.entryURL))
        XCTAssertTrue(local.allows(production.baseURL))
        XCTAssertFalse(local.allowsTrackerUI(URL(string: "https://example.com")!))
        XCTAssertFalse(NativeBridge.localCoreMethods.contains("healthkit.configureCredential"))
        XCTAssertFalse(NativeBridge.supportedMethods.contains("trackers.commitState"))
    }
}
