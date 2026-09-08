import Foundation
import Testing
@testable import EvaOrbitNative

@Test func evaOrbitDateUsesTheShanghaiCalendarDay() throws {
    let instant = try #require(ISO8601DateFormatter().date(from: "2026-09-07T16:30:00Z"))
    #expect(EvaOrbitDate.today(now: instant) == "2026-09-08")
    #expect(EvaOrbitDate.date(from: "2026-02-29") == nil)
    #expect(EvaOrbitDate.date(from: "2026-09-08") != nil)
}

@Test @MainActor func dailyEnergyAcceptsOptionalValuesAndPreservesNotes() throws {
    let model = DailyEnergyModel(client: nil)
    model.selectedDate = "2026-09-08"
    model.restingEnergy = " 1500.5 "
    model.activeEnergy = ""
    model.notes = "普通的一天"

    #expect(try model.validatedUpdate() == DailyEnergyUpdate(
        date: "2026-09-08",
        restingEnergyKcal: 1500.5,
        activeEnergyKcal: nil,
        notes: "普通的一天"
    ))
}

@Test @MainActor func dailyEnergyRejectsValuesOutsideTheServerRange() {
    let model = DailyEnergyModel(client: nil)
    model.restingEnergy = "20001"
    #expect(throws: DailyEnergyInputError.invalidEnergy) {
        try model.validatedUpdate()
    }
}

@Test @MainActor func dailyEnergyResetRestoresTheLoadedSummary() {
    let summary = DailyEnergySummary(
        date: "2026-09-08",
        estimatedIntakeKcal: 1200,
        restingEnergyKcal: 1500,
        activeEnergyKcal: 300,
        totalExpenditureKcal: 1800,
        energyBalance: -600,
        notes: "已保存",
        manualRestingEnergyKcal: 1500,
        manualActiveEnergyKcal: 300,
        restingEnergySource: "manual",
        activeEnergySource: "manual"
    )
    let model = DailyEnergyModel(client: nil, initialSummary: summary)
    model.restingEnergy = "1600"
    model.activeEnergy = "400"
    model.notes = "未保存"

    model.resetDraft()

    #expect(model.restingEnergy == "1500")
    #expect(model.activeEnergy == "300")
    #expect(model.notes == "已保存")
}
