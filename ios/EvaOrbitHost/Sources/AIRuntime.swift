import Foundation

@MainActor
final class AIRuntime {
    typealias Stream = (URLRequest, @escaping (AIStreamPart) async throws -> Void) async throws -> Void
    typealias Catalog = (URLRequest, String) async throws -> AIModelCatalog
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
    nonisolated static let methods: Set<String> = ["ai.getState", "ai.saveProvider", "ai.deleteProvider", "ai.send", "ai.cancel", "ai.deleteConversation", "ai.savePersona", "ai.listModels", "ai.cancelModelList"]

    init(store: AIStore, secrets: AISecretStore = AICredentialStore(), catalog: Catalog? = nil, stream: Stream? = nil) {
        self.store = store; self.secrets = secrets
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
        task?.cancel()
        catalogTask?.cancel()
    }

    func handle(_ method: String, account: String, parameters: [String: Any], emit: @escaping ([String: Any]) -> Void) async throws -> Any {
        guard Self.methods.contains(method), UUID(uuidString: account) != nil else { throw AIError.invalid }
        self.emit = emit
        emitAccount = account
        switch method {
        case "ai.listModels":
            return try await listModels(account: account, parameters: parameters)
        case "ai.cancelModelList":
            if catalogAccount == account { epoch += 1; catalogTask?.cancel() }
            return ["requested": true]
        case "ai.getState":
            var providers: [[String: Any]] = []
            for provider in try await store.providers(account) {
                var item = try aiJSON(provider) as! [String: Any]
                item["hasKey"] = try secrets.read(account: account, provider: provider.id) != nil
                providers.append(item)
            }
            let conversation = parameters["conversationId"] as? String
            if let conversation, UUID(uuidString: conversation) == nil { throw AIError.invalid }
            let conversations = try await store.conversations(account)
            let messages: [AIMessage]
            if let conversation { messages = try await store.messages(conversation, account: account) }
            else { messages = [] }
            var result: [String: Any] = ["providers": providers, "conversations": try aiJSON(conversations), "messages": try aiJSON(messages)]
            result["persona"] = try aiJSON(await store.defaultPersona(account))
            if let active = current, active.account == account { result["active"] = try aiJSON(active.message) }
            return result
        case "ai.savePersona":
            guard !preparing && !configuring && task == nil && catalogTask == nil else { throw AIError.busy }
            configuring = true
            defer { configuring = false }
            guard let raw = parameters["persona"] as? [String: Any], let data = try? JSONSerialization.data(withJSONObject: raw), data.count <= 65536,
                  let persona = try? JSONDecoder().decode(ParlorPersona.self, from: data) else { throw AIError.invalid }
            try persona.validate()
            if let providerID = persona.providerId, let modelID = persona.modelId {
                guard let provider = try await store.providers(account).first(where: { $0.id == providerID }), provider.models.contains(where: { $0.id == modelID }) else { throw AIError.invalid }
            }
            try await store.savePersona(persona, account: account)
            return ["saved": true]
        case "ai.saveProvider":
            guard !preparing && !configuring && task == nil && catalogTask == nil else { throw AIError.busy }
            configuring = true
            defer { configuring = false }
            guard let raw = parameters["provider"] as? [String: Any],
                  !raw.keys.contains("apiKey"), let data = try? JSONSerialization.data(withJSONObject: raw),
                  data.count <= 128 * 1024, let provider = try? JSONDecoder().decode(AIProvider.self, from: data) else { throw AIError.invalid }
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
            guard !preparing && !configuring && task == nil && catalogTask == nil else { throw AIError.busy }
            configuring = true
            defer { configuring = false }
            guard let id = parameters["providerId"] as? String, UUID(uuidString: id) != nil else { throw AIError.invalid }
            try secrets.remove(account: account, provider: id)
            try await store.deleteProvider(id, account: account)
            return ["deleted": true]
        case "ai.deleteConversation":
            guard let id = parameters["conversationId"] as? String, UUID(uuidString: id) != nil else { throw AIError.invalid }
            guard current?.account != account || current?.message.conversationId != id else { throw AIError.busy }
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
        guard !preparing && !configuring && task == nil && catalogTask == nil else { throw AIError.busy }
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
        guard task == nil && !preparing && !configuring && catalogTask == nil else { throw AIError.busy }
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
        let persona = try await store.defaultPersona(account)
        if let requested = parameters["personaId"] as? String, requested != persona.id { throw AIError.invalid }
        // Delivery retries are never model retries. The UI keeps a stable request ID until acknowledged.
        if let index = history.firstIndex(where: { $0.requestId == requestID }) {
            let previous = history[index]
            guard index > 0, history[index - 1].content == content, previous.providerId == providerID, previous.model?.id == modelID else { throw AIError.invalid }
            return ["requestId": requestID, "messageId": previous.id]
        }
        guard let provider = try await store.providers(account).first(where: { $0.id == providerID && $0.enabled }),
              let model = provider.models.first(where: { $0.id == modelID }) else { throw AIError.invalid }
        guard let key = try secrets.read(account: account, provider: providerID) else { throw AIError.missingKey }
        let selected = history.filter { $0.role == "user" || ($0.role == "assistant" && $0.status == "done") }
        // ponytail: bounded full history, no silent truncation; token budgeting and summaries belong to Phase 3.
        guard selected.reduce(content.utf8.count, { $0 + $1.content.utf8.count }) <= 128 * 1024, history.count < 998 else { throw AIError.tooLarge }
        guard !content.contains(key) else { throw AIError.invalid }
        var request = URLRequest(url: try provider.endpoint())
        request.httpMethod = "POST"; request.httpShouldHandleCookies = false
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "model": model.id, "stream": true, "stream_options": ["include_usage": true],
            "messages": [["role": "system", "content": persona.runtimePrompt]]
                + selected.map { ["role": $0.role, "content": $0.content] } + [["role": "user", "content": content]]
        ])
        let timestamp = aiTimestamp()
        let user = AIMessage(id: UUID().uuidString, conversationId: conversation, role: "user", content: content, status: "done", createdAt: timestamp)
        let assistant = AIMessage(id: UUID().uuidString, conversationId: conversation, role: "assistant", content: "", status: "streaming", createdAt: timestamp,
                                  requestId: requestID, providerId: providerID, providerName: provider.name, model: model,
                                  currency: provider.currency, priceUpdatedAt: model.priceUpdatedAt ?? provider.priceUpdatedAt, usage: AIUsage(), requestCount: 1,
                                  personaId: persona.id, personaName: persona.name)
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
                try await self.stream(request) { [weak self] part in
                    guard let self else { throw CancellationError() }
                    try await self.receive(part, account: account, requestID: requestID)
                }
                try Task.checkCancellation()
                guard !(self.current?.message.content.isEmpty ?? true) else { throw AIError.stream }
                try await self.finish(status: "done", error: nil)
            } catch {
                let cancelled = Task.isCancelled || (error as? URLError)?.code == .cancelled
                let status = cancelled ? (self.terminalStatus ?? "cancelled") : "failed"
                let message = cancelled ? nil : NativeDiagnostics.summary(error)
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
}
