import Foundation

private struct HealthUploadEnvelope: Encodable {
    let snapshots: [HealthOutboxSnapshot]
}

final class HealthUploadManager: NSObject {
    static let sessionIdentifier = "com.evaorbit.nativehost.healthkit-upload"
    private let store: HealthLocalStore
    private let credentialStore: HealthCredentialStore
    private let queue = DispatchQueue(label: "com.evaorbit.health-upload")
    private var backgroundCompletionHandler: (() -> Void)?
    private var uploadInProgress = false

    private lazy var session: URLSession = {
        let configuration = URLSessionConfiguration.background(withIdentifier: Self.sessionIdentifier)
        configuration.sessionSendsLaunchEvents = true
        configuration.isDiscretionary = false
        configuration.waitsForConnectivity = true
        configuration.timeoutIntervalForRequest = 60
        return URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    }()

    init(store: HealthLocalStore, credentialStore: HealthCredentialStore) {
        self.store = store
        self.credentialStore = credentialStore
        super.init()
        _ = session
        try? store.recoverInflight()
    }

    var installationID: String { credentialStore.installationID }
    var isCredentialConfigured: Bool { credentialStore.isConfigured }

    func configure(credential: String, ingestURL: URL) throws {
        try credentialStore.configure(credential: credential, ingestURL: ingestURL)
        flush()
    }

    func clearCredential() { credentialStore.clearCredential() }

    func flush() {
        queue.async { [weak self] in self?.startNextBatch() }
    }

    func handleEvents(completionHandler: @escaping () -> Void) {
        queue.async { [weak self] in self?.backgroundCompletionHandler = completionHandler }
    }

    private func startNextBatch() {
        guard !uploadInProgress else { return }
        guard let credential = credentialStore.credential, let ingestURL = credentialStore.ingestURL else { return }
        var claimed: [HealthOutboxSnapshot] = []
        do {
            claimed = try store.takePendingBatch(limit: 50)
            guard !claimed.isEmpty else { return }
            uploadInProgress = true
            let batchID = UUID().uuidString.lowercased()
            let fileURL = try uploadFileURL(batchID: batchID)
            try JSONEncoder().encode(HealthUploadEnvelope(snapshots: claimed)).write(to: fileURL, options: .atomic)
            var request = URLRequest(url: ingestURL)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("Bearer \(credential)", forHTTPHeaderField: "Authorization")
            request.setValue(credentialStore.installationID, forHTTPHeaderField: "X-EvaOrbit-Installation-Id")
            let task = session.uploadTask(with: request, fromFile: fileURL)
            task.taskDescription = "\(batchID)|\(claimed.map { String($0.id) }.joined(separator: ","))"
            HealthDiagnostics.log("upload=start count=\(claimed.count) pending=\(store.pendingCount())")
            task.resume()
        } catch {
            uploadInProgress = false
            if !claimed.isEmpty { try? store.failUpload(ids: claimed.map(\.id), reason: "upload preparation failed") }
            HealthDiagnostics.log("upload=prepare-failed error=\(HealthDiagnostics.safe(error))")
        }
    }

    private func uploadFileURL(batchID: String) throws -> URL {
        let root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("EvaOrbitHealth/Uploads", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return root.appendingPathComponent("\(batchID).json")
    }

    private func parseTask(_ task: URLSessionTask) -> (batchID: String, ids: [Int64]) {
        let parts = (task.taskDescription ?? "").split(separator: "|", maxSplits: 1).map(String.init)
        guard parts.count == 2 else { return ("", []) }
        return (parts[0], parts[1].split(separator: ",").compactMap { Int64($0) })
    }

    private func removeUploadFile(batchID: String) {
        guard !batchID.isEmpty, let url = try? uploadFileURL(batchID: batchID) else { return }
        try? FileManager.default.removeItem(at: url)
    }
}

extension HealthUploadManager: URLSessionTaskDelegate, URLSessionDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        let description = parseTask(task)
        let status = (task.response as? HTTPURLResponse)?.statusCode
        queue.async { [weak self] in
            guard let self else { return }
            self.uploadInProgress = false
            defer { self.removeUploadFile(batchID: description.batchID) }
            do {
                if error == nil, let status, (200..<300).contains(status) {
                    try self.store.completeUpload(ids: description.ids)
                    HealthDiagnostics.log("upload=success status=\(status) count=\(description.ids.count) pending=\(self.store.pendingCount())")
                    self.startNextBatch()
                } else {
                    let reason = status.map { "HTTP \($0)" } ?? "network failure"
                    try self.store.failUpload(ids: description.ids, reason: reason)
                    HealthDiagnostics.log("upload=failed status=\(status.map { String($0) } ?? "none") count=\(description.ids.count)")
                }
            } catch {
                HealthDiagnostics.log("upload=state-failed error=\(HealthDiagnostics.safe(error))")
            }
        }
    }

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        queue.async { [weak self] in
            guard let completion = self?.backgroundCompletionHandler else { return }
            self?.backgroundCompletionHandler = nil
            DispatchQueue.main.async(execute: completion)
        }
    }
}
