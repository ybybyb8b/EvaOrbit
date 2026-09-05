# EvaOrbit iOS Native Host：Windows / WSL 安装与续签 Runbook

> 后续开发会话在修改 Native Host、iOS 权限/capability、bridge、打包或签名之前，还必须先阅读维护契约 [`docs/IOS_NATIVE_MAINTENANCE.md`](./IOS_NATIVE_MAINTENANCE.md)。本文保留已经真机走通的详细安装、续签和故障排查步骤。
>
> 只想安装已经打包好的 IPA 时，先看 [`docs/IOS_IPA_INSTALL_QUICKSTART.md`](./IOS_IPA_INSTALL_QUICKSTART.md)。

本文只固化已经在 2026-09-01 实际跑通的构建、免费 Apple ID 重签、Windows → WSL → iPhone 通信和安装链路。EvaOrbit 仍是由 Vercel 托管、Supabase 提供后端的 Next.js Web 应用；iOS 工程只是加载生产站点的轻量 `WKWebView` Host。

本文的主体仍是已经实际跑通的构建、签名、安装与续签 runbook。仓库现已加入第一批 HealthKit 能量同步代码；它只读取静息能量和活动能量，并新增原生 SQLite/outbox、设备凭据、同步 API 与独立的 `healthkit_daily_energy` 表。部署这批代码前须先应用 `supabase/migrations/202609010001_healthkit_energy.sql`，再发布 Web，最后构建并重签新的 IPA。签名、patched xtool 和 Windows/WSL 通信基线没有改变。

## 已验证基线

### Native Host 构建链

GitHub Actions 的 `iOS Native Host` workflow 使用 `macos-15` runner：

1. 安装 XcodeGen 并从 `ios/EvaOrbitHost/project.yml` 生成 Xcode 工程。
2. 为 Simulator 编译 Host 和测试 bundle。
3. 使用 `iphoneos`、`Release` 和 ad-hoc signing 构建设备 `.app`。
4. 导出签名 entitlements，逐项断言以下值为 `true`：
   - `com.apple.developer.healthkit`
   - `com.apple.developer.healthkit.background-delivery`
5. 打包 `EvaOrbitHost-ad-hoc.ipa`，并同时发布 entitlements、IPA SHA-256、dSYM、Git SHA 和 Xcode 版本。

第一次实际构建产物导出的 entitlements 已确认上述两项均为 `true`。设备构建必须继续使用 ad-hoc code signing，不能用 `CODE_SIGNING_ALLOWED=NO` 生成完全 unsigned 的设备包；否则 patched xtool 没有可读取并重建的 entitlement。workflow 中 Simulator 编译使用 `CODE_SIGNING_ALLOWED=NO` 不属于设备包构建，不需要改变。

### 原生启动核心资源

启动轨道中央的核心图来自 `ios/EvaOrbitHost/Resources/Assets.xcassets/LoadingCore.imageset`：`LoadingCoreLight.png` 是 universal 默认浅色资源，`LoadingCoreDark.png` 是 dark luminosity 变体。修改任一图片后都要重新运行 `iOS Native Host` workflow 并安装新 IPA；仅替换这组资源不会改变 bridge、entitlement、framework、系统权限、签名方式或本文已经验证的 IPA 打包、重签和安装链。

### patched xtool 基线

- xtool upstream 固定为 `2d58d987edff728fccebc6df643b1672e3583f00`。
- `tools/xtool/patches/0001-healthkit-background-delivery.patch` 必须保留。它让免费 Team 重签时保留 `com.apple.developer.healthkit.background-delivery`。
- `tools/xtool/patches/0002-password-auth-compatibility.patch` 包含安全诊断、有限 503 重试、token 原子持久化和 fresh-TLS compatibility fix。
- 不使用未知来源的预编译 xtool，也不随意升级 upstream commit。升级前必须重新审计两份 patch、workflow 校验和真机行为。

今天出现过两个容易混淆的 AppImage 版本：

