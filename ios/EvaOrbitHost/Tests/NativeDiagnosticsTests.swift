import XCTest
@testable import EvaOrbitHost

final class NativeDiagnosticsTests: XCTestCase {
    func testNetworkCausesRemainDistinctAndRawSystemDetailsAreExcluded() {
        let cases: [(Int, String)] = [(-1001, "network_timeout"), (-1009, "network_offline"), (-1005, "network_connection_lost"), (-1003, "network_dns_failed"), (-1200, "network_tls_failed"), (-999, "operation_cancelled")]
        for (number, code) in cases {
            let error = NSError(domain: NSURLErrorDomain, code: number, userInfo: [NSLocalizedDescriptionKey: "private token https://user:password@example.invalid", NSURLErrorFailingURLErrorKey: URL(string: "https://example.invalid?secret=token")!])
            let result = NativeDiagnostics.capture(error, operation: "trackers.syncReplica · GET /api/native/session")
            XCTAssertEqual(result.code, code)
            XCTAssertTrue(result.message.contains("GET /api/native/session"))
            XCTAssertFalse(result.message.contains("password"))
            XCTAssertFalse(result.message.contains("secret"))
        }
    }
    func testStorageParsingAndAuthenticationHaveSeparateCodes() {
        XCTAssertEqual(NativeDiagnostics.describe(NSError(domain: NSCocoaErrorDomain, code: NSFileWriteOutOfSpaceError)).code, "storage_full")
        XCTAssertEqual(NativeDiagnostics.describe(NSError(domain: NSCocoaErrorDomain, code: NSFileWriteNoPermissionError)).code, "storage_access_denied")
        XCTAssertEqual(NativeDiagnostics.describe(NSError(domain: NSCocoaErrorDomain, code: 3840)).code, "json_decode_failed")
        XCTAssertEqual(NativeDiagnostics.describe(TrackerLocalError.sessionExpired).code, "session_expired")
        XCTAssertEqual(NativeDiagnostics.describe(TrackerLocalError.account).code, "account_mismatch")
        XCTAssertEqual(NativeDiagnostics.describe(EventKitSyncError.unavailable).code, "eventkit_source_unavailable")
        XCTAssertEqual(NativeDiagnostics.describe(NotificationManagerError.notAuthorized).code, "notification_not_authorized")
    }
    func testNestedStepsAndUncertainWriteWarningsArePreservedWithoutInventingSuccess() {
        let inner = NativeDiagnostics.capture(URLError(.timedOut), operation: "POST /api/native/sync · connection", writeResultUnknown: true)
        let outer = NativeDiagnostics.capture(inner, operation: "trackers.syncReplica")
        XCTAssertEqual(outer.code, "network_timeout")
        XCTAssertTrue(outer.message.contains("trackers.syncReplica"))
        XCTAssertTrue(outer.message.contains("POST /api/native/sync"))
        XCTAssertTrue(outer.message.contains("save result is unknown"))
        let marked = NativeDiagnostics.marked(outer.message, code: outer.code)
        XCTAssertEqual(NativeDiagnostics.marked(marked, code: outer.code), marked)
    }
    @MainActor func testInvalidServerJSONNamesTheResponseStepWithoutEchoingPayload() {
        XCTAssertThrowsError(try TrackerLocalController.decodeJSON(Data("<html>secret</html>".utf8), operation: "GET session · response")) { error in
            let result = NativeDiagnostics.describe(error)
            XCTAssertEqual(result.code, "json_decode_failed")
            XCTAssertTrue(result.message.contains("GET session · response"))
            XCTAssertFalse(result.message.contains("secret"))
        }
    }
}
