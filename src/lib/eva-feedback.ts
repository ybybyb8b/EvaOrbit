import type { EvaJob } from "./eva.ts";

export type EvaStage = "configuration" | "request" | "response" | "parse" | "validation" | "save";
export type EvaRunFeedback = {
  stage: EvaStage; provider?: string; model?: string; requestStartedAt?: string; respondedAt?: string; repliedAt?: string;
  httpStatus?: number; requestId?: string; failure?: { code: string; message: string; databaseCode?: string };
};

/** Only a bounded structured error message, never a provider body or stack. */
export function safeEvaError(value: unknown, secrets: string[] = []) {
  let message = typeof value === "string" ? value : "";
  for (const secret of secrets.filter(Boolean)) message = message.split(secret).join("[redacted]").split(encodeURIComponent(secret)).join("[redacted]");
  return message.replace(/Bearer\s+[^\s,;"']+/gi, "Bearer [redacted]")
    .replace(/\b(?:sk|key)-[A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/((?:api[_-]?key|access[_-]?token|authorization|password|secret)\s*[=:]\s*)[^\s,;"']+/gi, "$1[redacted]")
    .replace(/https?:\/\/[^\s<>"']+/g, raw => { try { const url = new URL(raw); return `${url.origin}${url.pathname}`; } catch { return "[url]"; } })
    .replace(/[\u0000-\u001f]/g, " ").slice(0, 700).trim();
}

export function evaFailureTitle(feedback: EvaRunFeedback | undefined, english: boolean) {
  const code = feedback?.failure?.code;
  const titles: Record<string, [string, string]> = {
    configuration: ["Model is not configured or enabled", "模型未配置或未启用"],
    timeout: ["Model request timed out", "模型请求超时"], network: ["Could not connect to the model", "未能连接模型接口"],
    authentication: ["Model API rejected the credential", "模型接口拒绝了凭据"], permission: ["Model API denied access", "模型接口拒绝访问"],
    rate_limit: ["Model API rate or quota limit", "模型接口限流或额度不足"], provider: ["Model API returned an error", "模型接口返回错误"],
    incomplete: ["Model reply was incomplete", "模型回复不完整"], parse: ["Model reply is not valid JSON", "模型回复无法解析为 JSON"],
    validation: ["Model reply did not pass validation", "模型回复未通过校验"], save: ["Could not save the model result", "模型已回复，但结果保存失败"],
  };
  return titles[code ?? ""]?.[english ? 0 : 1] ?? (english ? "Sorting did not finish" : "整理未完成");
}

export function evaDeliveryText(job: EvaJob, english: boolean) {
  const f = job.feedback;
  if (f?.repliedAt) return english ? "Model reply received" : "已收到模型回复";
  if (f?.respondedAt) return english ? `Model API responded (HTTP ${f.httpStatus})` : `模型接口已响应（HTTP ${f.httpStatus}）`;
  if (f?.requestStartedAt) return english ? "Request started; model receipt is unconfirmed" : "已发起模型请求，尚未确认送达";
  if (job.status === "queued" || job.status === "running") return english ? "Paper saved; model delivery is not yet confirmed" : "纸条已保存，尚未确认发送到模型";
  return english ? "No confirmed model request" : "没有已确认的模型请求";
}

export function evaActivityLabel(job: EvaJob | undefined, phase: "sending" | "unknown" | "rejected" | undefined, english: boolean) {
  if (phase === "sending") return english ? "Sending paper…" : "正在发送纸条…";
  if (phase === "unknown") return english ? "Delivery unconfirmed" : "发送结果待确认";
  if (phase === "rejected") return english ? "Paper was not accepted" : "纸条未提交成功";
  if (!job) return english ? "Checking status…" : "正在确认状态…";
  if (job.status === "failed") return english ? "Eva needs a look" : "Eva 整理未完成";
  if (job.status === "review") return english ? "Eva has a question" : "Eva 有待确认内容";
  if (job.status === "done") { const count = job.taskIds.filter(Boolean).length; return count ? (english ? `${count} to-do${count === 1 ? "" : "s"} created` : `已创建 ${count} 个待办`) : (english ? "Paper sorted" : "纸条已整理"); }
  if (job.status === "held") return english ? "Paper kept in Inbox" : "纸条留在散落";
  if (job.feedback?.stage === "save") return english ? "Saving the result…" : "正在保存结果…";
  if (job.feedback?.repliedAt) return english ? "Reply received…" : "已收到回复…";
  if (job.feedback?.requestStartedAt) return english ? "Waiting for the model…" : "正在等待模型回应…";
  return english ? "Eva is preparing…" : "Eva 正在准备…";
}
