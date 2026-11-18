import Foundation
import CryptoKit
import SQLite3

struct AIBackupPayload: Codable {
    var accountId: String
    var exportedAt: String
    var providers: [AIProvider]
    var personas: [ParlorPersona]
    var conversations: [AIConversation]
    var messages: [AIMessage]
    var groups: [AIGroup]
    var rounds: [AIGroupRound]
    var discussions: [AIGroupDiscussion]
    var conversationModels: [AIConversationModel]
    var memories: [AIPersonaMemory]
    var contexts: [AIConversationContext]?
    var contextSnapshots: [AIContextSnapshot]?
    var messageOrdinals: [String: Int64]?
    var processingConfigs: [AIMemoryProcessingConfig]?
    var processingJobs: [AIMemoryJob]?
    var processingProposals: [AIMemoryProposal]?
    var echoConfig: AIEchoConfig?
    var echoShares: [AIEchoShare]?
    var echoSnapshots: [AIEchoSnapshot]?
}
struct AIBackupDocument: Codable {
    var format: String = "parlor-native-backup"
    var version: Int = 4
    var schemaVersion: Int = 9
    var checksum: String
    var payload: AIBackupPayload

    static func digest(_ payload: AIBackupPayload) throws -> String {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        return SHA256.hash(data: try encoder.encode(payload)).map { String(format: "%02x", $0) }.joined()
    }
}

extension AIStore {
    static func safetyBackup(database: OpaquePointer, path: String) throws {
        if path.isEmpty || path == ":memory:" { return }
        let directory = URL(fileURLWithPath: path).deletingLastPathComponent().appendingPathComponent("SafetyBackups", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
        let destination = directory.appendingPathComponent(UUID().uuidString + ".sqlite3")
        var handle: OpaquePointer?
        guard sqlite3_open_v2(destination.path, &handle, SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE, nil) == SQLITE_OK, let handle else { throw AIError.storage }
        defer { sqlite3_close(handle) }
        guard let backup = sqlite3_backup_init(handle, "main", database, "main") else { throw AIError.storage }
        let copied = sqlite3_backup_step(backup, -1), finished = sqlite3_backup_finish(backup)
        guard copied == SQLITE_DONE, finished == SQLITE_OK else { throw AIError.storage }
        var check: OpaquePointer?
        guard sqlite3_prepare_v2(handle, "PRAGMA quick_check", -1, &check, nil) == SQLITE_OK else { throw AIError.storage }
        defer { sqlite3_finalize(check) }
        guard sqlite3_step(check) == SQLITE_ROW, let text = sqlite3_column_text(check, 0), String(cString: text) == "ok" else { throw AIError.storage }
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: destination.path)
    }

