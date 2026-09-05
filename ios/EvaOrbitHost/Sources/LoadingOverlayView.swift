import UIKit

final class LoadingOverlayView: UIView, LoadingExperiencePresenting {
    enum Timing {
        static let introDuration: TimeInterval = 2.0
        static let reducedMotionIntroDuration: TimeInterval = 1.65
        static let wordmarkDelay: TimeInterval = 1.35
        static let wordmarkDuration: TimeInterval = 0.60
        static let exitDuration: TimeInterval = 0.20
    }

    var onRetry: (() -> Void)?

    private let palette: LoadingThemePalette
    private let artworkView: OrbitArtworkView
    private let failureArtworkView: OrbitArtworkView
    private let wordmarkLabel = UILabel()
    private let brandContainer = UIView()
    private let failureContainer = UIStackView()
    private let failureTitleLabel = UILabel()
    private let failureMessageLabel = UILabel()
    private let retryButton = UIButton(type: .system)
    private var animationGeneration = 0

    init(palette: LoadingThemePalette = .current()) {
        self.palette = palette
        artworkView = OrbitArtworkView(palette: palette)
        failureArtworkView = OrbitArtworkView(palette: palette)
        super.init(frame: .zero)
        accessibilityViewIsModal = true
        configureBrand()
        configureFailure()
        applyTheme()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        if previousTraitCollection?.hasDifferentColorAppearance(comparedTo: traitCollection) == true { applyTheme() }
    }

    func playIntro(completion: @escaping () -> Void) {
        animationGeneration += 1
        let generation = animationGeneration
        prepareToShow()
        failureContainer.isHidden = true
        brandContainer.isHidden = false
        brandContainer.alpha = 1
        brandContainer.transform = .identity
        artworkView.prepareForIntro()
        wordmarkLabel.alpha = 0
        let reduceMotion = UIAccessibility.isReduceMotionEnabled
        wordmarkLabel.transform = reduceMotion ? .identity : CGAffineTransform(translationX: 0, y: 4)
        artworkView.playIntro(reduceMotion: reduceMotion)
        UIView.animate(
            withDuration: Timing.wordmarkDuration,
            delay: reduceMotion ? 0.72 : Timing.wordmarkDelay,
            options: [.curveEaseInOut, .beginFromCurrentState],
            animations: {
                self.wordmarkLabel.alpha = 1
                self.wordmarkLabel.transform = .identity
            }
        )
        let duration = reduceMotion ? Timing.reducedMotionIntroDuration : Timing.introDuration
        DispatchQueue.main.asyncAfter(deadline: .now() + duration) { [weak self] in
            guard let self, self.animationGeneration == generation else { return }
            completion()
        }
    }

    func beginQuietLoop() {
        artworkView.beginQuietLoop(reduceMotion: UIAccessibility.isReduceMotionEnabled)
    }

    func showRecoveryLoading() {
        animationGeneration += 1
        prepareToShow()
        failureContainer.isHidden = true
        brandContainer.isHidden = false
        brandContainer.alpha = 1
        brandContainer.transform = .identity
        wordmarkLabel.alpha = 1
        wordmarkLabel.transform = .identity
        artworkView.beginQuietLoop(reduceMotion: UIAccessibility.isReduceMotionEnabled)
        UIAccessibility.post(notification: .announcement, argument: "EvaOrbit is loading")
    }

    func showFailure() {
        animationGeneration += 1
        let generation = animationGeneration
        prepareToShow()
        artworkView.stopAnimations()
        failureContainer.isHidden = false
        failureContainer.layoutIfNeeded()
        failureArtworkView.showCompleteArtwork()
        failureArtworkView.stopAnimations()
        failureContainer.alpha = 0
        brandContainer.alpha = 1
        UIView.animate(
            withDuration: 0.24,
            delay: 0,
            options: [.curveEaseInOut, .beginFromCurrentState],
            animations: {
                self.brandContainer.alpha = 0
                self.failureContainer.alpha = 1
            },
            completion: { _ in
                guard self.animationGeneration == generation else { return }
                self.brandContainer.isHidden = true
            }
        )
        UIAccessibility.post(notification: .screenChanged, argument: failureTitleLabel)
    }

    func dismiss(completion: @escaping () -> Void) {
        animationGeneration += 1
        let generation = animationGeneration
        artworkView.stopAnimations(preservingVisibleState: true)
        let reduceMotion = UIAccessibility.isReduceMotionEnabled
        UIView.animate(
            withDuration: Timing.exitDuration,
            delay: 0,
            options: [.curveEaseOut, .beginFromCurrentState],
            animations: {
                self.alpha = 0
                self.transform = reduceMotion ? .identity : CGAffineTransform(scaleX: 0.985, y: 0.985)
            },
            completion: { _ in
                guard self.animationGeneration == generation else { return }
                self.isHidden = true
                self.isUserInteractionEnabled = false
                self.accessibilityViewIsModal = false
                completion()
            }
        )
    }

