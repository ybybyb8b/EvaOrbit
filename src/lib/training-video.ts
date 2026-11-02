/** Accept a link or Bilibili's copied share text, retaining the selected part. */
export function trainingVideoInput(text: string): { url: string; title?: string } {
  let url = (text.match(/https?:\/\/[^\s<>]+/i)?.[0] ?? text.trim()).replace(/[）)】。，,]+$/, "");
  if (isBilibiliVideoUrl(url)) {
    const clean = new URL(url);
    const part = clean.searchParams.get("p");
    clean.search = "";
    clean.hash = "";
    if (part && /^\d+$/.test(part)) clean.searchParams.set("p", part);
    url = clean.href;
  }
  const shared = text.match(/^\s*【([\s\S]+?)[-－—]哔哩哔哩】/);
  return { url, ...(shared ? { title: shared[1].trim().slice(0, 300) } : {}) };
}

export function isBilibiliVideoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      (["www.bilibili.com", "m.bilibili.com", "bilibili.com"].includes(url.hostname)
        ? /^\/video\/(?:BV[a-zA-Z0-9]{10}|av\d+)(?:\/|$)/i.test(url.pathname)
        : url.hostname === "b23.tv" && /^\/[a-zA-Z0-9]+\/?$/.test(url.pathname));
  } catch { return false; }
}

export async function resolveTrainingVideo(value: string, request: typeof fetch = fetch) {
  let url = new URL(value);
  // Every redirect is checked before requesting it; this endpoint is not a general URL proxy.
  for (let hops = 0; url.hostname === "b23.tv"; hops++) {
    if (hops >= 4 || !isBilibiliVideoUrl(url.href)) throw new Error("Invalid video redirect");
    const response = await request(url.href, { redirect: "manual", signal: AbortSignal.timeout(5000) });
    await response.body?.cancel();
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) throw new Error("Could not resolve video");
    url = new URL(location, url);
  }
  if (!isBilibiliVideoUrl(url.href)) throw new Error("Unsupported video link");
  const id = url.pathname.split("/")[2];
  const query = new URLSearchParams(/^BV/i.test(id) ? { bvid: id } : { aid: id.slice(2) });
  const response = await request(`https://api.bilibili.com/x/web-interface/view?${query}`, {
    headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.bilibili.com/" },
    redirect: "error", signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Could not get video title");
  const result = await response.json();
  const data = result.data;
  if (result.code !== 0 || typeof data?.title !== "string" || !data.title.trim()) throw new Error("Video unavailable");
  const part = Number(url.searchParams.get("p") ?? 1);
  const page = Number.isSafeInteger(part) && part > 1 ? data.pages?.find((item: { page: number }) => item.page === part) : null;
  return { url: `https://www.bilibili.com/video/${data.bvid}/${page ? `?p=${part}` : ""}`, title: `${data.title}${page?.part ? ` · P${part} ${page.part}` : ""}`.slice(0, 300) };
}
