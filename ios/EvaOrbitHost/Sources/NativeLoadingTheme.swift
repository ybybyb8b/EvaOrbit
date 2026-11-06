import UIKit

enum LoadingThemeToken: String, CaseIterable {
    case background = "LoadingBackground"
    case primary = "LoadingPrimary"
    case accent = "LoadingAccent"
    case text = "LoadingText"
    case secondaryText = "LoadingSecondaryText"
    case buttonBackground = "LoadingButtonBackground"
    case buttonText = "LoadingButtonText"
}

enum NativeAppearanceMode: String {
    case system
    case light
    case dark

    var interfaceStyle: UIUserInterfaceStyle {
        switch self {
        case .system: return .unspecified
        case .light: return .light
        case .dark: return .dark
        }
    }
}

enum NativeLoadingTheme {
    static let appearancePreferenceKey = "evaorbit.nativeAppearanceMode"

    static var currentAppearanceMode: NativeAppearanceMode {
        get {
            guard let value = UserDefaults.standard.string(forKey: appearancePreferenceKey) else { return .system }
            return NativeAppearanceMode(rawValue: value) ?? .system
        }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: appearancePreferenceKey) }
    }
}

struct LoadingThemePalette {
    let loadingBackground: UIColor
    let loadingPrimary: UIColor
    let loadingAccent: UIColor
    let loadingText: UIColor
    let loadingSecondaryText: UIColor
    let loadingButtonBackground: UIColor
    let loadingButtonText: UIColor

    static func current(bundle: Bundle = .main) -> LoadingThemePalette {
        LoadingThemePalette(
            loadingBackground: color(.background, bundle: bundle),
            loadingPrimary: color(.primary, bundle: bundle),
            loadingAccent: color(.accent, bundle: bundle),
            loadingText: color(.text, bundle: bundle),
            loadingSecondaryText: color(.secondaryText, bundle: bundle),
            loadingButtonBackground: color(.buttonBackground, bundle: bundle),
            loadingButtonText: color(.buttonText, bundle: bundle)
        )
    }

    private static func color(_ token: LoadingThemeToken, bundle: Bundle) -> UIColor {
        let name = token.rawValue
        guard let color = UIColor(named: name, in: bundle, compatibleWith: nil) else {
            preconditionFailure("Missing native loading theme color asset: \(name)")
        }
        return color
    }
}
