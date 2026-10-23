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
    private var launchURL: URL?
    private var awaitingLocalContent = false
    private var navigationAttempt = 0
    private static let navigationTimeout: TimeInterval = 25
    static let localContentReadyScript = #"""
    await new Promise(resolve => {
      const ready = () => document.querySelector('[data-local-launch-ready="true"]');
      if (ready()) { resolve(); return; }
      const observer = new MutationObserver(() => {
        if (ready()) { observer.disconnect(); resolve(); }
      });
      observer.observe(document.documentElement, {subtree: true, childList: true, attributes: true, attributeFilter: ['data-local-launch-ready']});
    });
    // Allow the ready React tree to reach a rendered frame before dismissal.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return true;
    """#
    static let localViewportScript = #"""
    (() => {
      let viewport = document.querySelector('meta[name="viewport"]');
      if (!viewport) {
        viewport = document.createElement('meta');
        viewport.name = 'viewport';
        document.head.appendChild(viewport);
      }
      viewport.content = 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
    })();
    """#

    init(configuration: HostConfiguration, healthKitCoordinator: HealthKitCoordinator, notificationManager: NotificationManager, eventKitSyncEngine: EventKitSyncEngine) {
        let nativeBridge = NativeBridge(hostConfiguration: configuration, healthKitCoordinator: healthKitCoordinator, notificationManager: notificationManager, eventKitSyncEngine: eventKitSyncEngine)
        let themePalette = LoadingThemePalette.current()
        hostConfiguration = configuration
        bridge = nativeBridge
        palette = themePalette
        loadingOverlay = LoadingOverlayView(palette: themePalette, launchStyle: configuration.localTrackers ? .local : .web)

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
        if configuration.localTrackers {
            webConfiguration.ignoresViewportScaleLimits = false
            userContentController.addUserScript(WKUserScript(
                source: Self.localViewportScript,
                injectionTime: .atDocumentEnd,
                forMainFrameOnly: true
            ))
        }
        if configuration.localTrackers, let root = Bundle.main.url(forResource: "TrackerWeb", withExtension: nil) {
            webConfiguration.setURLSchemeHandler(TrackerAssetHandler(root: root), forURLScheme: TrackerAssetHandler.scheme)
        }
        webConfiguration.websiteDataStore = .default()
        webConfiguration.userContentController = userContentController
        webConfiguration.applicationNameForUserAgent = "EvaOrbitNative/0.1"
        webConfiguration.defaultWebpagePreferences.allowsContentJavaScript = true
        webView = WKWebView(frame: .zero, configuration: webConfiguration)

        super.init(nibName: nil, bundle: nil)
        nativeBridge.onDataChanged = { [weak self] domains, source in
            self?.notifyDataChanged(domains: domains, source: source)
        }
        healthKitCoordinator.onReadDataUploaded = { [weak self] in
            self?.notifyDataChanged(domains: ["health"], source: "healthkit")
        }
        loadingCoordinator = LoadingExperienceCoordinator(presenter: loadingOverlay, waitsForIntro: configuration.localTrackers)
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
        disableLocalPageZoom()
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

    private func disableLocalPageZoom() {
        guard hostConfiguration.localTrackers else { return }
        webView.scrollView.pinchGestureRecognizer?.isEnabled = false
    }

    private func loadEvaOrbit() {
        let initial = hostConfiguration.localTrackers ? hostConfiguration.trackerDevelopmentURL ?? TrackerAssetHandler.entryURL : hostConfiguration.baseURL
        webView.load(URLRequest(url: launchURL ?? initial, cachePolicy: .reloadRevalidatingCacheData))
    }

    @discardableResult
    func openDeepLink(_ deepLink: URL) -> Bool {
        guard let target = hostConfiguration.navigationURL(for: deepLink) else { return false }
        launchURL = target
        if isViewLoaded {
            loadingCoordinator.beginRecovery()
            webView.load(URLRequest(url: target, cachePolicy: .reloadRevalidatingCacheData))
        }
        return true
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
        navigationAttempt += 1
        awaitingLocalContent = hostConfiguration.localTrackers
        let workItem = DispatchWorkItem { [weak self] in
            guard let self, self.webView.isLoading || self.awaitingLocalContent else { return }
            self.awaitingLocalContent = false
            self.webView.stopLoading()
            self.webView.scrollView.refreshControl?.endRefreshing()
            self.loadingCoordinator.fail()
        }
        navigationTimeoutWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.navigationTimeout, execute: workItem)
    }

    private func finishNavigationAttempt() {
        awaitingLocalContent = false
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

        if url.absoluteString == "about:blank" || hostConfiguration.allows(url) || hostConfiguration.allowsTrackerUI(url) {
            decisionHandler(.allow)
            return
        }

        if let scheme = url.scheme?.lowercased(), ["http", "https", "mailto", "tel"].contains(scheme) {
            openOutsideApp(url)
        }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // WebKit may create or re-enable its recognizer while loading a document.
        disableLocalPageZoom()
        guard hostConfiguration.localTrackers else {
            finishNavigationAttempt()
            loadingCoordinator.webViewDidBecomeReady()
            return
        }
        let attempt = navigationAttempt
        webView.callAsyncJavaScript(Self.localContentReadyScript, arguments: [:], in: nil, in: .page) { [weak self] result in
            guard let self, self.navigationAttempt == attempt, self.awaitingLocalContent else { return }
            self.finishNavigationAttempt()
            switch result {
            case .success:
                self.loadingCoordinator.webViewDidBecomeReady()
            case .failure:
                self.loadingCoordinator.fail()
            }
        }
    }

    func notifyApplicationDidBecomeActive() {
        webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('evaorbit:native-active'))")
    }

    func notifyEventKitStoreChanged() {
        webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('evaorbit:eventkit-store-changed'))")
    }

    func notifyDataChanged(domains: [String], source: String) {
        guard let url = webView.url, (hostConfiguration.allows(url) || hostConfiguration.allowsTrackerUI(url)),
              let accepted = NativeBridge.dataChangeDomains(domains), ["eventkit", "healthkit"].contains(source),
              let data = try? JSONSerialization.data(withJSONObject: ["domains": accepted, "source": source]),
              let detail = String(data: data, encoding: .utf8) else { return }
        // Completion notification only; never emits native-active or eventkit-store-changed.
        webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('eo:data-changed', { detail: \(detail) }))")
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
