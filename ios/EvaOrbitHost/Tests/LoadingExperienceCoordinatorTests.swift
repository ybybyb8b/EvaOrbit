import XCTest
@testable import EvaOrbitHost

@MainActor
final class LoadingExperienceCoordinatorTests: XCTestCase {
    func testFastWebViewWaitsForIntroNaturalEndThenDismissesOnce() {
        let presenter = LoadingPresenterSpy()
        let coordinator = LoadingExperienceCoordinator(presenter: presenter)

        coordinator.startColdLaunch()
        coordinator.webViewDidBecomeReady()
        coordinator.webViewDidBecomeReady()

        XCTAssertEqual(coordinator.state, .readyToDismiss)
        XCTAssertEqual(presenter.dismissCount, 0)
        presenter.finishIntro()
        XCTAssertEqual(presenter.dismissCount, 1)
        presenter.finishDismissal()
        XCTAssertEqual(coordinator.state, .dismissed)
    }

    func testSlowWebViewEntersQuietLoopAndDismissesWhenReady() {
        let presenter = LoadingPresenterSpy()
        let coordinator = LoadingExperienceCoordinator(presenter: presenter)

        coordinator.startColdLaunch()
        presenter.finishIntro()

        XCTAssertEqual(coordinator.state, .waitingForWebView)
        XCTAssertEqual(presenter.quietLoopCount, 1)
        coordinator.webViewDidBecomeReady()
        XCTAssertEqual(presenter.dismissCount, 1)
    }

    func testFailureStopsIntroAndRetryUsesRecoveryInsteadOfReplayingIntro() {
        let presenter = LoadingPresenterSpy()
        let coordinator = LoadingExperienceCoordinator(presenter: presenter)

        coordinator.startColdLaunch()
        coordinator.fail()
        presenter.finishIntro()
        XCTAssertEqual(coordinator.state, .failure)
        XCTAssertEqual(presenter.failureCount, 1)

        coordinator.beginRecovery()
        XCTAssertEqual(coordinator.state, .waitingForWebView)
        XCTAssertEqual(presenter.recoveryCount, 1)
        XCTAssertEqual(presenter.introCount, 1)
    }

    func testFailureCanBeShownAfterInitialOverlayWasDismissed() {
        let presenter = LoadingPresenterSpy()
        let coordinator = LoadingExperienceCoordinator(presenter: presenter)

        coordinator.fail()

        XCTAssertEqual(coordinator.state, .failure)
        XCTAssertEqual(presenter.failureCount, 1)
    }

    func testRecoveryIgnoresAStaleDismissalCompletion() {
        let presenter = LoadingPresenterSpy()
        let coordinator = LoadingExperienceCoordinator(presenter: presenter)

        coordinator.startColdLaunch()
        presenter.finishIntro()
        coordinator.webViewDidBecomeReady()
        XCTAssertEqual(presenter.dismissCount, 1)

        coordinator.beginRecovery()
        presenter.finishDismissal()

        XCTAssertEqual(coordinator.state, .waitingForWebView)
    }
}

@MainActor
private final class LoadingPresenterSpy: LoadingExperiencePresenting {
    var introCount = 0
    var quietLoopCount = 0
    var recoveryCount = 0
    var failureCount = 0
    var dismissCount = 0
    private var introCompletion: (() -> Void)?
    private var dismissalCompletion: (() -> Void)?

    func playIntro(completion: @escaping () -> Void) {
        introCount += 1
        introCompletion = completion
    }

    func beginQuietLoop() { quietLoopCount += 1 }
    func showRecoveryLoading() { recoveryCount += 1 }
    func showFailure() { failureCount += 1 }

    func dismiss(completion: @escaping () -> Void) {
        dismissCount += 1
        dismissalCompletion = completion
    }

    func finishIntro() { introCompletion?() }
    func finishDismissal() { dismissalCompletion?() }
}
