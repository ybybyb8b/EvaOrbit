import HealthKit
import SQLite3
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

    func testBodyMassOutboxPreservesSourceIdentityAndRecovers() throws {
        let occurredAt = Date(timeIntervalSince1970: 1_788_912_000)
        let sample = HealthBodyMassSample(
            uuid: "946e6cf1-96f2-4e47-9d45-b0fab32db24d",
            occurredAt: occurredAt,
            kilograms: 64.2,
            sourceBundle: "com.example.scale",
            sourceName: "Scale",
            syncIdentifier: "evaorbit.weight.946e6cf1-96f2-4e47-9d45-b0fab32db24d",
            syncVersion: 2
        )
        try store.commitBodyMassDelta(samples: [sample], deletedUUIDs: [], encodedAnchor: Data("body-one".utf8), now: occurredAt)
        let first = try store.takePendingBodyMassBatch(limit: 10, now: occurredAt)
        XCTAssertEqual(first.count, 1)
        XCTAssertEqual(first[0].weightKg, 64.2)
        XCTAssertEqual(first[0].sourceBundle, "com.example.scale")
        XCTAssertEqual(first[0].syncVersion, 2)
        try store.recoverInflight(now: occurredAt)
        let recovered = try store.takePendingBodyMassBatch(limit: 10, now: occurredAt)
        XCTAssertEqual(recovered.map(\.id), first.map(\.id))
        try store.completeBodyMassUpload(ids: recovered.map(\.id), now: occurredAt)
        XCTAssertEqual(store.pendingCount(), 0)

        try store.commitBodyMassDelta(samples: [], deletedUUIDs: [sample.uuid], encodedAnchor: Data("body-two".utf8), now: occurredAt)
        let deletion = try store.takePendingBodyMassBatch(limit: 10, now: occurredAt)
        XCTAssertEqual(deletion.first?.operation, .delete)
        XCTAssertEqual(deletion.first?.sampleId, sample.uuid)
    }

    func testMenstrualFlowOutboxPreservesCategoryMetadataAndDeletion() throws {
        let start=Date(timeIntervalSince1970:1_788_912_000)
        let sample=HealthMenstrualFlowSample(uuid:"946e6cf1-96f2-4e47-9d45-b0fab32db24d",startDate:start,endDate:start,flow:.heavy,cycleStart:true,sourceBundle:"com.apple.Health",sourceName:"Health",syncIdentifier:"evaorbit.menstrual_flow.946e6cf1-96f2-4e47-9d45-b0fab32db24d",syncVersion:2)
        try store.commitMenstrualFlowDelta(samples:[sample],deletedUUIDs:[],encodedAnchor:Data("flow-one".utf8),now:start)
        let upserts=try store.takePendingMenstrualFlowBatch(limit:10,now:start)
        XCTAssertEqual(upserts.count,1);XCTAssertEqual(upserts[0].flow,.heavy);XCTAssertEqual(upserts[0].cycleStart,true);XCTAssertEqual(upserts[0].syncVersion,2)
        try store.completeMenstrualFlowUpload(ids:upserts.map(\.id),now:start)
        try store.commitMenstrualFlowDelta(samples:[],deletedUUIDs:[sample.uuid],encodedAnchor:Data("flow-two".utf8),now:start)
        let deletion=try store.takePendingMenstrualFlowBatch(limit:10,now:start)
        XCTAssertEqual(deletion.first?.operation,.delete);XCTAssertEqual(deletion.first?.sampleId,sample.uuid)
    }

    func testMenstrualFlowAnchorCanBeResetForAuthorizationUpgrade() throws {
        let start=Date(timeIntervalSince1970:1_788_912_000)
        try store.commitMenstrualFlowDelta(samples:[],deletedUUIDs:[],encodedAnchor:Data("old-flow-anchor".utf8),now:start)
        XCTAssertNotNil(try store.menstrualFlowAnchor())
        try store.resetMenstrualFlowAnchor()
        XCTAssertNil(try store.menstrualFlowAnchor())
    }

    func testMenstrualFlowValueUsesCurrentBleedingCategoriesAndKeepsUnknownSamples() {
        XCTAssertEqual(SystemHealthKitClient.flowValue(HKCategoryValueMenstrualFlow.heavy.rawValue), .heavy)
        XCTAssertEqual(SystemHealthKitClient.flowValue(Int.max), .unspecified)
        if #available(iOS 18.0, *) {
            XCTAssertEqual(SystemHealthKitClient.flowValue(HKCategoryValueVaginalBleeding.light.rawValue), .light)
        }
    }

    func testReadOutboxPreservesIntervalsRecoversAndKeepsHeartMetricsDisabled() throws {
        let sample = HealthReadSample(sampleId: "946e6cf1-96f2-4e47-9d45-b0fab32db24d", metric: .sleep,
            startAt: "2026-10-04T15:00:00.000Z", endAt: "2026-10-04T23:00:00.000Z", timeZone: "Asia/Shanghai", timeZoneSource: "metadata",
            stage: 5, value: nil, unit: nil, sourceBundle: "watch", sourceName: "Watch", syncIdentifier: "sleep.1", syncVersion: 2)
        let now = Date()
        try store.commitReadDelta(metric: .sleep, delta: HealthReadDelta(added: [sample], deletedUUIDs: [], encodedAnchor: Data("sleep-one".utf8)), now: now)
        let first = try store.takePendingReadBatch(limit: 50, now: now)
        XCTAssertEqual(first.count, 1)
        XCTAssertEqual(first[0].change.stage, 5)
        XCTAssertEqual(first[0].change.startAt, sample.startAt)
        XCTAssertEqual(first[0].change.timeZone, sample.timeZone)
        XCTAssertEqual(try store.readAnchor(for: .sleep), Data("sleep-one".utf8))
        try store.recoverInflight(now: now)
        let recovered = try store.takePendingReadBatch(limit: 50, now: now)
        XCTAssertEqual(recovered.map(\.id), first.map(\.id))
        try store.failReadUpload(ids: recovered.map(\.id), reason: "network", now: now)
        XCTAssertTrue(try store.takePendingReadBatch(limit: 50, now: now.addingTimeInterval(10)).isEmpty)
        let retry = try store.takePendingReadBatch(limit: 50, now: now.addingTimeInterval(20))
        XCTAssertEqual(retry.map(\.id), first.map(\.id))
        try store.completeReadUpload(ids: retry.map(\.id), now: now)
        try store.commitReadDelta(metric: .sleep, delta: HealthReadDelta(added: [], deletedUUIDs: [sample.sampleId], encodedAnchor: Data("sleep-two".utf8)), now: now)
        let deletion = try store.takePendingReadBatch(limit: 50, now: now)
        XCTAssertEqual(deletion[0].change.operation, "delete")
        XCTAssertGreaterThan(deletion[0].change.revision, first[0].change.revision)
        try store.completeReadUpload(ids: deletion.map(\.id), now: now)
        let heart = HealthReadSample(sampleId: "946e6cf1-96f2-4e47-9d45-b0fab32db24e", metric: .heartRate,
            startAt: sample.startAt, endAt: sample.endAt, timeZone: sample.timeZone, timeZoneSource: sample.timeZoneSource,
            stage: nil, value: 60, unit: "count/min", sourceBundle: "watch", sourceName: "Watch", syncIdentifier: nil, syncVersion: nil)
        try store.commitReadDelta(metric: .heartRate, delta: HealthReadDelta(added: [heart], deletedUUIDs: [], encodedAnchor: Data("heart-one".utf8)), now: now)
        XCTAssertTrue(try store.takePendingReadBatch(limit: 50, now: now).isEmpty)
        try store.setMetadata("readSyncMetrics", value: "sleep,heart_rate")
        let enabled = try store.takePendingReadBatch(limit: 50, now: now)
        XCTAssertEqual(enabled[0].change.metric, .heartRate)
        XCTAssertEqual(enabled[0].change.unit, "count/min")
        try store.resetReadAnchors()
        XCTAssertNil(try store.readAnchor(for: .sleep))
        XCTAssertNil(try store.readAnchor(for: .heartRate))
        try store.commitReadDelta(metric: .sleep, delta: HealthReadDelta(added: [], deletedUUIDs: [], encodedAnchor: Data("stale".utf8)), authorizationEpoch: "unversioned")
        XCTAssertNil(try store.readAnchor(for: .sleep), "an in-flight query before an authorization rescan must not restore its old anchor")
    }

    func testReadOutboxPrioritizesRecentRevisionsAndDeletions() throws {
        func sample(_ id: String, _ day: String) -> HealthReadSample {
            HealthReadSample(sampleId: id, metric: .sleep, startAt: "2026-10-\(day)T15:00:00.000Z", endAt: "2026-10-\(day)T23:00:00.000Z", timeZone: "Asia/Shanghai", timeZoneSource: "metadata", stage: 3, value: nil, unit: nil, sourceBundle: "test", sourceName: "Test", syncIdentifier: nil, syncVersion: nil)
        }
        let old = sample("946e6cf1-96f2-4e47-9d45-b0fab32db24d", "02")
        let recent = sample("946e6cf1-96f2-4e47-9d45-b0fab32db24e", "04")
        try store.commitReadDelta(metric: .sleep, delta: HealthReadDelta(added: [old, recent], deletedUUIDs: [], encodedAnchor: Data("one".utf8)))
        let first = try store.takePendingReadBatch(limit: 1)
        XCTAssertEqual(first.first?.change.sampleId, recent.sampleId)
        try store.completeReadUpload(ids: first.map(\.id))
        try store.commitReadDelta(metric: .sleep, delta: HealthReadDelta(added: [], deletedUUIDs: [recent.sampleId], encodedAnchor: Data("two".utf8)))
        XCTAssertEqual(try store.takePendingReadBatch(limit: 1).first?.change.operation, "delete")
    }

    func testUpgradeResetsOnlySleepAnchorOnceAndPrunesLegacyPendingJobs() throws {
        let url = temporaryDirectory.appendingPathComponent("health.sqlite3")
        try store.commitReadDelta(metric: .sleep, delta: HealthReadDelta(added: [], deletedUUIDs: [], encodedAnchor: Data("old".utf8)))
        try store.commitReadDelta(metric: .heartRate, delta: HealthReadDelta(added: [], deletedUUIDs: [], encodedAnchor: Data("heart".utf8)))
        try store.setMetadata("sleepSyncScope", value: "legacy")
        var database: OpaquePointer?
        XCTAssertEqual(sqlite3_open(url.path, &database), SQLITE_OK)
        defer { sqlite3_close(database) }
        let payload = "{\"operation\":\"upsert\",\"endAt\":\"2024-10-01T00:00:00.000Z\"}"
        XCTAssertEqual(sqlite3_exec(database, "INSERT INTO read_outbox(metric,sample_id,payload,state,updated_at) VALUES('sleep','legacy','\(payload)','pending',0)", nil, nil, nil), SQLITE_OK)
        store = nil
        store = try HealthLocalStore(databaseURL: url)
        XCTAssertNil(try store.readAnchor(for: .sleep))
        XCTAssertEqual(try store.readAnchor(for: .heartRate), Data("heart".utf8))
        XCTAssertTrue(try store.takePendingReadBatch(limit: 50).isEmpty)
        XCTAssertEqual(store.pendingCount(), 0)
        try store.commitReadDelta(metric: .sleep, delta: HealthReadDelta(added: [], deletedUUIDs: [], encodedAnchor: Data("new".utf8)))
        store = nil
        store = try HealthLocalStore(databaseURL: url)
        XCTAssertEqual(try store.readAnchor(for: .sleep), Data("new".utf8))
    }

    func testSleepCutoffDropsOldSamplesButKeepsPreviousNightStages() throws {
        let old = HealthReadSample(sampleId: "old", metric: .sleep, startAt: "2024-10-04T15:00:00.000Z", endAt: "2024-10-04T23:00:00.000Z", timeZone: "Asia/Shanghai", timeZoneSource: "metadata", stage: 3, value: nil, unit: nil, sourceBundle: "test", sourceName: "Test", syncIdentifier: nil, syncVersion: nil)
        let night = HealthReadSample(sampleId: "night", metric: .sleep, startAt: "2026-09-30T14:00:00.000Z", endAt: "2026-09-30T15:59:00.000Z", timeZone: "Asia/Shanghai", timeZoneSource: "metadata", stage: 3, value: nil, unit: nil, sourceBundle: "test", sourceName: "Test", syncIdentifier: nil, syncVersion: nil)
        try store.commitReadDelta(metric: .sleep, delta: HealthReadDelta(added: [old, night], deletedUUIDs: [], encodedAnchor: Data("cutoff".utf8)))
        XCTAssertEqual(try store.takePendingReadBatch(limit: 50).map(\.change.sampleId), ["night"])
        XCTAssertEqual(try store.readAnchor(for: .sleep), Data("cutoff".utf8))
    }

    func testAuthorizationStateAndInitialTodayYesterdayWindow() async throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try XCTUnwrap(TimeZone(identifier: "Asia/Shanghai"))
        let credentialStore = HealthCredentialStore()
        let uploader = HealthUploadManager(store: store, credentialStore: credentialStore)
        let healthKit = FakeHealthKitClient()
        let coordinator = HealthKitCoordinator(healthKit: healthKit, store: store, uploader: uploader, calendar: calendar)

        try store.setMetadata("authorizationRequested", value: "true")
        XCTAssertFalse(coordinator.status().authorizationRequested)
        let status = try await coordinator.requestAuthorization()
        XCTAssertTrue(status.authorizationRequested)
        XCTAssertEqual(store.metadata("authorizationRevision"), HealthKitCoordinator.authorizationRevision)
        XCTAssertEqual(healthKit.authorizationRequests, 1)
        XCTAssertEqual(healthKit.queriedReadMetrics, [.sleep])
        XCTAssertEqual(status.readSyncMetrics, [.sleep])
        XCTAssertEqual(status.backgroundDelivery["heart_rate"], "sync_disabled")
        XCTAssertEqual(Set(healthKit.backgroundMetrics), Set(HealthMetric.allCases))
        XCTAssertEqual(healthKit.menstrualFlowAnchors.count, 1)
        XCTAssertNil(healthKit.menstrualFlowAnchors[0])

        let noon = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-09-01T04:00:00Z"))
        try await coordinator.saveBodyMass(kilograms: 64.2, occurredAt: noon, syncIdentifier: "evaorbit.weight.test", syncVersion: 1)
        XCTAssertEqual(healthKit.savedBodyMass, 64.2)

        let window = coordinator.initialWindow(now: noon)
        XCTAssertEqual(HealthDateFormatter.iso8601.string(from: window.start), "2026-08-30T16:00:00.000Z")
        XCTAssertEqual(HealthDateFormatter.iso8601.string(from: window.end), "2026-09-01T16:00:00.000Z")
    }
}

