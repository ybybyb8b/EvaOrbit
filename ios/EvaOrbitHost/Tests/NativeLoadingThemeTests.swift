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

    func testIntroTimingKeepsCoreExperienceBeforeShortExit() {
        XCTAssertEqual(LoadingOverlayView.Timing.introDuration, 2.0)
        XCTAssertEqual(LoadingOverlayView.Timing.exitDuration, 0.30)
        XCTAssertLessThan(LoadingOverlayView.Timing.wordmarkDelay, LoadingOverlayView.Timing.introDuration)
    }
}
