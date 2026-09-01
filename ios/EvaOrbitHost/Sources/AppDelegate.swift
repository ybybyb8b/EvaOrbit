import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    private let healthKitCoordinator: HealthKitCoordinator

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
        healthKitCoordinator.restoreAtLaunch()
        window.rootViewController = WebViewController(configuration: .production, healthKitCoordinator: healthKitCoordinator)
        window.makeKeyAndVisible()
        self.window = window

        return true
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        healthKitCoordinator.applicationDidBecomeActive()
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
