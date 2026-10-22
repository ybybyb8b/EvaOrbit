import XCTest
@testable import EvaOrbitHost

final class NativeIntegrationPolicyTests: XCTestCase {
    @MainActor func testOnlyExactNativeSettingsPagesAreAllowed() throws {
        let config = try XCTUnwrap(HostConfiguration(validating: URL(string: "https://example.invalid")!))
        for path in NativeIntegrationViewController.paths { XCTAssertTrue(NativeIntegrationViewController.allows(URL(string: "https://example.invalid" + path)!, configuration: config)) }
        for url in ["https://evil.invalid/settings/health-native", "http://example.invalid/settings/health-native", "https://example.invalid/login", "https://example.invalid/", "https://example.invalid/settings/health-native?next=/login", "https://example.invalid/settings/health-native#login", "https://user@example.invalid/settings/health-native"] {
            XCTAssertFalse(NativeIntegrationViewController.allows(URL(string: url)!, configuration: config), url)
        }
    }
    func testLocalShellCannotDirectlyWriteNativeRecordsOrRecursivelyOpenSettings() {
        XCTAssertTrue(NativeBridge.trackerMethods.contains("navigation.openNativeSettings"))
        XCTAssertFalse(NativeBridge.supportedMethods.contains("navigation.openNativeSettings"))
        for method in ["healthkit.saveBodyMass", "healthkit.configureCredential", "eventkit.save", "eventkit.delete", "notification.schedule"] { XCTAssertFalse(NativeBridge.localCoreMethods.contains(method)) }
    }
}
