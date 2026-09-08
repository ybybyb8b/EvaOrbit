import SwiftUI

struct DailyEnergyView: View {
    @ObservedObject var model: DailyEnergyModel
    @FocusState private var focusedField: Field?

    private enum Field {
        case resting
        case active
        case notes
    }

    var body: some View {
        Form {
            Section {
                DatePicker("日期", selection: dateBinding, displayedComponents: .date)
                    .disabled(model.isLoading || model.isSaving)
                    .environment(\.timeZone, EvaOrbitDate.timeZone)
            }

            if let summary = model.summary {
                Section("当日概览") {
                    metric("摄入", value: summary.estimatedIntakeKcal)
                    metric("消耗", value: summary.totalExpenditureKcal)
                    metric("结余", value: summary.energyBalance, signed: true)
                }

                Section("能量来源") {
                    sourceRow("静息能量", value: summary.restingEnergyKcal, source: summary.restingEnergySource)
                    sourceRow("活动能量", value: summary.activeEnergyKcal, source: summary.activeEnergySource)
                }
            } else if model.isLoading {
                Section {
                    HStack {
                        Spacer()
                        ProgressView("正在载入…")
                        Spacer()
                    }
                }
            }

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
                Text("能量留空时优先显示 Apple Health 数据；填写数值会作为该项的手动覆盖。")
            }

            if let error = model.errorMessage {
                Section {
                    Text(error)
                        .foregroundStyle(.red)
                        .accessibilityLabel("错误：\(error)")
                }
            }

            if let success = model.successMessage {
                Section {
                    Label(success, systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                }
            }

            Section {
                Button {
                    Task {
                        await model.save()
                        if model.successMessage != nil { focusedField = nil }
                    }
                } label: {
                    HStack {
                        Spacer()
                        if model.isSaving {
                            ProgressView()
                        } else {
                            Text("保存 Daily Energy")
                        }
                        Spacer()
                    }
                }
                .disabled(model.isLoading || model.isSaving)
            }
        }
        .navigationTitle("Daily Energy")
        .refreshable { await model.load() }
        .task {
            if model.summary == nil { await model.load() }
        }
    }

    private var dateBinding: Binding<Date> {
        Binding(
            get: { EvaOrbitDate.date(from: model.selectedDate) ?? Date() },
            set: { date in
                focusedField = nil
                Task { await model.load(date: EvaOrbitDate.string(from: date)) }
            }
        )
    }

    @ViewBuilder
    private func metric(_ label: String, value: Double?, signed: Bool = false) -> some View {
        HStack {
            Text(label)
            Spacer()
            Text(formattedKcal(value, signed: signed))
                .foregroundStyle(value == nil ? Color.secondary : Color.primary)
        }
    }

    @ViewBuilder
    private func sourceRow(_ label: String, value: Double?, source: String?) -> some View {
        HStack {
            VStack(alignment: .leading) {
                Text(label)
                if let source {
                    Text(source == "apple_health" ? "Apple Health" : "手动记录")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            Text(formattedKcal(value))
                .foregroundStyle(value == nil ? Color.secondary : Color.primary)
        }
    }

    private func formattedKcal(_ value: Double?, signed: Bool = false) -> String {
        guard let value else { return "未记录" }
        let number = value.formatted(.number.precision(.fractionLength(0...1)))
        return "\(signed && value > 0 ? "+" : "")\(number) kcal"
    }
}
