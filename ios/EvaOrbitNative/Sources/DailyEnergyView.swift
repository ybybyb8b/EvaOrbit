import SwiftUI

struct DailyEnergyView: View {
    @ObservedObject var model: DailyEnergyModel
    @State private var editorPresented = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                masthead
                dateControl

                if model.isLoading, model.summary == nil {
                    EOCard {
                        ProgressView("正在载入 Daily Energy…")
                            .tint(EOTheme.accent)
                    }
                } else if let summary = model.summary {
                    energyOverview(summary)
                    energySources(summary)
                }

                if let error = model.errorMessage {
                    EOCard {
                        VStack(alignment: .leading, spacing: 10) {
                            Label(error, systemImage: "exclamationmark.circle")
                                .font(.footnote)
                                .foregroundStyle(.red)
                            Button("重新载入") { Task { await model.load() } }
                                .buttonStyle(.bordered)
                        }
                    }
                }

                if let success = model.successMessage {
                    Label(success, systemImage: "checkmark.circle.fill")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(EOTheme.success)
                        .padding(.horizontal, 4)
                }

                Button {
                    editorPresented = true
                } label: {
                    Label("编辑当日能量", systemImage: "pencil")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                .buttonStyle(.plain)
                .foregroundStyle(EOTheme.accentOn)
                .background(EOTheme.accent, in: RoundedRectangle(cornerRadius: EOTheme.controlRadius, style: .continuous))
                .disabled(model.isLoading || model.summary == nil)
            }
            .padding(.horizontal, 20)
            .padding(.top, 18)
            .padding(.bottom, 32)
        }
        .background(EOTheme.canvas.ignoresSafeArea())
        .navigationBarHidden(true)
        .refreshable { await model.load() }
        .task {
            if model.summary == nil { await model.load() }
        }
        .sheet(isPresented: $editorPresented, onDismiss: model.resetDraft) {
            DailyEnergyEditorView(model: model)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
    }

    private var masthead: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("HEALTH · DAILY ENERGY")
                .font(.caption2.weight(.bold))
                .tracking(1.1)
                .foregroundStyle(EOTheme.secondaryInk)
            Text("每日能量")
                .font(EOTheme.displayFont())
                .foregroundStyle(EOTheme.ink)
            Text("摄入、消耗与 Apple Health 汇总")
                .font(.subheadline)
                .foregroundStyle(EOTheme.secondaryInk)
        }
    }

    private var dateControl: some View {
        HStack {
            Label("日期", systemImage: "calendar")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(EOTheme.ink)
            Spacer()
            DatePicker("日期", selection: dateBinding, displayedComponents: .date)
                .labelsHidden()
                .environment(\.timeZone, EvaOrbitDate.timeZone)
                .disabled(model.isLoading || model.isSaving)
        }
        .padding(14)
        .background(EOTheme.tint.opacity(0.72), in: RoundedRectangle(cornerRadius: EOTheme.controlRadius, style: .continuous))
    }

    private func energyOverview(_ summary: DailyEnergySummary) -> some View {
        EOCard {
            VStack(alignment: .leading, spacing: 18) {
                HStack {
                    Text(summary.date == EvaOrbitDate.today() ? "TODAY · IN PROGRESS" : "ENERGY REVIEW")
                        .font(.caption2.weight(.bold))
                        .tracking(0.8)
                        .foregroundStyle(EOTheme.secondaryInk)
                    Spacer()
                    Image(systemName: "bolt.heart.fill")
                        .foregroundStyle(EOTheme.accent)
                }

                HStack(alignment: .top, spacing: 0) {
                    primaryMetric("摄入", value: summary.estimatedIntakeKcal)
                    Divider().frame(height: 58)
                    primaryMetric("消耗", value: summary.totalExpenditureKcal)
                    Divider().frame(height: 58)
                    primaryMetric("结余", value: summary.energyBalance, signed: true)
                }

                Text(summary.date == EvaOrbitDate.today()
                     ? "今天仍在变化中，这不是一份已经结束的回顾。"
                     : "摄入来自 Food 与 Drinks，消耗来自已保存能量。")
                    .font(.footnote)
                    .foregroundStyle(EOTheme.secondaryInk)
            }
        }
    }

    private func energySources(_ summary: DailyEnergySummary) -> some View {
        EOCard {
            VStack(alignment: .leading, spacing: 14) {
                Text("能量来源")
                    .font(.headline)
                    .foregroundStyle(EOTheme.ink)
                sourceRow("静息能量", value: summary.restingEnergyKcal, source: summary.restingEnergySource)
                Divider()
                sourceRow("活动能量", value: summary.activeEnergyKcal, source: summary.activeEnergySource)

                if !summary.notes.isEmpty {
                    Divider()
                    Text(summary.notes)
                        .font(.subheadline)
                        .foregroundStyle(EOTheme.ink)
                }
            }
        }
    }

    private func primaryMetric(_ title: String, value: Double?, signed: Bool = false) -> some View {
        VStack(spacing: 5) {
            Text(metricNumber(value, signed: signed))
                .font(.system(.title3, design: .rounded, weight: .semibold))
                .foregroundStyle(value == nil ? EOTheme.secondaryInk : EOTheme.ink)
                .minimumScaleFactor(0.7)
                .lineLimit(1)
            Text(value == nil ? "" : "kcal")
                .font(.caption2)
                .foregroundStyle(EOTheme.secondaryInk)
            Text(title)
                .font(.caption)
                .foregroundStyle(EOTheme.secondaryInk)
        }
        .frame(maxWidth: .infinity)
    }

    private func sourceRow(_ title: String, value: Double?, source: String?) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(EOTheme.ink)
                if let source {
                    Text(source == "apple_health" ? "Apple Health" : "手动记录")
                        .font(.caption)
                        .foregroundStyle(EOTheme.secondaryInk)
                }
            }
            Spacer()
            Text(EnergyFormatting.kcal(value))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(value == nil ? EOTheme.secondaryInk : EOTheme.ink)
        }
    }

    private func metricNumber(_ value: Double?, signed: Bool) -> String {
        guard let value else { return "—" }
        let number = value.formatted(.number.precision(.fractionLength(0...1)))
        return signed && value > 0 ? "+\(number)" : number
    }

    private var dateBinding: Binding<Date> {
        Binding(
            get: { EvaOrbitDate.date(from: model.selectedDate) ?? Date() },
            set: { date in
                Task { await model.load(date: EvaOrbitDate.string(from: date)) }
            }
        )
    }
}

