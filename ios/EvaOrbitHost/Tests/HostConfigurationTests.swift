import XCTest
@testable import EvaOrbitHost

final class HostConfigurationTests: XCTestCase {
    func testAllowsOnlyTheConfiguredHTTPSOrigin() throws {
        let configuration = try XCTUnwrap(HostConfiguration(validating: URL(string: "https://eva-orbit.vercel.app")!))

        XCTAssertTrue(configuration.allows(URL(string: "https://eva-orbit.vercel.app/login?next=%2F")!))
        XCTAssertTrue(configuration.allows(URL(string: "https://eva-orbit.vercel.app:443/api/tasks")!))
        XCTAssertFalse(configuration.allows(URL(string: "http://eva-orbit.vercel.app")!))
        XCTAssertFalse(configuration.allows(URL(string: "https://example.com")!))
        XCTAssertFalse(configuration.allows(URL(string: "https://eva-orbit.vercel.app.example.com")!))
    }

    func testRejectsNonHTTPSBaseURL() {
        XCTAssertNil(HostConfiguration(validating: URL(string: "http://eva-orbit.vercel.app")!))
    }

    func testBridgeBootstrapExposesVersionedCallSurface() {
        XCTAssertTrue(NativeBridge.bootstrapScript.contains("EvaOrbitNative"))
        XCTAssertTrue(NativeBridge.bootstrapScript.contains("version: 1"))
        XCTAssertTrue(NativeBridge.bootstrapScript.contains("evaorbit:native-ready"))
        XCTAssertEqual(NativeBridge.supportedMethods, Set([
            "host.ping", "host.getInfo", "navigation.openExternal",
            "appearance.setPreference",
            "healthkit.getStatus", "healthkit.requestAuthorization", "healthkit.syncNow",
            "healthkit.configureCredential", "healthkit.clearCredential",
            "notification.getStatus", "notification.requestAuthorization", "notification.schedule",
            "notification.cancel", "notification.listPending", "notification.openSettings"
        ]))
    }
}
