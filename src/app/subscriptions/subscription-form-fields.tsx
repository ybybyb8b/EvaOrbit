"use client";
import {NoteTextarea} from "@/components/note-textarea";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { ChoiceSelect } from "@/components/choice-select";
import { useLocale } from "@/components/locale-controller";
import type { SubscriptionIntervalUnit } from "@/lib/types";
import styles from "./subscription-form-fields.module.css";

export type SubscriptionDraft = {
  mode: "recurring" | "manual";
  expiresOn: string;
  name: string;
  amount: string;
  currency: string;
  billingIntervalValue: string;
  billingIntervalUnit: SubscriptionIntervalUnit;
  startedOn: string;
  nextRenewalOn: string;
  autoRenew: boolean;
  reminderEnabled: boolean;
  reminderDaysBefore: string;
  reminderTime: string;
  notes: string;
};

export function SubscriptionFormFields({ draft, setDraft, icon, editing = false }: {
  draft: SubscriptionDraft;
  setDraft: Dispatch<SetStateAction<SubscriptionDraft>>;
  icon: ReactNode;
  editing?: boolean;
}) {
  const { english } = useLocale();
  const manual = draft.mode === "manual";

  function update<K extends keyof SubscriptionDraft>(key: K, value: SubscriptionDraft[K]) {
    setDraft(current => ({ ...current, [key]: value }));
  }

  return <div className={`${styles.fields} field-focus-surface`}>
    {icon}
    <label className="field">
      <span>{english ? "Name" : "名称"}</span>
      <input required maxLength={editing ? undefined : 200} value={draft.name} onChange={event => update("name", event.target.value)} />
    </label>
    <div className={`field ${styles.mode}`}>
      <span>{english ? "Subscription mode" : "订阅模式"}</span>
      <ChoiceSelect value={draft.mode} onChange={event => {
        const mode = event.target.value as SubscriptionDraft["mode"];
        setDraft(current => ({ ...current, mode, expiresOn: current.expiresOn || current.nextRenewalOn }));
      }}>
        <option value="recurring">{english ? "Fixed cycle" : "固定周期"}</option>
        <option value="manual">{english ? "Manual renewal" : "手动续期"}</option>
      </ChoiceSelect>
    </div>
    {manual ? (
      <label className="field">
        <span>{english ? "Membership valid until" : "会员有效期至"}</span>
        <input required type="date" value={draft.expiresOn} onChange={event => update("expiresOn", event.target.value)} />
        <small className={styles.hint}>{english ? "Record each purchase separately." : "每次购买后单独记账。"}</small>
      </label>
    ) : <>
      <div className={`${styles.row} ${styles.price}`}>
        <label className="field">
          <span>{english ? "Amount" : "金额"}</span>
          <input required inputMode="decimal" placeholder={editing ? undefined : "30.00"} value={draft.amount} onChange={event => update("amount", event.target.value)} />
        </label>
        <label className="field">
          <span>{english ? "Currency" : "币种"}</span>
          <input required maxLength={3} pattern="[A-Za-z]{3}" autoCapitalize="characters" spellCheck={false} value={draft.currency} onChange={event => update("currency", event.target.value.toUpperCase())} />
        </label>
      </div>
      <div className={`${styles.row} ${styles.cycle}`}>
        <label className="field">
          <span>{english ? "Every" : "每隔"}</span>
          <input required type="number" min={1} max={editing ? undefined : 999} value={draft.billingIntervalValue} onChange={event => update("billingIntervalValue", event.target.value)} />
        </label>
        <div className="field">
          <span>{english ? "Cycle unit" : "周期单位"}</span>
          <ChoiceSelect value={draft.billingIntervalUnit} onChange={event => update("billingIntervalUnit", event.target.value as SubscriptionIntervalUnit)}>
            <option value="day">{english ? "Days" : "天"}</option>
            <option value="week">{english ? "Weeks" : "周"}</option>
            <option value="month">{english ? "Months" : "月"}</option>
            <option value="year">{english ? "Years" : "年"}</option>
          </ChoiceSelect>
        </div>
      </div>
      <div className={styles.row}>
        <label className="field">
          <span>{english ? "Started" : "开始日期"}</span>
          <input required type="date" value={draft.startedOn} onChange={event => update("startedOn", event.target.value)} />
        </label>
        <label className="field">
          <span>{english ? "Next renewal" : "下次续费"}</span>
          <input required type="date" value={draft.nextRenewalOn} onChange={event => update("nextRenewalOn", event.target.value)} />
        </label>
      </div>
      {editing && <p className={styles.hint}>{english ? "Price changes are recorded in price history. Previous payments keep their original amounts and currencies." : "金额或币种变更会记入价格历史，已有扣款保留原金额和币种。"}</p>}
    </>}
    <div className={styles.preferences}>
      {!manual && <label className={styles.switchRow}>
        <span>{english ? "Auto-renew and record payments" : "自动续费并自动记账"}</span>
        <input role="switch" className="toggle-switch" type="checkbox" checked={draft.autoRenew} onChange={event => update("autoRenew", event.target.checked)} />
      </label>}
      <label className={styles.switchRow}>
        <span>{manual ? (english ? "Expiry reminder" : "到期提醒") : (english ? "Renewal reminder" : "续费提醒")}</span>
        <input role="switch" className="toggle-switch" type="checkbox" checked={draft.reminderEnabled} onChange={event => update("reminderEnabled", event.target.checked)} />
      </label>
      {draft.reminderEnabled && <div className={`${styles.row} ${styles.reminder}`}>
        <label className="field">
          <span>{english ? "Days before" : "提前天数"}</span>
          <input required type="number" min={0} max={editing ? undefined : 3650} value={draft.reminderDaysBefore} onChange={event => update("reminderDaysBefore", event.target.value)} />
        </label>
        <label className="field">
          <span>{english ? "Reminder time" : "提醒时间"}</span>
          <input required type="time" value={draft.reminderTime} onChange={event => update("reminderTime", event.target.value)} />
        </label>
      </div>}
    </div>
    <label className="field">
      <span>{english ? "Notes" : "备注"} <small>{english ? "Optional" : "可选"}</small></span>
      <NoteTextarea maxLength={editing ? undefined : 5000} value={draft.notes} onChange={event => update("notes", event.target.value)} />
    </label>
  </div>;
}
