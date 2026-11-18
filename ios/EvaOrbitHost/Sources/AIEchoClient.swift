import Foundation

@MainActor
final class AIEchoClient {
    typealias Transport = (String, String, String, String?) async throws -> [String: Any]
    let store: AIStore
    let transport: Transport
    private struct Scope: Hashable { let account: String; let writing: Bool }
    private var permissions: [Scope: AIEchoAccess] = [:]
    private var requests: [UUID: (task: Task<[String: Any], Error>, access: AIEchoAccess)] = [:]
    private var submitting = Set<String>()
    init(store: AIStore, transport: @escaping Transport) { self.store = store; self.transport = transport }
    private func access(account: String, writing: Bool) -> AIEchoAccess {
        let scope = Scope(account: account, writing: writing)
        if let existing = permissions[scope] { return existing }
        let value = AIEchoAccess(account: account, writing: writing)
        permissions[scope] = value
        return value
    }
    private func revoke(_ matches: (Scope) -> Bool) {
        for scope in permissions.keys.filter(matches) {
            permissions.removeValue(forKey: scope)?.revoke()
        }
        for request in requests.values where matches(Scope(account: request.access.account, writing: request.access.writing)) {
            request.task.cancel()
        }
    }
    func cancel() { revoke { _ in true } }
    func configure(account: String, read: Bool, write: Bool) async throws {
        revoke { $0.account == account && ($0.writing ? !write : !read) }
        try await store.configureEcho(account, read: read, write: write)
    }
    func clear(account: String) async throws {
        revoke { $0.account == account && !$0.writing }
        try await store.configureEcho(account)
    }
    private func request(_ access: AIEchoAccess, path: String, method: String = "GET", body: String? = nil) async throws -> [String: Any] {
        try await store.countEchoAttempt(access)
        try access.check()
        let id = UUID(), transport = self.transport
        let operation = Task {
            try access.check()
            return try await transport(access.account, path, method, body)
        }
        requests[id] = (operation, access)
        defer { requests.removeValue(forKey: id) }
        let response = try await withTaskCancellationHandler {
            try await operation.value
        } onCancel: {
            operation.cancel()
        }
        try access.check()
        guard let status = response["status"] as? Int, (200..<300).contains(status), let object = response["body"] as? [String: Any] else { throw AIError.invalidContext }
        return object
    }
    private func protocolCheck(_ access: AIEchoAccess) async throws {
        let body = try await request(access, path: "/api/memory-graph?resource=parlor_protocol")
        guard body["protocol"] as? String == AIEcho.protocolName, body["fullContext"] as? Bool == true, body["candidateLookup"] as? Bool == true else { throw AIError.invalidContext }
        try await store.markEchoConnected(access)
        try access.check()
    }
    func recall(account: String, text: String, discussion: String? = nil) async -> AIEchoSnapshot? {
        let access = access(account: account, writing: false)
        let query = AIEcho.keywords(text)
        guard !query.isEmpty else { return nil }
        do {
            if let cached = try await store.recallEchoCache(access, query: query, text: text, discussion: discussion) {
                try access.check()
                return cached
            }
            var components = URLComponents(); components.queryItems = [URLQueryItem(name: "context", value: "1"), URLQueryItem(name: "q", value: query), URLQueryItem(name: "limit", value: "4"), URLQueryItem(name: "max_chars", value: "4000")]
            let body = try await request(access, path: "/api/memory-graph?" + (components.percentEncodedQuery ?? ""))
            let snapshot = try AIEcho.snapshot(account: account, query: query, envelope: body)
            try await store.recordEchoRecall(snapshot, discussion: discussion, access: access)
            try access.check()
            return snapshot
        } catch {
            guard !(error is CancellationError), (error as? URLError)?.code != .cancelled else { return nil }
            let diagnostic = NativeDiagnostics.describe(error)
            let status = diagnostic.code == "network_timeout" ? "timeout" : "unavailable_or_unsupported"
            let now = aiTimestamp()
            let failure = AIEchoSnapshot(id: UUID().uuidString, accountId: account, query: query, fetchedAt: now, expiresAt: now, status: status, complete: false, truncated: false, hash: "", error: "Echo is unavailable or its complete protocol is unsupported; local context continues.")
            do {
                try await store.recordEchoRecall(failure, discussion: discussion, access: access)
                try access.check()
                return failure
            } catch { return nil }
        }
    }
    func entities(account: String, query: String, cursor: String?) async throws -> [String: Any] {
        let access = access(account: account, writing: true)
        try await protocolCheck(access)
        var components = URLComponents(); components.queryItems = [URLQueryItem(name: "resource", value: "entity"), URLQueryItem(name: "status", value: "active"), URLQueryItem(name: "limit", value: "20"), URLQueryItem(name: "q", value: String(AIEcho.keywords(query).prefix(80)))]
        if let cursor { guard cursor.count <= 1000 else { throw AIError.invalid }; components.queryItems?.append(URLQueryItem(name: "cursor", value: cursor)) }
        return try await request(access, path: "/api/memory-graph?" + (components.percentEncodedQuery ?? ""))
    }
    private func lookup(_ share: AIEchoShare, access: AIEchoAccess) async throws -> [String: Any]? {
        let result = try await request(access, path: "/api/memory-graph?resource=candidate&request_id=" + share.requestId)
        guard result["protocol"] as? String == AIEcho.protocolName, result.keys.contains("candidate") else { throw AIError.invalidContext }
        if result["candidate"] is NSNull { return nil }
        guard let candidate = result["candidate"] as? [String: Any] else { throw AIError.invalidContext }
        return candidate
    }
    private func record(_ candidate: [String: Any], share: inout AIEchoShare) throws {
        guard candidate["requestId"] as? String == share.requestId, candidate["client"] as? String == "parlor", candidate["reviewMode"] as? String == "manual", let id = candidate["id"] as? String, UUID(uuidString: id) != nil,
              let status = candidate["status"] as? String, ["pending", "promoted", "rejected"].contains(status) else { throw AIError.invalidContext }
        if let json = share.payloadJSON, let body = try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any], let submission = body["submission"] as? [String: Any] {
            guard let fact = candidate["proposedFact"], let sources = candidate["proposedSources"], try AIEcho.json(fact) == AIEcho.json(submission["fact"]!), try AIEcho.json(sources) == AIEcho.json(submission["sources"]!) else { throw AIError.invalidContext }
        }
        if status == "promoted" { guard let promoted = candidate["promotedFactId"] as? String, UUID(uuidString: promoted) != nil else { throw AIError.invalidContext } }
        share.candidateId = id; share.candidateStatus = status; share.promotedFactId = candidate["promotedFactId"] as? String
        share.status = "submitted"; share.updatedAt = aiTimestamp()
    }
    func share(account: String, persona: String, id: String, confirmed: Bool, checkOnly: Bool) async throws -> AIEchoShare {
        guard !submitting.contains(id) else { throw AIError.busy }; submitting.insert(id); defer { submitting.remove(id) }
        let read = access(account: account, writing: false), write = access(account: account, writing: true)
        var share = try await store.echoShare(id, persona: persona, account: account)
        if !checkOnly { guard confirmed else { throw AIError.invalid }; try await store.verifyEchoShare(share) }
        let config = try await store.echoConfig(account), access = !checkOnly || config.writeEnabled ? write : read
        try await protocolCheck(access)
        if let found = try await lookup(share, access: access) { try record(found, share: &share); try await store.writeEchoShare(share, access: access); return try await store.echoShare(id, persona: persona, account: account) }
        if checkOnly { share.status = "not_found"; try await store.writeEchoShare(share, access: access); return share }
        guard let json = share.payloadJSON else { throw AIError.invalidContext }
        try await store.verifyEchoShare(share)
        share.status = "submitting"; share.updatedAt = aiTimestamp(); try await store.writeEchoShare(share, access: access)
        do {
            let response = try await request(access, path: "/api/memory-graph", method: "POST", body: json)
            guard response["protocol"] as? String == AIEcho.protocolName, let candidate = response["candidate"] as? [String: Any] else { throw AIError.invalidContext }
            try record(candidate, share: &share); try await store.writeEchoShare(share, access: access); return try await store.echoShare(id, persona: persona, account: account)
        } catch {
            try? await store.markEchoShareUnknown(share)
            throw error // Never automatically retry a write; the same frozen requestId is retained.
        }
    }
}