private final class FakeHealthKitClient: HealthKitReading {
    var queriedReadMetrics: [HealthReadMetric] = []
    func startReadObserver(for metric: HealthReadMetric, handler: @escaping (@escaping () -> Void) -> Void) throws {}
    func enableReadBackgroundDelivery(for metric: HealthReadMetric) async throws {}
    func anchoredReadDelta(for metric: HealthReadMetric, encodedAnchor: Data?) async throws -> HealthReadDelta {
        queriedReadMetrics.append(metric)
        return HealthReadDelta(added: [], deletedUUIDs: [], encodedAnchor: Data(metric.rawValue.utf8))
    }
    var isAvailable = true
    var authorizationRequests = 0
    var backgroundMetrics: [HealthMetric] = []
    var savedBodyMass: Double?
    var savedMenstrualFlow: HealthMenstrualFlowValue?
    var menstrualFlowAnchors: [Data?] = []

    func requestAuthorization() async throws { authorizationRequests += 1 }
    func startObserver(for metric: HealthMetric, handler: @escaping (@escaping () -> Void) -> Void) throws {}
    func enableBackgroundDelivery(for metric: HealthMetric) async throws { backgroundMetrics.append(metric) }
    func anchoredDelta(for metric: HealthMetric, encodedAnchor: Data?, initialStart: Date?) async throws -> HealthAnchorDelta {
        HealthAnchorDelta(added: [], deletedUUIDs: [], encodedAnchor: Data(metric.rawValue.utf8))
    }
    func recentSamples(for metric: HealthMetric, window: HealthDateWindow) async throws -> [HealthEnergySample] { [] }
    func dailyCumulativeSum(for metric: HealthMetric, window: HealthDateWindow) async throws -> Double { 0 }
    func anchoredBodyMassDelta(encodedAnchor: Data?, initialStart: Date?) async throws -> HealthBodyMassDelta { HealthBodyMassDelta(added: [], deletedUUIDs: [], encodedAnchor: Data("body_mass".utf8)) }
    func saveBodyMass(kilograms: Double, occurredAt: Date, syncIdentifier: String, syncVersion: Int) async throws { savedBodyMass = kilograms }
    func startMenstrualFlowObserver(handler: @escaping (@escaping () -> Void) -> Void) throws {}
    func enableMenstrualFlowBackgroundDelivery() async throws {}
    func anchoredMenstrualFlowDelta(encodedAnchor: Data?, initialStart: Date?) async throws -> HealthMenstrualFlowDelta { menstrualFlowAnchors.append(encodedAnchor); return HealthMenstrualFlowDelta(added:[],deletedUUIDs:[],encodedAnchor:Data("menstrual_flow".utf8)) }
    func saveMenstrualFlow(startAt: Date, endAt: Date, flow: HealthMenstrualFlowValue, cycleStart: Bool, syncIdentifier: String, syncVersion: Int) async throws { savedMenstrualFlow=flow }
    func deleteMenstrualFlow(sampleID: String?, syncIdentifier: String?) async throws {}
}
