import UIKit
import WebKit
import EventKit

final class NativeBridge: NSObject, WKScriptMessageHandlerWithReply {
    static let name = "evaOrbit"
    static let protocolVersion = 1
    static let supportedMethods: Set<String> = [
        "host.ping", "host.getInfo", "host.notifyDataChanged", "navigation.openExternal",
        "appearance.setPreference",
        "haptic.play",
        "healthkit.getStatus", "healthkit.requestAuthorization", "healthkit.syncNow",
        "healthkit.configureCredential", "healthkit.clearCredential",
        "healthkit.saveBodyMass", "healthkit.saveMenstrualFlow", "healthkit.deleteMenstrualFlow",
        "notification.getStatus", "notification.requestAuthorization", "notification.schedule",
        "notification.cancel", "notification.listPending", "notification.openSettings"
        ,"eventkit.getStatus", "eventkit.requestAccess", "eventkit.fetch", "eventkit.getItem", "eventkit.recover", "eventkit.save", "eventkit.delete"
    ]

    static let bootstrapScript = #"""
    (() => {
      if (window.EvaOrbitNative) return;
      var sequence = 0;
      const call = (method, params = {}) => {
        sequence += 1;
        return window.webkit.messageHandlers.evaOrbit.postMessage({
          version: 1,
          id: `native-${Date.now()}-${sequence}`,
          method,
          params
        });
      };
      Object.defineProperty(window, "EvaOrbitNative", {
        configurable: false,
        enumerable: false,
        writable: false,
        value: Object.freeze({ version: 1, call })
      });
      window.dispatchEvent(new CustomEvent("evaorbit:native-ready", { detail: { version: 1 } }));
    })();
    """#

    private let hostConfiguration: HostConfiguration
    static let nativeIntegrationMethods = supportedMethods.filter { $0.hasPrefix("healthkit.") || $0.hasPrefix("eventkit.") || $0.hasPrefix("notification.") || $0 == "host.getInfo" || $0 == "host.notifyDataChanged" }
    static let trackerMethods: Set<String> = ["native.invoke", "native.api", "navigation.openNativeSettings", "business.request", "trackers.getSession", "trackers.signIn", "trackers.signOut", "trackers.readReplica", "trackers.commitReplica", "trackers.syncReplica", "trackers.readState", "trackers.commitState", "trackers.sync", "trackers.exportState", "trackers.readOnlySnapshot", "trackers.acceptanceStatus", "home.readOnlyResource", "food.readOnlySnapshot", "food.readOnlyResource", "cats.readOnlySnapshot", "settings.aiConfiguration", "settings.configuration", "workspaces.readOnlySnapshot", "media.readOnlySnapshot", "relations.readOnlySnapshot", "health.readOnlySnapshot", "subscriptions.readOnlySnapshot", "chronicle.readOnlySnapshot", "memo.readOnlySnapshot", "inbox.readOnlySnapshot"]
    static let localCoreMethods: Set<String> = ["host.ping", "host.getInfo", "haptic.play", "appearance.setPreference", "navigation.openExternal", "healthkit.getStatus", "eventkit.getStatus", "notification.getStatus", "notification.openSettings"]
    private let trackerController: TrackerLocalController?
    private let healthKitCoordinator: HealthKitCoordinator
    private let notificationManager: NotificationManager
    private let hapticFeedbackManager = HapticFeedbackManager()
    private let eventKitSyncEngine: EventKitSyncEngine
    var onDataChanged: (([String], String) -> Void)?

    static func dataChangeDomains(_ value: Any?) -> [String]? {
        let allowed: Set<String> = ["calendar", "tasks", "reminders", "health"]
        guard let domains = value as? [String], !domains.isEmpty, domains.count <= allowed.count,
              domains.allSatisfy({ allowed.contains($0) }) else { return nil }
        return Array(Set(domains)).sorted()
    }

    @MainActor init(hostConfiguration: HostConfiguration, healthKitCoordinator: HealthKitCoordinator, notificationManager: NotificationManager, eventKitSyncEngine: EventKitSyncEngine) {
        self.hostConfiguration = hostConfiguration
        if hostConfiguration.localTrackers, let database = try? TrackerLocalDatabase.live() {
            trackerController = TrackerLocalController(baseURL: hostConfiguration.baseURL, database: database)
        } else { trackerController = nil }
        self.healthKitCoordinator = healthKitCoordinator
        self.notificationManager = notificationManager
        self.eventKitSyncEngine = eventKitSyncEngine
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard message.name == Self.name, message.frameInfo.isMainFrame else {
            replyHandler(failure(id: nil, code: "untrusted_frame", message: "Bridge calls are limited to the main frame."), nil)
            return
        }

        guard let sourceURL = message.frameInfo.request.url, hostConfiguration.allows(sourceURL) || hostConfiguration.allowsTrackerUI(sourceURL) else {
            replyHandler(failure(id: nil, code: "untrusted_origin", message: "Bridge calls are limited to EvaOrbit."), nil)
            return
        }

        guard let request = message.body as? [String: Any],
              let version = request["version"] as? NSNumber,
              version.intValue == Self.protocolVersion,
              let identifier = request["id"] as? String,
              !identifier.isEmpty,
              let method = request["method"] as? String
        else {
            replyHandler(failure(id: nil, code: "invalid_request", message: "The bridge request is invalid."), nil)
            return
        }

        let parameters = request["params"] as? [String: Any] ?? [:]
        let isLocal = hostConfiguration.allowsTrackerUI(sourceURL)
        let allowed = isLocal ? Self.localCoreMethods.union(Self.trackerMethods) : Self.supportedMethods
        guard allowed.contains(method) else {
            replyHandler(failure(id: identifier, code: "unknown_method", message: "Unsupported native method."), nil)
            return
        }
        if Self.trackerMethods.contains(method) {
            handleTracker(method: method, parameters: parameters, id: identifier, webView: message.webView, replyHandler: replyHandler)
            return
        }
        dispatchCore(method: method, parameters: parameters, id: identifier, allowed: allowed, replyHandler: replyHandler)
    }

    private func dispatchCore(
        method: String,
        parameters: [String: Any],
        id identifier: String,
        allowed: Set<String>,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        switch method {
        case "host.ping":
            replyHandler(success(id: identifier, result: ["pong": true]), nil)
        case "host.getInfo":
            var info = hostInfo()
            info["methods"] = allowed.sorted()
            replyHandler(success(id: identifier, result: info), nil)
        case "host.notifyDataChanged":
            guard let domains = Self.dataChangeDomains(parameters["domains"]),
                  let source = parameters["source"] as? String, ["eventkit", "healthkit"].contains(source),
                  let notify = onDataChanged else {
                replyHandler(failure(id: identifier, code: "invalid_data_change", message: "Data change notification is unavailable or invalid."), nil)
                return
            }
            notify(domains, source)
            replyHandler(success(id: identifier, result: ["notified": true]), nil)
        case "navigation.openExternal":
            openExternal(parameters: parameters, id: identifier, replyHandler: replyHandler)
        case "appearance.setPreference":
            setAppearancePreference(parameters: parameters, id: identifier, replyHandler: replyHandler)
        case "haptic.play":
            playHaptic(parameters: parameters, id: identifier, replyHandler: replyHandler)
        case "healthkit.getStatus":
            replyHandler(success(id: identifier, result: healthKitCoordinator.status().dictionary), nil)
        case "healthkit.requestAuthorization":
            Task {
                do {
                    let status = try await healthKitCoordinator.requestAuthorization()
                    replyOnMain(replyHandler, value: success(id: identifier, result: status.dictionary))
                } catch {
                    replyOnMain(replyHandler, value: failure(id: identifier, code: "healthkit_authorization_failed", message: HealthDiagnostics.safe(error)))
                }
            }
        case "healthkit.syncNow":
            Task {
                let synced = await healthKitCoordinator.syncNow()
                let result: [String: Any] = ["synced": synced, "status": healthKitCoordinator.status().dictionary]
                replyOnMain(replyHandler, value: success(id: identifier, result: result))
            }
        case "healthkit.configureCredential":
            configureCredential(parameters: parameters, id: identifier, replyHandler: replyHandler)
        case "healthkit.clearCredential":
            healthKitCoordinator.clearCredential()
            replyHandler(success(id: identifier, result: ["configured": false]), nil)
        case "healthkit.saveBodyMass":
            saveBodyMass(parameters: parameters, id: identifier, replyHandler: replyHandler)
        case "healthkit.saveMenstrualFlow":
            saveMenstrualFlow(parameters: parameters, id: identifier, replyHandler: replyHandler)
        case "healthkit.deleteMenstrualFlow":
            deleteMenstrualFlow(parameters: parameters, id: identifier, replyHandler: replyHandler)
        case "notification.getStatus":
            Task { replyOnMain(replyHandler, value: success(id: identifier, result: await notificationManager.status())) }
        case "notification.requestAuthorization":
            Task {
                do {
                    let status = try await notificationManager.requestAuthorization()
                    replyOnMain(replyHandler, value: success(id: identifier, result: status))
                } catch {
                    replyOnMain(replyHandler, value: failure(id: identifier, code: "notification_authorization_failed", message: NativeDiagnostics.summary(error)))
                }
            }
        case "notification.schedule":
            scheduleNotification(parameters: parameters, id: identifier, replyHandler: replyHandler)
        case "notification.cancel":
            cancelNotification(parameters: parameters, id: identifier, replyHandler: replyHandler)
        case "notification.listPending":
            Task {
                let notifications = await notificationManager.pendingNotifications().map(\.dictionary)
                replyOnMain(replyHandler, value: success(id: identifier, result: ["notifications": notifications]))
            }
        case "notification.openSettings":
            Task {
                let opened = await notificationManager.openSettings()
                replyOnMain(replyHandler, value: success(id: identifier, result: ["opened": opened]))
            }
        case "eventkit.getStatus":
            replyHandler(success(id: identifier, result: eventKitSyncEngine.status()), nil)
        case "eventkit.requestAccess":
            eventKitRequestAccess(parameters: parameters, id: identifier, replyHandler: replyHandler)
        case "eventkit.fetch":
            eventKitFetch(parameters: parameters, id: identifier, replyHandler: replyHandler)
        case "eventkit.getItem":
            eventKitGetItem(parameters: parameters, id: identifier, replyHandler: replyHandler)
        case "eventkit.recover":
            eventKitRecover(parameters: parameters, id: identifier, replyHandler: replyHandler)
        case "eventkit.save":
            eventKitSave(parameters: parameters, id: identifier, replyHandler: replyHandler)
        case "eventkit.delete":
            eventKitDelete(parameters: parameters, id: identifier, replyHandler: replyHandler)
        default:
            assertionFailure("Whitelisted bridge method is not implemented")
            replyHandler(failure(id: identifier, code: "unknown_method", message: "Unsupported native method."), nil)
        }
    }

    private func eventKitKind(_ parameters:[String:Any])->EKEntityType?{switch parameters["kind"] as? String{case "calendar":return .event;case "reminder":return .reminder;default:return nil}}

    private func eventKitRequestAccess(parameters:[String:Any],id:String,replyHandler:@escaping(Any?,String?)->Void){guard let kind=eventKitKind(parameters)else{replyHandler(failure(id:id,code:"invalid_eventkit_kind",message:"EventKit kind is invalid."),nil);return};Task{do{let result=try await eventKitSyncEngine.requestAccess(kind);replyOnMain(replyHandler,value:success(id:id,result:result))}catch{replyOnMain(replyHandler,value:failure(id:id,code:"eventkit_authorization_failed",message:NativeDiagnostics.summary(error)))}}}

    private func eventKitFetch(parameters:[String:Any],id:String,replyHandler:@escaping(Any?,String?)->Void){guard let kind=eventKitKind(parameters),let calendarIDs=parameters["calendarIdentifiers"] as? [String],calendarIDs.count<=100,calendarIDs.allSatisfy({!$0.isEmpty&&$0.count<=500})else{replyHandler(failure(id:id,code:"invalid_eventkit_fetch",message:"EventKit fetch parameters are invalid."),nil);return};if kind == .event{guard let from=Self.parseISO8601(parameters["from"] as? String ?? ""),let to=Self.parseISO8601(parameters["to"] as? String ?? ""),to>from else{replyHandler(failure(id:id,code:"invalid_eventkit_window",message:"Calendar sync window is invalid."),nil);return};do{let items=try eventKitSyncEngine.fetchEvents(calendarIDs:calendarIDs,from:from,to:to);replyHandler(success(id:id,result:["items":items,"complete":true]),nil)}catch{replyHandler(failure(id:id,code:"eventkit_fetch_failed",message:NativeDiagnostics.summary(error)),nil)}}else{let completedSince=Self.parseISO8601(parameters["completedSince"] as? String ?? "") ?? AppleReadScope.queryStart;Task{do{let items=try await eventKitSyncEngine.fetchReminders(calendarIDs:calendarIDs,completedSince:completedSince);replyOnMain(replyHandler,value:success(id:id,result:["items":items,"complete":true]))}catch{replyOnMain(replyHandler,value:failure(id:id,code:"eventkit_fetch_failed",message:NativeDiagnostics.summary(error)))}}}}

    private func eventKitGetItem(parameters: [String: Any], id: String, replyHandler: @escaping (Any?, String?) -> Void) {
        func identifier(_ key: String) -> String? { guard let value = parameters[key] as? String, !value.isEmpty, value.count <= 500 else { return nil }; return value }
        guard let kind = eventKitKind(parameters), let itemID = identifier("calendarItemIdentifier"),
              let calendarID = identifier("calendarIdentifier"), let sourceID = identifier("sourceIdentifier"),
              parameters["externalIdentifier"] == nil || parameters["externalIdentifier"] is NSNull || identifier("externalIdentifier") != nil else {
            replyHandler(failure(id: id, code: "invalid_eventkit_lookup", message: "EventKit lookup parameters are invalid."), nil); return
        }
        replyHandler(success(id: id, result: eventKitSyncEngine.getItem(kind: kind, identifier: itemID, externalIdentifier: identifier("externalIdentifier"), calendarIdentifier: calendarID, sourceIdentifier: sourceID)), nil)
    }

    private func eventKitRecover(parameters: [String: Any], id: String, replyHandler: @escaping (Any?, String?) -> Void) {
        let token = parameters["recoveryToken"] as? String
        let externalIdentifiers = parameters["externalIdentifiers"] as? [String] ?? []
        guard let kind = eventKitKind(parameters), let calendars = parameters["calendarIdentifiers"] as? [String],
              !calendars.isEmpty, calendars.allSatisfy({ !$0.isEmpty && $0.count <= 500 }),
              (parameters["externalIdentifiers"] == nil || parameters["externalIdentifiers"] is [String]), externalIdentifiers.allSatisfy({ !$0.isEmpty && $0.count <= 500 }),
              let bindings = parameters["bindings"] as? [[String: Any]],
              bindings.allSatisfy({ binding in ["calendar_item_identifier", "calendar_identifier", "source_identifier"].allSatisfy { key in
                  guard let value = binding[key] as? String else { return false }; return !value.isEmpty && value.count <= 500
              } && (binding["external_identifier"] == nil || binding["external_identifier"] is NSNull || (binding["external_identifier"] as? String).map({ !$0.isEmpty && $0.count <= 500 }) == true) }),
              parameters["recoveryToken"] == nil || parameters["recoveryToken"] is NSNull || token.flatMap(UUID.init(uuidString:)) != nil else {
            replyHandler(failure(id: id, code: "invalid_eventkit_recovery", message: "EventKit recovery parameters are invalid."), nil); return
        }
        Task {
            do { let result = try await eventKitSyncEngine.recover(kind: kind, calendarIDs: calendars, bindings: bindings, externalIdentifiers: externalIdentifiers, recoveryToken: token, recoveryBatch: (parameters["recoveryBatch"] as? String).flatMap { UUID(uuidString: $0)?.uuidString }); replyOnMain(replyHandler, value: success(id: id, result: result)) }
            catch { replyOnMain(replyHandler, value: success(id: id, result: ["status": "unavailable"])) }
        }
    }

    private func eventKitSave(parameters:[String:Any],id:String,replyHandler:@escaping(Any?,String?)->Void){guard let kind=eventKitKind(parameters),let item=parameters["item"] as? [String:Any]else{replyHandler(failure(id:id,code:"invalid_eventkit_save",message:"EventKit item is invalid."),nil);return};do{let saved=try kind == .event ? eventKitSyncEngine.saveEvent(item) : eventKitSyncEngine.saveReminder(item);replyHandler(success(id:id,result:["item":saved]),nil)}catch{replyHandler(failure(id:id,code:"eventkit_save_failed",message:NativeDiagnostics.summary(error)),nil)}}

    private func eventKitDelete(parameters:[String:Any],id:String,replyHandler:@escaping(Any?,String?)->Void){guard let kind=eventKitKind(parameters),let itemID=parameters["calendarItemIdentifier"] as? String,!itemID.isEmpty,itemID.count<=500 else{replyHandler(failure(id:id,code:"invalid_eventkit_delete",message:"EventKit identifier is invalid."),nil);return};do{try eventKitSyncEngine.delete(kind:kind,identifier:itemID);replyHandler(success(id:id,result:["deleted":true]),nil)}catch{replyHandler(failure(id:id,code:"eventkit_delete_failed",message:NativeDiagnostics.summary(error)),nil)}}

    private func scheduleNotification(
        parameters: [String: Any],
        id: String,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard let notificationID = parameters["id"] as? String,
              let title = parameters["title"] as? String,
              let body = parameters["body"] as? String,
              let rawTrigger = parameters["triggerAt"] as? String,
              let triggerAt = Self.parseISO8601(rawTrigger)
        else {
            replyHandler(failure(id: id, code: "invalid_notification", message: "Notification parameters are invalid."), nil)
            return
        }
        Task {
            do {
                try await notificationManager.schedule(identifier: notificationID, title: title, body: body, triggerAt: triggerAt)
                replyOnMain(replyHandler, value: success(id: id, result: ["scheduled": true, "id": notificationID]))
            } catch {
                replyOnMain(replyHandler, value: failure(id: id, code: "notification_schedule_failed", message: NativeDiagnostics.summary(error)))
            }
        }
    }

    private func setAppearancePreference(
        parameters: [String: Any],
        id: String,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard let rawMode = parameters["appearanceMode"] as? String,
              let mode = NativeAppearanceMode(rawValue: rawMode),
              let rawTheme = parameters["colorTheme"] as? String,
              let theme = NativeThemeIdentifier(rawValue: rawTheme)
        else {
            replyHandler(failure(id: id, code: "invalid_appearance", message: "Appearance preference is invalid."), nil)
            return
        }

        NativeLoadingTheme.currentAppearanceMode = mode
        NativeLoadingTheme.currentIdentifier = theme
        DispatchQueue.main.async {
            UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows)
                .forEach { $0.overrideUserInterfaceStyle = mode.interfaceStyle }
            replyHandler(self.success(id: id, result: [
                "appearanceMode": mode.rawValue,
                "colorTheme": theme.rawValue,
            ]), nil)
        }
    }

    private func playHaptic(
        parameters: [String: Any],
        id: String,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard let rawKind = parameters["kind"] as? String,
              let kind = HapticFeedbackKind(rawValue: rawKind)
        else {
            replyHandler(failure(id: id, code: "invalid_haptic", message: "Haptic feedback kind is invalid."), nil)
            return
        }
        hapticFeedbackManager.play(kind)
        replyHandler(success(id: id, result: ["played": true, "kind": kind.rawValue]), nil)
    }

    private func cancelNotification(
        parameters: [String: Any],
        id: String,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard let notificationID = parameters["id"] as? String else {
            replyHandler(failure(id: id, code: "invalid_notification", message: "Notification identifier is missing."), nil)
            return
        }
        do {
            try notificationManager.cancel(identifier: notificationID)
            replyHandler(success(id: id, result: ["cancelled": true, "id": notificationID]), nil)
        } catch {
            replyHandler(failure(id: id, code: "notification_cancel_failed", message: NativeDiagnostics.summary(error)), nil)
        }
    }

    private static func parseISO8601(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }

    private func configureCredential(
        parameters: [String: Any],
        id: String,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard let credential = parameters["credential"] as? String,
              credential.count >= 32,
              let rawURL = parameters["ingestUrl"] as? String,
              let ingestURL = URL(string: rawURL),
              hostConfiguration.allows(ingestURL),
              ingestURL.path == "/api/healthkit/energy/ingest"
        else {
            replyHandler(failure(id: id, code: "invalid_credential_configuration", message: "Native credential configuration is invalid."), nil)
            return
        }
        do {
            let rawMetrics = parameters["syncMetrics"] as? [String] ?? ["sleep"]
            guard parameters["syncMetrics"] == nil || parameters["syncMetrics"] is [String],
                  rawMetrics.count <= HealthReadMetric.allCases.count,
                  rawMetrics.allSatisfy({ HealthReadMetric(rawValue: $0) != nil }) else {
                replyHandler(failure(id: id, code: "invalid_sync_policy", message: "HealthKit sync policy is invalid."), nil)
                return
            }
            let metrics = HealthReadMetric.allCases.filter { $0 == .sleep || rawMetrics.contains($0.rawValue) }
            try healthKitCoordinator.configureCredential(credential, ingestURL: ingestURL, syncMetrics: metrics)
            replyHandler(success(id: id, result: ["configured": true]), nil)
        } catch {
            replyHandler(failure(id: id, code: "credential_storage_failed", message: NativeDiagnostics.summary(error)), nil)
        }
    }

    private func saveBodyMass(parameters:[String:Any],id:String,replyHandler:@escaping(Any?,String?)->Void){
        guard let kilograms=(parameters["weightKg"] as? NSNumber)?.doubleValue,kilograms>=20,kilograms<=500,
              let rawDate=parameters["occurredAt"] as? String,let occurredAt=Self.parseISO8601(rawDate),
              let syncIdentifier=parameters["syncIdentifier"] as? String,
              syncIdentifier.range(of: #"^evaorbit\.weight\.[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"#, options: [.regularExpression, .caseInsensitive]) != nil,
              let syncVersion=(parameters["syncVersion"] as? NSNumber)?.intValue,syncVersion>=1 else {
            replyHandler(failure(id:id,code:"invalid_body_mass",message:"Body mass parameters are invalid."),nil);return
        }
        Task { do { try await healthKitCoordinator.saveBodyMass(kilograms:kilograms,occurredAt:occurredAt,syncIdentifier:syncIdentifier,syncVersion:syncVersion);replyOnMain(replyHandler,value:success(id:id,result:["saved":true])) } catch { replyOnMain(replyHandler,value:failure(id:id,code:"healthkit_body_mass_write_failed",message:HealthDiagnostics.safe(error))) } }
    }

    private func saveMenstrualFlow(parameters:[String:Any],id:String,replyHandler:@escaping(Any?,String?)->Void){
        guard let rawStart=parameters["startAt"] as? String,let startAt=Self.parseISO8601(rawStart),let rawEnd=parameters["endAt"] as? String,let endAt=Self.parseISO8601(rawEnd),endAt>=startAt,
              let rawFlow=parameters["flow"] as? String,let flow=HealthMenstrualFlowValue(rawValue:rawFlow),let cycleStart=parameters["cycleStart"] as? Bool,
              let syncIdentifier=parameters["syncIdentifier"] as? String,syncIdentifier.range(of:#"^evaorbit\.menstrual_flow\.[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"#,options:[.regularExpression,.caseInsensitive]) != nil,
              let syncVersion=(parameters["syncVersion"] as? NSNumber)?.intValue,syncVersion>=1 else { replyHandler(failure(id:id,code:"invalid_menstrual_flow",message:"Menstrual flow parameters are invalid."),nil);return }
        Task { do { try await healthKitCoordinator.saveMenstrualFlow(startAt:startAt,endAt:endAt,flow:flow,cycleStart:cycleStart,syncIdentifier:syncIdentifier,syncVersion:syncVersion);replyOnMain(replyHandler,value:success(id:id,result:["saved":true])) } catch { replyOnMain(replyHandler,value:failure(id:id,code:"healthkit_menstrual_flow_write_failed",message:HealthDiagnostics.safe(error))) } }
    }

    private func deleteMenstrualFlow(parameters:[String:Any],id:String,replyHandler:@escaping(Any?,String?)->Void){
        let sampleID=parameters["sampleId"] as? String,syncIdentifier=parameters["syncIdentifier"] as? String
        let validSample=sampleID.flatMap(UUID.init(uuidString:)) != nil
        let validSync=syncIdentifier?.range(of:#"^evaorbit\.menstrual_flow\.[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"#,options:[.regularExpression,.caseInsensitive]) != nil
        guard validSample||validSync else { replyHandler(failure(id:id,code:"invalid_menstrual_flow_delete",message:"Menstrual flow deletion identity is invalid."),nil);return }
        Task { do { try await healthKitCoordinator.deleteMenstrualFlow(sampleID:validSample ? sampleID:nil,syncIdentifier:validSync ? syncIdentifier:nil);replyOnMain(replyHandler,value:success(id:id,result:["deleted":true])) } catch { replyOnMain(replyHandler,value:failure(id:id,code:"healthkit_menstrual_flow_delete_failed",message:HealthDiagnostics.safe(error))) } }
    }

    private func handleTracker(method: String, parameters: [String: Any], id: String, webView: WKWebView?, replyHandler: @escaping (Any?, String?) -> Void) {
        Task { @MainActor in
            do {
                guard let controller = trackerController else { throw TrackerLocalError.storage }
                let result: Any
                switch method {
                case "native.invoke":
                    guard let account = parameters["accountId"] as? String, let target = parameters["method"] as? String,
                          Self.nativeIntegrationMethods.contains(target), let arguments = parameters["arguments"] as? [String: Any] else { throw TrackerLocalError.invalid }
                    try await controller.beginNativeOperation(accountId: account)
                    dispatchCore(method: target, parameters: arguments, id: id, allowed: Set(Self.nativeIntegrationMethods).union(Self.localCoreMethods).union(Self.trackerMethods)) { value, error in
                        controller.endNativeOperation()
                        replyHandler(value, error)
                    }
                    return
                case "native.api":
                    guard let account = parameters["accountId"] as? String, let path = parameters["path"] as? String, let verb = parameters["method"] as? String else { throw TrackerLocalError.invalid }
                    let authorization = try await controller.beginNativeOperation(accountId: account)
                    defer { controller.endNativeOperation() }
                    result = try await controller.businessRequest(accountId: account, path: path, method: verb, contentType: "application/json", bodyBase64: parameters["bodyBase64"] as? String, offline: false, nativeIntegration: true, authorization: authorization)
                case "trackers.getSession":
                    if let account = try await controller.database.account() { result = account } else { result = NSNull() }
                case "trackers.signIn":
                    guard let email = parameters["email"] as? String, let password = parameters["password"] as? String else { throw TrackerLocalError.invalid }
                    result = try await controller.signIn(email: email, password: password)
                case "trackers.signOut": try await controller.signOut(); result = NSNull()
                case "trackers.readReplica":
                    guard let account = parameters["accountId"] as? String else { throw TrackerLocalError.invalid }
                    _ = try await controller.acceptanceStatus(accountId: account)
                    result = try await controller.database.read(accountId: account, replica: true)
                case "trackers.commitReplica":
                    guard let account = parameters["accountId"] as? String, let revision = parameters["expectedRevision"] as? Int, let state = parameters["state"] as? [String: Any] else { throw TrackerLocalError.invalid }
                    _ = try await controller.acceptanceStatus(accountId: account)
                    result = try await controller.database.commit(accountId: account, expectedRevision: revision, state: state, replica: true)
                case "trackers.syncReplica":
                    guard let request = parameters["request"] as? [String: Any] else { throw TrackerLocalError.invalid }
                    result = try await controller.synchronizeReplica(request)
                case "trackers.readState":
                    guard let account = parameters["accountId"] as? String else { throw TrackerLocalError.invalid }
                    result = try await controller.database.read(accountId: account)
                case "trackers.commitState":
                    throw TrackerLocalError.readOnly
                case "trackers.acceptanceStatus":
                    guard let account = parameters["accountId"] as? String else { throw TrackerLocalError.invalid }
                    result = try await controller.acceptanceStatus(accountId: account)
                case "trackers.readOnlySnapshot":
                    guard let account = parameters["accountId"] as? String, let refresh = parameters["refresh"] as? Bool else { throw TrackerLocalError.invalid }
                    result = try await controller.readOnlySnapshot(accountId: account, refresh: refresh)
                case "food.readOnlyResource":
                    guard let account = parameters["accountId"] as? String, let kind = parameters["kind"] as? String, let key = parameters["key"] as? String, let refresh = parameters["refresh"] as? Bool else { throw TrackerLocalError.invalid }
                    result = try await controller.foodReadOnlyResource(accountId: account, kind: kind, key: key, refresh: refresh)
                case "business.request":
                    guard let account = parameters["accountId"] as? String, let path = parameters["path"] as? String, let method = parameters["method"] as? String,
                          let contentType = parameters["contentType"] as? String, let offline = parameters["offline"] as? Bool else { throw TrackerLocalError.invalid }
                    result = try await controller.businessRequest(accountId: account, path: path, method: method, contentType: contentType, bodyBase64: parameters["bodyBase64"] as? String, offline: offline)
                case "settings.aiConfiguration", "settings.configuration":
                    guard let account = parameters["accountId"] as? String, let path = parameters["path"] as? String, let verb = parameters["method"] as? String else { throw TrackerLocalError.invalid }
                    result = try await controller.aiConfiguration(accountId: account, path: path, method: verb, body: parameters["body"], settings: method == "settings.configuration")
                case "workspaces.readOnlySnapshot":
                    guard let account = parameters["accountId"] as? String, let kind = parameters["kind"] as? String, ["tasks", "projects", "lucius"].contains(kind), let refresh = parameters["refresh"] as? Bool else { throw TrackerLocalError.invalid }
                    result = try await controller.workspaceReadOnlySnapshot(accountId: account, kind: kind, refresh: refresh)
                case "media.readOnlySnapshot":
                    guard let account = parameters["accountId"] as? String, let refresh = parameters["refresh"] as? Bool else { throw TrackerLocalError.invalid }
                    result = try await controller.mediaReadOnlySnapshot(accountId: account, refresh: refresh)
                case "relations.readOnlySnapshot":
                    guard let account = parameters["accountId"] as? String, let refresh = parameters["refresh"] as? Bool else { throw TrackerLocalError.invalid }
                    result = try await controller.relationsReadOnlySnapshot(accountId: account, refresh: refresh)
                case "health.readOnlySnapshot":
                    guard let account = parameters["accountId"] as? String, let refresh = parameters["refresh"] as? Bool else { throw TrackerLocalError.invalid }
                    result = try await controller.healthReadOnlySnapshot(accountId: account, refresh: refresh)
                case "subscriptions.readOnlySnapshot":
                    guard let account = parameters["accountId"] as? String, let refresh = parameters["refresh"] as? Bool else { throw TrackerLocalError.invalid }
                    result = try await controller.subscriptionsReadOnlySnapshot(accountId: account, refresh: refresh)
                case "chronicle.readOnlySnapshot":
                    guard let account = parameters["accountId"] as? String, let refresh = parameters["refresh"] as? Bool else { throw TrackerLocalError.invalid }
                    result = try await controller.chronicleReadOnlySnapshot(accountId: account, refresh: refresh)
                case "memo.readOnlySnapshot":
                    guard let account = parameters["accountId"] as? String, let refresh = parameters["refresh"] as? Bool else { throw TrackerLocalError.invalid }
                    result = try await controller.memoReadOnlySnapshot(accountId: account, refresh: refresh)
                case "inbox.readOnlySnapshot":
                    guard let account = parameters["accountId"] as? String, let refresh = parameters["refresh"] as? Bool else { throw TrackerLocalError.invalid }
                    result = try await controller.inboxReadOnlySnapshot(accountId: account, refresh: refresh)
                case "cats.readOnlySnapshot":
                    guard let account = parameters["accountId"] as? String, let refresh = parameters["refresh"] as? Bool else { throw TrackerLocalError.invalid }
                    result = try await controller.catsReadOnlySnapshot(accountId: account, refresh: refresh)
                case "food.readOnlySnapshot":
                    guard let account = parameters["accountId"] as? String, let refresh = parameters["refresh"] as? Bool else { throw TrackerLocalError.invalid }
                    result = try await controller.foodReadOnlySnapshot(accountId: account, refresh: refresh)
                case "home.readOnlyResource":
                    guard let account = parameters["accountId"] as? String, let kind = parameters["kind"] as? String, let key = parameters["key"] as? String, let refresh = parameters["refresh"] as? Bool else { throw TrackerLocalError.invalid }
                    result = try await controller.homeReadOnlyResource(accountId: account, kind: kind, key: key, refresh: refresh)
                case "trackers.sync":
                    guard let request = parameters["request"] as? [String: Any] else { throw TrackerLocalError.invalid }
                    result = try await controller.synchronize(request)
                case "navigation.openNativeSettings":
                    guard let accountId = parameters["accountId"] as? String, let path = parameters["path"] as? String,
                          let target = URL(string: path, relativeTo: hostConfiguration.baseURL)?.absoluteURL,
                          NativeIntegrationViewController.allows(target, configuration: hostConfiguration),
                          let presenter = webView?.window?.rootViewController, presenter.presentedViewController == nil,
                          let onlineConfiguration = HostConfiguration(validating: hostConfiguration.baseURL) else { throw TrackerLocalError.invalid }
                    let frozenCookies = try await controller.beginNativeSettings(accountId: accountId)
                    guard presenter.presentedViewController == nil else { controller.endNativeSettings(accountId: accountId); throw TrackerLocalError.invalid }
                    let settingsBridge = NativeBridge(hostConfiguration: onlineConfiguration, healthKitCoordinator: healthKitCoordinator, notificationManager: notificationManager, eventKitSyncEngine: eventKitSyncEngine)
                    settingsBridge.onDataChanged = onDataChanged
                    let settings = NativeIntegrationViewController(configuration: onlineConfiguration, target: target, cookies: frozenCookies, bridge: settingsBridge)
                    settings.onClose = { [weak webView] in
                        controller.endNativeSettings(accountId: accountId)
                        webView?.evaluateJavaScript("window.dispatchEvent(new Event('evaorbit:native-active'))")
                    }
                    let navigation = UINavigationController(rootViewController: settings)
                    presenter.present(navigation, animated: true) { navigation.presentationController?.delegate = settings }
                    result = ["opened": true]
                case "trackers.exportState":
                    guard let account = try await controller.database.account()?["accountId"], let presenter = webView?.window?.rootViewController else { throw TrackerLocalError.account }
                    let legacy = try await controller.database.read(accountId: account)
                    let replica = try await controller.database.read(accountId: account, replica: true)
                    let state: [String: Any] = ["format": "eo-trackers-export-v2", "accountId": account, "legacy": legacy, "replica": replica]
                    let url = FileManager.default.temporaryDirectory.appendingPathComponent("evaorbit-trackers-local.json")
                    try JSONSerialization.data(withJSONObject: state, options: [.prettyPrinted]).write(to: url, options: [.atomic, .completeFileProtection])
                    let share = UIActivityViewController(activityItems: [url], applicationActivities: nil)
                    share.popoverPresentationController?.sourceView = webView
                    share.completionWithItemsHandler = { _, _, _, _ in try? FileManager.default.removeItem(at: url) }
                    presenter.present(share, animated: true)
                    result = ["shared": true]
                default: throw TrackerLocalError.invalid
                }
                replyHandler(["ok": true, "id": id, "result": result], nil)
            } catch {
                var operation = method
                if ["native.api", "business.request", "settings.configuration", "settings.aiConfiguration"].contains(method),
                   let path = parameters["path"] as? String, let verb = parameters["method"] as? String,
                   path.hasPrefix("/api/"), path.range(of: "^[A-Za-z0-9/_?=&%.-]+$", options: .regularExpression) != nil,
                   TrackerLocalController.allowsBusinessRequest(path: path, method: verb) || TrackerLocalController.allowsNativeAPI(path: path, method: verb) || TrackerLocalController.allowsSettingsConfiguration(path: path, method: verb) || TrackerLocalController.allowsAIConfiguration(path: path, method: verb) {
                    operation += " \(verb) \(path.split(separator: "?", maxSplits: 1)[0])"
                } else if method == "native.invoke", let target = parameters["method"] as? String, Self.nativeIntegrationMethods.contains(target) {
                    operation += " \(target)"
                }
                let diagnostic = NativeDiagnostics.capture(error, operation: operation)
                replyHandler(failure(id: id, code: diagnostic.code, message: diagnostic.message), nil)
            }
        }
    }

    private func replyOnMain(_ replyHandler: @escaping (Any?, String?) -> Void, value: [String: Any]) {
        DispatchQueue.main.async { replyHandler(value, nil) }
    }

    private func openExternal(
        parameters: [String: Any],
        id: String,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard let rawURL = parameters["url"] as? String,
              let url = URL(string: rawURL),
              ["http", "https"].contains(url.scheme?.lowercased() ?? "")
        else {
            replyHandler(failure(id: id, code: "invalid_url", message: "Only HTTP and HTTPS URLs can be opened."), nil)
            return
        }

        UIApplication.shared.open(url, options: [:]) { opened in
            replyHandler(self.success(id: id, result: ["opened": opened]), nil)
        }
    }

    private func hostInfo() -> [String: Any] {
        let bundle = Bundle.main
        return [
            "apiOrigin": hostConfiguration.baseURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")),
            "platform": "ios",
            "bridgeVersion": Self.protocolVersion,
            "appVersion": bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown",
            "buildVersion": bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "unknown",
            "healthKitPipeline": "energy-body-mass-menstrual-flow-sleep-v4",
            "notificationPipeline": "local-v1",
            "hapticPipeline": "feedback-v1",
            "eventKitPipeline": "calendar-reminders-v1",
            "methods": Self.supportedMethods.sorted()
        ]
    }

    private func success(id: String, result: [String: Any]) -> [String: Any] {
        ["ok": true, "id": id, "result": result]
    }

    private func failure(id: String?, code: String, message: String) -> [String: Any] {
        var response: [String: Any] = [
            "ok": false,
            "error": ["code": code, "message": NativeDiagnostics.marked(message, code: code)]
        ]
        if let id { response["id"] = id }
        return response
    }
}
