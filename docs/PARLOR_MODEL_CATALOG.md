# Parlor 模型目录与计价

本批仅保留本地工作区，未提交／推送、发布 Web 或构建 IPA；此前居中圆形按钮的本地修改保留。

## 用户流程

填写 Provider 名称、HTTPS Base URL 和 API Key → 获取模型 → 搜索／筛选 → 多选 → 使用所选模型 → 保存到本机。支持保存前用临时 Key 获取目录；已保存 Provider 可直接使用 Keychain 中的 Key，密码框保持空白。获取目录不发起聊天推理，也不隐式保存草稿 Key。

- 搜索匹配模型名称、ID、厂商，支持多个关键词，精确 ID 优先。
- 可按厂商、只看已选、Token 免费筛选；按输入／输出价格、上下文排序，未知价格排后，不把未知或有额外收费的模型算作免费。
- 目录最多 5000 项，界面每批显示 50 项；每个 Provider 最多保存 50 个模型。搜索、筛选、重开选择器均在本地处理，不反复请求服务商。
- 确认后 ID 和显示名称自动填入，仍可手工输入。获取失败、返回空目录或尚不支持新能力的 Host，保留已有配置及手填入口。
- 不根据模型名字保证端点或文本能力兼容；有明确非文本能力时排除，未声明能力的模型标为待确认。目录有 `has_more` 时明确提示部分清单，不跟随任意服务端分页 URL。

## 报价规则

标准 OpenAI `GET /models` 只有基础模型信息，没有统一价格字段；OpenRouter 的官方目录明确提供 USD 每 Token / 请求 / 单位的价格。两者不能混为一个协议，也不从其他供应商的同名模型推断本账户计费。

- 仅官方 HTTPS `openrouter.ai` 默认端口 `/api/v1/models` 的已知价格格式自动换算：`prompt`、`completion`、`input_cache_read` × 1,000,000，对应现有每百万 Token 单价。
- 保留零价；负数、布尔、NaN、未知单位或缺失值不伪装成零。标注报价来源及获取时间，不承诺是实际账单价格。
- 手工输入的价格及自定义模型名称不被目录刷新覆盖；手工报价的缺项也不静默填入别的来源。
- 币种不匹配时不写入自动报价，不进行无汇率依据的换算。改变币种清空原数值，避免把原价直接改标签。
- 改 Model ID 会清空旧报价与旧上下文；更改 Base URL 会清空自动目录报价及临时 Key，要求重新输入 Key。
- 存在条件覆盖、请求费、缓存写入费或其他未实现的额外计价时，可展示基础 Token 单价，但总费用保持未知；不输出一个遗漏费用的确定总额。
- 新回答冻结模型及价格来源／时间；刷新目录或编辑配置不回改历史消息。

依据：[OpenAI 模型列表](https://developers.openai.com/api/reference/resources/models/methods/list)、[OpenRouter 模型与价格字段](https://openrouter.ai/docs/guides/overview/models)。未抓取网页价格、调用 LLM 算价或引入第三方价格服务。

## 实现与安全边界

- `AIModelCatalog.swift`：有界目录解析、字段白名单、文本能力与报价归一化，拒绝密钥回显字段；不把原始 JSON / 错误正文传到 UI 或日志。
- `AIStream.swift`：复用无 Cookie／credential cache 的 ephemeral URLSession 和拒绝重定向的 delegate；JSON 请求 30 秒资源超时、4 MiB 限制，显式取消时终止 session。
- `AIRuntime.swift`：`ai.listModels` / `ai.cancelModelList` 处理临时／已存 Key、端点匹配、账户和取消生命周期；与生成／保存配置互斥，不自动重试。
- `AIModels.swift`：沿用模型 JSON，增加可选元信息；有额外或条件计费时现有费用计算返回未知。无数据库迁移或默认导出变化。
- Provider 配置 JSON 上限为 128 KiB，仍最多 50 个模型，避免新增来源／时间／上下文字段使合法的批量选择碰到旧 32 KiB 限制；目录原始响应的 4 MiB 限制不变。
- `native-eva.ts` / context：目录能力独立检测；不因旧 Host 缺少目录方法关闭已有聊天。
- `native-model-catalog.ts`：本地搜索排序、选择合并、保留手填与币种保护。
- `NativeModelPicker`：复用 FormSheet 和 Vintage 控件／语义色，固定底部确认、长清单分批、键盘与搜索。
- `NativeEvaSettings`：请求／取消、目录选择、错误恢复、手工配置和来源显示；离开或进入后台清理临时 Key 并取消未完成读取。

## 验证与后续验收

已加入 Node 搜索、排序、未知／零价格、选择合并、手动报价、币种和旧 Host 能力回归。Mock 浏览器覆盖 1203 项目录、手机／桌面搜索筛选、多选导入、保存重开、手填不覆盖、币种保护、取消、HTTP 错误、离开页面和旧 Host 手填；无真实服务商请求和聊天推理。

本轮结果：完整 Node 回归 853 项，838 通过、15 跳过、零失败；目录与原聊天两套手机／桌面 Mock 回归通过；类型检查、相关 ESLint、本地 React/Vite 构建、UI 静态检查与 diff 空白检查通过。Vite 既有大 chunk 提示保留。本地构建仅用于验证，未触发 IPA 或 Web 部署。

Swift Testing 已补充目录价格单位、非官方同形字段、额外计费、Cookie／Key 使用、账户隔离、端点变更和取消。当前 Windows 没有 Swift／Xcode，未执行 Swift 编译／测试，也未验证真实 Provider 的目录兼容性；这些须在后续统一构建与真机上验收，不以浏览器 Mock 替代。
