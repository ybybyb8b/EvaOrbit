import XCTest
@testable import EvaOrbitNative

final class APIClientTests: XCTestCase {
    func testBuildsNativeSessionURLFromConfiguredOrigin() throws {
        let configuration = try APIConfiguration(baseURLString: "https://eva-orbit.vercel.app")
        XCTAssertEqual(configuration.sessionURL.absoluteString, "https://eva-orbit.vercel.app/api/native/session")
    }

    func testRejectsInsecureOrCredentialBearingServerURLs() {
        XCTAssertThrowsError(try APIConfiguration(baseURLString: "http://eva-orbit.vercel.app"))
        XCTAssertThrowsError(try APIConfiguration(baseURLString: "https://user:password@example.com"))
        XCTAssertThrowsError(try APIConfiguration(baseURLString: "not a url"))
    }
}
