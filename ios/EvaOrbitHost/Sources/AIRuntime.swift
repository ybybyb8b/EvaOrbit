import Foundation
import UIKit

@MainActor
final class AIRuntime {
    typealias Stream = (URLRequest, @escaping (AIStreamPart) async throws -> Void) async throws -> Void
    typealias Catalog = (URLRequest, String) async throws -> AIModelCatalog
    typealias ConfirmOrbitAction = @MainActor (String, String) async -> Bool
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
    private var modelSwitching = false
    private var groupPreparing = false
    private var groupPreparingScope: (String, String)?
    private var subscriptionTask: Task<Any, Error>?
    private func subscription(_ account: String) -> SIWCRuntime {
        if let saved = subscriptionClients[account] { return saved }
        let client = subscriptionFactory(account)
        subscriptionClients[account] = client
        return client
    }
    private let echoTransport: AIEchoClient.Transport
    private lazy var echoClient = AIEchoClient(store: store, transport: echoTransport)
    private var memoryIdle: Bool { task == nil && !preparing && !configuring && catalogTask == nil && subscriptionTask == nil && !groupPreparing && groupJobs.isEmpty && discussionTask == nil && !discussionControlling && !modelSwitching }
    private lazy var memoryProcessor = AIMemoryProcessor(store: store, transport: { [weak self] job, input, dispatch, receive in
        guard let self else { throw CancellationError() }
        try await self.perform(provider: job.provider, model: job.model, persona: AIMemoryProcessing.workerPersona, context: input, account: job.accountId, dispatch: dispatch, receive: receive)
    }, idle: { [weak self] in self?.memoryIdle == true }, changed: { [weak self] account in
        guard let self, self.emitAccount == account else { return }; self.emit?(["accountId": account, "eventType": "memory"])
    })
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
    nonisolated static let processingMethods: Set<String> = ["ai.memoryProcessingGet", "ai.memoryProcessingConfigure", "ai.memoryProcess", "ai.memoryProcessingRetry", "ai.memoryProcessingCancel", "ai.memoryProposalReview", "ai.memoryConversationEnded"]
    nonisolated static let echoMethods: Set<String> = ["ai.echoGet", "ai.echoConfigure", "ai.echoClear", "ai.echoEntities", "ai.echoSharePrepare", "ai.echoShareSubmit", "ai.echoShareStatus"]
    nonisolated static let contextMethods: Set<String> = ["ai.messagePage", "ai.contextGet", "ai.contextSave"]
    nonisolated static let memoryMethods: Set<String> = ["ai.memoryList", "ai.memoryDetail", "ai.memorySave", "ai.memoryDelete", "ai.memorySources", "ai.assignConversationPersona", "ai.exportBackup", "ai.restoreBackup"]
    nonisolated static let orbitSendMethod = "ai.sendWithOrbit"
    nonisolated static let methods: Set<String> = Set(["ai.getState", "ai.saveProvider", "ai.deleteProvider", "ai.send", orbitSendMethod, "ai.retryMessage", "ai.deleteMessage", "ai.cancel", "ai.deleteConversation", "ai.savePersona", "ai.listModels", "ai.cancelModelList", "ai.subscriptionLogin", "ai.subscriptionLogout", "ai.subscriptionModels", "ai.saveGroup", "ai.groupSend", "ai.groupCancel", "ai.groupRegenerate", "ai.discussionControl", "ai.discussionIntervene", "ai.discussionSummarize", "ai.setConversationModel"]).union(memoryMethods).union(contextMethods).union(processingMethods).union(echoMethods)

    init(store: AIStore, secrets: AISecretStore = AICredentialStore(), catalog: Catalog? = nil, subscriptionFactory: ((String) -> SIWCRuntime)? = nil, echoTransport: AIEchoClient.Transport? = nil, stream: Stream? = nil) {
        self.store = store; self.secrets = secrets
        self.echoTransport = echoTransport ?? { _, _, _, _ in throw AIError.invalid }
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
        memoryProcessor.cancel(); echoClient.cancel()
        terminalStatus = "interrupted"
        emit = nil // Old account / document receives no later token events.
        discussionTask?.cancel()
        task?.cancel()
        catalogTask?.cancel()
        subscriptionTask?.cancel()
        for id in Array(groupJobs.keys) { groupJobs[id]?.terminal = "interrupted"; groupJobs[id]?.task?.cancel() }
    }

