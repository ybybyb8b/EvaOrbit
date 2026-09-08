import SwiftUI

struct NativeSettingsView: View {
    @ObservedObject var session: SessionModel
    @ObservedObject var permissions: PermissionModel
    let email: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("EVAORBIT")
                        .font(.caption2.weight(.bold))
                        .tracking(1.2)
                        .foregroundStyle(EOTheme.secondaryInk)
                    Text("设置")
                        .font(EOTheme.displayFont())
                        .foregroundStyle(EOTheme.ink)
                }

                PermissionView(model: permissions)

                VStack(alignment: .leading, spacing: 12) {
                    Text("账户")
                        .font(.caption.weight(.bold))
                        .tracking(0.8)
                        .foregroundStyle(EOTheme.secondaryInk)
                    EOCard {
                        VStack(alignment: .leading, spacing: 14) {
                            Label(email, systemImage: "person.crop.circle")
                                .font(.subheadline)
                                .foregroundStyle(EOTheme.ink)
                            if let error = session.errorMessage {
                                Label(error, systemImage: "exclamationmark.circle")
                                    .font(.footnote)
                                    .foregroundStyle(.red)
                            }
                            Divider()
                            Button(role: .destructive) {
                                Task { await session.signOut() }
                            } label: {
                                HStack {
                                    Text("退出登录")
                                    Spacer()
                                    if session.isWorking { ProgressView() }
                                }
                            }
                            .disabled(session.isWorking)
                        }
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 18)
            .padding(.bottom, 32)
        }
        .background(EOTheme.canvas.ignoresSafeArea())
        .navigationBarHidden(true)
        .task { await permissions.refresh() }
        .refreshable { await permissions.refresh() }
    }
}
