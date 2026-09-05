import UIKit

final class OrbitArtworkView: UIView {
    private let palette: LoadingThemePalette
    private let orbitContainer = CALayer()
    private let orbitLayers = [CAShapeLayer(), CAShapeLayer(), CAShapeLayer()]
    private let planetLayer = CAShapeLayer()
    private let starLayers = [CAShapeLayer(), CAShapeLayer(), CAShapeLayer(), CAShapeLayer()]
    private let coreContainer = CALayer()
    private let coreImageLayer = CALayer()
    private var lastLayoutBounds = CGRect.zero
    private var quietLoopActive = false
    private var reduceMotionForLoop = false

    init(palette: LoadingThemePalette) {
        self.palette = palette
        super.init(frame: .zero)
        isAccessibilityElement = true
        accessibilityLabel = "EvaOrbit"
        isUserInteractionEnabled = false
        configureLayers()
        configureCore()
        applyTheme()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard bounds.width > 0, bounds.height > 0, bounds != lastLayoutBounds else { return }
        lastLayoutBounds = bounds
        orbitContainer.frame = bounds
        updatePaths()
        if quietLoopActive { addQuietLoopAnimations(reduceMotion: reduceMotionForLoop) }
    }

    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        if previousTraitCollection?.hasDifferentColorAppearance(comparedTo: traitCollection) == true { applyTheme() }
    }

    func prepareForIntro() {
        quietLoopActive = false
        stopAnimations()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        orbitLayers.forEach { $0.strokeEnd = 0; $0.opacity = 0 }
        planetLayer.opacity = 0
        starLayers.forEach { $0.opacity = 0 }
        coreContainer.opacity = 0
        coreContainer.setAffineTransform(
            UIAccessibility.isReduceMotionEnabled ? .identity : CGAffineTransform(scaleX: 0.97, y: 0.97)
        )
        CATransaction.commit()
    }

    func playIntro(reduceMotion: Bool) {
        layoutIfNeeded()
        let now = layer.convertTime(CACurrentMediaTime(), from: nil)
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        for (index, orbit) in orbitLayers.enumerated() {
            orbit.strokeEnd = 1
            orbit.opacity = index == 2 ? 0.48 : 0.82
        }
        planetLayer.opacity = 1
        planetLayer.position = OrbitGeometry.point(in: bounds, descriptor: .primary, angle: 0.38)
        for (index, star) in starLayers.enumerated() { star.opacity = index < 2 ? 0.82 : 0.58 }
        coreContainer.opacity = 1
        coreContainer.setAffineTransform(.identity)
        CATransaction.commit()
        if reduceMotion {
            orbitLayers.forEach { orbit in
                orbit.add(Self.opacityAnimation(from: 0, to: orbit.opacity, beginTime: now + 0.35, duration: 0.6), forKey: "introFade")
            }
        } else {
            let starts = [0.35, 0.48, 0.60]
            for (index, orbit) in orbitLayers.enumerated() {
                let targetOpacity: Float = index == 2 ? 0.48 : 0.82
                let draw = CABasicAnimation(keyPath: "strokeEnd")
                draw.fromValue = 0
                draw.toValue = 1
                let fade = CABasicAnimation(keyPath: "opacity")
                fade.fromValue = 0
                fade.toValue = targetOpacity
                let group = CAAnimationGroup()
                group.animations = [draw, fade]
                group.beginTime = now + starts[index]
                group.duration = 0.62
                group.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
                group.fillMode = .backwards
                orbit.add(group, forKey: "introDraw")
            }
        }

        let coreOpacity = CABasicAnimation(keyPath: "opacity")
        coreOpacity.fromValue = 0
        coreOpacity.toValue = 1
        if reduceMotion {
            coreOpacity.beginTime = now + 0.72
            coreOpacity.duration = 0.53
            coreOpacity.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            coreOpacity.fillMode = .backwards
            coreContainer.add(coreOpacity, forKey: "introCoreFade")
        } else {
            coreOpacity.duration = 0.53
            let coreScale = CABasicAnimation(keyPath: "transform.scale")
            coreScale.fromValue = 0.97
            coreScale.toValue = 1
            coreScale.duration = 0.53
            let coreReveal = CAAnimationGroup()
            coreReveal.animations = [coreOpacity, coreScale]
            coreReveal.beginTime = now + 0.72
            coreReveal.duration = 0.53
            coreReveal.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            coreReveal.fillMode = .backwards
            coreContainer.add(coreReveal, forKey: "introCore")
        }

        if reduceMotion {
            planetLayer.add(Self.opacityAnimation(from: 0, to: 1, beginTime: now + 1.0, duration: 0.7), forKey: "introPlanetFade")
        } else {
            let motion = CAKeyframeAnimation(keyPath: "position")
            motion.path = OrbitGeometry.path(in: bounds, descriptor: .primary, startAngle: -0.55, endAngle: 0.38)
            motion.calculationMode = .paced
            let fade = CABasicAnimation(keyPath: "opacity")
            fade.fromValue = 0
            fade.toValue = 1
            let group = CAAnimationGroup()
            group.animations = [motion, fade]
            group.beginTime = now + 1.0
            group.duration = 0.75
            group.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            group.fillMode = .backwards
            planetLayer.add(group, forKey: "introPlanet")
        }

        for (index, star) in starLayers.enumerated() {
            star.add(Self.opacityAnimation(from: 0, to: star.opacity, beginTime: now + 1.35 + Double(index) * 0.08, duration: 0.35), forKey: "introStar")
        }
    }

    func showCompleteArtwork() {
        quietLoopActive = false
        stopAnimations()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        for (index, orbit) in orbitLayers.enumerated() {
            orbit.strokeEnd = 1
            orbit.opacity = index == 2 ? 0.48 : 0.82
        }
        planetLayer.opacity = 1
        planetLayer.position = OrbitGeometry.point(in: bounds, descriptor: .primary, angle: 0.38)
        for (index, star) in starLayers.enumerated() { star.opacity = index < 2 ? 0.82 : 0.58 }
        coreContainer.opacity = 1
        coreContainer.setAffineTransform(.identity)
        CATransaction.commit()
    }

    func beginQuietLoop(reduceMotion: Bool) {
        showCompleteArtwork()
        quietLoopActive = true
        reduceMotionForLoop = reduceMotion
        addQuietLoopAnimations(reduceMotion: reduceMotion)
    }

    func stopAnimations(preservingVisibleState: Bool = false) {
        if preservingVisibleState { freezePresentationState() }
        layer.removeAllAnimations()
        orbitContainer.removeAllAnimations()
        orbitLayers.forEach { $0.removeAllAnimations() }
        planetLayer.removeAllAnimations()
        starLayers.forEach { $0.removeAllAnimations() }
        coreContainer.removeAllAnimations()
        quietLoopActive = false
    }

    private func configureLayers() {
        layer.addSublayer(orbitContainer)
        for (index, orbit) in orbitLayers.enumerated() {
            orbit.fillColor = UIColor.clear.cgColor
            orbit.lineWidth = index == 0 ? 0.9 : 0.7
            orbit.lineCap = .round
            if index == 2 { orbit.lineDashPattern = [2, 3] }
            orbitContainer.addSublayer(orbit)
        }
        planetLayer.bounds = CGRect(x: 0, y: 0, width: 12, height: 12)
        planetLayer.path = UIBezierPath(ovalIn: planetLayer.bounds).cgPath
        orbitContainer.addSublayer(planetLayer)
        starLayers.forEach { layer.addSublayer($0) }
    }

    private func configureCore() {
        coreContainer.bounds = CGRect(x: 0, y: 0, width: 66, height: 66)
        coreImageLayer.frame = coreContainer.bounds
        coreImageLayer.contentsGravity = .resizeAspect
        coreImageLayer.contentsScale = traitCollection.displayScale
        coreImageLayer.minificationFilter = .trilinear
        coreImageLayer.magnificationFilter = .linear
        coreImageLayer.shadowColor = UIColor.black.cgColor
        coreImageLayer.shadowOffset = CGSize(width: 0, height: 3)
        coreImageLayer.shadowRadius = 6
        coreContainer.addSublayer(coreImageLayer)
        layer.addSublayer(coreContainer)
    }

    private func updatePaths() {
        for (index, orbit) in orbitLayers.enumerated() {
            orbit.frame = bounds
            orbit.path = OrbitGeometry.path(in: bounds, descriptor: OrbitDescriptor.all[index])
        }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        planetLayer.position = OrbitGeometry.point(in: bounds, descriptor: .primary, angle: 0.38)
        CATransaction.commit()
        let centers = [
            CGPoint(x: bounds.midX - bounds.width * 0.05, y: bounds.minY + 5),
            CGPoint(x: bounds.midX + bounds.width * 0.09, y: bounds.maxY - 7),
            CGPoint(x: bounds.minX + bounds.width * 0.09, y: bounds.midY - 5),
            CGPoint(x: bounds.maxX - bounds.width * 0.10, y: bounds.midY + 14),
        ]
        for (index, star) in starLayers.enumerated() {
            star.frame = bounds
            star.path = Self.starPath(center: centers[index], radius: index < 2 ? 5 : 2.2)
        }
        let coreBounds = coreContainer.bounds
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        coreContainer.position = CGPoint(x: bounds.midX, y: bounds.midY)
        coreImageLayer.frame = coreBounds
        coreImageLayer.contentsScale = traitCollection.displayScale
        CATransaction.commit()
    }

    private func addQuietLoopAnimations(reduceMotion: Bool) {
        orbitContainer.removeAnimation(forKey: "quietBreathing")
        planetLayer.removeAnimation(forKey: "quietOrbit")
        planetLayer.removeAnimation(forKey: "quietOpacity")
        if reduceMotion {
            let opacity = CABasicAnimation(keyPath: "opacity")
            opacity.fromValue = 1
            opacity.toValue = 0.62
            opacity.duration = 2.8
            opacity.autoreverses = true
            opacity.repeatCount = .infinity
            opacity.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            planetLayer.add(opacity, forKey: "quietOpacity")
            return
        }

        let orbit = CAKeyframeAnimation(keyPath: "position")
        orbit.path = OrbitGeometry.path(in: bounds, descriptor: .primary, startAngle: 0.38, endAngle: 0.38 + 2 * .pi)
        orbit.calculationMode = .paced
        orbit.duration = 6.2
        orbit.repeatCount = .infinity
        planetLayer.add(orbit, forKey: "quietOrbit")

        let breathing = CABasicAnimation(keyPath: "transform.scale")
        breathing.fromValue = 1
        breathing.toValue = 1.008
        breathing.duration = 2.5
        breathing.autoreverses = true
        breathing.repeatCount = .infinity
        breathing.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        orbitContainer.add(breathing, forKey: "quietBreathing")
    }

    private func applyTheme() {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        let primary = palette.loadingPrimary.resolvedColor(with: traitCollection).cgColor
        let resolvedAccent = palette.loadingAccent.resolvedColor(with: traitCollection)
        let accent = resolvedAccent.cgColor
        orbitLayers.forEach { $0.strokeColor = primary }
        planetLayer.fillColor = accent
        for (index, star) in starLayers.enumerated() { star.fillColor = (index == 0 ? accent : primary) }
        let coreImage = UIImage(named: "LoadingCore", in: .main, compatibleWith: traitCollection)
        coreImageLayer.contents = coreImage?.cgImage
        coreImageLayer.contentsScale = traitCollection.displayScale
        coreImageLayer.shadowOpacity = traitCollection.userInterfaceStyle == .dark ? 0.34 : 0.18
        CATransaction.commit()
    }

    private func freezePresentationState() {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        if let presentation = orbitContainer.presentation() { orbitContainer.transform = presentation.transform }
        for orbit in orbitLayers {
            if let presentation = orbit.presentation() {
                orbit.strokeEnd = presentation.strokeEnd
                orbit.opacity = presentation.opacity
            }
        }
        if let presentation = planetLayer.presentation() {
            planetLayer.position = presentation.position
            planetLayer.opacity = presentation.opacity
        }
        for star in starLayers {
            if let presentation = star.presentation() { star.opacity = presentation.opacity }
        }
        if let presentation = coreContainer.presentation() {
            coreContainer.opacity = presentation.opacity
            coreContainer.transform = presentation.transform
        }
        CATransaction.commit()
    }

    private static func opacityAnimation(from: Float, to: Float, beginTime: CFTimeInterval, duration: CFTimeInterval) -> CAAnimation {
        let animation = CABasicAnimation(keyPath: "opacity")
        animation.fromValue = from
        animation.toValue = to
        animation.beginTime = beginTime
        animation.duration = duration
        animation.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        animation.fillMode = .backwards
        return animation
    }

    private static func starPath(center: CGPoint, radius: CGFloat) -> CGPath {
        let path = CGMutablePath()
        path.move(to: CGPoint(x: center.x, y: center.y - radius))
        path.addLine(to: CGPoint(x: center.x + radius * 0.22, y: center.y - radius * 0.22))
        path.addLine(to: CGPoint(x: center.x + radius, y: center.y))
        path.addLine(to: CGPoint(x: center.x + radius * 0.22, y: center.y + radius * 0.22))
        path.addLine(to: CGPoint(x: center.x, y: center.y + radius))
        path.addLine(to: CGPoint(x: center.x - radius * 0.22, y: center.y + radius * 0.22))
        path.addLine(to: CGPoint(x: center.x - radius, y: center.y))
        path.addLine(to: CGPoint(x: center.x - radius * 0.22, y: center.y - radius * 0.22))
        path.closeSubpath()
        return path
    }

}

