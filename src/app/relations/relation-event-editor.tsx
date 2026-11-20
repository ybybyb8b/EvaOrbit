"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { ChoiceSelect } from "@/components/choice-select";
import { currentLocalDate, dateTimeDraft, dateTimePayload, DateTimeField } from "@/components/date-time-field";
import { Disclosure } from "@/components/disclosure";
import { ErrorNotice } from "@/components/error-notice";
import { ExpenseItemsInput } from "@/components/expense-items-input";
import { FormPreviewNotice, useFormPreview } from "@/components/form-preview";
import { useLocale } from "@/components/locale-controller";
import { useRelationsData } from "@/components/relations-data-context";
import { SearchableMultiSelect } from "@/components/searchable-multi-select";
import { SearchableSelect } from "@/components/searchable-select";
import { giftPriceSummary, minorFromDecimal, personOpenAdvances, validateRelationEvent, type RelationEventInput, type RelationFlowInput, type RelationPartyInput } from "@/lib/relations";
import { relationPersonDisplayName } from "@/lib/relation-people-view";
import type { RelationEvent, RelationEventType, RelationFlowType, RelationPerson } from "@/lib/types";
import { giftItemsFromDraft, RelationGiftItems, type GiftRow } from "./relation-gift-items";
import styles from "./relation-event-editor.module.css";

const eventLabels = {
  interaction: ["Interaction", "互动"], expense: ["Expense", "消费"], gift: ["Gift", "礼物"],
  repayment: ["Repayment", "还款"], favor: ["Favor", "人情"],
} satisfies Record<RelationEventType, [string, string]>;
const expenseModes = { aa: ["Split", "AA"], treat: ["Treat", "请客"], advance: ["Advance", "代付"], custom: ["Custom", "自定义"] };
type ExpenseMode = keyof typeof expenseModes;
type Allocation = { share: string; paid: string };
type Transfer = RelationFlowInput & { amount: string };
type Advance = ReturnType<typeof personOpenAdvances>[number] & { event: RelationEvent };

const personKey = (id: number | null) => id === null ? "self" : `p:${id}`;
const money = (minor: number | null) => minor === null ? "" : (minor / 100).toFixed(2);
const flowKey = (flow: Pick<RelationFlowInput, "fromKey" | "toKey">) => `${flow.fromKey}>${flow.toKey}`;
const itemDraft = (event?: RelationEvent) => event?.items.map(item => `${item.label} | ${money(item.amountMinor)}`).join("\n") ?? "";

function originalTransfers(event?: RelationEvent) {
  const parties = new Map(event?.parties.map(party => [party.id, personKey(party.personId)]));
  return (event?.flows ?? []).flatMap(flow => {
    const fromKey = parties.get(flow.fromPartyId);
    const toKey = parties.get(flow.toPartyId);
    return fromKey && toKey ? [{ fromKey, toKey, flowType: flow.flowType, settlesFlowId: flow.settlesFlowId, note: flow.note, amountMinor: flow.amountMinor, amount: money(flow.amountMinor) }] : [];
  });
}

function matchExpenseFlows(parties: RelationPartyInput[]) {
  const differences = parties.map(party => ({ key: party.key, difference: party.paidAmountMinor! - party.shareAmountMinor! }));
  const creditors = differences.filter(party => party.difference > 0);
  const debtors = differences.filter(party => party.difference < 0);
  const flows: Pick<RelationFlowInput, "fromKey" | "toKey" | "amountMinor">[] = [];
  for (const creditor of creditors) for (const debtor of debtors) {
    const amountMinor = Math.min(creditor.difference, -debtor.difference);
    if (!amountMinor) continue;
    flows.push({ fromKey: creditor.key, toKey: debtor.key, amountMinor });
    creditor.difference -= amountMinor;
    debtor.difference += amountMinor;
  }
  return flows;
}

