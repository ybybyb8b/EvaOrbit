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

    private func effectivePort(_ components: URLComponents) -> Int? {
        if let port = components.port { return port }
        switch components.scheme?.lowercased() {
        case "https": return 443
        case "http": return 80
        default: return nil
        }
    }
}
