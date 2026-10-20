# 统一 Header 与返回入口

## 职责与规则

- Header 属于应用壳层；左上仅有一个可见 Back，右上仅有一个空间/侧栏入口。Settings 保留手机底栏和桌面侧栏入口，不再在业务页面叠加账户齿轮。
- 页面标题、筛选、编辑/新增属于业务页面；Back 与菜单属于壳层。新增模块不得增加 `← Module`、`返回列表` 等第二套页面按钮。
- 公共视觉控件为 `NavigationBackControl`。Web `PageBackButton` 继续负责 Next router、重复点击保护和已验证的历史返回/直接访问 fallback，不为统一外观改变历史语义。
- 本地 `LocalNavigationProvider` 管理当前模块的返回动作；详情用 `LocalBackAction` 声明返回父级，卸载后撤销，壳层统一绘制。当前模块入口无详情时回 Home；Home 不显示返回。不把退出 App 当作 Back，也不在离线时跳远程 Web。
- 表单开启时继续由 FormSheet 接管关闭和未保存确认；背景 Header 不绕过它。抽屉开启时保留焦点约束、Escape 和关闭后的焦点恢复。
- 手机 Header 预留响应式安全区高度，页面内容不得放到触控区域下方；桌面复用已有返回栏布局。不得用单机型固定宽度/偏移补重叠。

## 本轮落地

- Tracker 顶部账户齿轮与重复品牌移除；连接账户、退出和导出迁到 `SettingsWorkspace`。Native 导出仍使用原 `trackers.exportState`，不会清库或上传旧队列。
- Web/本地使用同一返回按钮视觉。Tracker、Chronicle、Memo 已由本地壳层承接详情返回，Inbox 入口由壳层返回 Home；Chronicle 原页面返回链接移除，Web 已有全局返回承接。
- Memo 和 Inbox 按此约定接入，无新增业务页返回按钮。
- 新公共 Header 的上下文注册必须保留清理与当前动作身份校验，避免切换模块后出现旧页面动作。

## 后续批量迁移，不扩散临时入口

Food、Cats、Subscriptions 仍使用已验收的模块内部导航。它们暂不注册新的壳层 Back，避免出现新旧双返回或错误地返回 Home；各自旧按钮仍有效。下一次统一导航迁移按以下清单一次处理，不在每次功能扩展中新增/隐藏重复按钮：

1. 用同一返回注册契约承接内部列表、详情、子库及多级页面；保留现有父级关系。
2. 同一批删除这些工作区已有的 `local-*-back` 业务按钮，并更新对应回归脚本使用公共 Back。
3. 为本地导航补可序列化的访问栈，明确筛选/分页/滚动位置恢复；不把当前 `window.scrollTo(0,0)` 描述为已经完成的返回恢复。
4. 对 Web 盘点残余业务页返回入口，优先依托既有 `pageBackFallback` / 返回滚动恢复，批量收敛；保留 Lucius 当前特殊 Header，完成专项验收后再迁移。

## 验收

- 手机 402px 及响应式宽度下 Back/Menu 触控区域不相交，标题不被固定 Header 遮挡；同一位置只有一个可见 Back。
- 入口 → 详情 → Back 回到模块列表；模块入口 Back 回 Home；Home 没有 Back。Web 历史返回与直接进入父级 fallback 不增加额外 history 条目，连续点击只导航一次。
- 表单脏草稿不会因 Header 返回而直接丢失；抽屉焦点、错误条幅、底栏 Settings 正常。
- Settings 的连接、退出和导出可达；旧数据、队列与导出内容不被导航改动修改。
- 真机顶部安全区、横竖屏和键盘需 iPhone 验收；浏览器只能验证布局和交互逻辑。
