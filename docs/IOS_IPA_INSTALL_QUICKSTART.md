# EvaOrbit Native Host IPA 简易安装说明

这份说明用于把 GitHub Actions 打包好的 `EvaOrbitHost-ad-hoc.ipa` 安装到个人 iPhone。

当前方式是：

```text
Windows 上连接 iPhone
→ WSL 使用 Windows 的 Apple usbmuxd
→ patched xtool 用个人免费 Apple Team 重签
→ 安装 IPA
```

不需要 macOS 本地编译，也不要使用 `usbipd` 把 iPhone 附加给 WSL。

## 1. 准备 IPA

在 GitHub Actions 的 `iOS Native Host` workflow 下载最新 artifact，并解压到 Windows 文件夹。至少保留：

- `EvaOrbitHost-ad-hoc.ipa`
- `SHA256SUMS`
- `EvaOrbitHost-ad-hoc-entitlements.plist`

在 WSL 中进入解压目录，先校验 IPA：

```bash
sha256sum -c SHA256SUMS
```

不要使用旧的完全 unsigned device 包。

## 2. 连接 iPhone

1. 用 USB 将 iPhone 连接到 Windows。
2. 解锁 iPhone，点击“信任此电脑”。
3. 确认 iPhone 已开启 Developer Mode。
4. Windows 已安装 Apple Devices、iTunes 或包含 Apple Mobile Device Service 的官方组件。

手机保持连接在 Windows 上即可；不要在 WSL 中运行 USB 直通方案。

## 3. 准备 WSL 环境

首次使用 WSL 时安装依赖：

```bash
sudo apt-get update
sudo apt-get install -y usbmuxd libimobiledevice-utils zip coreutils
```

确认已经把经过审计的 patched xtool 安装为：

```text
~/.local/bin/xtool
```

然后在每个新的 WSL shell 中运行：

```bash
cd /mnt/e/EvaOrbit
source scripts/ios/xtool-env.sh
```

这个脚本会自动：

- 校验 xtool SHA-256；
- 设置 AppImage 运行环境；
- 停止会冲突的 WSL usbmuxd；
- 通过 Windows portproxy 配置 `USBMUXD_SOCKET_ADDRESS`；
- 检查 27016 端口；
- 只读取 iPhone activation state，不打印设备唯一标识。

如果提示 Windows portproxy 不可达，先参考 [`docs/IOS_NATIVE_HOST.md`](./IOS_NATIVE_HOST.md) 检查 Apple Mobile Device Service、27016 防火墙规则、数据线和信任状态。

## 4. 登录并确认设备

```bash
xtool auth status
xtool devices
```

如果未登录，再运行：

```bash
xtool auth login
```

只有 xtool 明确要求时才输入 Apple ID 密码。`sudo` 要求的是 WSL/Ubuntu 密码，两者不是同一个密码。

不要把 Apple ID、密码、2FA、token、cookie、UDID、IMEI 或序列号复制到仓库、日志或聊天中。

## 5. 安装 IPA

把 Windows 路径转换成 WSL 路径。例如：

```text
D:\下载\EvaOrbitHost-ad-hoc.ipa
```

对应：

```bash
/mnt/d/下载/EvaOrbitHost-ad-hoc.ipa
```

执行：

```bash
cd /mnt/e/EvaOrbit
bash scripts/ios/xtool-install.sh "/mnt/d/下载/EvaOrbitHost-ad-hoc.ipa"
```

脚本会再次检查 transport，然后调用 patched xtool 重签并安装。

## 6. 安装后检查

在 iPhone 上：

1. 打开 EvaOrbit。
2. 等待 Native loading 页面进入站点。
3. 进入 Settings → Notifications，确认 Native Notifications 显示为可用。
4. 需要时点击 Request Access，并在 iOS 系统弹窗中允许通知。
5. 进入 Apple Health 页面，确认 Native Host 可用；只有用户主动点击 Connect / Request Access 才请求 HealthKit 权限。

如果是验证本地通知，可在 Notifications 中使用 Test notification。浏览器打开 EvaOrbit 时不会调用 Native API，仍使用 Web Notifications / Web Push fallback。

## 7. 7 天后续签

个人免费 Team 的安装通常约 7 天过期。Native 代码没有变化时，不需要重新构建 IPA：

1. 保留同一个可信的 IPA。
2. iPhone 连接 Windows 并解锁。
3. 在新的 WSL shell 中再次执行：

```bash
cd /mnt/e/EvaOrbit
source scripts/ios/xtool-env.sh
bash scripts/ios/xtool-install.sh "/mnt/d/下载/EvaOrbitHost-ad-hoc.ipa"
```

如果 Swift、原生资源、Info.plist、entitlement 或 Native bridge 发生变化，必须先重新运行 GitHub Actions `iOS Native Host`，再安装新的 artifact。

## 常见注意事项

- 不要用完全 unsigned 的 `.app` 或 IPA 安装。
- 不要直接执行 `xtool` 绕过 `scripts/ios/xtool-env.sh` 的 SHA、transport 和设备检查。
- 不要随意使用 `--skip-sha256`；只有重新审计过的新 xtool 才能更新基线。
- Apple AppTokens 连续返回 503 时停止高频重试，等待后再完整登录；不要随意 `--reset-2fa`。
- 详细的首次配置、portproxy、防火墙、续签和故障排查见 [`docs/IOS_NATIVE_HOST.md`](./IOS_NATIVE_HOST.md)。
