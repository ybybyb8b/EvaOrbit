import EventKit
import Foundation

final class EventKitSyncEngine {
    private let store = EKEventStore()
    private var changeWork: DispatchWorkItem?
    private let installationID: String
    var onStoreChanged: (() -> Void)?

    init() {
        let key="eventkit.installation-id"
        if let saved=UserDefaults.standard.string(forKey:key),UUID(uuidString:saved) != nil { installationID=saved }
        else { let value=UUID().uuidString.lowercased();UserDefaults.standard.set(value,forKey:key);installationID=value }
        NotificationCenter.default.addObserver(self, selector: #selector(storeChanged), name: .EKEventStoreChanged, object: store)
    }

    deinit { NotificationCenter.default.removeObserver(self) }

    @objc private func storeChanged() {
        changeWork?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.onStoreChanged?() }
        changeWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5, execute: work)
    }

    func status() -> [String: Any] {
        ["available": true, "installationId":installationID, "calendarPermission": permission(.event), "reminderPermission": permission(.reminder), "calendars": sources(.event), "reminderLists": sources(.reminder)]
    }

    func requestAccess(_ kind: EKEntityType) async throws -> [String: Any] {
        if #available(iOS 17.0, *) {
            if kind == .event { _ = try await store.requestFullAccessToEvents() }
            else { _ = try await store.requestFullAccessToReminders() }
        } else {
            _ = try await withCheckedThrowingContinuation { continuation in
                store.requestAccess(to: kind) { granted, error in
                    if let error { continuation.resume(throwing: error) }
                    else { continuation.resume(returning: granted) }
                }
            }
        }
        return status()
    }

    func fetchEvents(calendarIDs: [String], from: Date, to: Date) -> [[String: Any]] {
        let calendars = store.calendars(for: .event).filter { calendarIDs.contains($0.calendarIdentifier) }
        guard !calendars.isEmpty else { return [] }
        return store.events(matching: store.predicateForEvents(withStart: from, end: to, calendars: calendars)).map(eventDictionary)
    }

    func fetchReminders(calendarIDs: [String], completedSince:Date) async throws -> [[String: Any]] {
        let calendars = store.calendars(for: .reminder).filter { calendarIDs.contains($0.calendarIdentifier) }
        guard !calendars.isEmpty else { return [] }
        func fetch(_ predicate:NSPredicate) async -> [EKReminder] { await withCheckedContinuation { continuation in store.fetchReminders(matching:predicate){continuation.resume(returning:$0 ?? [])} } }
        async let incomplete=fetch(store.predicateForIncompleteReminders(withDueDateStarting:nil,ending:nil,calendars:calendars))
        async let completed=fetch(store.predicateForCompletedReminders(withCompletionDateStarting:completedSince,ending:nil,calendars:calendars))
        let values = await (incomplete, completed)
        var seen = Set<String>()
        return (values.0 + values.1).filter { seen.insert($0.calendarItemIdentifier).inserted }.map(reminderDictionary)
    }

    func saveEvent(_ value: [String: Any]) throws -> [String: Any] {
        let event: EKEvent
        if let identifier = value["calendarItemIdentifier"] as? String, let existing = store.calendarItem(withIdentifier: identifier) as? EKEvent { event = existing }
        else { event = EKEvent(eventStore: store) }
        guard let title = value["title"] as? String, !title.isEmpty,
              let calendarID = value["calendarIdentifier"] as? String,
              let calendar = store.calendar(withIdentifier: calendarID), calendar.allowsContentModifications,
              let start = date(value["startAt"], allDay: value["isAllDay"] as? Bool ?? false, timezone: value["timezone"] as? String),
              let end = date(value["endAt"], allDay: value["isAllDay"] as? Bool ?? false, timezone: value["timezone"] as? String), end > start
        else { throw EventKitSyncError.invalidInput }
        event.calendar = calendar; event.title = title; event.notes = value["notes"] as? String; event.location = value["location"] as? String
        event.isAllDay = value["isAllDay"] as? Bool ?? false; event.startDate = start; event.endDate = end
        if let zone = value["timezone"] as? String { event.timeZone = TimeZone(identifier: zone) }
        try store.save(event, span: .thisEvent, commit: true)
        return eventDictionary(event)
    }

    func saveReminder(_ value: [String: Any]) throws -> [String: Any] {
        let reminder: EKReminder
        if let identifier = value["calendarItemIdentifier"] as? String, let existing = store.calendarItem(withIdentifier: identifier) as? EKReminder { reminder = existing }
        else { reminder = EKReminder(eventStore: store) }
        guard let title = value["title"] as? String, !title.isEmpty,
              let calendarID = value["calendarIdentifier"] as? String,
              let calendar = store.calendar(withIdentifier: calendarID), calendar.allowsContentModifications
        else { throw EventKitSyncError.invalidInput }
        reminder.calendar = calendar; reminder.title = title; reminder.notes = value["notes"] as? String
        reminder.priority = value["priority"] as? Int ?? 0; reminder.isCompleted = value["completed"] as? Bool ?? false
        reminder.completionDate = isoDate(value["completionDate"])
        if let dueDate = value["dueDate"] as? String {
            var components = DateComponents(); let parts = dueDate.split(separator: "-").compactMap { Int($0) }
            if parts.count == 3 { components.year=parts[0];components.month=parts[1];components.day=parts[2] }
            if let dueTime = value["dueTime"] as? String { let time=dueTime.split(separator:":").compactMap{Int($0)};if time.count==2{components.hour=time[0];components.minute=time[1]} }
            components.timeZone=(value["timezone"] as? String).flatMap(TimeZone.init(identifier:)); reminder.dueDateComponents=components
        } else { reminder.dueDateComponents=nil }
        reminder.alarms=(value["alarms"] as? [[String:Any]] ?? []).compactMap { alarm in
            if let absolute=isoDate(alarm["absoluteAt"]) { return EKAlarm(absoluteDate:absolute) }
            if let offset=alarm["relativeOffset"] as? Double { return EKAlarm(relativeOffset:offset) }
            return nil
        }
        try store.save(reminder, commit: true)
        return reminderDictionary(reminder)
    }

    func delete(kind: EKEntityType, identifier: String) throws {
        guard let item = store.calendarItem(withIdentifier: identifier) else { return }
        if kind == .event, let event=item as? EKEvent { try store.remove(event, span:.thisEvent, commit:true) }
        else if kind == .reminder, let reminder=item as? EKReminder { try store.remove(reminder, commit:true) }
        else { throw EventKitSyncError.invalidInput }
    }

    private func permission(_ kind: EKEntityType) -> String {
        let status=EKEventStore.authorizationStatus(for:kind)
        if #available(iOS 17.0, *) { switch status { case .notDetermined:return "not_determined";case .restricted:return "restricted";case .denied:return "denied";case .authorized:return "authorized";case .fullAccess:return "full_access";case .writeOnly:return "write_only";@unknown default:return "unknown" } }
        switch status { case .notDetermined:return "not_determined";case .restricted:return "restricted";case .denied:return "denied";case .authorized:return "authorized";default:return "unknown" }
    }
    private func sources(_ kind: EKEntityType) -> [[String:Any]] { store.calendars(for:kind).map { ["identifier":$0.calendarIdentifier,"title":$0.title,"sourceIdentifier":$0.source.sourceIdentifier,"sourceTitle":$0.source.title,"allowsContentModifications":$0.allowsContentModifications] } }
    private func eventDictionary(_ event:EKEvent)->[String:Any]{let zone=event.timeZone?.identifier ?? TimeZone.current.identifier;return compact(["calendarItemIdentifier":event.calendarItemIdentifier,"externalIdentifier":event.calendarItemExternalIdentifier,"calendarIdentifier":event.calendar.calendarIdentifier,"sourceIdentifier":event.calendar.source.sourceIdentifier,"title":event.title ?? "","notes":event.notes,"startAt":event.isAllDay ? day(event.startDate,zone:zone) : iso(event.startDate),"endAt":event.isAllDay ? day(event.endDate,zone:zone) : iso(event.endDate),"isAllDay":event.isAllDay,"timezone":zone,"location":event.location,"status":eventStatus(event.status),"lastModifiedAt":event.lastModifiedDate.map(iso),"isRecurring":!(event.recurrenceRules?.isEmpty ?? true),"hasAttendees":!(event.attendees?.isEmpty ?? true)])}
    private func eventStatus(_ status:EKEventStatus)->String{switch status{case .tentative:return "tentative";case .canceled:return "cancelled";default:return "confirmed"}}
    private func reminderDictionary(_ reminder:EKReminder)->[String:Any]{let due=reminder.dueDateComponents;let dueDate=due.flatMap{components in components.year.flatMap{y in components.month.flatMap{m in components.day.map{d in String(format:"%04d-%02d-%02d",y,m,d)}}}}};let dueTime=due.flatMap{c in c.hour.flatMap{h in c.minute.map{m in String(format:"%02d:%02d",h,m)}}}};let alarms=(reminder.alarms ?? []).map{alarm in compact(["absoluteAt":alarm.absoluteDate.map(iso),"relativeOffset":alarm.relativeOffset])};return compact(["calendarItemIdentifier":reminder.calendarItemIdentifier,"externalIdentifier":reminder.calendarItemExternalIdentifier,"calendarIdentifier":reminder.calendar.calendarIdentifier,"sourceIdentifier":reminder.calendar.source.sourceIdentifier,"title":reminder.title ?? "","notes":reminder.notes,"dueDate":dueDate,"dueTime":dueTime,"timezone":due?.timeZone?.identifier,"priority":reminder.priority,"completed":reminder.isCompleted,"completionDate":reminder.completionDate.map(iso),"alarms":alarms,"lastModifiedAt":reminder.lastModifiedDate.map(iso)])}
    private func compact(_ values:[String:Any?])->[String:Any]{values.compactMapValues{$0}}
    private func iso(_ date:Date)->String{ISO8601DateFormatter().string(from:date)}
    private func isoDate(_ value:Any?)->Date?{guard let text=value as? String else{return nil};let fractional=ISO8601DateFormatter();fractional.formatOptions=[.withInternetDateTime,.withFractionalSeconds];return fractional.date(from:text) ?? ISO8601DateFormatter().date(from:text)}
    private func day(_ date:Date,zone:String)->String{let f=DateFormatter();f.calendar=Calendar(identifier:.gregorian);f.locale=Locale(identifier:"en_US_POSIX");f.timeZone=TimeZone(identifier:zone);f.dateFormat="yyyy-MM-dd";return f.string(from:date)}
    private func date(_ value:Any?,allDay:Bool,timezone:String?)->Date?{guard let text=value as? String else{return nil};if !allDay{return isoDate(text)};let f=DateFormatter();f.calendar=Calendar(identifier:.gregorian);f.locale=Locale(identifier:"en_US_POSIX");f.timeZone=timezone.flatMap(TimeZone.init(identifier:)) ?? .current;f.dateFormat="yyyy-MM-dd";return f.date(from:text)}
}

enum EventKitSyncError:LocalizedError{case invalidInput;var errorDescription:String?{"EventKit sync input is invalid."}}
