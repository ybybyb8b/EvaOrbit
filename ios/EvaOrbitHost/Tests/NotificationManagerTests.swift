import UserNotifications
import XCTest
@testable import EvaOrbitHost

final class NotificationManagerTests: XCTestCase {
    func testPermissionStatusReflectsSystemState() async {
        let center = FakeLocalNotificationCenter(status: .denied)
        let manager = NotificationManager(center: center)

        let status = await manager.status()

        XCTAssertEqual(status["permission"] as? String, "denied")
        XCTAssertEqual(status["scheduledCount"] as? Int, 0)
    }

    func testRequestAccessOnlyPromptsWhileNotDetermined() async throws {
        let center = FakeLocalNotificationCenter(status: .notDetermined)
        let manager = NotificationManager(center: center)

        _ = try await manager.requestAuthorization()
        _ = try await manager.requestAuthorization()
        let status = await manager.status()

        XCTAssertEqual(center.authorizationRequests, 1)
        XCTAssertEqual(status["permission"] as? String, "authorized")
    }

    func testSchedulingSameStableIdentifierReplacesPendingRequest() async throws {
        let center = FakeLocalNotificationCenter(status: .authorized)
        let manager = NotificationManager(center: center)
        let identifier = "evaorbit-reminder-42"

        try await manager.schedule(identifier: identifier, title: "Before", body: "One", triggerAt: Date().addingTimeInterval(600))
        try await manager.schedule(identifier: identifier, title: "After", body: "Two", triggerAt: Date().addingTimeInterval(1_200))

        let pending = await manager.pendingNotifications()
        XCTAssertEqual(pending.map(\.identifier), [identifier])
        XCTAssertEqual(center.requests[identifier]?.content.title, "After")
    }

    func testCancelRemovesPendingRequest() async throws {
        let center = FakeLocalNotificationCenter(status: .authorized)
        let manager = NotificationManager(center: center)
        let identifier = "evaorbit-reminder-7"
        try await manager.schedule(identifier: identifier, title: "Care", body: "Momo", triggerAt: Date().addingTimeInterval(600))

        try manager.cancel(identifier: identifier)
        let pending = await manager.pendingNotifications()

        XCTAssertTrue(pending.isEmpty)
    }

    func testRejectsUnscopedIdentifiersAndDeniedScheduling() async {
        let center = FakeLocalNotificationCenter(status: .denied)
        let manager = NotificationManager(center: center)

        do {
            try await manager.schedule(identifier: "other-app-1", title: "Care", body: "Momo", triggerAt: Date().addingTimeInterval(600))
            XCTFail("Expected invalid identifier")
        } catch {
            XCTAssertEqual(error as? NotificationManagerError, .invalidIdentifier)
        }

        do {
            try await manager.schedule(identifier: "evaorbit-reminder-1", title: "Care", body: "Momo", triggerAt: Date().addingTimeInterval(600))
            XCTFail("Expected denied scheduling")
        } catch {
            XCTAssertEqual(error as? NotificationManagerError, .notAuthorized)
        }
    }
}

private final class FakeLocalNotificationCenter: LocalNotificationCenter {
    var status: UNAuthorizationStatus
    var requests: [String: UNNotificationRequest] = [:]
    var authorizationRequests = 0

    init(status: UNAuthorizationStatus) {
        self.status = status
    }

    func authorizationStatus() async -> UNAuthorizationStatus { status }

    func requestAuthorization(options: UNAuthorizationOptions) async throws -> Bool {
        authorizationRequests += 1
        status = .authorized
        return true
    }

    func add(_ request: UNNotificationRequest) async throws {
        requests[request.identifier] = request
    }

    func pendingRequests() async -> [UNNotificationRequest] {
        Array(requests.values)
    }

    func removePendingNotificationRequests(withIdentifiers identifiers: [String]) {
        for identifier in identifiers { requests.removeValue(forKey: identifier) }
    }
}
