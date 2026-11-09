import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (args.some((arg) => /^(-H|--hostname)/.test(arg) || arg === "--")) {
  throw new Error("The local launcher always binds to 127.0.0.1. Use dev:online for Supabase previews.");
}
const next = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const child = spawn(process.execPath, [next, "dev", ...args, "--hostname", "127.0.0.1"], {
  stdio: "inherit",
  env: { ...process.env, EVAORBIT_SQLITE_LOOPBACK_LAUNCHER: "1" },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => { process.exitCode = code ?? 1; });
