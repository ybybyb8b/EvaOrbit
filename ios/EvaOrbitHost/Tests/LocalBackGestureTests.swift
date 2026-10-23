import XCTest
import UIKit
@testable import EvaOrbitHost

@MainActor
final class LocalBackGestureTests: XCTestCase {
    func testDraggingTracksTheFingerAndCanResumeFromTheReturningPosition() {
        XCTAssertEqual(WebViewController.localBackOffset(translation: 80, startingOffset: 0, width: 402), 80)
        XCTAssertEqual(WebViewController.localBackOffset(translation: -20, startingOffset: 80, width: 402), 60)
        XCTAssertEqual(WebViewController.localBackOffset(translation: -100, startingOffset: 80, width: 402), 0)
        XCTAssertEqual(WebViewController.localBackOffset(translation: 500, startingOffset: 0, width: 402), 402)
    }
    func testBackRequiresAnIntentionalRightwardSwipe() {
        let accepts = { (x: CGFloat, y: CGFloat, velocity: CGFloat) in
            WebViewController.shouldCommitLocalBack(translation: CGPoint(x: x, y: y), velocity: CGPoint(x: velocity, y: 0), width: 402)
        }
        XCTAssertTrue(accepts(140, 5, 0))
        XCTAssertTrue(accepts(30, 3, 700))
        XCTAssertFalse(accepts(50, 2, 100), "A short slow swipe stays on the page")
        XCTAssertFalse(accepts(10, 0, 800), "Tiny edge touches do not navigate")
        XCTAssertFalse(accepts(140, 180, 700), "Vertical scrolling does not navigate")
        XCTAssertFalse(accepts(-140, 0, 700))
        XCTAssertFalse(accepts(140, 0, -200), "Reversing direction cancels the back intent")
    }
}
