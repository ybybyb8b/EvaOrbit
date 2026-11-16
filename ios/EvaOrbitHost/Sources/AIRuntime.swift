import Foundation
import UIKit

@MainActor
final class AIRuntime {
    typealias Stream = (URLRequest, @escaping (AIStreamPart) async throws -> Void) async throws -> Void
    typealias Catalog = (URLRequest, String) async throws -> AIModelCatalog
    static let subscriptionID = "00000000-0000-4000-8000-000000000220"
    private let subscriptionFactory: (String) -> SIWCRuntime
    private var subscriptionClients: [String: SIWCRuntime] = [:]
    private struct GroupJob {
        var account: String
        var message: AIMessage
        var task: Task<Void, Never>?
        var terminal: String?
    }
    private var groupJobs: [String: GroupJob] = [:]
    private var discussionTask: Task<Void, Never>?
    private var discussionRun: (account: String, state: AIGroupDiscussion)?
    private var discussionControlling = false
    private var groupPreparing = false
    private var groupPreparingScope: (String, String)?
    private var subscriptionTask: Task<Any, Error>?
    private func subscription(_ account: String) -> SIWCRuntime {
        if let saved = subscriptionClients[account] { return saved }
        let client = subscriptionFactory(account)
        subscriptionClients[account] = client
        return client
    }
    private let store: AIStore
    private let secrets: AISecretStore
    private let stream: Stream
    private let catalog: Catalog
    private var catalogTask: Task<AIModelCatalog, Error>?
    private var catalogAccount: String?
    private var task: Task<Void, Never>?
    private var current: (account: String, message: AIMessage)?
    private var terminalStatus: String?
    private var epoch = 0
    private var preparing = false
    private var preparingRequest: (account: String, id: String)?
    private var configuring = false
    private var emit: (([String: Any]) -> Void)?
    private var emitAccount: String?
    nonisolated static let methods: Set<String> = ["ai.getState", "ai.saveProvider", "ai.deleteProvider", "ai.send", "ai.cancel", "ai.deleteConversation", "ai.savePersona", "ai.listModels", "ai.cancelModelList", "ai.subscriptionLogin", "ai.subscriptionLogout", "ai.subscriptionModels", "ai.saveGroup", "ai.groupSend", "ai.groupCancel", "ai.groupRegenerate", "ai.discussionControl", "ai.discussionIntervene", "ai.discussionSummarize"]

    init(store: AIStore, secrets: AISecretStore = AICredentialStore(), catalog: Catalog? = nil, subscriptionFactory: ((String) -> SIWCRuntime)? = nil, stream: Stream? = nil) {
        self.store = store; self.secrets = secrets
        self.subscriptionFactory = subscriptionFactory ?? { account in
            SIWCRuntime(keychain: SIWCKeychain(service: "com.evaorbit.nativehost.siwc.v1." + account.lowercased()))
        }
        self.stream = stream ?? { request, receive in try await AIProviderAdapter().stream(request, receive: receive) }
        self.catalog = catalog ?? { request, secret in
            guard let endpoint = request.url else { throw AIError.invalid }
            let data = try await AIProviderAdapter().modelDirectory(request)
            return try AIModelCatalog.decode(data, endpoint: endpoint, secret: secret)
        }
    }

    func interrupt() {
        epoch += 1
        terminalStatus = "interrupted"
        emit = nil // Old account / document receives no later token events.
        discussionTask?.cancel()
        task?.cancel()
        catalogTask?.cancel()
        subscriptionTask?.cancel()
        for id in Array(groupJobs.keys) { groupJobs[id]?.terminal = "interrupted"; groupJobs[id]?.task?.cancel() }
    }