| EvaOrbit 提交 | AppImage SHA-256 | 结论 |
| --- | --- | --- |
| `652d234` | `5ec1cec6d5b60bb5d70c122b6f72b0da214f2e5d4831b67da42e507af8e79461` | auth compatibility 的有限 503 重试版本；真实日志中三次 AppTokens 请求仍全部 503，不能作为最终成功基线 |
| `0bacf52` | `9f23739f9ca45a7506d3290878853e067706b26f510deefafc9728add3c5a628` | 在前者基础上加入 fresh-TLS 修复；2026-09-01 实际完成 `Logged in` 和真机安装，当前复用基线 |

当前 workflow 会按顺序应用 HealthKit patch 和 auth patch，并检查 fresh-TLS marker。推荐把已审计 AppImage 安装为：

```bash
mkdir -p "$HOME/.local/bin"
install -m 755 /path/to/xtool-x86_64.AppImage "$HOME/.local/bin/xtool"
sha256sum "$HOME/.local/bin/xtool"
```

当前已验证输出必须是：

```text
9f23739f9ca45a7506d3290878853e067706b26f510deefafc9728add3c5a628
```

WSL 中运行 AppImage 需要：

```bash
export PATH="$HOME/.local/bin:$PATH"
export APPIMAGE_EXTRACT_AND_RUN=1
```

辅助脚本会自动设置这两项；无需把它们写进全局 shell 配置。

## 一次性准备

### Windows 和 iPhone

手机正常通过 USB 插在 Windows 上，不使用 `usbipd`，也不把 USB 设备附加给 WSL。已验证链路使用 Apple 安装在 Windows 的 usbmuxd：

```text
Windows 127.0.0.1:27015
  → Windows portproxy 0.0.0.0:27016
  → WSL <windows-gateway>:27016
  → iPhone
```

准备条件：

- Windows 已安装 Apple Devices、iTunes 或其他包含 Apple Mobile Device Service 的官方组件。
- iPhone 已解锁、信任这台电脑并开启 Developer Mode。
- WSL Ubuntu 已安装 `usbmuxd`、`libimobiledevice-utils`、`zip` 和 `timeout`（Ubuntu 的 `coreutils`）。
- 仓库可从 WSL 访问，例如 Windows 的 `E:\EvaOrbit` 对应 `/mnt/e/EvaOrbit`。

在管理员 PowerShell 中先确认 Apple 服务监听 27015，然后建立 portproxy 和防火墙规则：

```powershell
netstat -ano | findstr 27015
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=27016 connectaddress=127.0.0.1 connectport=27015
New-NetFirewallRule -DisplayName "usbmuxd-wsl" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 27016
```

此配置在 Windows 重启和 WSL 新会话后通常仍保留，不要每次重复创建。可用以下命令检查：

```powershell
netsh interface portproxy show v4tov4
Get-NetFirewallRule -DisplayName "usbmuxd-wsl"
```

27016 会监听所有 Windows 网络接口，只应在可信网络使用。不再需要时可在管理员 PowerShell 删除：

```powershell
netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=27016
Remove-NetFirewallRule -DisplayName "usbmuxd-wsl"
```

### WSL 依赖

只需首次安装：

```bash
sudo apt-get update
sudo apt-get install -y usbmuxd libimobiledevice-utils zip coreutils
```

脚本运行时出现 `[sudo] password for ...`，需要输入 WSL/Ubuntu 用户密码，不是 Apple ID 密码。终端不显示密码字符属于正常行为。

## WSL 环境辅助脚本

在每个新 WSL 会话中，从仓库根目录 source：

```bash
cd /mnt/e/EvaOrbit
source scripts/ios/xtool-env.sh
```

必须使用 `source`，因为普通执行的子进程无法把环境变量带回当前 shell。脚本会：

1. 检查 `~/.local/bin/xtool` 是否存在且可执行。
2. 默认校验当前真机验证版本的 SHA-256。
3. 设置 `PATH` 和 `APPIMAGE_EXTRACT_AND_RUN=1`。
4. 停止 WSL 自己的 usbmuxd，避免与 Windows transport 冲突。
5. 通过以下已验证方式自动解析 Windows gateway：

   ```bash
   windows_gateway="$(ip route show default | awk 'NR == 1 { print $3 }')"
   export USBMUXD_SOCKET_ADDRESS="${windows_gateway}:27016"
   ```

