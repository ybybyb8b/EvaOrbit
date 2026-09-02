import UIKit
import WebKit

final class NativeBridge: NSObject, WKScriptMessageHandlerWithReply {
    static let name = "evaOrbit"
    static let protocolVersion = 1
    static let supportedMethods: Set<String> = [
        "host.ping", "host.getInfo", "navigation.openExternal",
        "healthkit.getStatus", "healthkit.requestAuthorization", "healthkit.syncNow",
        "healthkit.configureCredential", "healthkit.clearCredential",
        "notification.getStatus", "notification.requestAuthorization", "notification.schedule",
        "notification.cancel", "notification.listPending", "notification.openSettings"
    ]

    static let bootstrapScript = #"""
    (() => {
      if (window.EvaOrbitNative) return;
      var sequence = 0;
      const call = (method, params = {}) => {
        sequence += 1;
        return window.webkit.messageHandlers.evaOrbit.postMessage({
          version: 1,
          id: `native-${Date.now()}-${sequence}`,
          method,
          params
        });
      };
      Object.defineProperty(window, "EvaOrbitNative", {
        configurable: false,
        enumerable: false,
        writable: false,
        value: Object.freeze({ version: 1, call })
      });
      window.dispatchEvent(new CustomEvent("evaorbit:native-ready", { detail: { version: 1 } }));
    })();
    """#

    private let hostConfiguration: HostConfiguration
    private let healthKitCoordinator: HealthKitCoordinator
    private let notificationManager: NotificationManager

    init(hostConfiguration: HostConfiguration, healthKitCoordinator: HealthKitCoordinator, notificationManager: NotificationManager) {
        self.hostConfiguration = hostConfiguration
        self.healthKitCoordinator = healthKitCoordinator
        self.notificationManager = notificationManager
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard message.name == Self.name, message.frameInfo.isMainFrame else {
            replyHandler(failure(id: nil, code: "untrusted_frame", message: "Bridge calls are limited to the main frame."), nil)
            return
        }

        guard let sourceURL = message.frameInfo.request.url, hostConfiguration.allows(sourceURL) else {
            replyHandler(failure(id: nil, code: "untrusted_origin", message: "Bridge calls are limited to EvaOrbit."), nil)
            return
        }

        guard let request = message.body as? [String: Any],
              let version = request["version"] as? NSNumber,
              version.intValue == Self.protocolVersion,
              let identifier = request["id"] as? String,
              !identifier.isEmpty,
              let method = request["method"] as? String
        else {
            replyHandler(failure(id: nil, code: "invalid_request", message: "The bridge request is invalid."), nil)
            return
        }

        let parameters = request["params"] as? [String: Any] ?? [:]
        guard Self.supportedMethods.contains(method) else {
            replyHandler(failure(id: identifier, code: "unknown_method", message: "Unsupported native method."), nil)
            return
        }
        switch method {
        case "host.ping":
            replyHandler(success(id: identifier, result: ["pong": true]), nil)
        case "host.getInfo":
            replyHandler(success(id: identifier, result: hostInfo()), nil)
        case "navigation.openExternal":
            openExternal(parameters: parameters, id: identifier, replyHandler: replyHandler)
        case "healthkit.getStatus":
            replyHandler(success(id: identifier, result: healthKitCoordinator.status().dictionary), nil)
        case "healthkit.requestAuthorization":
            Task {
                do {
                    let status = try await healthKitCoordinator.requestAuthorization()
                    replyOnMain(replyHandler, value: success(id: identifier, result: status.dictionary))
                } catch {
                    replyOnMain(replyHandler, value: failure(id: identifier, code: "healthkit_authorization_failed", message: HealthDiagnostics.safe(error)))
                }
            }
        case "healthkit.syncNow":
            Task {
                let synced = await healthKitCoordinator.syncNow()
                let result: [String: Any] = ["synced": synced, "status": healthKitCoordinator.status().dictionary]
                replyOnMain(replyHandler, value: success(id: identifier, result: result))
            }
        case "healthkit.configureCredential":
            configureCredential(parameters: parameters, id: identifier, replyHandler: replyHandler)
        case "healthkit.clearCredential":
            healthKitCoordinator.clearCredential()
            replyHandler(success(id: identifier, result: ["configured": false]), nil)
        case "notification.getStatus":
            Task { replyOnMain(replyHandler, value: success(id: identifier, result: await notificationManager.status())) }
        case "notification.requestAuthorization":
            Task {
                do {
                    let status = try await notificationManager.requestAuthorization()
                    replyOnMain(replyHandler, value: success(id: identifier, result: status))
                } catch {
                    replyOnMain(replyHandler, value: failure(id: identifier, code: "notification_authorization_failed", message: error.localizedDescription))
                }
            }
        case "notification.schedule":
            scheduleNotification(parameters: parameters, id: identifier, replyHandler: replyHandler)
        case "notification.cancel":
            cancelNotification(parameters: parameters, id: identifier, replyHandler: replyHandler)
        case "notification.listPending":
            Task {
                let notifications = await notificationManager.pendingNotifications().map(\.dictionary)
                replyOnMain(replyHandler, value: success(id: identifier, result: ["notifications": notifications]))
            }
        case "notification.openSettings":
            Task {
                let opened = await notificationManager.openSettings()
                replyOnMain(replyHandler, value: success(id: identifier, result: ["opened": opened]))
            }
        default:
            assertionFailure("Whitelisted bridge method is not implemented")
            replyHandler(failure(id: identifier, code: "unknown_method", message: "Unsupported native method."), nil)
        }
    }

    private func scheduleNotification(
        parameters: [String: Any],
        id: String,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard let notificationID = parameters["id"] as? String,
              let title = parameters["title"] as? String,
              let body = parameters["body"] as? String,
              let rawTrigger = parameters["triggerAt"] as? String,
              let triggerAt = Self.parseISO8601(rawTrigger)
        else {
            replyHandler(failure(id: id, code: "invalid_notification", message: "Notification parameters are invalid."), nil)
            return
        }
        Task {
            do {
                try await notificationManager.schedule(identifier: notificationID, title: title, body: body, triggerAt: triggerAt)
                replyOnMain(replyHandler, value: success(id: id, result: ["scheduled": true, "id": notificationID]))
            } catch {
                replyOnMain(replyHandler, value: failure(id: id, code: "notification_schedule_failed", message: error.localizedDescription))
            }
        }
    }

    private func cancelNotification(
        parameters: [String: Any],
        id: String,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard let notificationID = parameters["id"] as? String else {
            replyHandler(failure(id: id, code: "invalid_notification", message: "Notification identifier is missing."), nil)
            return
        }
        do {
            try notificationManager.cancel(identifier: notificationID)
            replyHandler(success(id: id, result: ["cancelled": true, "id": notificationID]), nil)
        } catch {
            replyHandler(failure(id: id, code: "notification_cancel_failed", message: error.localizedDescription), nil)
        }
    }

    private static func parseISO8601(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }

    private func configureCredential(
        parameters: [String: Any],
        id: String,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard let credential = parameters["credential"] as? String,
              credential.count >= 32,
              let rawURL = parameters["ingestUrl"] as? String,
              let ingestURL = URL(string: rawURL),
              hostConfiguration.allows(ingestURL),
              ingestURL.path == "/api/healthkit/energy/ingest"
        else {
            replyHandler(failure(id: id, code: "invalid_credential_configuration", message: "Native credential configuration is invalid."), nil)
            return
        }
        do {
            try healthKitCoordinator.configureCredential(credential, ingestURL: ingestURL)
            replyHandler(success(id: id, result: ["configured": true]), nil)
        } catch {
            replyHandler(failure(id: id, code: "credential_storage_failed", message: "Native credential could not be stored."), nil)
        }
    }

    private func replyOnMain(_ replyHandler: @escaping (Any?, String?) -> Void, value: [String: Any]) {
        DispatchQueue.main.async { replyHandler(value, nil) }
    }

    private func openExternal(
        parameters: [String: Any],
        id: String,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard let rawURL = parameters["url"] as? String,
              let url = URL(string: rawURL),
              ["http", "https"].contains(url.scheme?.lowercased() ?? "")
        else {
            replyHandler(failure(id: id, code: "invalid_url", message: "Only HTTP and HTTPS URLs can be opened."), nil)
            return
        }

        UIApplication.shared.open(url, options: [:]) { opened in
            replyHandler(self.success(id: id, result: ["opened": opened]), nil)
        }
    }

    private func hostInfo() -> [String: Any] {
        let bundle = Bundle.main
        return [
            "platform": "ios",
            "bridgeVersion": Self.protocolVersion,
            "appVersion": bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown",
            "buildVersion": bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "unknown",
            "healthKitPipeline": "energy-v1",
            "notificationPipeline": "local-v1",
            "methods": Self.supportedMethods.sorted()
        ]
    }

    private func success(id: String, result: [String: Any]) -> [String: Any] {
        ["ok": true, "id": id, "result": result]
    }

    private func failure(id: String?, code: String, message: String) -> [String: Any] {
        var response: [String: Any] = [
            "ok": false,
            "error": ["code": code, "message": message]
        ]
        if let id { response["id"] = id }
        return response
    }
}
