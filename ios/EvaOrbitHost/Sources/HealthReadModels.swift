import Foundation
import HealthKit

enum HealthSleepSyncScope {
    static let firstWakeDate = "2026-10-01"
    // Keep a full preceding night, including stage fragments before local midnight.
    // UTC+14 supplies the earliest boundary; presentation uses the preserved wake-date zone.
    static let earliestSampleEnd = "2026-09-29T10:00:00.000Z"
    static var queryStart: Date { HealthDateFormatter.iso8601.date(from: earliestSampleEnd)! }
}

// Authorization is independent of sync policy. These types are always read-only.
enum HealthReadMetric: String, CaseIterable, Codable {
    case sleep
    case heartRate = "heart_rate"
    case restingHeartRate = "resting_heart_rate"
    case hrv

    var sampleType: HKSampleType {
        switch self {
        case .sleep: return HKCategoryType(.sleepAnalysis)
        case .heartRate: return HKQuantityType(.heartRate)
        case .restingHeartRate: return HKQuantityType(.restingHeartRate)
        case .hrv: return HKQuantityType(.heartRateVariabilitySDNN)
        }
    }

    var displayName: String {
        switch self {
        case .sleep: return "Sleep Analysis"
        case .heartRate: return "Heart Rate"
        case .restingHeartRate: return "Resting Heart Rate"
        case .hrv: return "HRV (SDNN)"
        }
    }

    var unit: HKUnit { self == .hrv ? .secondUnit(with: .milli) : HKUnit.count().unitDivided(by: .minute()) }
    var unitName: String { self == .hrv ? "ms" : "count/min" }

    static func enabled(in store: HealthLocalStore) -> [HealthReadMetric] {
        let configured = (store.metadata("readSyncMetrics") ?? "sleep").split(separator: ",").map(String.init)
        return allCases.filter { $0 == .sleep || configured.contains($0.rawValue) }
    }
}

struct HealthReadSample: Codable, Equatable {
    let sampleId: String
    let metric: HealthReadMetric
    let startAt: String
    let endAt: String
    let timeZone: String
    let timeZoneSource: String
    let stage: Int?
    let value: Double?
    let unit: String?
    let sourceBundle: String
    let sourceName: String
    let syncIdentifier: String?
    let syncVersion: Int?
}

struct HealthReadDelta {
    let added: [HealthReadSample]
    let deletedUUIDs: [String]
    let encodedAnchor: Data
}

struct HealthReadChange: Codable, Equatable {
    let streamId: String
    let operation: String
    let sampleId: String
    let metric: HealthReadMetric
    let revision: Int64
    let startAt: String?
    let endAt: String?
    let timeZone: String?
    let timeZoneSource: String?
    let stage: Int?
    let value: Double?
    let unit: String?
    let sourceBundle: String?
    let sourceName: String?
    let syncIdentifier: String?
    let syncVersion: Int?

    init(metric: HealthReadMetric, sampleId: String, streamId: String, revision: Int64, sample: HealthReadSample?) {
        self.streamId = streamId
        self.operation = sample == nil ? "delete" : "upsert"
        self.metric = metric; self.sampleId = sampleId; self.revision = revision
        self.startAt = sample?.startAt; self.endAt = sample?.endAt
        self.timeZone = sample?.timeZone; self.timeZoneSource = sample?.timeZoneSource
        self.stage = sample?.stage; self.value = sample?.value; self.unit = sample?.unit
        self.sourceBundle = sample?.sourceBundle; self.sourceName = sample?.sourceName
        self.syncIdentifier = sample?.syncIdentifier; self.syncVersion = sample?.syncVersion
    }
}

struct HealthReadOutboxItem {
    let id: Int64
    let change: HealthReadChange
}
