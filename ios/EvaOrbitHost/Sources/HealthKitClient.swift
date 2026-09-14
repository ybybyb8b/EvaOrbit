import Foundation
import HealthKit

protocol HealthKitReading: AnyObject {
    var isAvailable: Bool { get }
    func requestAuthorization() async throws
    func startObserver(for metric: HealthMetric, handler: @escaping (@escaping () -> Void) -> Void) throws
    func enableBackgroundDelivery(for metric: HealthMetric) async throws
    func anchoredDelta(for metric: HealthMetric, encodedAnchor: Data?, initialStart: Date?) async throws -> HealthAnchorDelta
    func recentSamples(for metric: HealthMetric, window: HealthDateWindow) async throws -> [HealthEnergySample]
    func dailyCumulativeSum(for metric: HealthMetric, window: HealthDateWindow) async throws -> Double
    func anchoredBodyMassDelta(encodedAnchor: Data?, initialStart: Date?) async throws -> HealthBodyMassDelta
    func saveBodyMass(kilograms: Double, occurredAt: Date, syncIdentifier: String, syncVersion: Int) async throws
    func startMenstrualFlowObserver(handler: @escaping (@escaping () -> Void) -> Void) throws
    func enableMenstrualFlowBackgroundDelivery() async throws
    func anchoredMenstrualFlowDelta(encodedAnchor: Data?, initialStart: Date?) async throws -> HealthMenstrualFlowDelta
    func saveMenstrualFlow(startAt: Date, endAt: Date, flow: HealthMenstrualFlowValue, cycleStart: Bool, syncIdentifier: String, syncVersion: Int) async throws
    func deleteMenstrualFlow(sampleID: String?, syncIdentifier: String?) async throws
}

final class SystemHealthKitClient: HealthKitReading {
    private let store = HKHealthStore()
    private var observers: [HealthMetric: HKObserverQuery] = [:]
    private var menstrualFlowObserver: HKObserverQuery?

    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    private func quantityType(for metric: HealthMetric) throws -> HKQuantityType {
        guard let type = HKObjectType.quantityType(forIdentifier: metric.healthKitIdentifier) else {
            throw HealthKitClientError.typeUnavailable(metric.rawValue)
        }
        return type
    }

    private func menstrualFlowType() throws -> HKCategoryType {
        guard let type = HKObjectType.categoryType(forIdentifier: .menstrualFlow) else { throw HealthKitClientError.typeUnavailable("menstrual_flow") }
        return type
    }

