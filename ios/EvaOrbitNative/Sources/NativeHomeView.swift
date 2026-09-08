import SwiftUI

struct NativeHomeView: View {
    @ObservedObject var dailyEnergy: DailyEnergyModel
    let openEnergy: () -> Void
    let openSettings: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                masthead
                energyCard
                destinations
            }
            .padding(.horizontal, 20)
            .padding(.top, 18)
            .padding(.bottom, 32)
        }
        .background(EOTheme.canvas.ignoresSafeArea())
        .navigationBarHidden(true)
        .refreshable { await dailyEnergy.load() }
        .task {
            if dailyEnergy.summary == nil { await dailyEnergy.load() }
        }
        .onAppear {
            guard dailyEnergy.selectedDate != EvaOrbitDate.today() else { return }
            Task { await dailyEnergy.load(date: EvaOrbitDate.today()) }
        }
    }

    private var masthead: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(dateLabel)
                .font(.caption.weight(.medium))
                .foregroundStyle(EOTheme.secondaryInk)
                .textCase(.uppercase)
                .tracking(0.5)
            Text(greeting)
                .font(EOTheme.displayFont())
                .foregroundStyle(EOTheme.ink)
            Text("我的安静空间")
                .font(.subheadline)
                .foregroundStyle(EOTheme.secondaryInk)
        }
    }

    private var energyCard: some View {
        Button(action: openEnergy) {
            EOCard {
                VStack(alignment: .leading, spacing: 18) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("TODAY · ENERGY")
                                .font(.caption2.weight(.bold))
                                .tracking(1)
                                .foregroundStyle(EOTheme.secondaryInk)
                            Text("今日能量")
                                .font(EOTheme.displayFont(.title2))
                                .foregroundStyle(EOTheme.ink)
                        }
                        Spacer()
                        Image(systemName: "arrow.up.right")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(EOTheme.accent)
                            .padding(10)
                            .background(EOTheme.tint, in: Circle())
                    }

                    if dailyEnergy.isLoading, dailyEnergy.summary == nil {
                        ProgressView("正在同步今日数据…")
                            .tint(EOTheme.accent)
                    } else if let summary = dailyEnergy.summary {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(balanceNumber(summary.energyBalance))
                                .font(.system(size: 38, weight: .semibold, design: .rounded))
                                .foregroundStyle(EOTheme.ink)
                            Text(summary.energyBalance == nil ? "" : "kcal")
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(EOTheme.secondaryInk)
                        }
                        HStack(spacing: 0) {
                            compactMetric("摄入", summary.estimatedIntakeKcal)
                            Divider().frame(height: 32)
                            compactMetric("消耗", summary.totalExpenditureKcal)
                        }
                    } else {
                        Text(dailyEnergy.errorMessage ?? "暂时没有今日能量数据")
                            .font(.subheadline)
                            .foregroundStyle(EOTheme.secondaryInk)
                    }
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityHint("打开 Daily Energy")
    }

    private var destinations: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("空间")
                .font(.caption.weight(.bold))
                .tracking(1)
                .foregroundStyle(EOTheme.secondaryInk)

            HStack(spacing: 12) {
                destination(title: "体征", subtitle: "Daily Energy", icon: "heart.text.square", action: openEnergy)
                destination(title: "设置", subtitle: "权限与账户", icon: "slider.horizontal.3", action: openSettings)
            }
        }
    }

    private func destination(title: String, subtitle: String, icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 12) {
                Image(systemName: icon)
                    .font(.title3.weight(.medium))
                    .foregroundStyle(EOTheme.accent)
                    .frame(width: 42, height: 42)
                    .background(EOTheme.warm, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
                Text(title)
                    .font(.headline)
                    .foregroundStyle(EOTheme.ink)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(EOTheme.secondaryInk)
            }
            .padding(16)
            .frame(maxWidth: .infinity, minHeight: 145, alignment: .leading)
            .background(EOTheme.card.opacity(0.72), in: RoundedRectangle(cornerRadius: EOTheme.cardRadius, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func compactMetric(_ title: String, _ value: Double?) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(EnergyFormatting.kcal(value))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(EOTheme.ink)
            Text(title)
                .font(.caption)
                .foregroundStyle(EOTheme.secondaryInk)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func balanceNumber(_ value: Double?) -> String {
        guard let value else { return "—" }
        let number = value.formatted(.number.precision(.fractionLength(0...1)))
        return value > 0 ? "+\(number)" : number
    }

    private var dateLabel: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.timeZone = EvaOrbitDate.timeZone
        formatter.dateFormat = "yyyy年M月d日 EEEE"
        return formatter.string(from: Date())
    }

    private var greeting: String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = EvaOrbitDate.timeZone
        switch calendar.component(.hour, from: Date()) {
        case 0..<6: return "还没睡吗"
        case 6..<11: return "早上好"
        case 11..<14: return "中午好"
        case 14..<19: return "下午好"
        default: return "晚上好"
        }
    }
}