private struct OrbitDescriptor {
    let widthScale: CGFloat
    let heightScale: CGFloat
    let rotation: CGFloat

    static let primary = OrbitDescriptor(widthScale: 0.88, heightScale: 0.40, rotation: -0.24)
    static let all = [
        primary,
        OrbitDescriptor(widthScale: 0.80, heightScale: 0.58, rotation: 0.25),
        OrbitDescriptor(widthScale: 0.72, heightScale: 0.67, rotation: -0.04),
    ]
}

private enum OrbitGeometry {
    static func path(in bounds: CGRect, descriptor: OrbitDescriptor, startAngle: CGFloat = 0, endAngle: CGFloat = 2 * .pi) -> CGPath {
        let path = CGMutablePath()
        let steps = max(8, Int(abs(endAngle - startAngle) / (2 * .pi) * 120))
        for index in 0...steps {
            let progress = CGFloat(index) / CGFloat(steps)
            let angle = startAngle + (endAngle - startAngle) * progress
            let point = point(in: bounds, descriptor: descriptor, angle: angle)
            if index == 0 { path.move(to: point) } else { path.addLine(to: point) }
        }
        return path
    }

    static func point(in bounds: CGRect, descriptor: OrbitDescriptor, angle: CGFloat) -> CGPoint {
        let radiusX = bounds.width * descriptor.widthScale / 2
        let radiusY = bounds.height * descriptor.heightScale / 2
        let x = cos(angle) * radiusX
        let y = sin(angle) * radiusY
        let rotatedX = x * cos(descriptor.rotation) - y * sin(descriptor.rotation)
        let rotatedY = x * sin(descriptor.rotation) + y * cos(descriptor.rotation)
        return CGPoint(x: bounds.midX + rotatedX, y: bounds.midY + rotatedY)
    }
}
