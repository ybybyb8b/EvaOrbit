import EventKit
import XCTest
@testable import EvaOrbitHost

final class EventKitSyncEngineTests:XCTestCase {
    func testStatusExposesSeparatePermissionsAndInstallationIdentity(){let status=EventKitSyncEngine().status();XCTAssertEqual(status["available"] as? Bool,true);XCTAssertNotNil(UUID(uuidString:status["installationId"] as? String ?? ""));XCTAssertNotNil(status["calendarPermission"] as? String);XCTAssertNotNil(status["reminderPermission"] as? String);}
}
