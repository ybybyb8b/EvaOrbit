import Foundation
import HealthKit
import UIKit
import UserNotifications

private let healthAuthorizationRequestedKey = "health.authorizationRequested"

enum NotificationAuthorization: String, Equatable {
    case loading
    case notDetermined
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

    var canRequest: Bool { self == .notDetermined }
}

struct NotificationAccess: Equatable {
    var authorization: NotificationAuthorization = .loading
    var alertsEnabled = false
    var soundsEnabled = false
}

struct HealthAccess: Equatable {
    var available = HKHealthStore.isHealthDataAvailable()
    var authorizationRequested = UserDefaults.standard.bool(forKey: healthAuthorizationRequestedKey)
}

@MainActor
final class PermissionModel: ObservableObject {
    static let notificationOptions: UNAuthorizationOptions = [.alert, .sound]

    @Published private(set) var notifications = NotificationAccess()
    @Published private(set) var health = HealthAccess()
    @Published private(set) var isWorking = false
    @Published private(set) var errorMessage: String?

    private let notificationCenter = UNUserNotificationCenter.current()
    private let healthStore = HKHealthStore()

    func refresh() async {
        let settings = await notificationCenter.notificationSettings()
        notifications = NotificationAccess(
            authorization: NotificationAuthorization(settings.authorizationStatus),
            alertsEnabled: settings.alertSetting == .enabled,
            soundsEnabled: settings.soundSetting == .enabled
        )
        health = HealthAccess()
    }

    func requestNotifications() async {
        guard notifications.authorization.canRequest else {
            await openSettings()
            return
        }
        await perform {
            _ = try await notificationCenter.requestAuthorization(options: Self.notificationOptions)
        }
    }

    func requestHealthAuthorization() async {
        guard health.available else { return }
        await perform {
            let readTypes = try Set([
                energyType(.activeEnergyBurned),
                energyType(.basalEnergyBurned),
            ] as [HKObjectType])
            try await requestHealthAuthorization(readTypes: readTypes)
            UserDefaults.standard.set(true, forKey: healthAuthorizationRequestedKey)
        }
    }

    func openSettings() async {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        await UIApplication.shared.open(url)
    }

    private func perform(_ operation: () async throws -> Void) async {
        guard !isWorking else { return }
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            try await operation()
        } catch {
            errorMessage = error.localizedDescription
        }
        await refresh()
    }

    private func energyType(_ identifier: HKQuantityTypeIdentifier) throws -> HKQuantityType {
        guard let type = HKObjectType.quantityType(forIdentifier: identifier) else {
            throw PermissionError.healthTypeUnavailable
        }
        return type
    }

    private func requestHealthAuthorization(readTypes: Set<HKObjectType>) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            healthStore.requestAuthorization(toShare: [], read: readTypes) { success, error in
                if let error {
                    continuation.resume(throwing: error)
                } else if success {
                    continuation.resume()
                } else {
                    continuation.resume(throwing: PermissionError.healthAuthorizationFailed)
                }
            }
        }
    }
}

enum PermissionError: LocalizedError {
    case healthTypeUnavailable
    case healthAuthorizationFailed

    var errorDescription: String? {
        switch self {
        case .healthTypeUnavailable: return "需要的 Apple Health 能量类型不可用。"
        case .healthAuthorizationFailed: return "Apple Health 授权流程未完成。"
        }
    }
}
