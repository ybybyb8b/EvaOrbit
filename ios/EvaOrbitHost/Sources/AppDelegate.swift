import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    private let healthKitCoordinator: HealthKitCoordinator
    private let notificationManager = NotificationManager()
    private let eventKitSyncEngine = EventKitSyncEngine()

    override init() {
        let store = try! HealthLocalStore()
        let credentialStore = HealthCredentialStore()
        let uploader = HealthUploadManager(store: store, credentialStore: credentialStore)
        healthKitCoordinator = HealthKitCoordinator(healthKit: SystemHealthKitClient(), store: store, uploader: uploader)
        super.init()
    }

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.overrideUserInterfaceStyle = NativeLoadingTheme.currentAppearanceMode.interfaceStyle
        healthKitCoordinator.restoreAtLaunch()
        let controller = WebViewController(configuration: .production, healthKitCoordinator: healthKitCoordinator, notificationManager: notificationManager, eventKitSyncEngine: eventKitSyncEngine)
        eventKitSyncEngine.onStoreChanged = { [weak controller] in controller?.notifyEventKitStoreChanged() }
        if let url = launchOptions?[.url] as? URL { controller.openDeepLink(url) }
        window.rootViewController = controller
        window.makeKeyAndVisible()
        self.window = window

        #if DEBUG || PARLOR_SUBSCRIPTION_POC
        // Explicit experimental package / Xcode opt-in; no web bridge or provider changes.
        if HostConfiguration.production.localTrackers,
           ProcessInfo.processInfo.arguments.contains("--parlor-subscription-poc") ||
           Bundle.main.object(forInfoDictionaryKey: "EvaOrbitSubscriptionPoCEnabled") as? String == "YES" {
            controller.openDeepLink(URL(string: "evaorbit-trackers-poc://open/ai")!)
            DispatchQueue.main.async {
                controller.present(UINavigationController(rootViewController: SIWCViewController()), animated: false)
            }
        }
        #endif

        return true
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        healthKitCoordinator.applicationDidBecomeActive()
        (window?.rootViewController as? WebViewController)?.notifyApplicationDidBecomeActive()
    }

    func application(_ application: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return (window?.rootViewController as? WebViewController)?.openDeepLink(url) ?? false
    }

    func application(
        _ application: UIApplication,
        handleEventsForBackgroundURLSession identifier: String,
        completionHandler: @escaping () -> Void
    ) {
        guard identifier == HealthUploadManager.sessionIdentifier else {
            completionHandler()
            return
        }
        healthKitCoordinator.handleBackgroundSessionEvents(completionHandler: completionHandler)
    }
}
