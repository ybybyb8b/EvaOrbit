import { z } from "zod";

type ResourceInfo = { resource: string; capabilities: string[]; actions: string[] };
export type AgentOperation = "search" | "get" | "create" | "update" | "delete" | "action";
export type AgentCall = { resource: string; operation: AgentOperation | "schema"; action?: string; id?: string | number; data?: Record<string, unknown>; requestId?: string };

export const CHATGPT_CLIENT = "614ae2e8-5759-40eb-ae0c-97188bc2010c";
export const HERMES_CLIENT = "a2035497-982a-4811-8711-acc12c5a2064";
export const resourceNames: Record<string, string> = {
  task: "任务", calendar_event: "日程", project: "项目", project_item: "项目事项",
  inbox: "收件箱", echo: "Echo 记忆", memory_context: "综合记忆检索",
  memory_entity: "记忆实体（含相关事实）", memory_fact: "记忆事实（含来源）",
  memory_source: "记忆来源", memory_candidate: "待审核记忆",
  health_record: "健康记录", insight_context: "跨模块生活分析", tracker: "Tracker",
  chronicle: "纪事", daily_energy: "能量", drink_limit: "饮用限额", drink_log: "饮用记录",
  food_log: "饮食记录", food_library: "食品库", food_dish: "菜单", food_place: "地点",
  nutrition_daily: "营养汇总", training_log: "训练记录", cat_pet: "猫咪档案",
  cat_record: "猫咪记录", cat_routine: "猫咪护理计划", lucius_state: "Lucius 状态",
  lucius_diary: "Lucius 日记", lucius_post: "Lucius 动态", lucius_post_comment: "Lucius 评论",
  media: "影视", media_series: "影视系列", person_note: "人物笔记", relation_person: "人物",
  relation_event: "交往事件", reminder: "提醒（含各模块提醒）", software_library: "软件库", subscription: "订阅",
};
const actionNames: Record<string, string> = {
  "task:complete": "完成任务", "task:reopen": "重新打开任务",
  "inbox:mark_processed": "标记收件已处理", "inbox:archive": "归档收件", "inbox:restore": "恢复收件",
  "tracker:create_entry": "添加 Tracker 记录", "tracker:update_entry": "修改 Tracker 记录",
  "daily_energy:upsert": "保存每日能量", "cat_routine:complete": "记录护理完成",
  "cat_routine:skip": "跳过本次护理", "reminder:complete": "完成独立提醒",
  "reminder:skip": "跳过独立提醒", "reminder:snooze": "延后独立提醒",
  "media:add_viewing": "添加观看记录", "media:update_viewing": "修改观看记录",
};
const sensitive = new Set(["echo","memory_context","memory_entity","memory_fact","memory_source","memory_candidate",
  "health_record","nutrition_daily","daily_energy","insight_context","relation_person","relation_event","person_note","lucius_diary","chronicle","reminder","subscription","tracker"]);
const ownerOnlyUpdates = new Set(["memory_entity","memory_fact","memory_source","memory_candidate","subscription"]);
const ownerOnlyCreates = new Set(["memory_entity","memory_fact","memory_source","memory_candidate","subscription"]);

export function canonicalResource(name: string) { return name === "memo" ? "echo" : name; }

export type AgentPermission = { key: string; resource: string; operations: AgentOperation[]; action?: string; label: string; sensitive: boolean; writes: boolean };

export function buildAgentPermissions(resources: ResourceInfo[]): AgentPermission[] {
  return resources.flatMap(({ resource, capabilities, actions }) => {
    if (!Object.hasOwn(resourceNames, resource)) return [];
    const name = resourceNames[resource];
    const permissions: AgentPermission[] = [];
    const add = (key: string, operations: AgentOperation[], label: string, writes = false, action?: string) =>
      permissions.push({ key: resource + ":" + key, resource, operations, label, writes, sensitive: sensitive.has(resource), action });
    const reads = (["search","get"] as const).filter((op) => capabilities.includes(op));
    for (const op of reads) add(op, [op], (op === "search" ? "查询" : "查看") + name);
    if (capabilities.includes("create") && !ownerOnlyCreates.has(resource)) add("create", ["create"],
      resource === "inbox" ? "投递收件记录" : resource === "food_library" ? "添加或覆盖同名食品" : "添加" + name, true);
    if (capabilities.includes("update") && !ownerOnlyUpdates.has(resource)) add("update", ["update"],
      resource === "project_item" ? "更新项目进度" : resource === "task" ? "修改任务内容与排期" : "修改" + name, true);
    for (const action of actions) {
      const label = actionNames[resource + ":" + action];
      if (label) add("action:" + action, ["action"], label, true, action);
    }
    return permissions;
  });
}

