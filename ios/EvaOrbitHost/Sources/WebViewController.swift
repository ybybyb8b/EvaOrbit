import UIKit
import WebKit

final class WebViewController: UIViewController {
    private let hostConfiguration: HostConfiguration
    private let bridge: NativeBridge
    private let webView: WKWebView
    private let failureView = UIView()
    private let failureLabel = UILabel()
    private let retryButton = UIButton(type: .system)

    init(configuration: HostConfiguration, healthKitCoordinator: HealthKitCoordinator) {
        let nativeBridge = NativeBridge(hostConfiguration: configuration, healthKitCoordinator: healthKitCoordinator)
        hostConfiguration = configuration
        bridge = nativeBridge

        let userContentController = WKUserContentController()
        userContentController.addUserScript(WKUserScript(
            source: NativeBridge.bootstrapScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true,
            in: .page
        ))
        userContentController.addScriptMessageHandler(
            nativeBridge,
            contentWorld: .page,
            name: NativeBridge.name
        )

        let webConfiguration = WKWebViewConfiguration()
        webConfiguration.websiteDataStore = .default()
        webConfiguration.userContentController = userContentController
        webConfiguration.applicationNameForUserAgent = "EvaOrbitNative/0.1"
        webConfiguration.defaultWebpagePreferences.allowsContentJavaScript = true
        webView = WKWebView(frame: .zero, configuration: webConfiguration)

        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    deinit {
        webView.configuration.userContentController.removeScriptMessageHandler(
            forName: NativeBridge.name,
            contentWorld: .page
        )
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 245 / 255, green: 242 / 255, blue: 233 / 255, alpha: 1)
        configureWebView()
        configureFailureView()
        loadEvaOrbit()
    }

    private func configureWebView() {
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.keyboardDismissMode = .interactive
        webView.scrollView.refreshControl = UIRefreshControl()
        webView.scrollView.refreshControl?.addTarget(self, action: #selector(refresh), for: .valueChanged)
        view.addSubview(webView)

        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
    }

    private func configureFailureView() {
        failureView.translatesAutoresizingMaskIntoConstraints = false
        failureView.backgroundColor = view.backgroundColor
        failureView.isHidden = true

        failureLabel.translatesAutoresizingMaskIntoConstraints = false
        failureLabel.text = "EvaOrbit 暂时无法连接"
        failureLabel.textAlignment = .center
        failureLabel.textColor = .secondaryLabel
        failureLabel.font = .preferredFont(forTextStyle: .headline)

        retryButton.translatesAutoresizingMaskIntoConstraints = false
        retryButton.setTitle("重试", for: .normal)
        retryButton.addTarget(self, action: #selector(retry), for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [failureLabel, retryButton])
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 16
        failureView.addSubview(stack)
        view.addSubview(failureView)

        NSLayoutConstraint.activate([
            failureView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            failureView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            failureView.topAnchor.constraint(equalTo: view.topAnchor),
            failureView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            stack.centerXAnchor.constraint(equalTo: failureView.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: failureView.centerYAnchor)
        ])
    }

    private func loadEvaOrbit() {
        failureView.isHidden = true
        webView.load(URLRequest(url: hostConfiguration.baseURL, cachePolicy: .reloadRevalidatingCacheData))
    }

    @objc private func refresh() {
        if webView.url == nil {
            loadEvaOrbit()
        } else {
            webView.reload()
        }
    }

    @objc private func retry() {
        loadEvaOrbit()
    }

    private func showFailure() {
        webView.scrollView.refreshControl?.endRefreshing()
        failureView.isHidden = false
        view.bringSubviewToFront(failureView)
    }

    private func openOutsideApp(_ url: URL) {
        UIApplication.shared.open(url)
    }
}

extension WebViewController: WKNavigationDelegate {
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }

        if url.absoluteString == "about:blank" || hostConfiguration.allows(url) {
            decisionHandler(.allow)
            return
        }

        if let scheme = url.scheme?.lowercased(), ["http", "https", "mailto", "tel"].contains(scheme) {
            openOutsideApp(url)
        }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.scrollView.refreshControl?.endRefreshing()
        failureView.isHidden = true
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showFailure()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showFailure()
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }
}

extension WebViewController: WKUIDelegate {
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        guard navigationAction.targetFrame == nil, let url = navigationAction.request.url else { return nil }
        if hostConfiguration.allows(url) {
            webView.load(navigationAction.request)
        } else {
            openOutsideApp(url)
        }
        return nil
    }
}
