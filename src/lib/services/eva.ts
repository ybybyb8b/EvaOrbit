import "server-only";
import { randomUUID } from "node:crypto";
import { EVA_PAPER_PROMPT, evaUsage, parseEvaResult, type EvaJob, type EvaUsage } from "../eva";
import type { EvaOrbitRepository } from "../repositories/types";
import { providerError } from "../ai-provider";

export async function processEvaPaper(repository: EvaOrbitRepository, id: string) {
  const lease = randomUUID(), job = await repository.eva.claim(id, lease);
  if (!job) return;
  let usage: EvaUsage | null = null;
  try {
    const settings = await repository.getAiRuntimeSettings();
    if (!settings.enabled || !settings.model || (!settings.apiKey && settings.providerPreset !== "ollama")) throw new Error("AI configuration unavailable");
    const { pricing } = await repository.eva.settings();
    usage = evaUsage({}, settings.model, pricing);
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
    if (!response.ok) throw await providerError(response, "Eva model request failed");
    const payload = await response.json() as Record<string, unknown>;
    usage = evaUsage(payload, settings.model, pricing);
    await repository.eva.usage(lease, usage);
    const choice = (payload.choices as Array<{ finish_reason?: string; message?: { content?: string } }> | undefined)?.[0];
    if (choice?.finish_reason === "length" || !choice?.message?.content) throw new Error("Incomplete output");
    const result = parseEvaResult(JSON.parse(choice.message.content), [job.content, ...job.context].join("\n"));
    await repository.eva.finish(id, lease, result);
  } catch {
    // Never log provider bodies, prompts or credentials. Unknown billed usage stays unknown.
    if (usage) await repository.eva.usage(lease, { ...usage, error: "processing_failed" }).catch(() => {});
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
