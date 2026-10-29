<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# EvaOrbit 项目约定

## 开发导航与标题

- 从 [docs/DEV_INDEX.md](docs/DEV_INDEX.md) 定位相关模块，再检查当前实现和必要的详细文档，不默认通读全部文档。
- 架构、模块职责或重要依赖变化时更新索引；普通修复和 UI 调整无需更新。索引记录长期结构，当前进度由 Project 管理。
- 新对话标题使用 `模块｜具体任务`，覆盖公共标题格式。模块名沿用 DEV_INDEX，跨模块用 Core 或 Architecture；其余命名规则沿用公共约定。

## 界面与移动端

- 沿用现有视觉语言、组件和交互约定，主动修正本次任务中的明显不协调；不为局部改动引入新的 UI 框架或设计系统。
- 优先用留白、表面色、分组和克制的层次表达边界，不默认用细线分割内容；边框用于控件或确有意义的分隔。
- 移动端以 iPhone 16 Pro 为主要真机目标，按改动检查视口、安全区、Safari/PWA 和键盘交互。保持响应式，不靠设备专属宽度或偏移修补布局；未做真机验证时明确说明。

## 日期与数据

- 默认允许仅日期记录；只有用户明确输入时间时才视为有时间，不能用虚构的 `00:00` 代替未知时间。
- 存储需要 datetime 时，沿用现有日期锚点并保存显式时间标记。日期相关改动保持受影响的创建、编辑、历史、Timeline、MCP 和统计口径一致。
- 数据迁移须兼容现有 schema，避免重复对象和数据丢失；只有实际应用后才能声称真实环境已完成迁移。

## iOS Native Host

- 修改 `ios/EvaOrbitHost`、iOS 权限或 capabilities、JS↔Swift bridge、IPA 打包签名、patched xtool 或 Windows/WSL 安装流程前，完整阅读 [docs/IOS_NATIVE_MAINTENANCE.md](docs/IOS_NATIVE_MAINTENANCE.md)。
- 保留已验证的 macOS CI ad-hoc IPA → audited patched xtool → 免费 Personal Team 重签 → Windows usbmuxd/WSL 安装链；迁移须有明确授权，替代链路须经真机验证。
- 新增 entitlement 前核对 Personal Team 支持、xtool 保留行为及打包结果，并验证真机表现。本地通知不需要 APNs capability。

## 项目验证与 Git

- 文档改动检查 diff 和 `git diff --check`，无需应用测试或构建。样式、文案和动画改动检查相关页面或组件，并运行适用的构建或原生测试；单模块逻辑改动运行相关测试，覆盖受影响的共享组件调用方，按需运行 lint、类型检查和构建。
- 同步、认证、共享数据层改动和正式发布，在改动就绪后进行一次完整回归；仅在后续改动或新证据影响覆盖范围时重跑。
- 默认不提交、不推送，保留工作区改动供审阅；用户明确要求时执行。不改动无关 Git 历史或分支。

## Project 进度写回（试行）

- EvaOrbit 项目任务的结果获得用户认可后，通过连接工具写回 Project，不再重复询问。普通问答、未采纳建议和零散编辑不单独建项；用户取消试行后停止。
- 优先使用已知 Item ID，否则按任务关键词查找并复用匹配事项；确无匹配时创建，沿用既有模块和类型。仅在所属项目或事项仍有歧义时询问，避免全量扫描和重复记录。
- 实现获认可但尚未实际验收记为 `done`；用户明确确认实际效果符合预期记为 `verified`；部分完成保留 `doing` 并记录剩余工作，不因子任务完成而结束更大的事项。
- 写回简要记录状态、结果、必要验证或限制及下一步，保留无关内容和服务端生命周期时间。核验返回记录，失败时明确说明尚未保存及待写回内容。