    func handle(_ method: String, account: String, parameters: [String: Any], emit: @escaping ([String: Any]) -> Void) async throws -> Any {
        guard Self.methods.contains(method), UUID(uuidString: account) != nil else { throw AIError.invalid }
        let requestEpoch = epoch
        self.emit = emit
        emitAccount = account
        switch method {
        case "ai.saveGroup":
            return try await saveGroup(account: account, parameters: parameters)
        case "ai.discussionControl", "ai.discussionIntervene", "ai.discussionSummarize":
            return try await controlDiscussion(method, account: account, parameters: parameters)
        case "ai.groupSend":
            if let id = parameters["conversationId"] as? String,
               let group = try await store.groups(account).first(where: { $0.id == id }), group.mode == "discussion" {
                guard requestEpoch == epoch else { throw CancellationError() }
                return try await startDiscussion(group, account: account, parameters: parameters)
            }
            guard requestEpoch == epoch else { throw CancellationError() }
            guard discussionTask == nil && !discussionControlling else { throw AIError.busy }
            return try await sendGroup(account: account, parameters: parameters, regenerate: false)
        case "ai.groupRegenerate":
            guard discussionTask == nil && !discussionControlling else { throw AIError.busy }
            return try await sendGroup(account: account, parameters: parameters, regenerate: method == "ai.groupRegenerate")
        case "ai.groupCancel":
            guard let conversation = parameters["conversationId"] as? String, UUID(uuidString: conversation) != nil else { throw AIError.invalid }
            let target = parameters["messageId"] as? String
            if discussionRun?.account == account, discussionRun?.state.conversationId == conversation, discussionTask != nil {
                if target == nil {
                    guard !discussionControlling else { throw AIError.busy }
                    discussionControlling = true; defer { discussionControlling = false }
                    try await haltDiscussion(status: "ended")
                    return ["requested": true]
                }
                if let target, let persona = groupJobs[target]?.message.personaId {
                    suspendDiscussionPersona(persona)
                    groupJobs[target]?.terminal = "cancelled"; groupJobs[target]?.task?.cancel()
                    if let run = discussionRun { try await store.saveDiscussion(run.state, account: account) }
                }
            }
            if target == nil, groupPreparingScope?.0 == account, groupPreparingScope?.1 == conversation { epoch += 1 }
            for id in Array(groupJobs.keys) where target == nil || target == id {
                if groupJobs[id]?.account == account && groupJobs[id]?.message.conversationId == conversation {
                    groupJobs[id]?.terminal = "cancelled"; groupJobs[id]?.task?.cancel()
                }
            }
            return ["requested": true]
        case "ai.subscriptionLogin", "ai.subscriptionLogout", "ai.subscriptionModels":
            guard !preparing && !configuring && task == nil && catalogTask == nil && subscriptionTask == nil && !groupPreparing && groupJobs.isEmpty && discussionTask == nil && !discussionControlling else { throw AIError.busy }
            let generation = epoch
            let runtime = subscription(account)
            let operation = Task<Any, Error> {
                if method == "ai.subscriptionLogout" {
                    do { try await runtime.signOut() }
                    catch { try await self.store.deleteProvider(Self.subscriptionID, account: account); throw error }
                    try await self.store.deleteProvider(Self.subscriptionID, account: account)
                    return ["saved": true]
                }
                if method == "ai.subscriptionLogin" {
                    let saved = try runtime.connection()
                    let window = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap { $0.windows }.first { $0.isKeyWindow }
                    let browser = SIWCBrowserLogin(window: window)
                    let (attempt, code, client) = try await browser.authorize(host: saved.host, client: saved.client)
                    try Task.checkCancellation()
                    try await runtime.exchange(attempt: attempt, code: code, client: client)
                }
                let models = try await runtime.models()
                try Task.checkCancellation()
                guard generation == self.epoch else { throw CancellationError() }
                let provider = AIProvider(id: Self.subscriptionID, name: "ChatGPT", baseURL: SIWCProtocol.resource,
                    models: Array(models.prefix(50)).map { AIModel(id: $0.id, name: $0.name) }, currency: "USD", priceUpdatedAt: "", enabled: true)
                try provider.validate()
                try await self.store.saveProvider(provider, account: account)
                return ["saved": true]
            }
            subscriptionTask = operation
            defer { subscriptionTask = nil }
            return try await operation.value
        case "ai.listModels":
            return try await listModels(account: account, parameters: parameters)
        case "ai.cancelModelList":
            if catalogAccount == account { epoch += 1; catalogTask?.cancel() }
            return ["requested": true]
        case "ai.getState":
            var providers: [[String: Any]] = []
            for provider in try await store.providers(account) {
                var item = try aiJSON(provider) as! [String: Any]
                if provider.id == Self.subscriptionID {
                    item["connectionType"] = "subscription"
                    let connected = try subscription(account).connection().enabled
                    item["enabled"] = provider.enabled && connected
                } else { item["hasKey"] = try secrets.read(account: account, provider: provider.id) != nil }
                providers.append(item)
            }
            let conversation = parameters["conversationId"] as? String
            if let conversation, UUID(uuidString: conversation) == nil { throw AIError.invalid }
            let conversations = try await store.conversations(account)
            let messages: [AIMessage]
            if let conversation { messages = try await store.messages(conversation, account: account) }
            else { messages = [] }
            var result: [String: Any] = ["providers": providers, "conversations": try aiJSON(conversations), "messages": try aiJSON(messages)]
            result["subscriptionConnected"] = try subscription(account).keychain.read()?.enabled ?? false
            result["persona"] = try aiJSON(await store.defaultPersona(account))
            result["personas"] = try aiJSON(await store.personas(account))
            result["discussions"] = try aiJSON(await store.discussions(account))
            result["groups"] = try aiJSON(await store.groups(account))
            result["activeMessages"] = try aiJSON(groupJobs.values.filter { $0.account == account }.map { $0.message })
            if let active = current, active.account == account { result["active"] = try aiJSON(active.message) }
            return result
        case "ai.savePersona":
            guard !preparing && !configuring && task == nil && catalogTask == nil && subscriptionTask == nil && !groupPreparing && groupJobs.isEmpty && discussionTask == nil && !discussionControlling else { throw AIError.busy }
            configuring = true
            defer { configuring = false }
            guard let raw = parameters["persona"] as? [String: Any], let data = try? JSONSerialization.data(withJSONObject: raw), data.count <= 384 * 1024,
                  let persona = try? JSONDecoder().decode(ParlorPersona.self, from: data) else { throw AIError.invalid }
            try persona.validate()
            if let providerID = persona.providerId, let modelID = persona.modelId {
                guard let provider = try await store.providers(account).first(where: { $0.id == providerID }), provider.models.contains(where: { $0.id == modelID }) else { throw AIError.invalid }
            }
            try await store.savePersona(persona, account: account)
            return ["saved": true]
        case "ai.saveProvider":
            guard !preparing && !configuring && task == nil && catalogTask == nil && subscriptionTask == nil && !groupPreparing && groupJobs.isEmpty && discussionTask == nil && !discussionControlling else { throw AIError.busy }
            configuring = true
            defer { configuring = false }
            guard let raw = parameters["provider"] as? [String: Any],
                  !raw.keys.contains("apiKey"), let data = try? JSONSerialization.data(withJSONObject: raw),
                  data.count <= 128 * 1024, let provider = try? JSONDecoder().decode(AIProvider.self, from: data) else { throw AIError.invalid }
            guard provider.id != Self.subscriptionID else { throw AIError.invalid }
            try provider.validate()
            let old = try await store.providers(account).first { $0.id == provider.id }
            let key = parameters["apiKey"] as? String
            let clear = parameters["clearKey"] as? Bool == true
            guard !(clear && key != nil) else { throw AIError.invalid }
            if let old, old.baseURL != provider.baseURL, key == nil && !clear,
               try secrets.read(account: account, provider: provider.id) != nil { throw AIError.endpointChanged }
            let previous = try secrets.read(account: account, provider: provider.id)
            if let key { try secrets.write(key, account: account, provider: provider.id) }
            if clear { try secrets.remove(account: account, provider: provider.id) }
            do { try await store.saveProvider(provider, account: account) }
            catch {
                // If the config cannot commit, restore the credential that belongs to the old endpoint.
                if let previous { try secrets.write(previous, account: account, provider: provider.id) }
                else { try secrets.remove(account: account, provider: provider.id) }
                throw error
            }
            return ["saved": true]
        case "ai.deleteProvider":
            guard !preparing && !configuring && task == nil && catalogTask == nil && subscriptionTask == nil && !groupPreparing && groupJobs.isEmpty && discussionTask == nil && !discussionControlling else { throw AIError.busy }
            configuring = true
            defer { configuring = false }
            guard let id = parameters["providerId"] as? String, UUID(uuidString: id) != nil else { throw AIError.invalid }
            guard id != Self.subscriptionID else { throw AIError.invalid }
            try secrets.remove(account: account, provider: id)
            try await store.deleteProvider(id, account: account)
            return ["deleted": true]
        case "ai.deleteConversation":
            guard discussionTask == nil && !discussionControlling else { throw AIError.busy }
            guard let id = parameters["conversationId"] as? String, UUID(uuidString: id) != nil else { throw AIError.invalid }
            guard !groupPreparing && !preparing && !configuring,
                  !groupJobs.values.contains(where: { $0.account == account && $0.message.conversationId == id }),
                  current?.account != account || current?.message.conversationId != id else { throw AIError.busy }
            try await store.deleteConversation(id, account: account)
            return ["deleted": true]
        case "ai.cancel":
            guard let id = parameters["requestId"] as? String, UUID(uuidString: id) != nil else { throw AIError.invalid }
            if (current?.account == account && current?.message.requestId == id) || (preparingRequest?.account == account && preparingRequest?.id == id) {
                epoch += 1; terminalStatus = "cancelled"; task?.cancel()
            }
            return ["requested": true]
        case "ai.send":
            return try await send(account: account, parameters: parameters)
        default: throw AIError.invalid
        }
    }

