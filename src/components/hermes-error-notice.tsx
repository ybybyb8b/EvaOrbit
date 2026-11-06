"use client";

import { ErrorNotice } from "./error-notice";
import { useLocale } from "./locale-controller";

export function HermesErrorNotice({ error, inline, fallback, className }: { error: string; inline?: boolean; fallback?: string; className?: string }) {
  const { english } = useLocale();
  const t = (en: string, zh: string) => english ? en : zh;
  const code = /\[EO:([\w.-]+)\]/.exec(error)?.[1];
  const status = Number(/\(HTTP (\d{3})\)/.exec(error)?.[1]);
  let summary = fallback ?? t("Hermes could not complete this action.", "Hermes 操作未完成。");

  if (code === "session_expired" || status === 401) summary = t("Your session has expired. Sign in again.", "登录已失效，请重新登录。");
  else if (code === "account_changed" || code === "account_mismatch") summary = t("The signed-in account changed. Reopen the page.", "当前登录账户已变化，请重新打开页面。");
  else if (code === "network_offline") summary = t("This device is offline.", "当前设备未联网。");
  else if (code === "network_timeout" || status === 504 || /timed? out|超时/i.test(error)) summary = t("The request timed out.", "请求超时。");
  else if (code?.startsWith("network_") || code === "request_failed" || /failed to fetch|load failed|networkerror/i.test(error)) summary = t("Could not connect to the message service.", "无法连接消息服务。");
  else if (status === 403) summary = t("This account cannot perform this action.", "当前账户没有此操作权限。");
  else if (status === 409) summary = t("The conversation has changed. Refresh and try again.", "对话状态已变化，请刷新后再试。");
  else if (status === 429) summary = t("Too many requests. Try again shortly.", "请求过于频繁，请稍后再试。");
  else if (status >= 500) summary = t("The Hermes message service encountered an error.", "Hermes 消息服务暂时出错。");
  else if (status === 400 || status === 422) summary = t("The message or action was invalid.", "消息或操作格式不正确。");

  return <ErrorNotice inline={inline} className={className} details={error === summary ? undefined : error}>{summary}</ErrorNotice>;
}
