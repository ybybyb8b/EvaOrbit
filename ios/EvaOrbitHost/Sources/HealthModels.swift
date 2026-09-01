import Foundation
import HealthKit

enum HealthMetric: String, CaseIterable, Codable {
    case resting
    case active

    var healthKitIdentifier: HKQuantityTypeIdentifier {
        switch self {
        case .resting: return .basalEnergyBurned
        case .active: return .activeEnergyBurned
        }
    }

    var displayName: String {
        switch self {
        case .resting: return "Resting Energy"
        case .active: return "Active Energy"
        }
    }
}

struct HealthEnergySample: Equatable {
    let uuid: String
    let metric: HealthMetric
    let startDate: Date
    let endDate: Date
    let kilocalories: Double

    func localDates(calendar: Calendar = .current) -> [String] {
        let formatter = HealthDateFormatter.formatter(calendar: calendar)
        var dates: [String] = []
        var cursor = calendar.startOfDay(for: startDate)
        let inclusiveEnd = endDate > startDate ? endDate.addingTimeInterval(-0.001) : endDate
        let finalDay = calendar.startOfDay(for: inclusiveEnd)
        while cursor <= finalDay {
            dates.append(formatter.string(from: cursor))
            guard let next = calendar.date(byAdding: .day, value: 1, to: cursor) else { break }
            cursor = next
        }
        return dates
    }
}

struct HealthAnchorDelta {
    let added: [HealthEnergySample]
    let deletedUUIDs: [String]
    let encodedAnchor: Data
}

struct HealthDateWindow {
    let start: Date
    let end: Date
}

struct HealthDailyTotal {
    let localDate: String
    let kilocalories: Double
}

struct HealthOutboxSnapshot: Encodable, Equatable {
    let id: Int64
    let localDate: String
    let metric: HealthMetric
    let kcal: Double
    let revision: Int64
    let sampleCount: Int
    let calculatedAt: String

    enum CodingKeys: String, CodingKey {
        case localDate, metric, kcal, revision, sampleCount, calculatedAt
    }
}

struct HealthRuntimeStatus {
    let available: Bool
    let installationID: String
    let authorizationRequested: Bool
    let hasReadData: Bool
    let backgroundDelivery: [String: String]
    let lastLocalSync: String?
    let lastSuccessfulUpload: String?
    let pendingCount: Int
    let credentialConfigured: Bool
    let lastError: String?

    var dictionary: [String: Any] {
        func nullable(_ value: String?) -> Any { value ?? NSNull() }
        return [
            "available": available,
            "installationId": installationID,
            "authorizationRequested": authorizationRequested,
            "hasReadData": hasReadData,
            "metrics": HealthMetric.allCases.map { ["metric": $0.rawValue, "name": $0.displayName] },
            "backgroundDelivery": backgroundDelivery,
            "lastLocalSync": nullable(lastLocalSync),
            "lastSuccessfulUpload": nullable(lastSuccessfulUpload),
            "pendingCount": pendingCount,
            "credentialConfigured": credentialConfigured,
            "lastError": nullable(lastError)
        ]
    }
}

enum HealthDateFormatter {
    static func formatter(calendar: Calendar = .current) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }

    static let iso8601: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}
