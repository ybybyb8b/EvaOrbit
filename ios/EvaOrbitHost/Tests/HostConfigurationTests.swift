import XCTest
import WebKit
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

    func testNotificationDeepLinksStayOnTheConfiguredOrigin() throws {
        let configuration = try XCTUnwrap(HostConfiguration(validating: URL(string: "https://eva-orbit.vercel.app")!))
        XCTAssertEqual(configuration.navigationURL(for: URL(string: "evaorbit://open/tasks?taskId=123")!)?.absoluteString, "https://eva-orbit.vercel.app/tasks?taskId=123")
        XCTAssertEqual(configuration.navigationURL(for: URL(string: "evaorbit://open/settings/notifications?reminderId=42")!)?.path, "/settings/notifications")
        for raw in ["https://example.com/tasks", "evaorbit://other/tasks", "evaorbit://user@open/tasks", "evaorbit://open:443/tasks", "evaorbit://open//example.com/tasks", "evaorbit://open/api/tasks", "evaorbit://open/tasks/../api/tasks", "evaorbit://open/tasks/%2e%2e/api/tasks", "evaorbit://open/eventkit/private"] {
            XCTAssertNil(configuration.navigationURL(for: URL(string: raw)!), raw)
        }
    }

    func testLocalNotificationLinksUseTheLocalSchemeAndKeepQueryAndFragment() throws {
        let local = try XCTUnwrap(HostConfiguration(validating: URL(string: "https://eva-orbit.vercel.app")!, localTrackers: true))
        let link = URL(string: "evaorbit-trackers-poc://open/tasks?taskId=123#details")!
        XCTAssertEqual(local.navigationURL(for: link)?.absoluteString, "https://eva-orbit.vercel.app/tasks?taskId=123#details")
        XCTAssertEqual(local.navigationURL(for: URL(string: "evaorbit-trackers-poc://open/ai?conversation=thread")!)?.absoluteString, "https://eva-orbit.vercel.app/ai?conversation=thread")
        let online = try XCTUnwrap(HostConfiguration(validating: local.baseURL))
        XCTAssertNil(online.navigationURL(for: link))
        for raw in ["evaorbit-trackers-poc://user@open/tasks", "evaorbit-trackers-poc://open:443/tasks", "evaorbit-trackers-poc://open/tasks/%2e%2e/api/tasks", "evaorbit-trackers-poc://open/eventkit/token"] {
            XCTAssertNil(local.navigationURL(for: URL(string: raw)!), raw)
        }
    }

    func testBridgeBootstrapExposesVersionedCallSurface() {
        XCTAssertTrue(NativeBridge.bootstrapScript.contains("EvaOrbitNative"))
        XCTAssertTrue(NativeBridge.bootstrapScript.contains("version: 1"))
        XCTAssertTrue(NativeBridge.bootstrapScript.contains("evaorbit:native-ready"))
        XCTAssertEqual(NativeBridge.supportedMethods, Set([
            "host.ping", "host.getInfo", "host.notifyDataChanged", "navigation.openExternal",
            "appearance.setPreference",
            "haptic.play",
            "healthkit.getStatus", "healthkit.requestAuthorization", "healthkit.syncNow",
            "healthkit.configureCredential", "healthkit.clearCredential",
            "healthkit.saveBodyMass", "healthkit.saveMenstrualFlow", "healthkit.deleteMenstrualFlow",
            "eventkit.getStatus", "eventkit.requestAccess", "eventkit.fetch",
            "eventkit.getItem", "eventkit.recover", "eventkit.save", "eventkit.delete",
            "notification.getStatus", "notification.requestAuthorization", "notification.schedule",
            "notification.cancel", "notification.listPending", "notification.openSettings"
        ]))
    }

    @MainActor
    func testHostKeyboardUsesAZeroHeightAccessory() {
        let webView = HostWebView(frame: .zero, configuration: WKWebViewConfiguration())
        XCTAssertEqual(webView.inputAccessoryView?.frame.height, 0)
    }

    func testHapticKindsStayAClosedBridgeVocabulary() {
        XCTAssertEqual(Set(HapticFeedbackKind.allCases.map(\.rawValue)), Set([
            "selection", "light", "medium", "success", "warning", "error"
        ]))
    }
}
