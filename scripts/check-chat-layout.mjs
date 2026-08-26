const appUrl = process.env.EVAORBIT_LAYOUT_TEST_URL ?? "http://127.0.0.1:3000";
const debuggerUrl = process.env.EVAORBIT_CDP_URL ?? "http://127.0.0.1:9224";

async function openTarget(url) {
  const response = await fetch(`${debuggerUrl}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  if (!response.ok) throw new Error(`无法创建浏览器页面：${response.status}`);
  return response.json();
}

function cdpSocket(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const events = new Map();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(String(data));
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
      return;
    }
    const listeners = events.get(message.method) ?? [];
    listeners.splice(0).forEach((resolve) => resolve(message.params));
  });
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return {
    ready,
    send(method, params = {}) {
      const requestId = ++id;
      return new Promise((resolve, reject) => {
        pending.set(requestId, { resolve, reject });
        socket.send(JSON.stringify({ id: requestId, method, params }));
      });
    },
    once(method) {
      return new Promise((resolve) => events.set(method, [...(events.get(method) ?? []), resolve]));
    },
    close() { socket.close(); },
  };
}

async function updateIdentity(settings, names, avatars) {
  const response = await fetch(`${appUrl}/api/ai/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...settings, showUserName: names, showAssistantName: names, showAvatars: avatars }),
  });
  if (!response.ok) throw new Error(`保存身份测试组合失败：${response.status} ${await response.text()}`);
}

const settingsResponse = await fetch(`${appUrl}/api/ai/settings`);
if (!settingsResponse.ok) throw new Error(`读取设置失败：${settingsResponse.status}`);
const settings = await settingsResponse.json();
const sessionsResponse = await fetch(`${appUrl}/api/ai/sessions`);
const sessions = await sessionsResponse.json();
if (!sessions[0]) throw new Error("布局检查至少需要一个测试会话");

const target = await openTarget("about:blank");
const cdp = cdpSocket(target.webSocketDebuggerUrl);
await cdp.ready;
await cdp.send("Page.enable");
await cdp.send("Runtime.enable");

const widths = [375, 390, 430];
const modes = [
  { names: true, avatars: true, label: "names+avatars" },
  { names: true, avatars: false, label: "names-only" },
  { names: false, avatars: true, label: "avatars-only" },
  { names: false, avatars: false, label: "minimal" },
];
const results = [];

for (const mode of modes) {
  await updateIdentity(settings, mode.names, mode.avatars);
  for (const width of widths) {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 3, mobile: true });
    const loaded = cdp.once("Page.loadEventFired");
    await cdp.send("Page.navigate", { url: `${appUrl}/ai?session=${sessions[0].id}` });
    await loaded;
    await new Promise((resolve) => setTimeout(resolve, 900));
    const evaluation = await cdp.send("Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => {
        const selectors = ['.ai-workspace','.chat-main','.chat-topbar','.chat-title-group','.chat-topbar-tools','.chat-model-control','.chat-model-selector','.message-scroll','.message-list','.chat-message.user','.chat-message.user .message-body','.message-identity','.composer-wrap','.composer'];
        const metrics = Object.fromEntries(selectors.map(selector => {
          const element = document.querySelector(selector);
          if (!element) return [selector, null];
          const rect = element.getBoundingClientRect();
          return [selector, { left: rect.left, right: rect.right, width: rect.width, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }];
        }));
        const failures = Object.entries(metrics).filter(([, value]) => value && (value.left < -0.51 || value.right > innerWidth + .51 || value.scrollWidth > value.clientWidth + 1));
        return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, metrics, failures };
      })()`,
    });
    const value = evaluation.result.value;
    const pass = value.documentWidth <= value.viewport && value.failures.length === 0;
    results.push({ width, mode: mode.label, pass, failures: value.failures });
  }
}

await fetch(`${appUrl}/api/ai/settings`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
cdp.close();
console.log(JSON.stringify(results, null, 2));
if (results.some((result) => !result.pass)) process.exitCode = 1;