6. 检查 gateway 的 TCP 27016 是否可达。
7. 只调用 `ideviceinfo -k ActivationState` 验证真机，不输出 UDID、IMEI 或序列号。
8. 输出 `auth status`、设备检查和安装的下一步命令。

如果 AppImage 是经过重新审计的新构建，可以临时跳过固定 SHA 检查：

```bash
source scripts/ios/xtool-env.sh --skip-sha256
```

不要把 `--skip-sha256` 当成日常选项。应先更新脚本和本文中的已审计 SHA，才能把新构建作为长期基线。

`scripts/ios/xtool-install.sh` 会自动 source 同一辅助脚本，因此直接安装时也会执行 SHA、TCP 和 `ideviceinfo` 检查。

## Apple authentication：已验证问题和处理

实际验证表明 Apple ID 密码、SRP 和 2FA 可以完成。失败发生在认证成功后的 App Token 请求：

```text
request: GrandSlamAppTokensRequest
endpoint: https://gsa.apple.com/grandslam/GsService2
status: 503
content-type: text/html
body size: 190 bytes
```

原始 xtool 没有先检查 HTTP 响应，把 HTML 直接交给 plist decoder，因而表现为：

```text
Encountered unknown tag html on line 1
```

auth compatibility patch 的安全诊断只记录阶段、请求类型、不含 query 的 Apple endpoint、HTTP status、Content-Type、粗粒度响应类型和字节数；不会输出 Apple ID 密码、2FA、token、cookie 或完整响应。

`652d234` 加入了严格限定的重试策略：

- 只重试 `GrandSlamAppTokensRequest` 的 HTTP 503。
- 初次请求加两次重试，总计最多三次，间隔 2 秒、4 秒。
- 每次请求重新获取 anisette。
- 不重试密码、SRP、2FA 或其他 HTTP/解析错误。

真实日志证明仅靠重试仍可能连续三次得到相同 503。停止高频尝试并等待后，最终基线又让 GrandSlam complete 后的 App Token 请求使用 fresh TLS；2026-09-01 的下一次完整登录成功，并随后完成真机安装。

如果三次仍全部 503：

1. 立即停止，不要连续高频请求 Apple 服务。
2. 等待一段时间后，从 `xtool auth login` 完整重新登录。
3. 不使用 `--reset-2fa`，保留已经验证过的 xtool pseudo-device。
4. 只有排障时才启用安全诊断：

   ```bash
   XTL_AUTH_DIAGNOSTICS=1 xtool auth login
   ```

5. 分享日志前仍需检查并移除账号、验证码、token、cookie 和设备标识。

日常先运行：

```bash
xtool auth status
```

只有显示未登录或 token 失效时才运行：

```bash
xtool auth login
```

如果明确提示已有认证文件但无法读取，使用 patched xtool 清理后重新登录：

```bash
xtool auth logout
xtool auth login
```

不要把 Apple ID、密码、2FA、token 或 cookie 写进仓库、脚本、命令参数、CI secret 或排障日志。

## 场景 A：第一次安装

### 1. 获取 Native Host IPA

在 GitHub Actions 手动运行 `iOS Native Host`，下载并解压最新的 `EvaOrbitHost-ad-hoc-<run-number>` artifact。保留同一 artifact 中的：

- `EvaOrbitHost-ad-hoc.ipa`
- `EvaOrbitHost-ad-hoc-entitlements.plist`
- `SHA256SUMS`
- `GIT_SHA.txt`
- `XCODE_VERSION.txt`

在 WSL 进入解压目录，并使用 artifact 自带清单检查 IPA：

```bash
sha256sum -c SHA256SUMS
```

不要用旧 workflow 生成的完全 unsigned IPA。

### 2. 安装并确认 patched xtool

从 `Build patched xtool` 的已审计 artifact 取得 AppImage，安装到 `~/.local/bin/xtool`，并确认 SHA 为当前基线 `9f23739f...5a628`。不要从第三方下载预编译二进制。