const ids = z.array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER)).max(100);
export const projectProgressFields = ["status", "next_step", "resolution"] as const;
const policySchema = z.strictObject({
  permissions: z.array(z.string().max(110)).max(200).default([]),
  projectIds: ids.default([]),
  trackerIds: ids.default([]),
  allProjects: z.boolean().default(false),
  allTrackers: z.boolean().default(false),
  inboxOwn: z.boolean().default(true),
  projectFields: z.array(z.enum(projectProgressFields)).max(3).default([...projectProgressFields]),
});
export type AgentPolicy = z.infer<typeof policySchema>;
export const emptyPolicy: AgentPolicy = policySchema.parse({});

export function parseAgentPolicy(value: unknown, permissions: AgentPermission[]): AgentPolicy {
  const policy = policySchema.parse(value);
  const catalog = new Set(permissions.map(({ key }) => key));
  if (policy.permissions.some((key) => !catalog.has(key))) throw new Error("Unknown Agent permission");
  return policy;
}

export function agentPermissionAllows(policy: AgentPolicy, permission: AgentPermission) {
  if (!policy.permissions.includes(permission.key)) return false;
  if (permission.resource.startsWith("project") && !policy.allProjects && !policy.projectIds.length) return false;
  if (permission.key === "project:create" && !policy.allProjects) return false;
  if (permission.key === "project_item:update" && !policy.projectFields.length) return false;
  if (permission.resource === "tracker" && !policy.allTrackers && !policy.trackerIds.length) return false;
  if (permission.key === "tracker:create" && !policy.allTrackers) return false;
  return true;
}

export function allowsAgentCall(policy: AgentPolicy, permissions: AgentPermission[], call: AgentCall) {
  const resource = canonicalResource(call.resource);
  const allowed = permissions.some((permission) => permission.resource === resource && agentPermissionAllows(policy, permission)
    && (call.operation === "schema" || (permission.operations.includes(call.operation) && permission.action === call.action)));
  if (!allowed) return false;
  if (resource === "tracker" && call.id !== undefined && !policy.allTrackers && !policy.trackerIds.includes(Number(call.id))) {
    return false;
  }
  if (resource === "project" && call.id !== undefined && !policy.allProjects && !policy.projectIds.includes(Number(call.id))) return false;
  if (resource === "project_item" && call.operation === "create") {
    if (!policy.allProjects && !policy.projectIds.includes(Number(call.data?.project_id))) return false;
    return call.data?.status !== "verified";
  }
  if (call.operation === "update" && resource === "project_item") {
    return Object.keys(call.data ?? {}).every((key) => policy.projectFields.some((field) => field === key));
  }
  if (call.operation === "update" && resource === "task") {
    return !["completed","completed_on"].some((key) => Object.hasOwn(call.data ?? {}, key));
  }
  return true;
}

export function canChangeProjectStatus(from: string, to?: string) {
  if (to === undefined) return true;
  if (from === "verified" || from === "dropped") return false;
  const transitions: Record<string, string[]> = {
    idea: ["to_solve"], to_solve: ["doing", "blocked"], doing: ["blocked", "done"],
    blocked: ["doing", "done"], done: ["doing"],
  };
  return from === to || Boolean(transitions[from]?.includes(to));
}

export function legacyChatGptPolicy(permissions: AgentPermission[]): AgentPolicy {
  return { ...emptyPolicy, permissions: permissions.map(({ key }) => key),
    allProjects: true, allTrackers: true, inboxOwn: false };
}

export function agentPolicyForConnection(value: unknown, permissions: AgentPermission[], clientId: string) {
  const policy = parseAgentPolicy(value, permissions);
  return clientId === HERMES_CLIENT ? { ...policy, inboxOwn: true } : policy;
}

export function agentConnectionIsActive(connection: { state: string; expires_at: string | null }, now = Date.now()) {
  return connection.state === "active" && (!connection.expires_at || Date.parse(connection.expires_at) > now);
}

export function agentDataScope(policy: AgentPolicy, clientId: string, call: AgentCall) {
  const resource = canonicalResource(call.resource);
  return {
    projectIds: resource.startsWith("project") && !policy.allProjects ? policy.projectIds : undefined,
    trackerIds: resource === "tracker" && !policy.allTrackers ? policy.trackerIds : undefined,
    inboxClientId: resource === "inbox" && policy.inboxOwn ? clientId : undefined,
    requestId: call.requestId,
  };
}
