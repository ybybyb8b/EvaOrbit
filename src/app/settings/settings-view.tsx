"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { ConversationAvatar } from "@/components/conversation-avatar";
import type { AiSettings, ApiError, AvatarType } from "@/lib/types";

type Draft = Omit<AiSettings, "hasApiKey" | "apiKeyManagedByEnvironment" | "updatedAt"> & { apiKey: string };

const presets: Record<string, Pick<Draft, "providerName" | "baseUrl" | "model">> = {
  openai: { providerName: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  deepseek: { providerName: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  openrouter: { providerName: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" },
  ollama: { providerName: "Ollama", baseUrl: "http://127.0.0.1:11434/v1", model: "qwen3" },
  custom: { providerName: "自定义 Provider", baseUrl: "https://example.com/v1", model: "model-name" },
};

const emptyDraft: Draft = {
  providerPreset: "openai", ...presets.openai, apiKey: "", enabled: false,
  temperature: 0.6, systemPrompt: "", responseLength: "balanced", initiative: "quiet",
  allowSuggestions: true, allowTeasing: true, includeTasks: true, includeMemories: true, allowWriteActions: false,
  userDisplayName: "我", userAvatarType: "default", userAvatarValue: "",
  assistantDisplayName: "Eva", assistantAvatarType: "default", assistantAvatarValue: "",
  showUserName: true, showAssistantName: true, showAvatars: true,
};

export function SettingsView() {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [keyManagedByEnvironment, setKeyManagedByEnvironment] = useState(false);
  const [keyTouched, setKeyTouched] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [avatarVersion, setAvatarVersion] = useState(() => Date.now().toString());
  const [uploadingAvatar, setUploadingAvatar] = useState<"user" | "assistant" | null>(null);

  useEffect(() => {
    fetch("/api/ai/settings").then(async (response) => {
      if (!response.ok) throw new Error("读取设置失败");
      return response.json() as Promise<AiSettings>;
    }).then((settings) => {
      setDraft({
        providerPreset: settings.providerPreset, providerName: settings.providerName, baseUrl: settings.baseUrl,
        model: settings.model, enabled: settings.enabled, temperature: settings.temperature, systemPrompt: settings.systemPrompt,
        responseLength: settings.responseLength, initiative: settings.initiative,
        allowSuggestions: settings.allowSuggestions, allowTeasing: settings.allowTeasing,
        includeTasks: settings.includeTasks, includeMemories: settings.includeMemories, allowWriteActions: settings.allowWriteActions, apiKey: "",
        userDisplayName: settings.userDisplayName, userAvatarType: settings.userAvatarType, userAvatarValue: settings.userAvatarValue,
        assistantDisplayName: settings.assistantDisplayName, assistantAvatarType: settings.assistantAvatarType, assistantAvatarValue: settings.assistantAvatarValue,
        showUserName: settings.showUserName, showAssistantName: settings.showAssistantName, showAvatars: settings.showAvatars,
      });
      setHasApiKey(settings.hasApiKey);
      setKeyManagedByEnvironment(settings.apiKeyManagedByEnvironment);
    }).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false));
  }, []);

  function changePreset(providerPreset: string) {
    setDraft({ ...draft, providerPreset, ...presets[providerPreset] });
    setModels([]); setNotice(""); setError("");
  }

  function requestBody() {
    const { apiKey, ...values } = draft;
    return keyTouched ? { ...values, apiKey } : values;
  }

  async function uploadAvatar(subject: "user" | "assistant", file: File) {
    if (file.size > 4 * 1024 * 1024) { setError("头像文件必须小于 4 MB"); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("头像只接受 JPG、PNG 或 WebP"); return; }
    setUploadingAvatar(subject); setError(""); setNotice("");
    try {
      const body = new FormData(); body.set("file", file);
      const response = await fetch(`/api/avatars/${subject}`, { method: "POST", body });
      const result = await response.json() as { avatarType?: AvatarType; avatarValue?: string; updatedAt?: string } & ApiError;
      if (!response.ok) throw new Error(result.error);
      if (subject === "user") setDraft((current) => ({ ...current, userAvatarType: "image", userAvatarValue: result.avatarValue ?? "" }));
      else setDraft((current) => ({ ...current, assistantAvatarType: "image", assistantAvatarValue: result.avatarValue ?? "" }));
      setAvatarVersion(Date.now().toString()); setNotice("头像已经换上了。");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "上传头像失败"); }
    finally { setUploadingAvatar(null); }
  }

  async function chooseAvatar(subject: "user" | "assistant", type: "default" | "emoji") {
    const currentType = subject === "user" ? draft.userAvatarType : draft.assistantAvatarType;
    if (currentType === "image") {
      const response = await fetch(`/api/avatars/${subject}`, { method: "DELETE" });
      if (!response.ok) { setError(((await response.json()) as ApiError).error); return; }
    }
    const value = type === "emoji" ? subject === "user" ? "🌿" : "✨" : "";
    if (subject === "user") setDraft({ ...draft, userAvatarType: type, userAvatarValue: value });
    else setDraft({ ...draft, assistantAvatarType: type, assistantAvatarValue: value });
    setAvatarVersion(Date.now().toString());
  }

  async function discover() {
    setWorking(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/ai/models", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody()) });
      const result = await response.json() as { models?: string[] } & ApiError;
      if (!response.ok) throw new Error(result.error);
      setModels(result.models ?? []);
      setNotice(result.models?.length ? `连接成功，发现 ${result.models.length} 个模型。` : "连接成功，但 Provider 没有返回模型列表；仍可手动填写模型。");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "连接失败"); }
    finally { setWorking(false); }
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setWorking(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/ai/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody()) });
      const result = await response.json() as AiSettings & ApiError;
      if (!response.ok) throw new Error(result.error);
      setHasApiKey(result.hasApiKey); setKeyTouched(false); setDraft({ ...draft, apiKey: "" });
      setNotice("设置留下了。现在去“想想”就会按这套方式说话。");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败"); }
    finally { setWorking(false); }
  }

  if (loading) return <div className="page"><div className="loading-state">正在读取设置…</div></div>;

  return <div className="page">
    <PageHeader eyebrow="SETTINGS" title="设置" description="模型怎么连、另一个自己怎么说话，都放在这里。" />
    <div className="settings-summary">
      <section><span>生产数据</span><strong>Supabase Postgres</strong></section>
      <section><span>访问方式</span><strong>私人账户 · RLS</strong></section>
      <section><span>本地后备</span><strong>SQLite schema v6</strong></section>
    </div>

    <form className="provider-card" onSubmit={save}>
      <div className="provider-heading"><div><span className="eyebrow">MODEL CONNECTION</span><h2>模型接口</h2><p>兼容 OpenAI Chat Completions，也可以接本地 Ollama。</p></div><label className="switch-row"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /><span>接上模型</span></label></div>
      <div className="provider-presets" role="group" aria-label="Provider 预设">
        {Object.keys(presets).map((key) => <button type="button" className={draft.providerPreset === key ? "active" : ""} key={key} onClick={() => changePreset(key)}>{key === "custom" ? "自定义" : presets[key].providerName}</button>)}
      </div>
      <div className="form-grid provider-form">
        <label className="field"><span>显示名称</span><input required maxLength={80} value={draft.providerName} onChange={(event) => setDraft({ ...draft, providerName: event.target.value })} /></label>
        <label className="field"><span>接口地址</span><input required type="url" maxLength={500} value={draft.baseUrl} onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} /></label>
        <label className="field"><span>API Key <small>{keyManagedByEnvironment ? hasApiKey ? "已由服务器环境变量配置" : "请在服务器配置 AI_API_KEY" : hasApiKey && !keyTouched ? "已存于本地服务端；留空保持不变" : draft.providerPreset === "ollama" ? "本地服务可留空" : "仅经 EvaOrbit 服务端发送"}</small></span><input type="password" autoComplete="off" maxLength={1000} disabled={keyManagedByEnvironment} value={draft.apiKey} onChange={(event) => { setKeyTouched(true); setDraft({ ...draft, apiKey: event.target.value }); }} placeholder={keyManagedByEnvironment ? "由服务器环境管理" : hasApiKey && !keyTouched ? "••••••••••••" : "sk-…"} /></label>
        <label className="field"><span>模型</span><input required list="provider-models" maxLength={160} value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })} /><datalist id="provider-models">{models.map((model) => <option value={model} key={model} />)}</datalist></label>
        <label className="field"><span>温度 <small>{draft.temperature.toFixed(1)} · 越低越稳定</small></span><input className="range-input" type="range" min="0" max="2" step="0.1" value={draft.temperature} onChange={(event) => setDraft({ ...draft, temperature: Number(event.target.value) })} /></label>
      </div>

      <section className="conversation-appearance-settings">
        <div className="persona-heading"><span className="eyebrow">CONVERSATION APPEARANCE</span><h2>对话里的我们</h2><p>这里只改变聊天界面的称呼和头像，不改变 Persona、Memory、消息角色或数据归属。</p></div>
        <div className="identity-editor-grid">
          <IdentityEditor subject="user" label="我的身份" name={draft.userDisplayName} avatarType={draft.userAvatarType} avatarValue={draft.userAvatarValue} uploading={uploadingAvatar === "user"} onName={(value) => setDraft({ ...draft, userDisplayName: value })} onEmoji={(value) => setDraft({ ...draft, userAvatarType: "emoji", userAvatarValue: value })} onChoose={(type) => void chooseAvatar("user", type)} onUpload={(file) => void uploadAvatar("user", file)} />
          <IdentityEditor subject="assistant" label="Eva 的身份" name={draft.assistantDisplayName} avatarType={draft.assistantAvatarType} avatarValue={draft.assistantAvatarValue} uploading={uploadingAvatar === "assistant"} onName={(value) => setDraft({ ...draft, assistantDisplayName: value })} onEmoji={(value) => setDraft({ ...draft, assistantAvatarType: "emoji", assistantAvatarValue: value })} onChoose={(type) => void chooseAvatar("assistant", type)} onUpload={(file) => void uploadAvatar("assistant", file)} />
        </div>
        <div className="appearance-toggles">
          <label><input type="checkbox" checked={draft.showUserName} onChange={(event) => setDraft({ ...draft, showUserName: event.target.checked })} /><span><strong>显示我的名称</strong><small>只在一组连续消息开头显示</small></span></label>
          <label><input type="checkbox" checked={draft.showAssistantName} onChange={(event) => setDraft({ ...draft, showAssistantName: event.target.checked })} /><span><strong>显示 Eva 名称</strong><small>称呼可以改，assistant role 不变</small></span></label>
          <label><input type="checkbox" checked={draft.showAvatars} onChange={(event) => setDraft({ ...draft, showAvatars: event.target.checked })} /><span><strong>显示小头像</strong><small>只作轻量签名，不挤压正文</small></span></label>
        </div>
        <div className="conversation-preview" aria-label="对话外观预览">
          <span className="preview-label">PREVIEW</span>
          <div className="preview-message user"><div className="preview-identity">{draft.showUserName && <span>{draft.userDisplayName}</span>}{draft.showAvatars && <ConversationAvatar subject="user" name={draft.userDisplayName} type={draft.userAvatarType} value={draft.userAvatarValue} version={avatarVersion} />}</div><p>晚上吃了半碗饭</p></div>
          <div className="preview-message assistant"><div className="preview-identity">{draft.showAvatars && <ConversationAvatar subject="assistant" name={draft.assistantDisplayName} type={draft.assistantAvatarType} value={draft.assistantAvatarValue} version={avatarVersion} />}{draft.showAssistantName && <span>{draft.assistantDisplayName}</span>}</div><p>记了，我顺便把今天的摄入更新了。</p></div>
        </div>
      </section>

      <section className="persona-settings">
        <div className="persona-heading"><span className="eyebrow">SELF PERSONA</span><h2>说话和反应</h2><p><code>SELF_PERSONA.md</code> 是默认底稿。这里写的是临时偏好，不会把具体生活事实塞进 Persona。</p></div>
        <div className="form-grid persona-form">
          <label className="field wide"><span>Persona 补充 <small>留空就完全使用默认 Persona</small></span><textarea rows={4} maxLength={5000} value={draft.systemPrompt} onChange={(event) => setDraft({ ...draft, systemPrompt: event.target.value })} placeholder="例如：技术问题直接给结论；日常聊天再短一点。" /></label>
          <label className="field"><span>回复长度</span><select value={draft.responseLength} onChange={(event) => setDraft({ ...draft, responseLength: event.target.value as Draft["responseLength"] })}><option value="brief">短一点</option><option value="balanced">看情况</option><option value="detailed">需要时详细</option></select></label>
          <label className="field"><span>主动程度</span><select value={draft.initiative} onChange={(event) => setDraft({ ...draft, initiative: event.target.value as Draft["initiative"] })}><option value="quiet">安静点</option><option value="balanced">有必要再说</option><option value="active">明显遗漏时提醒</option></select></label>
        </div>
        <div className="persona-toggles">
          <label><input type="checkbox" checked={draft.allowSuggestions} onChange={(event) => setDraft({ ...draft, allowSuggestions: event.target.checked })} /><span><strong>可以给建议</strong><small>有必要才说，不自动生成计划</small></span></label>
          <label><input type="checkbox" checked={draft.allowTeasing} onChange={(event) => setDraft({ ...draft, allowTeasing: event.target.checked })} /><span><strong>允许轻吐槽</strong><small>自然一点，不硬玩梗</small></span></label>
          <label><input type="checkbox" checked={draft.includeMemories} onChange={(event) => setDraft({ ...draft, includeMemories: event.target.checked })} /><span><strong>主动找找以前</strong><small>只召回当前问题相关的 Memory</small></span></label>
        </div>
      </section>
      <div className="context-options">
        <label><input type="checkbox" checked={draft.includeTasks} onChange={(event) => setDraft({ ...draft, includeTasks: event.target.checked })} /><span><strong>按需看待办</strong><small>只在问题涉及安排或任务时带入相关项</small></span></label>
        <label className="write-permission"><input type="checkbox" checked={draft.allowWriteActions} onChange={(event) => setDraft({ ...draft, allowWriteActions: event.target.checked })} /><span><strong>允许写入 EvaOrbit</strong><small>明确要求时可以创建、完成或留下记录</small></span></label>
      </div>
      {error && <p className="form-error">{error}</p>}{notice && <p className="form-success">{notice}</p>}
      <div className="provider-actions">
        {hasApiKey && !keyManagedByEnvironment && <button type="button" className="text-button danger-text" onClick={() => { setKeyTouched(true); setDraft({ ...draft, apiKey: "" }); setNotice("保存后将清除当前 API Key。"); }}>清除已保存 Key</button>}
        <button type="button" className="button secondary" disabled={working} onClick={discover}>{working ? "连接中…" : "测试并读取模型"}</button>
        <button className="button primary" disabled={working} type="submit">留下设置</button>
      </div>
    </form>
  </div>;
}

