#if DEBUG || PARLOR_SUBSCRIPTION_POC
import UIKit

// Explicit experimental package / Debug launch argument. No JS methods, provider records or SQLite.
@MainActor
final class SIWCViewController: UIViewController, UIAdaptivePresentationControllerDelegate {
    private let runtime = SIWCRuntime()
    private var login: SIWCBrowserLogin?
    private var operation: Task<Void, Never>?
    private var models: [(id: String, name: String)] = []
    private let status = UILabel()
    private let response = UITextView()
    private let modelButton = UIButton(type: .system)
    private var selectedModel: String?
    private var actions: [UIButton] = []
    private var backgroundObserver: NSObjectProtocol?

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "ChatGPT / Codex 订阅 · PoC"
        view.backgroundColor = LoadingThemePalette.current().loadingBackground
        navigationItem.rightBarButtonItem = UIBarButtonItem(title: "返回 Parlor", style: .done, target: self, action: #selector(close))
        let stack = UIStackView(); stack.axis = .vertical; stack.spacing = 14
        stack.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -20),
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            stack.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -16)
        ])
        let notice = UILabel(); notice.numberOfLines = 0; notice.font = .preferredFont(forTextStyle: .footnote)
        notice.text = "独立实验，仅使用你在官方页面授权的账号。验证请求会消耗共享订阅额度；不自动发送、不自动重试。iOS 回环回调尚待真机验证。"
        stack.addArrangedSubview(notice)
        status.numberOfLines = 0; status.font = .preferredFont(forTextStyle: .footnote)
        status.accessibilityIdentifier = "siwc-poc-status"
        status.text = "未发起授权"
        stack.addArrangedSubview(status)
        add("Continue with ChatGPT", to: stack) { [weak self] in self?.signIn() }
        add("读取当前账户模型", to: stack) { [weak self] in self?.loadModels() }
        modelButton.setTitle("先读取模型，再选择", for: .normal)
        modelButton.showsMenuAsPrimaryAction = true; stack.addArrangedSubview(modelButton); actions.append(modelButton)
        add("发送一次最小文本请求", to: stack) { [weak self] in self?.send() }
        let stop = UIButton(type: .system); stop.setTitle("停止", for: .normal)
        stop.addAction(UIAction { [weak self] _ in self?.stop() }, for: .touchUpInside); stack.addArrangedSubview(stop)
        add("退出并撤销会话", to: stack) { [weak self] in
            self?.run(stage: "退出") {
                guard let self else { return }
                defer { self.models = []; self.selectedModel = nil; self.modelButton.menu = nil; self.modelButton.setTitle("先读取模型，再选择", for: .normal) }
                try await self.runtime.signOut()
                self.status.text = "已退出，远端撤销已确认"
            }
        }
        let usage = UIButton(type: .system); usage.setTitle("ChatGPT Usage 与应用授权管理", for: .normal)
        usage.addAction(UIAction { _ in UIApplication.shared.open(URL(string: "https://chatgpt.com/settings/usage")!) }, for: .touchUpInside)
        stack.addArrangedSubview(usage)
        response.isEditable = false; response.backgroundColor = .clear
        response.font = .preferredFont(forTextStyle: .body); response.accessibilityIdentifier = "siwc-poc-response"
        response.setContentHuggingPriority(.defaultLow, for: .vertical); stack.addArrangedSubview(response)
        if let saved = try? runtime.connection(), saved.enabled { status.text = "Keychain 中有已授权会话；尚未验证当前有效性" }
        backgroundObserver = NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.stop() }
        }
    }
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        navigationController?.presentationController?.delegate = self
    }
    deinit { operation?.cancel(); if let observer = backgroundObserver { NotificationCenter.default.removeObserver(observer) } }
    private func add(_ title: String, to stack: UIStackView, action: @escaping () -> Void) {
        let button = UIButton(type: .system); button.setTitle(title, for: .normal)
        button.addAction(UIAction { _ in action() }, for: .touchUpInside)
        stack.addArrangedSubview(button); actions.append(button)
    }
    private func run(stage: String, _ work: @escaping @MainActor () async throws -> Void) {
        guard operation == nil else { return }
        actions.forEach { $0.isEnabled = false }
        operation = Task { [weak self] in
            defer { self?.operation = nil; self?.actions.forEach { $0.isEnabled = true } }
            do { try await work() }
            catch {
                if Task.isCancelled || error is CancellationError || (error as? URLError)?.code == .cancelled {
                    self?.status.text = "已取消；部分输出保留，不自动重试"
                } else {
                    // Never display arbitrary error descriptions, response bodies, auth URLs or credentials.
                    self?.status.text = stage + "失败：" + ((error as? SIWCFailure)?.errorDescription ?? "网络或协议错误；未自动重试")
                }
            }
        }
    }
    private func signIn() {
        run(stage: "授权") { [weak self] in
            guard let self else { return }
            let saved = try self.runtime.connection()
            self.status.text = "等待官方登录与订阅权限授权（最多 3 分钟）"
            let login = SIWCBrowserLogin(window: self.view.window); self.login = login
            defer { self.login = nil }
            let (attempt, code, client) = try await login.authorize(host: saved.host, client: saved.client)
            try Task.checkCancellation()
            self.status.text = "回调已验证，正在交换凭据并验证 OpenAI 签名"
            try await self.runtime.exchange(attempt: attempt, code: code, client: client)
            self.status.text = "OAuth 与身份校验成功；已授予订阅权限，凭据仅存独立 Keychain"
            self.models = []; self.selectedModel = nil; self.modelButton.menu = nil
            self.modelButton.setTitle("先读取模型，再选择", for: .normal)
        }
    }
    private func loadModels() {
        run(stage: "读取模型") { [weak self] in
            guard let self else { return }
            self.status.text = "读取账户模型目录"
            self.models = try await self.runtime.models()
            self.selectedModel = nil
            self.modelButton.setTitle("选择模型", for: .normal)
            self.modelButton.menu = UIMenu(children: self.models.map { model in
                UIAction(title: model.name) { [weak self] _ in
                    self?.selectedModel = model.id; self?.modelButton.setTitle(model.name, for: .normal)
                }
            })
            self.status.text = "已读取 \(self.models.count) 个模型；实际推理成功才确认模型权限"
        }
    }
    private func send() {
        guard let model = selectedModel, models.contains(where: { $0.id == model }) else { status.text = "请先读取并选择当前账户模型"; return }
        run(stage: "模型请求") { [weak self] in
            guard let self else { return }
            self.response.text = ""; self.status.text = "请求已发送，等待流式输出"
            let start = Date(); var firstDelta: Date?; var deltas = 0
            try await self.runtime.infer(model: model) { [weak self] event in
                if !event.delta.isEmpty {
                    if firstDelta == nil { firstDelta = Date() }
                    deltas += 1; self?.response.text += event.delta
                    self?.status.text = "流式接收中 · \(deltas) 个文本增量"
                }
                if event.completed {
                    let first = firstDelta.map { String(format: "%.2f", $0.timeIntervalSince(start)) } ?? "未知"
                    self?.status.text = "response.completed · \(deltas) 个增量 · 首字 \(first)s\n" + (event.usage ?? "用量未知")
                }
            }
        }
    }
    private func stop() { if operation != nil { operation?.cancel(); status.text = "正在停止；保留部分输出" } }
    @objc private func close() { stop(); dismiss(animated: true) }
    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) { stop() }
}
#endif
