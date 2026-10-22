import XCTest
@testable import EvaOrbitHost

final class NativeIntegrationPolicyTests: XCTestCase {
    @MainActor func testLocalNativeSessionIsBoundAndNeverEnablesATestAccount() {
        let account = "10000000-0000-4000-8000-000000000001"
        let valid: [String: Any] = ["authenticated": true, "accountId": account, "nativeIntegrationsAccountAllowed": true, "onlineBusinessTestAccount": false]
        XCTAssertTrue(TrackerLocalController.nativeAccountAllowed(valid, accountId: account))
        for patch in [["authenticated": false], ["accountId": "other"], ["nativeIntegrationsAccountAllowed": false], ["onlineBusinessTestAccount": true]] as [[String: Any]] {
            XCTAssertFalse(TrackerLocalController.nativeAccountAllowed(valid.merging(patch, uniquingKeysWith: { _, next in next }), accountId: account))
        }
        XCTAssertFalse(TrackerLocalController.nativeAccountAllowed([:], accountId: account))
    }
    @MainActor func testNativeApiManifestHasNoArbitraryNetworkOrCredentialIngest() throws {
        guard Bundle.main.url(forResource: "native-routes", withExtension: "json", subdirectory: "TrackerWeb") != nil else { throw XCTSkip("Local bundle not built") }
        XCTAssertTrue(TrackerLocalController.allowsNativeAPI(path: "/api/eventkit/links?protocol=2", method: "PUT"))
        XCTAssertTrue(TrackerLocalController.allowsNativeAPI(path: "/api/native/devices", method: "POST"))
        for path in ["/api/healthkit/energy/ingest", "/api/native/sync", "/api/ai/providers", "/api/mcp", "https://example.invalid/api/notifications", "/api/tasks/../notifications", "/api/tasks/%2e%2e/notifications"] {
            XCTAssertFalse(TrackerLocalController.allowsNativeAPI(path: path, method: "POST"))
        }
    }
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
