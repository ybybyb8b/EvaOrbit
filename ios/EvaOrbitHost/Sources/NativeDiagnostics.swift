import Foundation

// Only controlled operation labels and error codes cross the bridge. Never expose
// NSError.userInfo, response bodies, credentials, URLs with queries, or file paths.
struct NativeDiagnosticFailure: LocalizedError {
    let code: String
    let message: String
    var errorDescription: String? { message }
}

enum NativeDiagnostics {
    static func capture(_ error: Error, operation: String, writeResultUnknown: Bool = false) -> NativeDiagnosticFailure {
        let cause = describe(error)
        let caution = writeResultUnknown ? " The save result is unknown. Reconnect and refresh before submitting again; nothing retries automatically." : ""
        return NativeDiagnosticFailure(code: cause.code, message: "\(operation): \(cause.message)\(caution)")
    }

    static func describe(_ error: Error) -> NativeDiagnosticFailure {
        if let diagnostic = error as? NativeDiagnosticFailure { return diagnostic }
        if let local = error as? TrackerLocalError {
            switch local {
            case .storage: return .init(code: "local_storage_failed", message: "Local database read/write failed. Check available device storage; do not clear the App.")
            case .account: return .init(code: "account_mismatch", message: "The local account differs from the connected account. Reconnect the same account.")
            case .invalid: return .init(code: "invalid_data", message: "The request or response has an invalid format, value, or protocol version.")
            case .readOnly: return .init(code: "read_only", message: "This operation is disabled in read-only mode. Nothing was submitted.")
            case .sessionExpired: return .init(code: "session_expired", message: "Session expired. Reconnect the same account; local records are preserved.")
            case .network(let message): return .init(code: "server_request_failed", message: String(message.prefix(1000)))
            }
        }
        // These app-owned errors contain fixed, actionable copy, not system data.
        if let eventKit = error as? EventKitSyncError {
            switch eventKit {
            case .invalidInput: return .init(code: "eventkit_invalid_input", message: eventKit.localizedDescription)
            case .unavailable: return .init(code: "eventkit_source_unavailable", message: eventKit.localizedDescription)
            }
        }
        if let health = error as? HealthKitClientError {
            let code: String
            switch health {
            case .typeUnavailable: code = "healthkit_type_unavailable"
            case .authorizationFailed: code = "healthkit_authorization_failed"
            case .backgroundDeliveryFailed: code = "healthkit_background_delivery_failed"
            case .missingAnchor: code = "healthkit_anchor_missing"
            case .invalidAnchor: code = "healthkit_anchor_invalid"
            }
            return .init(code: code, message: health.localizedDescription)
        }
        if let notification = error as? NotificationManagerError {
            let code: String
            switch notification {
            case .invalidIdentifier: code = "notification_invalid_identifier"
            case .invalidContent: code = "notification_invalid_content"
            case .triggerNotInFuture: code = "notification_invalid_time"
            case .notAuthorized: code = "notification_not_authorized"
            }
            return .init(code: code, message: notification.localizedDescription)
        }
        if let credential = error as? HealthCredentialError {
            return .init(code: "secure_storage_failed", message: credential.localizedDescription)
        }
        if let coordinator = error as? HealthKitCoordinatorError {
            switch coordinator {
            case .unavailable: return .init(code: "healthkit_unavailable", message: coordinator.localizedDescription)
            case .invalidLocalDate: return .init(code: "healthkit_invalid_date", message: coordinator.localizedDescription)
            }
        }
        if let store = error as? HealthLocalStoreError {
            switch store {
            case .openFailed: return .init(code: "healthkit_store_open_failed", message: "Could not open the Apple Health local store. Preserve App data.")
            case .sqlite: return .init(code: "healthkit_store_query_failed", message: "Apple Health local database operation failed. Preserve App data and sync queues.")
            case .missingDailyTotal: return .init(code: "healthkit_daily_total_missing", message: "A required local Apple Health daily total is missing.")
            }
        }
        if error is DecodingError { return .init(code: "response_decode_failed", message: "The downloaded response could not be decoded. Check the API version.") }
        let system = error as NSError
        if system.domain == NSURLErrorDomain {
            let code: String, reason: String
            switch system.code {
            case NSURLErrorTimedOut: code = "network_timeout"; reason = "The server request timed out."
            case NSURLErrorNotConnectedToInternet: code = "network_offline"; reason = "The device is offline."
            case NSURLErrorNetworkConnectionLost: code = "network_connection_lost"; reason = "The network connection was interrupted."
            case NSURLErrorCannotFindHost, NSURLErrorDNSLookupFailed: code = "network_dns_failed"; reason = "The server address could not be resolved."
            case NSURLErrorCannotConnectToHost: code = "network_unreachable"; reason = "The server could not be reached."
            case NSURLErrorSecureConnectionFailed, NSURLErrorServerCertificateUntrusted, NSURLErrorServerCertificateHasBadDate, NSURLErrorServerCertificateHasUnknownRoot, NSURLErrorServerCertificateNotYetValid:
                code = "network_tls_failed"; reason = "The secure connection or server certificate could not be verified."
            case NSURLErrorCancelled: code = "operation_cancelled"; reason = "The request was cancelled."
            default: code = "network_failed"; reason = "The network request failed."
            }
            return .init(code: code, message: "\(reason) (URL error \(system.code))")
        }
        if system.domain == NSCocoaErrorDomain {
            switch system.code {
            case NSFileWriteOutOfSpaceError: return .init(code: "storage_full", message: "Device storage is full. Free some space without deleting App data.")
            case NSFileReadNoPermissionError, NSFileWriteNoPermissionError: return .init(code: "storage_access_denied", message: "The local file could not be accessed. Unlock the device and try again.")
            case NSFileReadNoSuchFileError: return .init(code: "local_file_missing", message: "A required local file is missing. Do not clear the database or sync queue.")
            case 3840: return .init(code: "json_decode_failed", message: "The response or cached data is not valid JSON.")
            default: return .init(code: "local_file_failed", message: "Local file or data processing failed. (Cocoa error \(system.code))")
            }
        }
        if system.domain == NSPOSIXErrorDomain {
            if system.code == 28 { return .init(code: "storage_full", message: "Device storage is full. Preserve App data while freeing space.") }
            return .init(code: "local_io_failed", message: "The local input/output operation failed. (POSIX error \(system.code))")
        }
        if system.domain == "EKErrorDomain" { return .init(code: "eventkit_system_failed", message: "Apple Calendar / Reminders rejected the operation. Check access and source availability. (EventKit error \(system.code))") }
        if system.domain == "com.apple.healthkit" { return .init(code: "healthkit_system_failed", message: "Apple Health rejected the operation. Check Health access and device availability. (HealthKit error \(system.code))") }
        if system.domain == NSOSStatusErrorDomain { return .init(code: "secure_storage_failed", message: "The system secure storage operation failed. (OSStatus \(system.code))") }
        return .init(code: "native_unexpected", message: "An unexpected native error occurred. Keep the App data and report this operation. (Error \(system.code))")
    }

    static func marked(_ message: String, code: String) -> String {
        let marker = "[EO:\(code)]"
        return message.contains(marker) ? message : "\(message) \(marker)"
    }
    static func summary(_ error: Error) -> String {
        let diagnostic = describe(error)
        return marked(diagnostic.message, code: diagnostic.code)
    }
}
