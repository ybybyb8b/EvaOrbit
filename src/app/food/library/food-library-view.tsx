"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import type { ApiError, FoodCategory, FoodDataSource, FoodLibraryItem, FoodReferenceType } from "@/lib/types";

const empty = { name: "", brand: "", category: "other" as FoodCategory, defaultPortion: "", referenceType: "per_serving" as FoodReferenceType, referenceEnergyKj: "", referenceKcal: "", servingWeight: "", servingKcal: "", dataSource: "manual" as FoodDataSource, notes: "" };
type Draft = typeof empty;

const sourceLabels: Record<FoodDataSource, string> = {
  package_label: "Package label",
  official: "Official",
  estimated: "Estimated",
  manual: "Manual",
};

function draftFromItem(item: FoodLibraryItem): Draft {
  return {
    name: item.name,
    brand: item.brand,
    category: item.category,
    defaultPortion: item.defaultPortion,
    referenceType: item.referenceType,
    referenceEnergyKj: item.referenceEnergyKj === null ? "" : String(item.referenceEnergyKj),
    referenceKcal: item.referenceKcal === null ? "" : String(item.referenceKcal),
    servingWeight: item.servingWeight === null ? "" : String(item.servingWeight),
    servingKcal: item.servingKcal === null ? "" : String(item.servingKcal),
    dataSource: item.dataSource,
    notes: item.notes,
  };
}

export function FoodLibraryView() {
  const [items, setItems] = useState<FoodLibraryItem[]>([]);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(empty);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/food/library?q=${encodeURIComponent(query)}`);
    if (response.ok) setItems(await response.json());
  }, [query]);

  useEffect(() => { const timer = setTimeout(() => void load(), 120); return () => clearTimeout(timer); }, [load]);

  function openCreate() {
    setDraft(empty); setEditingId(null); setError(""); setNotice(""); setShowForm(true);
  }

  function openEdit(item: FoodLibraryItem) {
    setDraft(draftFromItem(item)); setEditingId(item.id); setOpenMenuId(null); setError(""); setNotice(""); setShowForm(true);
  }

  function closeEditor() {
    setShowForm(false); setEditingId(null); setDraft(empty); setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    const optionalNumber = (value: string) => value ? Number(value) : null;
    const body = { ...draft, referenceEnergyKj: optionalNumber(draft.referenceEnergyKj), referenceKcal: optionalNumber(draft.referenceKcal), servingWeight: optionalNumber(draft.servingWeight), servingKcal: optionalNumber(draft.servingKcal) };
    const editing = editingId;
    const response = await fetch(editing ? `/api/food/library/${editing}` : "/api/food/library", { method: editing ? "PATCH" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) { setError(((await response.json()) as ApiError).error); return; }
    closeEditor(); setNotice(editing ? "Item updated." : "Item added."); await load();
  }

  async function remove(item: FoodLibraryItem) {
    setOpenMenuId(null); setError(""); setNotice("");
    if (!confirm(`Remove “${item.name}” from Food Library? Historical logs will remain unchanged.`)) return;
    const response = await fetch(`/api/food/library/${item.id}`, { method: "DELETE" });
    if (!response.ok) { setError(((await response.json()) as ApiError).error); return; }
    const result = await response.json() as { action: "deleted" | "archived" };
    setNotice(result.action === "archived" ? "Removed from the library. Historical references were preserved." : "Item deleted.");
    await load();
  }

  return <div className="page">
    <PageHeader eyebrow="FOOD" title="Food Library" action={<button className="button primary" onClick={openCreate}><Icon name="plus" />Add Item</button>} />

    {showForm && <form className="editor-card compact-editor" onSubmit={submit}>
      <div className="editor-title"><h2>{editingId ? "Edit Item" : "Add Item"}</h2><button type="button" className="text-button" onClick={closeEditor}>Cancel</button></div>
      <div className="form-grid">
        <label className="field"><span>Name</span><input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <label className="field"><span>Brand</span><input value={draft.brand} onChange={(event) => setDraft({ ...draft, brand: event.target.value })} placeholder="Optional" /></label>
        <label className="field"><span>Category</span><select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as FoodCategory })}><option value="staple">Staple</option><option value="dish">Dish</option><option value="snack">Snack</option><option value="drink">Drink</option><option value="other">Other</option></select></label>
        <label className="field"><span>Reference</span><select value={draft.referenceType} onChange={(event) => setDraft({ ...draft, referenceType: event.target.value as FoodReferenceType })}><option value="per_serving">Per serving</option><option value="per_100g">Per 100g</option><option value="per_100ml">Per 100ml</option></select></label>
        <label className="field"><span>Default portion</span><input value={draft.defaultPortion} onChange={(event) => setDraft({ ...draft, defaultPortion: event.target.value })} placeholder="1 cup / 35 g" /></label>
        <label className="field"><span>Reference kcal</span><input type="number" min={0} value={draft.referenceKcal} onChange={(event) => setDraft({ ...draft, referenceKcal: event.target.value })} /></label>
        <label className="field"><span>Serving kcal</span><input type="number" min={0} value={draft.servingKcal} onChange={(event) => setDraft({ ...draft, servingKcal: event.target.value })} /></label>
        <label className="field"><span>Data source</span><select value={draft.dataSource} onChange={(event) => setDraft({ ...draft, dataSource: event.target.value as FoodDataSource })}><option value="package_label">Package label</option><option value="official">Official</option><option value="estimated">Estimated</option><option value="manual">Manual</option></select></label>
      </div>
      {error && <p className="form-error">{error}</p>}<button className="button primary">{editingId ? "Save Changes" : "Add Item"}</button>
    </form>}

    {!showForm && error && <p className="form-error">{error}</p>}
    {notice && <p className="form-notice">{notice}</p>}
    <label className="search-box library-search"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or brand…" /></label>

    {items.length ? <div className="food-library-list">{items.map((item) => <article key={item.id}>
      <div className="food-library-copy"><span>{item.brand || "No brand"}</span><h2>{item.name}</h2><p>{[item.defaultPortion, item.referenceKcal !== null ? `${item.referenceKcal} kcal` : "", item.servingKcal !== null ? `${item.servingKcal} kcal / serving` : ""].filter(Boolean).join(" · ") || "No serving data"}</p></div>
      <div className="food-library-meta"><small>{sourceLabels[item.dataSource]}</small><button type="button" className="food-library-menu-button" aria-label={`Actions for ${item.name}`} aria-expanded={openMenuId === item.id} onClick={() => setOpenMenuId((current) => current === item.id ? null : item.id)}><Icon name="more" /></button>{openMenuId === item.id && <div className="food-library-menu"><button type="button" onClick={() => openEdit(item)}><Icon name="edit" />Edit</button><button type="button" className="danger" onClick={() => void remove(item)}><Icon name="trash" />Remove</button></div>}</div>
    </article>)}</div> : <div className="empty-state compact-empty"><h2>{query ? "No matching items" : "Food Library is empty"}</h2></div>}
    <Link className="section-link" href="/food">Back to Food <Icon name="arrow" /></Link>
  </div>;
}