export function RelationEventEditor({ people, editing, initialPersonId, onSaved, onBusy }: {
  people: RelationPerson[]; editing?: RelationEvent; initialPersonId?: number; onSaved: () => void; onBusy: (value: boolean) => void;
}) {
  const { read } = useRelationsData();
  const previewOnly = useFormPreview();
  const { english } = useLocale();
  const t = (en: string, zh: string) => english ? en : zh;
  const [type, setType] = useState<RelationEventType>(editing?.eventType ?? "interaction");
  const [selectedPeople, setSelected] = useState(() => editing ? editing.parties.flatMap(party => party.personId === null ? [] : [party.personId]) : initialPersonId ? [initialPersonId] : []);
  const [giftPerson, setGiftPerson] = useState(() => selectedPeople.length === 1 ? selectedPeople[0] : undefined);
  const [giftRecipients, setGiftRecipients] = useState(() => editing?.giftDirection === "out" ? selectedPeople : []);
  const [giftMulti, setGiftMulti] = useState(() => editing?.giftDirection === "out" && selectedPeople.length > 1);
  const [giftRows, setGiftRows] = useState<GiftRow[]>(() => editing?.giftDirection
    ? editing.items.map((item, index) => ({ key: index, label: item.label, amount: money(item.amountMinor) }))
    : [{ key: 0, label: "", amount: "" }]);
  const [date, setDate] = useState(() => editing ? dateTimeDraft(editing.occurredAt, editing.occurredHasExplicitTime) : { date: currentLocalDate(), time: "" });
  const [title, setTitle] = useState(editing?.title ?? "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [inPerson, setInPerson] = useState(editing?.isInPerson ?? null);
  const [mode, setMode] = useState<ExpenseMode>(editing?.eventType === "expense" ? "custom" : "aa");
  const [payer, setPayer] = useState("self");
  const [total, setTotal] = useState(money(editing?.totalAmountMinor ?? null));
  const [allocations, setAllocations] = useState<Record<string, Allocation>>(() => Object.fromEntries((editing?.parties ?? []).map(party => [personKey(party.personId), { share: money(party.shareAmountMinor), paid: money(party.paidAmountMinor) }])));
  const [original] = useState(() => originalTransfers(editing));
  const [transfers, setTransfers] = useState<Transfer[]>(original);
  const [flowKinds, setFlowKinds] = useState<Record<string, RelationFlowType>>({});
  const [itemText, setItemText] = useState(() => itemDraft(editing));
  const [direction, setDirection] = useState<"out" | "in">(() => editing?.giftDirection ?? (original[0]?.toKey === "self" ? "in" : "out"));
  const [value, setValue] = useState("");
  const [newAmounts, setNewAmounts] = useState<Record<string, string>>({});
  const [advanceOptions, setAdvanceOptions] = useState<{ personId: number; items: Advance[] }>();
  const [advanceId, setAdvanceId] = useState<number>();
  const [loadingAdvances, setLoadingAdvances] = useState(false);
  const [advanceError, setAdvanceError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const itemizedGift = type === "gift" && (editing?.eventType !== "gift" || Boolean(editing.giftDirection));
  const multiGift = itemizedGift && direction === "out" && giftMulti;
  const selected = itemizedGift ? multiGift ? giftRecipients : giftPerson === undefined ? [] : [giftPerson] : selectedPeople;
  const personOptions = people.filter(person => !person.archivedAt || selected.includes(person.id)).map(person => ({
    value: String(person.id), label: relationPersonDisplayName(person), detail: person.nickname ? person.name : undefined,
  }));
  const partyRows: RelationPartyInput[] = [null, ...selected].map(id => ({
    key: personKey(id), partyType: id === null ? "self" : "person", personId: id, shareAmountMinor: null, paidAmountMinor: null,
  }));
  const name = (key: string) => {
    if (key === "self") return t("Me", "我");
    const person = people.find(item => personKey(item.id) === key);
    return person ? relationPersonDisplayName(person) : `#${key.slice(2)}`;
  };
  const activeParties = new Set(partyRows.map(party => party.key));
  const linkedEdit = editing?.eventType === "repayment" && original.some(flow => flow.settlesFlowId !== null);
  const editingTransfers = !itemizedGift && editing?.eventType === type && type !== "interaction" && type !== "expense";
  const activeTransfers = transfers.filter(flow => activeParties.has(flow.fromKey) && activeParties.has(flow.toKey));
  const addedParties = partyRows.slice(1).filter(party => !editing?.parties.some(old => old.personId === party.personId));
  const advancePersonId = !editing && type === "repayment" && selected.length === 1 ? selected[0] : undefined;
  const candidateAdvances = advanceOptions?.personId === advancePersonId ? advanceOptions?.items : undefined;
  const selectedAdvance = candidateAdvances?.find(item => item.flow.id === advanceId);

  function changePeople(ids: number[]) {
    setSelected(ids);
    setAdvanceId(undefined);
    setAdvanceError("");
    if (payer !== "self" && !ids.some(id => personKey(id) === payer)) setPayer("self");
  }

  async function loadAdvances(personId: number) {
    setAdvanceError("");
    setLoadingAdvances(true);
    try {
      const response = await read(`/api/relations/people/${personId}`);
      if (!response.ok) throw new Error();
      const { events } = await response.json() as { events: RelationEvent[] };
      const byFlow = new Map(events.flatMap(event => event.flows.map(flow => [flow.id, event] as const)));
      setAdvanceOptions({ personId, items: personOpenAdvances(events, personId).map(item => ({ ...item, event: byFlow.get(item.flow.id)! })) });
    } catch {
      setAdvanceError(t("Could not load advances. Try again.", "暂时无法读取代付，请重试。"));
    } finally {
      setLoadingAdvances(false);
    }
  }

  function expenseDraft() {
    const totalMinor = minorFromDecimal(total);
    const base = Math.floor(totalMinor / partyRows.length);
    const remainder = totalMinor % partyRows.length;
    const parties = partyRows.map((party, index) => {
      const share = base + Number(index < remainder);
      return {
        ...party,
        shareAmountMinor: mode === "custom" ? minorFromDecimal(allocations[party.key]?.share || "0") : share,
        paidAmountMinor: mode === "custom" ? minorFromDecimal(allocations[party.key]?.paid || "0") : mode === "aa" ? share : party.key === payer ? totalMinor : 0,
      };
    });
    const noAllocationChange = editing?.eventType === "expense" && totalMinor === editing.totalAmountMinor &&
      parties.length === editing.parties.length && parties.every(party => editing.parties.some(old =>
        old.personId === party.personId && old.shareAmountMinor === party.shareAmountMinor && old.paidAmountMinor === party.paidAmountMinor));
    const matched = noAllocationChange ? original : matchExpenseFlows(parties);
    const flows: RelationFlowInput[] = matched.map((flow, index) => {
      const saved = noAllocationChange ? original[index] : original.find(previous => flowKey(previous) === flowKey(flow) && previous.amountMinor === flow.amountMinor);
      return {
        fromKey: flow.fromKey, toKey: flow.toKey, amountMinor: flow.amountMinor,
        flowType: mode === "custom" ? flowKinds[`${flowKey(flow)}-${index}`] ?? saved?.flowType ?? "advance" : mode === "treat" ? "treat" : "advance",
        settlesFlowId: saved?.settlesFlowId ?? null, note: saved?.note ?? null,
      };
    });
    return { totalMinor, parties, flows };
  }

  let expense: ReturnType<typeof expenseDraft> | undefined;
  if (type === "expense" && total && selected.length) {
    try { expense = expenseDraft(); } catch { /* Show the field error when the user submits. */ }
  }

  const amountLabel = selected.length > 1 ? t("Amount per person · ¥", "每人金额 · ¥") : t("Amount · ¥", "金额 · ¥");
  function decimalInput(label: string, amount: string, change: (amount: string) => void) {
    return <label className="field"><span>{label}</span><input required inputMode="decimal" value={amount} onChange={event => change(event.target.value)}/></label>;
  }

  function parseItems() {
    if (editing?.eventType === "expense" && itemText === itemDraft(editing)) {
      return editing.items.map(({ label, amountMinor, sortOrder }) => ({ label, amountMinor, sortOrder }));
    }
    return itemText.split("\n").filter(line => line.trim()).map((line, sortOrder) => {
      const separator = line.lastIndexOf("|");
      if (separator < 0) throw new Error(t("Give each item a name and amount.", "请填写每项明细的名称和金额。"));
      return { label: line.slice(0, separator).trim(), amountMinor: minorFromDecimal(line.slice(separator + 1).trim()), sortOrder };
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (previewOnly || saving) return;
    if (!selected.length) { setError(t("Choose at least one person.", "请至少选择一位参与人。")); return; }
    setError("");
    setSaving(true);
    onBusy(true);
    try {
      const when = dateTimePayload(date);
      const originalDate = editing && dateTimeDraft(editing.occurredAt, editing.occurredHasExplicitTime);
      const occurredAt = editing && originalDate?.date === date.date && originalDate.time === date.time ? editing.occurredAt : when.value;
      const common = { occurredAt, occurredHasExplicitTime: when.hasExplicitTime, note: note.trim() || null };
      let path = editing ? `/api/relations/events/${editing.id}` : "/api/relations/events";
      let body: RelationEventInput | (typeof common & { amountMinor: number });
      if (selectedAdvance) {
        const amountMinor = minorFromDecimal(value);
        if (amountMinor <= 0 || amountMinor > selectedAdvance.outstanding) throw new Error(t("Enter a positive amount up to the outstanding balance.", "还款金额须大于零，且不能超过待结清金额。"));
        path = `/api/relations/flows/${selectedAdvance.flow.id}/settle`;
        body = { ...common, amountMinor };
      } else {
        const savedExpense = type === "expense" ? expenseDraft() : undefined;
        const gifts = itemizedGift ? giftItemsFromDraft(giftRows) : [];
        if (itemizedGift && (!gifts.length || gifts.some(item => !item.label))) {
          throw new Error(t("Name each gift before saving.", "请填写礼物名称后再保存。"));
        }
        const newTransfer = (key: string, amount: string): RelationFlowInput => ({
          fromKey: direction === "out" ? "self" : key, toKey: direction === "out" ? key : "self",
          amountMinor: minorFromDecimal(amount), flowType: type as RelationFlowType, settlesFlowId: null, note: null,
        });
        let flows: RelationFlowInput[] = savedExpense?.flows ?? [];
        if (itemizedGift) {
          const knownAmount = giftPriceSummary(gifts).total ?? 0;
          if (knownAmount > 0) flows = partyRows.slice(1).map(other => ({
            fromKey: direction === "out" ? "self" : other.key, toKey: direction === "out" ? other.key : "self",
            flowType: "gift", amountMinor: knownAmount, settlesFlowId: null, note: null,
          }));
        } else if (editingTransfers) flows = [
          ...activeTransfers.map(({ amount, ...flow }) => ({ ...flow, amountMinor: minorFromDecimal(amount) })),
          ...addedParties.map(party => newTransfer(party.key, newAmounts[party.key] ?? "")),
        ];
        else if (type !== "expense" && type !== "interaction") flows = partyRows.slice(1).map(party => newTransfer(party.key, value));
        body = validateRelationEvent({
          ...common, eventType: type, giftDirection: itemizedGift ? direction : null, title: title.trim() || t(...eventLabels[type]), currency: "CNY", isInPerson: inPerson,
          totalAmountMinor: savedExpense?.totalMinor ?? null, parties: savedExpense?.parties ?? partyRows,
          items: savedExpense ? parseItems() : gifts, flows,
        });
      }
      const response = await read(path, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error((await response.json()).error || t("Could not save exchange.", "保存往来失败。"));
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("Could not save exchange.", "保存往来失败。"));
    } finally {
      onBusy(false);
      setSaving(false);
    }
  }

  const personLabel = t("People", "参与人");
  const giftPersonLabel = multiGift ? t("Recipients", "收礼人") : t("Other person", "对方");
  const directions = type === "favor" ? [t("I helped", "我帮对方"), t("They helped", "对方帮我")]
    : type === "repayment" ? [t("I repaid", "我还款"), t("They repaid", "对方还款")]
      : [t("I gave", "我送出"), t("I received", "我收到")];
  function changeDirection(event: ChangeEvent<HTMLSelectElement>) { setDirection(event.target.value === "in" ? "in" : "out"); }
  const directionChoice = <ChoiceSelect aria-label={t("Direction", "方向")} value={direction} onChange={changeDirection}><option value="out">{directions[0]}</option><option value="in">{directions[1]}</option></ChoiceSelect>;
  const mixedSplit = expense && new Set(expense.parties.map(party => party.shareAmountMinor)).size > 1;
  const shareTotal = expense?.parties.reduce((sum, row) => sum + row.shareAmountMinor, 0) ?? 0;
  const paidTotal = expense?.parties.reduce((sum, row) => sum + row.paidAmountMinor, 0) ?? 0;

  return <form className={`${styles.form} relation-editor field-focus-surface`} onSubmit={submit}>
    {previewOnly && <FormPreviewNotice/>}
    <DateTimeField label={t("Date", "日期")} value={date} onChange={setDate}/>
    <ChoiceSelect aria-label={t("Exchange type", "往来类型")} disabled={linkedEdit || Boolean(editing?.giftDirection)} value={type} onChange={event => {
      if (event.target.value === "gift" && giftPerson === undefined && selectedPeople.length === 1) setGiftPerson(selectedPeople[0]);
      setType(event.target.value as RelationEventType);
      setAdvanceId(undefined);
      setError("");
    }}>{Object.entries(eventLabels).map(([key, labels]) => <option key={key} value={key}>{t(...labels)}</option>)}</ChoiceSelect>
    {itemizedGift && directionChoice}
    {itemizedGift ? <>
      <div className="field">
        <div className={styles.giftPeopleHeading}>
          <span>{giftPersonLabel}</span>
          {direction === "out" && <button className={styles.recipientSwitch} type="button" data-form-change aria-expanded={multiGift} onClick={() => {
            if (multiGift && giftRecipients.length === 1) setGiftPerson(giftRecipients[0]);
            if (!multiGift && !giftRecipients.length && giftPerson !== undefined) setGiftRecipients([giftPerson]);
            setGiftMulti(!multiGift);
            setError("");
          }}>{multiGift ? t("Choose one person", "改为单人") : t("Send to multiple people", "送给多人")}</button>}
        </div>
        {multiGift ? <SearchableMultiSelect label={giftPersonLabel} value={giftRecipients.map(String)} options={personOptions}
          onValueChange={values => setGiftRecipients(values.map(Number))} required alwaysSearch hideSelectedOptions/>
          : <SearchableSelect label={giftPersonLabel} value={giftPerson === undefined ? "" : String(giftPerson)} options={personOptions}
            onValueChange={value => setGiftPerson(value ? Number(value) : undefined)} required/>}
      </div>
      <label className="field"><span>{t("Occasion", "送礼缘由")} <small>{t("Optional", "可选")}</small></span>
        <input placeholder={t("e.g. Housewarming", "例如：乔迁祝贺")} maxLength={200} value={title} onChange={event => setTitle(event.target.value)}/>
      </label>
      <RelationGiftItems rows={giftRows} onChange={setGiftRows} recipientCount={multiGift ? giftRecipients.length : undefined}/>
    </> : <div className="field">
      <span>{personLabel}</span>
      {linkedEdit ? <div className={styles.summary}>{partyRows.slice(1).map(party => name(party.key)).join(t(", ", "、"))}</div>
        : <SearchableMultiSelect label={personLabel} value={selected.map(String)} options={personOptions}
          onValueChange={values => changePeople(values.map(Number))} required alwaysSearch hideSelectedOptions/>}
    </div>}
    {type === "expense" && <>
      {decimalInput(t("Total · ¥", "总额 · ¥"), total, setTotal)}
      <ChoiceSelect aria-label={t("Split method", "分摊方式")} value={mode} onChange={event => setMode(event.target.value as ExpenseMode)}>
        {Object.entries(expenseModes).map(([key, labels]) => <option key={key} value={key}>{labels[english ? 0 : 1]}</option>)}
      </ChoiceSelect>
      {(mode === "treat" || mode === "advance") && <div className="field"><span>{t("Paid by", "付款人")}</span>
        <ChoiceSelect aria-label={t("Paid by", "付款人")} value={payer} onChange={event => setPayer(event.target.value)}>
          {partyRows.map(party => <option key={party.key} value={party.key}>{name(party.key)}</option>)}
        </ChoiceSelect>
      </div>}
      {mode === "custom" && <div className={styles.allocation}>
        {partyRows.map(party => <div key={party.key} className={styles.personAllocation}>
          <strong className="user-content">{name(party.key)}</strong>
          {(["share", "paid"] as const).map(field => <label key={field} className="field">
            <span>{field === "share" ? t("Share", "应付") : t("Paid", "实付")}</span>
            <input aria-label={`${name(party.key)} · ${field === "share" ? t("Share", "应付") : t("Paid", "实付")}`} inputMode="decimal" value={allocations[party.key]?.[field] ?? ""} onChange={event => setAllocations(previous => ({
              ...previous, [party.key]: { ...(previous[party.key] ?? { share: "", paid: "" }), [field]: event.target.value },
            }))}/>
          </label>)}
        </div>)}
      </div>}
      {expense && <div className={styles.summary} aria-live="polite">
        {mode === "aa" ? mixedSplit
          ? expense.parties.map(party => <span key={party.key}>{name(party.key)} · ¥{money(party.shareAmountMinor)}</span>)
          : <span>{t("Each person pays", "每人支付")} ¥{money(expense.parties[0].shareAmountMinor)}</span>
          : <>
            {mode === "custom" && <>
              <span>{t("Share / paid", "应付合计／实付合计")} · ¥{money(shareTotal)} / ¥{money(paidTotal)}</span>
              {(shareTotal !== expense.totalMinor || paidTotal !== expense.totalMinor) && <small>
                {t("Difference from total", "距离总额的差额")} · ¥{money(expense.totalMinor - shareTotal)} / ¥{money(expense.totalMinor - paidTotal)}
              </small>}
            </>}
            {expense.flows.map((flow, index) => <div key={`${flowKey(flow)}-${index}`} className={styles.flow}>
              <span>{name(flow.fromKey)} → {name(flow.toKey)} · ¥{money(flow.amountMinor)}</span>
              {mode === "custom" ? <ChoiceSelect aria-label={t("Transfer kind", "资金性质")} value={flow.flowType} onChange={event => setFlowKinds(kinds => ({ ...kinds, [`${flowKey(flow)}-${index}`]: event.target.value as RelationFlowType }))}>
                <option value="advance">{t("Advance", "代付")}</option><option value="treat">{t("Treat", "请客")}</option>
              </ChoiceSelect> : null}
            </div>)}
          </>}
      </div>}
    </>}
    {advancePersonId !== undefined && <div className="field">
      <span>{t("Repayment source", "还款来源")}</span>
      {!candidateAdvances ? <button type="button" className={styles.lookup} disabled={loadingAdvances} onClick={() => void loadAdvances(advancePersonId)}>
        {loadingAdvances ? t("Loading…", "正在读取…") : t("Find an outstanding advance", "查找未结清代付")}
      </button> : candidateAdvances.length ? <select aria-label={t("Repayment source", "还款来源")} value={advanceId ?? ""} onChange={event => {
        const id = Number(event.target.value);
        setAdvanceId(id || undefined);
        setValue(money(candidateAdvances.find(item => item.flow.id === id)?.outstanding ?? null));
      }}><option value="">{t("Standalone repayment", "独立还款")}</option>
        {candidateAdvances.map(({ flow, event, outstanding }) => <option key={flow.id} value={flow.id}>{event.title} · ¥{money(outstanding)}</option>)}
      </select> : <small>{t("No outstanding advance. Record a standalone repayment below.", "暂无未结清代付，可在下方独立记录还款。")}</small>}
      {advanceError && <ErrorNotice>{advanceError}</ErrorNotice>}
    </div>}
    {selectedAdvance && <div className={styles.summary}>
      <strong className="user-content">{selectedAdvance.event.title}</strong>
      <span>{t("Outstanding", "待结清")} ¥{money(selectedAdvance.outstanding)}</span>
    </div>}
    {!itemizedGift && type !== "interaction" && type !== "expense" && (editingTransfers ? <>
      {activeTransfers.map(flow => <div key={transfers.indexOf(flow)} className={styles.transfer}>
        {decimalInput(`${name(flow.fromKey)} → ${name(flow.toKey)} · ¥`, flow.amount, amount => setTransfers(previous => previous.map(row => row === flow ? { ...row, amount } : row)))}
        {flow.settlesFlowId !== null && <small>{t("Linked advance", "已关联原代付")} #{flow.settlesFlowId}</small>}
      </div>)}
      {addedParties.length > 0 && directionChoice}
      {addedParties.map(party => <div key={party.key}>{decimalInput(`${name(party.key)} · ¥`, newAmounts[party.key] ?? "", amount => setNewAmounts(previous => ({ ...previous, [party.key]: amount })))}</div>)}
    </> : <>
      {!selectedAdvance && directionChoice}
      {decimalInput(amountLabel, value, setValue)}
    </>)}
    {!itemizedGift && !selectedAdvance && <label className="field"><span>{t("Title", "标题")} <small>{t("Optional", "可选")}</small></span>
      <input placeholder={t(...eventLabels[type])} value={title} onChange={event => setTitle(event.target.value)}/>
    </label>}
    {!selectedAdvance && <div className="field"><span>{t("Met in person", "是否见面")} <small>{t("Optional", "可选")}</small></span>
      <ChoiceSelect aria-label={t("Met in person", "是否见面")} value={inPerson === null ? "" : String(inPerson)} onChange={event => setInPerson(event.target.value === "" ? null : event.target.value === "true")}>
        <option value=""/><option value="true">{t("Met", "见面")}</option><option value="false">{t("Didn't meet", "未见面")}</option>
      </ChoiceSelect>
    </div>}
    <div className={styles.details}>
      {type === "expense" && <Disclosure title={itemText ? t("Expense items", "消费明细") : t("Add expense items", "添加明细")} defaultOpen={Boolean(itemText)}>
        <ExpenseItemsInput value={itemText} onValueChange={setItemText}/>
      </Disclosure>}
      <Disclosure title={note ? t("Notes", "备注") : t("Add notes", "添加备注")} defaultOpen={Boolean(note)}>
        <label className="field"><textarea rows={3} aria-label={t("Notes", "备注")} value={note} onChange={event => setNote(event.target.value)}/></label>
      </Disclosure>
    </div>
    {error && <ErrorNotice role="alert">{error}</ErrorNotice>}
  </form>;
}
