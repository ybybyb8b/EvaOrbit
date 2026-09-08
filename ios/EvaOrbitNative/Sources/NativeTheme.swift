import SwiftUI
import UIKit

enum EOTheme {
    static let canvas = dynamicColor(light: 0xF5F2E9, dark: 0x0F1110)
    static let card = dynamicColor(light: 0xFBFAF5, dark: 0x191B1A)
    static let raised = dynamicColor(light: 0xFFFEF9, dark: 0x212321)
    static let tint = dynamicColor(light: 0xF0E0E6, dark: 0x35272D)
    static let warm = dynamicColor(light: 0xEBE4D5, dark: 0x292824)
    static let ink = dynamicColor(light: 0x1D2A23, dark: 0xEEEAE4)
    static let secondaryInk = dynamicColor(light: 0x707970, dark: 0xBCB8B2)
    static let accent = dynamicColor(light: 0xA75D78, dark: 0xE0A7B9)
    static let accentOn = dynamicColor(light: 0xFFFFFF, dark: 0x21161A)
    static let success = dynamicColor(light: 0x8F5F72, dark: 0xD8A2B4)

    static let cardRadius: CGFloat = 20
    static let controlRadius: CGFloat = 14

    static func displayFont(_ style: Font.TextStyle = .largeTitle) -> Font {
        .system(style, design: .serif, weight: .semibold)
    }

    private static func dynamicColor(light: UInt32, dark: UInt32) -> Color {
        Color(uiColor: UIColor { traits in
            UIColor(rgb: traits.userInterfaceStyle == .dark ? dark : light)
        })
    }
}

struct EOCard<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(EOTheme.card, in: RoundedRectangle(cornerRadius: EOTheme.cardRadius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: EOTheme.cardRadius, style: .continuous)
                    .stroke(.white.opacity(0.22), lineWidth: 1)
            }
    }
}

enum EnergyFormatting {
    static func kcal(_ value: Double?, signed: Bool = false) -> String {
        guard let value else { return "未记录" }
        let number = value.formatted(.number.precision(.fractionLength(0...1)))
        return "\(signed && value > 0 ? "+" : "")\(number) kcal"
    }
}

private extension UIColor {
    convenience init(rgb: UInt32) {
        self.init(
            red: CGFloat((rgb >> 16) & 0xFF) / 255,
            green: CGFloat((rgb >> 8) & 0xFF) / 255,
            blue: CGFloat(rgb & 0xFF) / 255,
            alpha: 1
        )
    }
}
