import Foundation
import HealthKit

enum HealthSleepSyncScope {
    static let firstWakeDate = "2026-10-01"
    // Sleep is scoped by wake date; retain the complete preceding night's fragments.
    static let earliestSampleEnd = "2026-09-29T10:00:00.000Z"
    static var queryStart: Date { HealthDateFormatter.iso8601.date(from: earliestSampleEnd)! }
}

enum HealthWorkoutSyncScope {
    static let firstStartDate = "2026-10-01"
    // Earliest October 1 worldwide; filter by each workout's preserved timezone afterward.
    static var queryStart: Date { HealthDateFormatter.iso8601.date(from: "2026-09-30T10:00:00.000Z")! }
    static func includes(startAt: Date, timeZone: TimeZone) -> Bool {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: startAt) >= firstStartDate
    }
}

// Authorization is independent of sync policy. These types are always read-only.
enum HealthReadMetric: String, CaseIterable, Codable {
    case sleep
    case heartRate = "heart_rate"
    case restingHeartRate = "resting_heart_rate"
    case hrv
    case workout

    var sampleType: HKSampleType {
        switch self {
        case .sleep: return HKCategoryType(.sleepAnalysis)
        case .heartRate: return HKQuantityType(.heartRate)
        case .restingHeartRate: return HKQuantityType(.restingHeartRate)
        case .hrv: return HKQuantityType(.heartRateVariabilitySDNN)
        case .workout: return HKObjectType.workoutType()
        }
    }

    var displayName: String {
        switch self {
        case .sleep: return "Sleep Analysis"
        case .heartRate: return "Heart Rate"
        case .restingHeartRate: return "Resting Heart Rate"
        case .hrv: return "HRV (SDNN)"
        case .workout: return "Workouts"
        }
    }

    var unit: HKUnit { self == .hrv ? .secondUnit(with: .milli) : HKUnit.count().unitDivided(by: .minute()) }
    var unitName: String { self == .hrv ? "ms" : "count/min" }

    static func enabled(in store: HealthLocalStore) -> [HealthReadMetric] {
        let configured = (store.metadata("readSyncMetrics") ?? "sleep").split(separator: ",").map(String.init)
        return allCases.filter { $0 == .sleep || configured.contains($0.rawValue) }
    }
}

struct HealthWorkoutDetails: Codable, Equatable {
    let activityType: UInt
    let activityName: String
    let durationSeconds: Double
    let activeEnergyKcal: Double?
    let distance: Double?
    let distanceUnit: String?
    let deviceName: String?
    let deviceModel: String?
    let deviceManufacturer: String?
}

enum HealthWorkoutActivity {
    static func name(_ type: HKWorkoutActivityType) -> String {
        switch type {
        case .cycling: return "cycling"
        case .functionalStrengthTraining: return "functionalStrengthTraining"
        case .traditionalStrengthTraining: return "traditionalStrengthTraining"
        case .hiking: return "hiking"
        case .rowing: return "rowing"
        case .running: return "running"
        case .swimming: return "swimming"
        case .walking: return "walking"
        case .yoga: return "yoga"
        case .pilates: return "pilates"
        case .highIntensityIntervalTraining: return "highIntensityIntervalTraining"
        case .coreTraining: return "coreTraining"
        case .elliptical: return "elliptical"
        case .stairClimbing: return "stairClimbing"
        case .mixedCardio: return "mixedCardio"
        case .dance: return "dance"
        case .cooldown: return "cooldown"
        case .flexibility: return "flexibility"
        default: return "other"
        }
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
    var workout: HealthWorkoutDetails? = nil
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
    let workout: HealthWorkoutDetails?

    init(metric: HealthReadMetric, sampleId: String, streamId: String, revision: Int64, sample: HealthReadSample?) {
        self.streamId = streamId
        self.operation = sample == nil ? "delete" : "upsert"
        self.metric = metric; self.sampleId = sampleId; self.revision = revision
        self.startAt = sample?.startAt; self.endAt = sample?.endAt
        self.timeZone = sample?.timeZone; self.timeZoneSource = sample?.timeZoneSource
        self.stage = sample?.stage; self.value = sample?.value; self.unit = sample?.unit
        self.sourceBundle = sample?.sourceBundle; self.sourceName = sample?.sourceName
        self.syncIdentifier = sample?.syncIdentifier; self.syncVersion = sample?.syncVersion
        self.workout = sample?.workout
    }
}

struct HealthReadOutboxItem {
    let id: Int64
    let change: HealthReadChange
}
