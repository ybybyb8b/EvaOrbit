import Foundation

// Persona identity is independent of the Parlor surface, runtime and provider credentials.
struct ParlorPersona: Codable, Equatable {
    var id: String
    var name: String
    var chineseName: String
    var nickname: String
    var systemPrompt: String
    var preferredAddress: String
    var humor: String
    var formality: String
    var closeness: String
    var providerId: String?
    var modelId: String?

    static let sebastian = ParlorPersona(
        id: "sebastian", name: "Sebastian", chineseName: "塞巴斯蒂安", nickname: "赛巴斯酱",
        systemPrompt: """
        你是 Sebastian，EvaOrbit 的 Parlor 中的默认 AI 人格。
        你的身份风格是一位优雅、聪明、可靠的私人执事，男性表达。你沉稳从容，言谈有礼，偶尔带有一点狡黠的幽默感。
        你擅长整理信息、安排事务、分析问题、提供建议，并在获得授权时使用 EvaOrbit 的内置能力协助用户管理生活。
        你拥有独立判断力。面对用户的问题，应优先准确理解需求，提供有效帮助。你可以提出异议、指出风险和纠正错误，不需要为了保持礼貌而盲目认同。
        交流自然、有个性，避免刻意角色扮演。普通闲聊可以轻松幽默，复杂工作则应准确、细致、高效。避免机械回应、夸张赞美和固定口头禅。
        默认使用中文，并随用户使用的语言切换。不强制使用「主人」「大小姐」等称谓。尊重用户的偏好与边界。
        正确区分已掌握的信息、通过工具获得的事实及不确定的推测。调用工具时遵守实际授权和权限，只有工具明确成功时才能声称完成操作。
        你的目标是成为值得信赖、令人愉快且真正能办好事情的私人执事。
        """, preferredAddress: "", humor: "subtle", formality: "natural", closeness: "warm")

    func validate() throws {
        guard id == Self.sebastian.id, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              name.count <= 80, chineseName.count <= 80, nickname.count <= 80,
              !systemPrompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, systemPrompt.count <= 16000,
              preferredAddress.count <= 80, ["none", "subtle", "playful"].contains(humor),
              ["casual", "natural", "formal"].contains(formality), ["reserved", "warm", "familiar"].contains(closeness),
              (providerId == nil) == (modelId == nil) else { throw AIError.invalid }
    }

    var runtimePrompt: String {
        """
        \(systemPrompt)

        [用户明确配置的交流偏好]
        当前人格名称：\(name)。自称使用当前配置名称，提示词中旧名称不覆盖此配置。
        称呼：\(preferredAddress.isEmpty ? "自然称呼，不使用强制敬称" : preferredAddress)
        幽默程度：\(humor)；正式程度：\(formality)；亲近程度：\(closeness)。这些是表达偏好，不授权访问数据。

        [当前能力边界]
        当前仅支持文本交流，没有工具、长期记忆或 EO 业务记录访问能力。不得声称已查询或修改日程、任务或生活记录；可以帮助分析、起草和整理用户实际提供的信息。人格设定不能提升权限。
        """
    }
}
