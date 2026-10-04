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
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                store.requestAccess(to: kind) { _, error in
                    if let error { continuation.resume(throwing: error) }
                    else { continuation.resume() }
                }
            }
        }
        return status()
    }

    private func readableCalendars(_ kind: EKEntityType, identifiers: [String]) throws -> [EKCalendar] {
        guard ["authorized", "full_access"].contains(permission(kind)) else { throw EventKitSyncError.unavailable }
        let calendars = store.calendars(for: kind).filter { identifiers.contains($0.calendarIdentifier) }
        guard Set(calendars.map(\.calendarIdentifier)) == Set(identifiers) else { throw EventKitSyncError.unavailable }
        return calendars
    }

    /// A missing batch item is not a deletion. Resolve it without time/completion windows.
    func getItem(kind: EKEntityType, identifier: String, externalIdentifier: String?, calendarIdentifier: String, sourceIdentifier: String) -> [String: Any] {
        guard let calendars = try? readableCalendars(kind, identifiers: [calendarIdentifier]),
              calendars.first?.source.sourceIdentifier == sourceIdentifier else { return ["status": "unavailable"] }
        func matchesKind(_ item: EKCalendarItem) -> Bool { kind == .event ? item is EKEvent : item is EKReminder }
        func found(_ item: EKCalendarItem) -> [String: Any] {
            if let event = item as? EKEvent { return ["status": "found", "item": eventDictionary(event)] }
            if let reminder = item as? EKReminder { return ["status": "found", "item": reminderDictionary(reminder)] }
            return ["status": "unavailable"]
        }
        if let item = store.calendarItem(withIdentifier: identifier) {
            return matchesKind(item) ? found(item) : ["status": "unavailable"]
        }
        if let externalIdentifier {
            let candidates = store.calendarItems(withExternalIdentifier: externalIdentifier).filter {
                matchesKind($0) && $0.calendar.calendarIdentifier == calendarIdentifier && $0.calendar.source.sourceIdentifier == sourceIdentifier
            }
            if candidates.count == 1 { return found(candidates[0]) }
            if candidates.count > 1 { return ["status": "unavailable"] }
        }
        // Recheck access before treating nil as a confirmed absence.
        guard (try? readableCalendars(kind, identifiers: [calendarIdentifier])) != nil else { return ["status": "unavailable"] }
        return ["status": "missing"]
    }

    func fetchEvents(calendarIDs: [String], from: Date, to: Date) throws -> [[String: Any]] {
        let calendars = try readableCalendars(.event, identifiers: calendarIDs)
        guard !calendars.isEmpty else { return [] }
        return store.events(matching: store.predicateForEvents(withStart: from, end: to, calendars: calendars)).map(eventDictionary)
    }

    /// Rebind an account link without relying on discovery windows or mutable content.
    func recover(kind: EKEntityType, calendarIDs: [String], bindings: [[String: Any]], externalIdentifiers: [String], recoveryToken: String?) async throws -> [String: Any] {
        _ = try readableCalendars(kind, identifiers: calendarIDs)
        var candidates: [String: EKCalendarItem] = [:]
        func add(_ item: EKCalendarItem) {
            guard kind == .event ? item is EKEvent : item is EKReminder else { return }
            candidates[item.calendarItemIdentifier] = item
        }
        // For a pending next occurrence only its new token is supplied, not the old completed binding.
        for binding in bindings {
            let external = binding["external_identifier"] as? String
            if let identifier = binding["calendar_item_identifier"] as? String,
               let item = store.calendarItem(withIdentifier: identifier),
               (external != nil && item.calendarItemExternalIdentifier == external) ||
               (external == nil && item.calendar.calendarIdentifier == binding["calendar_identifier"] as? String && item.calendar.source.sourceIdentifier == binding["source_identifier"] as? String) { add(item) }
            if let external { store.calendarItems(withExternalIdentifier: external).forEach(add) }
        }
        externalIdentifiers.forEach { store.calendarItems(withExternalIdentifier: $0).forEach(add) }
        if kind == .reminder, let recoveryToken {
            // Scan all readable lists, including old completed mirrors and moved mirrors.
            // An object outside the selected lists pauses the link instead of causing recreation.
            let reminders: [EKReminder] = try await withCheckedThrowingContinuation { continuation in
                store.fetchReminders(matching: store.predicateForReminders(in: nil)) { items in
                    if let items { continuation.resume(returning: items) }
                    else { continuation.resume(throwing: EventKitSyncError.unavailable) }
                }
            }
            reminders.filter { Self.recoveryToken(in: $0.url) == recoveryToken.lowercased() }.forEach(add)
        }
        _ = try readableCalendars(kind, identifiers: calendarIDs)
        if candidates.count > 1 { return ["status": "ambiguous"] }
        if let item = candidates.values.first {
            guard calendarIDs.contains(item.calendar.calendarIdentifier) else { return ["status": "unavailable"] }
            if let event = item as? EKEvent { return ["status": "found", "item": eventDictionary(event)] }
            if let reminder = item as? EKReminder { return ["status": "found", "item": reminderDictionary(reminder)] }
        }
        // Empty local lookup alone cannot prove an old object was deleted after identifier churn.
        let originalScopeReadable = bindings.contains { binding in
            guard let calendarID = binding["calendar_identifier"] as? String,
                  let sourceID = binding["source_identifier"] as? String,
                  let calendar = store.calendar(withIdentifier: calendarID) else { return false }
            return calendarIDs.contains(calendarID) && calendar.source.sourceIdentifier == sourceID && binding["external_identifier"] is String
        }
        if bindings.isEmpty && kind == .reminder && recoveryToken != nil { return ["status": "missing"] }
        return ["status": originalScopeReadable ? "missing" : "unavailable"]
    }

    static func recoveryToken(in url: URL?) -> String? {
        guard let url, url.scheme == "evaorbit", url.host == "eventkit", url.query == nil, url.fragment == nil,
              UUID(uuidString: String(url.path.dropFirst())) != nil else { return nil }
        return String(url.path.dropFirst()).lowercased()
    }

    static func recoveryURL(existing: URL?, token: String?) -> URL? {
        guard existing == nil, let token, UUID(uuidString: token) != nil else { return existing }
        return URL(string: "evaorbit://eventkit/\(token.lowercased())")
    }

    func fetchReminders(calendarIDs: [String], completedSince:Date) async throws -> [[String: Any]] {
        let calendars = try readableCalendars(.reminder, identifiers: calendarIDs)
        guard !calendars.isEmpty else { return [] }
        func fetch(_ predicate:NSPredicate) async throws -> [EKReminder] { try await withCheckedThrowingContinuation { continuation in store.fetchReminders(matching:predicate){items in if let items { continuation.resume(returning:items) } else { continuation.resume(throwing:EventKitSyncError.unavailable) }} } }
        let incomplete=try await fetch(store.predicateForIncompleteReminders(withDueDateStarting:nil,ending:nil,calendars:calendars))
        let completed=try await fetch(store.predicateForCompletedReminders(withCompletionDateStarting:completedSince,ending:nil,calendars:calendars))
        var seen = Set<String>()
        return (incomplete + completed).filter { seen.insert($0.calendarItemIdentifier).inserted }.map(reminderDictionary)
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

    static func reminderDueComponents(date:String,time:String?,timezone:String?) -> DateComponents? {
        let dateParts=date.split(separator:"-").compactMap { Int($0) }
        guard dateParts.count == 3 else { return nil }
        var components=DateComponents();components.calendar=Calendar(identifier:.gregorian);components.year=dateParts[0];components.month=dateParts[1];components.day=dateParts[2]
        if let time { let timeParts=time.split(separator:":").compactMap { Int($0) };guard timeParts.count == 2 else { return nil };components.hour=timeParts[0];components.minute=timeParts[1] }
        if let timezone { guard let zone=TimeZone(identifier:timezone) else { return nil };components.timeZone=zone }
        return components
    }

    func saveReminder(_ value: [String: Any]) throws -> [String: Any] {
        if let token = value["recoveryToken"], !(token is NSNull) {
            guard let text = token as? String, UUID(uuidString: text) != nil else { throw EventKitSyncError.invalidInput }
        }
        let reminder: EKReminder
        if let identifier = value["calendarItemIdentifier"] as? String {
            guard let existing = store.calendarItem(withIdentifier: identifier) as? EKReminder else { throw EventKitSyncError.unavailable }
            reminder = existing
        }
        else { reminder = EKReminder(eventStore: store) }
        guard let title = value["title"] as? String, !title.isEmpty,
              let calendarID = value["calendarIdentifier"] as? String,
              let calendar = store.calendar(withIdentifier: calendarID), calendar.allowsContentModifications
        else { throw EventKitSyncError.invalidInput }
        reminder.calendar = calendar; reminder.title = title; reminder.notes = value["notes"] as? String
        // User URLs always win; the marker contains only an opaque, server-reserved UUID.
        reminder.url = Self.recoveryURL(existing: reminder.url, token: value["recoveryToken"] as? String)
        reminder.priority = value["priority"] as? Int ?? 0; reminder.isCompleted = value["completed"] as? Bool ?? false
        reminder.completionDate = isoDate(value["completionDate"])
        if let dueDate = value["dueDate"] as? String {
            guard let components=Self.reminderDueComponents(date:dueDate,time:value["dueTime"] as? String,timezone:value["timezone"] as? String) else { throw EventKitSyncError.invalidInput }
            reminder.dueDateComponents=components
            reminder.startDateComponents=components
        } else { reminder.dueDateComponents=nil;reminder.startDateComponents=nil }
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
    private func reminderDictionary(_ reminder: EKReminder) -> [String: Any] {
        let due = reminder.dueDateComponents
        let dueDate: String? = {
            guard let year = due?.year, let month = due?.month, let day = due?.day else { return nil }
            return String(format: "%04d-%02d-%02d", year, month, day)
        }()
        let dueTime: String? = {
            guard let hour = due?.hour, let minute = due?.minute else { return nil }
            return String(format: "%02d:%02d", hour, minute)
        }()
        let alarms = (reminder.alarms ?? []).map { alarm in
            compact([
                "absoluteAt": alarm.absoluteDate.map(iso),
                "relativeOffset": alarm.absoluteDate == nil ? alarm.relativeOffset : nil,
            ])
        }

        return compact([
            "calendarItemIdentifier": reminder.calendarItemIdentifier,
            "externalIdentifier": reminder.calendarItemExternalIdentifier,
            "calendarIdentifier": reminder.calendar.calendarIdentifier,
            "sourceIdentifier": reminder.calendar.source.sourceIdentifier,
            "title": reminder.title ?? "",
            "notes": reminder.notes,
            "url": reminder.url?.absoluteString,
            "dueDate": dueDate,
            "dueTime": dueTime,
            "timezone": due?.timeZone?.identifier,
            "priority": reminder.priority,
            "completed": reminder.isCompleted,
            "completionDate": reminder.completionDate.map(iso),
            "alarms": alarms,
            "lastModifiedAt": reminder.lastModifiedDate.map(iso),
        ])
    }
    private func compact(_ values:[String:Any?])->[String:Any]{values.compactMapValues{$0}}
    private func iso(_ date:Date)->String{ISO8601DateFormatter().string(from:date)}
    private func isoDate(_ value:Any?)->Date?{guard let text=value as? String else{return nil};let fractional=ISO8601DateFormatter();fractional.formatOptions=[.withInternetDateTime,.withFractionalSeconds];return fractional.date(from:text) ?? ISO8601DateFormatter().date(from:text)}
    private func day(_ date:Date,zone:String)->String{let f=DateFormatter();f.calendar=Calendar(identifier:.gregorian);f.locale=Locale(identifier:"en_US_POSIX");f.timeZone=TimeZone(identifier:zone);f.dateFormat="yyyy-MM-dd";return f.string(from:date)}
    private func date(_ value:Any?,allDay:Bool,timezone:String?)->Date?{guard let text=value as? String else{return nil};if !allDay{return isoDate(text)};let f=DateFormatter();f.calendar=Calendar(identifier:.gregorian);f.locale=Locale(identifier:"en_US_POSIX");f.timeZone=timezone.flatMap(TimeZone.init(identifier:)) ?? .current;f.dateFormat="yyyy-MM-dd";return f.date(from:text)}
}

enum EventKitSyncError:LocalizedError{case invalidInput,unavailable;var errorDescription:String?{switch self{case .invalidInput:return "EventKit sync input is invalid.";case .unavailable:return "EventKit source or item is unavailable; retry after access is restored."}}}