    func handle(_ method: String, account: String, parameters: [String: Any], confirmOrbitAction: ConfirmOrbitAction? = nil, emit: @escaping ([String: Any]) -> Void) async throws -> Any {
        guard Self.methods.contains(method), UUID(uuidString: account) != nil else { throw AIError.invalid }
        let requestEpoch = epoch
        if ["ai.send", Self.orbitSendMethod, "ai.retryMessage", "ai.deleteMessage", "ai.groupSend", "ai.groupRegenerate", "ai.discussionIntervene", "ai.discussionControl", "ai.discussionSummarize", "ai.setConversationModel", "ai.restoreBackup", "ai.exportBackup", "ai.deleteConversation", "ai.memoryDelete", "ai.memorySave", "ai.saveProvider", "ai.deleteProvider", "ai.subscriptionLogin", "ai.subscriptionLogout"].contains(method) { await memoryProcessor.yield() }
        guard requestEpoch == epoch && !Task.isCancelled else { throw CancellationError() }
        guard !modelSwitching || method == "ai.getState" else { throw AIError.busy }
        self.emit = emit
        emitAccount = account
        switch method {
        case let method where Self.echoMethods.contains(method):
            return try await echoOperation(method, account: account, parameters: parameters)
        case let method where Self.processingMethods.contains(method):
            return try await processingOperation(method, account: account, parameters: parameters)
        case let method where Self.contextMethods.contains(method):
            return try await contextOperation(method, account: account, parameters: parameters)
        case let method where Self.memoryMethods.contains(method):
            return try await memoryOperation(method, account: account, parameters: parameters)
        case "ai.setConversationModel":
            return try await setConversationModel(account: account, parameters: parameters)
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
            let page: AIMessagePage?
            if let conversation { page = try await store.messagePage(conversation, account: account, limit: 200) } else { page = nil }
            let messages = page?.records.map(\.message) ?? []
            var result: [String: Any] = ["providers": providers, "conversations": try aiJSON(conversations), "messages": try aiJSON(messages)]
            if let page { result["messagePage"] = try messagePageJSON(page) }
            if let conversation, let id = parameters["trackedMessageId"] as? String, UUID(uuidString: id) != nil,
               !messages.contains(where: { $0.id == id }),
               let record = try await store.contextRecord(id, conversation: conversation, account: account) {
                result["trackedMessage"] = try aiJSON(record.message)
            }
            result["subscriptionConnected"] = try subscription(account).keychain.read()?.enabled ?? false
            result["persona"] = try aiJSON(await store.defaultPersona(account))
            result["personas"] = try aiJSON(await store.personas(account))
            if let conversation {
                result["conversationModels"] = try aiJSON(await store.conversationModels(conversation, account: account))
                if let metadata = try await store.conversations(account, all: true).first(where: { $0.id == conversation }) { result["conversation"] = try aiJSON(metadata) }
            }
            result["unassignedConversations"] = try aiJSON(await store.conversations(account, all: true).filter { $0.ownership == "unresolved" })
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
        case "ai.deleteMessage":
            guard let conversation = parameters["conversationId"] as? String, UUID(uuidString: conversation) != nil,
                  let id = parameters["messageId"] as? String, UUID(uuidString: id) != nil else { throw AIError.invalid }
            guard !preparing, !configuring, current?.account != account || current?.message.conversationId != conversation else { throw AIError.busy }
            configuring = true
            defer { configuring = false }
            try await store.deleteSingleMessage(id, conversation: conversation, account: account)
            return ["deleted": true]
        case "ai.cancel":
            guard let id = parameters["requestId"] as? String, UUID(uuidString: id) != nil else { throw AIError.invalid }
            if (current?.account == account && current?.message.requestId == id) || (preparingRequest?.account == account && preparingRequest?.id == id) {
                epoch += 1; terminalStatus = "cancelled"; task?.cancel()
            }
            return ["requested": true]
        case "ai.send":
            return try await send(account: account, parameters: parameters)
        case "ai.retryMessage":
            return try await send(account: account, parameters: parameters, retry: true)
        case Self.orbitSendMethod:
            return try await send(account: account, parameters: parameters, useOrbit: true, confirm: confirmOrbitAction)
        default: throw AIError.invalid
        }
    }