    private func listModels(account: String, parameters: [String: Any]) async throws -> Any {
        guard !preparing && !configuring && task == nil && catalogTask == nil && subscriptionTask == nil && !groupPreparing && groupJobs.isEmpty && discussionTask == nil && !discussionControlling else { throw AIError.busy }
        configuring = true
        defer { configuring = false; catalogTask = nil; catalogAccount = nil }
        catalogAccount = account
        let generation = epoch
        guard let providerID = parameters["providerId"] as? String, UUID(uuidString: providerID) != nil,
              let baseURL = parameters["baseURL"] as? String, baseURL.count <= 500 else { throw AIError.invalid }
        let endpoint = try AIProvider.endpoint(baseURL: baseURL, resource: "models")
        let saved = try await store.providers(account).first { $0.id == providerID }
        let secret: String
        if let supplied = parameters["apiKey"] as? String { secret = supplied }
        else {
            guard let saved else { throw AIError.missingKey }
            guard try AIProvider.endpoint(baseURL: saved.baseURL, resource: "models") == endpoint else { throw AIError.endpointChanged }
            guard let stored = try secrets.read(account: account, provider: providerID) else { throw AIError.missingKey }
            secret = stored
        }
        guard !secret.isEmpty, secret.utf8.count <= 4096,
              !secret.unicodeScalars.contains(where: { $0.value < 32 || $0.value == 127 }) else { throw AIError.invalid }
        guard generation == epoch else { throw CancellationError() }
        var request = URLRequest(url: endpoint)
        request.httpMethod = "GET"; request.httpShouldHandleCookies = false; request.timeoutInterval = 25
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer " + secret, forHTTPHeaderField: "Authorization")
        let fetch = catalog
        let operation = Task { try await fetch(request, secret) }
        catalogTask = operation; catalogAccount = account
        let result = try await operation.value
        guard generation == epoch && !operation.isCancelled else { throw CancellationError() }
        return try aiJSON(result)
    }

