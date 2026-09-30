"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FormSheet } from "@/components/form-sheet";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import type { CatFoodSummary } from "@/lib/types";
import { CatFoodItemEditor, CatFoodPurchaseEditor } from "./cat-food-editors";

const categoryLabels = { dry: "干粮", wet: "湿粮", treat: "零食", supplement: "营养补充", other: "其他" };
const unitLabel = { kg: "kg", L: "L", piece: "个" };
const money = (value: number) => `¥${(value / 100).toFixed(2)}`;

export function CatFoodLibraryView({ initialItems }: { initialItems: CatFoodSummary[] }) {
  const [items, setItems] = useState(initialItems), [query, setQuery] = useState(""), [panel, setPanel] = useState<"item" | "purchase" | null>(null), [selectedId, setSelectedId] = useState(initialItems[0]?.id ?? 0), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const filtered = useMemo(() => { const term = query.trim().toLocaleLowerCase(); return term ? items.filter(item => [item.name, item.brand, item.flavor].some(value => value.toLocaleLowerCase().includes(term))) : items; }, [items, query]);
  const packages = items.reduce((total, item) => total + item.stockPackages, 0), low = items.filter(item => item.stockState !== "available").length, records = items.reduce((total, item) => total + item.purchases.length, 0);
  async function load() { const response = await fetch("/api/cats/food"); if (response.ok) setItems(await response.json()); }
  function openPurchase(id?: number) { const next = id ?? items[0]?.id; if (!next) { setPanel("item"); return; } setSelectedId(next); setPanel("purchase"); }
  return <div className="page cat-food-page"><Link className="back-link" href="/cats">← Cats</Link><PageHeader eyebrow="CATS · FOOD" title="食品库" description="记住买过的猫粮，轻量看库存，也看得出哪里更划算。" action={<button className="button primary" onClick={() => openPurchase()}><Icon name="plus"/>记录购买</button>}/>
    {notice && <p className="success-banner" role="status">{notice}</p>}
    <section className="cat-food-overview" aria-label="食品库概览"><div><span>食品</span><strong>{items.length}</strong><small>款买过的食品</small></div><div><span>库存</span><strong>{packages}</strong><small>包正在家里</small></div><div className={low ? "needs-attention" : ""}><span>需要留意</span><strong>{low}</strong><small>{low ? "款库存偏低" : "库存状态很好"}</small></div><div><span>记录</span><strong>{records}</strong><small>次购买可供比价</small></div></section>
    <div className="cat-food-toolbar"><label className="cat-food-search"><Icon name="search" variant="stroke"/><span className="sr-only">搜索食品</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索名称、品牌或口味"/></label><button className="button secondary" onClick={() => setPanel("item")}><Icon name="plus"/>添加食品</button></div>
    {filtered.length ? <section className="cat-food-grid">{filtered.map(item => <article className="cat-food-card" key={item.id}><Link href={`/cats/food/${item.id}`} className="cat-food-card-main"><div className="cat-food-card-top"><span className="cat-food-category">{categoryLabels[item.category]}</span><span className={`cat-food-stock ${item.stockState}`}>{item.stockState === "available" ? `${item.stockPackages} 包` : item.stockState === "low" ? `仅 ${item.stockPackages} 包` : "已用完"}</span></div><div><small>{item.brand || "未记录品牌"}</small><h2>{item.name}</h2>{item.flavor && <p>{item.flavor}</p>}</div>{item.latestPurchase ? <div className="cat-food-price"><span><small>最近单价</small><strong>{money(item.latestPurchase.normalizedPriceMinor)}<i> / {unitLabel[item.latestPurchase.normalizedUnit]}</i></strong></span><span><small>历史好价</small><b>{money(item.bestPriceMinor!)}</b></span></div> : <div className="cat-food-no-price">还没有购买记录</div>}</Link><div className="cat-food-card-footer"><span>{item.latestPurchase ? `${item.latestPurchase.merchant || "未记渠道"} · ${item.latestPurchase.purchasedOn}` : "记录一次购买后开始比价"}</span><button className="text-button" onClick={() => openPurchase(item.id)}>再买一次</button></div></article>)}</section> : <section className="cat-food-empty"><span className="cat-food-empty-icon"><Icon name="food"/></span><h2>{items.length ? "没有找到匹配的食品" : "从第一款买过的猫粮开始"}</h2><p>{items.length ? "换个名称、品牌或口味试试。" : "先建食品，再记购买价格与剩余包数。以后每次补货只需要几秒。"}</p>{!items.length && <button className="button primary" onClick={() => setPanel("item")}><Icon name="plus"/>添加第一款食品</button>}</section>}
    {panel === "item" && <FormSheet title="添加食品" onClose={() => setPanel(null)} formId="cat-food-item-form" submitLabel="添加到食品库" busy={busy}><CatFoodItemEditor formId="cat-food-item-form" onSavingChange={setBusy} onSaved={async item => { await load(); setSelectedId(item.id); setPanel("purchase"); setNotice("食品已添加，现在记下第一次购买"); }}/></FormSheet>}
    {panel === "purchase" && <FormSheet title="记录购买" onClose={() => setPanel(null)} formId="cat-food-purchase-form" submitLabel="保存购买" busy={busy}><label className="field cat-food-product-picker"><span>买的是</span><select value={selectedId} onChange={event => setSelectedId(Number(event.target.value))}>{items.map(item => <option value={item.id} key={item.id}>{item.brand ? `${item.brand} · ` : ""}{item.name}{item.flavor ? ` · ${item.flavor}` : ""}</option>)}</select></label><CatFoodPurchaseEditor key={selectedId} itemId={selectedId} formId="cat-food-purchase-form" onSavingChange={setBusy} onSaved={async () => { await load(); setPanel(null); setNotice("购买与库存已更新"); }}/></FormSheet>}
  </div>;
}
