"use client";

import Link from "next/link";
import { KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { MarkdownMessage } from "@/components/markdown-message";
import { ConversationAvatar } from "@/components/conversation-avatar";
import type { AiSettings, ApiError, ChatMessage, ChatSession } from "@/lib/types";

const starters = [
  "翻一下待办 看看今天哪个真得先弄",
  "找找我最近记过的东西",
  "我是不是漏了什么 翻一下",
  "最近有点乱 先看看都堆了些什么",
];

export function AiChatView({ initialPrompt, initialSessionId }: { initialPrompt: string; initialSessionId: number | null }) {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState(initialPrompt);
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [toolActivity, setToolActivity] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const optimisticIdRef = useRef(-1);

  const refreshSessions = useCallback(async () => {
    const response = await fetch("/api/ai/sessions", { cache: "no-store" });
    if (response.ok) setSessions(await response.json() as ChatSession[]);
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/ai/settings").then((response) => response.json() as Promise<AiSettings>),
      fetch("/api/ai/sessions").then((response) => response.json() as Promise<ChatSession[]>),
    ]).then(([aiSettings, chatSessions]) => {
      setSettings(aiSettings); setSessions(chatSessions);
      const requested = chatSessions.find((session) => session.id === initialSessionId);
      if (requested || chatSessions[0]) setActiveId((requested ?? chatSessions[0]).id);
    }).catch(() => setError("暂时翻不到这些数据")).finally(() => setLoading(false));
  }, [initialSessionId]);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    fetch(`/api/ai/sessions/${activeId}/messages`).then((response) => response.json()).then((result: ChatMessage[]) => { if (!cancelled) setMessages(result); });
    return () => { cancelled = true; };
  }, [activeId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: streaming ? "auto" : "smooth" }); }, [messages, streaming, toolActivity]);

  async function createSession() {
    const response = await fetch("/api/ai/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "新对话" }) });
    if (!response.ok) throw new Error("创建会话失败");
    const session = await response.json() as ChatSession;
    setSessions((current) => [session, ...current]); setActiveId(session.id); setMessages([]);
    setHistoryOpen(false);
    return session.id;
  }

  async function removeSession(session: ChatSession) {
    if (!window.confirm(`删除“${session.title}”及其中全部消息？`)) return;
    await fetch(`/api/ai/sessions/${session.id}`, { method: "DELETE" });
    const remaining = sessions.filter((item) => item.id !== session.id);
    setSessions(remaining);
    if (activeId === session.id) {
      setActiveId(remaining[0]?.id ?? null);
      if (!remaining.length) setMessages([]);
    }
  }

  async function renameSession(session: ChatSession) {
    const title = window.prompt("会话名称", session.title)?.trim();
    if (!title || title === session.title) return;
    const response = await fetch(`/api/ai/sessions/${session.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
    if (response.ok) await refreshSessions();
  }

  async function send(content = draft) {
    const text = content.trim();
    if (!text || streaming || !settings?.enabled) return;
    setError(""); setToolActivity([]); setDraft("");
    let sessionId = activeId;
    try {
      if (!sessionId) sessionId = await createSession();
      const optimisticId = optimisticIdRef.current--;
      const optimisticUser: ChatMessage = { id: optimisticId, sessionId, role: "user", content: text, model: null, createdAt: "" };
      const optimisticAssistant: ChatMessage = { id: optimisticIdRef.current--, sessionId, role: "assistant", content: "", model: settings.model, createdAt: "" };
      setMessages((current) => [...current, optimisticUser, optimisticAssistant]); setStreaming(true);
      const controller = new AbortController(); abortRef.current = controller;
      const response = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, content: text }), signal: controller.signal });
      if (!response.ok) throw new Error(((await response.json()) as ApiError).error);
      const reader = response.body?.getReader();
      const decoder = new TextDecoder(); let buffer = "";
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n"); buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          const raw = block.split("\n").find((line) => line.startsWith("data:"))?.slice(5).trim();
          if (!raw) continue;
          const streamEvent = JSON.parse(raw) as { delta?: string; error?: string; tool?: { summary: string; wrote: boolean } };
          if (streamEvent.error) throw new Error(streamEvent.error);
          if (streamEvent.tool) setToolActivity((current) => [...current, streamEvent.tool!.summary]);
          if (streamEvent.delta) setMessages((current) => current.map((item) => item.id === optimisticAssistant.id ? { ...item, content: item.content + streamEvent.delta } : item));
        }
      }
      const messageResponse = await fetch(`/api/ai/sessions/${sessionId}/messages`);
      if (messageResponse.ok) setMessages(await messageResponse.json() as ChatMessage[]);
      await refreshSessions();
    } catch (reason) {
      if ((reason as Error).name !== "AbortError") setError(reason instanceof Error ? reason.message : "生成回复失败");
      setMessages((current) => current.filter((item) => item.content || item.role !== "assistant"));
    } finally { setStreaming(false); abortRef.current = null; }
  }

  function keyboardSend(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); }
  }

  if (loading) return <div className="page ai-page"><div className="loading-state">在翻本地数据…</div></div>;

  const activeSession = sessions.find((session) => session.id === activeId);
  return <div className="ai-workspace">
    {historyOpen && <button className="drawer-backdrop" onClick={() => setHistoryOpen(false)} aria-label="关闭会话列表" />}
    {historyOpen && <aside className="chat-history open">
      <div className="chat-history-head"><div><span className="eyebrow">CONVERSATIONS</span><h2>聊过这些</h2></div><div><button onClick={() => void createSession()} aria-label="新开一段"><Icon name="plus" /></button><button onClick={() => setHistoryOpen(false)} aria-label="收起"><Icon name="close" /></button></div></div>
      <div className="session-list">{sessions.map((session) => <div className={`session-item ${activeId === session.id ? "active" : ""}`} key={session.id}>
        <button className="session-select" onClick={() => { setActiveId(session.id); setToolActivity([]); setHistoryOpen(false); }}><strong>{session.title}</strong><span>{session.preview || "空白对话"}</span></button>
        <div className="session-actions"><button onClick={() => void renameSession(session)} aria-label="重命名">✎</button><button onClick={() => void removeSession(session)} aria-label="删除">×</button></div>
      </div>)}</div>
      {!sessions.length && <div className="session-empty"><span><Icon name="spark" /></span><p>还空着。想到什么就先说。</p></div>}
    </aside>}

    <main className="chat-main">
      <header className="chat-topbar">
        <div className="chat-title-group"><button className="icon-button" onClick={() => setHistoryOpen(true)} aria-label="翻以前聊过的"><Icon name="history" /></button><div><span className="eyebrow">SELF</span><h1>{activeSession?.title ?? "随便想点什么"}</h1></div></div>
        <div className="chat-topbar-tools"><div className="model-badge"><span className={settings?.enabled ? "online" : ""} />{settings?.model}</div><button className="icon-button" onClick={() => void createSession()} aria-label="新建对话"><Icon name="plus" /></button></div>
      </header>
      {!settings?.enabled ? <div className="ai-setup-state"><span className="coming-icon"><Icon name="spark" /></span><h2>先接一个模型</h2><p>OpenAI、DeepSeek、OpenRouter、Ollama 或兼容接口都行。没接也不影响待办和 Memory。</p><Link href="/settings" className="button primary">去设置里接上</Link></div>
      : <>
        <section className="message-scroll">
          {!messages.length ? <div className="chat-welcome"><span className="ai-orb"><Icon name="spark" /></span><span className="eyebrow">THINKING SPACE</span><h2>有什么先丢这里</h2><p>可以翻待办、找以前记过的，也可以只是把一个模糊念头说出来。</p><div className="starter-grid">{starters.map((starter) => <button key={starter} onClick={() => void send(starter)}>{starter}<Icon name="arrow" /></button>)}</div></div>
          : <div className="message-list">{messages.map((message, index) => { const groupStart = index === 0 || messages[index - 1].role !== message.role; const user = message.role === "user"; const showName = user ? settings.showUserName : settings.showAssistantName; const name = user ? settings.userDisplayName : settings.assistantDisplayName; const avatarType = user ? settings.userAvatarType : settings.assistantAvatarType; const avatarValue = user ? settings.userAvatarValue : settings.assistantAvatarValue; return <article className={`chat-message ${message.role} ${groupStart ? "group-start" : "group-continuation"}`} key={message.id}>
            <div className="message-body">{groupStart && (showName || settings.showAvatars) && <div className="message-identity">{!user && settings.showAvatars && <ConversationAvatar subject="assistant" name={name} type={avatarType} value={avatarValue} version={settings.updatedAt} />}{showName && <span>{name}</span>}{user && settings.showAvatars && <ConversationAvatar subject="user" name={name} type={avatarType} value={avatarValue} version={settings.updatedAt} />}</div>}<div className="message-content">{message.content ? user ? <div className="user-message-text">{message.content}</div> : <MarkdownMessage content={message.content} /> : <span className="typing"><i /><i /><i /></span>}</div>
              {message.content && <div className="message-actions"><button onClick={() => void navigator.clipboard.writeText(message.content)}>复制</button>{message.role === "assistant" && <button onClick={() => { const previous = messages.slice(0, index).reverse().find((item) => item.role === "user"); if (previous) void send(previous.content); }}>再次提问</button>}</div>}
            </div>
          </article>; })}{toolActivity.length > 0 && <div className="tool-activity"><span className="tool-icon"><Icon name="check" /></span><div><strong>刚刚动了这些</strong>{toolActivity.map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}</div></div>}<div ref={bottomRef} /></div>}
        </section>
        <footer className="composer-wrap">
          {error && <div className="chat-error">{error}<button onClick={() => setError("")}>×</button></div>}
          <div className="composer-shortcuts"><button onClick={() => setDraft("翻一下待办 看看现在先弄什么")}>翻待办</button><button onClick={() => setDraft("找找以前记过的：")}>找找以前</button><button onClick={() => setDraft("先记一下：")}>先记一下</button><span>{settings.allowWriteActions ? "可以写入" : "只翻不改"}</span></div>
          <div className="composer"><textarea rows={1} maxLength={20000} value={draft} disabled={streaming} onKeyDown={keyboardSend} onChange={(event) => setDraft(event.target.value)} placeholder="想到什么就写…" />{streaming ? <button className="send-button stop" onClick={() => abortRef.current?.abort()} aria-label="停一下">■</button> : <button className="send-button" disabled={!draft.trim()} onClick={() => void send()} aria-label="发出去"><Icon name="arrow" /></button>}</div>
          <div className="composer-foot"><span>{settings.includeTasks && "待办"}{settings.includeTasks && settings.includeMemories && " · "}{settings.includeMemories && "Memory"}可按需翻</span><small>重要的还是自己确认一下</small></div>
        </footer>
      </>}
    </main>
  </div>;
}
