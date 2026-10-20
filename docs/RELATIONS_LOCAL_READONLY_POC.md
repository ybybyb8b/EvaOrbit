# Relations 本地只读阶段

## 原界面与业务边界

直接复用原 Web `RelationsView`、人物详情内容、人物/往来/还款表单和笔记表单，保留搜索、关系状态筛选、排序、消费分摊及往来类型规则。Web 详情仅保留 Next 导航包装；`RelationsDataProvider` 为本地注入已下载 GET 和导航，Web 默认仍使用原 fetch/Next Link。业务服务、金额、代垫和还款计算不重写。详情的本地返回由壳层 Header 负责，不增加页面内重复返回按钮。

本地允许输入临时草稿；人物保存、照片上传、往来创建/完整 PUT 修改、flow ID 还款、人物笔记、归档和删除全部在处理函数及只读适配层拦截，提交/删除/归档按钮禁用。原 Web 正常写入路径保留。解释信息沿用折叠的 DevelopmentDetails。

## 缓存与可靠性

新增 `GET /api/native/relations-readonly`，使用当前 Native 认证账户及原 `listRelationPeople` / `getRelationPersonDetail` 服务。Repository 白名单只放行人物、往来和人物笔记读取，拒绝命令。照片通过原认证照片服务读取和检测真实图片类型，再嵌入缓存，不加载远端 URL。

每账户快照8 MiB，最多100个人物（含历史引用的归档人物）。列表隐藏归档人物，保留已结束关系的原筛选/搜索行为；详情、照片、笔记、群体消费及还款关联一并下载。现有往来读取上限500：触及上限时拒绝刷新，不将截断账目当作完整余额；笔记触及现有默认1000行上限同样拒绝。长期更大数据量需要单独完成分页方案。本阶段不改原 Web 的历史分页/余额实现。

快照验证检查人物/详情一致性、群体事件去重、参与者/flow引用、原金额规则、余额与最近往来一致性、代垫/还款反向及累计金额、日期和 explicit-time 标记。非法数据、断网、账户变化或API不可用保留旧缓存和 outbox。

新增 `relations.readOnlySnapshot`，桥接主版本仍为1，仅本地 PoC origin/main frame 可用。Native 仅精确 GET `relations-readonly`，执行既有备份验收及刷新前后账户/generation检查；独立新增 `relations_readonly_cache`。浏览器使用账户隔离 IndexedDB，保存事务再次检查当前账户。旧 Host 缺少方法时提示升级，不回退至写接口。

## 验证、发布与回退

- `scripts/relations-readonly.test.mjs`：隔离数据库所有业务表封锁写入，验证实际服务/照片/笔记/群体事件/部分还款及余额；额外验证真实500行边界拒绝读取。
- `scripts/relations-offline-browser.mjs`：原页面及表单，强制提交、搜索/排序/归档与已结束关系、照片/笔记、离线重启、错误账户/非法响应保留缓存/队列、402/900/1280、打包CSP与模拟Bridge。
- Native XCTest 增加缓存持久化、错误账户、超限拒绝、精确路径和方法白名单、冻结队列保留。Windows无法运行，须由macOS CI与iPhone补验。

需要重新打包覆盖安装独立 PoC；只读 API 生产发布仍需单独批准，不新增生产 Supabase migration。不默认提交推送，不合并 main。回退保留安装、SQLite、旧队列和备份，新增缓存表可以留存。

## 共用问题修复与验收

人物详情现在通过同一 `personOpenAdvances` 纯函数筛选当前人物和“我”之间的代垫；同一群体事件中其他人物的代垫、人物之间的第三方代垫均不混入。剩余金额仍按原 flow ID 汇总还款，保留部分还款、完全结清及两个方向；不修改历史记录、余额或还款协议。Web和本地共用该内容组件。

SQLite `updateRelationPerson` 在合并前忽略值为 undefined 的字段，修复解析器未传字段覆盖旧值导致的SQL绑定失败。未传字段保持原值，显式 null 仍可清空；照片、归档状态、其他资料得到保留。该入口覆盖Web API、服务和MCP对应的SQLite调用；Supabase原有忽略undefined的路径不变。

新增 `scripts/relations-regression.test.mjs` 覆盖群体参与者隔离、第三方代垫排除、部分/完整还款、反向代垫，以及完整表单/部分PATCH/直接服务更新、null清空、照片和归档状态保留。`scripts/relations-web-browser.mjs` 使用临时SQLite和照片目录验证原Web人物创建/编辑/归档、笔记、flow ID还款、往来增改删及页面布局；`relations-offline-browser.mjs` 同时断言本地详情只有当前人物的未结代垫，且仍不能写入。

本轮全量637项Node测试中625通过、12环境依赖跳过；lint、typecheck、Next生产构建、本地资源构建通过。浏览器回归使用英语/August及402/900/1280视口，不代表macOS XCTest、生产Supabase或iPhone已经验收。当前本地JS包仍有Vite既有大包告警，本阶段不做拆包重构。尚未提交推送、部署生产或应用生产migration。