    private func send(account: String, parameters: [String: Any]) async throws -> Any {
        guard task == nil && !preparing && !configuring && catalogTask == nil && subscriptionTask == nil && !groupPreparing && groupJobs.isEmpty && discussionTask == nil && !discussionControlling else { throw AIError.busy }
        preparing = true
        defer { preparing = false; preparingRequest = nil }
        let generation = epoch
        guard let conversation = parameters["conversationId"] as? String, UUID(uuidString: conversation) != nil,
              let requestID = parameters["requestId"] as? String, UUID(uuidString: requestID) != nil,
              let providerID = parameters["providerId"] as? String,
              let modelID = parameters["modelId"] as? String,
              let content = parameters["content"] as? String, !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              content.count <= 20000 else { throw AIError.invalid }
        preparingRequest = (account, requestID)
        let history = try await store.messages(conversation, account: account)
        guard try await store.groups(account).allSatisfy({ $0.id != conversation }) else { throw AIError.invalid }
        let persona: ParlorPersona
        if let id = parameters["personaId"] as? String {
            _ = try await store.defaultPersona(account)
            guard let selected = try await store.personas(account).first(where: { $0.id == id }) else { throw AIError.invalid }
            persona = selected
        } else { persona = try await store.defaultPersona(account) }
        if let requested = parameters["personaId"] as? String, requested != persona.id { throw AIError.invalid }
        // Delivery retries are never model retries. The UI keeps a stable request ID until acknowledged.
        if let index = history.firstIndex(where: { $0.requestId == requestID }) {
            let previous = history[index]
            guard index > 0, history[index - 1].content == content, previous.providerId == providerID, previous.model?.id == modelID else { throw AIError.invalid }
            return ["requestId": requestID, "messageId": previous.id]
        }
        guard let provider = try await store.providers(account).first(where: { $0.id == providerID && $0.enabled }),
              let model = provider.models.first(where: { $0.id == modelID }) else { throw AIError.invalid }
        let isSubscription = providerID == Self.subscriptionID
        let key: String
        if isSubscription { key = "" }
        else { guard let stored = try secrets.read(account: account, provider: providerID) else { throw AIError.missingKey }; key = stored }
        let selected = history.filter { $0.role == "user" || ($0.role == "assistant" && $0.status == "done") }
        // ponytail: bounded full history, no silent truncation; token budgeting and summaries belong to Phase 3.
        guard selected.reduce(content.utf8.count, { $0 + $1.content.utf8.count }) <= 128 * 1024, history.count < 998 else { throw AIError.tooLarge }
        guard isSubscription || !content.contains(key) else { throw AIError.invalid }
        let context = selected.map { ["role": $0.role, "content": $0.content] } + [["role": "user", "content": content]]
        let timestamp = aiTimestamp()
        let user = AIMessage(id: UUID().uuidString, conversationId: conversation, role: "user", content: content, status: "done", createdAt: timestamp)
        var assistant = AIMessage(id: UUID().uuidString, conversationId: conversation, role: "assistant", content: "", status: "streaming", createdAt: timestamp,
                                  requestId: requestID, providerId: providerID, providerName: provider.name, model: model,
                                  currency: provider.currency, priceUpdatedAt: model.priceUpdatedAt ?? provider.priceUpdatedAt, usage: AIUsage(), requestCount: 1,
                                  personaId: persona.id, personaName: persona.name)
        assistant.personaAvatar = persona.avatarDataURL
        // Reserve before awaiting storage: a second bridge send cannot enter while begin() is suspended.
        current = (account, assistant)
        do { try await store.begin(user: user, assistant: assistant, account: account) }
        catch { current = nil; task = nil; throw error }
        if generation != epoch {
            current?.message.requestCount = 0
            do { try await finish(status: terminalStatus ?? "interrupted", error: nil) }
            catch { task = nil; current = nil; throw error }
            task = nil; current = nil
            throw CancellationError()
        }
        terminalStatus = nil
        task = Task { [weak self] in
            guard let self else { return }
            do {
                try Task.checkCancellation()
                try await self.perform(provider: provider, model: model, persona: persona, context: context, account: account) { [weak self] part in
                    guard let self else { throw CancellationError() }
                    try await self.receive(part, account: account, requestID: requestID)
                }
                try Task.checkCancellation()
                guard !(self.current?.message.content.isEmpty ?? true) else { throw AIError.stream }
                try await self.finish(status: "done", error: nil)
            } catch {
                let cancelled = Task.isCancelled || (error as? URLError)?.code == .cancelled
                let status = cancelled ? (self.terminalStatus ?? "cancelled") : "failed"
                let message = cancelled ? nil : ((error as? SIWCFailure)?.errorDescription ?? NativeDiagnostics.summary(error))
                do { try await self.finish(status: status, error: message) }
                catch {
                    // Preserve the last durable draft. Reopening the store will recover it as interrupted.
                    if var value = self.current?.message { value.status = "interrupted"; value.error = "AI storage failed; the last saved partial response is preserved."; value.seq += 1; self.publish(value, account: account) }
                }
            }
            self.task = nil; self.current = nil; self.terminalStatus = nil
        }
        return ["requestId": requestID, "messageId": assistant.id]
    }

    private func receive(_ part: AIStreamPart, account: String, requestID: String) async throws {
        try Task.checkCancellation()
        guard var value = current?.message, current?.account == account, value.requestId == requestID else { throw CancellationError() }
        guard value.content.utf8.count + part.delta.utf8.count <= 2 * 1024 * 1024 else { throw AIError.tooLarge }
        value.content += part.delta
        if let usage = part.usage { value.usage = usage; value.cost = value.model.flatMap { usage.cost(model: $0) } }
        value.seq += 1
        try await store.update(value, account: account) // Durable before visible; no full-answer buffering.
        current?.message = value
        publish(value, account: account)
    }
    private func finish(status: String, error: String?) async throws {
        guard let active = current else { return }
        var value = active.message
        value.status = status; value.error = error; value.seq += 1
        try await store.update(value, account: active.account)
        current?.message = value
        publish(value, account: active.account)
    }
    private func publish(_ message: AIMessage, account: String) {
        guard emitAccount == account else { return }
        guard let json = try? aiJSON(message) else { return }
        emit?(["accountId": account, "conversationId": message.conversationId, "requestId": message.requestId ?? "", "messageId": message.id,
               "seq": message.seq, "eventType": message.status == "streaming" ? "progress" : "terminal", "message": json])
    }
    private func perform(provider: AIProvider, model: AIModel, persona: ParlorPersona, context: [[String: String]], account: String,
                         receive: @escaping (AIStreamPart) async throws -> Void) async throws {
        try Task.checkCancellation()
        if provider.id == Self.subscriptionID {
            try await subscription(account).infer(model: model.id, input: context, instructions: persona.runtimePrompt) { event in
                try await receive(AIStreamPart(delta: event.delta, usage: event.tokenUsage, done: event.completed))
            }
            return
        }
        guard let key = try secrets.read(account: account, provider: provider.id) else { throw AIError.missingKey }
        guard !context.contains(where: { ($0["content"] ?? "").contains(key) }) else { throw AIError.invalid }
        var request = URLRequest(url: try provider.endpoint())
        request.httpMethod = "POST"; request.httpShouldHandleCookies = false
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.setValue("Bearer " + key, forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["model": model.id, "stream": true,
            "stream_options": ["include_usage": true], "messages": [["role": "system", "content": persona.runtimePrompt]] + context])
        try await stream(request, receive)
    }

