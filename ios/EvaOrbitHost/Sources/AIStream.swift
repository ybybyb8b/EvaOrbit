import Foundation
import CoreFoundation

// Byte framing keeps incomplete UTF-8 scalars intact until a complete SSE line arrives.
struct AISSEParser {
    private var line = Data()
    private var dataLines: [String] = []
    private var eventName = ""
    private var eventBytes = 0
    private var afterCR = false
    private var firstLine = true
    static let maxEventBytes = 256 * 1024

    mutating func append(_ byte: UInt8) throws -> [(String, String)] {
        if afterCR { afterCR = false; if byte == 10 { return [] } }
        if byte == 13 || byte == 10 {
            afterCR = byte == 13
            guard var text = String(data: line, encoding: .utf8) else { throw AIError.stream }
            line.removeAll(keepingCapacity: true)
            if firstLine { firstLine = false; if text.hasPrefix("\u{feff}") { text.removeFirst() } }
            if text.isEmpty {
                let result = dataLines.isEmpty && eventName != "error" ? [] : [(eventName, dataLines.joined(separator: "\n"))]
                dataLines.removeAll(keepingCapacity: true); eventName = ""; eventBytes = 0
                return result
            }
            eventBytes += text.utf8.count
            guard eventBytes <= Self.maxEventBytes else { throw AIError.tooLarge }
            if text.hasPrefix(":") { return [] }
            let field = text.split(separator: ":", maxSplits: 1, omittingEmptySubsequences: false)
            var value = field.count == 2 ? String(field[1]) : ""
            if value.hasPrefix(" ") { value.removeFirst() }
            if field[0] == "data" { dataLines.append(value) }
            if field[0] == "event" { eventName = value }
            return []
        }
        line.append(byte)
        guard line.count <= Self.maxEventBytes else { throw AIError.tooLarge }
        return []
    }
    mutating func finish() throws -> [(String, String)] {
        afterCR = false
        var result: [(String, String)] = []
        if !line.isEmpty { result += try append(10) }
        result += try append(10)
        return result
    }
}

struct AIStreamPart {
    var delta = ""
    var usage: AIUsage?
    var done = false
    static func decode(event: String, data: String) throws -> AIStreamPart {
        if event == "error" { throw AIError.stream }
        if data.trimmingCharacters(in: .whitespacesAndNewlines) == "[DONE]" { return .init(done: true) }
        guard let bytes = data.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any], json["error"] == nil else { throw AIError.stream }
        var part = AIStreamPart()
        if let usage = json["usage"] as? [String: Any] {
            func count(_ raw: Any?) -> Int? {
                guard let n = raw as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(), n.doubleValue.isFinite,
                      n.doubleValue >= 0, n.doubleValue <= Double(Int32.max), n.doubleValue.rounded() == n.doubleValue else { return nil }
                return n.intValue
            }
            part.usage = AIUsage(inputTokens: count(usage["prompt_tokens"]), outputTokens: count(usage["completion_tokens"]),
                                 cachedTokens: count((usage["prompt_tokens_details"] as? [String: Any])?["cached_tokens"]), source: "provider")
        }
        if let choice = (json["choices"] as? [[String: Any]])?.first {
            let delta = choice["delta"] as? [String: Any]
            if delta?["tool_calls"] != nil { throw AIError.stream } // Tools are deliberately unavailable in Phase 1A.
            part.delta = delta?["content"] as? String ?? ""
            if let reason = choice["finish_reason"] as? String, !["stop", "length"].contains(reason) { throw AIError.stream }
        }
        return part
    }
}

final class AIProviderAdapter: NSObject, URLSessionTaskDelegate {
    private let testConfiguration: URLSessionConfiguration?
    init(configuration: URLSessionConfiguration? = nil) { testConfiguration = configuration; super.init() }
    static func configuration() -> URLSessionConfiguration {
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil; config.httpShouldSetCookies = false
        config.urlCredentialStorage = nil; config.urlCache = nil
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 60
        config.timeoutIntervalForResource = 600
        return config
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }

    func stream(_ request: URLRequest, receive: @escaping (AIStreamPart) async throws -> Void) async throws {
        let session = URLSession(configuration: testConfiguration ?? Self.configuration(), delegate: self, delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        let (bytes, response) = try await session.bytes(for: request)
        guard let http = response as? HTTPURLResponse else { throw AIError.stream }
        guard (200..<300).contains(http.statusCode) else { throw AIError.http(http.statusCode) }
        guard http.value(forHTTPHeaderField: "Content-Type")?.lowercased().contains("text/event-stream") == true else { throw AIError.stream }
        var parser = AISSEParser()
        for try await byte in bytes {
            try Task.checkCancellation()
            for (event, data) in try parser.append(byte) {
                let part = try AIStreamPart.decode(event: event, data: data)
                try await receive(part)
                if part.done { return }
            }
        }
        for (event, data) in try parser.finish() {
            let part = try AIStreamPart.decode(event: event, data: data)
            try await receive(part)
            if part.done { return }
        }
        throw AIError.truncated
    }

    // A read-only directory request, with the same cookie and redirect isolation as inference.
    func modelDirectory(_ request: URLRequest) async throws -> Data {
        let configuration = testConfiguration ?? Self.configuration()
        configuration.timeoutIntervalForResource = 30
        let session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        return try await withTaskCancellationHandler(operation: {
            let (bytes, response) = try await session.bytes(for: request)
            guard let http = response as? HTTPURLResponse else { throw AIError.catalog }
            guard (200..<300).contains(http.statusCode) else { throw AIError.http(http.statusCode) }
            guard http.value(forHTTPHeaderField: "Content-Type")?.lowercased().contains("application/json") == true else { throw AIError.catalog }
            guard response.expectedContentLength <= Int64(AIModelCatalog.maxBytes) else { throw AIError.tooLarge }
            var data = Data()
            for try await byte in bytes {
                try Task.checkCancellation()
                guard data.count < AIModelCatalog.maxBytes else { throw AIError.tooLarge }
                data.append(byte)
            }
            return data
        }, onCancel: { session.invalidateAndCancel() })
    }
}
