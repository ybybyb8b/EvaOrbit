import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// Next's dev worker must not inherit --env-file through NODE_OPTIONS.
const next = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const child = spawn(process.execPath, [next, "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, NODE_USE_ENV_PROXY: "1" },
});
child.on("error", error => { console.error("在线预览启动失败：", error.message); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
