import SwiftUI

struct SessionView: View {
    @ObservedObject var session: SessionModel
    @ObservedObject var permissions: PermissionModel

    var body: some View {
        Group {
            switch session.phase {
            case .checking:
                SessionCheckingView()
            case .signedOut:
                LoginView(model: session)
            case let .signedIn(email):
                AuthenticatedView(session: session, permissions: permissions, email: email)
            }
        }
        .tint(EOTheme.accent)
    }
}

private enum AppTab: Hashable {
    case home
    case health
    case settings
}

private struct AuthenticatedView: View {
    @ObservedObject var session: SessionModel
    @ObservedObject var permissions: PermissionModel
    let email: String
    @StateObject private var dailyEnergy = DailyEnergyModel()
    @State private var selectedTab = AppTab.home

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack {
                NativeHomeView(
                    dailyEnergy: dailyEnergy,
                    openEnergy: { selectedTab = .health },
                    openSettings: { selectedTab = .settings }
                )
            }
            .tag(AppTab.home)
            .tabItem { Label("首页", systemImage: "house") }

            NavigationStack {
                DailyEnergyView(model: dailyEnergy)
            }
            .tag(AppTab.health)
            .tabItem { Label("体征", systemImage: "heart.text.square") }

            NavigationStack {
                NativeSettingsView(session: session, permissions: permissions, email: email)
            }
            .tag(AppTab.settings)
            .tabItem { Label("设置", systemImage: "slider.horizontal.3") }
        }
        .toolbarBackground(.ultraThinMaterial, for: .tabBar)
        .toolbarBackground(.visible, for: .tabBar)
    }
}

private struct SessionCheckingView: View {
    var body: some View {
        ZStack {
            EOTheme.canvas.ignoresSafeArea()
            VStack(spacing: 16) {
                Image(systemName: "circle.hexagongrid.fill")
                    .font(.system(size: 38, weight: .light))
                    .foregroundStyle(EOTheme.accent)
                ProgressView()
                    .tint(EOTheme.accent)
                Text("正在进入 EvaOrbit…")
                    .font(.subheadline)
                    .foregroundStyle(EOTheme.secondaryInk)
            }
        }
    }
}

private struct LoginView: View {
    @ObservedObject var model: SessionModel

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("MY QUIET SPACE")
                            .font(.caption2.weight(.bold))
                            .tracking(1.4)
                            .foregroundStyle(EOTheme.secondaryInk)
                        Text("EvaOrbit")
                            .font(EOTheme.displayFont())
                            .foregroundStyle(EOTheme.ink)
                        Text("登录你的私人空间")
                            .font(.subheadline)
                            .foregroundStyle(EOTheme.secondaryInk)
                    }

                    EOCard {
                        VStack(spacing: 14) {
                            Label {
                                TextField("邮箱", text: $model.email)
                                    .keyboardType(.emailAddress)
                                    .textContentType(.username)
                                    .textInputAutocapitalization(.never)
                                    .autocorrectionDisabled()
                            } icon: {
                                Image(systemName: "envelope")
                                    .foregroundStyle(EOTheme.secondaryInk)
                            }
                            .padding(14)
                            .background(EOTheme.raised, in: RoundedRectangle(cornerRadius: EOTheme.controlRadius, style: .continuous))

                            Label {
                                SecureField("密码", text: $model.password)
                                    .textContentType(.password)
                                    .onSubmit { Task { await model.signIn() } }
                            } icon: {
                                Image(systemName: "lock")
                                    .foregroundStyle(EOTheme.secondaryInk)
                            }
                            .padding(14)
                            .background(EOTheme.raised, in: RoundedRectangle(cornerRadius: EOTheme.controlRadius, style: .continuous))

                            if let error = model.errorMessage {
                                Label(error, systemImage: "exclamationmark.circle")
                                    .font(.footnote)
                                    .foregroundStyle(.red)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .accessibilityLabel("错误：\(error)")
                            }

                            Button {
                                Task { await model.signIn() }
                            } label: {
                                HStack {
                                    Spacer()
                                    if model.isWorking { ProgressView().tint(EOTheme.accentOn) }
                                    else { Text("登录").fontWeight(.semibold) }
                                    Spacer()
                                }
                                .padding(.vertical, 14)
                            }
                            .buttonStyle(.plain)
                            .foregroundStyle(EOTheme.accentOn)
                            .background(EOTheme.accent, in: RoundedRectangle(cornerRadius: EOTheme.controlRadius, style: .continuous))
                            .disabled(model.isWorking)

                            Button("重新检查已有会话") {
                                Task { await model.restore() }
                            }
                            .font(.footnote.weight(.medium))
                            .foregroundStyle(EOTheme.secondaryInk)
                            .disabled(model.isWorking)
                        }
                    }

                    Text("通过 Vercel 安全登录；App 不会直接连接 Supabase。")
                        .font(.footnote)
                        .foregroundStyle(EOTheme.secondaryInk)
                        .frame(maxWidth: .infinity, alignment: .center)
                }
                .padding(.horizontal, 20)
                .padding(.top, 64)
                .padding(.bottom, 32)
            }
            .background(EOTheme.canvas.ignoresSafeArea())
            .navigationBarHidden(true)
        }
    }
}
