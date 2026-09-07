import UIKit
import WebKit

final class WebViewController: UIViewController {
    private let hostConfiguration: HostConfiguration
    private let bridge: NativeBridge
    private let webView: WKWebView
    private let palette: LoadingThemePalette
    private let loadingOverlay: LoadingOverlayView
    private var loadingCoordinator: LoadingExperienceCoordinator!
    private var navigationTimeoutWorkItem: DispatchWorkItem?
    private static let navigationTimeout: TimeInterval = 25

    init(configuration: HostConfiguration, healthKitCoordinator: HealthKitCoordinator, notificationManager: NotificationManager) {
        let nativeBridge = NativeBridge(hostConfiguration: configuration, healthKitCoordinator: healthKitCoordinator, notificationManager: notificationManager)
        let themePalette = LoadingThemePalette.current()
        hostConfiguration = configuration
        bridge = nativeBridge
        palette = themePalette
        loadingOverlay = LoadingOverlayView(palette: themePalette)

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
        loadingCoordinator = LoadingExperienceCoordinator(presenter: loadingOverlay)
        loadingOverlay.onRetry = { [weak self] in self?.retryFromFailure() }
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
        view.backgroundColor = palette.loadingBackground
        configureWebView()
        configureLoadingOverlay()
        loadingCoordinator.startColdLaunch()
        loadEvaOrbit()
    }

    private func configureWebView() {
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.keyboardDismissMode = .interactive
        webView.isOpaque = false
        webView.backgroundColor = palette.loadingBackground
        webView.scrollView.backgroundColor = palette.loadingBackground
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

    private func configureLoadingOverlay() {
        loadingOverlay.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(loadingOverlay)
        NSLayoutConstraint.activate([
            loadingOverlay.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            loadingOverlay.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            loadingOverlay.topAnchor.constraint(equalTo: view.topAnchor),
            loadingOverlay.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }

    private func loadEvaOrbit() {
        webView.load(URLRequest(url: hostConfiguration.baseURL, cachePolicy: .reloadRevalidatingCacheData))
    }

    @objc private func refresh() {
        loadingCoordinator.beginRecovery()
        if webView.url == nil {
            loadEvaOrbit()
        } else {
            webView.reload()
        }
    }

    private func retryFromFailure() {
        loadingCoordinator.beginRecovery()
        if webView.url == nil { loadEvaOrbit() } else { webView.reload() }
    }

    private func startNavigationTimeout() {
        navigationTimeoutWorkItem?.cancel()
        let workItem = DispatchWorkItem { [weak self] in
            guard let self, self.webView.isLoading else { return }
            self.webView.stopLoading()
            self.webView.scrollView.refreshControl?.endRefreshing()
            self.loadingCoordinator.fail()
        }
        navigationTimeoutWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.navigationTimeout, execute: workItem)
    }

    private func finishNavigationAttempt() {
        navigationTimeoutWorkItem?.cancel()
        navigationTimeoutWorkItem = nil
        webView.scrollView.refreshControl?.endRefreshing()
    }

    private func openOutsideApp(_ url: URL) {
        UIApplication.shared.open(url)
    }
}

extension WebViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        startNavigationTimeout()
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        webView.backgroundColor = palette.loadingBackground
    }

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
        finishNavigationAttempt()
        loadingCoordinator.webViewDidBecomeReady()
    }

    func notifyApplicationDidBecomeActive() {
        webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('evaorbit:native-active'))")
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        finishNavigationAttempt()
        guard (error as? URLError)?.code != .cancelled else { return }
        loadingCoordinator.fail()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        finishNavigationAttempt()
        guard (error as? URLError)?.code != .cancelled else { return }
        loadingCoordinator.fail()
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        loadingCoordinator.beginRecovery()
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