    func purgeSafetyBackups(account: String, personaID: String? = nil, memoryID: String? = nil, conversationID: String? = nil) throws {
        guard memoryID == nil || personaID != nil else { throw AIError.invalid }
        // Clean App-owned share files too; external copies remain under the user's control.
        for file in try FileManager.default.contentsOfDirectory(at: FileManager.default.temporaryDirectory, includingPropertiesForKeys: [.isSymbolicLinkKey]) {
            let name = file.deletingPathExtension().lastPathComponent
            guard file.pathExtension == "json", name.hasPrefix("parlor-backup-"), UUID(uuidString: String(name.dropFirst(14))) != nil,
                  try file.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink != true else { continue }
            let data = try Data(contentsOf: file)
            guard let document = try? JSONDecoder().decode(AIBackupDocument.self, from: data) else { throw AIError.storage }
            guard document.payload.accountId == account else { continue }
            let containsMemory = memoryID.map { id in document.payload.memories.contains(where: { $0.id == id && $0.personaId == personaID }) } ?? false
            let containsConversation = conversationID.map { id in document.payload.conversations.contains(where: { $0.id == id }) } ?? false
            if containsMemory || containsConversation { try FileManager.default.removeItem(at: file) }
        }
        guard let path = sqlite3_db_filename(database, "main"), !String(cString: path).isEmpty else { return }
        let directory = URL(fileURLWithPath: String(cString: path)).deletingLastPathComponent().appendingPathComponent("SafetyBackups", isDirectory: true)
        guard FileManager.default.fileExists(atPath: directory.path) else { return }
        for file in try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.isSymbolicLinkKey]) {
            guard file.pathExtension == "sqlite3", UUID(uuidString: file.deletingPathExtension().lastPathComponent) != nil,
                  try file.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink != true else { continue }
            var handle: OpaquePointer?
            guard sqlite3_open_v2(file.path, &handle, SQLITE_OPEN_READONLY, nil) == SQLITE_OK, let handle else { if let handle { sqlite3_close(handle) }; throw AIError.storage }
            var query: OpaquePointer?
            let sql = memoryID != nil ? "SELECT 1 FROM ai_persona_memories WHERE account_id=? AND id=? AND persona_id=?" : "SELECT 1 FROM ai_conversations WHERE account_id=? AND id=?"
            let prepared = sqlite3_prepare_v2(handle, sql, -1, &query, nil)
            var contains = false
            var valid = prepared == SQLITE_OK || (memoryID != nil && String(cString: sqlite3_errmsg(handle)) == "no such table: ai_persona_memories")
            if prepared == SQLITE_OK, let query {
                let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
                sqlite3_bind_text(query, 1, account, -1, transient)
                sqlite3_bind_text(query, 2, memoryID ?? conversationID ?? "", -1, transient)
                if let personaID { sqlite3_bind_text(query, 3, personaID, -1, transient) }
                let step = sqlite3_step(query)
                valid = step == SQLITE_ROW || step == SQLITE_DONE
                contains = step == SQLITE_ROW
            }
            sqlite3_finalize(query); sqlite3_close(handle)
            guard valid else { throw AIError.storage }
            // v5 migration backups have no memory table and cannot contain memory bodies.
            if contains { try FileManager.default.removeItem(at: file) }
        }
    }

    func exportBackup(account: String) throws -> AIBackupDocument {
        guard UUID(uuidString: account) != nil else { throw AIError.invalid }
        let rows = try contextRecords("SELECT ordinal,payload,ordinal FROM ai_messages WHERE account_id=? ORDER BY ordinal", [account]).0
        let payload = AIBackupPayload(accountId: account, exportedAt: aiTimestamp(), providers: try providers(account), personas: try personas(account), conversations: try conversations(account, all: true),
            messages: rows.map { row in var message = row.message; message.ordinal = nil; return message }, groups: try groups(account),
            rounds: try documents("SELECT payload FROM ai_rounds WHERE account_id=? ORDER BY rowid", [account], as: AIGroupRound.self), discussions: try discussions(account),
            conversationModels: try documents("SELECT payload FROM ai_conversation_models WHERE account_id=? ORDER BY rowid", [account], as: AIConversationModel.self),
            memories: try documents("SELECT payload FROM ai_persona_memories WHERE account_id=? ORDER BY persona_id,id,version", [account], as: AIPersonaMemory.self),
            contexts: try documents("SELECT payload FROM ai_conversation_contexts WHERE account_id=? ORDER BY conversation_id,scope,version", [account], as: AIConversationContext.self),
            contextSnapshots: try documents("SELECT payload FROM ai_context_snapshots WHERE account_id=? ORDER BY rowid", [account], as: AIContextSnapshot.self),
            messageOrdinals: Dictionary(uniqueKeysWithValues: rows.map { ($0.message.id, $0.ordinal) }),
            processingConfigs: try documents("SELECT payload FROM ai_memory_processing_config WHERE account_id=? ORDER BY persona_id", [account], as: AIMemoryProcessingConfig.self),
            processingJobs: try documents("SELECT payload FROM ai_memory_jobs WHERE account_id=? ORDER BY rowid", [account], as: AIMemoryJob.self),
            processingProposals: try documents("SELECT payload FROM ai_memory_proposals WHERE account_id=? ORDER BY rowid", [account], as: AIMemoryProposal.self),
            echoConfig: try echoConfig(account), echoShares: try documents("SELECT payload FROM ai_echo_shares WHERE account_id=? ORDER BY rowid", [account], as: AIEchoShare.self),
            echoSnapshots: try documents("SELECT payload FROM ai_echo_snapshots WHERE account_id=? ORDER BY rowid", [account], as: AIEchoSnapshot.self).map { var metadata = $0; metadata.contextJSON = nil; return metadata })
        let document = AIBackupDocument(checksum: try AIBackupDocument.digest(payload), payload: payload)
        guard try JSONEncoder().encode(document).count <= 16 * 1024 * 1024 else { throw AIError.backupTooLarge }
        return document
    }

    func validateBackup(_ document: AIBackupDocument, account: String) throws {
        guard try JSONEncoder().encode(document).count <= 16 * 1024 * 1024 else { throw AIError.backupTooLarge }
        let value = document.payload
        guard document.format == "parlor-native-backup", (document.version == 1 && document.schemaVersion == 6 || document.version == 2 && document.schemaVersion == 7 || document.version == 3 && document.schemaVersion == 8 || document.version == 4 && document.schemaVersion == 9),
              value.accountId == account, UUID(uuidString: account) != nil,
              ISO8601DateFormatter().date(from: value.exportedAt) != nil,
              document.checksum == (try AIBackupDocument.digest(value)), value.personas.count <= 50, value.providers.count <= 50 else { throw AIError.invalid }
        func unique(_ ids: [String]) throws { guard Set(ids).count == ids.count else { throw AIError.invalid } }
        try unique(value.personas.map(\.id)); try unique(value.providers.map(\.id)); try unique(value.conversations.map(\.id)); try unique(value.messages.map(\.id)); try unique(value.groups.map(\.id)); try unique(value.rounds.map(\.id)); try unique(value.discussions.map(\.conversationId))
        try unique(value.conversationModels.map { $0.conversationId + ":" + $0.personaId })
        try unique(value.memories.map { $0.personaId + ":" + $0.id + ":" + String($0.version) })
        for persona in value.personas { try persona.validate() }
        for provider in value.providers { try provider.validate() }
        let personas = Set(value.personas.map(\.id)), conversations = Set(value.conversations.map(\.id)), groups = Set(value.groups.map(\.id)), rounds = Set(value.rounds.map(\.id))
        let byConversation = Dictionary(uniqueKeysWithValues: value.conversations.map { ($0.id, $0) })
        let byMessage = Dictionary(uniqueKeysWithValues: value.messages.map { ($0.id, $0) })
        let byGroup = Dictionary(uniqueKeysWithValues: value.groups.map { ($0.id, $0) })
        for conversation in value.conversations {
            guard UUID(uuidString: conversation.id) != nil, conversation.title.count <= 200,
                  ISO8601DateFormatter().date(from: conversation.updatedAt) != nil,
                  ["single", "group", "unresolved"].contains(conversation.ownership ?? ""),
                  (conversation.ownership == "single") == (conversation.personaId != nil),
                  conversation.personaId.map({ personas.contains($0) }) ?? true,
                  (conversation.ownership == "group") == groups.contains(conversation.id) else { throw AIError.invalid }
        }
        for message in value.messages {
            guard UUID(uuidString: message.id) != nil, conversations.contains(message.conversationId), ["user", "assistant"].contains(message.role),
                  ["done", "streaming", "failed", "cancelled", "interrupted"].contains(message.status), message.content.utf8.count <= 2 * 1024 * 1024,
                  message.seq >= 0, (0...1).contains(message.requestCount), ISO8601DateFormatter().date(from: message.createdAt) != nil else { throw AIError.invalid }
            if let round = message.roundId { guard rounds.contains(round), groups.contains(message.conversationId), value.rounds.contains(where: { $0.id == round && $0.conversationId == message.conversationId }) else { throw AIError.invalid } }
            if let predecessor = message.supersedesId { guard let original = byMessage[predecessor], original.conversationId == message.conversationId, original.personaId == message.personaId, original.id != message.id else { throw AIError.invalid } }
        }
        for group in value.groups { try group.validate(); guard conversations.contains(group.id), group.participants.allSatisfy({ personas.contains($0.id) }) else { throw AIError.invalid }; for binding in group.bindings ?? [] { try binding.persona.validate(); try binding.provider.validate() } }
        for round in value.rounds {
            guard UUID(uuidString: round.id) != nil, groups.contains(round.conversationId), (1...8).contains(round.members.count), round.context.count <= 1000,
                  round.context.allSatisfy({ ["user", "assistant"].contains($0["role"] ?? "") && $0["content"] != nil }),
                  round.context.reduce(0, { $0 + ($1["content"] ?? "").utf8.count }) <= 128 * 1024 else { throw AIError.invalid }
            try unique(round.members.map { $0.persona.id })
            for member in round.members { try member.persona.validate(); try member.provider.validate(); guard personas.contains(member.persona.id), member.provider.models.contains(member.model) else { throw AIError.invalid } }
        }
        for discussion in value.discussions {
            guard groups.contains(discussion.conversationId), value.rounds.contains(where: { $0.id == discussion.id && $0.conversationId == discussion.conversationId }),
                  ["running", "paused", "interrupted", "completed", "ended", "summarizing"].contains(discussion.status), (1...5).contains(discussion.maxRounds),
                  (0...discussion.maxRounds).contains(discussion.roundsStarted), discussion.revision >= 0,
                  discussion.suspendedPersonaIds.allSatisfy({ id in byGroup[discussion.conversationId]?.participants.contains(where: { $0.id == id }) == true }) else { throw AIError.invalid }
        }
        for choice in value.conversationModels {
            guard conversations.contains(choice.conversationId), personas.contains(choice.personaId), !choice.modelId.isEmpty,
                  value.providers.contains(where: { $0.id == choice.providerId && $0.models.contains(where: { $0.id == choice.modelId }) }) || choice.provider?.models.contains(where: { $0.id == choice.modelId }) == true else { throw AIError.invalid }
            if let provider = choice.provider { try provider.validate(); guard provider.id == choice.providerId else { throw AIError.invalid } }
        }
        for memory in value.memories {
            try memory.validate()
            guard memory.accountId == account, personas.contains(memory.personaId) else { throw AIError.invalid }
            for source in memory.sources {
                guard let conversation = byConversation[source.conversationId] else { throw AIError.invalid }
                let wholeConversation = conversation.ownership == "single" && conversation.personaId == memory.personaId || byGroup[source.conversationId]?.participants.contains(where: { $0.id == memory.personaId }) == true
                let historicalRounds = Set(value.rounds.filter { $0.conversationId == source.conversationId && $0.members.contains(where: { $0.persona.id == memory.personaId }) }.map(\.id))
                guard value.messages.contains(where: { $0.conversationId == source.conversationId && (source.messageId == nil || $0.id == source.messageId) && $0.content.contains(source.excerpt) && (wholeConversation || $0.roundId.map { historicalRounds.contains($0) } == true) }) else { throw AIError.invalid }
            }
        }
        for chain in Dictionary(grouping: value.memories, by: { $0.personaId + ":" + $0.id }).values {
            let ordered = chain.sorted { $0.version < $1.version }
            guard ordered.map(\.version) == Array(1...ordered.count), ordered.allSatisfy({ $0.createdAt == ordered[0].createdAt }),
                  ordered.allSatisfy({ $0.status == .deleted }) || (ordered.last?.status == .active && ordered.dropLast().allSatisfy({ $0.status == .superseded })) else { throw AIError.invalid }
        }
        try validateContextBackup(document)
        try validateProcessingBackup(document)
        try validateEchoBackup(document)
    }

    func prepareRestoreBackup(_ document: AIBackupDocument, account: String) throws {
        try validateBackup(document, account: account)
        guard let filename = sqlite3_db_filename(database, "main") else { throw AIError.storage }
        try Self.safetyBackup(database: database, path: String(cString: filename))
    }

    func restoreBackup(_ document: AIBackupDocument, account: String, createSafetyBackup: Bool = true) throws {
        try validateBackup(document, account: account)
        if createSafetyBackup { try prepareRestoreBackup(document, account: account) }
        let value = document.payload
        try execute("BEGIN IMMEDIATE")
        do {
            for table in ["ai_echo_shares", "ai_echo_bindings", "ai_echo_snapshots", "ai_echo_config", "ai_memory_proposals", "ai_memory_jobs", "ai_memory_processing_config", "ai_context_snapshots", "ai_conversation_contexts", "ai_persona_memories", "ai_conversation_owners", "ai_conversation_models", "ai_messages", "ai_discussions", "ai_rounds", "ai_groups", "ai_conversations", "ai_personas", "ai_providers"] { try execute("DELETE FROM \(table) WHERE account_id=?", [account]) }
            for var provider in value.providers { provider.enabled = false; try saveProvider(provider, account: account) }
            for persona in value.personas { try savePersona(persona, account: account) }
            for conversation in value.conversations {
                try execute("INSERT INTO ai_conversations(account_id,id,title,updated_at) VALUES(?,?,?,?)", [account, conversation.id, conversation.title, conversation.updatedAt])
                if let persona = conversation.personaId { try execute("INSERT INTO ai_conversation_owners VALUES(?,?,'single',?)", [account, conversation.id, persona]) }
                else { try execute("INSERT INTO ai_conversation_owners VALUES(?,?,?,NULL)", [account, conversation.id, conversation.ownership ?? "unresolved"]) }
            }
            for var message in value.messages {
                if message.status == "streaming" { message.status = "interrupted"; message.seq += 1 }
                try execute("INSERT INTO ai_messages(account_id,id,conversation_id,status,payload) VALUES(?,?,?,?,?)", [account, message.id, message.conversationId, message.status, try encoded(message)])
            }
            for group in value.groups { try execute("INSERT INTO ai_groups VALUES(?,?,?)", [account, group.id, try encoded(group)]) }
            for round in value.rounds { try execute("INSERT INTO ai_rounds VALUES(?,?,?,?)", [account, round.id, round.conversationId, try encoded(round)]) }
            for var discussion in value.discussions {
                if ["running", "summarizing"].contains(discussion.status) { discussion.status = "interrupted"; discussion.revision += 1 }
                try saveDiscussion(discussion, account: account)
            }
            for choice in value.conversationModels { try execute("INSERT INTO ai_conversation_models VALUES(?,?,?,?)", [account, choice.conversationId, choice.personaId, try encoded(choice)]) }
            for memory in value.memories { try insertMemory(memory) }
            try restoreContextBackup(value, account: account)
            try restoreProcessingBackup(value, account: account)
            try restoreEchoBackup(value, account: account)
            try execute("COMMIT")
        } catch { try? execute("ROLLBACK"); throw error }
    }
}
