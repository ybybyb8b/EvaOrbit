import Foundation

extension AIStore {
    func validateEchoBackup(_ document: AIBackupDocument) throws {
        let value = document.payload
        if document.version < 4 {
            guard value.echoConfig == nil, value.echoShares == nil, value.echoSnapshots == nil, value.contextSnapshots?.allSatisfy({ $0.echo == nil }) ?? true else { throw AIError.invalidContext }; return
        }
        guard let shares = value.echoShares, let snapshots = value.echoSnapshots, Set(shares.map(\.requestId)).count == shares.count, Set(snapshots.map(\.id)).count == snapshots.count,
              value.echoConfig?.accountId == value.accountId else { throw AIError.invalid }
        let people = Set(value.personas.map(\.id)), messages = Dictionary(uniqueKeysWithValues: value.messages.map { ($0.id, $0) })
        for snapshot in snapshots {
            guard snapshot.accountId == value.accountId, UUID(uuidString: snapshot.id) != nil, snapshot.contextJSON == nil, snapshot.query.count <= 160,
                  ISO8601DateFormatter().date(from: snapshot.fetchedAt) != nil, ISO8601DateFormatter().date(from: snapshot.expiresAt) != nil else { throw AIError.invalidContext }
        }
        for receipt in value.contextSnapshots ?? [] {
            if let ref = receipt.echo { guard snapshots.contains(where: { $0.id == ref.id && $0.hash == ref.hash }) else { throw AIError.invalidContext } }
        }
        for share in shares {
            guard share.accountId == value.accountId, people.contains(share.personaId), UUID(uuidString: share.requestId) != nil,
                  ["preview", "submitting", "unknown", "submitted", "not_found"].contains(share.status), ISO8601DateFormatter().date(from: share.createdAt) != nil else { throw AIError.invalid }
            if let json = share.payloadJSON {
                guard json.utf8.count <= 256 * 1024, AIContext.hash(json) == share.payloadHash, let object = try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any], object["protocol"] as? String == AIEcho.protocolName,
                      let input = object["submission"] as? [String: Any], input["reviewMode"] as? String == "manual", input["requestId"] as? String == share.requestId,
                      let sources = input["sources"] as? [[String: Any]], sources.count == share.sourceRefs.count, !sources.isEmpty else { throw AIError.invalidContext }
                for (index, ref) in share.sourceRefs.enumerated() {
                    guard let message = messages[ref.id], value.messageOrdinals?[ref.id] == ref.ordinal, message.seq == ref.seq,
                          AIContextRecord(ordinal: ref.ordinal, unitOrdinal: ref.ordinal, message: message).ref.hash == ref.hash,
                          let quote = sources[index]["excerpt"] as? String, message.content.contains(quote), sources[index]["sourceRecordId"] as? String == "parlor:\(message.conversationId):\(message.id)" else { throw AIError.invalidContext }
                    let single = value.conversations.contains { $0.id == message.conversationId && $0.ownership == "single" && $0.personaId == share.personaId }
                    let group = value.groups.contains { $0.id == message.conversationId && $0.participants.contains { $0.id == share.personaId } }
                    let historical = value.rounds.contains { $0.conversationId == message.conversationId && $0.id == message.roundId && $0.members.contains { $0.persona.id == share.personaId } }
                    guard single || group || historical, index != 0 || message.conversationId == share.conversationId else { throw AIError.ownership }
                }
                if let id = share.memoryId { guard value.memories.contains(where: { $0.id == id && $0.personaId == share.personaId && $0.version == share.memoryVersion }) else { throw AIError.ownership } }
            } else { guard share.content == nil && share.sourceRefs.isEmpty else { throw AIError.invalidContext } }
        }
    }
    func restoreEchoBackup(_ value: AIBackupPayload, account: String) throws {
        var config = value.echoConfig ?? AIEchoConfig(accountId: account); config.readEnabled = false; config.writeEnabled = false; config.lastStatus = "disabled"; config.connectionStatus = nil
        try writeEchoConfig(config)
        for var share in value.echoShares ?? [] {
            share.sourceRefs = try share.sourceRefs.map { ref in
                let source = value.messages.first { $0.id == ref.id }
                guard let source, let row = try contextRecord(ref.id, conversation: source.conversationId, account: account) else { throw AIError.invalidContext }
                var next = ref; next.ordinal = row.ordinal; return next
            }
            if share.status == "submitting" { share.status = "unknown" }
            try writeEchoShare(share)
        }
        for snapshot in value.echoSnapshots ?? [] { try execute("INSERT INTO ai_echo_snapshots VALUES(?,?,?)", [account, snapshot.id, try encoded(snapshot)]) }
    }
}
