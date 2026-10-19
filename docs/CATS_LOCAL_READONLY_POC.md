# Cats 本地只读验收

本阶段在现有独立 UIKit/WKWebView Host 内复用 Web 的 `CatsView`、`PetDetailView`、`CatHealthOverview`、猫粮列表/详情及原版编辑器。没有独立 SwiftUI 界面，没有另建主题；英语与 August 沿用已有本地偏好。模块入口增加 Cats，与 Food 阶段一起打包验收。

## 结构与边界

- `cats-data-context.tsx` 注入 GET 读取与站内导航，默认 Web 继续使用 fetch / Next Link；猫粮详情仅将 Next router 留在 Web 包装中。本地使用纯展示内容。
- `cats-readonly.ts` 保存下载契约、边界校验与 URL 投影，不包含网络或写入回退。`useFormHistory` 可注入读取函数，原调用不变；Cats 表单在本地使用下载历史候选。
- `/api/native/cats-readonly` 认证当前账户后，经 `withCatsReadOnlyRepository` 白名单调用原版聚合/记录/猫粮服务。禁止完成护理、生成提醒、扣库存及其他业务命令。头像使用既有认证读取服务，将图片字节内嵌，离线不访问远端图片 URL。
- `cats.readOnlySnapshot` 沿用 bridge v1，只对本地 PoC main frame 开放。原生仅 GET 白名单接口，刷新前后核验云端账户、设备账户和 generation，先完成既有 SQLite 备份检查。旧 Host 缺少方法时提示安装新包，不退回旧同步。
- Native 新增独立 `cats_readonly_cache`，浏览器复用账户隔离 IndexedDB；每账户单个快照最大 8 MiB。原 state、记录及 outbox 不被覆盖、上传或清空。损坏、超限、网络失败及账户切换保留旧快照。

## 验收范围与限制

支持总览、猫咪时间线/历史详情、健康概览、护理计划、档案、猫粮库存/价格/购买记录。记录、Routine、一次提醒、档案、猫粮、购买、补货提醒可打开原表单并修改临时草稿；提交函数和按钮均禁写。完成/取消/删除/归档、照片上传或移除、库存扣减禁用。真实错误继续显示，阶段说明默认折叠。

快照基于现有服务返回的在用猫咪及其记录，不包含归档猫咪的独立目录；最多 50 只猫、2,000 条去重记录、200 个猫粮条目，各嵌套数组也有上限。超限整体拒绝，不悄悄截断后覆盖缓存。上游 Supabase 既有列表尚未实现全量分页，因此本阶段不能承诺无限历史或全量库存；列表达到默认 1,000 行边界时保守拒绝下载。首次下载耗时与猫咪、记录、头像数量有关，后台刷新不阻塞已经下载页面。只读聚合不是数据库事务快照；并发修改可能需要重试，后续写入同步不在本阶段开放。

## 本地验证

- `scripts/cats-readonly.test.mjs`：临时 SQLite、合成五类记录/护理/购买/头像，对所有业务表设置写入阻断后执行真实只读服务；校验日期精度、引用、账户、大小及受限路径。
- `scripts/cats-offline-browser.mjs`：原版页面及表单强制 submit、头像、离线关闭浏览器后重启、错误账户/损坏响应保留旧缓存、冻结队列不变、402/1280 视口；实际打包 CSP + bridge 模拟无 API fetch。使用合成数据，不等于真实 WKWebView 或生产数据验收。
- `TrackerLocalTests.swift` 新增 SQLite 重开持久化、队列不变、坏响应拒绝、账户隔离与方法白名单测试。Windows 无 Xcode，执行结果以 macOS CI 为准。

本轮实际执行：lint、typecheck、Next 生产构建、本地 React 打包、Cat 浏览器验收、Food/Drink/Places/Library 浏览器回归、Home/Tracker 离线回归均通过。共享侧栏后，全量 Node 测试 619 项，607 通过、12 跳过、0 失败；原导航源码断言已随导航抽取更新，并增加实际渲染 Web 全部入口、本地入口过滤和选中状态的测试。合成数据验收业务写请求为 0。打包仍有既有的单 JS chunk 超过 500 kB 提示，后续可按模块拆包优化，但不可据此声称真机加载性能已通过。

本地不再维护顶部模块按钮，桌面侧栏与手机抽屉直接复用 `app-navigation.tsx`；只展示 Tracker、Food、Cats 及 Home，Settings 继续保留。语言/外观入口回到 Settings。手机抽屉的焦点约束、Escape/遮罩关闭、焦点恢复及关闭后的背景解锁已通过浏览器验收；900/1280 桌面布局不遮挡正文。持久错误条幅仍需按原交互先收起再使用其后方的导航按钮。

## 发布、真机与回退

当前仅本地源码，未部署新 API、应用生产 migration、提交或推送。后续经批准发布时必须同时保留已经独立上线的 Home 只读补丁，不可直接把整个开发分支部署到生产。无需生产数据库迁移；需要单独批准 API 发布，以及重建、重签、覆盖安装独立 PoC IPA。

macOS CI 与 XCTest、真实账户头像/历史兼容性及 iPhone 16 Pro 的离线冷启动、键盘、表单、安全区和性能仍需实际验收。生产 EO、HealthKit、EventKit、通知权限/entitlement/签名链不变。GitHub Actions 由用户查看；失败后带回日志再处理。

失败可覆盖安装已验证的上一独立 IPA，保留 SQLite/未同步队列；新增缓存表可留存，不卸载正式版或开发版。API 独立回退不得删除原 Home 补丁。验收安装继续使用 `EVAORBIT_SKIP_RENEWAL=1`，避免写入生产续签 Task。