    private func saveGroup(account: String, parameters: [String: Any]) async throws -> Any {
        guard !preparing && !configuring && task == nil && !groupPreparing && groupJobs.isEmpty && subscriptionTask == nil && catalogTask == nil && discussionTask == nil && !discussionControlling else { throw AIError.busy }
        configuring = true; defer { configuring = false }
        let generation = epoch
        guard let id = parameters["conversationId"] as? String, UUID(uuidString: id) != nil,
              let title = parameters["title"] as? String, let ids = parameters["personaIds"] as? [String],
              (2...8).contains(ids.count), Set(ids).count == ids.count else { throw AIError.invalid }
        _ = try await store.defaultPersona(account)
        let personas = try await store.personas(account)
        let participants = try ids.map { id -> ParlorPersona in
            guard let persona = personas.first(where: { $0.id == id }) else { throw AIError.invalid }
            return persona
        }
        let existing = try await store.hasConversation(id, account: account)
        let groups = try await store.groups(account)
        guard !(try await store.discussions(account)).contains(where: { $0.conversationId == id && ["running", "paused", "interrupted", "summarizing"].contains($0.status) }) else { throw AIError.busy }
        guard !existing || groups.contains(where: { $0.id == id }) else { throw AIError.invalid }
        guard groups.count < 200 || groups.contains(where: { $0.id == id }) else { throw AIError.tooLarge }
        let providers = try await store.providers(account)
        let bindings = try participants.map { persona -> AIGroupMember in
            guard let provider = providers.first(where: { $0.id == persona.providerId }),
                  let model = provider.models.first(where: { $0.id == persona.modelId }) else { throw AIError.invalid }
            return AIGroupMember(persona: persona, provider: provider, model: model)
        }
        let group = AIGroup(id: id, title: title.trimmingCharacters(in: .whitespacesAndNewlines), participants: participants, mode: parameters["mode"] as? String ?? "parallel", maxRounds: parameters["maxRounds"] as? Int ?? 3, bindings: bindings)
        try group.validate()
        guard generation == epoch else { throw CancellationError() }
        try await store.saveGroup(group, account: account)
        return ["saved": true, "conversationId": id]
    }

