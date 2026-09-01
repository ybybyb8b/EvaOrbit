import Foundation
import Security

final class HealthCredentialStore {
    private let service = "com.evaorbit.nativehost.healthkit"

    lazy var installationID: String = {
        if let existing = self.read(account: "installation-id") { return existing }
        let created = UUID().uuidString.lowercased()
        try? self.write(created, account: "installation-id")
        return created
    }()

    var credential: String? { read(account: "device-credential") }
    var ingestURL: URL? { read(account: "ingest-url").flatMap(URL.init(string:)) }
    var isConfigured: Bool { credential != nil && ingestURL != nil }

    func configure(credential: String, ingestURL: URL) throws {
        try write(ingestURL.absoluteString, account: "ingest-url")
        do {
            try write(credential, account: "device-credential")
        } catch {
            delete(account: "ingest-url")
            throw error
        }
    }

    func clearCredential() {
        delete(account: "device-credential")
        delete(account: "ingest-url")
    }

    private func read(account: String) -> String? {
        var query = baseQuery(account: account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func write(_ value: String, account: String) throws {
        let data = Data(value.utf8)
        let query = baseQuery(account: account)
        let update = [kSecValueData as String: data]
        let status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if status == errSecSuccess { return }
        guard status == errSecItemNotFound else { throw HealthCredentialError.keychain(status) }
        var insert = query
        insert[kSecValueData as String] = data
        insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        let insertStatus = SecItemAdd(insert as CFDictionary, nil)
        guard insertStatus == errSecSuccess else { throw HealthCredentialError.keychain(insertStatus) }
    }

    private func delete(account: String) {
        SecItemDelete(baseQuery(account: account) as CFDictionary)
    }

    private func baseQuery(account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
    }
}

enum HealthCredentialError: LocalizedError {
    case keychain(OSStatus)

    var errorDescription: String? {
        switch self {
        case .keychain(let status): return "Could not store native credential (Keychain \(status))"
        }
    }
}