    func requestAuthorization() async throws {
        let menstrualFlow = try menstrualFlowType()
        let read = try Set(HealthMetric.allCases.map { try quantityType(for: $0) as HKObjectType } + [menstrualFlow])
        let share = Set([try quantityType(for: .bodyMass) as HKSampleType, menstrualFlow])
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            store.requestAuthorization(toShare: share, read: read) { success, error in
                if let error { continuation.resume(throwing: error) }
                else if success { continuation.resume() }
                else { continuation.resume(throwing: HealthKitClientError.authorizationFailed) }
            }
        }
    }

    func startObserver(for metric: HealthMetric, handler: @escaping (@escaping () -> Void) -> Void) throws {
        guard observers[metric] == nil else { return }
        let type = try quantityType(for: metric)
        let query = HKObserverQuery(sampleType: type, predicate: nil) { _, completion, error in
            if let error {
                HealthDiagnostics.log("metric=\(metric.rawValue) observer=failed error=\(HealthDiagnostics.safe(error))")
                completion()
                return
            }
            handler(completion)
        }
        observers[metric] = query
        store.execute(query)
    }

    func enableBackgroundDelivery(for metric: HealthMetric) async throws {
        let type = try quantityType(for: metric)
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            store.enableBackgroundDelivery(for: type, frequency: .immediate) { success, error in
                if let error { continuation.resume(throwing: error) }
                else if success { continuation.resume() }
                else { continuation.resume(throwing: HealthKitClientError.backgroundDeliveryFailed) }
            }
        }
    }

    func anchoredDelta(for metric: HealthMetric, encodedAnchor: Data?, initialStart: Date?) async throws -> HealthAnchorDelta {
        precondition(metric.isEnergy)
        let type = try quantityType(for: metric)
        let anchor = try encodedAnchor.map(HealthAnchorCodec.decode)
        let predicate = anchor == nil ? initialStart.map { HKQuery.predicateForSamples(withStart: $0, end: nil, options: .strictStartDate) } : nil
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKAnchoredObjectQuery(type: type, predicate: predicate, anchor: anchor, limit: HKObjectQueryNoLimit) { _, samples, deleted, newAnchor, error in
                if let error { continuation.resume(throwing: error); return }
                guard let newAnchor else { continuation.resume(throwing: HealthKitClientError.missingAnchor); return }
                do {
                    let added = (samples as? [HKQuantitySample] ?? []).map { sample in
                        HealthEnergySample(
                            uuid: sample.uuid.uuidString.lowercased(),
                            metric: metric,
                            startDate: sample.startDate,
                            endDate: sample.endDate,
                            kilocalories: sample.quantity.doubleValue(for: .kilocalorie())
                        )
                    }
                    continuation.resume(returning: HealthAnchorDelta(
                        added: added,
                        deletedUUIDs: (deleted ?? []).map { $0.uuid.uuidString.lowercased() },
                        encodedAnchor: try HealthAnchorCodec.encode(newAnchor)
                    ))
                } catch {
                    continuation.resume(throwing: error)
                }
            }
            store.execute(query)
        }
    }

    func recentSamples(for metric: HealthMetric, window: HealthDateWindow) async throws -> [HealthEnergySample] {
        precondition(metric.isEnergy)
        let type = try quantityType(for: metric)
        let predicate = HKQuery.predicateForSamples(withStart: window.start, end: window.end, options: .strictStartDate)
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
                if let error { continuation.resume(throwing: error); return }
                let values = (samples as? [HKQuantitySample] ?? []).map { sample in
                    HealthEnergySample(
                        uuid: sample.uuid.uuidString.lowercased(),
                        metric: metric,
                        startDate: sample.startDate,
                        endDate: sample.endDate,
                        kilocalories: sample.quantity.doubleValue(for: .kilocalorie())
                    )
                }
                continuation.resume(returning: values)
            }
            store.execute(query)
        }
    }

    func dailyCumulativeSum(for metric: HealthMetric, window: HealthDateWindow) async throws -> Double {
        precondition(metric.isEnergy)
        let type = try quantityType(for: metric)
        let predicate = HKQuery.predicateForSamples(withStart: window.start, end: window.end, options: [.strictStartDate, .strictEndDate])
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, statistics, error in
                if let error { continuation.resume(throwing: error); return }
                continuation.resume(returning: statistics?.sumQuantity()?.doubleValue(for: .kilocalorie()) ?? 0)
            }
            store.execute(query)
        }
    }

    func anchoredBodyMassDelta(encodedAnchor: Data?, initialStart: Date?) async throws -> HealthBodyMassDelta {
        let type = try quantityType(for: .bodyMass)
        let anchor = try encodedAnchor.map(HealthAnchorCodec.decode)
        let predicate = anchor == nil ? initialStart.map { HKQuery.predicateForSamples(withStart: $0, end: nil, options: .strictStartDate) } : nil
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKAnchoredObjectQuery(type: type, predicate: predicate, anchor: anchor, limit: HKObjectQueryNoLimit) { _, samples, deleted, newAnchor, error in
                if let error { continuation.resume(throwing: error); return }
                guard let newAnchor else { continuation.resume(throwing: HealthKitClientError.missingAnchor); return }
                do {
                    let added = (samples as? [HKQuantitySample] ?? []).map { sample in
                        HealthBodyMassSample(
                            uuid: sample.uuid.uuidString.lowercased(),
                            occurredAt: sample.startDate,
                            kilograms: sample.quantity.doubleValue(for: .gramUnit(with: .kilo)),
                            sourceBundle: sample.sourceRevision.source.bundleIdentifier,
                            sourceName: sample.sourceRevision.source.name,
                            syncIdentifier: sample.metadata?[HKMetadataKeySyncIdentifier] as? String,
                            syncVersion: sample.metadata?[HKMetadataKeySyncVersion] as? Int
                        )
                    }
                    continuation.resume(returning: HealthBodyMassDelta(added: added, deletedUUIDs: (deleted ?? []).map { $0.uuid.uuidString.lowercased() }, encodedAnchor: try HealthAnchorCodec.encode(newAnchor)))
                } catch { continuation.resume(throwing: error) }
            }
            store.execute(query)
        }
    }

    func saveBodyMass(kilograms: Double, occurredAt: Date, syncIdentifier: String, syncVersion: Int) async throws {
        let type = try quantityType(for: .bodyMass)
        let sample = HKQuantitySample(type: type, quantity: HKQuantity(unit: .gramUnit(with: .kilo), doubleValue: kilograms), start: occurredAt, end: occurredAt, metadata: [HKMetadataKeySyncIdentifier: syncIdentifier, HKMetadataKeySyncVersion: syncVersion])
        try await store.save(sample)
    }

    func startMenstrualFlowObserver(handler: @escaping (@escaping () -> Void) -> Void) throws {
        guard menstrualFlowObserver == nil else { return }
        let type = try menstrualFlowType()
        let query = HKObserverQuery(sampleType: type, predicate: nil) { _, completion, error in
            if let error { HealthDiagnostics.log("metric=menstrual_flow observer=failed error=\(HealthDiagnostics.safe(error))"); completion(); return }
            handler(completion)
        }
        menstrualFlowObserver = query
        store.execute(query)
    }

    func enableMenstrualFlowBackgroundDelivery() async throws {
        let type = try menstrualFlowType()
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            store.enableBackgroundDelivery(for: type, frequency: .immediate) { success, error in
                if let error { continuation.resume(throwing: error) }
                else if success { continuation.resume() }
                else { continuation.resume(throwing: HealthKitClientError.backgroundDeliveryFailed) }
            }
        }
    }

    func anchoredMenstrualFlowDelta(encodedAnchor: Data?, initialStart: Date?) async throws -> HealthMenstrualFlowDelta {
        let type = try menstrualFlowType(), anchor = try encodedAnchor.map(HealthAnchorCodec.decode)
        let predicate = anchor == nil ? initialStart.map { HKQuery.predicateForSamples(withStart: $0, end: nil, options: .strictStartDate) } : nil
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKAnchoredObjectQuery(type: type, predicate: predicate, anchor: anchor, limit: HKObjectQueryNoLimit) { _, samples, deleted, newAnchor, error in
                if let error { continuation.resume(throwing: error); return }
                guard let newAnchor else { continuation.resume(throwing: HealthKitClientError.missingAnchor); return }
                do {
                    let added = (samples as? [HKCategorySample] ?? []).map { sample in
                        let value = Self.flowValue(sample.value)
                        return HealthMenstrualFlowSample(uuid: sample.uuid.uuidString.lowercased(), startDate: sample.startDate, endDate: sample.endDate, flow: value, cycleStart: (sample.metadata?[HKMetadataKeyMenstrualCycleStart] as? NSNumber)?.boolValue ?? false, sourceBundle: sample.sourceRevision.source.bundleIdentifier, sourceName: sample.sourceRevision.source.name, syncIdentifier: sample.metadata?[HKMetadataKeySyncIdentifier] as? String, syncVersion: (sample.metadata?[HKMetadataKeySyncVersion] as? NSNumber)?.intValue)
                    }
                    continuation.resume(returning: HealthMenstrualFlowDelta(added: added, deletedUUIDs: (deleted ?? []).map { $0.uuid.uuidString.lowercased() }, encodedAnchor: try HealthAnchorCodec.encode(newAnchor)))
                } catch { continuation.resume(throwing: error) }
            }
            store.execute(query)
        }
    }

    func saveMenstrualFlow(startAt: Date, endAt: Date, flow: HealthMenstrualFlowValue, cycleStart: Bool, syncIdentifier: String, syncVersion: Int) async throws {
        let sample = HKCategorySample(type: try menstrualFlowType(), value: Self.healthKitFlowValue(flow), start: startAt, end: endAt, metadata: [HKMetadataKeyMenstrualCycleStart: cycleStart, HKMetadataKeySyncIdentifier: syncIdentifier, HKMetadataKeySyncVersion: syncVersion])
        try await store.save(sample)
    }

    func deleteMenstrualFlow(sampleID: String?, syncIdentifier: String?) async throws {
        let type = try menstrualFlowType()
        let samples: [HKCategorySample] = try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: type, predicate: nil, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, values, error in
                if let error { continuation.resume(throwing: error); return }
                continuation.resume(returning: (values as? [HKCategorySample] ?? []).filter { sample in sample.uuid.uuidString.caseInsensitiveCompare(sampleID ?? "") == .orderedSame || (syncIdentifier != nil && sample.metadata?[HKMetadataKeySyncIdentifier] as? String == syncIdentifier) })
            }
            store.execute(query)
        }
        if !samples.isEmpty { try await store.delete(samples) }
    }

    static func flowValue(_ value: Int) -> HealthMenstrualFlowValue {
        if #available(iOS 18.0, *), let bleeding = HKCategoryValueVaginalBleeding(rawValue: value) {
            switch bleeding { case .none: return .none; case .unspecified: return .unspecified; case .light: return .light; case .medium: return .medium; case .heavy: return .heavy; @unknown default: break }
        }
        switch value {
        case HKCategoryValueMenstrualFlow.none.rawValue: return .none
        case HKCategoryValueMenstrualFlow.unspecified.rawValue: return .unspecified
        case HKCategoryValueMenstrualFlow.light.rawValue: return .light
        case HKCategoryValueMenstrualFlow.medium.rawValue: return .medium
        case HKCategoryValueMenstrualFlow.heavy.rawValue: return .heavy
        default:
            HealthDiagnostics.log("metric=menstrual_flow unknown-category=\(value) mapped=unspecified")
            return .unspecified
        }
    }

    private static func healthKitFlowValue(_ value: HealthMenstrualFlowValue) -> Int {
        if #available(iOS 18.0, *) {
            switch value { case .none: return HKCategoryValueVaginalBleeding.none.rawValue; case .unspecified: return HKCategoryValueVaginalBleeding.unspecified.rawValue; case .light: return HKCategoryValueVaginalBleeding.light.rawValue; case .medium: return HKCategoryValueVaginalBleeding.medium.rawValue; case .heavy: return HKCategoryValueVaginalBleeding.heavy.rawValue }
        }
        switch value { case .none: return HKCategoryValueMenstrualFlow.none.rawValue; case .unspecified: return HKCategoryValueMenstrualFlow.unspecified.rawValue; case .light: return HKCategoryValueMenstrualFlow.light.rawValue; case .medium: return HKCategoryValueMenstrualFlow.medium.rawValue; case .heavy: return HKCategoryValueMenstrualFlow.heavy.rawValue }
    }

}

enum HealthAnchorCodec {
    static func encode(_ anchor: HKQueryAnchor) throws -> Data {
        try NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true)
    }

    static func decode(_ data: Data) throws -> HKQueryAnchor {
        guard let anchor = try NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data) else {
            throw HealthKitClientError.invalidAnchor
        }
        return anchor
    }
}

enum HealthKitClientError: LocalizedError {
    case typeUnavailable(String)
    case authorizationFailed
    case backgroundDeliveryFailed
    case missingAnchor
    case invalidAnchor

    var errorDescription: String? {
        switch self {
        case .typeUnavailable(let metric): return "HealthKit type unavailable: \(metric)"
        case .authorizationFailed: return "HealthKit authorization did not complete"
        case .backgroundDeliveryFailed: return "HealthKit background delivery was not enabled"
        case .missingAnchor: return "HealthKit did not return an anchor"
        case .invalidAnchor: return "Stored HealthKit anchor is invalid"
        }
    }
}

enum HealthDiagnostics {
    static func log(_ message: String) {
        print("[evaorbit-health] \(message)")
    }

    static func safe(_ error: Error) -> String {
        String(describing: error).replacingOccurrences(of: "\n", with: " ").prefix(240).description
    }
}
