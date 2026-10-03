"use client";

import { useLocale } from "./locale-controller";

export function ExpenseItemsInput({ value, onValueChange }: { value: string; onValueChange: (value: string) => void }) {
  const { english } = useLocale();
  const rows = value ? value.split("\n").map(line => { const divider = line.indexOf("|"); return divider < 0 ? { label: line, amount: "" } : { label: line.slice(0, divider).replace(/ $/, ""), amount: line.slice(divider + 1).replace(/^ /, "") }; }) : [];
  function update(index: number, field: "label" | "amount", next: string) {
    onValueChange(rows.map((row, rowIndex) => { const item = rowIndex === index ? { ...row, [field]: next } : row; return `${item.label} | ${item.amount}`; }).join("\n"));
  }
  return <div className="expense-items-input">
    {rows.map((row, index) => <div className="expense-item-row" key={index}>
      <input aria-label={`${english ? "Item" : "项目"} ${index + 1}`} placeholder={english ? "Item" : "项目名称"} value={row.label} onChange={event => update(index, "label", event.target.value)} />
      <input aria-label={`${english ? "Amount" : "金额"} ${index + 1}`} inputMode="decimal" placeholder="CNY" value={row.amount} onChange={event => update(index, "amount", event.target.value)} />
      <button type="button" data-form-change className="text-button" aria-label={`${english ? "Remove item" : "移除项目"} ${index + 1}`} onClick={() => onValueChange(rows.filter((_, rowIndex) => rowIndex !== index).map(row => `${row.label} | ${row.amount}`).join("\n"))}>×</button>
    </div>)}
    <button className="text-button" data-form-change type="button" onClick={() => onValueChange([...(value ? [value] : []), " | "].join("\n"))}>{english ? "Add item" : "添加一项"}</button>
    <details><summary>{english ? "Paste item list" : "粘贴明细"}</summary><textarea rows={3} aria-label={english ? "Items, one label | amount per line" : "每行填写名称 | 金额"} placeholder={"Dinner | 180\nDrinks | 60"} value={value} onChange={event => onValueChange(event.target.value)} /></details>
  </div>;
}
