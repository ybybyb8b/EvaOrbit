import "server-only";
import { randomUUID } from "node:crypto";
import { EVA_PAPER_PROMPT, evaUsage, parseEvaResult, type EvaJob, type EvaUsage } from "../eva";
import type { EvaOrbitRepository } from "../repositories/types";
import { safeEvaError, type EvaRunFeedback, type EvaStage } from "../eva-feedback";

class EvaProcessingError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

async function providerFailure(response: Response, secrets: string[]) {
  const reader = response.body?.getReader(), decoder = new TextDecoder(); let text = "", bytes = 0;
  try {
    while (reader) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength; if (bytes > 16384) break;
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } finally { await reader?.cancel().catch(() => {}); }
  let message = "";
  try { const value = JSON.parse(text); const error = value.error; message = typeof error === "string" ? error : typeof error?.message === "string" ? error.message : ""; } catch { /* HTML and unstructured bodies never reach the UI. */ }
  const code = response.status === 401 ? "authentication" : response.status === 403 ? "permission" : response.status === 429 ? "rate_limit" : "provider";
  return new EvaProcessingError(code, safeEvaError(message, secrets) || `Model API returned HTTP ${response.status}`);
}

export async function processEvaPaper(repository: EvaOrbitRepository, id: string) {
  const lease = randomUUID(), job = await repository.eva.claim(id, lease);
  if (!job) return;
  let usage: EvaUsage = evaUsage({}, "unknown", null);
  let feedback: EvaRunFeedback = { stage: "configuration" };
  let secret = "";
  const publish = async (stage: EvaStage) => { feedback = { ...feedback, stage }; await repository.eva.usage(lease, { ...usage, feedback }); };
  try {
    const settings = await repository.getAiRuntimeSettings();
    secret = settings.apiKey;
    if (!settings.enabled || !settings.model || (!settings.apiKey && settings.providerPreset !== "ollama")) throw new EvaProcessingError("configuration", "Select an enabled default model and configure its Provider credential.");
    const { pricing } = await repository.eva.settings();
    usage = evaUsage({}, settings.model, pricing);
    feedback = { stage: "request", provider: settings.providerName, model: settings.model, requestStartedAt: new Date().toISOString() };
    await publish("request");
    const signal = AbortSignal.timeout(45000);
    // Exactly one bounded, non-streaming completion. No tool catalogue, persona or history recall.
    const response = await fetch(`${settings.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST", signal, cache: "no-store",
      headers: { "Content-Type": "application/json", ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}) },
      body: JSON.stringify({ model: settings.model, stream: false, max_tokens: 2500,
        response_format: { type: "json_object" }, messages: [
          { role: "system", content: EVA_PAPER_PROMPT },
          { role: "user", content: JSON.stringify({ capturedAt: job.createdAt, timezone: "Asia/Shanghai", paper: job.content }) },
          ...job.context.map(content => ({ role: "user", content: `仅修正同一张纸条：${content}` })),
        ] }),
    });
    feedback = { ...feedback, respondedAt: new Date().toISOString(), httpStatus: response.status,
      requestId: safeEvaError(response.headers.get("x-request-id") ?? response.headers.get("request-id") ?? "", [secret]).slice(0, 120) || undefined };
    await publish("response");
    if (!response.ok) throw await providerFailure(response, [secret]);
    await publish("parse");
    const payload = await response.json() as Record<string, unknown>;
    usage = evaUsage(payload, settings.model, pricing);
    feedback = { ...feedback, repliedAt: new Date().toISOString() };
    await publish("validation");
    const choice = (payload.choices as Array<{ finish_reason?: string; message?: { content?: string } }> | undefined)?.[0];
    if (choice?.finish_reason === "length" || !choice?.message?.content) throw new EvaProcessingError("incomplete", "The model returned no complete answer or reached the output token limit.");
    feedback = { ...feedback, stage: "parse" };
    const output = JSON.parse(choice.message.content);
    await publish("validation");
    const result = parseEvaResult(output, [job.content, ...job.context].join("\n"));
    await publish("save");
    await repository.eva.finish(id, lease, result);
  } catch (error) {
    const code = error instanceof EvaProcessingError ? error.code : error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "timeout"
      : feedback.stage === "configuration" ? "configuration" : feedback.stage === "request" ? "network" : feedback.stage === "save" ? "save" : feedback.stage === "validation" ? "validation" : "parse";
    const message = feedback.stage === "configuration" && !(error instanceof EvaProcessingError) ? "Could not load the model configuration. Check Provider settings."
      : feedback.stage === "save" ? `The model replied, but saving failed: ${safeEvaError(error instanceof Error ? error.message : "Unknown database error", [secret])}. Refresh the paper status before retrying.`
      : safeEvaError(error instanceof Error ? error.message : "Unknown processing error", [secret]);
    const databaseCode = feedback.stage === "save" && error instanceof Error && "databaseCode" in error && typeof error.databaseCode === "string" ? error.databaseCode : undefined;
    feedback = { ...feedback, failure: { code, message, ...(databaseCode ? { databaseCode } : {}) } };
    // Retain only bounded, credential-redacted diagnostics, never raw bodies or stack traces.
    await repository.eva.usage(lease, { ...usage, error: code, feedback }).catch(() => {});
    await repository.eva.fail(id, lease);
  }
}

export function evaPaperCanResume(job: EvaJob) {
  return job.attempts < 10 && (job.status === "queued" || job.status === "running" && Boolean(job.leaseUntil) && Date.parse(job.leaseUntil!) < Date.now());
}

// Explicit POST recovery: reading a workbench never starts a model or spends money.
export async function resumeEvaPapers(repository: EvaOrbitRepository) {
  const jobs = (await repository.eva.list()).filter(evaPaperCanResume).slice(0, 3);
  await Promise.allSettled(jobs.map(job => processEvaPaper(repository, job.id)));
}
