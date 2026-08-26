"use client";

import Link from "next/link";
import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { MarkdownMessage } from "./markdown-message";
import type { AiSettings, ApiError, ChatMessage, ChatSession } from "@/lib/types";

export function EvaWakePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [toolActivity, setToolActivity] = useState<string[]>([]);
  const loadedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const optimisticIdRef = useRef(-100000);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 80);
    if (loadedRef.current) return;
    loadedRef.current = true; setLoading(true);
    Promise.all([
      fetch("/api/ai/settings", { cache: "no-store" }).then((response) => response.json() as Promise<AiSettings>),
      fetch("/api/ai/sessions", { cache: "no-store" }).then((response) => response.json() as Promise<ChatSession[]>),
    ]).then(([nextSettings, nextSessions]) => { setSettings(nextSettings); setSessions(nextSessions); })
      .catch(() => setError("Eva could not open this conversation"))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: streaming ? "auto" : "smooth" }); }, [messages, open, streaming, toolActivity]);

  async function refreshSessions() {
    const response = await fetch("/api/ai/sessions", { cache: "no-store" });
    if (response.ok) setSessions(await response.json() as ChatSession[]);
  }

  async function openSession(id: number) {
    if (streaming) return;
    setLoading(true); setError(""); setToolActivity([]);
    const response = await fetch(`/api/ai/sessions/${id}/messages`, { cache: "no-store" });
    if (response.ok) { setMessages(await response.json() as ChatMessage[]); setActiveId(id); }
    else setError("Could not open that conversation");
    setLoading(false);
  }

  async function createSession() {
    const response = await fetch("/api/ai/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "New conversation" }) });
    if (!response.ok) throw new Error("Could not start a conversation");
    const session = await response.json() as ChatSession;
    setSessions((current) => [session, ...current]); setActiveId(session.id); setMessages([]);
    return session.id;
  }

  async function send() {
    const text = draft.trim();
    if (!text || streaming || !settings?.enabled) return;
    setDraft(""); setError(""); setToolActivity([]);
    let sessionId = activeId;
    try {
      const resolvedSessionId: number = sessionId ?? await createSession();
      sessionId = resolvedSessionId;
      const userId = optimisticIdRef.current--;
      const assistantId = optimisticIdRef.current--;
      setMessages((current) => [...current,
        { id: userId, sessionId: resolvedSessionId, role: "user", content: text, model: null, providerId: null, modelConfigId: null, createdAt: "" },
        { id: assistantId, sessionId: resolvedSessionId, role: "assistant", content: "", model: settings.model, providerId: null, modelConfigId: null, createdAt: "" },
      ]);
      setStreaming(true);
      const controller = new AbortController(); abortRef.current = controller;
      const response = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: resolvedSessionId, content: text }), signal: controller.signal });
      if (!response.ok) throw new Error(((await response.json()) as ApiError).error);
      const reader = response.body?.getReader(); const decoder = new TextDecoder(); let buffer = "";
      while (reader) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n"); buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          const raw = block.split("\n").find((line) => line.startsWith("data:"))?.slice(5).trim();
          if (!raw) continue;
          const event = JSON.parse(raw) as { delta?: string; error?: string; tool?: { summary: string } };
          if (event.error) throw new Error(event.error);
          if (event.tool) setToolActivity((current) => [...current, event.tool!.summary]);
          if (event.delta) setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: message.content + event.delta } : message));
        }
      }
      const history = await fetch(`/api/ai/sessions/${resolvedSessionId}/messages`, { cache: "no-store" });
      if (history.ok) setMessages(await history.json() as ChatMessage[]);
      await refreshSessions();
    } catch (reason) {
      if ((reason as Error).name !== "AbortError") setError(reason instanceof Error ? reason.message : "Eva could not reply");
      setMessages((current) => current.filter((message) => message.content || message.role !== "assistant"));
    } finally { setStreaming(false); abortRef.current = null; }
  }

  function keyboardSend(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); }
  }

  if (!open) return null;
  const active = sessions.find((session) => session.id === activeId);
  return <div className="eva-wake-layer" role="dialog" aria-modal="true" aria-label="Eva conversation">
    <button className="eva-wake-backdrop" onClick={onClose} aria-label="Close Eva" />
    <section className="eva-wake-panel">
      <header className="eva-wake-header"><div><span className="eva-wake-mark"><Icon name="spark" /></span><span><small>EVA</small><strong>{active?.title ?? "A quiet conversation"}</strong></span></div><div>{activeId && <Link href={`/ai?session=${activeId}`} aria-label="Open full conversation">Expand</Link>}<button onClick={() => { setActiveId(null); setMessages([]); setToolActivity([]); setError(""); }} aria-label="New conversation"><Icon name="plus" /></button><button onClick={onClose} aria-label="Close"><Icon name="close" /></button></div></header>
      <div className="eva-wake-body">
        {loading ? <div className="eva-wake-empty">Opening your space…</div>
        : !settings?.enabled ? <div className="eva-wake-empty"><span className="eva-wake-mark"><Icon name="spark" /></span><h2>Eva needs a model</h2><p>Connect any OpenAI-compatible provider first.</p><Link href="/settings" onClick={onClose}>Open Settings</Link></div>
        : !messages.length ? <div className="eva-wake-start"><div className="eva-wake-art"><span className="eva-wake-mark"><Icon name="spark" /></span><h2>Wake Eva</h2><p>Say one thing. Eva can record, find, and make sense of the life already here.</p></div>{sessions.length > 0 && <div className="eva-recent-sessions"><small>RECENT</small>{sessions.slice(0, 3).map((session) => <button key={session.id} onClick={() => void openSession(session.id)}><strong>{session.title}</strong><span>{session.preview || "Continue this conversation"}</span></button>)}</div>}</div>
        : <div className="eva-wake-messages">{messages.map((message) => <article className={message.role} key={message.id}><div>{message.content ? message.role === "assistant" ? <MarkdownMessage content={message.content} /> : message.content : <span className="typing"><i /><i /><i /></span>}</div></article>)}{toolActivity.length > 0 && <div className="eva-wake-tools">{toolActivity.map((item, index) => <span key={`${item}-${index}`}>✓ {item}</span>)}</div>}<div ref={endRef} /></div>}
      </div>
      {settings?.enabled && <footer className="eva-wake-composer">{error && <p>{error}</p>}<div><textarea ref={inputRef} rows={1} maxLength={20000} value={draft} disabled={streaming} onChange={(event) => setDraft(event.target.value)} onKeyDown={keyboardSend} placeholder="Tell Eva something…" />{streaming ? <button className="stop" onClick={() => abortRef.current?.abort()} aria-label="Stop">■</button> : <button disabled={!draft.trim()} onClick={() => void send()} aria-label="Send"><Icon name="arrow" /></button>}</div></footer>}
    </section>
  </div>;
}
