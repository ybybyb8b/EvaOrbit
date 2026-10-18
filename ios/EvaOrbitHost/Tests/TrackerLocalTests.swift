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
            if title == "Trackers" { break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        XCTAssertEqual(title, "Trackers", "Bundled modules/fonts must work through WKURLSchemeHandler")
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
