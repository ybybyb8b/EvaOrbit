import SwiftUI

@main
struct EvaOrbitNativeApp: App {
    @StateObject private var session = SessionModel()
    @StateObject private var permissions = PermissionModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            SessionView(session: session, permissions: permissions)
                .task { await session.restore() }
                .onChange(of: scenePhase) { phase in
                    guard phase == .active else { return }
                    Task {
                        await session.refreshIfSignedIn()
                        await permissions.refresh()
                    }
                }
        }
    }
}