function IdentityEditor({ subject, label, name, avatarType, avatarValue, uploading, onName, onEmoji, onChoose, onUpload }: {
  subject: "user" | "assistant"; label: string; name: string; avatarType: AvatarType; avatarValue: string; uploading: boolean;
  onName: (value: string) => void; onEmoji: (value: string) => void; onChoose: (type: "default" | "emoji") => void; onUpload: (file: File) => void;
}) {
  const inputId = `${subject}-avatar-upload`;
  return <section className="identity-editor">
    <div className="identity-editor-heading"><ConversationAvatar subject={subject} name={name} type={avatarType} value={avatarValue} /><div><span>{label}</span><strong>{name || "未命名"}</strong></div></div>
    <label className="field"><span>{subject === "user" ? "我的称呼" : "Eva 的称呼"}</span><input required maxLength={40} value={name} onChange={(event) => onName(event.target.value)} /></label>
    <div className="avatar-choice" role="group" aria-label={`${label}头像类型`}>
      <button type="button" className={avatarType === "default" ? "active" : ""} onClick={() => onChoose("default")}>恢复默认</button>
      <button type="button" className={avatarType === "emoji" ? "active" : ""} onClick={() => onChoose("emoji")}>Emoji</button>
      <label className={avatarType === "image" ? "active" : ""} htmlFor={inputId}>{uploading ? "上传中…" : "上传图片"}</label>
      <input id={inputId} className="avatar-file-input" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.target.value = ""; }} />
    </div>
    {avatarType === "emoji" && <label className="field emoji-field"><span>Emoji</span><input required maxLength={16} value={avatarValue} onChange={(event) => onEmoji(event.target.value)} placeholder="✨" /></label>}
    <small className="avatar-help">JPG、PNG 或 WebP，最大 4 MB。图片按正方形区域圆形显示。</small>
  </section>;
}
