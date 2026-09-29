import EventKit
import XCTest
@testable import EvaOrbitHost

final class EventKitSyncEngineTests:XCTestCase {
    func testStatusExposesSeparatePermissionsAndInstallationIdentity(){let status=EventKitSyncEngine().status();XCTAssertEqual(status["available"] as? Bool,true);XCTAssertNotNil(UUID(uuidString:status["installationId"] as? String ?? ""));XCTAssertNotNil(status["calendarPermission"] as? String);XCTAssertNotNil(status["reminderPermission"] as? String);}
    func testReminderDueComponentsPreserveDateOnlyAndExplicitTime(){let dateOnly=EventKitSyncEngine.reminderDueComponents(date:"2026-09-30",time:nil,timezone:"Asia/Shanghai"),timed=EventKitSyncEngine.reminderDueComponents(date:"2026-09-30",time:"21:15",timezone:"Asia/Shanghai");XCTAssertEqual(dateOnly?.calendar?.identifier,.gregorian);XCTAssertNil(dateOnly?.hour);XCTAssertEqual(timed?.hour,21);XCTAssertEqual(timed?.minute,15);XCTAssertEqual(timed?.timeZone?.identifier,"Asia/Shanghai");}
}
