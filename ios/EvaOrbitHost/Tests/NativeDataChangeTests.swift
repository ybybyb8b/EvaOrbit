import XCTest
@testable import EvaOrbitHost

final class NativeDataChangeTests: XCTestCase {
    func testBridgeExposesCompletionNotification() {
        XCTAssertTrue(NativeBridge.supportedMethods.contains("host.notifyDataChanged"))
        XCTAssertEqual(NativeBridge.protocolVersion, 1)
    }

    func testDomainsAreValidatedAndDeduplicated() {
        XCTAssertEqual(NativeBridge.dataChangeDomains(["tasks", "calendar", "tasks"]), ["calendar", "tasks"])
        XCTAssertEqual(NativeBridge.dataChangeDomains(["health"]), ["health"])
        let invalid: [Any] = [NSNull(), "calendar", [String](), ["calendar", "unknown"], ["calendar", 1] as [Any], Array(repeating: "calendar", count: 5)]
        for value in invalid {
            XCTAssertNil(NativeBridge.dataChangeDomains(value))
        }
    }
}
