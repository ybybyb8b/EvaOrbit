import UIKit

enum HapticFeedbackKind: String, CaseIterable {
    case selection
    case light
    case medium
    case success
    case warning
    case error
}

final class HapticFeedbackManager {
    private lazy var selectionGenerator = UISelectionFeedbackGenerator()
    private lazy var lightGenerator = UIImpactFeedbackGenerator(style: .light)
    private lazy var mediumGenerator = UIImpactFeedbackGenerator(style: .medium)
    private lazy var notificationGenerator = UINotificationFeedbackGenerator()
    private var lastFeedback: (kind: HapticFeedbackKind, time: TimeInterval)?

    func play(_ kind: HapticFeedbackKind) {
        let now = ProcessInfo.processInfo.systemUptime
        if let lastFeedback,
           lastFeedback.kind == kind,
           now - lastFeedback.time < minimumInterval(for: kind) {
            return
        }
        lastFeedback = (kind, now)

        switch kind {
        case .selection:
            selectionGenerator.selectionChanged()
            selectionGenerator.prepare()
        case .light:
            lightGenerator.impactOccurred(intensity: 0.72)
            lightGenerator.prepare()
        case .medium:
            mediumGenerator.impactOccurred(intensity: 0.82)
            mediumGenerator.prepare()
        case .success:
            notificationGenerator.notificationOccurred(.success)
            notificationGenerator.prepare()
        case .warning:
            notificationGenerator.notificationOccurred(.warning)
            notificationGenerator.prepare()
        case .error:
            notificationGenerator.notificationOccurred(.error)
            notificationGenerator.prepare()
        }
    }

    private func minimumInterval(for kind: HapticFeedbackKind) -> TimeInterval {
        kind == .selection ? 0.045 : 0.12
    }
}
