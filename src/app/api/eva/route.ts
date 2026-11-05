import { after, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { getRepository } from "@/lib/repositories";
import { evaPricingSchema } from "@/lib/eva";
import { processEvaPaper, resumeEvaPapers } from "@/lib/services/eva";
import { ValidationError } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("capture"), key: z.uuid(), content: z.string().trim().min(1).max(10000), process: z.boolean() }).strict(),
  z.object({ action: z.literal("settings"), enabled: z.boolean().optional(), pricing: evaPricingSchema.nullable().optional() }).strict(),
  z.object({ action: z.enum(["retry", "keep", "approve", "revise"]), id: z.uuid(), instruction: z.string().trim().min(1).max(1500).optional() }).strict(),
  z.object({ action: z.literal("resume") }).strict(),
]);
export async function GET(request: Request) {
  try {
    const repository = await getRepository();
    if (new URL(request.url).searchParams.get("view") === "status") return NextResponse.json(await repository.eva.settings(), { headers: { "Cache-Control": "no-store" } });
    const [settings, jobs, calls] = await Promise.all([repository.eva.settings(), repository.eva.list(), repository.eva.calls()]);
    return NextResponse.json({ settings, jobs, calls }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return apiError(e); }
}
export async function POST(request: Request) {
  try {
    const parsed = input.safeParse(await request.json());
    if (!parsed.success) throw new ValidationError("纸条或操作格式不正确，请检查后重试。");
    const data = parsed.data, repository = await getRepository();
    if (data.action === "settings") {
      return NextResponse.json(await repository.eva.settings({ ...(data.enabled !== undefined ? { enabled: data.enabled } : {}), ...(data.pricing !== undefined ? { pricing: data.pricing } : {}) }));
    }
    if (data.action === "resume") { after(() => resumeEvaPapers(repository)); return NextResponse.json({ accepted: true }, { status: 202 }); }
    if (data.action === "revise" && !data.instruction) throw new ValidationError("请填写补充说明。");
    const job = data.action === "capture" ? await repository.eva.capture(data.key, data.content, data.process)
      : await repository.eva.decide(data.id, data.action, data.instruction);
    if (job.status === "queued") after(() => processEvaPaper(repository, job.id));
    return NextResponse.json(job, { status: data.action === "capture" ? 201 : 200 });
  } catch (e) { return apiError(e); }
}
