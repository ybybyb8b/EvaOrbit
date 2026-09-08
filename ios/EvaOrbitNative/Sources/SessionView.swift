import SwiftUI

struct SessionView: View {
    @ObservedObject var session: SessionModel
    @ObservedObject var permissions: PermissionModel

    var body: some View {
        Group {
            switch session.phase {
            case .checking:
                ProgressView("正在检查登录状态…")
            case .signedOut:
                NavigationStack {
                    LoginView(model: session)
                }
            case let .signedIn(email):
                AuthenticatedView(session: session, permissions: permissions, email: email)
            }
        }
    }
}

private struct AuthenticatedView: View {
    @ObservedObject var session: SessionModel
    @ObservedObject var permissions: PermissionModel
    let email: String
    @StateObject private var dailyEnergy = DailyEnergyModel()

    var body: some View {
        TabView {
            NavigationStack {
                DailyEnergyView(model: dailyEnergy)
            }
            .tabItem { Label("Energy", systemImage: "bolt.heart") }

            NavigationStack {
                PermissionView(model: permissions)
                    .navigationTitle("Settings")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .navigationBarLeading) {
                            Text(email)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        ToolbarItem(placement: .navigationBarTrailing) {
                            Button("退出") { Task { await session.signOut() } }
                                .disabled(session.isWorking)
                        }
                    }
                    .task { await permissions.refresh() }
            }
            .tabItem { Label("Settings", systemImage: "gearshape") }
        }
    }
}

private struct LoginView: View {
    @ObservedObject var model: SessionModel

    var body: some View {
        Form {
            Section {
                TextField("邮箱", text: $model.email)
                    .keyboardType(.emailAddress)
                    .textContentType(.username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                SecureField("密码", text: $model.password)
                    .textContentType(.password)
                    .onSubmit { Task { await model.signIn() } }
            } header: {
                Text("登录 EvaOrbit")
            } footer: {
                Text("Native App 通过 Vercel 登录，不会直接连接 Supabase。")
            }

            if let error = model.errorMessage {
                Section {
                    Text(error)
                        .foregroundStyle(.red)
                        .accessibilityLabel("错误：\(error)")
                }
            }

            Section {
                Button {
                    Task { await model.signIn() }
                } label: {
                    HStack {
                        Spacer()
                        if model.isWorking {
                            ProgressView()
                        } else {
                            Text("登录")
                        }
                        Spacer()
                    }
                }
                .disabled(model.isWorking)

                Button("重新检查会话") { Task { await model.restore() } }
                    .disabled(model.isWorking)
            }
        }
        .navigationTitle("EvaOrbit Native")
    }
}
