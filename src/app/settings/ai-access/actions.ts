"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MCP_RESOURCE } from "@/lib/mcp-identity";
import { agentPermissions } from "@/lib/mcp/agent-access";
import { CHATGPT_CLIENT, HERMES_CLIENT, agentPolicyForConnection } from "@/lib/mcp/agent-policy";
import { dateInEvaOrbit, shiftDate } from "@/lib/time";

async function ownerClient() {
  const client = await createSupabaseServerClient();
  const { data } = await client.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub || claims.client_id || [claims.aud].flat().includes(MCP_RESOURCE)) throw new Error("需要 EvaOrbit 网页会话");
  return client;
}

export type AccessActionState = { message: string; ok: boolean };

export async function syncAgentConnections(): Promise<AccessActionState> {
  try {
    const client = await ownerClient();
    const { data, error } = await client.auth.oauth.listGrants();
    if (error) throw error;
    const connections = data.map(({ client }) => ({
      client_id: client.id,
      name: client.id === CHATGPT_CLIENT ? "ChatGPT" : client.id === HERMES_CLIENT ? "Hermes" : client.name?.trim().slice(0, 100) || "AI Agent",
    }));
    if (connections.length) {
      const inserted = await client.from("agent_connections").upsert(connections, {
        onConflict: "user_id,client_id", ignoreDuplicates: true,
      });
      if (inserted.error) throw inserted.error;
    }
    revalidatePath("/settings/ai-access");
    return { message: connections.length ? "已同步连接，可以选择并确认权限。" : "当前账户还没有已连接的 AI。", ok: true };
  } catch {
    return { message: "暂时无法同步连接，请重试。", ok: false };
  }
}

const changeSchema = z.strictObject({
  clientId: z.uuid(),
  revision: z.number().int().nonnegative(),
  command: z.enum(["save", "pause", "resume", "revoke"]),
  name: z.string().trim().min(1).max(100).optional(),
  expires: z.iso.date().or(z.literal("")).optional(),
  policy: z.unknown().optional(),
});

export async function changeAgentConnection(input: unknown): Promise<AccessActionState> {
  try {
    const request = changeSchema.parse(input);
    const client = await ownerClient();
    const { data: existing, error } = await client.from("agent_connections")
      .select("state,revision,authorized_at,expires_at").eq("client_id", request.clientId).maybeSingle();
    if (error || !existing || existing.revision !== request.revision || existing.state === "revoked") {
      return { message: "连接已变更，请刷新后再试。", ok: false };
    }
    let patch: Record<string, unknown> = { revision: request.revision + 1 };
    if (request.command === "save") {
      const policy = agentPolicyForConnection(request.policy, agentPermissions, request.clientId);
      const expires = request.expires;
      if (expires && expires < dateInEvaOrbit()) return { message: "有效期须为今天或之后的日期。", ok: false };
      const selected = agentPermissions.filter(({ key }) => policy.permissions.includes(key));
      if (selected.some(({ resource }) => resource.startsWith("project")) && !policy.allProjects && !policy.projectIds.length) {
        return { message: "请为项目权限至少选择一个项目。", ok: false };
      }
      if (policy.permissions.includes("project:create") && !policy.allProjects) {
        return { message: "创建新项目需要开放全部项目。", ok: false };
      }
      if (selected.some(({ resource }) => resource === "tracker") && !policy.allTrackers && !policy.trackerIds.length) {
        return { message: "请为 Tracker 权限至少选择一个 Tracker。", ok: false };
      }
      if (policy.permissions.includes("tracker:create") && !policy.allTrackers) {
        return { message: "创建 Tracker 需要开放所有 Tracker。录入已有 Tracker 可使用指定范围。", ok: false };
      }
      if (policy.permissions.includes("project_item:update") && !policy.projectFields.length) {
        return { message: "请至少选择一个可修改的项目进度字段。", ok: false };
      }
      patch = { ...patch, policy, name: request.name, state: existing.state === "paused" ? "paused" : "active",
        authorized_at: existing.authorized_at ?? new Date().toISOString(),
        expires_at: expires ? new Date(`${shiftDate(expires, 1)}T00:00:00+08:00`).toISOString() : null };
    } else {
      if (request.command === "pause" && existing.state !== "active" || request.command === "resume" && existing.state !== "paused") {
        return { message: "当前状态无法执行该操作。", ok: false };
      }
      if (request.command === "resume" && existing.expires_at && Date.parse(existing.expires_at) <= Date.now()) {
        return { message: "请先更新已到期的授权日期。", ok: false };
      }
      patch.state = { pause: "paused", resume: "active", revoke: "revoked" }[request.command];
    }
    const updated = await client.from("agent_connections").update(patch)
      .eq("client_id", request.clientId).eq("revision", request.revision).select("revision").maybeSingle();
    if (updated.error || !updated.data) return { message: "权限未保存，请刷新后再试。", ok: false };
    revalidatePath("/settings/ai-access");
    if (request.command === "revoke") {
      const { error: revocationError } = await client.auth.oauth.revokeGrant({ clientId: request.clientId });
      return { message: revocationError ? "已立即收回 EvaOrbit 访问权限，客户端登录凭据未能同步收回。" : "连接已撤销。", ok: true };
    }
    return { message: "设置已保存。", ok: true };
  } catch {
    return { message: "权限未保存，请核对选项后重试。", ok: false };
  }
}