    private func echoOperation(_ method: String, account: String, parameters: [String: Any]) async throws -> Any {
        if method == "ai.echoGet" {
            let config = try await store.echoConfig(account)
            var result: [String: Any] = ["config": try aiJSON(config), "shares": []]
            if let persona = parameters["personaId"] as? String { result["shares"] = try await store.echoShares(persona: persona, account: account).map { share -> [String: Any] in
                var row = try aiJSON(share) as? [String: Any] ?? [:]; row["hasPayload"] = share.payloadJSON != nil; row.removeValue(forKey: "payloadJSON"); return row
            } }
            let latestSnapshot: AIEchoSnapshot?
            if let id = config.lastSnapshotId { latestSnapshot = try await store.echoSnapshot(id, account: account) }
            else { latestSnapshot = try await store.documents("SELECT payload FROM ai_echo_snapshots WHERE account_id=? ORDER BY rowid DESC LIMIT 1", [account], as: AIEchoSnapshot.self).first }
            if var latest = latestSnapshot {
                result["cacheAvailable"] = latest.contextJSON != nil && latest.expiresAt > aiTimestamp() && config.readEnabled
                if let json = latest.contextJSON, let body = try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any] { result["coverage"] = body["coverage"] }
                latest.contextJSON = nil; result["snapshot"] = try aiJSON(latest)
            }
            return result
        }
        if method == "ai.echoConfigure" || method == "ai.echoClear" {
            guard memoryIdle else { throw AIError.busy }
            if method == "ai.echoClear" {
                try await echoClient.clear(account: account)
            } else {
                guard let read = parameters["readEnabled"] as? Bool, let write = parameters["writeEnabled"] as? Bool else { throw AIError.invalid }
                try await echoClient.configure(account: account, read: read, write: write)
            }
            return ["saved": true]
        }
        if method == "ai.echoEntities" { return try await echoClient.entities(account: account, query: parameters["query"] as? String ?? "", cursor: parameters["cursor"] as? String) }
        guard let persona = parameters["personaId"] as? String else { throw AIError.invalid }
        if method == "ai.echoSharePrepare" {
            guard let entity = parameters["entityId"] as? String else { throw AIError.invalid }
            return try aiJSON(await store.prepareEchoShare(account: account, persona: persona, entity: entity, predicate: parameters["predicate"] as? String ?? "parlor_memory", memoryId: parameters["memoryId"] as? String, version: parameters["version"] as? Int, conversation: parameters["conversationId"] as? String, messageId: parameters["messageId"] as? String, excerpt: parameters["excerpt"] as? String))
        }
        guard let id = parameters["requestId"] as? String else { throw AIError.invalid }
        return try aiJSON(await echoClient.share(account: account, persona: persona, id: id, confirmed: parameters["confirmed"] as? Bool == true, checkOnly: method == "ai.echoShareStatus"))
    }

    private func processingOperation(_ method: String, account: String, parameters: [String: Any]) async throws -> Any {
        if method == "ai.memoryConversationEnded" {
            guard let conversation = parameters["conversationId"] as? String, UUID(uuidString: conversation) != nil else { throw AIError.invalid }
            memoryProcessor.schedule(account: account, conversation: conversation, ended: true); return ["scheduled": true]
        }
        guard let persona = parameters["personaId"] as? String else { throw AIError.invalid }
        let generation = epoch
        _ = try await store.processingConfig(persona: persona, account: account)
        guard generation == epoch && !Task.isCancelled else { throw CancellationError() }
        if method == "ai.memoryProcessingGet" {
            let jobs = try await store.processingJobs(persona: persona, account: account)
            let all = try await store.processingJobs(persona: persona, account: account, all: true)
            let attempts = all.flatMap(\.attempts).filter(\.dispatched)
            return ["config": try aiJSON(await store.processingConfig(persona: persona, account: account)), "jobs": try aiJSON(jobs), "proposals": try aiJSON(await store.processingProposals(persona: persona, account: account)), "requestCount": attempts.count, "attempts": try aiJSON(attempts)]
        }
        if method == "ai.memoryProcessingCancel" { try await memoryProcessor.cancel(account: account, persona: persona); return ["cancelled": true] }
        if method == "ai.memoryProcess" {
            guard let conversation = parameters["conversationId"] as? String else { throw AIError.invalid }
            if let id = try await memoryProcessor.request(account: account, persona: persona, conversation: conversation) { return ["jobId": id] }
            return ["alreadyProcessed": true]
        }
        if method == "ai.memoryProcessingRetry" {
            guard let id = parameters["jobId"] as? String else { throw AIError.invalid }
            try await memoryProcessor.retry(account: account, persona: persona, id: id); return ["started": true]
        }
        if method == "ai.memoryProcessingConfigure" {
            guard let raw = parameters["config"], let data = try? JSONSerialization.data(withJSONObject: raw), data.count < 16384 else { throw AIError.invalid }
            let config = try JSONDecoder().decode(AIMemoryProcessingConfig.self, from: data)
            guard config.personaId == persona else { throw AIError.ownership }
            guard !configuring else { throw AIError.busy }
            configuring = true; defer { configuring = false }
            await memoryProcessor.yield()
            guard generation == epoch && !Task.isCancelled else { throw CancellationError() }
            try await store.saveProcessingConfig(config, account: account)
            return ["saved": true]
        }
        guard memoryIdle, let id = parameters["proposalId"] as? String, let accept = parameters["accept"] as? Bool else { throw AIError.busy }
        configuring = true; defer { configuring = false }
        await memoryProcessor.yield()
        guard generation == epoch && !Task.isCancelled else { throw CancellationError() }
        return try aiJSON(await store.reviewProcessingProposal(id, persona: persona, account: account, accept: accept, edited: parameters["content"] as? String, targetId: parameters["targetId"] as? String, targetVersion: parameters["targetVersion"] as? Int))
    }

    private func messagePageJSON(_ page: AIMessagePage) throws -> [String: Any] {
        var value: [String: Any] = ["messages": try aiJSON(page.records.map(\.message)), "hasMore": page.hasMore, "watermark": page.watermark, "total": page.total]
        if let before = page.before { value["beforeOrdinal"] = before }
        return value
    }

    private func contextOperation(_ method: String, account: String, parameters: [String: Any]) async throws -> Any {
        guard let conversation = parameters["conversationId"] as? String, UUID(uuidString: conversation) != nil else { throw AIError.invalid }
        if method == "ai.messagePage" {
            return try messagePageJSON(await store.messagePage(conversation, account: account, before: parameters["beforeOrdinal"] as? Int64, limit: parameters["limit"] as? Int ?? 100))
        }
        guard let persona = parameters["personaId"] as? String else { throw AIError.invalid }
        let scope = try await store.contextScope(conversation, persona: persona, account: account)
        if method == "ai.contextGet" {
            let versions = try await store.contextVersions(conversation, scope: scope, account: account)
            var value: [String: Any] = ["scope": scope, "versions": try aiJSON(versions), "watermark": try await store.messageWatermark(conversation, account: account)]
            value["page"] = try messagePageJSON(await store.messagePage(conversation, account: account, limit: 200))
            return value
        }
        guard !preparing && !configuring && task == nil && catalogTask == nil && subscriptionTask == nil && !groupPreparing && groupJobs.isEmpty && discussionTask == nil && !discussionControlling else { throw AIError.busy }
        guard let content = parameters["content"] as? String, let unresolved = parameters["unresolved"] as? [String], let expected = parameters["expectedVersion"] as? Int else { throw AIError.invalid }
        configuring = true; defer { configuring = false }
        return try aiJSON(await store.saveConversationContext(conversation, persona: persona, account: account, content: content, unresolved: unresolved, throughMessageId: parameters["throughMessageId"] as? String, recentLimit: parameters["recentMessageLimit"] as? Int ?? 0, expectedVersion: expected))
    }

    private func memoryOperation(_ method: String, account: String, parameters: [String: Any]) async throws -> Any {
        if method == "ai.memoryList" || method == "ai.memoryDetail" || method == "ai.memorySources" {
            guard let persona = parameters["personaId"] as? String else { throw AIError.invalid }
            if method == "ai.memoryDetail" {
                guard let id = parameters["id"] as? String else { throw AIError.invalid }
                return try aiJSON(await store.memoryVersions(id, persona: persona, account: account))
            }
            if method == "ai.memorySources" {
                if let conversation = parameters["conversationId"] as? String {
                    return try aiJSON(await store.memorySources(conversation, persona: persona, account: account))
                }
                return try aiJSON(await store.memoryConversations(persona: persona, account: account))
            }
            let kind: AIMemoryKind?
            if let raw = parameters["kind"] as? String { guard let parsed = AIMemoryKind(rawValue: raw) else { throw AIError.invalid }; kind = parsed } else { kind = nil }
            return try aiJSON(await store.memories(persona: persona, account: account, kind: kind))
        }
        guard !preparing && !configuring && task == nil && catalogTask == nil && subscriptionTask == nil && !groupPreparing && groupJobs.isEmpty && discussionTask == nil && !discussionControlling else { throw AIError.busy }
        configuring = true; defer { configuring = false }
        if method == "ai.exportBackup" { return try aiJSON(await store.exportBackup(account: account)) }
        if method == "ai.restoreBackup" {
            guard parameters["confirmReplace"] as? Bool == true, let raw = parameters["document"] as? [String: Any],
                  let data = try? JSONSerialization.data(withJSONObject: raw), data.count <= 16 * 1024 * 1024,
                  let document = try? JSONDecoder().decode(AIBackupDocument.self, from: data) else { throw AIError.invalid }
            try await store.prepareRestoreBackup(document, account: account)
            // Credentials never travel with a backup or silently follow a restored endpoint.
            let providers = (try await store.providers(account)) + document.payload.providers
            for id in Set(providers.map(\.id)) where id != Self.subscriptionID { try secrets.remove(account: account, provider: id) }
            echoClient.cancel()
            try await store.restoreBackup(document, account: account, createSafetyBackup: false)
            discussionRun = nil
            return ["restored": true, "credentialsIncluded": false]
        }
        guard let persona = parameters["personaId"] as? String else { throw AIError.invalid }
        if method == "ai.assignConversationPersona" {
            guard let conversation = parameters["conversationId"] as? String else { throw AIError.invalid }
            try await store.assignConversation(conversation, persona: persona, account: account)
            return ["saved": true]
        }
        guard let expected = parameters["expectedVersion"] as? Int, expected >= 0 else { throw AIError.invalid }
        if method == "ai.memoryDelete" {
            guard let id = parameters["id"] as? String else { throw AIError.invalid }
            try await store.deleteMemory(id, expectedVersion: expected, persona: persona, account: account)
            return ["deleted": true]
        }
        guard let raw = parameters["memory"] as? [String: Any], let data = try? JSONSerialization.data(withJSONObject: raw), data.count <= 256 * 1024,
              let memory = try? JSONDecoder().decode(AIPersonaMemory.self, from: data) else { throw AIError.invalid }
        return try aiJSON(await store.saveMemory(memory, expectedVersion: expected, persona: persona, account: account))
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

    private struct OrbitReply {
        var context: [[String: String]]
        var receipt: String?
        var plannerUsage: AIUsage?
    }

    private static func combinedOrbitUsage(_ planner: AIUsage?, _ answer: AIUsage) -> AIUsage {
        func total(_ first: Int?, _ second: Int?) -> Int? {
            guard let first, let second else { return nil }
            return first + second
        }
        return .init(inputTokens: total(planner?.inputTokens, answer.inputTokens),
                     outputTokens: total(planner?.outputTokens, answer.outputTokens),
                     cachedTokens: total(planner?.cachedTokens, answer.cachedTokens),
                     source: planner?.inputTokens != nil && answer.inputTokens != nil ? "provider" : "unknown")
    }

    private func prepareOrbitReply(provider: AIProvider, model: AIModel, persona: ParlorPersona, context: [[String: String]],
                                   content: String, account: String, english: Bool, confirm: ConfirmOrbitAction?) async throws -> OrbitReply {
        func localized(_ en: String, _ zh: String) -> String { english ? en : zh }
        var raw = "", completed = false, reply = OrbitReply(context: context)
        let today = ParlorOrbitAction.dateFormat().string(from: Date())
        try await perform(provider: provider, model: model, persona: persona, context: [["role": "user", "content": content]],
                          account: account, instructions: ParlorOrbitAction.instructions(today: today)) { part in
            guard raw.utf8.count + part.delta.utf8.count <= 8192 else { throw AIError.tooLarge }
            raw += part.delta
            completed = completed || part.done
            if let usage = part.usage { reply.plannerUsage = usage }
        }
        try Task.checkCancellation()
        guard completed else { throw AIError.truncated }
        guard let action = try? JSONDecoder().decode(ParlorOrbitAction.self, from: Data(raw.utf8)), action.action != .none else { return reply }
        switch action.action {
        case .create_task, .capture_inbox:
            guard let draft = try? action.draft(english: english) else {
                reply.receipt = localized("Check the content, date or time before trying again.", "未保存。请检查内容、日期或时间后再试。")
                return reply
            }
            guard await confirm?(draft.title, draft.preview) == true else {
                try Task.checkCancellation()
                reply.receipt = localized("Cancelled. Nothing was saved.", "已取消，未保存。")
                return reply
            }
            try Task.checkCancellation()
            let response: [String: Any]
            do {
                response = try await echoTransport(account, draft.path, "POST", draft.payload)
            } catch {
                try Task.checkCancellation()
                reply.receipt = localized("Save result unknown. Check Tasks or Inbox before retrying.", "保存结果未确认。请先检查任务或收件箱，再决定是否重试。")
                return reply
            }
            try Task.checkCancellation()
            guard let status = response["status"] as? Int, (200..<300).contains(status) else {
                reply.receipt = localized("EvaOrbit did not confirm the save. Check your account and the details.", "EvaOrbit 未确认保存。请检查账户和填写的内容。")
                return reply
            }
            let statusText = action.action == .create_task ? localized("Task saved.", "任务已保存。") : localized("Quick note saved to Inbox.", "速记已保存到收件箱。")
            reply.receipt = statusText + "\n\n" + draft.preview
        case .tasks, .calendar, .memory:
            let result: [[String: String]]
            do {
                result = try await orbitRead(action, account: account, persona: persona.id)
            } catch {
                try Task.checkCancellation()
                reply.receipt = localized("EvaOrbit lookup failed. Check your connection, account or date range.", "这次未能读取 EvaOrbit 数据。请检查网络、账户或日期范围后重试。")
                return reply
            }
            try Task.checkCancellation()
            let message = AIContext.dataMessage("evaorbit_\(action.action.rawValue)_lookup", result)
            let budget = try AIContext.budget(model, persona: persona, tail: content)
            if AIContext.tokens(context + [message]) + budget.systemTokens <= budget.inputLimit {
                reply.context.insert(message, at: max(0, reply.context.count - 1))
            } else {
                reply.receipt = localized("The results exceed this model's context budget. Narrow the search.", "查询结果超出当前模型的上下文预算，请缩小查询范围。")
            }
        case .none: break
        }
        return reply
    }

    private func orbitRead(_ action: ParlorOrbitAction, account: String, persona: String) async throws -> [[String: String]] {
        let query = String((action.query?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "").prefix(100))
        if action.action == .memory {
            guard !query.isEmpty else { throw AIError.invalid }
            return try await store.memories(persona: persona, account: account)
                .filter { $0.expiredAt == nil && ($0.content.localizedCaseInsensitiveContains(query) || AIContext.relevance($0, query: query) > 0) }
                .prefix(8).map { ["content": String($0.content.prefix(360))] }
        }
        let path: String
        if action.action == .calendar { path = try action.calendarPath() }
        else { path = "/api/tasks?status=open" }
        let response = try await echoTransport(account, path, "GET", nil)
        guard response["status"] as? Int == 200, let rows = response["body"] as? [[String: Any]] else { throw AIError.invalid }
        let fields = action.action == .calendar ? ["title", "startAt", "endAt", "isAllDay", "timezone", "status"] : ["title", "dueDate", "dueTime", "priority"]
        return rows.filter { query.isEmpty || action.action == .calendar || ($0["title"] as? String)?.localizedCaseInsensitiveContains(query) == true }.prefix(20).map { row in
            Dictionary(uniqueKeysWithValues: fields.compactMap { key in
                if let value = row[key] as? String { return (key, String(value.prefix(240))) }
                if let value = row[key] as? Bool { return (key, String(value)) }
                return nil
            })
        }
    }

    private func send(account: String, parameters: [String: Any], useOrbit: Bool = false, confirm: ConfirmOrbitAction? = nil, retry: Bool = false) async throws -> Any {
        guard task == nil && !preparing && !configuring && catalogTask == nil && subscriptionTask == nil && !groupPreparing && groupJobs.isEmpty && discussionTask == nil && !discussionControlling else { throw AIError.busy }
        preparing = true
        defer { preparing = false; preparingRequest = nil }
        let generation = epoch
        guard let conversation = parameters["conversationId"] as? String, UUID(uuidString: conversation) != nil,
              let requestID = parameters["requestId"] as? String, UUID(uuidString: requestID) != nil else { throw AIError.invalid }
        preparingRequest = (account, requestID)
        guard try await store.groups(account).allSatisfy({ $0.id != conversation }) else { throw AIError.invalid }
        var original: AIMessage?
        var prompt: AIContextRecord?
        if retry {
            guard let id = parameters["messageId"] as? String, UUID(uuidString: id) != nil,
                  let record = try await store.contextRecord(id, conversation: conversation, account: account),
                  record.message.role == "assistant" else { throw AIError.invalid }
            let failed = record.message
            if failed.requestId == requestID { return ["requestId": requestID, "messageId": id] }
            guard ["failed", "interrupted"].contains(failed.status),
                  failed.requestId == parameters["previousRequestId"] as? String,
                  try await store.requestMessage(requestID, conversation: conversation, account: account) == nil else { throw AIError.invalid }
            if let promptID = failed.replyToMessageId {
                prompt = try await store.contextRecord(promptID, conversation: conversation, account: account)
            } else {
                prompt = try await store.messagePage(conversation, account: account, before: record.ordinal, limit: 1).records.last
            }
            guard prompt?.message.role == "user" else { throw AIError.invalidContext }
            original = failed
        }
        guard let providerID = retry ? original?.providerId : parameters["providerId"] as? String,
              let modelID = retry ? original?.model?.id : parameters["modelId"] as? String,
              let content = retry ? prompt?.message.content : parameters["content"] as? String,
              !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, content.count <= 20000 else { throw AIError.invalid }
        let personaID = retry ? original?.personaId : parameters["personaId"] as? String
        let persona: ParlorPersona
        if let id = personaID {
            _ = try await store.defaultPersona(account)
            guard let selected = try await store.personas(account).first(where: { $0.id == id }) else { throw AIError.invalid }
            persona = selected
        } else { persona = try await store.defaultPersona(account) }
        try await store.requireConversationPersona(conversation, persona: persona.id, account: account)
        // Delivery retries are never model retries. The UI keeps a stable request ID until acknowledged.
        if !retry, let previous = try await store.requestMessage(requestID, conversation: conversation, account: account),
           let record = try await store.contextRecord(previous.id, conversation: conversation, account: account) {
            let originalUser: AIMessage?
            if let id = previous.replyToMessageId { originalUser = try await store.contextRecord(id, conversation: conversation, account: account)?.message }
            else { originalUser = try await store.messagePage(conversation, account: account, before: record.ordinal, limit: 1).records.last?.message }
            guard originalUser?.role == "user", originalUser?.content == content, previous.providerId == providerID, previous.model?.id == modelID, previous.personaId == persona.id else { throw AIError.invalid }
            return ["requestId": requestID, "messageId": previous.id]
        }
        guard let provider = try await store.providers(account).first(where: { $0.id == providerID && $0.enabled }),
              let model = provider.models.first(where: { $0.id == modelID }) else { throw AIError.invalid }
        if !retry, let choice = try await store.conversationModels(conversation, account: account).first(where: { $0.personaId == persona.id }) {
            guard choice.providerId == providerID && choice.modelId == modelID else { throw AIError.invalid }
        }
        let isSubscription = providerID == Self.subscriptionID
        let key: String
        if isSubscription { key = "" }
        else { guard let stored = try secrets.read(account: account, provider: providerID) else { throw AIError.missingKey }; key = stored }
        guard isSubscription || !content.contains(key) else { throw AIError.invalid }
        let timestamp = aiTimestamp()
        let user = prompt?.message ?? AIMessage(id: UUID().uuidString, conversationId: conversation, role: "user", content: content, status: "done", createdAt: timestamp)
        let sharedEcho = await echoClient.recall(account: account, text: content)
        guard generation == epoch && !Task.isCancelled else { throw CancellationError() }
        let member = AIGroupMember(persona: persona, provider: provider, model: model)
        var assistant = AIMessage(id: original?.id ?? UUID().uuidString, conversationId: conversation, role: "assistant", content: "", status: "streaming", createdAt: original?.createdAt ?? timestamp,
                                  requestId: requestID, providerId: providerID, providerName: provider.name, model: model,
                                  currency: provider.currency, priceUpdatedAt: model.priceUpdatedAt ?? provider.priceUpdatedAt, usage: AIUsage(), requestCount: 1,
                                  personaId: persona.id, personaName: persona.name)
        assistant.personaAvatar = persona.avatarDataURL
        assistant.replyToMessageId = user.id
        if let original { assistant.seq = original.seq + 1; assistant.ordinal = original.ordinal }
        let plan: AIContextPlan
        do {
            if let original, let prompt {
                current = (account, assistant)
                let saved = try await store.beginRetry(assistant, original: original, prompt: prompt, member: member, account: account, echo: sharedEcho)
                assistant = saved.0; plan = saved.1
            } else {
                plan = try await store.makeContextPlan(account: account, conversation: conversation, group: false, members: [member], tail: content, currentMessageId: user.id, instruction: nil, query: content, echo: sharedEcho)
                guard generation == epoch && !Task.isCancelled else { throw CancellationError() }
                assistant = assistant.withContext(plan, persona: persona.id)
                current = (account, assistant)
                try await store.begin(user: user, assistant: assistant, account: account, contextPlan: plan)
            }
            current = (account, assistant)
        }
        catch { current = nil; task = nil; throw error }
        let context = plan.inputs[persona.id] ?? plan.publicMessages
        if generation != epoch {
            current?.message.requestCount = 0
            do { try await finish(status: terminalStatus ?? "interrupted", error: nil) }
            catch { task = nil; current = nil; throw error }
            task = nil; current = nil
            throw CancellationError()
        }
        terminalStatus = nil
        if retry { publish(assistant, account: account) }
        let english = parameters["english"] as? Bool == true
        task = Task { [weak self] in
            guard let self else { return }
            do {
                try Task.checkCancellation()
                let prepared: OrbitReply
                if useOrbit {
                    prepared = try await self.prepareOrbitReply(provider: provider, model: model, persona: persona,
                                                                context: context, content: content, account: account, english: english, confirm: confirm)
                } else {
                    prepared = OrbitReply(context: context)
                }
                if let receipt = prepared.receipt {
                    try await self.receive(.init(delta: receipt, usage: prepared.plannerUsage, done: true), account: account, requestID: requestID)
                } else {
                    if useOrbit {
                        self.current?.message.requestCount += 1
                        try await self.receive(.init(), account: account, requestID: requestID)
                    }
                    try await self.perform(provider: provider, model: model, persona: persona, context: prepared.context, account: account) { [weak self] part in
                        guard let self else { throw CancellationError() }
                        var reported = part
                        if useOrbit, let usage = part.usage { reported.usage = Self.combinedOrbitUsage(prepared.plannerUsage, usage) }
                        try await self.receive(reported, account: account, requestID: requestID)
                    }
                }
                try Task.checkCancellation()
                guard !(self.current?.message.content.isEmpty ?? true) else { throw AIError.stream }
                try await self.finish(status: "done", error: nil)
            } catch {
                let cancelled = Task.isCancelled || (error as? URLError)?.code == .cancelled
                let status = (error as? AIError) == .outputBudget ? "done" : cancelled ? (self.terminalStatus ?? "cancelled") : "failed"
                let message = cancelled ? nil : ((error as? SIWCFailure)?.errorDescription ?? NativeDiagnostics.summary(error))
                do { try await self.finish(status: status, error: message) }
                catch {
                    // Preserve the last durable draft. Reopening the store will recover it as interrupted.
                    if var value = self.current?.message { value.status = "interrupted"; value.error = "AI storage failed; the last saved partial response is preserved."; value.seq += 1; self.publish(value, account: account) }
                }
            }
            self.task = nil; self.current = nil; self.terminalStatus = nil
            if self.epoch == generation && self.emitAccount == account { self.memoryProcessor.schedule(account: account, conversation: conversation) }
        }
        return ["requestId": requestID, "messageId": assistant.id]
    }

    private func receive(_ part: AIStreamPart, account: String, requestID: String) async throws {
        try Task.checkCancellation()
        guard var value = current?.message, current?.account == account, value.requestId == requestID else { throw CancellationError() }
        guard value.content.utf8.count + part.delta.utf8.count <= 2 * 1024 * 1024 else { throw AIError.tooLarge }
        let limited = AIContext.limitedDelta(current: value.content, delta: part.delta, tokens: value.contextBudget?.outputTokens ?? Int.max)
        value.content += limited.0
        if limited.1 { value.contextCoverage?.notices.append("output_budget_reached") }
        if let usage = part.usage { value.usage = usage; value.cost = value.model.flatMap { usage.cost(model: $0) } }
        value.seq += 1
        try await store.update(value, account: account) // Durable before visible; no full-answer buffering.
        current?.message = value
        publish(value, account: account)
        if limited.1 { throw AIError.outputBudget }
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
                         dispatch: (() async throws -> Void)? = nil, instructions: String? = nil, receive: @escaping (AIStreamPart) async throws -> Void) async throws {
        try Task.checkCancellation()
        let prompt = instructions ?? persona.runtimePrompt
        guard try JSONSerialization.data(withJSONObject: [["role": "system", "content": prompt]] + context).count <= AIContext.hardBytes - 1024 else { throw AIError.contextCapacity }
        // Frozen replies keep their model, but cannot bypass a disabled/restored Provider
        // or send a newly configured credential to an old endpoint.
        guard let configured = try await store.providers(account).first(where: { $0.id == provider.id && $0.enabled }),
              configured.baseURL == provider.baseURL, configured.models.contains(where: { $0.id == model.id }) else { throw AIError.invalid }
        try Task.checkCancellation()
        if provider.id == Self.subscriptionID {
            try await subscription(account).infer(model: model.id, input: context, instructions: prompt, dispatch: dispatch) { event in
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
            "stream_options": ["include_usage": true], "messages": [["role": "system", "content": prompt]] + context])
        try await dispatch?()
        try Task.checkCancellation()
        try await stream(request, receive)
    }

    private func setConversationModel(account: String, parameters: [String: Any]) async throws -> Any {
        guard !modelSwitching && !preparing && !groupPreparing && !configuring && !discussionControlling && catalogTask == nil && subscriptionTask == nil else { throw AIError.busy }
        modelSwitching = true; defer { modelSwitching = false }
        let generation = epoch
        guard let conversation = parameters["conversationId"] as? String, UUID(uuidString: conversation) != nil,
              let personaID = parameters["personaId"] as? String,
              let providerID = parameters["providerId"] as? String, let modelID = parameters["modelId"] as? String else { throw AIError.invalid }
        guard current == nil || current?.account == account && current?.message.conversationId == conversation,
              !groupJobs.values.contains(where: { $0.account != account || $0.message.conversationId != conversation }),
              discussionTask == nil || discussionRun?.account == account && discussionRun?.state.conversationId == conversation else { throw AIError.busy }
        let group = try await store.groups(account).first(where: { $0.id == conversation })
        _ = try await store.defaultPersona(account)
        let candidates = try await store.personas(account)
        guard let persona = (group?.participants ?? candidates).first(where: { $0.id == personaID }),
              let provider = try await store.providers(account).first(where: { $0.id == providerID && $0.enabled }),
              let model = provider.models.first(where: { $0.id == modelID }) else { throw AIError.invalid }
        if providerID == Self.subscriptionID {
            guard try subscription(account).connection().enabled else { throw AIError.missingKey }
        } else { guard try secrets.read(account: account, provider: providerID) != nil else { throw AIError.missingKey } }
        guard generation == epoch && !Task.isCancelled else { throw CancellationError() }
        if discussionTask != nil {
            try await haltDiscussion(status: discussionRun?.state.status == "summarizing" ? "ended" : "paused")
        }
        if let pending = task {
            terminalStatus = "cancelled"; pending.cancel(); await pending.value
        }
        // Parallel peers retain their frozen round; only the selected persona is stopped.
        let children = groupJobs.values.filter { $0.account == account && $0.message.conversationId == conversation && $0.message.personaId == personaID }
        for child in children { groupJobs[child.message.id]?.terminal = "cancelled"; child.task?.cancel() }
        for child in children { await child.task?.value }
        guard generation == epoch && !Task.isCancelled else { throw CancellationError() }
        let value = AIConversationModel(conversationId: conversation, personaId: personaID, providerId: providerID, modelId: modelID, provider: provider, model: model)
        try await store.saveConversationModel(value, title: group?.title ?? persona.name, account: account)
        guard generation == epoch && !Task.isCancelled else { throw CancellationError() }
        if emitAccount == account { emit?(["accountId": account, "eventType": "configuration"]) }
        return ["saved": true]
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
        guard (!modelSwitching || discussion != nil) && !preparing && !configuring && task == nil && !groupPreparing && subscriptionTask == nil && catalogTask == nil else { throw AIError.busy }
        guard let conversation = parameters["conversationId"] as? String, UUID(uuidString: conversation) != nil,
              let requestID = parameters["requestId"] as? String, UUID(uuidString: requestID) != nil else { throw AIError.invalid }
        groupPreparing = true; groupPreparingScope = (account, conversation)
        defer { groupPreparing = false; groupPreparingScope = nil }
        let generation = epoch
        let groups = try await store.groups(account)
        guard let group = groups.first(where: { $0.id == conversation }) else { throw AIError.invalid }
        let snapshot: AIGroupRound
        let contextPlan: AIContextPlan
        let newUserID = !regenerate && (discussion == nil || discussion?.roundsStarted == 1) && summaryPersona == nil ? UUID().uuidString : nil
        let members: [AIGroupMember]
        var supersedes: String?
        if regenerate {
            guard let messageID = parameters["messageId"] as? String,
                  let original = try await store.contextRecord(messageID, conversation: conversation, account: account)?.message, original.role == "assistant",
                  let roundID = original.roundId, let personaID = original.personaId,
                  let round = try await store.round(roundID, account: account), round.conversationId == conversation,
                  let member = round.members.first(where: { $0.persona.id == personaID }) else { throw AIError.invalid }
            // Request IDs are idempotency keys, never inference retry instructions.
            if let previous = try await store.requestMessage(requestID, conversation: conversation, account: account) {
                guard previous.supersedesId == messageID else { throw AIError.invalid }
                return ["messageIds": [previous.id]]
            }
            guard groupJobs.count < 8,
                  !groupJobs.values.contains(where: { $0.account != account || $0.message.conversationId != conversation }),
                  !groupJobs.values.contains(where: { $0.account == account && $0.message.conversationId == conversation && $0.message.personaId == personaID }),
                  !(try await store.isReplaced(messageID, conversation: conversation, account: account)) else { throw AIError.busy }
            snapshot = round; members = [member]; supersedes = messageID
            contextPlan = try await store.replayContext(account: account, round: round, original: original, member: member)
        } else {
            guard let content = parameters["content"] as? String, !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, content.count <= 20000 else { throw AIError.invalid }
            if let previous = try await store.round(requestID, account: account) {
                guard previous.conversationId == conversation && previous.content == content else { throw AIError.invalid }
                return ["messageIds": try await store.roundReplies(requestID, conversation: conversation, account: account).map(\.id)]
            }
            guard groupJobs.isEmpty else { throw AIError.busy }
            let providers = try await store.providers(account)
            let rootMembers: [AIGroupMember]?
            if let discussion, summaryPersona == nil { rootMembers = try await store.round(discussion.id, account: account)?.members } else { rootMembers = nil }
            let originalMembers = try rootMembers ?? group.bindings ?? group.participants.map { persona in
                guard let provider = providers.first(where: { $0.id == persona.providerId }),
                      let model = provider.models.first(where: { $0.id == persona.modelId }) else { throw AIError.invalid }
                return AIGroupMember(persona: persona, provider: provider, model: model)
            }
            let choices = try await store.conversationModels(conversation, account: account)
            let boundMembers = try originalMembers.map { member -> AIGroupMember in
                guard let choice = choices.first(where: { $0.personaId == member.persona.id }) else { return member }
                guard let provider = providers.first(where: { $0.id == choice.providerId }) ?? choice.provider,
                      let model = provider.models.first(where: { $0.id == choice.modelId }) ?? choice.model else { throw AIError.invalid }
                return AIGroupMember(persona: member.persona, provider: provider, model: model)
            }
            members = boundMembers.filter { member in
                if let summaryPersona { return member.persona.id == summaryPersona }
                return !(discussion?.suspendedPersonaIds.contains(member.persona.id) ?? false)
            }
            guard !members.isEmpty else { throw AIError.invalid }
            let instruction: String?
            if let discussion, discussion.roundsStarted > 1 || summaryPersona != nil {
                instruction = summaryPersona != nil
                    ? "请以你的人格整理当前讨论：共识、分歧、未决事项与可执行结论。保留异议，标明不完整回答，不虚构一致意见。"
                    : "讨论第\(discussion.roundsStarted)/\(discussion.maxRounds)轮。请阅读其他人格的发言，点名回应其具体观点，提出补充、质疑或反驳，纠正自己的观点，避免重复已有内容。用户的新指引优先。保持用户提问所用的语言，轮次指令的语言不决定回答语言。"
            } else { instruction = nil }
            let latestUser: AIMessage?
            if instruction != nil { latestUser = try await store.lastUserMessage(conversation, account: account) } else { latestUser = nil }
            let query = latestUser?.content ?? content
            let tail = instruction.map { AIContext.discussionTail(user: query, instruction: $0) } ?? content
            let sharedEcho = await echoClient.recall(account: account, text: query, discussion: discussion?.id)
            contextPlan = try await store.makeContextPlan(account: account, conversation: conversation, group: true, members: members, tail: tail, currentMessageId: instruction == nil ? newUserID : latestUser?.id, instruction: instruction, query: query, echo: sharedEcho)
            snapshot = AIGroupRound(id: requestID, conversationId: conversation, content: content, context: contextPlan.publicMessages, members: members, discussionId: discussion?.id, discussionRound: summaryPersona == nil ? discussion?.roundsStarted : nil, purpose: summaryPersona != nil ? "summary" : discussion != nil ? "discussion" : nil, publicContextId: contextPlan.shared.id)
        }
        guard generation == epoch else { throw CancellationError() }
        let timestamp = aiTimestamp()
        let messages = members.map { member -> AIMessage in
            var message = AIMessage(id: UUID().uuidString, conversationId: conversation, role: "assistant", content: "", status: "streaming", createdAt: timestamp,
                requestId: regenerate ? requestID : UUID().uuidString, providerId: member.provider.id, providerName: member.provider.name, model: member.model,
                currency: member.provider.currency, priceUpdatedAt: member.model.priceUpdatedAt ?? member.provider.priceUpdatedAt, usage: AIUsage(), requestCount: 0,
                personaId: member.persona.id, personaName: member.persona.name)
            message.contextSnapshotId = contextPlan.generations[member.persona.id]?.id
            message.contextBudget = contextPlan.generations[member.persona.id]?.budget
            message.contextCoverage = contextPlan.generations[member.persona.id]?.coverage
            message.discussionId = snapshot.discussionId; message.discussionRound = snapshot.discussionRound; message.purpose = snapshot.purpose
            message.roundId = snapshot.id; message.supersedesId = supersedes; message.personaAvatar = member.persona.avatarDataURL
            return message
        }
        var user: AIMessage?
        if !regenerate && (discussion == nil || discussion?.roundsStarted == 1) && summaryPersona == nil {
            user = AIMessage(id: newUserID!, conversationId: conversation, role: "user", content: snapshot.content, status: "done", createdAt: timestamp)
            user?.roundId = snapshot.id
        }
        try await store.beginRound(snapshot, user: user, assistants: messages, account: account, saveSnapshot: !regenerate, discussion: discussion, contextPlan: contextPlan)
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
                await self.runGroupMember(member, round: snapshot, context: contextPlan.inputs[member.persona.id] ?? contextPlan.publicMessages, account: account, messageID: message.id)
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
        guard !modelSwitching && discussionTask == nil && !discussionControlling && !groupPreparing && groupJobs.isEmpty else { throw AIError.busy }
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
            if let run = self.discussionRun, run.account == account, self.emitAccount == account { self.memoryProcessor.schedule(account: account, conversation: run.state.conversationId, ended: run.state.status == "completed" || run.state.status == "ended") }
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
        discussionControlling = true; defer {
            discussionControlling = false
            if memoryIdle && emitAccount == account { memoryProcessor.schedule(account: account, conversation: conversation, ended: discussionRun?.state.status == "ended") }
        }
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
        if let old = try await store.requestMessage(requestID, conversation: conversation, account: account) {
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
            guard let root = try await store.round(run.state.id, account: account) else { throw AIError.invalid }
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
            if self.emitAccount == account { self.memoryProcessor.schedule(account: account, conversation: conversation, ended: self.discussionRun?.state.status == "ended") }
        }
        return result
    }

    private func runGroupMember(_ member: AIGroupMember, round: AIGroupRound, context: [[String: String]], account: String, messageID: String) async {
        do {
            try Task.checkCancellation()
            guard let currentProvider = try await store.providers(account).first(where: { $0.id == member.provider.id }), currentProvider.enabled else { throw AIError.invalid }
            guard currentProvider.baseURL == member.provider.baseURL, currentProvider.models.contains(where: { $0.id == member.model.id }) else { throw AIError.endpointChanged }
            try Task.checkCancellation()
            groupJobs[messageID]?.message.requestCount = 1
            try await perform(provider: member.provider, model: member.model, persona: member.persona, context: context, account: account) { [weak self] part in
                guard let self else { throw CancellationError() }
                try await self.receiveGroup(part, id: messageID)
            }
            try Task.checkCancellation()
            guard !(groupJobs[messageID]?.message.content.isEmpty ?? true) else { throw AIError.stream }
            try await finishGroup(id: messageID, status: "done", error: nil)
        } catch {
            let cancelled = Task.isCancelled || (error as? URLError)?.code == .cancelled
            let status = (error as? AIError) == .outputBudget ? "done" : cancelled ? (groupJobs[messageID]?.terminal ?? "cancelled") : "failed"
            let text = cancelled ? nil : ((error as? SIWCFailure)?.errorDescription ?? NativeDiagnostics.summary(error))
            do { try await finishGroup(id: messageID, status: status, error: text) }
            catch { if var job = groupJobs[messageID] { job.message.status = "interrupted"; job.message.seq += 1; publish(job.message, account: account) } }
        }
        if let job = groupJobs[messageID], job.message.status != "done", job.message.purpose == "discussion" {
            suspendDiscussionPersona(member.persona.id)
        }
        groupJobs.removeValue(forKey: messageID)
        if memoryIdle && emitAccount == account { memoryProcessor.schedule(account: account, conversation: round.conversationId) }
    }
    private func receiveGroup(_ part: AIStreamPart, id: String) async throws {
        try Task.checkCancellation()
        guard let job = groupJobs[id] else { throw CancellationError() }
        var value = job.message
        guard value.content.utf8.count + part.delta.utf8.count <= 2 * 1024 * 1024 else { throw AIError.tooLarge }
        let limited = AIContext.limitedDelta(current: value.content, delta: part.delta, tokens: value.contextBudget?.outputTokens ?? Int.max)
        value.content += limited.0
        if limited.1 { value.contextCoverage?.notices.append("output_budget_reached") }
        if let usage = part.usage { value.usage = usage; value.cost = value.model.flatMap { usage.cost(model: $0) } }
        value.seq += 1
        try await store.update(value, account: job.account)
        groupJobs[id]?.message = value
        publish(value, account: job.account)
        if limited.1 { throw AIError.outputBudget }
    }
    private func finishGroup(id: String, status: String, error: String?) async throws {
        guard let job = groupJobs[id] else { return }
        var value = job.message; value.status = status; value.error = error; value.seq += 1
        try await store.update(value, account: job.account)
        groupJobs[id]?.message = value
        publish(value, account: job.account)
    }

}
