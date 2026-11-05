import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { getRepository } from "@/lib/repositories";
import { evaPricingSchema } from "@/lib/eva";
import { ValidationError } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("capture"), key: z.uuid(), content: z.string().trim().min(1).max(10000), process: z.boolean() }).strict(),
  z.object({ action: z.literal("settings"), enabled: z.boolean().optional(), pricing: evaPricingSchema.nullable().optional() }).strict(),
  z.object({ action: z.enum(["retry", "keep", "approve", "revise"]), id: z.uuid(), instruction: z.string().trim().min(1).max(1500).optional() }).strict(),
  z.object({ action: z.literal("resume"), id: z.uuid().optional() }).strict(),
]);
export async function GET(request: Request) {
  try {
    const repository = await getRepository();
    if (new URL(request.url).searchParams.get("view") === "status") return NextResponse.json(await repository.eva.settings(), { headers: { "Cache-Control": "no-store" } });
    const params = new URL(request.url).searchParams;
    if (params.get("view") === "jobs") {
      const ids = z.array(z.uuid()).min(1).max(20).safeParse(params.get("ids")?.split(","));
      if (!ids.success) throw new ValidationError("纸条 ID 格式不正确。");
      const jobs = await Promise.all([...new Set(ids.data)].map(async id => {
        const job = await repository.eva.get(id);
        if (!job) return null;
        const call = await repository.eva.latestCall(id);
        return { ...job, feedback: job.status === "queued" || job.status === "running" && job.lease !== call?.id ? undefined : call?.feedback };
      }));
      return NextResponse.json({ jobs: jobs.filter(Boolean) }, { headers: { "Cache-Control": "no-store" } });
    }
    const [settings, jobs, calls] = await Promise.all([repository.eva.settings(), repository.eva.list(), repository.eva.calls()]);
    return NextResponse.json({ settings, jobs: jobs.map(job => { const call = calls.find(call => call.jobId === job.id); return { ...job, feedback: job.status === "queued" || job.status === "running" && job.lease !== call?.id ? undefined : call?.feedback }; }), calls }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return apiError(e); }
}
export async function POST(request: Request) {
  try {
    const parsed = input.safeParse(await request.json());
    if (!parsed.success) throw new ValidationError("纸条或操作格式不正确，请检查后重试。");
    const data = parsed.data, repository = await getRepository();
    // Compatibility for Home's idempotent Inbox-only save. Retired clients cannot start the former agent.
    if (data.action !== "capture" || data.process) return NextResponse.json({ error: "Papers 已停用，请在 Hermes 中发送便利贴。" }, { status: 410 });
    return NextResponse.json(await repository.eva.capture(data.key, data.content, false), { status: 201 });
  } catch (e) { return apiError(e); }
}
