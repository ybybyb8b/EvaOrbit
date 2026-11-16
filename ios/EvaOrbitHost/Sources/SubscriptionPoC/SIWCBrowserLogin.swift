#if DEBUG || PARLOR_SUBSCRIPTION_POC
import UIKit
import AuthenticationServices
import Network

// Experimental iOS transport: the documented SIWC redirect is HTTP loopback,
// not a custom scheme. ASWebAuthenticationSession owns the browser; NWListener
// receives the callback and closes that session. Device validation is required.
@MainActor
final class SIWCBrowserLogin: NSObject, ASWebAuthenticationPresentationContextProviding {
    private weak var window: UIWindow?
    private var browser: ASWebAuthenticationSession?
    private var listener: NWListener?
    private var connections: [UUID: NWConnection] = [:]
    private var deadline: Task<Void, Never>?
    private var pending: CheckedContinuation<(SIWCAttempt, String, String), Error>?
    private var attempt: SIWCAttempt?

    init(window: UIWindow?) { self.window = window }
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { window ?? ASPresentationAnchor() }

    func authorize(host: String, client: String?) async throws -> (SIWCAttempt, String, String) {
        guard pending == nil else { throw SIWCFailure.protocolError }
        return try await withTaskCancellationHandler(operation: {
            try await withCheckedThrowingContinuation { continuation in
                pending = continuation
                do {
                    let parameters = NWParameters.tcp
                    parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
                    let listener = try NWListener(using: parameters)
                    self.listener = listener
                    listener.stateUpdateHandler = { [weak self] state in
                        Task { @MainActor in
                            guard let self, self.pending != nil else { return }
                            switch state {
                            case .ready:
                                guard self.attempt == nil, let port = self.listener?.port else { return }
                                do {
                                    let redirect = URL(string: "http://127.0.0.1:\(port.rawValue)/auth/callback")!
                                    let attempt = try SIWCAttempt(redirect: redirect, client: client)
                                    self.attempt = attempt
                                    let browser = ASWebAuthenticationSession(url: attempt.authorizationURL(host: host), callbackURLScheme: nil) { [weak self] _, _ in
                                        Task { @MainActor in self?.finish(.failure(SIWCFailure.cancelled)) }
                                    }
                                    browser.presentationContextProvider = self
                                    browser.prefersEphemeralWebBrowserSession = true
                                    self.browser = browser
                                    guard browser.start() else { throw SIWCFailure.protocolError }
                                } catch { self.finish(.failure(error)) }
                            case .failed: self.finish(.failure(SIWCFailure.protocolError))
                            default: break
                            }
                        }
                    }
                    listener.newConnectionHandler = { [weak self] connection in
                        Task { @MainActor in self?.accept(connection) }
                    }
                    listener.start(queue: .main)
                    deadline = Task { [weak self] in
                        do { try await Task.sleep(nanoseconds: 180_000_000_000) } catch { return }
                        self?.finish(.failure(SIWCFailure.timeout))
                    }
                    if Task.isCancelled { finish(.failure(SIWCFailure.cancelled)) }
                } catch { finish(.failure(error)) }
            }
        }, onCancel: { Task { @MainActor [weak self] in self?.finish(.failure(SIWCFailure.cancelled)) } })
    }

    private func accept(_ connection: NWConnection) {
        guard pending != nil, connections.count < 4 else { connection.cancel(); return }
        let id = UUID(); connections[id] = connection
        connection.start(queue: .main)
        // Each socket has a short lifetime; an incomplete request cannot occupy all slots indefinitely.
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in
            self?.connections.removeValue(forKey: id)?.cancel()
        }
        receive(connection, id: id, buffered: Data())
    }
    private func receive(_ connection: NWConnection, id: UUID, buffered: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 16384) { [weak self] data, _, complete, error in
            Task { @MainActor in
                guard let self, self.pending != nil, self.connections[id] != nil else { connection.cancel(); return }
                let bytes = buffered + (data ?? Data())
                guard bytes.count <= 16384 else { self.reject(connection, id: id); return }
                guard let end = bytes.range(of: Data("\r\n\r\n".utf8)) else {
                    if complete || error != nil { self.reject(connection, id: id) }
                    else { self.receive(connection, id: id, buffered: bytes) }
                    return
                }
                guard let header = String(data: bytes[..<end.lowerBound], encoding: .utf8),
                      let line = header.components(separatedBy: "\r\n").first,
                      let attempt = self.attempt else { self.reject(connection, id: id); return }
                let fields = line.split(separator: " ", omittingEmptySubsequences: false)
                guard fields.count == 3, fields[0] == "GET", fields[2] == "HTTP/1.1",
                      fields[1].hasPrefix("/auth/callback?"),
                      let url = URL(string: "http://127.0.0.1:\(attempt.redirect.port!)" + String(fields[1])) else {
                    self.reject(connection, id: id); return
                }
                do {
                    let result = try attempt.callback(url)
                    self.finish(.success((attempt, result.code, result.client)))
                } catch SIWCFailure.invalidCallback {
                    // Ignore uncorrelated requests; do not let a stray browser probe terminate sign-in.
                    self.reject(connection, id: id)
                } catch { self.finish(.failure(error)) }
            }
        }
    }
    private func reject(_ connection: NWConnection, id: UUID) {
        let reply = Data("HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n".utf8)
        connection.send(content: reply, completion: .contentProcessed { [weak self] _ in
            connection.cancel()
            Task { @MainActor in self?.connections.removeValue(forKey: id) }
        })
    }
    private func finish(_ result: Result<(SIWCAttempt, String, String), Error>) {
        guard let continuation = pending else { return }
        pending = nil
        deadline?.cancel(); deadline = nil
        listener?.cancel(); listener = nil
        for connection in connections.values { connection.cancel() }
        connections.removeAll(); browser?.cancel(); browser = nil; attempt = nil
        continuation.resume(with: result)
    }
}
#endif
