import Foundation

struct AIGroup: Codable {
    var id: String
    var title: String
    var participants: [ParlorPersona]
    var mode: String = "parallel"
    var maxRounds: Int?
    var bindings: [AIGroupMember]?
    func validate() throws {
        guard UUID(uuidString: id) != nil, !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              title.count <= 80, ["parallel", "discussion"].contains(mode), (1...5).contains(maxRounds ?? 3), (2...8).contains(participants.count),
              Set(participants.map(\.id)).count == participants.count else { throw AIError.invalid }
        for persona in participants { try persona.validate(); guard persona.providerId != nil && persona.modelId != nil else { throw AIError.invalid } }
    }
}
struct AIGroupMember: Codable {
    var persona: ParlorPersona
    var provider: AIProvider
    var model: AIModel
}
// Persisted once before any participant starts. Retries read this exact snapshot.
struct AIGroupRound: Codable {
    var id: String
    var conversationId: String
    var content: String
    var context: [[String: String]]
    var members: [AIGroupMember]
    var discussionId: String?
    var discussionRound: Int?
    var purpose: String?
}

// A bounded local run. Reopening never automatically restarts billed inference.
struct AIGroupDiscussion: Codable {
    var id: String
    var conversationId: String
    var status: String = "running"
    var roundsStarted: Int = 0
    var maxRounds: Int = 3
    var suspendedPersonaIds: [String] = []
    var revision: Int = 0
    var error: String?
}
