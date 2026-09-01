import HealthKit
import XCTest
@testable import EvaOrbitHost

final class HealthLocalStoreTests: XCTestCase {
    private var temporaryDirectory: URL!
    private var store: HealthLocalStore!

    override func setUpWithError() throws {
        temporaryDirectory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: temporaryDirectory, withIntermediateDirectories: true)
        store = try HealthLocalStore(databaseURL: temporaryDirectory.appendingPathComponent("health.sqlite3"))
    }

    override func tearDownWithError() throws {
        store = nil
        try? FileManager.default.removeItem(at: temporaryDirectory)
    }

    func testAnchorSerializationAndStoreRecovery() throws {
        let encoded = try HealthAnchorCodec.encode(HKQueryAnchor(fromValue: 42))
        XCTAssertNoThrow(try HealthAnchorCodec.decode(encoded))
        try store.commitDelta(metric: .active, samples: [], deletedUUIDs: [], encodedAnchor: encoded, totals: [:], affectedDates: [])
        XCTAssertEqual(try store.anchor(for: .active), encoded)
    }

    func testSampleUUIDDedupAndDeletedDateRecalculation() throws {
        let start = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-09-01T12:00:00Z"))
        let sample = HealthEnergySample(uuid: "sample-1", metric: .active, startDate: start, endDate: start.addingTimeInterval(60), kilocalories: 12)
        try store.commitDelta(metric: .active, samples: [sample], deletedUUIDs: [], encodedAnchor: Data("one".utf8), totals: ["2026-09-01": 12], affectedDates: ["2026-09-01"])
        var batch = try store.takePendingBatch(limit: 10)
        XCTAssertEqual(batch.count, 1)
        XCTAssertEqual(batch[0].sampleCount, 1)
        try store.completeUpload(ids: batch.map(\.id))

        let revised = HealthEnergySample(uuid: "sample-1", metric: .active, startDate: start, endDate: start.addingTimeInterval(120), kilocalories: 14)
        try store.commitDelta(metric: .active, samples: [revised], deletedUUIDs: [], encodedAnchor: Data("two".utf8), totals: ["2026-09-01": 14], affectedDates: ["2026-09-01"])
        batch = try store.takePendingBatch(limit: 10)
        XCTAssertEqual(batch[0].sampleCount, 1)
        try store.completeUpload(ids: batch.map(\.id))

        let lookup = try store.deletedDates(for: ["sample-1"], metric: .active)
        XCTAssertEqual(lookup.dates, Set(["2026-09-01"]))
        XCTAssertEqual(lookup.unknownCount, 0)
        try store.commitDelta(metric: .active, samples: [], deletedUUIDs: ["sample-1"], encodedAnchor: Data("three".utf8), totals: ["2026-09-01": 0], affectedDates: lookup.dates)
        batch = try store.takePendingBatch(limit: 10)
        XCTAssertEqual(batch[0].sampleCount, 0)
        XCTAssertEqual(batch[0].kcal, 0)
    }

    func testOutboxInflightRecoverySuccessAndNetworkFailure() throws {
        let start = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-09-01T12:00:00Z"))
        let sample = HealthEnergySample(uuid: "sample-2", metric: .resting, startDate: start, endDate: start.addingTimeInterval(60), kilocalories: 2)
        try store.commitDelta(metric: .resting, samples: [sample], deletedUUIDs: [], encodedAnchor: Data("one".utf8), totals: ["2026-09-01": 2], affectedDates: ["2026-09-01"])
        let first = try store.takePendingBatch(limit: 10)
        XCTAssertEqual(store.pendingCount(), 1)
        try store.recoverInflight()
        let recovered = try store.takePendingBatch(limit: 10)
        XCTAssertEqual(recovered.map(\.id), first.map(\.id))

        try store.failUpload(ids: recovered.map(\.id), reason: "network failure", now: start)
        XCTAssertTrue(try store.takePendingBatch(limit: 10, now: start.addingTimeInterval(10)).isEmpty)
        let retried = try store.takePendingBatch(limit: 10, now: start.addingTimeInterval(20))
        XCTAssertEqual(retried.count, 1)
        try store.completeUpload(ids: retried.map(\.id), now: start.addingTimeInterval(21))
        XCTAssertEqual(store.pendingCount(), 0)
        XCTAssertNotNil(store.metadata("lastSuccessfulUpload"))
    }

    func testAuthorizationStateAndInitialTodayYesterdayWindow() async throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try XCTUnwrap(TimeZone(identifier: "Asia/Shanghai"))
        let credentialStore = HealthCredentialStore()
        let uploader = HealthUploadManager(store: store, credentialStore: credentialStore)
        let healthKit = FakeHealthKitClient()
        let coordinator = HealthKitCoordinator(healthKit: healthKit, store: store, uploader: uploader, calendar: calendar)

        XCTAssertFalse(coordinator.status().authorizationRequested)
        let status = try await coordinator.requestAuthorization()
        XCTAssertTrue(status.authorizationRequested)
        XCTAssertEqual(healthKit.authorizationRequests, 1)
        XCTAssertEqual(Set(healthKit.backgroundMetrics), Set(HealthMetric.allCases))

        let noon = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-09-01T04:00:00Z"))
        let window = coordinator.initialWindow(now: noon)
        XCTAssertEqual(HealthDateFormatter.iso8601.string(from: window.start), "2026-08-30T16:00:00.000Z")
        XCTAssertEqual(HealthDateFormatter.iso8601.string(from: window.end), "2026-09-01T16:00:00.000Z")
    }
}

private final class FakeHealthKitClient: HealthKitReading {
    var isAvailable = true
    var authorizationRequests = 0
    var backgroundMetrics: [HealthMetric] = []

    func requestEnergyAuthorization() async throws { authorizationRequests += 1 }
    func startObserver(for metric: HealthMetric, handler: @escaping (@escaping () -> Void) -> Void) throws {}
    func enableBackgroundDelivery(for metric: HealthMetric) async throws { backgroundMetrics.append(metric) }
    func anchoredDelta(for metric: HealthMetric, encodedAnchor: Data?, initialStart: Date?) async throws -> HealthAnchorDelta {
        HealthAnchorDelta(added: [], deletedUUIDs: [], encodedAnchor: Data(metric.rawValue.utf8))
    }
    func recentSamples(for metric: HealthMetric, window: HealthDateWindow) async throws -> [HealthEnergySample] { [] }
    func dailyCumulativeSum(for metric: HealthMetric, window: HealthDateWindow) async throws -> Double { 0 }
}
