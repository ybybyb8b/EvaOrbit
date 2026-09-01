import Foundation

final class HealthKitCoordinator {
    static let defaultInitialLookbackDays = 1

    private let healthKit: HealthKitReading
    private let store: HealthLocalStore
    private let uploader: HealthUploadManager
    private let calendar: Calendar
    private let initialLookbackDays: Int
    private let stateLock = NSLock()
    private var syncing = Set<HealthMetric>()
    private var needsResync = Set<HealthMetric>()
    private var waiters: [HealthMetric: [(Bool) -> Void]] = [:]

    init(
        healthKit: HealthKitReading,
        store: HealthLocalStore,
        uploader: HealthUploadManager,
        calendar: Calendar = .current,
        initialLookbackDays: Int = HealthKitCoordinator.defaultInitialLookbackDays
    ) {
        self.healthKit = healthKit
        self.store = store
        self.uploader = uploader
        self.calendar = calendar
        self.initialLookbackDays = min(max(initialLookbackDays, 0), 30)
    }

    func restoreAtLaunch() {
        guard healthKit.isAvailable else { return }
        for metric in HealthMetric.allCases {
            do {
                try healthKit.startObserver(for: metric) { [weak self] completion in
                    self?.enqueueSync(metric: metric) { _ in
                        completion()
                        self?.uploader.flush()
                    }
                }
                HealthDiagnostics.log("metric=\(metric.rawValue) observer=registered")
            } catch {
                recordError(error)
            }
        }
        if store.metadata("authorizationRequested") == "true" {
            Task { [weak self] in
                await self?.enableBackgroundDelivery()
                _ = await self?.syncNow()
            }
        }
        uploader.flush()
    }

    func requestAuthorization() async throws -> HealthRuntimeStatus {
        guard healthKit.isAvailable else { throw HealthKitCoordinatorError.unavailable }
        do {
            try await healthKit.requestEnergyAuthorization()
            try store.setMetadata("authorizationRequested", value: "true")
            await enableBackgroundDelivery()
            _ = await syncNow()
            return status()
        } catch {
            recordError(error)
            throw error
        }
    }

    func syncNow() async -> Bool {
        var success = true
        for metric in HealthMetric.allCases {
            let metricSuccess = await withCheckedContinuation { continuation in
                enqueueSync(metric: metric) { continuation.resume(returning: $0) }
            }
            success = success && metricSuccess
        }
        uploader.flush()
        return success
    }

    func configureCredential(_ credential: String, ingestURL: URL) throws {
        try uploader.configure(credential: credential, ingestURL: ingestURL)
    }

    func clearCredential() { uploader.clearCredential() }

    func handleBackgroundSessionEvents(completionHandler: @escaping () -> Void) {
        uploader.handleEvents(completionHandler: completionHandler)
    }

    func applicationDidBecomeActive() {
        if store.metadata("authorizationRequested") == "true" {
            Task { [weak self] in _ = await self?.syncNow() }
        } else {
            uploader.flush()
        }
    }

    func status() -> HealthRuntimeStatus {
        HealthRuntimeStatus(
            available: healthKit.isAvailable,
            installationID: uploader.installationID,
            authorizationRequested: store.metadata("authorizationRequested") == "true",
            hasReadData: store.metadata("hasReadData") == "true",
            backgroundDelivery: Dictionary(uniqueKeysWithValues: HealthMetric.allCases.map { metric in
                (metric.rawValue, store.metadata("background.\(metric.rawValue)") ?? "not_requested")
            }),
            lastLocalSync: nonemptyMetadata("lastLocalSync"),
            lastSuccessfulUpload: nonemptyMetadata("lastSuccessfulUpload"),
            pendingCount: store.pendingCount(),
            credentialConfigured: uploader.isCredentialConfigured,
            lastError: nonemptyMetadata("lastError")
        )
    }

    private func enableBackgroundDelivery() async {
        for metric in HealthMetric.allCases {
            do {
                try await healthKit.enableBackgroundDelivery(for: metric)
                try? store.setMetadata("background.\(metric.rawValue)", value: "enabled")
                HealthDiagnostics.log("metric=\(metric.rawValue) background-delivery=enabled")
            } catch {
                try? store.setMetadata("background.\(metric.rawValue)", value: "failed")
                recordError(error)
                HealthDiagnostics.log("metric=\(metric.rawValue) background-delivery=failed error=\(HealthDiagnostics.safe(error))")
            }
        }
    }

