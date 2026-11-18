import Foundation

@MainActor
final class AIMemoryProcessor {
    typealias Transport = (AIMemoryJob, [[String: String]], @escaping () async throws -> Void, @escaping (AIStreamPart) async throws -> Void) async throws -> Void
    let store: AIStore
    let transport: Transport
    let idle: () -> Bool
    let changed: (String) -> Void
    private var task: Task<Void, Never>?
    private var active: (account: String, persona: String)?
    func cancel(account: String, persona: String) async throws {
        guard active?.account == account && active?.persona == persona else { throw AIError.busy }
        await yield(cancelled: true)
    }
    private var terminal = "interrupted"

    init(store: AIStore, transport: @escaping Transport, idle: @escaping () -> Bool, changed: @escaping (String) -> Void) {
        self.store = store; self.transport = transport; self.idle = idle; self.changed = changed
    }
    func cancel() { stop(status: "interrupted") }
    func yield(cancelled: Bool = false) async {
        let old = task
        stop(status: cancelled ? "cancelled" : "interrupted")
        await old?.value
    }
    private func stop(status: String) {
        guard let task, !task.isCancelled else { return }
        terminal = status
        task.cancel()
    }
    func request(account: String, persona: String, conversation: String) async throws -> String? {
        try await start(account: account, persona: persona) {
            try await self.store.prepareProcessing(account: account, persona: persona, conversation: conversation, trigger: "manual")
        }
    }
    func retry(account: String, persona: String, id: String) async throws {
        _ = try await start(account: account, persona: persona) {
            let job = try await self.store.processingJob(id, persona: persona, account: account)
            guard ["failed", "interrupted", "cancelled"].contains(job.status) else { throw AIError.invalid }
            _ = try await self.store.processingRecords(job)
            _ = try await self.store.previousProcessingSummary(job)
            return job
        }
    }
    private func start(account: String, persona: String, prepare: @escaping @MainActor () async throws -> AIMemoryJob?) async throws -> String? {
        guard task == nil && idle() else { throw AIError.busy }
        try Task.checkCancellation()
        return try await withCheckedThrowingContinuation { continuation in
            terminal = "interrupted"
            active = (account, persona)
            // Reserve the same task that prepares, executes and settles the job.
            task = Task {
                defer { active = nil; task = nil }
                do {
                    try Task.checkCancellation()
                    let job = try await prepare()
                    continuation.resume(returning: job?.id)
                    if let job { await execute(job) }
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }
    func schedule(account: String, conversation: String, ended: Bool = false) {
        guard task == nil && idle() else { return }
        terminal = "interrupted"
        task = Task { [weak self] in
            guard let self else { return }
            // One bounded batch per enabled persona. Never drain a long archive into paid requests.
            let people = (try? await store.personas(account)) ?? []
            for person in people {
                if Task.isCancelled || !idle() { break }
                active = (account, person.id)
                defer { active = nil }
                do {
                    if let job = try await store.prepareProcessing(account: account, persona: person.id, conversation: conversation, trigger: ended ? "end" : "threshold") {
                        await execute(job)
                    }
                } catch { /* An optional automatic processor never breaks chatting. */ }
            }
            task = nil
        }
    }
    private func execute(_ original: AIMemoryJob) async {
        active = (original.accountId, original.personaId)
        defer { active = nil }
        var text = "", completed = false
        do {
            try Task.checkCancellation(); guard idle() else { throw CancellationError() }
            let rows = try await store.processingRecords(original), previous = try await store.previousProcessingSummary(original)
            let input = AIMemoryProcessing.input(job: original, records: rows, previous: previous)
            let expected = AIMemoryProcessing.inputHash(job: original, input: input)
            guard expected == original.inputHash else { throw AIError.invalidContext }
            let budget = try AIContext.budget(original.model, persona: AIMemoryProcessing.workerPersona, tail: "")
            guard AIContext.tokens(input) + budget.systemTokens <= budget.inputLimit else { throw AIError.contextCapacity }
            var job = try await store.processingJob(original.id, persona: original.personaId, account: original.accountId)
            try Task.checkCancellation()
            guard !["completed", "stale"].contains(job.status) else { throw AIError.invalidContext }
            if let cached = job.result {
                job.status = "running"; job.error = nil; try await store.writeJob(job)
                _ = try await store.completeProcessing(job, result: cached); changed(job.accountId); return
            }
            job.status = "running"; job.error = nil; job.attempts.append(.init(startedAt: aiTimestamp())); job.updatedAt = aiTimestamp()
            try await store.writeJob(job); changed(job.accountId)
            try await transport(job, input, { [self] in
                try Task.checkCancellation(); guard idle() else { throw CancellationError() }
                var current = try await store.processingJob(job.id, persona: job.personaId, account: job.accountId)
                guard current.status == "running", !current.attempts.isEmpty else { throw AIError.invalidContext }
                current.attempts[current.attempts.count - 1].dispatched = true
                current.attempts[current.attempts.count - 1].status = "running"
                try await store.writeJob(current)
                try Task.checkCancellation()
            }, { [self] part in
                try Task.checkCancellation()
                if let usage = part.usage {
                    var current = try await store.processingJob(job.id, persona: job.personaId, account: job.accountId)
                    guard current.status == "running", !current.attempts.isEmpty else { throw AIError.invalidContext }
                    current.attempts[current.attempts.count - 1].usage = usage
                    current.attempts[current.attempts.count - 1].cost = current.providerKind == "api" ? usage.cost(model: current.model) : nil
                    try await store.writeJob(current)
                }
                let limited = AIContext.limitedDelta(current: text, delta: part.delta, tokens: budget.outputTokens)
                guard !limited.1, text.utf8.count + part.delta.utf8.count <= 64 * 1024 else { throw AIError.outputBudget }
                text += part.delta; completed = completed || part.done
            })
            try Task.checkCancellation(); guard completed else { throw AIError.truncated }
            let result = try JSONDecoder().decode(AIMemoryProcessingResult.self, from: Data(text.utf8))
            try await store.cacheProcessingResult(job, result: result)
            try Task.checkCancellation()
            _ = try await store.completeProcessing(job, result: result)
        } catch {
            if var current = try? await store.processingJob(original.id, persona: original.personaId, account: original.accountId), current.status != "completed" {
                if current.status != "stale" { current.status = Task.isCancelled ? terminal : "failed" }
                current.error = Task.isCancelled ? "Processing yielded or cancelled. Retry is manual; previous usage may still be billed." : ((error as? AIError)?.localizedDescription ?? (error as? SIWCFailure)?.errorDescription ?? "The memory model returned invalid structured data. Review the job before retrying; no automatic retry.")
                current.updatedAt = aiTimestamp()
                if !current.attempts.isEmpty {
                    current.attempts[current.attempts.count - 1].status = current.status
                    current.attempts[current.attempts.count - 1].finishedAt = current.attempts.last?.finishedAt ?? aiTimestamp()
                }
                try? await store.writeJob(current)
            }
        }
        changed(original.accountId)
    }
}
