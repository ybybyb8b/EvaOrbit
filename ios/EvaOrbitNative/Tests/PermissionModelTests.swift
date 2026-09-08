import UserNotifications
import XCTest
@testable import EvaOrbitNative

final class PermissionModelTests: XCTestCase {
    func testNotificationAuthorizationMapping() {
        XCTAssertEqual(NotificationAuthorization(.notDetermined), .notDetermined)
        XCTAssertEqual(NotificationAuthorization(.denied), .denied)
        XCTAssertEqual(NotificationAuthorization(.authorized), .authorized)
        XCTAssertEqual(NotificationAuthorization(.provisional), .provisional)
        XCTAssertEqual(NotificationAuthorization(.ephemeral), .ephemeral)
    }

    func testOnlyNotDeterminedCanRequestAgain() {
        XCTAssertTrue(NotificationAuthorization.notDetermined.canRequest)
        XCTAssertFalse(NotificationAuthorization.denied.canRequest)
        XCTAssertFalse(NotificationAuthorization.authorized.canRequest)
    }

    func testNotificationRequestIncludesSoundButNotBadge() {
        XCTAssertTrue(PermissionModel.notificationOptions.contains(.alert))
        XCTAssertTrue(PermissionModel.notificationOptions.contains(.sound))
        XCTAssertFalse(PermissionModel.notificationOptions.contains(.badge))
    }
}