    private func enqueueSync(metric: HealthMetric, completion: @escaping (Bool) -> Void) {
        stateLock.lock()
        waiters[metric, default: []].append(completion)
        if syncing.contains(metric) {
            needsResync.insert(metric)
            stateLock.unlock()
            return
        }
        syncing.insert(metric)
        stateLock.unlock()

        Task { [weak self] in
            guard let self else { return }
            var succeeded = true
            while true {
                succeeded = await self.performSync(metric: metric) && succeeded
                self.stateLock.lock()
                if self.needsResync.remove(metric) != nil {
                    self.stateLock.unlock()
                    continue
                }
                self.syncing.remove(metric)
                let callbacks = self.waiters.removeValue(forKey: metric) ?? []
                self.stateLock.unlock()
                callbacks.forEach { $0(succeeded) }
                break
            }
        }
    }

    private func performSync(metric: HealthMetric) async -> Bool {
        do {
            let encodedAnchor = try store.anchor(for: metric)
            let initialStart = encodedAnchor == nil ? initialWindow().start : nil
            let delta = try await healthKit.anchoredDelta(for: metric, encodedAnchor: encodedAnchor, initialStart: initialStart)
            let deletedLookup = try store.deletedDates(for: delta.deletedUUIDs, metric: metric)
            var samples = delta.added
            var affectedDates = deletedLookup.dates
            delta.added.forEach { affectedDates.formUnion($0.localDates(calendar: calendar)) }
            var replacementWindow: HealthDateWindow?

            if deletedLookup.unknownCount > 0 {
                let window = initialWindow()
                samples = try await healthKit.recentSamples(for: metric, window: window)
                replacementWindow = window
                affectedDates.formUnion(localDates(in: window))
                HealthDiagnostics.log("metric=\(metric.rawValue) unknown-deleted=\(deletedLookup.unknownCount) recent-rescan=true")
            }

            var totals: [String: Double] = [:]
            for localDate in affectedDates {
                totals[localDate] = try await healthKit.dailyCumulativeSum(for: metric, window: dateWindow(localDate))
            }
            try store.commitDelta(
                metric: metric,
                samples: samples,
                deletedUUIDs: delta.deletedUUIDs,
                encodedAnchor: delta.encodedAnchor,
                totals: totals,
                affectedDates: affectedDates,
                replaceWindow: replacementWindow
            )
            HealthDiagnostics.log("metric=\(metric.rawValue) query=success added=\(delta.added.count) deleted=\(delta.deletedUUIDs.count) affected-dates=\(affectedDates.count) anchor-advanced=true pending=\(store.pendingCount())")
            return true
        } catch {
            recordError(error)
            HealthDiagnostics.log("metric=\(metric.rawValue) query=failed anchor-advanced=false error=\(HealthDiagnostics.safe(error))")
            return false
        }
    }

    func initialWindow(now: Date = Date()) -> HealthDateWindow {
        let today = calendar.startOfDay(for: now)
        let start = calendar.date(byAdding: .day, value: -initialLookbackDays, to: today) ?? today
        let end = calendar.date(byAdding: .day, value: 1, to: today) ?? now.addingTimeInterval(86_400)
        return HealthDateWindow(start: start, end: end)
    }

    private func dateWindow(_ localDate: String) throws -> HealthDateWindow {
        let formatter = HealthDateFormatter.formatter(calendar: calendar)
        guard let start = formatter.date(from: localDate), let end = calendar.date(byAdding: .day, value: 1, to: start) else {
            throw HealthKitCoordinatorError.invalidLocalDate
        }
        return HealthDateWindow(start: start, end: end)
    }

    private func localDates(in window: HealthDateWindow) -> Set<String> {
        let formatter = HealthDateFormatter.formatter(calendar: calendar)
        var dates = Set<String>()
        var cursor = calendar.startOfDay(for: window.start)
        while cursor < window.end {
            dates.insert(formatter.string(from: cursor))
            guard let next = calendar.date(byAdding: .day, value: 1, to: cursor) else { break }
            cursor = next
        }
        return dates
    }

    private func nonemptyMetadata(_ key: String) -> String? {
        guard let value = store.metadata(key), !value.isEmpty else { return nil }
        return value
    }

    private func recordError(_ error: Error) {
        try? store.setMetadata("lastError", value: HealthDiagnostics.safe(error))
    }
}

enum HealthKitCoordinatorError: LocalizedError {
    case unavailable
    case invalidLocalDate

    var errorDescription: String? {
        switch self {
        case .unavailable: return "HealthKit is not available on this device"
        case .invalidLocalDate: return "HealthKit local date is invalid"
        }
    }
}
