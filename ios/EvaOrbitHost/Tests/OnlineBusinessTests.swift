import XCTest
@testable import EvaOrbitHost

final class OnlineBusinessTests: XCTestCase {
    @MainActor func testBundledRouteManifestRejectsPrivilegedAndEscapedPaths() throws {
        guard Bundle.main.url(forResource: "business-routes", withExtension: "json", subdirectory: "TrackerWeb") != nil else { throw XCTSkip("Local React bundle was not built for this Host variant") }
        XCTAssertTrue(NativeBridge.trackerMethods.contains("business.request"))
        XCTAssertTrue(TrackerLocalController.allowsBusinessRequest(path: "/api/health/weight", method: "POST"))
        XCTAssertTrue(TrackerLocalController.allowsBusinessRequest(path: "/api/memos?q=old%20note", method: "GET"))
        for path in ["https://evil.invalid/api/tasks", "/api/tasks/../ai/providers", "/api/tasks/%2e%2e/ai/providers", "/api/native/sync", "/api/trackers/1", "/api/ai/providers", "/api/eventkit/links", "/api/reminders/deliver"] {
            XCTAssertFalse(TrackerLocalController.allowsBusinessRequest(path: path, method: "POST"), path)
        }
    }
    func testOnlineCachePersistsAndCannotCrossAccountsOrEraseOtherModules() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appendingPathComponent("test.sqlite3").path
        let database = try TrackerLocalDatabase(path: path)
        try await database.setAccount(id: "account-a", email: "a@example.invalid")
        try await database.saveOnlineCache(accountId: "account-a", path: "/api/memos", response: ["status": 200, "body": [["id": 1]]])
        try await database.saveOnlineCache(accountId: "account-a", path: "/api/tasks?status=open", response: ["status": 200, "body": []])
        let reopened = try TrackerLocalDatabase(path: path)
        let cached = try await reopened.onlineCache(accountId: "account-a", path: "/api/memos") as? [String: Any]
        XCTAssertEqual(cached?["status"] as? Int, 200)
        try await database.invalidateOnlineCache(accountId: "account-a", module: "tasks")
        let memo = try await database.onlineCache(accountId: "account-a", path: "/api/memos")
        let tasks = try await database.onlineCache(accountId: "account-a", path: "/api/tasks?status=open")
        XCTAssertTrue(memo is [String: Any]); XCTAssertTrue(tasks is NSNull)
        try await database.setAccount(id: "account-b", email: "b@example.invalid")
        do { _ = try await database.onlineCache(accountId: "account-a", path: "/api/memos"); XCTFail("Previous account must be rejected") } catch TrackerLocalError.account { }
        let empty = try await database.onlineCache(accountId: "account-b", path: "/api/memos")
        XCTAssertTrue(empty is NSNull)
        try await database.setAccount(id: "account-a", email: "a@example.invalid")
        let preserved = try await database.onlineCache(accountId: "account-a", path: "/api/memos")
        XCTAssertTrue(preserved is [String: Any])
    }
}
