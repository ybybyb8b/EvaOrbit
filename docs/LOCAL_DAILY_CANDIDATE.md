# 本地日常使用版候选交付记录

## 本地验收修复（待重新构建 IPA）

本次追加 Media 列表刷新后继续使用账户快照封面、本地挂载既有振动反馈、EventKit 只读步骤30秒超时及明确错误提示、原生 viewport/手势缩放限制、开屏等待 React 账户和首页内容就绪，以及 Food & Drink 与 Web 共用记录选择菜单。同步超时不重试写入、不清理队列，尚不能据此认定真实 Calendar/Reminders 同步恢复。

相关测试、TypeScript、ESLint、Web/本地资源构建和合成浏览器验证已通过；实际主账号记录没有写入。Windows 未运行 Swift 编译或 XCTest，本次不包含新 IPA 安装或真机修复验收。以下旧候选提交、构建及生产发布记录保留作历史依据，不能代替本次修复包的产物核验。

本轮开发提交：`a6ebccec9863a6efb0e03857f9b9d6a40c1c46fd`，分支 `codex/tracker-local-first-poc`。构建 #58 因 NativeBridge 调用了缺少定义的 `dispatchCore` 而未通过 Swift 编译；修复提交 `85301e24a7e3b7635ee39d067aeb3fd336aa48e7` 已推送，并手动触发 [PoC 构建 #59](https://github.com/ybybyb8b/EvaOrbit/actions/runs/39775178568)。已核验修复后 Simulator 编译通过，XCTest/IPA 最终结果待本次运行完成；不宣称真机已通过。

## 本轮补齐

- 本地健康、日历/提醒、通知设置直接复用原版控件及 Swift 分派。新增受主账号授权保护的 `native.invoke` / `native.api`；系统凭据不进离线缓存，测试账号不写 Apple 数据。
- 启动、前台、联网和保存后复用现有防抖调度；原生数据更新只触发页面刷新。权限变化回到前台刷新状态；旧日历/通知任务不跨账户继续执行。
- 健康注册使用 Host 的可信 API 地址，避免 `eo-local://` ingest 地址错误；原 observer、上传和既有经量 pending 机制继续复用。
- 保存完成后的新快照直接用于当前模块，减少重复下载；历史 Home 预取保留15分钟新鲜度，访问日期先展示缓存再刷新。临时 GET 故障可使用缓存后备，404不被当作缓存命中而掩盖。
- 纳入此前顶部正常间距和本地页面禁双指缩放修复；保留滚动、侧滑返回、正式 EO 安装与所有本地队列。

## 当前验证

一次完整回归670项：658通过，12可选环境跳过，无失败；随后只重测受影响部分。TypeScript、相关 ESLint、Web生产构建、本地Vite构建通过。

安装包CSP下合成主账号的健康注册/可信上传源、日历权限和通知校准，测试账号拒绝、账户切换中止旧校准通过。14业务入口/Inbox增改删/体重快捷记录/登录重连/503缓存后备，以及七模块390/402/1280布局与统一同步管理器回归通过。这些不等于真实主账号全模块CRUD或Apple Kit实机通过。

用户已在本任务隔离浏览器自行登录主账号：Tracker、Food、Health、Cats、Relations、Subscriptions、Media、Tasks、Projects、Lucius 共11个读取入口全部200。发布后重新核验主账号 online/native 开关均为 true、非测试账号，错误账户头返回409；未获取密码、导出会话或写入真实记录。专用浏览器已关闭。

## 服务端就绪条件

用户已批准并完成独立 API 发布 `9691b7f4a68798d42cdf382340e26c0bc70e37fc`，只修改 `src/lib/config.ts`、`src/app/api/native/session/route.ts`，不合并main、不改数据库。候选与生产各16项安全边界检查通过，候选临时保护绕过已撤销。生产部署 `dpl_5eRVhzjb3rKJVFx1RgXEgzuxxewV`；保留此前图片/快照修复 `f6a99a8` 的部署 `dpl_61qT5TXgeUKF66DWawkaQ5Aiub34` 供回退。

已按单独授权启用并逐项验证：

- `EVAORBIT_LOCAL_ONLINE_ENABLED=true`
- `EVAORBIT_LOCAL_NATIVE_ENABLED=true`

只匹配现有主账号白名单，测试账号继续禁止系统写入。两个新开关的确切环境变量ID及发布前部署记录保存在 Git 忽略的 `tmp/finish-primary-*` 回退资料中，不包含在项目文档中。回退时先恢复旧部署，再删除这两个本轮新建开关；不要删除测试邮箱配置、业务数据或本地队列。

独立 API 工作树正式发布回归604项：591通过、12可选环境跳过、1项因Windows沙箱Temp目录图片重命名EPERM失败；仅将Temp移到项目tmp后重跑该Cats文件2项通过，无源代码改动。原生编译修复后相关平台降级检查12项通过；没有重复运行全站670项回归。

另按用户新增要求移除共享桌面Sidebar中Food & Drink的彩色图片特例，使用既有FoodTray Outline，与其他导航一致。导航渲染检查、相关ESLint和UI检测通过。用户随后批准发布，独立发布分支保留全部已有API补丁，仅在旧Web AppShell应用等价一行修复：`842353192505c333c644c0a2eb9641212b8ec273`，部署`dpl_3koviNTrs3Qv63mGW1WDYEwGzB3a`已切换正式域名。生产构建、候选鉴权检查通过；已用用户登录的隔离浏览器在正式设置页核验真实SVG路径等于reicon FoodTray Outline、无feature图片，主账号online/native开关仍true，并检查侧栏截图。此前`dpl_5eRVhzjb3rKJVFx1RgXEgzuxxewV`保留可回退。此项不重打IPA、不合并main、不改数据库，根目录共享导航的一行修复继续保留在工作区。

## 构建完成后的取包与安装

在 [iOS Native Host workflow](https://github.com/ybybyb8b/EvaOrbit/actions/workflows/ios-native-host.yml) 选择本轮提交，下载 `EvaOrbitHost-TrackersPoC-ad-hoc-<run number>`，不选普通 OnlineHost 或仅测试诊断产物。必须核对 `GIT_SHA.txt` 为本页提交、校验 `SHA256SUMS`；实际产物名称、运行链接和哈希待构建成功后补录。

沿用 [IPA安装说明](IOS_IPA_INSTALL_QUICKSTART.md) 的 macOS ad-hoc → 已审计 patched xtool → Personal Team 重签 → Windows/WSL USB 安装链。覆盖独立开发版，禁止卸载/清库，不替换正式 EO。

```bash
cd /mnt/e/EvaOrbit
source scripts/ios/xtool-env.sh
EVAORBIT_SKIP_RENEWAL=1 bash scripts/ios/xtool-install.sh /mnt/e/EvaOrbit/tmp/<解压目录>/EvaOrbitHost-ad-hoc.ipa
```

`EVAORBIT_SKIP_RENEWAL=1` 避免验收安装顺带写入正式续签 Task。不要把占位目录原样执行。

## 尚未完成的实际验收

新候选 macOS编译/XCTest与IPA实际产出、真实主账号登录/读写/图片、账户切换、Apple授权/健康写回/选定Calendar与Reminder List/通知实际行为，均须记录实际结果。目前不承诺后台长期不打开App仍即时同步。

Tracker继续既有离线双向同步；其他模块仍是联网保存、已下载数据离线查看。没有扩展离线写队列。新原生入口不新增权限或签名能力；不引入APNs，不迁移托管，不合并main。服务端/IPA可各自回退，数据库、凭据所属账户和旧/新队列必须保留。
