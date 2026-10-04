import EventKit
import XCTest
@testable import EvaOrbitHost

final class EventKitSyncEngineTests:XCTestCase {
    func testRecoveryMarkerNeverOverwritesUserURL() {
        let token = "00000000-0000-4000-8000-000000000001"
        let userURL = URL(string: "https://example.com/personal")!
        XCTAssertEqual(EventKitSyncEngine.recoveryURL(existing: userURL, token: token), userURL)
        XCTAssertEqual(EventKitSyncEngine.recoveryToken(in: EventKitSyncEngine.recoveryURL(existing: nil, token: token)), token)
        XCTAssertNil(EventKitSyncEngine.recoveryToken(in: userURL))
        XCTAssertNil(EventKitSyncEngine.recoveryURL(existing: nil, token: "invalid"))
        XCTAssertNil(EventKitSyncEngine.recoveryToken(in: URL(string: "evaorbit://eventkit/\(token)?user=private")))
    }
    func testMissingSourceDoesNotConfirmItemDeletion(){let result=EventKitSyncEngine().getItem(kind:.event,identifier:"missing-item",externalIdentifier:nil,calendarIdentifier:"missing-calendar",sourceIdentifier:"missing-source");XCTAssertEqual(result["status"] as? String,"unavailable");}
    func testRecoveryWithMissingSourceCannotConfirmDeletion() async {
        do {
            _ = try await EventKitSyncEngine().recover(kind: .event, calendarIDs: ["missing-calendar"], bindings: [], externalIdentifiers: ["external"], recoveryToken: nil)
            XCTFail("Unreadable source must not return a confirmed deletion")
        } catch { XCTAssertTrue(error is EventKitSyncError) }
    }
    func testStatusExposesSeparatePermissionsAndInstallationIdentity(){let status=EventKitSyncEngine().status();XCTAssertEqual(status["available"] as? Bool,true);XCTAssertNotNil(UUID(uuidString:status["installationId"] as? String ?? ""));XCTAssertNotNil(status["calendarPermission"] as? String);XCTAssertNotNil(status["reminderPermission"] as? String);}
    func testReminderDueComponentsPreserveDateOnlyAndExplicitTime(){let dateOnly=EventKitSyncEngine.reminderDueComponents(date:"2026-09-30",time:nil,timezone:"Asia/Shanghai"),timed=EventKitSyncEngine.reminderDueComponents(date:"2026-09-30",time:"21:15",timezone:"Asia/Shanghai");XCTAssertEqual(dateOnly?.calendar?.identifier,.gregorian);XCTAssertNil(dateOnly?.hour);XCTAssertEqual(timed?.hour,21);XCTAssertEqual(timed?.minute,15);XCTAssertEqual(timed?.timeZone?.identifier,"Asia/Shanghai");}
}