    private func sendGroup(account: String, parameters: [String: Any], regenerate: Bool, discussion: AIGroupDiscussion? = nil, summaryPersona: String? = nil) async throws -> Any {
        guard !preparing && !configuring && task == nil && !groupPreparing && subscriptionTask == nil && catalogTask == nil else { throw AIError.busy }
        guard let conversation = parameters["conversationId"] as? String, UUID(uuidString: conversation) != nil,
              let requestID = parameters["requestId"] as? String, UUID(uuidString: requestID) != nil else { throw AIError.invalid }
        groupPreparing = true; groupPreparingScope = (account, conversation)
        defer { groupPreparing = false; groupPreparingScope = nil }
        let generation = epoch
        let history = try await store.messages(conversation, account: account)
        let groups = try await store.groups(account)
        guard let group = groups.first(where: { $0.id == conversation }) else { throw AIError.invalid }
        let snapshot: AIGroupRound
        let members: [AIGroupMember]
        var supersedes: String?
        if regenerate {
            guard let messageID = parameters["messageId"] as? String,
                  let original = history.first(where: { $0.id == messageID && $0.role == "assistant" }),
                  let roundID = original.roundId, let personaID = original.personaId,
                  let round = try await store.round(roundID, account: account), round.conversationId == conversation,
                  let member = round.members.first(where: { $0.persona.id == personaID }) else { throw AIError.invalid }
            // Request IDs are idempotency keys, never inference retry instructions.
            if let previous = history.first(where: { $0.requestId == requestID }) {
                guard previous.supersedesId == messageID else { throw AIError.invalid }
                return ["messageIds": [previous.id]]
            }
            guard groupJobs.count < 8,
                  !groupJobs.values.contains(where: { $0.account != account || $0.message.conversationId != conversation }),
                  !groupJobs.values.contains(where: { $0.account == account && $0.message.conversationId == conversation && $0.message.personaId == personaID }),
                  !history.contains(where: { $0.supersedesId == messageID }) else { throw AIError.busy }
            snapshot = round; members = [member]; supersedes = messageID
        } else {
            guard let content = parameters["content"] as? String, !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, content.count <= 20000 else { throw AIError.invalid }
            if let previous = try await store.round(requestID, account: account) {
                guard previous.conversationId == conversation && previous.content == content else { throw AIError.invalid }
                return ["messageIds": history.filter { $0.roundId == requestID && $0.role == "assistant" }.map(\.id)]
            }
            guard groupJobs.isEmpty else { throw AIError.busy }
            let providers = try await store.providers(account)
            let rootMembers: [AIGroupMember]?
            if let discussion, summaryPersona == nil { rootMembers = try await store.round(discussion.id, account: account)?.members } else { rootMembers = nil }
            let boundMembers = try rootMembers ?? group.bindings ?? group.participants.map { persona in
                guard let provider = providers.first(where: { $0.id == persona.providerId }),
                      let model = provider.models.first(where: { $0.id == persona.modelId }) else { throw AIError.invalid }
                return AIGroupMember(persona: persona, provider: provider, model: model)
            }
            members = boundMembers.filter { member in
                if let summaryPersona { return member.persona.id == summaryPersona }
                return !(discussion?.suspendedPersonaIds.contains(member.persona.id) ?? false)
            }
            guard !members.isEmpty else { throw AIError.invalid }
            let replaced = Set(history.compactMap(\.supersedesId))
            var context = history.filter { !replaced.contains($0.id) && ($0.role == "user" || ($0.role == "assistant" && ($0.status == "done" || discussion != nil && !$0.content.isEmpty))) }.map {
                ["role": $0.role, "content": $0.role == "assistant" ? "[" + ($0.personaName ?? "Assistant") + ($0.status == "done" ? "] " : " · incomplete] ") + $0.content : $0.content]
            } + [["role": "user", "content": content]]
            if let discussion, discussion.roundsStarted > 1 || summaryPersona != nil {
                context.removeLast() // Later rounds do not repeat the user's question as a new message.
                context.append(["role": "user", "content": summaryPersona != nil
                    ? "请以你的人格整理当前讨论：共识、分歧、未决事项与可执行结论。保留异议，标明不完整回答，不虚构一致意见。"
                    : "讨论第\(discussion.roundsStarted)/\(discussion.maxRounds)轮。请阅读其他人格的发言，点名回应其具体观点，提出补充、质疑或反驳，纠正自己的观点，避免重复已有内容。用户的新指引优先。保持用户提问所用的语言，轮次指令的语言不决定回答语言。"])
            }
            guard context.reduce(0, { $0 + ($1["content"] ?? "").utf8.count }) <= 128 * 1024 else { throw AIError.tooLarge }
            snapshot = AIGroupRound(id: requestID, conversationId: conversation, content: content, context: context, members: members, discussionId: discussion?.id, discussionRound: summaryPersona == nil ? discussion?.roundsStarted : nil, purpose: summaryPersona != nil ? "summary" : discussion != nil ? "discussion" : nil)
        }
        guard history.count + members.count + (regenerate ? 0 : 1) <= 1000 else { throw AIError.tooLarge }
        guard generation == epoch else { throw CancellationError() }
        let timestamp = aiTimestamp()
        let messages = members.map { member -> AIMessage in
            var message = AIMessage(id: UUID().uuidString, conversationId: conversation, role: "assistant", content: "", status: "streaming", createdAt: timestamp,
                requestId: regenerate ? requestID : UUID().uuidString, providerId: member.provider.id, providerName: member.provider.name, model: member.model,
                currency: member.provider.currency, priceUpdatedAt: member.model.priceUpdatedAt ?? member.provider.priceUpdatedAt, usage: AIUsage(), requestCount: 0,
                personaId: member.persona.id, personaName: member.persona.name)
            message.discussionId = snapshot.discussionId; message.discussionRound = snapshot.discussionRound; message.purpose = snapshot.purpose
            message.roundId = snapshot.id; message.supersedesId = supersedes; message.personaAvatar = member.persona.avatarDataURL
            return message
        }
        var user: AIMessage?
        if !regenerate && (discussion == nil || discussion?.roundsStarted == 1) && summaryPersona == nil {
            user = AIMessage(id: UUID().uuidString, conversationId: conversation, role: "user", content: snapshot.content, status: "done", createdAt: timestamp)
            user?.roundId = snapshot.id
        }
        try await store.beginRound(snapshot, user: user, assistants: messages, account: account, saveSnapshot: !regenerate, discussion: discussion)
        guard generation == epoch && !Task.isCancelled else {
            for var message in messages { message.status = "interrupted"; message.seq += 1; try await store.update(message, account: account) }
            throw CancellationError()
        }
        // All placeholders and the immutable round exist durably before any stream starts.
        for (index, message) in messages.enumerated() {
            groupJobs[message.id] = GroupJob(account: account, message: message)
            let member = members[index]
            groupJobs[message.id]?.task = Task { [weak self] in
                guard let self else { return }
                await self.runGroupMember(member, round: snapshot, account: account, messageID: message.id)
            }
        }
        return ["messageIds": messages.map(\.id)]
    }

