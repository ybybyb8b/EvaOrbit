import SwiftUI

struct PermissionView: View {
    @ObservedObject var model: PermissionModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("原生能力")
                .font(.caption.weight(.bold))
                .tracking(0.8)
                .foregroundStyle(EOTheme.secondaryInk)

            PermissionCard(
                icon: "bell.badge",
                title: "通知",
                detail: notificationDetail,
                buttonTitle: notificationButtonTitle,
                buttonDisabled: model.isWorking || model.notifications.authorization == .loading,
                action: { Task { await model.requestNotifications() } }
            )

            PermissionCard(
                icon: "heart.fill",
                title: "Apple Health",
                detail: healthDetail,
                buttonTitle: model.health.authorizationRequested ? "再次请求" : "连接 Apple Health",
                buttonDisabled: model.isWorking || !model.health.available,
                action: { Task { await model.requestHealthAuthorization() } }
            )

            if let error = model.errorMessage {
                Label(error, systemImage: "exclamationmark.circle")
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .accessibilityLabel("错误：\(error)")
            }

            Text("只有在你点击按钮时才会请求系统权限。通知不使用角标；健康数据保持只读。")
                .font(.footnote)
                .foregroundStyle(EOTheme.secondaryInk)
                .padding(.horizontal, 4)
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
        return "\(permission) · 横幅\(model.notifications.alertsEnabled ? "开启" : "关闭") · 声音\(model.notifications.soundsEnabled ? "开启" : "关闭")"
    }

    private var notificationButtonTitle: String {
        switch model.notifications.authorization {
        case .notDetermined, .loading: return "请求权限"
        case .denied: return "打开系统设置"
        case .authorized, .provisional, .ephemeral: return "管理通知"
        }
    }

    private var healthDetail: String {
        guard model.health.available else { return "这台设备不支持 Apple Health" }
        return model.health.authorizationRequested
            ? "授权流程已完成 · 活动与静息能量只读"
            : "尚未请求 · 活动与静息能量只读"
    }
}

private struct PermissionCard: View {
    let icon: String
    let title: String
    let detail: String
    let buttonTitle: String
    let buttonDisabled: Bool
    let action: () -> Void

    var body: some View {
        EOCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 12) {
                    Image(systemName: icon)
                        .font(.headline)
                        .foregroundStyle(EOTheme.accent)
                        .frame(width: 40, height: 40)
                        .background(EOTheme.tint, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    VStack(alignment: .leading, spacing: 3) {
                        Text(title)
                            .font(.headline)
                            .foregroundStyle(EOTheme.ink)
                        Text(detail)
                            .font(.caption)
                            .foregroundStyle(EOTheme.secondaryInk)
                    }
                }
                Button(buttonTitle, action: action)
                    .buttonStyle(.bordered)
                    .tint(EOTheme.accent)
                    .disabled(buttonDisabled)
            }
        }
    }
}
