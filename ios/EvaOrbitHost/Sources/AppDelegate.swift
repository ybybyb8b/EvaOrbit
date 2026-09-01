import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = WebViewController(configuration: .production)
        window.makeKeyAndVisible()
        self.window = window

        // HealthKit observers must be registered from this launch path when the
        // second phase adds native collection and background delivery.
        return true
    }
}