    private func discussionChanged() {
        guard let run = discussionRun, emitAccount == run.account else { return }
        emit?(["accountId": run.account, "eventType": "configuration"])
    }
    private func suspendDiscussionPersona(_ persona: String) {
        guard var run = discussionRun, run.state.status == "running", !run.state.suspendedPersonaIds.contains(persona) else { return }
        run.state.suspendedPersonaIds.append(persona); run.state.revision += 1
        discussionRun = run
    }
    private func startDiscussion(_ group: AIGroup, account: String, parameters: [String: Any]) async throws -> Any {
        let generation = epoch
        guard let requestID = parameters["requestId"] as? String, UUID(uuidString: requestID) != nil,
              let content = parameters["content"] as? String, !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, content.count <= 20000 else { throw AIError.invalid }
        if let previous = try await store.round(requestID, account: account) {
            guard previous.conversationId == group.id && previous.content == content else { throw AIError.invalid }
            return ["requested": true]
        }
        guard generation == epoch else { throw CancellationError() }
        guard discussionTask == nil && !discussionControlling && !groupPreparing && groupJobs.isEmpty else { throw AIError.busy }
        let state = AIGroupDiscussion(id: requestID, conversationId: group.id, roundsStarted: 1, maxRounds: group.maxRounds ?? 3)
        discussionRun = (account, state)
        do {
            let result = try await sendGroup(account: account, parameters: parameters, regenerate: false, discussion: state)
            launchDiscussion(account: account, id: state.id)
            discussionChanged()
            return result
        } catch {
            if var stopped = discussionRun, stopped.state.id == state.id {
                stopped.state.status = "interrupted"; stopped.state.revision += 1; discussionRun = stopped
                if (try? await store.round(state.id, account: account)) != nil { try? await store.saveDiscussion(stopped.state, account: account) }
            }
            throw error
        }
    }
    private func launchDiscussion(account: String, id: String) {
        discussionTask = Task { [weak self] in
            guard let self else { return }
            do {
                while let run = self.discussionRun, run.account == account, run.state.id == id, run.state.status == "running" {
                    // Tasks are all launched before awaiting: each persona streams independently.
                    let children = self.groupJobs.values.filter { $0.account == account && $0.message.conversationId == run.state.conversationId }.compactMap(\.task)
                    for child in children { await child.value }
                    try Task.checkCancellation()
                    guard let root = try await self.store.round(id, account: account) else { throw AIError.storage }
                    try Task.checkCancellation()
                    // Read mutable run state after the actor hop: pause/stop may have arrived meanwhile.
                    guard var next = self.discussionRun, next.state.id == id, next.state.status == "running" else { break }
                    let total = root.members.count
                    if next.state.roundsStarted >= next.state.maxRounds || next.state.suspendedPersonaIds.count >= total {
                        next.state.status = next.state.roundsStarted >= next.state.maxRounds ? "completed" : "paused"; next.state.revision += 1
                        self.discussionRun = next
                        try await self.store.saveDiscussion(next.state, account: account)
                        self.discussionChanged(); break
                    }
                    next.state.roundsStarted += 1; next.state.revision += 1
                    self.discussionRun = next
                    try Task.checkCancellation()
                    _ = try await self.sendGroup(account: account, parameters: ["conversationId": next.state.conversationId, "requestId": UUID().uuidString, "content": root.content], regenerate: false, discussion: next.state)
                    self.discussionChanged()
                }
            } catch {
                if var run = self.discussionRun, run.state.id == id, run.state.status == "running" {
                    run.state.status = "interrupted"; run.state.revision += 1
                    run.state.error = Task.isCancelled ? nil : NativeDiagnostics.summary(error)
                    self.discussionRun = run
                    try? await self.store.saveDiscussion(run.state, account: account)
                    self.discussionChanged()
                }
            }
            self.discussionTask = nil
        }
    }
    private func haltDiscussion(status: String) async throws {
        guard var run = discussionRun else { throw AIError.invalid }
        run.state.status = status; run.state.revision += 1
        discussionRun = run
        let pending = discussionTask
        pending?.cancel()
        for id in Array(groupJobs.keys) where groupJobs[id]?.account == run.account && groupJobs[id]?.message.conversationId == run.state.conversationId {
            groupJobs[id]?.terminal = "cancelled"; groupJobs[id]?.task?.cancel()
        }
        // Drain both scheduled and streaming work before allowing an interjection or summary.
        await pending?.value
        let children = groupJobs.values.filter { $0.account == run.account && $0.message.conversationId == run.state.conversationId }.compactMap(\.task)
        for child in children { await child.value }
        try await store.saveDiscussion(run.state, account: run.account)
        discussionChanged()
    }
    private func checkDiscussionGeneration(_ generation: Int) async throws {
        guard generation == epoch && !Task.isCancelled else {
            if var run = discussionRun {
                run.state.status = "interrupted"; run.state.revision += 1; discussionRun = run
                try? await store.saveDiscussion(run.state, account: run.account)
            }
            throw CancellationError()
        }
    }
    private func controlDiscussion(_ method: String, account: String, parameters: [String: Any]) async throws -> Any {
        guard !discussionControlling && (!groupPreparing || discussionTask != nil) && !preparing && !configuring && task == nil && catalogTask == nil && subscriptionTask == nil,
              let conversation = parameters["conversationId"] as? String, UUID(uuidString: conversation) != nil else { throw AIError.busy }
        discussionControlling = true; defer { discussionControlling = false }
        let generation = epoch
        if discussionRun?.account != account || discussionRun?.state.conversationId != conversation {
            guard discussionTask == nil, groupJobs.isEmpty,
                  let saved = try await store.discussions(account).first(where: { $0.conversationId == conversation }) else { throw AIError.invalid }
            discussionRun = (account, saved)
        }
        guard var run = discussionRun, run.account == account, run.state.conversationId == conversation else { throw AIError.invalid }
        let action = parameters["action"] as? String
        if method == "ai.discussionControl" {
            guard let action, ["pause", "continue", "end"].contains(action) else { throw AIError.invalid }
            if action == "pause" || action == "end" {
                try await haltDiscussion(status: action == "pause" ? "paused" : "ended")
                return ["requested": true]
            }
            guard discussionTask == nil, groupJobs.isEmpty, ["paused", "interrupted"].contains(run.state.status), run.state.roundsStarted < run.state.maxRounds else { throw AIError.busy }
            run.state.status = "running"; run.state.error = nil; run.state.suspendedPersonaIds = []; run.state.revision += 1
            discussionRun = run; try await store.saveDiscussion(run.state, account: account)
            try await checkDiscussionGeneration(generation)
            launchDiscussion(account: account, id: run.state.id); discussionChanged()
            return ["requested": true]
        }
        guard let requestID = parameters["requestId"] as? String, UUID(uuidString: requestID) != nil else { throw AIError.invalid }
        // Explicit action IDs deduplicate uncertain bridge delivery, including after reopening.
        let history = try await store.messages(conversation, account: account)
        if let old = history.first(where: { $0.requestId == requestID }) {
            if method == "ai.discussionIntervene" { guard old.role == "user", old.content == parameters["content"] as? String else { throw AIError.invalid } }
            else { guard old.purpose == "summary", old.personaId == parameters["personaId"] as? String else { throw AIError.invalid } }
            return ["requested": true]
        }
        if method == "ai.discussionIntervene" {
            guard let content = parameters["content"] as? String, !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, content.count <= 20000,
                  ["running", "paused", "interrupted"].contains(run.state.status) else { throw AIError.invalid }
            try await haltDiscussion(status: "paused")
            var user = AIMessage(id: UUID().uuidString, conversationId: conversation, role: "user", content: content, status: "done", createdAt: aiTimestamp(), requestId: requestID)
            user.discussionId = run.state.id
            guard let root = try await store.round(run.state.id, account: account), history.count < 1000 else { throw AIError.tooLarge }
            try await checkDiscussionGeneration(generation)
            run = discussionRun!
            // The cap is never reset by an interjection. At the cap the instruction is kept for the summary.
            run.state.status = run.state.roundsStarted < run.state.maxRounds ? "running" : "completed"
            run.state.suspendedPersonaIds = []; run.state.error = nil; run.state.revision += 1
            try await store.beginRound(root, user: user, assistants: [], account: account, saveSnapshot: false, discussion: run.state, insertSnapshot: false)
            discussionRun = run
            try await checkDiscussionGeneration(generation)
            if run.state.status == "running" { launchDiscussion(account: account, id: run.state.id) }
            discussionChanged(); return ["requested": true]
        }
        guard let persona = parameters["personaId"] as? String,
              let root = try await store.round(run.state.id, account: account),
              let group = try await store.groups(account).first(where: { $0.id == conversation }), group.participants.contains(where: { $0.id == persona }) else { throw AIError.invalid }
        if let previous = try await store.round(requestID, account: account) {
            guard previous.conversationId == conversation, previous.purpose == "summary", previous.members.first?.persona.id == persona else { throw AIError.invalid }
            return ["requested": true]
        }
        try await haltDiscussion(status: "ended")
        try await checkDiscussionGeneration(generation)
        run = discussionRun!; run.state.status = "summarizing"; run.state.revision += 1
        discussionRun = run
        let result: Any
        do { result = try await sendGroup(account: account, parameters: ["conversationId": conversation, "requestId": requestID, "content": root.content], regenerate: false, discussion: run.state, summaryPersona: persona) }
        catch {
            run.state.status = "interrupted"; run.state.revision += 1; run.state.error = NativeDiagnostics.summary(error)
            discussionRun = run; try? await store.saveDiscussion(run.state, account: account); discussionChanged()
            throw error
        }
        discussionChanged()
        let summaryRunID = run.state.id
        discussionTask = Task { [weak self] in
            guard let self else { return }
            let children = self.groupJobs.values.filter { $0.account == account && $0.message.conversationId == conversation }.compactMap(\.task)
            for child in children { await child.value }
            if var ended = self.discussionRun, ended.state.id == summaryRunID, ended.state.status == "summarizing" {
                ended.state.status = Task.isCancelled ? "interrupted" : "ended"; ended.state.revision += 1; self.discussionRun = ended
                try? await self.store.saveDiscussion(ended.state, account: account); self.discussionChanged()
            }
            self.discussionTask = nil
        }
        return result
    }

