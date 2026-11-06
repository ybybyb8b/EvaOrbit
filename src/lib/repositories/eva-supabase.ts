import type { SupabaseClient } from "@supabase/supabase-js";
import { evaJobFromRow, type EvaStore, type EvaCall, type EvaSettings } from "../eva.ts";
import { ConflictError } from "../errors.ts";
import { safeEvaError } from "../eva-feedback.ts";

export function createSupabaseEvaStore(client: SupabaseClient): EvaStore {
  async function command(action: string, input: object = {}) {
    const { data, error } = await client.rpc("eva_command", { p_action: action, p_data: input });
    if (error) {
      if (error.message.includes("EVA_")) throw new ConflictError("Eva 状态已改变或尚未开启，请刷新后重试。");
      if (action === "finish") throw Object.assign(new Error(safeEvaError(error.message) || "Database could not commit Eva result"), { databaseCode: /^[A-Z0-9]{5,12}$/.test(error.code ?? "") ? error.code : undefined });
      throw new Error("暂时无法读取或保存 Eva 纸条，请检查服务是否已更新。");
    }
    return data;
  }
  const job = async (action: string, input: object) => { const row = await command(action, input); return row ? evaJobFromRow(row) : null; };
  return {
    async settings(patch) { return await command("settings", patch ?? {}) as EvaSettings; },
    async capture(key, content, process) { return (await job("capture", { key, content, process }))!; },
    async list() { return (await command("list") as Record<string, unknown>[]).map(evaJobFromRow); },
    async get(id) { return job("get", { id }); },
    async claim(id, lease) { return job("claim", { id, lease }); },
    async usage(id, usage) { await command("usage", { id, usage }); },
    async calls() { return await command("calls") as EvaCall[]; },
    async latestCall(jobId) {
      const { data, error } = await client.from("eva_calls").select("*").eq("job_id", jobId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error("Could not read Eva attempt status");
      return data ? { id: String(data.id), jobId, createdAt: String(data.created_at), ...(data.usage ?? { input: null, output: null, cached: null, cost: null, currency: null, model: "unknown", pricing: null, promptVersion: "unknown" }) } as EvaCall : null;
    },
    async finish(id, lease, result) { return (await job("finish", { id, lease, result }))!; },
    async fail(id, lease) { await command("fail", { id, lease }); },
    async decide(id, action, instruction) { return (await job("decide", { id, action, instruction }))!; },
  };
}
