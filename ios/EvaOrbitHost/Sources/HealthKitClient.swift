import Foundation
import HealthKit

protocol HealthKitReading: AnyObject {
    var isAvailable: Bool { get }
    func requestEnergyAuthorization() async throws
    func startObserver(for metric: HealthMetric, handler: @escaping (@escaping () -> Void) -> Void) throws
    func enableBackgroundDelivery(for metric: HealthMetric) async throws
    func anchoredDelta(for metric: HealthMetric, encodedAnchor: Data?, initialStart: Date?) async throws -> HealthAnchorDelta
    func recentSamples(for metric: HealthMetric, window: HealthDateWindow) async throws -> [HealthEnergySample]
    func dailyCumulativeSum(for metric: HealthMetric, window: HealthDateWindow) async throws -> Double
}

final class SystemHealthKitClient: HealthKitReading {
    private let store = HKHealthStore()
    private var observers: [HealthMetric: HKObserverQuery] = [:]

    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    private func quantityType(for metric: HealthMetric) throws -> HKQuantityType {
        guard let type = HKObjectType.quantityType(forIdentifier: metric.healthKitIdentifier) else {
            throw HealthKitClientError.typeUnavailable(metric.rawValue)
        }
        return type
    }

    func requestEnergyAuthorization() async throws {
        let read = try Set(HealthMetric.allCases.map { try quantityType(for: $0) as HKObjectType })
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            store.requestAuthorization(toShare: [], read: read) { success, error in
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
