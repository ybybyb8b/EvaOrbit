import type { RelationBalance, RelationEvent, RelationEventType, RelationFlowType } from "./types";

export type RelationPartyInput = { key: string; partyType: "self" | "person"; personId: number | null; shareAmountMinor: number | null; paidAmountMinor: number | null };
export type RelationItemInput = { label: string; amountMinor: number; sortOrder: number };
export type RelationFlowInput = { fromKey: string; toKey: string; flowType: RelationFlowType; amountMinor: number; settlesFlowId: number | null; note: string | null };
export type RelationEventInput = {
  eventType: RelationEventType; title: string; note: string | null; occurredAt: string; occurredHasExplicitTime: boolean;
  currency: "CNY"; totalAmountMinor: number | null; isInPerson: boolean | null;
  parties: RelationPartyInput[]; items: RelationItemInput[]; flows: RelationFlowInput[];
};

export class RelationRuleError extends Error {}
const coverageTypes = new Set<RelationFlowType>(["advance", "treat"]);

function assertMinor(value: number | null, field: string, allowZero = true) {
  if (value === null || !Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) throw new RelationRuleError(`${field}必须是${allowZero ? "非负" : "正"}整数分`);
}

export function validateRelationEvent(input: RelationEventInput) {
  if (!input.title.trim()) throw new RelationRuleError("事件标题不能为空");
  if (input.currency !== "CNY") throw new RelationRuleError("Phase 1 仅支持 CNY");
  if (input.parties.length < 2) throw new RelationRuleError("事件至少需要我和一位人物");
  const keys = new Set(input.parties.map((party) => party.key));
  if (keys.size !== input.parties.length || [...keys].some((key) => !key)) throw new RelationRuleError("参与者标识必须唯一且非空");
  const self = input.parties.filter((party) => party.partyType === "self");
  if (self.length !== 1 || self[0].personId !== null) throw new RelationRuleError("事件必须且只能包含一个“我”参与者");
  const personIds = input.parties.filter((party) => party.partyType === "person").map((party) => party.personId);
  if (personIds.some((id) => id === null || !Number.isSafeInteger(id) || id! <= 0) || new Set(personIds).size !== personIds.length) throw new RelationRuleError("人物参与者必须有效且不能重复");

  for (const item of input.items) { if (!item.label.trim()) throw new RelationRuleError("明细名称不能为空"); assertMinor(item.amountMinor, "明细金额"); }
  for (const flow of input.flows) {
    if (!keys.has(flow.fromKey) || !keys.has(flow.toKey) || flow.fromKey === flow.toKey) throw new RelationRuleError("往来流向参与者无效");
    assertMinor(flow.amountMinor, "往来金额", false);
  }

  const allowed: Record<RelationEventType, RelationFlowType[]> = { expense: ["advance", "treat"], gift: ["gift"], repayment: ["repayment"], favor: ["favor"], interaction: [] };
  if (input.flows.some((flow) => !allowed[input.eventType].includes(flow.flowType))) throw new RelationRuleError("往来类型与事件类型不匹配");

  if (input.eventType === "expense") {
    assertMinor(input.totalAmountMinor, "总金额");
    for (const party of input.parties) { assertMinor(party.shareAmountMinor, "应承担金额"); assertMinor(party.paidAmountMinor, "实际支付金额"); }
    const total = input.totalAmountMinor!;
    if (input.parties.reduce((sum, party) => sum + party.shareAmountMinor!, 0) !== total) throw new RelationRuleError("各参与者应承担金额之和必须等于总金额");
    if (input.parties.reduce((sum, party) => sum + party.paidAmountMinor!, 0) !== total) throw new RelationRuleError("各参与者实际支付金额之和必须等于总金额");
    if (input.items.length && input.items.reduce((sum, item) => sum + item.amountMinor, 0) !== total) throw new RelationRuleError("消费明细金额之和必须等于总金额");
    for (const party of input.parties) {
      const outgoing = input.flows.filter((flow) => coverageTypes.has(flow.flowType) && flow.fromKey === party.key).reduce((sum, flow) => sum + flow.amountMinor, 0);
      const incoming = input.flows.filter((flow) => coverageTypes.has(flow.flowType) && flow.toKey === party.key).reduce((sum, flow) => sum + flow.amountMinor, 0);
      if (outgoing - incoming !== party.paidAmountMinor! - party.shareAmountMinor!) throw new RelationRuleError(`参与者 ${party.key} 的代付/请客流向与支付差额不一致`);
    }
  } else {
    if (input.totalAmountMinor !== null || input.items.length) throw new RelationRuleError("非消费事件不记录总金额或消费明细");
    if (input.parties.some((party) => party.shareAmountMinor !== null || party.paidAmountMinor !== null)) throw new RelationRuleError("非消费事件不记录应承担或实际支付金额");
    if (input.eventType !== "interaction" && input.flows.length === 0) throw new RelationRuleError("该事件至少需要一条往来流向");
  }
  return input;
}

export function derivePersonBalance(events: RelationEvent[], personId: number): RelationBalance {
  let settlementMinor = 0, socialMinor = 0;
  for (const event of events) {
    const self = event.parties.find((party) => party.partyType === "self");
    const person = event.parties.find((party) => party.personId === personId);
    if (!self || !person) continue;
    for (const flow of event.flows) {
      const sign = flow.fromPartyId === self.id && flow.toPartyId === person.id ? 1 : flow.fromPartyId === person.id && flow.toPartyId === self.id ? -1 : 0;
      if (!sign) continue;
      if (flow.flowType === "advance" || flow.flowType === "repayment") settlementMinor += sign * flow.amountMinor;
      else socialMinor += sign * flow.amountMinor;
    }
  }
  return { settlementMinor, socialMinor };
}

export function derivePersonRecency(events: RelationEvent[]) {
  const latestEvent = events[0] ?? null;
  const lastMet = events.find((event) => event.isInPerson === true) ?? null;
  return {
    latestEvent,
    lastMetAt: lastMet?.occurredAt ?? null,
    lastMetHasExplicitTime: lastMet?.occurredHasExplicitTime ?? null,
  };
}

export function minorFromDecimal(value: string): number {
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value.trim())) throw new RelationRuleError("金额格式不正确，最多两位小数");
  const [whole, fraction = ""] = value.trim().split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(minor)) throw new RelationRuleError("金额过大");
  return minor;
}
