import SwiftUI

struct PermissionView: View {
    @ObservedObject var model: PermissionModel

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("EvaOrbit Native")
                            .font(.largeTitle.bold())
                        Text("SwiftUI 基础环境")
                            .foregroundStyle(.secondary)
                    }

                    PermissionCard(
                        title: "Notifications",
                        detail: notificationDetail,
                        buttonTitle: notificationButtonTitle,
                        buttonDisabled: model.isWorking || model.notifications.authorization == .loading,
                        action: { Task { await model.requestNotifications() } }
                    )

                    PermissionCard(
                        title: "Apple Health",
                        detail: healthDetail,
                        buttonTitle: model.health.authorizationRequested ? "再次请求" : "连接 Apple Health",
                        buttonDisabled: model.isWorking || !model.health.available,
                        action: { Task { await model.requestHealthAuthorization() } }
                    )

                    if let error = model.errorMessage {
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(.red)
                            .accessibilityLabel("错误：\(error)")
                    }

                    Text("权限只会在点击按钮后请求。本阶段不会调度通知，也不会读取或上传健康数据。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .padding(20)
            }
            .background(Color(uiColor: .systemGroupedBackground))
        }
    }

    private var notificationDetail: String {
        let permission: String
        switch model.notifications.authorization {
        case .loading: permission = "正在读取状态"
        case .notDetermined: permission = "尚未请求"
        case .denied: permission = "已拒绝"
        case .authorized: permission = "已授权"
        case .provisional: permission = "临时授权"
        case .ephemeral: permission = "短期授权"
        }
        return "\(permission) · 横幅\(model.notifications.alertsEnabled ? "开启" : "关闭") · 声音\(model.notifications.soundsEnabled ? "开启" : "关闭") · 不使用角标"
    }

    private var notificationButtonTitle: String {
        switch model.notifications.authorization {
        case .notDetermined, .loading: return "请求通知权限"
        case .denied: return "打开系统设置"
        case .authorized, .provisional, .ephemeral:
            return model.notifications.alertsEnabled && model.notifications.soundsEnabled ? "打开系统设置" : "检查系统设置"
        }
    }
}

private struct PermissionCard: View {
    let title: String
    let detail: String
    let buttonTitle: String
    let buttonDisabled: Bool
    let action: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title)
                .font(.title3.bold())
            Text(detail)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Button(buttonTitle, action: action)
                .buttonStyle(.borderedProminent)
                .disabled(buttonDisabled)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(.background, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

}
