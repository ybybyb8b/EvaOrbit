import Foundation

enum LoadingExperienceState: Equatable {
    case introPlaying
    case waitingForWebView
    case readyToDismiss
    case failure
    case dismissed
}

@MainActor
protocol LoadingExperiencePresenting: AnyObject {
    func playIntro(completion: @escaping () -> Void)
    func beginQuietLoop()
    func showRecoveryLoading()
    func showFailure()
    func dismiss(completion: @escaping () -> Void)
}

@MainActor
final class LoadingExperienceCoordinator {
    private(set) var state: LoadingExperienceState = .dismissed
    private weak var presenter: LoadingExperiencePresenting?
    private var dismissalStarted = false

    init(presenter: LoadingExperiencePresenting) {
        self.presenter = presenter
    }

    func startColdLaunch() {
        guard state == .dismissed else { return }
        dismissalStarted = false
        state = .introPlaying
        presenter?.playIntro { [weak self] in self?.introReachedNaturalEnd() }
    }

    func webViewDidBecomeReady() {
        switch state {
        case .introPlaying:
            state = .readyToDismiss
            dismissOnce()
        case .waitingForWebView:
            state = .readyToDismiss
            dismissOnce()
        case .readyToDismiss, .failure, .dismissed:
            break
        }
    }

    func beginRecovery() {
        dismissalStarted = false
        state = .waitingForWebView
        presenter?.showRecoveryLoading()
    }

    func fail() {
        guard state != .failure else { return }
        dismissalStarted = false
        state = .failure
        presenter?.showFailure()
    }

    private func introReachedNaturalEnd() {
        switch state {
        case .introPlaying:
            state = .waitingForWebView
            presenter?.beginQuietLoop()
        case .readyToDismiss:
            dismissOnce()
        case .waitingForWebView, .failure, .dismissed:
            break
        }
    }

    private func dismissOnce() {
        guard !dismissalStarted else { return }
        dismissalStarted = true
        presenter?.dismiss { [weak self] in
            guard let self else { return }
            guard self.state == .readyToDismiss else { return }
            self.state = .dismissed
        }
    }
}
