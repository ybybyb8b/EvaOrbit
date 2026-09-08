import SwiftUI

@main
struct EvaOrbitNativeApp: App {
    @StateObject private var permissions = PermissionModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            PermissionView(model: permissions)
                .task { await permissions.refresh() }
                .onChange(of: scenePhase) { phase in
                    guard phase == .active else { return }
                    Task { await permissions.refresh() }
                }
        }
    }
}
