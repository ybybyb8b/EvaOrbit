"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import type { ApiError, Memory } from "@/lib/types";

const suggestedCategories = ["人物", "项目", "偏好", "地点", "事件", "其他"];
const emptyDraft = { title: "", content: "", category: "其他" };

export function MemoryView() {
  const params = useSearchParams();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(params.get("new") === "1");
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (category) search.set("category", category);
    const response = await fetch(`/api/memories?${search}`);
    setMemories(await response.json()); setLoading(false);
  }, [query, category]);

  useEffect(() => { const timer = window.setTimeout(load, 180); return () => window.clearTimeout(timer); }, [load]);

  const categories = useMemo(() => [...new Set([...suggestedCategories, ...memories.map((item) => item.category)])], [memories]);

  function startNew() { setEditing(null); setDraft(emptyDraft); setError(""); setShowForm(true); }
  function startEdit(memory: Memory) { setEditing(memory.id); setDraft({ title: memory.title, content: memory.content, category: memory.category }); setError(""); setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" }); }

  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    const response = await fetch(editing ? `/api/memories/${editing}` : "/api/memories", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    if (!response.ok) { setError(((await response.json()) as ApiError).error); return; }
    setShowForm(false); setEditing(null); setDraft(emptyDraft); await load();
  }

  async function remove(memory: Memory) {
    if (!window.confirm(`删除“${memory.title}”？此操作无法撤销。`)) return;
    await fetch(`/api/memories/${memory.id}`, { method: "DELETE" }); await load();
  }

  return <div className="page">
    <PageHeader eyebrow="MEMORY" title="留下来的" description="人、事、偏好，想到的时候先记一下。" action={<button className="button primary" onClick={startNew}><Icon name="plus" />记住这个</button>} />
    {showForm && <form className="editor-card" onSubmit={submit}>
      <div className="editor-title"><div><span className="eyebrow">{editing ? "EDIT" : "KEEP"}</span><h2>{editing ? "改一下" : "先留下来"}</h2></div><button type="button" className="text-button" onClick={() => setShowForm(false)}>先不写</button></div>
      <div className="form-grid">
        <label className="field"><span>标题</span><input autoFocus required maxLength={160} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="例如：妈妈喜欢的花" /></label>
        <label className="field"><span>分类</span><input required list="memory-categories" maxLength={40} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} /><datalist id="memory-categories">{suggestedCategories.map((item) => <option key={item} value={item} />)}</datalist></label>
        <label className="field wide"><span>内容</span><textarea required rows={5} maxLength={10000} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} placeholder="写下细节，让未来的你能够理解上下文。" /></label>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions"><button className="button primary" type="submit">{editing ? "改好了" : "留下"}</button></div>
    </form>}

    <div className="memory-toolbar">
      <label className="search-box"><Icon name="search" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="找找以前…" aria-label="找找以前记过的" />{query && <button onClick={() => setQuery("")} aria-label="清空搜索">×</button>}</label>
      <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="按分类筛选"><option value="">全部分类</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select>
      <span className="result-count">{memories.length} 条</span>
    </div>
    {loading ? <div className="loading-state">在翻以前记过的…</div> : memories.length ? <div className="memory-grid">{memories.map((memory) => <article className="memory-card" key={memory.id}>
      <div className="memory-card-top"><span className="category-chip">{memory.category}</span><div className="row-actions"><button onClick={() => startEdit(memory)} aria-label="编辑记忆"><Icon name="edit" /></button><button className="danger" onClick={() => remove(memory)} aria-label="删除记忆"><Icon name="trash" /></button></div></div>
      <h2>{memory.title}</h2><p>{memory.content}</p><time>{new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(new Date(`${memory.updatedAt}Z`))} 更新</time>
    </article>)}</div> : <div className="empty-state"><span className="empty-icon memory"><Icon name="memory" /></span><h2>{query || category ? "没翻到" : "这里还空着"}</h2><p>{query || category ? "换个词再找找。" : "有件不想忘的事，就先留在这。"}</p>{!query && !category && <button className="button secondary" onClick={startNew}><Icon name="plus" />记住这个</button>}</div>}
  </div>;
}
