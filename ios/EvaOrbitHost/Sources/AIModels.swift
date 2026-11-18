import Foundation

enum AIError: LocalizedError, Equatable {
    case invalid, storage, secureStorage, missingKey, busy, stream, truncated, tooLarge, endpointChanged, catalog
    case http(Int)
    case ownership, staleMemory, backupTooLarge, contextCapacity, outputBudget, invalidContext
    var errorDescription: String? {
        switch self {
        case .invalid: return "AI configuration or request is invalid."
        case .storage: return "AI local storage failed. Preserve App data and check free space."
        case .secureStorage: return "AI secure storage is unavailable. Unlock the device and try again."
        case .missingKey: return "Configure a local API Key before sending."
        case .busy: return "Stop the current response before starting another."
        case .stream: return "The provider returned an invalid or error stream. No request was retried."
        case .truncated: return "The connection ended before the response completed. Partial text was kept."
        case .tooLarge: return "This conversation or response is too large. Start a new conversation."
        case .endpointChanged: return "Re-enter or clear the API Key when changing the endpoint."
        case .catalog: return "The provider did not return a supported model directory. You can still enter a Model ID manually."
        case .ownership: return "This conversation needs a confirmed persona. Open Parlor Memory settings to assign it, or start a new conversation."
        case .staleMemory: return "This memory changed. Reload it before saving."
        case .backupTooLarge: return "This Parlor backup exceeds the 16 MiB file limit. No partial backup was exported or restored."
        case .contextCapacity: return "The current message and persona prompt exceed this model's available context. Choose a larger context model or shorten the persona prompt; the current message was kept."
        case .outputBudget: return "The estimated response budget was reached. The partial answer was kept."
        case .invalidContext: return "The context source range changed or is incomplete. Reload the conversation and save a new summary at a completed turn boundary."
        case .http(let status): return "Provider HTTP \(status). Check configuration or limits; nothing retries automatically."
        }
    }
}

struct AIModel: Codable, Equatable {
    var id: String
    var name: String
    var inputPrice: Double?
    var outputPrice: Double?
    var cachedInputPrice: Double?
    var contextWindow: Int?
    var priceSource: String?
    var priceUpdatedAt: String?
    var priceEstimateLimited: Bool?
}

struct AIProvider: Codable, Equatable {
    var id: String
    var name: String
    var baseURL: String
    var models: [AIModel]
    var currency: String
    var priceUpdatedAt: String
    var enabled: Bool

    func validate() throws {
        guard UUID(uuidString: id) != nil, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              name.count <= 80, baseURL.count <= 500, !models.isEmpty, models.count <= 50,
              Set(models.map(\.id)).count == models.count,
              currency.range(of: "^[A-Z]{3}$", options: .regularExpression) != nil else { throw AIError.invalid }
        _ = try endpoint()
        for model in models {
            guard !model.id.isEmpty, model.id.count <= 200, !model.name.isEmpty, model.name.count <= 100,
                  !model.id.contains(where: { $0.isNewline || $0.asciiValue == 0 }) else { throw AIError.invalid }
            for price in [model.inputPrice, model.outputPrice, model.cachedInputPrice].compactMap({ $0 }) {
                guard price.isFinite, price >= 0, price <= 1_000_000 else { throw AIError.invalid }
            }
            if let size = model.contextWindow { guard (1...100_000_000).contains(size) else { throw AIError.invalid } }
            if let source = model.priceSource { guard ["manual", "openrouter"].contains(source) else { throw AIError.invalid } }
            if let date = model.priceUpdatedAt { guard date.count <= 40 else { throw AIError.invalid } }
        }
    }

    func endpoint() throws -> URL {
        try Self.endpoint(baseURL: baseURL, resource: "chat/completions")
    }

    static func endpoint(baseURL: String, resource: String) throws -> URL {
        guard var parts = URLComponents(string: baseURL), parts.scheme == "https", let host = parts.host,
              !host.isEmpty, parts.user == nil, parts.password == nil, parts.query == nil, parts.fragment == nil,
              parts.path.range(of: "[\\\\\u{0000}-\u{0020}]", options: .regularExpression) == nil else { throw AIError.invalid }
        parts.path = parts.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        parts.path = "/" + (parts.path.isEmpty ? "" : parts.path + "/") + resource
        guard let url = parts.url else { throw AIError.invalid }
        return url
    }
}

struct AIUsage: Codable, Equatable {
    var inputTokens: Int?
    var outputTokens: Int?
    var cachedTokens: Int?
    var source: String = "unknown"
    func cost(model: AIModel) -> Double? {
        guard model.priceEstimateLimited != true else { return nil }
        guard let input = inputTokens, let output = outputTokens,
              let inputPrice = model.inputPrice, let outputPrice = model.outputPrice else { return nil }
        let cached = min(input, cachedTokens ?? 0)
        // An unknown cache price makes the total unknown, rather than pretending it was free.
        guard cached == 0 || model.cachedInputPrice != nil else { return nil }
        return (Double(input - cached) * inputPrice + Double(cached) * (model.cachedInputPrice ?? 0) + Double(output) * outputPrice) / 1_000_000
    }
}

struct AIConversation: Codable {
    var id: String
    var title: String
    var updatedAt: String
    var ownership: String?
    var personaId: String?
}

struct AIMessage: Codable {
    var id: String
    var conversationId: String
    var role: String
    var content: String
    var status: String
    var createdAt: String
    var requestId: String?
    var providerId: String?
    var providerName: String?
    var model: AIModel?
    var currency: String?
    var priceUpdatedAt: String?
    var usage: AIUsage?
    var cost: Double?
    var error: String?
    var seq: Int = 0
    var requestCount: Int = 0
    var personaId: String?
    var personaName: String?
    var personaAvatar: String?
    var roundId: String?
    var supersedesId: String?
    var discussionId: String?
    var discussionRound: Int?
    var purpose: String?
    var contextSnapshotId: String?
    var contextBudget: AIContextBudget?
    var contextCoverage: AIContextCoverage?
    var ordinal: Int64?
    var replyToMessageId: String?
}

func aiTimestamp() -> String { ISO8601DateFormatter().string(from: Date()) }

func aiJSON<T: Encodable>(_ value: T) throws -> Any {
    try JSONSerialization.jsonObject(with: JSONEncoder().encode(value))
}
