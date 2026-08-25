"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import type { ApiError, FoodCategory, FoodDataSource, FoodLibraryItem, FoodReferenceType } from "@/lib/types";

const empty = { name: "", brand: "", category: "other" as FoodCategory, defaultPortion: "", referenceType: "per_serving" as FoodReferenceType, referenceEnergyKj: "", referenceKcal: "", servingWeight: "", servingKcal: "", dataSource: "manual" as FoodDataSource, notes: "" };

export function FoodLibraryView() {
  const [items, setItems] = useState<FoodLibraryItem[]>([]);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(empty);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(`/api/food/library?q=${encodeURIComponent(query)}`);
    if (response.ok) setItems(await response.json());
  }, [query]);
  useEffect(() => { const timer = setTimeout(() => void load(), 120); return () => clearTimeout(timer); }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    const optionalNumber = (value: string) => value ? Number(value) : null;
    const response = await fetch("/api/food/library", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, referenceEnergyKj: optionalNumber(draft.referenceEnergyKj), referenceKcal: optionalNumber(draft.referenceKcal), servingWeight: optionalNumber(draft.servingWeight), servingKcal: optionalNumber(draft.servingKcal) }) });
    if (!response.ok) { setError(((await response.json()) as ApiError).error); return; }
    setDraft(empty); setShowForm(false); await load();
  }

  return <div className="page">
    <PageHeader eyebrow="FOOD LIBRARY" title="常吃的东西" description="把包装标签和稳定份量留在这里，Eva 下次估算会先查它。不同品牌会分开记。" action={<button className="button primary" onClick={() => setShowForm(true)}><Icon name="plus" />加一个</button>} />
    {showForm && <form className="editor-card compact-editor" onSubmit={submit}>
      <div className="editor-title"><h2>存一份参考</h2><button type="button" className="text-button" onClick={() => setShowForm(false)}>先不写</button></div>
      <div className="form-grid">
        <label className="field"><span>名称</span><input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <label className="field"><span>品牌</span><input value={draft.brand} onChange={(event) => setDraft({ ...draft, brand: event.target.value })} placeholder="没有就留空" /></label>
        <label className="field"><span>分类</span><select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as FoodCategory })}><option value="staple">主食</option><option value="dish">菜品</option><option value="snack">零食</option><option value="drink">饮品</option><option value="other">其他</option></select></label>
        <label className="field"><span>参考方式</span><select value={draft.referenceType} onChange={(event) => setDraft({ ...draft, referenceType: event.target.value as FoodReferenceType })}><option value="per_serving">每份</option><option value="per_100g">每 100g</option><option value="per_100ml">每 100ml</option></select></label>
        <label className="field"><span>默认份量</span><input value={draft.defaultPortion} onChange={(event) => setDraft({ ...draft, defaultPortion: event.target.value })} placeholder="例如：1 杯 / 35g" /></label>
        <label className="field"><span>参考 kcal</span><input type="number" min={0} value={draft.referenceKcal} onChange={(event) => setDraft({ ...draft, referenceKcal: event.target.value })} /></label>
        <label className="field"><span>每份 kcal</span><input type="number" min={0} value={draft.servingKcal} onChange={(event) => setDraft({ ...draft, servingKcal: event.target.value })} /></label>
        <label className="field"><span>数据来源</span><select value={draft.dataSource} onChange={(event) => setDraft({ ...draft, dataSource: event.target.value as FoodDataSource })}><option value="package_label">包装标签</option><option value="official">官方资料</option><option value="estimated">估算</option><option value="manual">手动录入</option></select></label>
      </div>
      {error && <p className="form-error">{error}</p>}<button className="button primary">存好</button>
    </form>}
    <label className="search-box library-search"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜名称或品牌…" /></label>
    {items.length ? <div className="food-library-list">{items.map((item) => <article key={item.id}><div><span>{item.brand || "无品牌"}</span><h2>{item.name}</h2><p>{[item.defaultPortion, item.referenceKcal !== null ? `${item.referenceKcal} kcal` : "", item.servingKcal !== null ? `每份 ${item.servingKcal} kcal` : ""].filter(Boolean).join(" · ")}</p></div><small>{item.dataSource === "package_label" ? "包装标签" : item.dataSource === "official" ? "官方资料" : item.dataSource === "estimated" ? "估算" : "手动录入"}</small></article>)}</div> : <div className="empty-state"><h2>{query ? "没找到这项" : "Food Library 还是空的"}</h2><p>也可以直接告诉 Eva 包装上的营养信息。</p></div>}
    <Link className="section-link" href="/food">回到今日饮食 <Icon name="arrow" /></Link>
  </div>;
}
