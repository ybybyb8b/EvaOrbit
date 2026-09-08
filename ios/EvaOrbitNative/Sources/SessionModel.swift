import Foundation

enum SessionPhase: Equatable {
    case checking
    case signedOut
    case signedIn(email: String)
}

@MainActor
final class SessionModel: ObservableObject {
    @Published private(set) var phase: SessionPhase = .checking
    @Published private(set) var isWorking = false
    @Published var email = ""
    @Published var password = ""
    @Published var errorMessage: String?

    private let client: APIClient?

    init(client: APIClient? = try? APIClient()) {
        self.client = client
    }

    func restore() async {
        guard let client else {
            phase = .signedOut
            errorMessage = APIClientError.invalidConfiguration.localizedDescription
            return
        }

        do {
            let session = try await client.currentSession()
            apply(session)
        } catch {
            phase = .signedOut
            errorMessage = friendlyMessage(for: error)
        }
    }

    func refreshIfSignedIn() async {
        guard case .signedIn = phase, let client, !isWorking else { return }
        do {
            let session = try await client.currentSession()
            apply(session)
        } catch {
            errorMessage = friendlyMessage(for: error)
        }
    }

    func signIn() async {
        guard let client, !isWorking else { return }
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedEmail.isEmpty, !password.isEmpty else {
            errorMessage = "请输入邮箱和密码"
            return
        }

        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            let session = try await client.signIn(email: normalizedEmail, password: password)
            guard session.authenticated else {
                throw APIClientError.invalidResponse
            }
            password = ""
            apply(session)
        } catch {
            errorMessage = friendlyMessage(for: error)
        }
    }

    func signOut() async {
        guard let client, !isWorking else { return }
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            try await client.signOut()
            email = ""
            password = ""
            phase = .signedOut
        } catch {
            errorMessage = friendlyMessage(for: error)
        }
    }

    private func apply(_ session: NativeSessionResponse) {
        if session.authenticated, let sessionEmail = session.email, !sessionEmail.isEmpty {
            email = sessionEmail
            phase = .signedIn(email: sessionEmail)
        } else {
            phase = .signedOut
        }
        errorMessage = nil
    }

    private func friendlyMessage(for error: Error) -> String {
        if let urlError = error as? URLError {
            switch urlError.code {
            case .notConnectedToInternet, .cannotConnectToHost, .cannotFindHost, .networkConnectionLost, .timedOut:
                return "暂时无法连接 EvaOrbit，请检查代理或网络后重试"
            default:
                break
            }
        }
        return (error as? LocalizedError)?.errorDescription ?? "请求失败，请重试"
    }
}
