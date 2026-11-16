import Foundation
import CoreFoundation

struct AIDiscoveredModel: Encodable {
    var model: AIModel
    var family: String
    var textCapability: String
}

struct AIModelCatalog: Encodable {
    static let maxBytes = 4 * 1024 * 1024
    static let maxModels = 5000
    var models: [AIDiscoveredModel]
    var fetchedAt: String
    var currency: String?
    var partial: Bool = false

    static func decode(_ data: Data, endpoint: URL, secret: String) throws -> AIModelCatalog {
        guard data.count <= maxBytes else { throw AIError.tooLarge }
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              object["error"] == nil, let rows = object["data"] as? [[String: Any]] else { throw AIError.catalog }
        guard rows.count <= maxModels else { throw AIError.tooLarge }
        // Only this documented endpoint defines these fields as USD per token. A compatible
        // proxy's identically named fields do not establish units or billing equivalence.
        let priced = endpoint.scheme == "https" && endpoint.host?.lowercased() == "openrouter.ai" && (endpoint.port == nil || endpoint.port == 443) && endpoint.path == "/api/v1/models"
        let timestamp = aiTimestamp()
        var seen = Set<String>(), models: [AIDiscoveredModel] = []
        func safe(_ text: String, limit: Int) -> Bool {
            !text.isEmpty && text.count <= limit && !text.contains(secret) && !text.unicodeScalars.contains { $0.value < 32 || $0.value == 127 }
        }
        func number(_ raw: Any?) -> Double? {
            let result: Double?
            if let text = raw as? String { result = Double(text) }
            else if let n = raw as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID() { result = n.doubleValue }
            else { result = nil }
            guard let result, result.isFinite, result >= 0 else { return nil }
            return result
        }
        func price(_ raw: Any?) -> Double? {
            guard let amount = number(raw), amount <= 1 else { return nil }
            return amount * 1_000_000
        }
        for row in rows {
            guard let id = row["id"] as? String, safe(id, limit: 200), id == id.trimmingCharacters(in: .whitespacesAndNewlines), seen.insert(id).inserted else { continue }
            let architecture = row["architecture"] as? [String: Any]
            if let outputs = architecture?["output_modalities"] as? [String], !outputs.contains("text") { continue }
            if let inputs = architecture?["input_modalities"] as? [String], !inputs.contains("text") { continue }
            if let type = row["type"] as? String, ["embedding", "image", "audio", "rerank"].contains(type) { continue }
            let rawName = (row["name"] as? String ?? id).trimmingCharacters(in: .whitespacesAndNewlines)
            guard safe(rawName, limit: 512) else { continue }
            let name = String(rawName.prefix(100))
            let rawFamily = (row["owned_by"] as? String) ?? (id.contains("/") ? id.split(separator: "/").first.map(String.init) ?? "" : "")
            let family = safe(rawFamily, limit: 80) ? rawFamily : ""
            var model = AIModel(id: id, name: name)
            if let size = number(row["context_length"]), size >= 1, size <= 100_000_000, size.rounded() == size { model.contextWindow = Int(size) }
            if priced, let pricing = row["pricing"] as? [String: Any] {
                model.inputPrice = price(pricing["prompt"])
                model.outputPrice = price(pricing["completion"])
                model.cachedInputPrice = price(pricing["input_cache_read"])
                model.priceSource = "openrouter"
                model.priceUpdatedAt = timestamp
                let extras = pricing.keys.filter { !["prompt", "completion", "input_cache_read"].contains($0) }
                // Conditional prices, write-cache fees or unknown/non-token charges cannot
                // safely be included in the basic input/output-only cost estimate.
                model.priceEstimateLimited = extras.contains { key in
                    if let list = pricing[key] as? [Any] { return !list.isEmpty }
                    return pricing[key] != nil && (number(pricing[key]) ?? 1) > 0
                }
            }
            models.append(AIDiscoveredModel(model: model, family: family, textCapability: architecture?["output_modalities"] == nil ? "unknown" : "text"))
        }
        return AIModelCatalog(models: models, fetchedAt: timestamp, currency: priced ? "USD" : nil, partial: object["has_more"] as? Bool == true)
    }
}
