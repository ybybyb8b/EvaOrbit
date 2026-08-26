"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { AiModelConfig, AiProvider, ApiError } from "@/lib/types";

type ProviderDraft = {
  name: string;
  providerType: string;
  baseUrl: string;
  enabled: boolean;
  apiKey: string;
  clearApiKey: boolean;
};

const blankProvider: ProviderDraft = {
  name: "",
  providerType: "openai-compatible",
  baseUrl: "https://api.openai.com/v1",
  enabled: true,
  apiKey: "",
  clearApiKey: false,
};

export function AiProvidersSettings() {
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [selectedId, setSelectedId] = useState<number | "new">("new");
  const [draft, setDraft] = useState<ProviderDraft>(blankProvider);
  const [editingKey, setEditingKey] = useState(true);
  const [discovered, setDiscovered] = useState<string[]>([]);
  const [modelId, setModelId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const selected = useMemo(() => providers.find((provider) => provider.id === selectedId) ?? null, [providers, selectedId]);

  async function load(preferredId?: number) {
    const response = await fetch("/api/ai/providers", { cache: "no-store" });
    const result = await response.json() as AiProvider[] & ApiError;
    if (!response.ok) throw new Error(result.error);
    setProviders(result);
    const nextId = preferredId && result.some((provider) => provider.id === preferredId) ? preferredId : result[0]?.id ?? "new";
    selectProvider(nextId, result);
  }

  function selectProvider(id: number | "new", source = providers) {
    setSelectedId(id); setDiscovered([]); setModelId(""); setDisplayName(""); setNotice(""); setError("");
    const provider = source.find((item) => item.id === id);
    if (provider) {
      setDraft({ name: provider.name, providerType: provider.providerType, baseUrl: provider.baseUrl, enabled: provider.enabled, apiKey: "", clearApiKey: false });
      setEditingKey(!provider.hasApiKey);
    } else {
      setDraft(blankProvider); setEditingKey(true);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/providers", { cache: "no-store" }).then(async (response) => {
      const result = await response.json() as AiProvider[] & ApiError;
      if (!response.ok) throw new Error(result.error);
      if (cancelled) return;
      setProviders(result);
      const first = result[0];
      if (first) {
        setSelectedId(first.id);
        setDraft({ name: first.name, providerType: first.providerType, baseUrl: first.baseUrl, enabled: first.enabled, apiKey: "", clearApiKey: false });
        setEditingKey(!first.hasApiKey);
      }
    }).catch((reason: Error) => { if (!cancelled) setError(reason.message); });
    return () => { cancelled = true; };
  }, []);

  function providerBody() {
    const base = { name: draft.name, providerType: draft.providerType, baseUrl: draft.baseUrl, enabled: draft.enabled };
    if (draft.clearApiKey) return { ...base, clearApiKey: true };
    return editingKey && draft.apiKey.trim() ? { ...base, apiKey: draft.apiKey } : base;
  }

  async function saveProvider(event: FormEvent) {
    event.preventDefault(); setWorking(true); setError(""); setNotice("");
    try {
      const creating = selectedId === "new";
      const response = await fetch(creating ? "/api/ai/providers" : `/api/ai/providers/${selectedId}`, {
        method: creating ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(providerBody()),
      });
      const result = await response.json() as AiProvider & ApiError;
      if (!response.ok) throw new Error(result.error);
      await load(result.id); setNotice(creating ? "Provider 已添加。现在可以给它添加模型。" : "Provider 连接信息已保存。");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "保存 Provider 失败"); }
    finally { setWorking(false); }
  }

  async function testConnection() {
    setWorking(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/ai/providers/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...providerBody(), providerId: selected?.id }) });
      const result = await response.json() as { models?: string[] } & ApiError;
      if (!response.ok) throw new Error(result.error);
      setDiscovered(result.models ?? []);
      setNotice(result.models?.length ? `连接成功，发现 ${result.models.length} 个模型。` : "连接成功，但接口没有返回模型列表；可以手动填写 Model ID。");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "连接测试失败"); }
    finally { setWorking(false); }
  }

  async function addModel(event: FormEvent) {
    event.preventDefault();
    if (!selected) { setError("请先保存 Provider，再添加模型"); return; }
    setWorking(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/ai/providers/${selected.id}/models`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modelId, displayName: displayName || modelId, enabled: true, isDefault: providers.every((provider) => provider.models.every((model) => !model.isDefault)), capabilities: {} }) });
      const result = await response.json() as AiModelConfig & ApiError;
      if (!response.ok) throw new Error(result.error);
      setModelId(""); setDisplayName(""); await load(selected.id); setNotice("模型已添加。");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "添加模型失败"); }
    finally { setWorking(false); }
  }

  async function updateModel(model: AiModelConfig, values: Partial<AiModelConfig>) {
    setWorking(true); setError("");
    try {
      const response = await fetch(`/api/ai/model-configs/${model.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modelId: values.modelId ?? model.modelId, displayName: values.displayName ?? model.displayName, enabled: values.enabled ?? model.enabled, isDefault: values.isDefault ?? model.isDefault, capabilities: model.capabilities }) });
      const result = await response.json() as AiModelConfig & ApiError;
      if (!response.ok) throw new Error(result.error);
      await load(selected?.id); setNotice(values.isDefault ? "全局默认模型已更新。新对话会使用它。" : "模型设置已更新。");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "更新模型失败"); }
    finally { setWorking(false); }
  }

  async function removeModel(model: AiModelConfig) {
    if (!window.confirm(`删除模型“${model.displayName}”？正在使用它的对话不会允许删除。`)) return;
    const response = await fetch(`/api/ai/model-configs/${model.id}`, { method: "DELETE" });
    if (!response.ok) { setError(((await response.json()) as ApiError).error); return; }
    await load(selected?.id); setNotice("模型已删除。");
  }

  async function removeProvider() {
    if (!selected || !window.confirm(`删除 Provider“${selected.name}”及其模型？正在使用的配置不会允许删除。`)) return;
    const response = await fetch(`/api/ai/providers/${selected.id}`, { method: "DELETE" });
    if (!response.ok) { setError(((await response.json()) as ApiError).error); return; }
    await load(); setNotice("Provider 已删除。");
  }

  return <section className="ai-providers-panel">
    <div className="provider-heading"><div><span className="eyebrow">AI PROVIDERS</span><h2>模型连接</h2><p>一套 Provider 保存一枚加密 Key，再为它添加多个模型。</p></div><button className="button secondary" type="button" onClick={() => selectProvider("new")}>新增 Provider</button></div>
    <div className="provider-manager">
      <nav className="provider-list" aria-label="AI Provider 列表">
        {providers.map((provider) => <button type="button" key={provider.id} className={selectedId === provider.id ? "active" : ""} onClick={() => selectProvider(provider.id)}><span><strong>{provider.name}</strong><small>{provider.models.length} 个模型 · {provider.enabled ? "已启用" : "已停用"}</small></span>{provider.models.some((model) => model.isDefault) && <em>默认</em>}</button>)}
        {!providers.length && <p>还没有 Provider。</p>}
      </nav>
      <div className="provider-editor">
        <form onSubmit={saveProvider}>
          <div className="provider-editor-title"><div><strong>{selected ? `编辑 ${selected.name}` : "添加 Provider"}</strong><small>{selected?.hasApiKey ? `Key ${selected.maskedApiKey ?? "••••••••"}` : "尚未保存 API Key"}</small></div><label className="switch-row"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /><span>启用</span></label></div>
          <div className="form-grid">
            <label className="field"><span>Provider 名称</span><input required maxLength={80} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
            <label className="field"><span>协议</span><select value={draft.providerType} onChange={(event) => setDraft({ ...draft, providerType: event.target.value })}><option value="openai-compatible">OpenAI-compatible</option><option value="openai">OpenAI</option><option value="openrouter">OpenRouter</option><option value="ollama">Ollama</option></select></label>
            <label className="field wide"><span>Base URL</span><input required type="url" maxLength={500} value={draft.baseUrl} onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} /></label>
            <label className="field wide"><span>API Key <small>只在服务端加密保存</small></span><div className="api-key-control"><input type="password" autoComplete="new-password" maxLength={1000} disabled={Boolean(selected?.hasApiKey) && !editingKey || draft.clearApiKey} value={draft.apiKey} onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })} placeholder={selected?.hasApiKey && !editingKey ? selected.maskedApiKey ?? "••••••••" : draft.providerType === "ollama" ? "本地服务可留空" : "输入 API Key"} />{selected?.hasApiKey && <button type="button" className="text-button" onClick={() => { setEditingKey(!editingKey); setDraft({ ...draft, apiKey: "", clearApiKey: false }); }}>{editingKey ? "取消更换" : "更换 Key"}</button>}</div></label>
          </div>
          <div className="provider-actions">{selected?.hasApiKey && <button type="button" className="text-button danger-text" onClick={() => setDraft({ ...draft, clearApiKey: !draft.clearApiKey, apiKey: "" })}>{draft.clearApiKey ? "取消移除 Key" : "移除 Key"}</button>}{selected && <button type="button" className="text-button danger-text" onClick={() => void removeProvider()}>删除 Provider</button>}<button type="button" className="button secondary" disabled={working} onClick={() => void testConnection()}>测试连接 / 获取模型</button><button className="button primary" disabled={working} type="submit">保存连接</button></div>
        </form>

        {selected && <section className="provider-models"><div className="provider-models-head"><div><strong>模型</strong><small>默认模型只影响新对话；对话内切换不会改它。</small></div></div>
          <form className="model-add-form" onSubmit={addModel}><label className="field"><span>Model ID</span><input required list={`discovered-${selected.id}`} maxLength={200} value={modelId} onChange={(event) => { setModelId(event.target.value); if (!displayName) setDisplayName(event.target.value); }} /><datalist id={`discovered-${selected.id}`}>{discovered.map((model) => <option value={model} key={model} />)}</datalist></label><label className="field"><span>显示名称</span><input required maxLength={120} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><button className="button secondary" disabled={working} type="submit">添加模型</button></form>
          <div className="provider-model-list">{selected.models.map((model) => <ModelRow key={model.id} model={model} working={working} onUpdate={updateModel} onDelete={removeModel} />)}{!selected.models.length && <p>还没有模型。可以手动填写，或先测试连接读取列表。</p>}</div>
        </section>}
      </div>
    </div>
    {error && <p className="form-error">{error}</p>}{notice && <p className="form-success">{notice}</p>}
  </section>;
}

function ModelRow({ model, working, onUpdate, onDelete }: { model: AiModelConfig; working: boolean; onUpdate: (model: AiModelConfig, values: Partial<AiModelConfig>) => Promise<void>; onDelete: (model: AiModelConfig) => Promise<void> }) {
  return <article className="provider-model-row"><div><input key={model.displayName} aria-label="模型显示名称" defaultValue={model.displayName} maxLength={120} onBlur={(event) => { const name = event.currentTarget.value.trim(); if (name && name !== model.displayName) void onUpdate(model, { displayName: name }); }} /><code>{model.modelId}</code></div><div><label><input type="checkbox" checked={model.enabled} disabled={working} onChange={(event) => void onUpdate(model, { enabled: event.target.checked })} />启用</label><button type="button" className={model.isDefault ? "default-model active" : "default-model"} disabled={working || model.isDefault} onClick={() => void onUpdate(model, { isDefault: true, enabled: true })}>{model.isDefault ? "全局默认" : "设为默认"}</button><button type="button" className="text-button danger-text" disabled={working} onClick={() => void onDelete(model)}>删除</button></div></article>;
}
