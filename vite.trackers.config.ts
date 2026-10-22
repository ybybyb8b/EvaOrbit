import nativeRoutes from "./src/lib/native-routes.json";
import businessRoutes from "./src/lib/business-routes.json";
import {allowsBusinessRequest} from "./src/lib/business-request-policy";
import {allowsSettingsConfiguration} from "./src/lib/settings-configuration-request";
import {allowsAiConfiguration} from "./src/lib/ai-configuration-request";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { reiconNames, reiconSvg } from "./src/lib/reicon-catalog";

const root = fileURLToPath(new URL(".", import.meta.url));
const cloud = process.env.EVAORBIT_TRACKER_API_URL ?? "https://eva-orbit.vercel.app";
if (new URL(cloud).protocol !== "https:") throw new Error("Tracker development proxy requires HTTPS");

export default defineConfig(({ command }) => ({
  root: `${root}/src/local-trackers`,
  publicDir: `${root}/public`,
  resolve: { alias: { "@": `${root}/src` } },
  define: { "process.env.EVAORBIT_TIME_ZONE": JSON.stringify(process.env.EVAORBIT_TIME_ZONE || "Asia/Shanghai") },
  esbuild: { jsx: "automatic" },
  build: { outDir: `${root}/ios/EvaOrbitHost/Resources/TrackerWeb`, emptyOutDir: true, assetsInlineLimit: 0, target: "safari16" },
  server: {
    host: "127.0.0.1", port: 4178, strictPort: true,
    fs: { allow: [root] },
    proxy: { "/eo-api/": {
      target: cloud, changeOrigin: true, cookieDomainRewrite: "", cookiePathRewrite: "/",
      rewrite: path => path.startsWith("/eo-api/business/") ? `/api/${path.slice("/eo-api/business/".length)}` : path.startsWith("/eo-api/settings-config/") ? `/api/${path.slice("/eo-api/settings-config/".length)}` : path.startsWith("/eo-api/ai-config/") ? `/api/ai/${path.slice("/eo-api/ai-config/".length)}` : path === "/eo-api/inbox" ? "/api/inbox?status=all" : ["/eo-api/chronicle","/eo-api/memos"].includes(path) || /^\/eo-api\/trackers(?:\/[1-9][0-9]*(?:\/icon)?)?$/.test(path) ? `/api/${path.slice("/eo-api/".length)}` : `/api/native/${path.slice("/eo-api/".length)}`,
      configure(proxy) {
        proxy.on("proxyRes", response => {
          // Development-only loopback cookies; never shipped in the IPA.
          if (response.headers["set-cookie"]) response.headers["set-cookie"] = response.headers["set-cookie"].map(cookie => cookie.replace(/;\s*Secure/gi, ""));
        });
      },
    } },
  },
  plugins: [{name:"business-route-manifest",generateBundle(){this.emitFile({type:"asset",fileName:"native-routes.json",source:JSON.stringify(nativeRoutes)});this.emitFile({type:"asset",fileName:"business-routes.json",source:JSON.stringify(businessRoutes)});}}, { name: "local-settings-icons", resolveId(id) { if (id === "virtual:eo-reicon-assets") return "\0eo-reicon-assets"; }, async load(id) {
    if (id !== "\0eo-reicon-assets") return;
    const names = await reiconNames(), assets: Record<string, string> = {};
    await Promise.all(names.map(async name => { assets[name] = `data:image/svg+xml,${encodeURIComponent((await reiconSvg(name))!)}`; }));
    return `export default ${JSON.stringify(assets)};`;
  } }, { name: "tracker-acceptance-readonly", configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (!request.url?.startsWith("/eo-api/")) { next(); return; }
      const allowed = request.url.startsWith("/eo-api/business/") && allowsBusinessRequest(`/api/${request.url.slice("/eo-api/business/".length)}`,request.method??"") || request.url.startsWith("/eo-api/settings-config/") && allowsSettingsConfiguration(`/api/${request.url.slice("/eo-api/settings-config/".length)}`,request.method??"") || request.url === "/eo-api/sync" && request.method === "POST" || request.url.startsWith("/eo-api/ai-config/") && allowsAiConfiguration(`/api/ai/${request.url.slice("/eo-api/ai-config/".length)}`,request.method??"") || /^\/eo-api\/workspace-readonly\/(tasks|projects|lucius)$/.test(request.url??"") && request.method === "GET" || request.url === "/eo-api/media-readonly" && request.method === "GET" || request.url === "/eo-api/inbox" && request.method === "GET" || request.url === "/eo-api/memos" && request.method === "GET" || request.url === "/eo-api/chronicle" && request.method === "GET" || request.url === "/eo-api/relations-readonly" && request.method === "GET" || request.url === "/eo-api/health-readonly" && request.method === "GET" || request.url === "/eo-api/subscriptions-readonly" && request.method === "GET" || request.url === "/eo-api/cats-readonly" && request.method === "GET" || /^\/eo-api\/food-readonly\/(?:catalog\/current|place\/[1-9][0-9]*|item\/[1-9][0-9]*)$/.test(request.url ?? "") && request.method === "GET" || request.url === "/eo-api/food-readonly" && request.method === "GET" || request.url === "/eo-api/session" && ["GET", "POST", "DELETE"].includes(request.method ?? "") || /^\/eo-api\/trackers(?:\/[1-9][0-9]*(?:\/icon)?)?$/.test(request.url) && request.method === "GET" || /^\/eo-api\/home-readonly\/(?:day\/\d{4}-\d{2}-\d{2}|month\/\d{4}-\d{2}|due\/current)$/.test(request.url) && request.method === "GET";
      if (allowed) { next(); return; }
      response.statusCode = 403; response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ error: "只读验收模式禁止业务写入" }));
    });
  } }, { name: "tracker-client-directives", enforce: "pre", transform(code, id) {
    if (/\.[jt]sx?$/.test(id) && /^["']use client["'];?/.test(code)) return { code: code.replace(/^["']use client["'];?\s*/, ""), map: null };
  } }, { name: "tracker-local-csp", transformIndexHtml(html) {
    return command === "build" ? html.replace("<head>", '<head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: blob:; font-src \'self\'; connect-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'">') : html;
  } }],
}));
