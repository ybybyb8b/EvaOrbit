import UIKit
import XCTest
@testable import EvaOrbitHost

final class NativeLoadingThemeTests: XCTestCase {
    func testEditorialThemeMapsEverySemanticRoleToOneNamedColorAsset() {
        let names = LoadingThemeToken.allCases.map {
            LoadingThemePalette.assetName(for: $0, identifier: .editorial)
        }

        XCTAssertEqual(Set(names).count, LoadingThemeToken.allCases.count)
        XCTAssertEqual(names, [
            "LoadingBackground", "LoadingPrimary", "LoadingAccent", "LoadingText",
            "LoadingSecondaryText", "LoadingButtonBackground", "LoadingButtonText",
        ])
        for name in names { XCTAssertNotNil(UIColor(named: name), "Missing semantic color asset \(name)") }
    }

    func testRosewoodThemeMapsEverySemanticRoleToOneNamedColorAsset() {
        let names = LoadingThemeToken.allCases.map {
            LoadingThemePalette.assetName(for: $0, identifier: .rosewood)
        }

        XCTAssertEqual(Set(names).count, LoadingThemeToken.allCases.count)
        XCTAssertEqual(names, [
            "RosewoodLoadingBackground", "RosewoodLoadingPrimary", "RosewoodLoadingAccent", "RosewoodLoadingText",
            "RosewoodLoadingSecondaryText", "RosewoodLoadingButtonBackground", "RosewoodLoadingButtonText",
        ])
        for name in names { XCTAssertNotNil(UIColor(named: name), "Missing semantic color asset \(name)") }
    }

    func testAppearanceModesMapToExpectedInterfaceStyles() {
        XCTAssertEqual(NativeAppearanceMode.system.interfaceStyle, .unspecified)
        XCTAssertEqual(NativeAppearanceMode.light.interfaceStyle, .light)
        XCTAssertEqual(NativeAppearanceMode.dark.interfaceStyle, .dark)
    }

    func testLoadingCoreResolvesDistinctLightAndDarkArtwork() throws {
        let lightTraits = UITraitCollection(userInterfaceStyle: .light)
        let darkTraits = UITraitCollection(userInterfaceStyle: .dark)
        let lightImage = try XCTUnwrap(UIImage(named: "LoadingCore", in: .main, compatibleWith: lightTraits))
        let darkImage = try XCTUnwrap(UIImage(named: "LoadingCore", in: .main, compatibleWith: darkTraits))

        XCTAssertNotEqual(lightImage.pngData(), darkImage.pngData())
    }

    func testIntroTimingAllowsAnInterruptibleShortExit() {
        XCTAssertEqual(LoadingOverlayView.Timing.introDuration, 2.0)
        XCTAssertEqual(LoadingOverlayView.Timing.exitDuration, 0.20)
        XCTAssertLessThan(LoadingOverlayView.Timing.wordmarkDelay, LoadingOverlayView.Timing.introDuration)
    }
}
