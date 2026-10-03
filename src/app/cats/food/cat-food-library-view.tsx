"use client";
import { ToastNotice } from "@/components/action-toast";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FormSheet } from "@/components/form-sheet";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import type { CatFoodSummary } from "@/lib/types";
import { CatFoodItemEditor, CatFoodPurchaseEditor } from "./cat-food-editors";

const categoryLabels = { dry: "干粮", wet: "湿粮", treat: "零食", supplement: "营养补充", other: "其他" };
const categoryIcons = { dry: "catFoodDry", wet: "catFoodWet", treat: "catFoodTreat", supplement: "catFoodSupplement", other: "catFood" } as const;
const unitLabel = { kg: "kg", L: "L", piece: "个" };
const money = (value: number) => `¥${(value / 100).toFixed(2)}`;

export function CatFoodLibraryView({ initialItems }: { initialItems: CatFoodSummary[] }) {
  const [items, setItems] = useState(initialItems), [query, setQuery] = useState(""), [panel, setPanel] = useState<"item" | "purchase" | null>(null), [selectedId, setSelectedId] = useState(initialItems[0]?.id ?? 0), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const filtered = useMemo(() => { const term = query.trim().toLocaleLowerCase(); return term ? items.filter(item => [item.name, item.brand, item.flavor].some(value => value.toLocaleLowerCase().includes(term))) : items; }, [items, query]);
  const packages = items.reduce((total, item) => total + item.stockPackages, 0), low = items.filter(item => item.stockState !== "available").length, records = items.reduce((total, item) => total + item.purchases.length, 0);
  async function load() { const response = await fetch("/api/cats/food"); if (response.ok) setItems(await response.json()); }
  function openPurchase(id?: number) { const next = id ?? items[0]?.id; if (!next) { setPanel("item"); return; } setSelectedId(next); setPanel("purchase"); }
  return <div className="page cat-food-page"><Link className="back-link" href="/cats">← Cats</Link><PageHeader eyebrow="CATS · FOOD" title="猫咪食品库" description="记住买过的猫粮，轻量看库存，也看得出哪里更划算。" action={<button className="button primary" onClick={() => openPurchase()}><Icon name="plus"/>记录购买</button>}/>
    {notice && <ToastNotice message={notice} onShown={() => setNotice("")} />}
    <section className={`cat-food-overview ${low ? "has-attention" : ""}`} aria-label="猫咪食品库概览"><div className="cat-food-overview-copy"><span className="eyebrow">AT HOME</span><h2>{packages ? `家里还有 ${packages} 包` : items.length ? "库存需要补充" : "猫咪食品库还是空的"}</h2><p>{low ? `${low} 款猫咪食品库存偏低，补货时可以直接参考历史价格。` : items.length ? "目前库存状态很好，可以安心照常记录。" : "添加猫咪食品并记下第一次购买后，这里会形成库存与价格印象。"}</p></div><dl><div><dt>食品</dt><dd>{items.length}<small> 款</small></dd></div><div><dt>购买</dt><dd>{records}<small> 次</small></dd></div><div className={low ? "needs-attention" : ""}><dt>留意</dt><dd>{low}<small> 款</small></dd></div></dl></section>
    <div className="cat-food-toolbar"><label className="cat-food-search"><Icon name="search" variant="stroke"/><span className="sr-only">搜索食品</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索名称、品牌或口味"/></label><span className="cat-food-result-count">{query ? `${filtered.length} 个结果` : `${items.length} 款食品`}</span><button className="button secondary" onClick={() => setPanel("item")}><Icon name="plus"/>添加食品</button></div>
    {filtered.length ? <section className="cat-food-list">{filtered.map(item => <article className={`cat-food-card ${item.stockState}`} data-category={item.category} key={item.id}><Link href={`/cats/food/${item.id}`} className="cat-food-card-main"><span className="cat-food-card-icon"><Icon name={categoryIcons[item.category]}/></span><span className="cat-food-card-identity"><small>{categoryLabels[item.category]}{item.brand ? ` · ${item.brand}` : ""}</small><h2>{item.name}</h2>{item.flavor && <p>{item.flavor}</p>}</span><span className={`cat-food-stock ${item.stockState}`}>{item.stockState === "available" ? `${item.stockPackages} 包` : item.stockState === "low" ? `仅 ${item.stockPackages} 包` : "已用完"}</span>{item.latestPurchase ? <span className="cat-food-price"><small>最近单价</small><strong>{money(item.latestPurchase.normalizedPriceMinor)}<i> / {unitLabel[item.latestPurchase.normalizedUnit]}</i></strong><em>历史好价 {money(item.bestPriceMinor!)}</em></span> : <span className="cat-food-no-price">还没有购买记录</span>}</Link><div className="cat-food-card-footer"><span>{item.latestPurchase ? `${item.latestPurchase.merchant || "未记渠道"} · ${item.latestPurchase.purchasedOn}` : "记录一次购买后开始比价"}</span><button className="text-button" onClick={() => openPurchase(item.id)}>记录购买</button></div></article>)}</section> : <section className="cat-food-empty"><span className="cat-food-empty-icon"><Icon name="catFood"/></span><h2>{items.length ? "没有找到匹配的猫咪食品" : "从第一款买过的猫粮开始"}</h2><p>{items.length ? "换个名称、品牌或口味试试。" : "先建猫咪食品，再记购买价格与剩余包数。以后每次补货只需要几秒。"}</p>{!items.length && <button className="button primary" onClick={() => setPanel("item")}><Icon name="plus"/>添加第一款食品</button>}</section>}
    {panel === "item" && <FormSheet title="添加食品" onClose={() => setPanel(null)} formId="cat-food-item-form" submitLabel="添加到食品库" busy={busy}><CatFoodItemEditor formId="cat-food-item-form" onSavingChange={setBusy} onSaved={async item => { await load(); setSelectedId(item.id); setPanel("purchase"); setNotice("食品已添加，现在记下第一次购买"); }}/></FormSheet>}
    {panel === "purchase" && <FormSheet title="记录购买" onClose={() => setPanel(null)} formId="cat-food-purchase-form" submitLabel="保存购买" busy={busy}><label className="field cat-food-product-picker"><span>买的是</span><select value={selectedId} onChange={event => setSelectedId(Number(event.target.value))}>{items.map(item => <option value={item.id} key={item.id}>{item.brand ? `${item.brand} · ` : ""}{item.name}{item.flavor ? ` · ${item.flavor}` : ""}</option>)}</select></label><CatFoodPurchaseEditor key={selectedId} itemId={selectedId} formId="cat-food-purchase-form" onSavingChange={setBusy} onSaved={async () => { await load(); setPanel(null); setNotice("购买与库存已更新"); }}/></FormSheet>}
  </div>;
}
