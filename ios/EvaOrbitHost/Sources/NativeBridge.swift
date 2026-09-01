import UIKit
import WebKit

final class NativeBridge: NSObject, WKScriptMessageHandlerWithReply {
    static let name = "evaOrbit"
    static let protocolVersion = 1

    static let bootstrapScript = #"""
    (() => {
      if (window.EvaOrbitNative) return;
      let sequence = 0;
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

    init(hostConfiguration: HostConfiguration) {
        self.hostConfiguration = hostConfiguration
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
        switch method {
        case "host.ping":
            replyHandler(success(id: identifier, result: ["pong": true]), nil)
        case "host.getInfo":
            replyHandler(success(id: identifier, result: hostInfo()), nil)
        case "navigation.openExternal":
            openExternal(parameters: parameters, id: identifier, replyHandler: replyHandler)
        default:
            replyHandler(failure(id: identifier, code: "unknown_method", message: "Unsupported native method."), nil)
        }
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
            "healthKitPipeline": "reserved"
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
