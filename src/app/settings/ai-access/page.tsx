import type { Metadata } from "next";
import Link from "next/link";
import { usesSupabase } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { agentPermissions, type AgentConnection } from "@/lib/mcp/agent-access";
import { listProjects } from "@/lib/services/project";
import { getRepository } from "@/lib/repositories";
import { AiAccessView, type AccessHistory, type ViewProps } from "./view";
import styles from "./access.module.css";

export const metadata: Metadata = { title: "AI 访问管理" };
export const dynamic = "force-dynamic";

export default async function AiAccessPage({ searchParams }: {
  searchParams: Promise<{ connection?: string; before?: string }>;
}) {
  const { connection, before } = await searchParams;
  if (!usesSupabase()) return <div className={`page settings-detail-page ${styles.page}`}>
    <Link className="settings-back-link" href="/settings">全部设置</Link>
    <h1>AI 访问管理</h1>
    <p>此设置需要连接 EvaOrbit 云端账户。</p>
  </div>;
  let view: ViewProps;
  try {
    const client = await createSupabaseServerClient();
    const listed = await client.from("agent_connections").select("*").order("created_at");
    if (listed.error) throw listed.error;
    const connections = listed.data as AgentConnection[];
    const selected = connections.find(({ client_id }) => client_id === connection) ?? connections[0];
    let history = client.from("agent_access_history").select("id,client_id,occurred_at,resource,operation,target,result");
    if (selected) history = history.eq("client_id", selected.client_id);
    if (before && /^\d{1,15}$/.test(before)) history = history.lt("id", before);
    const [events, projects, trackers, latest] = await Promise.all([
      history.order("id", { ascending: false }).limit(31),
      listProjects({ limit: 200 }),
      getRepository().then((repository) => repository.listTrackers()),
      Promise.all(connections.map(({ client_id }) => client.from("agent_access_history").select("occurred_at")
        .eq("client_id", client_id).order("occurred_at", { ascending: false }).limit(1).maybeSingle())),
    ]);
    if (events.error || latest.some(({ error }) => error)) throw new Error("AI access history unavailable");
    view = {
      connections, selectedId: selected?.client_id,
      lastSeen: Object.fromEntries(connections.map(({ client_id }, index) => [client_id, latest[index].data?.occurred_at ?? null])),
      permissions: agentPermissions,
      projects: projects.map(({ id, name }) => ({ id, name })),
      trackers: trackers.map(({ id, name, groupName }) => ({ id, name: groupName ? `${groupName} / ${name}` : name })),
      events: (events.data as AccessHistory[]).slice(0, 30),
      nextBefore: events.data.length > 30 ? String(events.data[29].id) : undefined,
      onHistoryPage: Boolean(before),
    };
  } catch {
    return <div className={`page settings-detail-page ${styles.page}`}>
      <Link className="settings-back-link" href="/settings">全部设置</Link>
      <h1>AI 访问管理</h1>
      <p role="alert">暂时无法读取连接或访问记录。</p>
      <Link href="/settings/ai-access" className="button secondary">重试</Link>
    </div>;
  }
  return <AiAccessView {...view} />;
}
