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
    private lazy var localBackGesture = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(handleLocalBack(_:)))
    private var localBackAnimator: UIViewPropertyAnimator?
    private var localBackSnapshot: UIView?
    private var localBackTimeout: DispatchWorkItem?
    private var localBackGeneration = 0
    private var localBackTracking = false
    private var localBackCommitting = false
    private var localBackStartOffset: CGFloat = 0
    private var localBackRelease: (translation: CGPoint, velocity: CGPoint, cancelled: Bool)?
    private static let navigationTimeout: TimeInterval = 25
    static let localBackCommitScript = #"""
    const accepted = !window.dispatchEvent(new Event('evaorbit:native-back', {cancelable: true}));
    if (accepted) await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return accepted;
    """#
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
        webView.allowsBackForwardNavigationGestures = !hostConfiguration.localTrackers
        if hostConfiguration.localTrackers {
            localBackGesture.edges = .left
            localBackGesture.maximumNumberOfTouches = 1
            localBackGesture.delegate = self
            webView.addGestureRecognizer(localBackGesture)
            webView.scrollView.panGestureRecognizer.require(toFail: localBackGesture)
        }
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.keyboardDismissMode = .interactive
        disableLocalPageZoom()
        webView.isOpaque = false
        webView.backgroundColor = palette.loadingBackground
        webView.scrollView.backgroundColor = palette.loadingBackground
        if hostConfiguration.localTrackers {
            // React shares the Web pull gesture and refreshes data in place.
            // Keep overscroll from revealing the native loading background.
            webView.scrollView.bounces = false
            webView.scrollView.alwaysBounceVertical = false
        } else {
            webView.scrollView.refreshControl = UIRefreshControl()
            webView.scrollView.refreshControl?.addTarget(self, action: #selector(refresh), for: .valueChanged)
        }
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

    static func shouldCommitLocalBack(translation: CGPoint, velocity: CGPoint, width: CGFloat) -> Bool {
        guard width > 0, translation.x > 20, translation.x > abs(translation.y), velocity.x >= 0 else { return false }
        return translation.x >= width * 0.28 || velocity.x >= 600
    }

    static func localBackOffset(translation: CGFloat, startingOffset: CGFloat, width: CGFloat) -> CGFloat {
        min(max(0, width), max(0, startingOffset + translation))
    }

    private func resetLocalBackMotion() {
        localBackGeneration += 1
        localBackTimeout?.cancel()
        localBackTimeout = nil
        if localBackAnimator?.state == .active { localBackAnimator?.stopAnimation(true) }
        localBackAnimator = nil
        localBackSnapshot?.removeFromSuperview()
        localBackSnapshot = nil
        webView.transform = .identity
        localBackTracking = false
        localBackCommitting = false
        localBackRelease = nil
    }

    private func animateLocalBack(_ moving: UIView, to offset: CGFloat, velocity: CGFloat, completion: @escaping () -> Void) {
        let distance = offset - moving.transform.tx
        let relativeVelocity = abs(distance) > 1 ? velocity / distance : 0
        let timing = UISpringTimingParameters(dampingRatio: 1, initialVelocity: CGVector(dx: max(-10, min(10, relativeVelocity)), dy: 0))
        let reduceMotion = UIAccessibility.isReduceMotionEnabled, isLivePage = moving === webView
        let animator = reduceMotion
            ? UIViewPropertyAnimator(duration: 0.12, curve: .easeOut)
            : UIViewPropertyAnimator(duration: 0.28, timingParameters: timing)
        let generation = localBackGeneration
        animator.addAnimations {
            if reduceMotion { moving.alpha = isLivePage ? 1 : 0 }
            else { moving.transform = CGAffineTransform(translationX: offset, y: 0) }
        }
        animator.addCompletion { [weak self] position in
            guard let self, self.localBackGeneration == generation, position == .end else { return }
            completion()
        }
        localBackAnimator = animator
        animator.startAnimation()
    }

    private func finishLocalBack(translation: CGPoint, velocity: CGPoint, cancelled: Bool) {
        let offset = Self.localBackOffset(translation: translation.x, startingOffset: localBackStartOffset, width: webView.bounds.width)
        localBackTracking = false
        guard !cancelled, Self.shouldCommitLocalBack(translation: CGPoint(x: offset, y: translation.y), velocity: velocity, width: webView.bounds.width) else {
            animateLocalBack(webView, to: 0, velocity: velocity.x) { [weak self] in self?.resetLocalBackMotion() }
            return
        }
        localBackCommitting = true
        // Keep the departing pixels above the live page while React goes back.
        // The snapshot is transient and is never persisted or added to navigation history.
        if let snapshot = webView.snapshotView(afterScreenUpdates: false) {
            snapshot.frame = webView.bounds
            snapshot.transform = webView.transform
            view.insertSubview(snapshot, aboveSubview: webView)
            localBackSnapshot = snapshot
        }
        webView.transform = .identity
        let generation = localBackGeneration
        let timeout = DispatchWorkItem { [weak self] in
            guard let self, self.localBackGeneration == generation else { return }
            self.resetLocalBackMotion()
        }
        localBackTimeout = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8, execute: timeout)
        webView.callAsyncJavaScript(Self.localBackCommitScript, arguments: [:], in: nil, in: .page) { [weak self] result in
            guard let self, self.localBackGeneration == generation else { return }
            self.localBackTimeout?.cancel()
            self.localBackTimeout = nil
            if case .success(let accepted) = result, accepted as? Bool == true {
                if let snapshot = self.localBackSnapshot {
                    self.animateLocalBack(snapshot, to: self.webView.bounds.width, velocity: velocity.x) { [weak self] in self?.resetLocalBackMotion() }
                } else { self.resetLocalBackMotion() }
            } else {
                self.localBackSnapshot?.removeFromSuperview()
                self.localBackSnapshot = nil
                self.webView.transform = CGAffineTransform(translationX: UIAccessibility.isReduceMotionEnabled ? 0 : offset, y: 0)
                self.animateLocalBack(self.webView, to: 0, velocity: velocity.x) { [weak self] in self?.resetLocalBackMotion() }
            }
        }
    }

    @objc private func handleLocalBack(_ gesture: UIScreenEdgePanGestureRecognizer) {
        let translation = gesture.translation(in: view), velocity = gesture.velocity(in: view)
        switch gesture.state {
        case .began:
            // A new drag can grab a returning page at its current visible position.
            let offset = webView.layer.presentation()?.affineTransform().tx ?? webView.transform.tx
            resetLocalBackMotion()
            localBackStartOffset = offset
            webView.transform = CGAffineTransform(translationX: offset, y: 0)
            let generation = localBackGeneration
            let timeout = DispatchWorkItem { [weak self] in
                guard let self, self.localBackGeneration == generation else { return }
                self.resetLocalBackMotion()
            }
            localBackTimeout = timeout
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35, execute: timeout)
            webView.evaluateJavaScript("!window.dispatchEvent(new Event('evaorbit:native-back-start', {cancelable: true}))") { [weak self] accepted, _ in
                guard let self, self.localBackGeneration == generation else { return }
                self.localBackTimeout?.cancel()
                self.localBackTimeout = nil
                guard accepted as? Bool == true else { self.resetLocalBackMotion(); return }
                self.localBackTracking = true
                if let release = self.localBackRelease {
                    self.finishLocalBack(translation: release.translation, velocity: release.velocity, cancelled: release.cancelled)
                } else if !UIAccessibility.isReduceMotionEnabled {
                    let x = Self.localBackOffset(translation: gesture.translation(in: self.view).x, startingOffset: self.localBackStartOffset, width: self.webView.bounds.width)
                    self.webView.transform = CGAffineTransform(translationX: x, y: 0)
                }
            }
        case .changed:
            if localBackTracking && !UIAccessibility.isReduceMotionEnabled {
                let x = Self.localBackOffset(translation: translation.x, startingOffset: localBackStartOffset, width: webView.bounds.width)
                webView.transform = CGAffineTransform(translationX: x, y: 0)
            }
        case .ended, .cancelled, .failed:
            localBackRelease = (translation, velocity, gesture.state != .ended)
            if localBackTracking { finishLocalBack(translation: translation, velocity: velocity, cancelled: gesture.state != .ended) }
        default: break
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        resetLocalBackMotion()
    }

    override func viewWillTransition(to size: CGSize, with coordinator: UIViewControllerTransitionCoordinator) {
        resetLocalBackMotion()
        super.viewWillTransition(to: size, with: coordinator)
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

extension WebViewController: UIGestureRecognizerDelegate {
    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard gestureRecognizer === localBackGesture else { return true }
        guard !localBackCommitting, loadingCoordinator.state == .dismissed,
              let url = webView.url, hostConfiguration.allowsTrackerUI(url) else { return false }
        let velocity = localBackGesture.velocity(in: view)
        return velocity.x > 0 && velocity.x > abs(velocity.y)
    }
}

extension WebViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        resetLocalBackMotion()
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
        if hostConfiguration.localTrackers { resetLocalBackMotion() }
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
