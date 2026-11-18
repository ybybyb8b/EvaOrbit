import Foundation
import SQLite3
import Testing
@testable import EvaOrbitHost

private let memoryAccount = "41000000-0000-4000-8000-000000000001"
private let otherMemoryAccount = "41000000-0000-4000-8000-000000000002"

@Suite("Parlor persona memory foundation")
struct AIPersonaMemoryTests {
    @Test func v5MigrationPreservesHistoryAndOnlyBackfillsReliableIdentities() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appendingPathComponent("ai.sqlite3").path
        let old = try AIStore(path: path)
        _ = try await old.defaultPersona(memoryAccount)
        let reliable = UUID().uuidString, unknown = UUID().uuidString, groupID = UUID().uuidString
        for (id, persona) in [(reliable, "sebastian"), (unknown, ""), (groupID, "sebastian")] {
            try await old.execute("INSERT INTO ai_conversations VALUES(?,?,?,?)", [memoryAccount, id, "Legacy", aiTimestamp()])
            let message = AIMessage(id: UUID().uuidString, conversationId: id, role: "assistant", content: "Original history", status: "done", createdAt: aiTimestamp(), personaId: persona.isEmpty ? nil : persona)
            try await old.execute("INSERT INTO ai_messages(account_id,id,conversation_id,status,payload) VALUES(?,?,?,?,?)", [memoryAccount, message.id, id, "done", String(decoding: try JSONEncoder().encode(message), as: UTF8.self)])
        }
        // Preserve real v5 tables while removing only the two v6 additions in this isolated fixture.
        try await old.execute("INSERT INTO ai_rounds VALUES(?,?,?,?)", [memoryAccount, UUID().uuidString, groupID, "{}"])
        try await old.execute("DROP TABLE ai_persona_memories")
        try await old.execute("DROP TABLE ai_conversation_owners")
        try await old.execute("PRAGMA user_version=5")
        let migrated = try AIStore(path: path)
        let metadata = try await migrated.conversations(memoryAccount)
        #expect(metadata.first(where: { $0.id == reliable })?.personaId == "sebastian")
        #expect(metadata.first(where: { $0.id == unknown })?.ownership == "unresolved")
        #expect(metadata.first(where: { $0.id == groupID })?.ownership == "group")
        #expect(try await migrated.messages(reliable, account: memoryAccount).first?.content == "Original history")
        let backups = try FileManager.default.contentsOfDirectory(atPath: directory.appendingPathComponent("SafetyBackups").path)
        #expect(backups.count == 1)
        let reopened = try AIStore(path: path)
        #expect(try await reopened.conversations(memoryAccount).count == 3)
        #expect(try FileManager.default.contentsOfDirectory(atPath: directory.appendingPathComponent("SafetyBackups").path).count == 1)
    }
    private func fixture() async throws -> (AIStore, ParlorPersona, String, AIMessage) {
        let store = try AIStore(path: ":memory:")
        _ = try await store.defaultPersona(memoryAccount)
        var ada = ParlorPersona.sebastian; ada.id = UUID().uuidString; ada.name = "Ada"
        try await store.savePersona(ada, account: memoryAccount)
        let conversation = UUID().uuidString
        let user = AIMessage(id: UUID().uuidString, conversationId: conversation, role: "user", content: "I prefer a quiet walk.", status: "done", createdAt: aiTimestamp())
        let reply = AIMessage(id: UUID().uuidString, conversationId: conversation, role: "assistant", content: "We will find one.", status: "done", createdAt: aiTimestamp(), personaId: "sebastian")
        try await store.begin(user: user, assistant: reply, account: memoryAccount)
        return (store, ada, conversation, user)
    }
    private func draft(_ message: AIMessage) -> AIPersonaMemory {
        AIPersonaMemory(id: UUID().uuidString, accountId: memoryAccount, personaId: "sebastian", kind: .commitment, content: "Find a quiet walk together.", importance: 4, nature: .promise,
            sources: [AIMemorySource(conversationId: message.conversationId, messageId: message.id, excerpt: "I prefer a quiet walk.")], createdAt: aiTimestamp(), updatedAt: aiTimestamp(), version: 1, status: .active)
    }

    @Test func versionsIsolationStaleWritesAndEvidence() async throws {
        let (store, ada, conversation, user) = try await fixture()
        let first = try await store.saveMemory(draft(user), expectedVersion: 0, persona: "sebastian", account: memoryAccount)
        #expect(first.version == 1)
        #expect(try await store.memories(persona: ada.id, account: memoryAccount).isEmpty)
        _ = try await store.defaultPersona(otherMemoryAccount)
        #expect(try await store.memoryVersions(first.id, persona: "sebastian", account: otherMemoryAccount).isEmpty)
        do { _ = try await store.memorySources(conversation, persona: ada.id, account: memoryAccount); Issue.record("Another persona read private sources") } catch {}
        var changed = first; changed.content = "Find a shaded quiet walk together."
        let second = try await store.saveMemory(changed, expectedVersion: 1, persona: "sebastian", account: memoryAccount)
        #expect(second.version == 2 && second.createdAt == first.createdAt)
        let versions = try await store.memoryVersions(first.id, persona: "sebastian", account: memoryAccount)
        #expect(versions.map(\.status) == [.active, .superseded])
        do { _ = try await store.saveMemory(changed, expectedVersion: 1, persona: "sebastian", account: memoryAccount); Issue.record("Stale edit accepted") } catch {}
        changed = second; changed.sources[0].excerpt = "Invented evidence"
        do { _ = try await store.saveMemory(changed, expectedVersion: 2, persona: "sebastian", account: memoryAccount); Issue.record("Invented excerpt accepted") } catch {}
        changed = second; changed.personaId = ada.id
        do { _ = try await store.saveMemory(changed, expectedVersion: 0, persona: ada.id, account: memoryAccount); Issue.record("Cross-persona source accepted") } catch {}
        #expect(try await store.memories(persona: "sebastian", account: memoryAccount, kind: .observation).isEmpty)
    }

    @Test func deletionErasesEveryVersionAndConversationDerivedMemory() async throws {
        let (store, _, conversation, user) = try await fixture()
        var memory = try await store.saveMemory(draft(user), expectedVersion: 0, persona: "sebastian", account: memoryAccount)
        memory.content = "Changed private content"
        memory = try await store.saveMemory(memory, expectedVersion: 1, persona: "sebastian", account: memoryAccount)
        try await store.deleteMemory(memory.id, expectedVersion: 2, persona: "sebastian", account: memoryAccount)
        let deleted = try await store.memoryVersions(memory.id, persona: "sebastian", account: memoryAccount)
        #expect(deleted.count == 2 && deleted.allSatisfy { $0.status == .deleted && $0.content.isEmpty && $0.sources.isEmpty })
        let linked = try await store.saveMemory(draft(user), expectedVersion: 0, persona: "sebastian", account: memoryAccount)
        try await store.deleteConversation(conversation, account: memoryAccount)
        #expect(try await store.memoryVersions(linked.id, persona: "sebastian", account: memoryAccount).allSatisfy { $0.status == .deleted && $0.sources.isEmpty })
        #expect(try await store.messages(conversation, account: memoryAccount).isEmpty)
        let exported = try await store.exportBackup(account: memoryAccount)
        #expect(exported.payload.memories.allSatisfy { $0.content.isEmpty && $0.sources.isEmpty })
    }

    @Test func ownershipPreventsSwitchingOrTurningPrivateChatIntoGroup() async throws {
        let (store, ada, conversation, _) = try await fixture()
        #expect(try await store.conversations(memoryAccount).first?.personaId == "sebastian")
        do { try await store.requireConversationPersona(conversation, persona: ada.id, account: memoryAccount); Issue.record("Private conversation changed persona") } catch {}
        do { try await store.assignConversation(conversation, persona: ada.id, account: memoryAccount); Issue.record("Confirmed ownership overwritten") } catch {}
        let legacy = UUID().uuidString
        try await store.execute("INSERT INTO ai_conversations VALUES(?,?,?,?)", [memoryAccount, legacy, "Unknown", aiTimestamp()])
        try await store.execute("INSERT INTO ai_conversation_owners VALUES(?,?,'unresolved',NULL)", [memoryAccount, legacy])
        let message = AIMessage(id: UUID().uuidString, conversationId: legacy, role: "user", content: "Old private history", status: "done", createdAt: aiTimestamp())
        try await store.execute("INSERT INTO ai_messages(account_id,id,conversation_id,status,payload) VALUES(?,?,?,?,?)", [memoryAccount, message.id, legacy, "done", try String(data: JSONEncoder().encode(message), encoding: .utf8)!])
        do { try await store.requireConversationPersona(legacy, persona: ada.id, account: memoryAccount); Issue.record("Unresolved history silently adopted") } catch {}
        try await store.assignConversation(legacy, persona: ada.id, account: memoryAccount)
        try await store.requireConversationPersona(legacy, persona: ada.id, account: memoryAccount)
    }

    @Test func backupRoundtripAndInvalidRestoreLeavesAccountsUntouched() async throws {
        let (store, ada, conversation, user) = try await fixture()
        let memory = try await store.saveMemory(draft(user), expectedVersion: 0, persona: "sebastian", account: memoryAccount)
        _ = try await store.defaultPersona(otherMemoryAccount)
        let backup = try await store.exportBackup(account: memoryAccount)
        #expect(backup.payload.memories.count == 1 && backup.payload.personas.contains(where: { $0.id == ada.id }))
        let encoded = try JSONEncoder().encode(backup)
        #expect(!String(decoding: encoded, as: UTF8.self).contains("apiKey"))
        try await store.deleteConversation(conversation, account: memoryAccount)
        try await store.restoreBackup(JSONDecoder().decode(AIBackupDocument.self, from: encoded), account: memoryAccount)
        #expect(try await store.memories(persona: "sebastian", account: memoryAccount).first?.id == memory.id)
        #expect(try await store.messages(conversation, account: memoryAccount).count == 2)
        #expect(try await store.personas(otherMemoryAccount).count == 1)
        var invalid = backup; invalid.payload.memories[0].sources[0].messageId = UUID().uuidString
        invalid.checksum = try AIBackupDocument.digest(invalid.payload)
        do { try await store.restoreBackup(invalid, account: memoryAccount); Issue.record("Broken reference restored") } catch {}
        do { try await store.restoreBackup(backup, account: otherMemoryAccount); Issue.record("Foreign account restored") } catch {}
        invalid = backup; invalid.payload.memories[0].content = "Tampered"
        do { try await store.restoreBackup(invalid, account: memoryAccount); Issue.record("Checksum bypassed") } catch {}
        #expect(try await store.memories(persona: "sebastian", account: memoryAccount).first?.content == memory.content)
    }

    @Test func groupSourcesStayPublicAndHistoricalMembershipSurvivesBackup() async throws {
        let (store, adaValue, _, _) = try await fixture()
        var sebastian = try await store.defaultPersona(memoryAccount), ada = adaValue, morgan = adaValue
        let provider = AIProvider(id: UUID().uuidString, name: "Mock", baseURL: "https://mock.example.invalid/v1", models: [AIModel(id: "text", name: "Text")], currency: "USD", priceUpdatedAt: aiTimestamp(), enabled: true)
        try await store.saveProvider(provider, account: memoryAccount)
        morgan.id = UUID().uuidString; morgan.name = "Morgan"
        sebastian.providerId = provider.id; sebastian.modelId = "text"; ada.providerId = provider.id; ada.modelId = "text"; morgan.providerId = provider.id; morgan.modelId = "text"
        try await store.savePersona(sebastian, account: memoryAccount); try await store.savePersona(ada, account: memoryAccount); try await store.savePersona(morgan, account: memoryAccount)
        let id = UUID().uuidString, roundID = UUID().uuidString
        var group = AIGroup(id: id, title: "Public discussion", participants: [sebastian, ada])
        try await store.saveGroup(group, account: memoryAccount)
        let round = AIGroupRound(id: roundID, conversationId: id, content: "A public plan", context: [["role": "user", "content": "A public plan"]], members: [AIGroupMember(persona: sebastian, provider: provider, model: provider.models[0]), AIGroupMember(persona: ada, provider: provider, model: provider.models[0])])
        var user = AIMessage(id: UUID().uuidString, conversationId: id, role: "user", content: "A public plan", status: "done", createdAt: aiTimestamp()); user.roundId = roundID
        try await store.beginRound(round, user: user, assistants: [], account: memoryAccount)
        var memory = draft(user); memory.sources[0].excerpt = "A public plan"; memory.content = "Sebastian's private observation of the public plan."
        _ = try await store.saveMemory(memory, expectedVersion: 0, persona: "sebastian", account: memoryAccount)
        #expect(try await store.memories(persona: ada.id, account: memoryAccount).isEmpty)
        #expect(try await store.round(roundID, account: memoryAccount)?.context == round.context)
        group.participants = [ada, morgan]; try await store.saveGroup(group, account: memoryAccount)
        #expect(try await store.memorySources(id, persona: "sebastian", account: memoryAccount).map(\.id) == [user.id])
        let backup = try await store.exportBackup(account: memoryAccount)
        try await store.restoreBackup(backup, account: memoryAccount)
        #expect(try await store.memories(persona: "sebastian", account: memoryAccount).count == 1)
        #expect(try await store.round(roundID, account: memoryAccount)?.members.first?.persona.id == "sebastian")
    }

    @Test func consistencyBackupContainsWALAndForgetPurgesAffectedSafetyCopies() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appendingPathComponent("ai.sqlite3").path
        let store = try AIStore(path: path)
        _ = try await store.defaultPersona(memoryAccount)
        let now = aiTimestamp()
        let memory = AIPersonaMemory(id: UUID().uuidString, accountId: memoryAccount, personaId: "sebastian", kind: .observation, content: "Private", importance: 3, nature: .personaObservation, sources: [], createdAt: now, updatedAt: now, version: 1, status: .active)
        let saved = try await store.saveMemory(memory, expectedVersion: 0, persona: "sebastian", account: memoryAccount)
        let document = try await store.exportBackup(account: memoryAccount)
        try await store.restoreBackup(document, account: memoryAccount)
        let backups = try FileManager.default.contentsOfDirectory(atPath: directory.appendingPathComponent("SafetyBackups").path)
        try #require(backups.count == 1)
        let snapshotPath = directory.appendingPathComponent("SafetyBackups").appendingPathComponent(backups[0]).path
        do {
            var db: OpaquePointer?
            let opened = sqlite3_open_v2(snapshotPath, &db, SQLITE_OPEN_READONLY, nil)
            defer { sqlite3_close(db) }
            try #require(opened == SQLITE_OK)
            var statement: OpaquePointer?
            let prepared = sqlite3_prepare_v2(db, "SELECT COUNT(*) FROM ai_persona_memories", -1, &statement, nil)
            defer { sqlite3_finalize(statement) }
            try #require(prepared == SQLITE_OK)
            let step = sqlite3_step(statement)
            try #require(step == SQLITE_ROW)
            #expect(sqlite3_column_int(statement, 0) == 1)
        }
        try await store.deleteMemory(saved.id, expectedVersion: saved.version, persona: "sebastian", account: memoryAccount)
        #expect(try FileManager.default.contentsOfDirectory(atPath: directory.appendingPathComponent("SafetyBackups").path).isEmpty)
    }
}
