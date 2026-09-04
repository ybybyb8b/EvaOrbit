"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { ConversationAvatar } from "@/components/conversation-avatar";
import Link from "next/link";
import type { AiSettings, ApiError, AvatarType } from "@/lib/types";
import { AppearanceThemeSettings } from "./appearance-theme-settings";
import { useLocale } from "@/components/locale-controller";

type Draft = Omit<AiSettings, "hasApiKey" | "maskedApiKey" | "updatedAt"> & { apiKey: string };

const emptyDraft: Draft = {
  providerPreset: "custom", providerName: "AI Provider", baseUrl: "https://example.com/v1", model: "model-name", apiKey: "", enabled: false,
  temperature: 0.6, systemPrompt: "", responseLength: "balanced", initiative: "quiet",
  allowSuggestions: true, allowTeasing: true, includeTasks: false, includeMemories: false, allowWriteActions: false,
  userDisplayName: "我", userAvatarType: "default", userAvatarValue: "",
  assistantDisplayName: "Eva", assistantAvatarType: "default", assistantAvatarValue: "",
  showUserName: true, showAssistantName: true, showAvatars: true,
};

export function SettingsView() {
  const { english } = useLocale();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [avatarVersion, setAvatarVersion] = useState(() => Date.now().toString());
  const [uploadingAvatar, setUploadingAvatar] = useState<"user" | "assistant" | null>(null);

  useEffect(() => {
    fetch("/api/ai/settings").then(async (response) => {
      if (!response.ok) throw new Error(english ? "Could not load settings" : "读取设置失败");
      return response.json() as Promise<AiSettings>;
    }).then((settings) => {
      setDraft({
        providerPreset: settings.providerPreset, providerName: settings.providerName, baseUrl: settings.baseUrl,
        model: settings.model, enabled: settings.enabled, temperature: settings.temperature, systemPrompt: settings.systemPrompt,
        responseLength: settings.responseLength, initiative: settings.initiative,
        allowSuggestions: settings.allowSuggestions, allowTeasing: settings.allowTeasing,
        includeTasks: false, includeMemories: false, allowWriteActions: settings.allowWriteActions, apiKey: "",
        userDisplayName: settings.userDisplayName, userAvatarType: settings.userAvatarType, userAvatarValue: settings.userAvatarValue,
        assistantDisplayName: settings.assistantDisplayName, assistantAvatarType: settings.assistantAvatarType, assistantAvatarValue: settings.assistantAvatarValue,
        showUserName: settings.showUserName, showAssistantName: settings.showAssistantName, showAvatars: settings.showAvatars,
      });
    }).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false));
  }, [english]);

  async function uploadAvatar(subject: "user" | "assistant", file: File) {
    if (file.size > 4 * 1024 * 1024) { setError(english ? "Avatar must be smaller than 4 MB" : "头像文件必须小于 4 MB"); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError(english ? "Use a JPG, PNG, or WebP image" : "头像只接受 JPG、PNG 或 WebP"); return; }
    setUploadingAvatar(subject); setError(""); setNotice("");
    try {
      const body = new FormData(); body.set("file", file);
      const response = await fetch(`/api/avatars/${subject}`, { method: "POST", body });
      const result = await response.json() as { avatarType?: AvatarType; avatarValue?: string; updatedAt?: string } & ApiError;
      if (!response.ok) throw new Error(result.error);
      if (subject === "user") setDraft((current) => ({ ...current, userAvatarType: "image", userAvatarValue: result.avatarValue ?? "" }));
      else setDraft((current) => ({ ...current, assistantAvatarType: "image", assistantAvatarValue: result.avatarValue ?? "" }));
      setAvatarVersion(Date.now().toString()); setNotice(english ? "Avatar updated." : "头像已经换上了。");
    } catch (reason) { setError(reason instanceof Error ? reason.message : english ? "Could not upload avatar" : "上传头像失败"); }
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

  async function save(event: FormEvent) {
    event.preventDefault(); setWorking(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/ai/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft, (key, value) => key === "apiKey" ? undefined : value) });
      const result = await response.json() as AiSettings & ApiError;
      if (!response.ok) throw new Error(result.error);
      setNotice(english ? "Preferences saved." : "设置已保存。");
    } catch (reason) { setError(reason instanceof Error ? reason.message : english ? "Could not save settings" : "保存失败"); }
    finally { setWorking(false); }
  }

  if (loading) return <div className="page"><div className="loading-state">{english ? "Loading settings…" : "正在读取设置…"}</div></div>;

  return <div className="page">
    <PageHeader eyebrow={english ? "APP & APPEARANCE" : "应用与外观"} title={english ? "App & Appearance" : "应用与外观"} action={<Link className="settings-back-link" href="/settings">{english ? "All Settings" : "全部设置"}</Link>} />

    <form className="provider-card" onSubmit={save}>
      <AppearanceThemeSettings />
      <section className="conversation-appearance-settings">
        <div className="persona-heading"><span className="eyebrow">{english ? "CONVERSATION APPEARANCE" : "对话外观"}</span><h2>{english ? "Conversation identity" : "对话身份"}</h2></div>
        <div className="identity-editor-grid">
          <IdentityEditor english={english} subject="user" label={english ? "My identity" : "我的身份"} name={draft.userDisplayName} avatarType={draft.userAvatarType} avatarValue={draft.userAvatarValue} uploading={uploadingAvatar === "user"} onName={(value) => setDraft({ ...draft, userDisplayName: value })} onEmoji={(value) => setDraft({ ...draft, userAvatarType: "emoji", userAvatarValue: value })} onChoose={(type) => void chooseAvatar("user", type)} onUpload={(file) => void uploadAvatar("user", file)} />
          <IdentityEditor english={english} subject="assistant" label={english ? "Eva's identity" : "Eva 的身份"} name={draft.assistantDisplayName} avatarType={draft.assistantAvatarType} avatarValue={draft.assistantAvatarValue} uploading={uploadingAvatar === "assistant"} onName={(value) => setDraft({ ...draft, assistantDisplayName: value })} onEmoji={(value) => setDraft({ ...draft, assistantAvatarType: "emoji", assistantAvatarValue: value })} onChoose={(type) => void chooseAvatar("assistant", type)} onUpload={(file) => void uploadAvatar("assistant", file)} />
        </div>
        <div className="appearance-toggles">
          <label><input type="checkbox" checked={draft.showUserName} onChange={(event) => setDraft({ ...draft, showUserName: event.target.checked })} /><span><strong>{english ? "Show my name" : "显示我的名称"}</strong><small>{english ? "Shown at the start of grouped messages" : "只在一组连续消息开头显示"}</small></span></label>
          <label><input type="checkbox" checked={draft.showAssistantName} onChange={(event) => setDraft({ ...draft, showAssistantName: event.target.checked })} /><span><strong>{english ? "Show Eva's name" : "显示 Eva 名称"}</strong><small>{english ? "Display name only; the assistant role stays unchanged" : "只改变称呼，不改变助手角色"}</small></span></label>
          <label><input type="checkbox" checked={draft.showAvatars} onChange={(event) => setDraft({ ...draft, showAvatars: event.target.checked })} /><span><strong>{english ? "Show avatars" : "显示小头像"}</strong><small>{english ? "A compact signature beside messages" : "作为消息旁的轻量签名"}</small></span></label>
        </div>
        <div className="conversation-preview" aria-label={english ? "Conversation preview" : "对话外观预览"}>
          <span className="preview-label">PREVIEW</span>
          <div className="preview-message user user-content"><div className="preview-identity">{draft.showUserName && <span>{draft.userDisplayName}</span>}{draft.showAvatars && <ConversationAvatar subject="user" name={draft.userDisplayName} type={draft.userAvatarType} value={draft.userAvatarValue} version={avatarVersion} />}</div><p>{english ? "I had half a bowl of rice for dinner." : "晚上吃了半碗饭"}</p></div>
          <div className="preview-message assistant"><div className="preview-identity">{draft.showAvatars && <ConversationAvatar subject="assistant" name={draft.assistantDisplayName} type={draft.assistantAvatarType} value={draft.assistantAvatarValue} version={avatarVersion} />}{draft.showAssistantName && <span>{draft.assistantDisplayName}</span>}</div><p>{english ? "Logged. I also updated today's intake." : "记了，我顺便把今天的摄入更新了。"}</p></div>
        </div>
      </section>

      <section className="persona-settings">
        <div className="persona-heading"><span className="eyebrow">SELF PERSONA</span><h2>{english ? "Voice & response" : "说话和反应"}</h2><p>{english ? <><code>SELF_PERSONA.md</code> is the baseline. These preferences do not add personal facts to it.</> : <><code>SELF_PERSONA.md</code> 是默认底稿。这里的偏好不会写入具体生活事实。</>}</p></div>
        <div className="form-grid persona-form">
          <label className="field wide"><span>{english ? "Persona notes" : "Persona 补充"} <small>{english ? "Leave blank to use the default persona" : "留空则使用默认 Persona"}</small></span><textarea rows={4} maxLength={5000} value={draft.systemPrompt} onChange={(event) => setDraft({ ...draft, systemPrompt: event.target.value })} placeholder={english ? "For example: lead with the conclusion on technical questions." : "例如：技术问题直接给结论；日常聊天再短一点。"} /></label>
          <label className="field"><span>{english ? "Response length" : "回复长度"}</span><select value={draft.responseLength} onChange={(event) => setDraft({ ...draft, responseLength: event.target.value as Draft["responseLength"] })}><option value="brief">{english ? "Brief" : "简短"}</option><option value="balanced">{english ? "Balanced" : "适中"}</option><option value="detailed">{english ? "Detailed when needed" : "需要时详细"}</option></select></label>
          <label className="field"><span>{english ? "Initiative" : "主动程度"}</span><select value={draft.initiative} onChange={(event) => setDraft({ ...draft, initiative: event.target.value as Draft["initiative"] })}><option value="quiet">{english ? "Quiet" : "安静"}</option><option value="balanced">{english ? "When useful" : "必要时"}</option><option value="active">{english ? "Point out clear omissions" : "提醒明显遗漏"}</option></select></label>
        </div>
        <div className="persona-toggles">
          <label><input type="checkbox" checked={draft.allowSuggestions} onChange={(event) => setDraft({ ...draft, allowSuggestions: event.target.checked })} /><span><strong>{english ? "Allow suggestions" : "可以给建议"}</strong><small>{english ? "Only when useful; do not create plans automatically" : "仅在必要时提出，不自动生成计划"}</small></span></label>
          <label><input type="checkbox" checked={draft.allowTeasing} onChange={(event) => setDraft({ ...draft, allowTeasing: event.target.checked })} /><span><strong>{english ? "Allow light teasing" : "允许轻吐槽"}</strong><small>{english ? "Keep it natural and restrained" : "保持自然和克制"}</small></span></label>
        </div>
      </section>
      <div className="context-options">
        <label className="write-permission"><input type="checkbox" checked={draft.allowWriteActions} onChange={(event) => setDraft({ ...draft, allowWriteActions: event.target.checked })} /><span><strong>{english ? "Allow EvaOrbit writes" : "允许写入 EvaOrbit"}</strong><small>{english ? "On explicit request, Eva may write to Food, Drinks, or Inbox" : "明确要求时可以写入吃吃、喝喝或散落"}</small></span></label>
      </div>
      {error && <p className="form-error">{error}</p>}{notice && <p className="form-success">{notice}</p>}
      <div className="provider-actions">
        <button className="button primary" disabled={working} type="submit">{english ? "Save Preferences" : "保存偏好"}</button>
      </div>
    </form>
  </div>;
}

