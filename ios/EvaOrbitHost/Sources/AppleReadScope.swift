import Foundation

enum AppleReadScope {
    static let firstDay = "2026-10-01"
    // Earliest October 1 globally; each returned object is checked in its own timezone.
    static var queryStart: Date { ISO8601DateFormatter().date(from: "2026-09-30T10:00:00Z")! }
    static func start(in timeZone: TimeZone = .current) -> Date {
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = timeZone
        return calendar.date(from: DateComponents(year: 2026, month: 10, day: 1))!
    }
    static func includes(_ date: Date, timeZone: TimeZone = .current) -> Bool { date >= start(in: timeZone) }
}
