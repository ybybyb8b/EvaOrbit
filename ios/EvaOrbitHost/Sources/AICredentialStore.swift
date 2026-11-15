import Foundation
import Security

protocol AISecretStore {
    func read(account: String, provider: String) throws -> String?
    func write(_ value: String, account: String, provider: String) throws
    func remove(account: String, provider: String) throws
}

struct AICredentialStore: AISecretStore {
    let service = "com.evaorbit.nativehost.ai.v1"
    private func query(_ account: String, _ provider: String) -> [String: Any] {
        // The NUL separator is not accepted in either validated UUID identity.
        let identity = Data((account + "\0" + provider).utf8).base64EncodedString()
        return [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: identity]
    }
    func read(account: String, provider: String) throws -> String? {
        var request = query(account, provider)
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data, let value = String(data: data, encoding: .utf8) else { throw AIError.secureStorage }
        return value
    }
    func write(_ value: String, account: String, provider: String) throws {
        guard !value.isEmpty, value.utf8.count <= 4096, !value.contains(where: { $0.isNewline || $0.asciiValue == 0 }) else { throw AIError.invalid }
        let request = query(account, provider)
        let update = [kSecValueData as String: Data(value.utf8)]
        let status = SecItemUpdate(request as CFDictionary, update as CFDictionary)
        if status == errSecSuccess { return }
        guard status == errSecItemNotFound else { throw AIError.secureStorage }
        var insert = request
        insert[kSecValueData as String] = Data(value.utf8)
        insert[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        guard SecItemAdd(insert as CFDictionary, nil) == errSecSuccess else { throw AIError.secureStorage }
    }
    func remove(account: String, provider: String) throws {
        let status = SecItemDelete(query(account, provider) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw AIError.secureStorage }
    }
}
