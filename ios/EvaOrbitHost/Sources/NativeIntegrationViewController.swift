import UIKit
import WebKit

// Reuse the verified online settings and bridge. Its cookies are isolated from
// the local shell; account changes remain locked until this panel closes.
final class NativeIntegrationViewController: UIViewController, WKNavigationDelegate, UIAdaptivePresentationControllerDelegate {
    static let paths: Set<String> = ["/settings/health-native", "/settings/apple-integration", "/settings/notifications"]
    private let configuration: HostConfiguration
    private let target: URL
    private let cookies: [HTTPCookie]
    private let bridge: NativeBridge
    private let webView: WKWebView
    private var closed = false
    var onClose: (() -> Void)?

    static func allows(_ url: URL, configuration: HostConfiguration) -> Bool {
        configuration.allows(url) && url.user == nil && url.password == nil && paths.contains(url.path) && url.query == nil && url.fragment == nil
    }

    init(configuration: HostConfiguration, target: URL, cookies: [HTTPCookie], bridge: NativeBridge) {
        self.configuration = configuration; self.target = target; self.cookies = cookies; self.bridge = bridge
        let content = WKUserContentController()
        content.addUserScript(WKUserScript(source: NativeBridge.bootstrapScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        // This is a settings panel, not another app shell. Keep its exits and
        // account changes in UIKit, including Next's client-side link handling.
        content.addUserScript(WKUserScript(source: #"""
        document.addEventListener('click', function(e) {
          const a=e.target.closest&&e.target.closest('a[href]'); if(!a)return;
          const u=new URL(a.href,location.href);
          if(u.origin!==location.origin||!['/settings/health-native','/settings/apple-integration','/settings/notifications'].includes(u.pathname)) {e.preventDefault();e.stopImmediatePropagation();}
        },true);
        document.addEventListener('DOMContentLoaded',function(){const s=document.createElement('style');s.textContent='.sidebar,.mobile-nav,.mobile-global-header,.desktop-page-navigation,.home-quick-log-trigger,.eva-wake-desktop,.eva-wake-button{display:none!important}.main-content{margin-left:0!important;padding-top:0!important}.app-shell{padding-bottom:24px!important}';document.head.appendChild(s);});
        """#, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        content.addScriptMessageHandler(bridge, contentWorld: .page, name: NativeBridge.name)
        let settings = WKWebViewConfiguration()
        settings.websiteDataStore = .nonPersistent()
        settings.userContentController = content
        settings.applicationNameForUserAgent = "EvaOrbitNative/0.1"
        webView = WKWebView(frame: .zero, configuration: settings)
        super.init(nibName: nil, bundle: nil)
    }
    @available(*, unavailable) required init?(coder: NSCoder) { fatalError() }
    deinit { webView.configuration.userContentController.removeScriptMessageHandler(forName: NativeBridge.name, contentWorld: .page) }
    override func viewDidLoad() {
        super.viewDidLoad(); view.backgroundColor = .systemBackground
        navigationItem.rightBarButtonItem = UIBarButtonItem(barButtonSystemItem: .done, target: self, action: #selector(close))
        webView.navigationDelegate = self; webView.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(webView)
        NSLayoutConstraint.activate([webView.leadingAnchor.constraint(equalTo: view.leadingAnchor), webView.trailingAnchor.constraint(equalTo: view.trailingAnchor), webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor), webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)])
        Task { @MainActor in
            // Prevent a stale/expired panel from opening a second login session.
            let rules = #"[{"trigger":{"url-filter":".*/(login|api/native/session)([/?].*)?$"},"action":{"type":"block"}}]"#
            do {
                let list: WKContentRuleList = try await withCheckedThrowingContinuation { continuation in
                    WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "eo-native-settings-auth-boundary", encodedContentRuleList: rules) { value, error in
                        if let value { continuation.resume(returning: value) }
                        else { continuation.resume(throwing: error ?? NSError(domain: "EvaOrbitNativeSettings", code: 1)) }
                    }
                }
                webView.configuration.userContentController.add(list)
                for cookie in cookies { await webView.configuration.websiteDataStore.httpCookieStore.setCookie(cookie) }
                guard !closed else { return }
                webView.load(URLRequest(url: target, cachePolicy: .reloadIgnoringLocalCacheData))
            } catch { showError() }
        }
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard action.targetFrame?.isMainFrame == true, let url = action.request.url, Self.allows(url, configuration: configuration) else { decisionHandler(.cancel); return }
        decisionHandler(.allow)
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { showError() }
    private func showError() {
        let label = UILabel(); label.text = "Unable to open native settings. Close this panel and reconnect your account."; label.numberOfLines = 0; label.textAlignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(label)
        NSLayoutConstraint.activate([label.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24), label.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24), label.centerYAnchor.constraint(equalTo: view.centerYAnchor)])
    }
    @objc private func close() { dismiss(animated: true) { self.finish() } }
    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) { finish() }
    private func finish() { guard !closed else { return }; closed = true; webView.stopLoading(); onClose?(); onClose = nil }
}
