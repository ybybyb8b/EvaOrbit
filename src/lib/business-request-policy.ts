import routes from "./business-routes.json" with {type:"json"};

export function allowsBusinessRequest(path: string, method: string): boolean {
  if (path.length > 4096 || !path.startsWith("/api/") || /[%\\#\u0000-\u0020]/.test(path.split("?")[0]) || path.includes("#")) return false;
  const pathname = path.split("?")[0];
  if (pathname.includes("//") || pathname.split("/").some(part => part === "." || part === "..")) return false;
  return routes.some(route => new RegExp(route.pattern).test(pathname) && route.methods.includes(method));
}
