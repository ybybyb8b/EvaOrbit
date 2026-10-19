import XCTest
import SQLite3
import WebKit
@testable import EvaOrbitHost

final class TrackerLocalTests: XCTestCase {
    @MainActor func testBundledReactBootsFromTheLocalScheme() async throws {
        let root = try XCTUnwrap(Bundle.main.url(forResource: "TrackerWeb", withExtension: nil))
        let configuration = WKWebViewConfiguration()
        configuration.setURLSchemeHandler(TrackerAssetHandler(root: root), forURLScheme: TrackerAssetHandler.scheme)
        // Offline, signed-out bridge fixture: the document must still render a
        // usable entry, without a hosted page or a successful session request.
        configuration.userContentController.addUserScript(WKUserScript(source: "window.EvaOrbitNative={version:1,call:async()=>({ok:true,result:null})};", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 402, height: 874), configuration: configuration)
        webView.load(URLRequest(url: TrackerAssetHandler.entryURL))
        var title: String?
        for _ in 0..<100 {
            title = try? await webView.evaluateJavaScript("document.querySelector('h1')?.textContent") as? String
            if title == "Welcome back to EvaOrbit" { break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        XCTAssertEqual(title, "Welcome back to EvaOrbit", "Bundled modules/fonts must work through WKURLSchemeHandler")
        let font = try await webView.callAsyncJavaScript("await document.fonts.load('400 24px \"EO August Stories\"'); return Array.from(document.fonts).some(font => font.family.replaceAll('\"','') === 'EO August Stories' && font.status === 'loaded');", arguments: [:], in: nil, in: .page) as? Bool
        XCTAssertEqual(font, true, "The actual August asset must load offline, without falling back")
        _ = try await webView.evaluateJavaScript("localStorage.setItem('evaorbit.englishFont','polyamine'); localStorage.setItem('evaorbit.uiLanguage','zh-CN'); true")
        webView.reload()
        for _ in 0..<100 {
            title = try? await webView.evaluateJavaScript("document.querySelector('h1')?.textContent") as? String
            if title == "回到 EvaOrbit" { break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        XCTAssertEqual(title, "回到 EvaOrbit", "Explicit language must survive a local document reload")
        let persistedFont = try await webView.evaluateJavaScript("document.documentElement.dataset.englishFont") as? String
        XCTAssertEqual(persistedFont, "polyamine")
        _ = try await webView.evaluateJavaScript("localStorage.removeItem('evaorbit.englishFont'); localStorage.removeItem('evaorbit.uiLanguage'); true")
        XCTAssertEqual(webView.url?.scheme, TrackerAssetHandler.scheme)
        let random = try await webView.evaluateJavaScript("crypto.getRandomValues(new Uint8Array(1)).length") as? Int
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
