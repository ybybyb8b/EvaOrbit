import Foundation
import WebKit

final class TrackerAssetHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "eo-local"
    static let entryURL = URL(string: "eo-local://app/index.html")!
    let root: URL
    init(root: URL) { self.root = root.resolvingSymlinksInPath().standardizedFileURL }
    static func isLocal(_ url: URL) -> Bool {
        url.scheme == scheme && url.host == "app" && url.user == nil && url.password == nil && url.port == nil
    }
    func resourceURL(for url: URL) -> URL? {
        guard Self.isLocal(url), let path = url.path.removingPercentEncoding,
              !path.contains("\\"), !path.split(separator: "/").contains("..") else { return nil }
        let target = root.appendingPathComponent(path == "/" ? "index.html" : String(path.dropFirst())).resolvingSymlinksInPath().standardizedFileURL
        guard target.path.hasPrefix(root.path + "/") else { return nil }
        return target
    }
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard urlSchemeTask.request.httpMethod == "GET", let url = urlSchemeTask.request.url, let file = resourceURL(for: url),
              let data = try? Data(contentsOf: file) else {
            urlSchemeTask.didFailWithError(URLError(.fileDoesNotExist)); return
        }
        let types = ["html": "text/html", "js": "application/javascript", "css": "text/css", "json": "application/json", "png": "image/png", "jpg": "image/jpeg", "svg": "image/svg+xml", "ttf": "font/ttf", "otf": "font/otf", "woff2": "font/woff2"]
        let mime = types[file.pathExtension] ?? "application/octet-stream"
        guard let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": mime, "Content-Length": String(data.count), "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache"]) else { urlSchemeTask.didFailWithError(URLError(.badServerResponse)); return }
        urlSchemeTask.didReceive(response); urlSchemeTask.didReceive(data); urlSchemeTask.didFinish()
    }
    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}
