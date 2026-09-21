import UIKit
import WebKit
import EventKit

final class NativeBridge: NSObject, WKScriptMessageHandlerWithReply {
    static let name = "evaOrbit"
    static let protocolVersion = 1
    static let supportedMethods: Set<String> = [
        "host.ping", "host.getInfo", "navigation.openExternal",
        "appearance.setPreference",
        "haptic.play",
        "healthkit.getStatus", "healthkit.requestAuthorization", "healthkit.syncNow",
        "healthkit.configureCredential", "healthkit.clearCredential",
        "healthkit.saveBodyMass", "healthkit.saveMenstrualFlow", "healthkit.deleteMenstrualFlow",
        "notification.getStatus", "notification.requestAuthorization", "notification.schedule",
        "notification.cancel", "notification.listPending", "notification.openSettings"
        ,"eventkit.getStatus", "eventkit.requestAccess", "eventkit.fetch", "eventkit.save", "eventkit.delete"
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
    private let healthKitCoordinator: HealthKitCoordinator
    private let notificationManager: NotificationManager
    private let hapticFeedbackManager = HapticFeedbackManager()
    private let eventKitSyncEngine: EventKitSyncEngine

    init(hostConfiguration: HostConfiguration, healthKitCoordinator: HealthKitCoordinator, notificationManager: NotificationManager, eventKitSyncEngine: EventKitSyncEngine) {
        self.hostConfiguration = hostConfiguration
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

        guard let sourceURL = message.frameInfo.request.url, hostConfiguration.allows(sourceURL) else {
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
        guard Self.supportedMethods.contains(method) else {
            replyHandler(failure(id: identifier, code: "unknown_method", message: "Unsupported native method."), nil)
            return
        }
        switch method {
        case "host.ping":
            replyHandler(success(id: identifier, result: ["pong": true]), nil)
        case "host.getInfo":
            replyHandler(success(id: identifier, result: hostInfo()), nil)
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
                    replyOnMain(replyHandler, value: failure(id: identifier, code: "notification_authorization_failed", message: error.localizedDescription))
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

    private func eventKitRequestAccess(parameters:[String:Any],id:String,replyHandler:@escaping(Any?,String?)->Void){guard let kind=eventKitKind(parameters)else{replyHandler(failure(id:id,code:"invalid_eventkit_kind",message:"EventKit kind is invalid."),nil);return};Task{do{let result=try await eventKitSyncEngine.requestAccess(kind);replyOnMain(replyHandler,value:success(id:id,result:result))}catch{replyOnMain(replyHandler,value:failure(id:id,code:"eventkit_authorization_failed",message:error.localizedDescription))}}}

    private func eventKitFetch(parameters:[String:Any],id:String,replyHandler:@escaping(Any?,String?)->Void){guard let kind=eventKitKind(parameters),let calendarIDs=parameters["calendarIdentifiers"] as? [String],calendarIDs.count<=100,calendarIDs.allSatisfy({!$0.isEmpty&&$0.count<=500})else{replyHandler(failure(id:id,code:"invalid_eventkit_fetch",message:"EventKit fetch parameters are invalid."),nil);return};if kind == .event{guard let from=Self.parseISO8601(parameters["from"] as? String ?? ""),let to=Self.parseISO8601(parameters["to"] as? String ?? ""),to>from else{replyHandler(failure(id:id,code:"invalid_eventkit_window",message:"Calendar sync window is invalid."),nil);return};replyHandler(success(id:id,result:["items":eventKitSyncEngine.fetchEvents(calendarIDs:calendarIDs,from:from,to:to),"complete":true]),nil)}else{let completedSince=Self.parseISO8601(parameters["completedSince"] as? String ?? "") ?? Date().addingTimeInterval(-30*86400);Task{do{let items=try await eventKitSyncEngine.fetchReminders(calendarIDs:calendarIDs,completedSince:completedSince);replyOnMain(replyHandler,value:success(id:id,result:["items":items,"complete":true]))}catch{replyOnMain(replyHandler,value:failure(id:id,code:"eventkit_fetch_failed",message:error.localizedDescription))}}}}

    private func eventKitSave(parameters:[String:Any],id:String,replyHandler:@escaping(Any?,String?)->Void){guard let kind=eventKitKind(parameters),let item=parameters["item"] as? [String:Any]else{replyHandler(failure(id:id,code:"invalid_eventkit_save",message:"EventKit item is invalid."),nil);return};do{let saved=try kind == .event ? eventKitSyncEngine.saveEvent(item) : eventKitSyncEngine.saveReminder(item);replyHandler(success(id:id,result:["item":saved]),nil)}catch{replyHandler(failure(id:id,code:"eventkit_save_failed",message:error.localizedDescription),nil)}}

    private func eventKitDelete(parameters:[String:Any],id:String,replyHandler:@escaping(Any?,String?)->Void){guard let kind=eventKitKind(parameters),let itemID=parameters["calendarItemIdentifier"] as? String,!itemID.isEmpty,itemID.count<=500 else{replyHandler(failure(id:id,code:"invalid_eventkit_delete",message:"EventKit identifier is invalid."),nil);return};do{try eventKitSyncEngine.delete(kind:kind,identifier:itemID);replyHandler(success(id:id,result:["deleted":true]),nil)}catch{replyHandler(failure(id:id,code:"eventkit_delete_failed",message:error.localizedDescription),nil)}}

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
                replyOnMain(replyHandler, value: failure(id: id, code: "notification_schedule_failed", message: error.localizedDescription))
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
            replyHandler(failure(id: id, code: "notification_cancel_failed", message: error.localizedDescription), nil)
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
            try healthKitCoordinator.configureCredential(credential, ingestURL: ingestURL)
            replyHandler(success(id: id, result: ["configured": true]), nil)
        } catch {
            replyHandler(failure(id: id, code: "credential_storage_failed", message: "Native credential could not be stored."), nil)
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
            "platform": "ios",
            "bridgeVersion": Self.protocolVersion,
            "appVersion": bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown",
            "buildVersion": bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "unknown",
            "healthKitPipeline": "energy-body-mass-menstrual-flow-v3",
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
            "error": ["code": code, "message": message]
        ]
        if let id { response["id"] = id }
        return response
    }
}
