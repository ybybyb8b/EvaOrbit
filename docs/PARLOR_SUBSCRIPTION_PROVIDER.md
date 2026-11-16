# Parlor 订阅 Provider 整合候选

依据 Project Item #220 的首次真实 response.completed 验证。#200 为旧 Insights 事项，不作为本次依据。

Provider 页沿用 Vintage，API / 订阅登录并列切换，分别管理 API Key 与 ChatGPT 授权。可选新增 Bridge 方法 ai.subscriptionLogin / ai.subscriptionLogout / ai.subscriptionModels；旧 Host 保留 API 功能并提示升级。桥接 v1 及既有主 frame、origin、账户/generation 检查不变。

SIWC 协议、浏览器授权及 Runtime 成为共享产品源码，原实验面板仍受 Debug / PARLOR_SUBSCRIPTION_POC 控制。没有改动签名、workflow、Info.plist、entitlement 或系统权限，没有新增 framework 依赖。需后续新 IPA 才能真机使用；本轮不提交、不推送、不打包。

订阅凭据按 EO 账户使用独立 Keychain service，不导入单 profile PoC 凭据；用户需重新授权。固定订阅 Provider ID 仅在对应账户配置内使用，不能通过 API 编辑或删除通道修改；退出走撤销并清除本地凭据，保留聊天历史。授权成功但目录失败时仍可刷新或退出。订阅用 Responses 发送人格 instructions、已完成历史及当前输入；增量 await 原聊天持久化后再展示，复用取消、中断、去重和账户隔离。仅持有完整 response.completed 才完成。订阅 Token 数使用服务返回值，价格保持未知，不按 API 报价推算计划额度。

Windows 浏览器截图使用明确模拟连接与模型，无真实登录或推理；不能替代 Swift 编译、iPhone Safari/系统授权、停止/中断、重启、刷新与撤销验收。不得把现有 PoC 手机证据视为本次整合的真机验收。
