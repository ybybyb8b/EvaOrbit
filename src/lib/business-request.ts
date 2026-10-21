// Shared forms keep using the Web implementation; the installed local shell
// supplies one account-bound transport. Never replace global/window.fetch.
export type BusinessRequest = (path: string, init?: RequestInit) => Promise<Response>;
let active: { request: BusinessRequest } | undefined;
export function installBusinessRequest(request: BusinessRequest) {
  const session = { request };
  active = session;
  return () => { if (active === session) active = undefined; };
}
export const businessFetch: BusinessRequest = (path, init) => {
  if(active&&(init?.method??"GET").toUpperCase()!=="GET")return Promise.reject(new Error("Reopen this form before saving. An account-bound request is required."));
  return active ? active.request(path, init) : fetch(path, init);
};
