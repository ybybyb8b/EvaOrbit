import UIKit
import UserNotifications

enum NativeNotificationPermission: String {
    case notDetermined = "not_determined"
    case denied
    case authorized
    case provisional
    case ephemeral

    init(_ status: UNAuthorizationStatus) {
        switch status {
        case .notDetermined: self = .notDetermined
        case .denied: self = .denied
        case .authorized: self = .authorized
        case .provisional: self = .provisional
        case .ephemeral: self = .ephemeral
        @unknown default: self = .denied
        }
    }

    var canSchedule: Bool {
        switch self {
        case .authorized, .provisional, .ephemeral: return true
        case .notDetermined, .denied: return false
        }
    }
}

struct NativePendingNotification: Equatable {
    let identifier: String
    let triggerAt: Date?

    var dictionary: [String: Any] {
        var value: [String: Any] = ["id": identifier]
        if let triggerAt { value["triggerAt"] = ISO8601DateFormatter.evaOrbit.string(from: triggerAt) }
        return value
    }
}

protocol LocalNotificationCenter: AnyObject {
    func authorizationStatus() async -> UNAuthorizationStatus
    func requestAuthorization(options: UNAuthorizationOptions) async throws -> Bool
    func add(_ request: UNNotificationRequest) async throws
    func pendingRequests() async -> [UNNotificationRequest]
    func removePendingNotificationRequests(withIdentifiers identifiers: [String])
}

final class SystemLocalNotificationCenter: LocalNotificationCenter {
    private let center: UNUserNotificationCenter

    init(center: UNUserNotificationCenter = .current()) {
        self.center = center
    }

    func authorizationStatus() async -> UNAuthorizationStatus {
        let settings = await center.notificationSettings()
        return settings.authorizationStatus
    }

    func requestAuthorization(options: UNAuthorizationOptions) async throws -> Bool {
        try await center.requestAuthorization(options: options)
    }

    func add(_ request: UNNotificationRequest) async throws {
        try await center.add(request)
    }

    func pendingRequests() async -> [UNNotificationRequest] {
        await center.pendingNotificationRequests()
    }

    func removePendingNotificationRequests(withIdentifiers identifiers: [String]) {
        center.removePendingNotificationRequests(withIdentifiers: identifiers)
    }
}

final class NotificationManager: NSObject, UNUserNotificationCenterDelegate {
    static let reminderIdentifierPrefix = "evaorbit-reminder-"
    static let testIdentifierPrefix = "evaorbit-test-"

    private let center: LocalNotificationCenter

    init(center: LocalNotificationCenter = SystemLocalNotificationCenter()) {
        self.center = center
        super.init()
        UNUserNotificationCenter.current().delegate = self
    }

    func status() async -> [String: Any] {
        let permission = NativeNotificationPermission(await center.authorizationStatus())
        let pending = await pendingNotifications()
        return [
            "available": true,
            "permission": permission.rawValue,
            "scheduledCount": pending.count,
        ]
    }

    func requestAuthorization() async throws -> [String: Any] {
        if await center.authorizationStatus() == .notDetermined {
            _ = try await center.requestAuthorization(options: [.alert])
        }
        return await status()
    }

    func schedule(identifier: String, title: String, body: String, triggerAt: Date) async throws {
        guard Self.isValidIdentifier(identifier) else { throw NotificationManagerError.invalidIdentifier }
        guard !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, title.count <= 200, body.count <= 1_000 else {
            throw NotificationManagerError.invalidContent
        }
        guard triggerAt.timeIntervalSinceNow > 0 else { throw NotificationManagerError.triggerNotInFuture }

        let permission = NativeNotificationPermission(await center.authorizationStatus())
        guard permission.canSchedule else { throw NotificationManagerError.notAuthorized }

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: triggerAt.timeIntervalSinceNow, repeats: false)
        try await center.add(UNNotificationRequest(identifier: identifier, content: content, trigger: trigger))
    }

    func cancel(identifier: String) throws {
        guard Self.isValidIdentifier(identifier) else { throw NotificationManagerError.invalidIdentifier }
        center.removePendingNotificationRequests(withIdentifiers: [identifier])
    }

    func pendingNotifications() async -> [NativePendingNotification] {
        let requests = await center.pendingRequests()
        return requests
            .filter { Self.isValidIdentifier($0.identifier) }
            .map { NativePendingNotification(identifier: $0.identifier, triggerAt: Self.nextTriggerDate($0.trigger)) }
            .sorted { $0.identifier < $1.identifier }
    }

    @MainActor
    func openSettings() async -> Bool {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return false }
        return await withCheckedContinuation { continuation in
            UIApplication.shared.open(url, options: [:]) { opened in continuation.resume(returning: opened) }
        }
    }

    static func isValidIdentifier(_ value: String) -> Bool {
        guard !value.isEmpty, value.count <= 160,
              value.hasPrefix(reminderIdentifierPrefix) || value.hasPrefix(testIdentifierPrefix)
        else { return false }
        return value.rangeOfCharacter(from: .controlCharacters) == nil
    }

    private static func nextTriggerDate(_ trigger: UNNotificationTrigger?) -> Date? {
        if let trigger = trigger as? UNTimeIntervalNotificationTrigger { return trigger.nextTriggerDate() }
        if let trigger = trigger as? UNCalendarNotificationTrigger { return trigger.nextTriggerDate() }
        return nil
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .list])
    }
}

enum NotificationManagerError: LocalizedError, Equatable {
    case invalidIdentifier
    case invalidContent
    case triggerNotInFuture
    case notAuthorized

    var errorDescription: String? {
        switch self {
        case .invalidIdentifier: return "The notification identifier is invalid."
        case .invalidContent: return "The notification content is invalid."
        case .triggerNotInFuture: return "The notification trigger must be in the future."
        case .notAuthorized: return "Notification access is not authorized."
        }
    }
}

private extension ISO8601DateFormatter {
    static let evaOrbit: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}
