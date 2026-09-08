import Foundation

enum EvaOrbitDate {
    static let timeZone: TimeZone = {
        guard let timeZone = TimeZone(identifier: "Asia/Shanghai") else {
            preconditionFailure("The EvaOrbit timezone must be available")
        }
        return timeZone
    }()

    static func string(from date: Date) -> String {
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        guard let year = components.year, let month = components.month, let day = components.day else {
            preconditionFailure("Gregorian dates must contain year, month, and day")
        }
        return String(format: "%04d-%02d-%02d", year, month, day)
    }

    static func date(from value: String) -> Date? {
        let parts = value.split(separator: "-", omittingEmptySubsequences: false)
        guard
            parts.count == 3,
            let year = Int(parts[0]),
            let month = Int(parts[1]),
            let day = Int(parts[2]),
            let date = calendar.date(from: DateComponents(year: year, month: month, day: day)),
            string(from: date) == value
        else { return nil }
        return date
    }

    static func today(now: Date = Date()) -> String {
        string(from: now)
    }

    private static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return calendar
    }
}

enum DailyEnergyInputError: LocalizedError, Equatable {
    case invalidDate
    case invalidEnergy
    case notesTooLong

    var errorDescription: String? {
        switch self {
        case .invalidDate:
            return "日期格式不正确"
        case .invalidEnergy:
            return "能量必须是 0 到 20000 之间的数字，或留空"
        case .notesTooLong:
            return "备注不能超过 2000 个字符"
        }
    }
}

@MainActor
final class DailyEnergyModel: ObservableObject {
    @Published private(set) var summary: DailyEnergySummary?
    @Published private(set) var isLoading = false
    @Published private(set) var isSaving = false
    @Published var selectedDate = EvaOrbitDate.today()
    @Published var restingEnergy = ""
    @Published var activeEnergy = ""
    @Published var notes = ""
    @Published var errorMessage: String?
    @Published var successMessage: String?

    private let client: APIClient?

    init(client: APIClient? = try? APIClient(), initialSummary: DailyEnergySummary? = nil) {
        self.client = client
        if let initialSummary { apply(initialSummary) }
    }

    func load(date: String? = nil) async {
        guard let client, !isLoading, !isSaving else { return }
        let requestedDate = date ?? selectedDate
        guard EvaOrbitDate.date(from: requestedDate) != nil else { return }

        if requestedDate != selectedDate {
            selectedDate = requestedDate
            summary = nil
            restingEnergy = ""
            activeEnergy = ""
            notes = ""
        }
        isLoading = true
        errorMessage = nil
        successMessage = nil
        defer { isLoading = false }
        do {
            apply(try await client.dailyEnergy(date: requestedDate))
        } catch {
            errorMessage = friendlyMessage(for: error)
        }
    }

    func save() async {
        guard let client, !isLoading, !isSaving else { return }
        errorMessage = nil
        successMessage = nil
        do {
            let update = try validatedUpdate()
            isSaving = true
            defer { isSaving = false }
            apply(try await client.saveDailyEnergy(update))
            successMessage = "Daily Energy 已保存"
        } catch {
            errorMessage = friendlyMessage(for: error)
        }
    }

    func validatedUpdate() throws -> DailyEnergyUpdate {
        guard EvaOrbitDate.date(from: selectedDate) != nil else {
            throw DailyEnergyInputError.invalidDate
        }
        if notes.utf16.count > 2_000 { throw DailyEnergyInputError.notesTooLong }
        return DailyEnergyUpdate(
            date: selectedDate,
            restingEnergyKcal: try energyValue(restingEnergy),
            activeEnergyKcal: try energyValue(activeEnergy),
            notes: notes
        )
    }

    func resetDraft() {
        guard let summary else { return }
        restingEnergy = inputText(summary.manualRestingEnergyKcal)
        activeEnergy = inputText(summary.manualActiveEnergyKcal)
        notes = summary.notes
        errorMessage = nil
    }

    private func energyValue(_ value: String) throws -> Double? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return nil }
        guard let number = Double(trimmed), number.isFinite, (0...20_000).contains(number) else {
            throw DailyEnergyInputError.invalidEnergy
        }
        return number
    }

    private func apply(_ summary: DailyEnergySummary) {
        self.summary = summary
        selectedDate = summary.date
        restingEnergy = inputText(summary.manualRestingEnergyKcal)
        activeEnergy = inputText(summary.manualActiveEnergyKcal)
        notes = summary.notes
    }

    private func inputText(_ value: Double?) -> String {
        guard let value else { return "" }
        return value.formatted(.number.precision(.fractionLength(0...2)).grouping(.never))
    }

    private func friendlyMessage(for error: Error) -> String {
        if let urlError = error as? URLError {
            switch urlError.code {
            case .notConnectedToInternet, .cannotConnectToHost, .cannotFindHost, .networkConnectionLost, .timedOut:
                return "暂时无法连接 EvaOrbit，输入内容仍保留在当前页面"
            default:
                break
            }
        }
        return (error as? LocalizedError)?.errorDescription ?? "请求失败，请重试"
    }
}
