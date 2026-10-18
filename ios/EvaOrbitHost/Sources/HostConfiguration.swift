import Foundation

struct HostConfiguration: Equatable {
    let baseURL: URL
    let localTrackers: Bool
    let trackerDevelopmentURL: URL?

    static var production: HostConfiguration {
        guard
            let rawValue = Bundle.main.object(forInfoDictionaryKey: "EvaOrbitBaseURL") as? String,
            let url = URL(string: rawValue),
            let configuration = HostConfiguration(validating: url,
                localTrackers: ["YES", "true", "1"].contains(String(describing: Bundle.main.object(forInfoDictionaryKey: "EvaOrbitLocalTrackersEnabled") ?? "NO")),
                trackerDevelopmentURL: (Bundle.main.object(forInfoDictionaryKey: "EvaOrbitTrackerDevelopmentURL") as? String).flatMap(URL.init(string:)))
        else {
            preconditionFailure("EvaOrbitBaseURL must be an absolute HTTPS URL")
        }
        return configuration
    }

    init?(validating url: URL, localTrackers: Bool = false, trackerDevelopmentURL: URL? = nil) {
        guard url.scheme?.lowercased() == "https", url.host != nil else { return nil }
        baseURL = url
        self.localTrackers = localTrackers
        #if DEBUG
        if localTrackers, let development = trackerDevelopmentURL, development.scheme == "https", development.host != nil, development.user == nil, development.password == nil {
            self.trackerDevelopmentURL = development
        } else { self.trackerDevelopmentURL = nil }
        #else
        self.trackerDevelopmentURL = nil
        #endif
    }

    func allowsTrackerUI(_ url: URL) -> Bool {
        guard localTrackers else { return false }
        if TrackerAssetHandler.isLocal(url) { return true }
        guard let development = trackerDevelopmentURL else { return false }
        return url.scheme == development.scheme && url.host == development.host && url.port == development.port && url.user == nil && url.password == nil
    }

    func allows(_ url: URL) -> Bool {
        guard let expected = URLComponents(url: baseURL, resolvingAgainstBaseURL: false),
              let candidate = URLComponents(url: url, resolvingAgainstBaseURL: false)
        else { return false }

        return candidate.scheme?.lowercased() == expected.scheme?.lowercased()
            && candidate.host?.lowercased() == expected.host?.lowercased()
            && effectivePort(candidate) == effectivePort(expected)
    }

    func navigationURL(for deepLink: URL) -> URL? {
        guard let incoming = URLComponents(url: deepLink, resolvingAgainstBaseURL: false),
              incoming.scheme?.lowercased() == "evaorbit", incoming.host?.lowercased() == "open",
              incoming.user == nil, incoming.password == nil, incoming.port == nil,
              !incoming.path.contains("\\"), !incoming.path.hasPrefix("//"),
              !incoming.path.split(separator: "/").contains(where: { $0 == "." || $0 == ".." }),
              let root = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)
        else { return nil }
        let path = incoming.path.isEmpty ? "/" : incoming.path
        let routes = ["/tasks", "/settings/notifications", "/food", "/health", "/lucius", "/memo"]
        guard path == "/" || routes.contains(where: { path == $0 || path.hasPrefix($0 + "/") }) else { return nil }
        var target = root
        target.percentEncodedPath = incoming.percentEncodedPath.isEmpty ? "/" : incoming.percentEncodedPath
        target.percentEncodedQuery = incoming.percentEncodedQuery
        target.percentEncodedFragment = incoming.percentEncodedFragment
        guard let url = target.url, allows(url) else { return nil }
        return url
    }

    private func effectivePort(_ components: URLComponents) -> Int? {
        if let port = components.port { return port }
        switch components.scheme?.lowercased() {
        case "https": return 443
        case "http": return 80
        default: return nil
        }
    }
}
