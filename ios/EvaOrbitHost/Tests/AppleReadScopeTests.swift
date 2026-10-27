import XCTest
@testable import EvaOrbitHost

final class AppleReadScopeTests: XCTestCase {
    func testLowerBoundaryUsesTheObjectsTimezoneAndDoesNotCapFutureDates() throws {
        let zone = try XCTUnwrap(TimeZone(identifier: "Pacific/Kiritimati"))
        let boundary = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-09-30T10:00:00Z"))
        XCTAssertTrue(AppleReadScope.includes(boundary, timeZone: zone))
        XCTAssertFalse(AppleReadScope.includes(boundary.addingTimeInterval(-1), timeZone: zone))
        XCTAssertTrue(AppleReadScope.includes(try XCTUnwrap(ISO8601DateFormatter().date(from: "2099-01-01T00:00:00Z")), timeZone: zone))
        XCTAssertEqual(HealthSleepSyncScope.firstWakeDate, AppleReadScope.firstDay)
        XCTAssertLessThan(HealthSleepSyncScope.queryStart, boundary, "Sleep retains the complete preceding night")
    }
}