private struct DailyEnergyEditorView: View {
    @ObservedObject var model: DailyEnergyModel
    @Environment(\.dismiss) private var dismiss
    @FocusState private var focusedField: Field?

    private enum Field {
        case resting
        case active
        case notes
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("静息 kcal（选填）", text: $model.restingEnergy)
                        .keyboardType(.decimalPad)
                        .focused($focusedField, equals: .resting)
                    TextField("活动 kcal（选填）", text: $model.activeEnergy)
                        .keyboardType(.decimalPad)
                        .focused($focusedField, equals: .active)
                    TextField("备注（选填）", text: $model.notes, axis: .vertical)
                        .lineLimit(2...5)
                        .focused($focusedField, equals: .notes)
                } header: {
                    Text("手动记录")
                } footer: {
                    Text("留空时优先使用 Apple Health；填写数值会作为该项的手动覆盖。")
                }

                if let error = model.errorMessage {
                    Section {
                        Label(error, systemImage: "exclamationmark.circle")
                            .font(.footnote)
                            .foregroundStyle(.red)
                            .accessibilityLabel("错误：\(error)")
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(EOTheme.canvas)
            .navigationTitle("编辑能量")
            .navigationBarTitleDisplayMode(.inline)
            .interactiveDismissDisabled(model.isSaving)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") {
                        model.resetDraft()
                        dismiss()
                    }
                    .disabled(model.isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task {
                            await model.save()
                            if model.successMessage != nil {
                                focusedField = nil
                                dismiss()
                            }
                        }
                    } label: {
                        if model.isSaving { ProgressView() }
                        else { Text("保存").fontWeight(.semibold) }
                    }
                    .disabled(model.isSaving)
                }
            }
        }
        .tint(EOTheme.accent)
    }
}