    private func configureBrand() {
        brandContainer.translatesAutoresizingMaskIntoConstraints = false
        artworkView.translatesAutoresizingMaskIntoConstraints = false
        wordmarkLabel.translatesAutoresizingMaskIntoConstraints = false
        wordmarkLabel.textAlignment = .center
        wordmarkLabel.adjustsFontForContentSizeCategory = false
        let font = UIFont(name: "Didot", size: 15) ?? UIFont(name: "TimesNewRomanPSMT", size: 15) ?? .systemFont(ofSize: 15, weight: .regular)
        wordmarkLabel.attributedText = NSAttributedString(string: "EvaOrbit", attributes: [.font: font, .kern: 5.5])

        brandContainer.addSubview(artworkView)
        brandContainer.addSubview(wordmarkLabel)
        addSubview(brandContainer)
        let preferredArtworkWidth = artworkView.widthAnchor.constraint(equalToConstant: 260)
        preferredArtworkWidth.priority = .defaultHigh
        NSLayoutConstraint.activate([
            brandContainer.centerXAnchor.constraint(equalTo: safeAreaLayoutGuide.centerXAnchor),
            brandContainer.centerYAnchor.constraint(equalTo: safeAreaLayoutGuide.centerYAnchor, constant: -8),
            brandContainer.leadingAnchor.constraint(greaterThanOrEqualTo: safeAreaLayoutGuide.leadingAnchor, constant: 28),
            brandContainer.trailingAnchor.constraint(lessThanOrEqualTo: safeAreaLayoutGuide.trailingAnchor, constant: -28),
            artworkView.topAnchor.constraint(equalTo: brandContainer.topAnchor),
            artworkView.centerXAnchor.constraint(equalTo: brandContainer.centerXAnchor),
            artworkView.leadingAnchor.constraint(equalTo: brandContainer.leadingAnchor),
            artworkView.trailingAnchor.constraint(equalTo: brandContainer.trailingAnchor),
            artworkView.widthAnchor.constraint(lessThanOrEqualTo: safeAreaLayoutGuide.widthAnchor, multiplier: 0.68),
            preferredArtworkWidth,
            artworkView.heightAnchor.constraint(equalTo: artworkView.widthAnchor, multiplier: 0.68),
            wordmarkLabel.topAnchor.constraint(equalTo: artworkView.bottomAnchor, constant: 15),
            wordmarkLabel.leadingAnchor.constraint(equalTo: brandContainer.leadingAnchor),
            wordmarkLabel.trailingAnchor.constraint(equalTo: brandContainer.trailingAnchor),
            wordmarkLabel.bottomAnchor.constraint(equalTo: brandContainer.bottomAnchor),
        ])
    }

    private func configureFailure() {
        failureContainer.translatesAutoresizingMaskIntoConstraints = false
        failureContainer.axis = .vertical
        failureContainer.alignment = .center
        failureContainer.spacing = 10
        failureContainer.isHidden = true

        failureArtworkView.translatesAutoresizingMaskIntoConstraints = false
        failureTitleLabel.text = "Connection failed"
        failureTitleLabel.font = UIFont(name: "Didot", size: 25) ?? UIFont(name: "TimesNewRomanPSMT", size: 25) ?? .systemFont(ofSize: 25, weight: .medium)
        failureTitleLabel.textAlignment = .center
        failureTitleLabel.adjustsFontForContentSizeCategory = true
        failureMessageLabel.text = "Please check your connection\nand try again."
        failureMessageLabel.font = UIFont.preferredFont(forTextStyle: .subheadline)
        failureMessageLabel.adjustsFontForContentSizeCategory = true
        failureMessageLabel.textAlignment = .center
        failureMessageLabel.numberOfLines = 0

        retryButton.setTitle("Retry", for: .normal)
        retryButton.titleLabel?.font = UIFont.preferredFont(forTextStyle: .headline)
        retryButton.layer.cornerRadius = 12
        retryButton.contentEdgeInsets = UIEdgeInsets(top: 12, left: 26, bottom: 12, right: 26)
        retryButton.addTarget(self, action: #selector(retryTapped), for: .touchUpInside)
        retryButton.accessibilityIdentifier = "native-loading-retry"

        failureContainer.addArrangedSubview(failureArtworkView)
        failureContainer.addArrangedSubview(failureTitleLabel)
        failureContainer.setCustomSpacing(7, after: failureTitleLabel)
        failureContainer.addArrangedSubview(failureMessageLabel)
        failureContainer.setCustomSpacing(21, after: failureMessageLabel)
        failureContainer.addArrangedSubview(retryButton)
        addSubview(failureContainer)
        NSLayoutConstraint.activate([
            failureContainer.centerXAnchor.constraint(equalTo: safeAreaLayoutGuide.centerXAnchor),
            failureContainer.centerYAnchor.constraint(equalTo: safeAreaLayoutGuide.centerYAnchor),
            failureContainer.leadingAnchor.constraint(greaterThanOrEqualTo: safeAreaLayoutGuide.leadingAnchor, constant: 36),
            failureContainer.trailingAnchor.constraint(lessThanOrEqualTo: safeAreaLayoutGuide.trailingAnchor, constant: -36),
            failureArtworkView.widthAnchor.constraint(equalToConstant: 118),
            failureArtworkView.heightAnchor.constraint(equalToConstant: 82),
        ])
    }

    private func prepareToShow() {
        layer.removeAllAnimations()
        isHidden = false
        isUserInteractionEnabled = true
        accessibilityViewIsModal = true
        alpha = 1
        transform = .identity
        backgroundColor = palette.loadingBackground
        superview?.bringSubviewToFront(self)
        layoutIfNeeded()
    }

    private func applyTheme() {
        backgroundColor = palette.loadingBackground
        wordmarkLabel.textColor = palette.loadingText
        failureTitleLabel.textColor = palette.loadingText
        failureMessageLabel.textColor = palette.loadingSecondaryText
        retryButton.backgroundColor = palette.loadingButtonBackground
        retryButton.setTitleColor(palette.loadingButtonText, for: .normal)
    }

    @objc private func retryTapped() {
        onRetry?()
    }
}
