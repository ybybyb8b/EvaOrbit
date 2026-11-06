/** Separate transport diagnostics from the message shown before details are opened. */
export function presentError(message: string, english: boolean) {
  const t = (en: string, zh: string) => english ? en : zh;
  const code = /\[EO:([\w.-]+)\]/i.exec(message)?.[1]?.toLowerCase();
  const status = Number(/\bHTTP\s+(\d{3})\b/i.exec(message)?.[1] ?? /^http_(\d{3})$/.exec(code ?? "")?.[1]);
  const operation = /\b(GET|HEAD|POST|PUT|PATCH|DELETE|REQUEST) (?:\/(?:api|eo-api)\/[^\s:]+|API request)(?: · [^:\n]+)?[:.]\s*/i.exec(message);
  const bridge = code && /^\s*[a-zA-Z]+\.[\w.]+(?: \((?:Calendar|Reminders)\))?(?: · [^:\n]+)?:\s*/.exec(message);
  const prefixLength = operation ? operation.index + operation[0].length : bridge ? bridge[0].length : 0;
  const raw = message.slice(prefixLength).replace(/\s*\((?:HTTP|URL error|Cocoa error|POSIX error|EventKit error|HealthKit error|OSStatus|Error) -?\d+\)|\s*\[EO:[\w.-]+\]/gi, "").trim();
  const technical = raw.length > 240 || /\n|^[<{]|^\[\s*[{"\]]|\b\w*Error:\s|\b(?:SQLSTATE|SQLITE_\w+|PGRST\d+|ECONN\w+|ENOTFOUND|stack trace|schema cache|violates (?:foreign key|unique|not-null)|duplicate key value|column .+ does not exist|relation .+ does not exist|row.level security|internal server error)\b/i.test(raw);
  const loading = operation && /^(GET|HEAD)$/i.test(operation[1]);
  let summary: string | undefined;

  if (/save result is unknown|保存结果.{0,8}(?:未知|不确定|无法确认)/i.test(message)) summary = t("Could not confirm the save. Refresh to check before submitting again.", "暂时无法确认是否保存成功。请刷新确认后再提交。");
  else if (code === "session_expired" || status === 401) summary = t("Your session has expired. Sign in again.", "登录已失效，请重新登录。");
  else if (code === "account_changed" || code === "account_mismatch") summary = t("The signed-in account changed. Reopen this page.", "当前登录账户已变化，请重新打开页面。");
  else if (code === "network_offline") summary = t("You’re offline. Reconnect and try again.", "当前未联网，请连接网络后再试。");
  else if (code === "network_timeout" || status === 408 || status === 504 || /timed? out|超时/i.test(raw)) summary = t("The request timed out.", "请求超时。");
  else if (code?.startsWith("network_") || code === "request_failed" || /failed to fetch|load failed|networkerror|network request failed/i.test(raw)) summary = t("Could not connect. Check your internet connection.", "暂时无法连接，请检查网络。");
  else if (code === "storage_full") summary = t("Device storage is full. Free some space and try again.", "本机存储空间不足，请释放空间后再试。");
  else if (code === "local_storage_failed") summary = t("Could not access local data. Check your device storage.", "暂时无法访问本机数据，请检查设备存储空间。");
  else if (status === 403 || code === "access_denied") summary = t("You don’t have permission for this action.", "当前没有此操作的权限。");
  else if (status === 404) summary = t("This item is no longer available.", "暂时找不到此内容。");
  else if (status === 429) summary = t("Too many requests. Try again shortly.", "操作过于频繁，请稍后再试。");
  else if (status >= 500 || technical || code === "json_decode_failed" || code === "operation_failed") summary = loading ? t("Could not load this content.", "暂时无法加载此内容。") : t("Could not complete this action.", "暂时无法完成此操作。");
  else if (code || Number.isFinite(status) || operation) summary = raw || t("Could not complete this action.", "暂时无法完成此操作。");

  return summary && summary !== message ? { summary, details: message } : { summary: message };
}