### 3. 恢复 WSL → iPhone 环境

保持 iPhone 解锁并插在 Windows 上，然后：

```bash
cd /mnt/e/EvaOrbit
source scripts/ios/xtool-env.sh
```

脚本应依次报告 SHA 正确、TCP 27016 可达和 iPhone activation state。

### 4. 检查设备和认证

```bash
xtool devices
xtool auth status
```

`xtool devices` 只在本地查看，不要复制其设备标识到文档、issue 或聊天。如果未登录，再运行 `xtool auth login`。只有 xtool 明确索要 Apple ID password 时才输入 Apple ID 密码；`sudo` 提示输入的是 WSL 密码。

### 5. 安装 IPA

例如已验证的 Windows 文件 `D:\下载\EvaOrbitHost-ad-hoc.ipa` 在 WSL 中是：

```bash
cd /mnt/e/EvaOrbit
bash scripts/ios/xtool-install.sh /mnt/d/下载/EvaOrbitHost-ad-hoc.ipa
```

路径包含空格时使用一对普通半角双引号。若 Bash 只显示 `>`，说明上一条命令存在未闭合的引号；按实体键盘 `Ctrl+C` 取消并重新输入完整的一行。

如果 xtool 询问是否撤销旧的免费 Team certificate，按当前安装提示确认。不要主动 reset pseudo-device。

## 场景 B：7 天后续签 / 重新 install

免费签名需要周期性重新安装。续签不需要重新构建 Native Host；可以继续使用同一个可信 IPA，除非 EvaOrbit Native Host 代码已经更新。

最短流程：

```bash
cd /mnt/e/EvaOrbit
source scripts/ios/xtool-env.sh
xtool auth status
xtool devices
bash scripts/ios/xtool-install.sh /mnt/d/下载/EvaOrbitHost-ad-hoc.ipa
```

- WSL 依赖不需要重装。
- Windows portproxy 和防火墙规则通常不需要重建，只在辅助脚本报告 27016 不可达时检查。
- patched xtool 不需要重新构建或重新下载。
- pseudo-device 不要主动 reset，也不要使用 `--reset-2fa`。
- `auth status` 有效时不需要重新 `auth login`。
- 新开 WSL 后必须重新 export 环境；`source scripts/ios/xtool-env.sh` 会完成。
- 使用原 bundle identifier 和同一签名链重新 install；安装后仍要验证启动、登录状态和关键数据，本文不对 iOS 在所有异常签名状态下的数据保留作未经验证的保证。

## 场景 C：EvaOrbit 发布新版 IPA 后升级安装

先重新运行 `iOS Native Host` workflow，下载最新 artifact，并用该 artifact 的 `SHA256SUMS` 校验 IPA。之后不需要重建 Windows/WSL/xtool 环境：

```bash
cd /mnt/e/EvaOrbit
source scripts/ios/xtool-env.sh
xtool auth status
xtool devices
bash scripts/ios/xtool-install.sh /path/to/new/EvaOrbitHost-ad-hoc.ipa
```

只有 Native Host 代码、资源、版本或 entitlement 发生变化时才需要新 IPA。仅 Vercel 上的 Web 内容更新通常会由 WKWebView 直接加载，不需要因为 Web 发布重新安装 Host。

如果 auth 已失效，在安装前补一次 `xtool auth login`；其他持久配置不需要重复。

## 安装后的真机检查

每次首次安装或 Native Host 升级后至少检查：

- App 能启动并加载 EvaOrbit 生产站点，而不是空白页或循环刷新。
- Supabase 登录、退出、App 重启后的 cookie/session 行为。
- 内部导航、返回手势、外部链接和新窗口链接。
- 从 Photos 和 Files 上传头像、关系照片、媒体封面和 tracker 图片。
- iPhone 16 Pro 的安全区、横竖屏、表单、键盘聚焦和交互式收起。
- AI streaming，以及 WebKit content process 恢复。
- 离线启动错误页、重试和恢复联网。
- `window.EvaOrbitNative.call("host.ping")` 和 `host.getInfo()` 基础 bridge。

