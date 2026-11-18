import Foundation

enum AIMemoryKind: String, Codable, CaseIterable {
    case experience, understanding, observation, commitment, ongoingTopic
}
enum AIMemoryNature: String, Codable, CaseIterable {
    case userStatement, sharedExperience, personaObservation, promise
}
enum AIMemoryStatus: String, Codable { case active, superseded, deleted }
enum AIMemoryVisibility: String, Codable { case singleChat, allChats }

struct AIMemorySource: Codable, Equatable {
    var conversationId: String
    var messageId: String?
    var excerpt: String
}

struct AIPersonaMemory: Codable {
    var id: String
    var accountId: String
    var personaId: String
    var kind: AIMemoryKind
    var content: String
    var importance: Int
    var nature: AIMemoryNature
    var sources: [AIMemorySource]
    var createdAt: String
    var updatedAt: String
    var version: Int
    var status: AIMemoryStatus
    // Legacy memories default to single-chat use; group sharing is explicit.
    var visibility: AIMemoryVisibility?

    var provenance: AIMemoryProvenance?
    var expiredAt: String?

    func validate() throws {
        if let p = provenance { guard UUID(uuidString: p.taskId) != nil, UUID(uuidString: p.proposalId) != nil, UUID(uuidString: p.providerId) != nil, !p.modelId.isEmpty, p.confidence.isFinite, (0...1).contains(p.confidence), (p.eventTime?.utf8.count ?? 0) <= 100 else { throw AIError.invalid } }
        if let expiredAt { guard ISO8601DateFormatter().date(from: expiredAt) != nil else { throw AIError.invalid } }
        guard UUID(uuidString: id) != nil, UUID(uuidString: accountId) != nil,
              personaId == "sebastian" || UUID(uuidString: personaId) != nil,
              (1...5).contains(importance), (1...10000).contains(version), sources.count <= 20,
              ISO8601DateFormatter().date(from: createdAt) != nil,
              ISO8601DateFormatter().date(from: updatedAt) != nil,
              content.utf8.count <= 32000, !content.contains("\0") else { throw AIError.invalid }
        if status == .deleted {
            guard content.isEmpty, sources.isEmpty else { throw AIError.invalid }
        } else {
            guard !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw AIError.invalid }
        }
        for source in sources {
            guard UUID(uuidString: source.conversationId) != nil,
                  source.messageId == nil || UUID(uuidString: source.messageId!) != nil,
                  !source.excerpt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  source.excerpt.utf8.count <= 8000, !source.excerpt.contains("\0") else { throw AIError.invalid }
        }
    }
}