    private func runGroupMember(_ member: AIGroupMember, round: AIGroupRound, account: String, messageID: String) async {
        do {
            try Task.checkCancellation()
            guard let currentProvider = try await store.providers(account).first(where: { $0.id == member.provider.id }), currentProvider.enabled else { throw AIError.invalid }
            guard currentProvider.baseURL == member.provider.baseURL, currentProvider.models.contains(where: { $0.id == member.model.id }) else { throw AIError.endpointChanged }
            try Task.checkCancellation()
            groupJobs[messageID]?.message.requestCount = 1
            try await perform(provider: member.provider, model: member.model, persona: member.persona, context: round.context, account: account) { [weak self] part in
                guard let self else { throw CancellationError() }
                try await self.receiveGroup(part, id: messageID)
            }
            try Task.checkCancellation()
            guard !(groupJobs[messageID]?.message.content.isEmpty ?? true) else { throw AIError.stream }
            try await finishGroup(id: messageID, status: "done", error: nil)
        } catch {
            let cancelled = Task.isCancelled || (error as? URLError)?.code == .cancelled
            let status = cancelled ? (groupJobs[messageID]?.terminal ?? "cancelled") : "failed"
            let text = cancelled ? nil : ((error as? SIWCFailure)?.errorDescription ?? NativeDiagnostics.summary(error))
            do { try await finishGroup(id: messageID, status: status, error: text) }
            catch { if var job = groupJobs[messageID] { job.message.status = "interrupted"; job.message.seq += 1; publish(job.message, account: account) } }
        }
        if let job = groupJobs[messageID], job.message.status != "done", job.message.purpose == "discussion" {
            suspendDiscussionPersona(member.persona.id)
        }
        groupJobs.removeValue(forKey: messageID)
    }
    private func receiveGroup(_ part: AIStreamPart, id: String) async throws {
        try Task.checkCancellation()
        guard let job = groupJobs[id] else { throw CancellationError() }
        var value = job.message
        guard value.content.utf8.count + part.delta.utf8.count <= 2 * 1024 * 1024 else { throw AIError.tooLarge }
        value.content += part.delta
        if let usage = part.usage { value.usage = usage; value.cost = value.model.flatMap { usage.cost(model: $0) } }
        value.seq += 1
        try await store.update(value, account: job.account)
        groupJobs[id]?.message = value
        publish(value, account: job.account)
    }
    private func finishGroup(id: String, status: String, error: String?) async throws {
        guard let job = groupJobs[id] else { return }
        var value = job.message; value.status = status; value.error = error; value.seq += 1
        try await store.update(value, account: job.account)
        groupJobs[id]?.message = value
        publish(value, account: job.account)
    }

}
