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
        window.rootViewController = controller
        window.makeKeyAndVisible()
        self.window = window

        return true
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        healthKitCoordinator.applicationDidBecomeActive()
        (window?.rootViewController as? WebViewController)?.notifyApplicationDidBecomeActive()
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
