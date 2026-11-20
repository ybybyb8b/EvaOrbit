"use client";

import { useRef } from "react";
import { Icon } from "@/components/icons";
import { useLocale } from "@/components/locale-controller";
import { giftPriceSummary, minorFromDecimal, type RelationItemInput } from "@/lib/relations";
import styles from "./relation-event-editor.module.css";

export type GiftRow = { key: number; label: string; amount: string };

export function giftItemsFromDraft(rows: readonly GiftRow[]): RelationItemInput[] {
  return rows.filter(row => row.label.trim() || row.amount.trim()).map((row, sortOrder) => ({
    label: row.label.trim(),
    amountMinor: row.amount.trim() ? minorFromDecimal(row.amount) : null,
    sortOrder,
  }));
}

export function RelationGiftItems({ rows, onChange, recipientCount }: { rows: GiftRow[]; onChange: (rows: GiftRow[]) => void; recipientCount?: number }) {
  const { english } = useLocale();
  const nextKey = useRef(0);
  let summary: ReturnType<typeof giftPriceSummary> | undefined;
  try { summary = giftPriceSummary(giftItemsFromDraft(rows)); } catch { /* Wait for a valid decimal. */ }
  const formatter = new Intl.NumberFormat(english ? "en-US" : "zh-CN", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  const format = (minor: number) => `¥${formatter.format(minor / 100)}`;
  const totalMinor = summary?.total == null || recipientCount === 0 ? null : summary.total * (recipientCount ?? 1);
  const amount = totalMinor === null || !Number.isSafeInteger(totalMinor) ? "—" : format(totalMinor);
  const totalLabel = summary?.complete && summary.total !== null ? (english ? "Total" : "礼物合计") : (english ? "Known amount" : "已知金额");

  function change(key: number, field: "label" | "amount", value: string) {
    onChange(rows.map(row => row.key === key ? { ...row, [field]: value } : row));
  }

  function addRow() {
    nextKey.current = Math.max(nextKey.current, ...rows.map(row => row.key)) + 1;
    onChange([...rows, { key: nextKey.current, label: "", amount: "" }]);
  }

  return <section className={styles.gifts} aria-label={english ? "Gift items" : "礼物明细"}>
    <h3>{english ? "Gift items" : "礼物明细"}</h3>
    <div className={styles.giftColumns} aria-hidden="true">
      <span>{english ? "Gift name" : "礼物名称"}</span>
      <span>{recipientCount !== undefined ? (english ? "Each · ¥" : "每人 · ¥") : (english ? "Amount · ¥" : "金额 · ¥")} <small>{english ? "Optional" : "可选"}</small></span>
    </div>
    <div className={styles.giftRows}>
      {rows.map((row, index) => <div className={styles.giftRow} key={row.key}>
        <label className="field"><input aria-label={english ? `Gift name ${index + 1}` : `礼物名称 ${index + 1}`}
          placeholder={english ? "What was the gift?" : "填写礼物名称"} maxLength={200} value={row.label}
          onChange={event => change(row.key, "label", event.target.value)}/></label>
        <label className="field"><input aria-label={english ? `Gift amount ${index + 1}` : `礼物金额 ${index + 1}`}
          placeholder="—" inputMode="decimal" value={row.amount}
          onChange={event => change(row.key, "amount", event.target.value)}/></label>
        {rows.length > 1 && <button className={styles.removeGift} type="button" data-form-change
          aria-label={english ? `Remove gift ${index + 1}` : `移除第 ${index + 1} 件礼物`}
          onClick={() => onChange(rows.filter(item => item.key !== row.key))}>×</button>}
      </div>)}
    </div>
    <div className={styles.giftFooter}>
      <button type="button" data-form-change className={styles.addGift} onClick={addRow}>
        <Icon name="plus"/>{english ? "Add gift" : "添加一件"}
      </button>
      <div className={styles.giftTotal}>
        {recipientCount !== undefined && recipientCount > 1 && summary?.total != null && <small className={styles.giftMath}>
          {english ? `${recipientCount} people × ${format(summary.total)}` : `${recipientCount} 人 × ${format(summary.total)}`}
        </small>}
        <span>{totalLabel}</span>
        <output aria-label={totalLabel}>{amount}</output>
      </div>
    </div>
  </section>;
}
