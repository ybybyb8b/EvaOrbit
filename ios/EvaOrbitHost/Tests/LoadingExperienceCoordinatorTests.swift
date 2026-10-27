import XCTest
import UIKit
@testable import EvaOrbitHost

@MainActor
final class LoadingExperienceCoordinatorTests: XCTestCase {
    func testLocalFastLaunchDismissesWithoutWaitingForAnIntroOrAnOrbit() {
        let overlay = LoadingOverlayView(launchStyle: .local)
        overlay.frame = CGRect(x: 0, y: 0, width: 402, height: 874)
        let coordinator = LoadingExperienceCoordinator(presenter: overlay, waitsForIntro: true)
        coordinator.startColdLaunch()
        XCTAssertEqual(coordinator.state, .waitingForWebView)
        XCTAssertFalse(overlay.isHidden)
        coordinator.webViewDidBecomeReady()
        coordinator.webViewDidBecomeReady()
        XCTAssertEqual(coordinator.state, .dismissed)
        XCTAssertTrue(overlay.isHidden)
        XCTAssertFalse(overlay.isUserInteractionEnabled)
    }

    func testLocalSlowLaunchNeverRevealsAnUnreadyPage() {
        let presenter = LoadingPresenterSpy()
        let coordinator = LoadingExperienceCoordinator(presenter: presenter, waitsForIntro: true)
        coordinator.startColdLaunch()
        presenter.finishIntro()
        XCTAssertEqual(coordinator.state, .waitingForWebView)
        XCTAssertEqual(presenter.dismissCount, 0)
        coordinator.webViewDidBecomeReady()
        XCTAssertEqual(presenter.dismissCount, 1)
    }

    func testLocalFailureAndRetryDoNotWaitForOrReplayTheColdIntro() {
        let presenter = LoadingPresenterSpy()
        let coordinator = LoadingExperienceCoordinator(presenter: presenter, waitsForIntro: true)
        coordinator.startColdLaunch()
        coordinator.webViewDidBecomeReady()
        coordinator.fail()
        presenter.finishIntro()
        XCTAssertEqual(coordinator.state, .failure)
        XCTAssertEqual(presenter.dismissCount, 0)
        coordinator.beginRecovery()
        coordinator.webViewDidBecomeReady()
        XCTAssertEqual(presenter.dismissCount, 1)
        XCTAssertEqual(presenter.introCount, 1)
    }

    func testLocalOrbitMovesOnlyThePlanetUntilStoppedAndReducedMotionIsStatic() {
        let artwork = OrbitArtworkView(palette: .current())
        artwork.frame = CGRect(x: 0, y: 0, width: 260, height: 177)
        artwork.layoutIfNeeded()
        func animatedLayers(_ layer: CALayer) -> [CALayer] {
            (layer.animationKeys()?.isEmpty == false ? [layer] : []) + (layer.sublayers ?? []).flatMap { animatedLayers($0) }
        }
        artwork.beginQuietLoop(reduceMotion: false, planetOnly: true)
        let layers = animatedLayers(artwork.layer)
        XCTAssertEqual(layers.count, 1)
        let orbit = layers.first?.animation(forKey: "quietOrbit") as? CAKeyframeAnimation
        XCTAssertEqual(orbit?.keyPath, "position")
        XCTAssertEqual(orbit?.repeatCount, Float.infinity)
        XCTAssertNotNil(orbit?.path)
        artwork.stopAnimations()
        XCTAssertTrue(animatedLayers(artwork.layer).isEmpty)
        artwork.beginQuietLoop(reduceMotion: true, planetOnly: true)
        XCTAssertTrue(animatedLayers(artwork.layer).isEmpty)
        artwork.beginQuietLoop(reduceMotion: false)
        XCTAssertEqual(animatedLayers(artwork.layer).count, 2, "Online Host keeps its original quiet motion")
    }

    func testFastWebViewDismissesImmediatelyAndIgnoresRepeatedReadyAndStaleIntroCompletion() {
        let presenter = LoadingPresenterSpy()
        let coordinator = LoadingExperienceCoordinator(presenter: presenter)

        coordinator.startColdLaunch()
        coordinator.webViewDidBecomeReady()

        XCTAssertEqual(coordinator.state, .readyToDismiss)
        XCTAssertEqual(presenter.dismissCount, 1)

        coordinator.webViewDidBecomeReady()
        XCTAssertEqual(presenter.dismissCount, 1)

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
