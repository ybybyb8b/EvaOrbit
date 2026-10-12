import Foundation

struct HostConfiguration: Equatable {
    let baseURL: URL

    static var production: HostConfiguration {
        guard
            let rawValue = Bundle.main.object(forInfoDictionaryKey: "EvaOrbitBaseURL") as? String,
            let url = URL(string: rawValue),
            let configuration = HostConfiguration(validating: url)
        else {
            preconditionFailure("EvaOrbitBaseURL must be an absolute HTTPS URL")
        }
        return configuration
    }

    init?(validating url: URL) {
        guard url.scheme?.lowercased() == "https", url.host != nil else { return nil }
        baseURL = url
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