安装包含 HealthKit 能量同步的新 IPA 后，再进入 EvaOrbit 的 Health 页面并点击 `Connect / Request Access`；仅安装或启动 App 不会主动弹出权限框。授权页只应出现 Resting Energy 与 Active Energy 的读取请求。随后检查 `Data read`、两类 background delivery、pending 数、最近本地同步和最近上传时间。iOS 不向读取方透露每一种类型是否被允许，因此不能把“授权请求已完成”当成“读权限已授予”；`Data read` 只有在 EvaOrbit 实际读到样本后才会变化。

HealthKit 运行时实现不会改变本 runbook 的续签步骤。Web-only/PWA 不显示授权按钮；设备 token、样本 UUID、anchor 和原始样本不会写入 Web 日志，也不会上传原始样本。服务端只接收按自然日、按类型聚合的 kcal 快照。

## 常见故障定位

### 辅助脚本提示 xtool SHA 不匹配

停止操作，确认 `command -v xtool` 和 `~/.local/bin/xtool`。不要因为方便直接跳过校验。只有来源、固定 upstream、两份 patch 和 workflow 都完成审计后，才使用 `--skip-sha256` 做一次性验证并更新基线。

### TCP 27016 不可达

依次检查：

1. Windows 的 Apple usbmuxd 是否仍监听 `127.0.0.1:27015`。
2. `netsh interface portproxy show v4tov4` 是否仍有 `0.0.0.0:27016 → 127.0.0.1:27015`。
3. `usbmuxd-wsl` 防火墙规则是否启用。
4. Windows 网络是否为可信网络，防火墙是否改变。
5. 新 WSL 会话是否重新运行了环境辅助脚本。

### TCP 可达但 ideviceinfo 失败

解锁 iPhone，确认信任提示、Developer Mode、USB 线和 Apple Mobile Device Service。不要切换到 `usbipd`；已经验证的方案是 Windows usbmuxd TCP。

### `auth status` 显示 Logged out

在环境脚本成功后运行 `xtool auth login`。如果进入 2FA，按提示完成；不要 reset pseudo-device。

### AppTokens 返回 503 HTML

确认当前 xtool SHA 是 `9f23739f...5a628`。如果有限重试仍全部失败，停止并等待后再完整登录，不要高频撞 Apple 服务。安全诊断日志不能包含完整响应或任何认证信息。

### Bash 一直显示 `>`

这是未闭合引号的续行提示，不是安装进度。按实体键盘 `Ctrl+C`，使用实际路径重新输入单行命令，不要原样输入 `<username>` 等占位符。

## 持久配置与会话配置

| 项目 | 是否持久 | 何时需要重做 |
| --- | --- | --- |
| Windows Apple Mobile Device Service | 持久安装 | 服务缺失或损坏时修复 |
| Windows portproxy 27016 和防火墙规则 | 通常持久 | 规则丢失、网络/防火墙变化或主动删除时 |
| WSL 软件包 | 持久 | 新建/重装 WSL distro 时 |
| `~/.local/bin/xtool` | 持久 | 审计并采用新的 patched xtool 时 |
| xtool pseudo-device | 持久数据 | 不主动 reset；仅按明确故障方案处理 |
| xtool auth token | 持久但会失效 | `auth status` 失效时重新登录 |
| IPA 文件 | 持久文件 | Native Host 发布新版或文件被删除时重新下载 |
| `PATH`、`APPIMAGE_EXTRACT_AND_RUN` | 当前 WSL shell | 每次新开会话由辅助脚本设置 |
| `USBMUXD_SOCKET_ADDRESS` | 当前 WSL shell，且 gateway 可能变化 | 每次新开会话由辅助脚本重新解析并设置 |
| WSL 本地 usbmuxd 停止状态 | 不应假设持久 | 每次由辅助脚本停止 |

需要人工保留的只有非敏感审计信息：使用的 EvaOrbit Git SHA、GitHub Actions run/artifact、IPA 的 `SHA256SUMS`、Xcode 版本、固定 xtool upstream commit 和已审计 AppImage SHA。Apple ID、密码、2FA、token、cookie、UDID、IMEI、手机号和设备序列号都不得记录。