function IdentityEditor({ english, subject, label, name, avatarType, avatarValue, uploading, onName, onEmoji, onChoose, onUpload }: {
  english: boolean; subject: "user" | "assistant"; label: string; name: string; avatarType: AvatarType; avatarValue: string; uploading: boolean;
  onName: (value: string) => void; onEmoji: (value: string) => void; onChoose: (type: "default" | "emoji") => void; onUpload: (file: File) => void;
}) {
  const inputId = `${subject}-avatar-upload`;
  return <section className="identity-editor">
    <div className="identity-editor-heading"><ConversationAvatar subject={subject} name={name} type={avatarType} value={avatarValue} /><div><span>{label}</span><strong className="user-content">{name || (english ? "Unnamed" : "未命名")}</strong></div></div>
    <label className="field"><span>{english ? subject === "user" ? "My name" : "Eva's name" : subject === "user" ? "我的称呼" : "Eva 的称呼"}</span><input required maxLength={40} value={name} onChange={(event) => onName(event.target.value)} /></label>
    <div className="avatar-choice" role="group" aria-label={english ? `${label} avatar type` : `${label}头像类型`}>
      <button type="button" className={avatarType === "default" ? "active" : ""} onClick={() => onChoose("default")}>{english ? "Default" : "恢复默认"}</button>
      <button type="button" className={avatarType === "emoji" ? "active" : ""} onClick={() => onChoose("emoji")}>Emoji</button>
      <label className={avatarType === "image" ? "active" : ""} htmlFor={inputId}>{uploading ? english ? "Uploading…" : "上传中…" : english ? "Upload Image" : "上传图片"}</label>
      <input id={inputId} className="avatar-file-input" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.target.value = ""; }} />
    </div>
    {avatarType === "emoji" && <label className="field emoji-field"><span>Emoji</span><input required maxLength={16} value={avatarValue} onChange={(event) => onEmoji(event.target.value)} placeholder="✨" /></label>}
    <small className="avatar-help">{english ? "JPG, PNG, or WebP. 4 MB maximum." : "JPG、PNG 或 WebP，最大 4 MB。"}</small>
  </section>;
}
