# Subscriptions：历史付款日期与软件获取成本

对应 Project #211、#212。

## 历史付款日期

详情付款历史的「修改日期」复用全局 Sheet，Web／本地共享。只改 paid_on（实际付款日）；scheduled_for（账期归属日）、金额、币种、备注、原记录 ID／创建时间保持不变。月度／年度实际支出及付款时间线按修正后日期读取，不新增付款、价格记录，不推进固定订阅续费日期或补记自动付款。

PATCH /api/subscriptions/:id/payments/:paymentId 输入 paidOn、expectedPaidOn；MCP subscription.update_payment_date 输入 payment_id、paid_on、expected_paid_on。按订阅与付款 ID、账户归属及原日期核对，过期表单返回冲突，相同结果可重试。不能设置未来付款日，接口拒绝附带 scheduledFor 等其他修改字段。

手动会员仍可从原购买编辑表单修改日期；MCP 日期修正复用原购买事务及有效期排序规则，不绕过 valid_until 约束，提醒跟随权益逻辑。固定周期的 scheduled_for 不变，因此读取后的自动补账不会重建已修正日期的账期付款。

## 软件获取成本

software_library 新增可空 purchase_amount_minor、purchase_currency；unknown 为双 null，已知金额含明确零元且必须有三字母币种。旧条目保持 unknown，获取方式不会推断价格；复用 acquired_on，不新增购买日期。API 输入 purchaseAmount（主币单位）、purchaseCurrency，输出整数分。旧客户端更新资料时省略金额字段会保留已有成本；显式 null 或空金额清除金额和币种。

软件库保留四列图标网格，顶部显示按币种分开的已记录总额／覆盖数量；名称下方以较轻小字显示已记录价格，零元显示「免费」，未知金额留空。金额在软件详情及新增／编辑表单中录入，卡片尺寸不变。总额不随清单筛选改变，覆盖数量以整个软件库为准。费用不生成订阅、付款或提醒，不计入订阅趋势及未来预测。

MCP software_library 提供 search/get/create/update：purchase_amount 为主币输入，purchase_amount_minor 只读；PATCH 省略字段保留，清空 purchase_amount 同时清空币种。支持分类、平台、获取方式筛选。

SQLite v96 及 Supabase 202611040002_software_library_cost.sql 为原表添加两列及金额／币种约束，保留现有行、账户外键及 RLS。备份沿用资源与版本，更新 schema 标识，新增列随原表导出恢复，旧备份缺少列时保持 null。本地快照字段可选，兼容旧缓存，并核查金额和币种成对有效。

生产迁移已于 2026-11-04 18:10（Asia/Shanghai）应用；事务内核对原有 4 个软件、13 个订阅和 12 笔付款数据指纹不变。Web 沿用 main → Vercel 发布链，未打包 IPA。按用户要求，实际验收后再更新 Project 进度。

## 验证结果

完整 Node 回归运行 820 项：初轮 802 通过、15 项可选环境检查跳过，3 项失败。新增 MCP 资源／action 数量及业务效果描述补齐后，两份 MCP 契约测试通过；Cats 测试的临时图片重命名受沙箱临时目录权限影响，使用工作区临时目录单独复查通过。三份失败文件合计 26 项复查全部通过，未修改 Cats 业务代码。最终补充模式切换历史日期场景后的 10 项针对测试全部通过。

Web 与本地 Vite 最终构建、TypeScript、相关 ESLint、git diff --check 通过；Vite 仍有现有 chunk 大小提示。Impeccable 对变更界面机械检查无发现。Chromium／WebKit 在隔离 SQLite 和合成原生桥接下，验证 Web／本地共享界面的日期修正、费用新增／编辑／清空、原获取日期保留、深浅主题和 375／402／1280 宽度；截图和日志保存于 tmp/items-211-212-* 及 tmp/subscription-improvements-*。所有测试服务均在 finally 关闭并核验监听释放。没有 iPhone 16 Pro 真机验收。

发布副本最终验证：完整回归 820 项，805 通过、15 项原有环境检查跳过、0 失败；Web／本地前端构建和 WebKit 的 Web／本地共享界面流程通过。发布只包含 #211、#212 与网格价格，不包含工作区其他视觉探索。
