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

enum NativeThemeIdentifier: String {
    case editorial
    case rosewood
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
    static let themePreferenceKey = "evaorbit.nativeThemeIdentifier"
    static let appearancePreferenceKey = "evaorbit.nativeAppearanceMode"

    static var currentIdentifier: NativeThemeIdentifier {
        get {
            guard let value = UserDefaults.standard.string(forKey: themePreferenceKey) else { return .editorial }
            return NativeThemeIdentifier(rawValue: value) ?? .editorial
        }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: themePreferenceKey) }
    }

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
        palette(identifier: NativeLoadingTheme.currentIdentifier, bundle: bundle)
    }

    static func palette(identifier: NativeThemeIdentifier, bundle: Bundle = .main) -> LoadingThemePalette {
        LoadingThemePalette(
            loadingBackground: color(.background, identifier: identifier, bundle: bundle),
            loadingPrimary: color(.primary, identifier: identifier, bundle: bundle),
            loadingAccent: color(.accent, identifier: identifier, bundle: bundle),
            loadingText: color(.text, identifier: identifier, bundle: bundle),
            loadingSecondaryText: color(.secondaryText, identifier: identifier, bundle: bundle),
            loadingButtonBackground: color(.buttonBackground, identifier: identifier, bundle: bundle),
            loadingButtonText: color(.buttonText, identifier: identifier, bundle: bundle)
        )
    }

    static func assetName(for token: LoadingThemeToken, identifier: NativeThemeIdentifier) -> String {
        switch identifier {
        case .editorial: return token.rawValue
        case .rosewood: return "Rosewood\(token.rawValue)"
        }
    }

    private static func color(_ token: LoadingThemeToken, identifier: NativeThemeIdentifier, bundle: Bundle) -> UIColor {
        let name = assetName(for: token, identifier: identifier)
        guard let color = UIColor(named: name, in: bundle, compatibleWith: nil) else {
            preconditionFailure("Missing native loading theme color asset: \(name)")
        }
        return color
    }
}
