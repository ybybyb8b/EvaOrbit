"use client";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Menu4 } from "reicon-react";
import { useBusinessRequest } from "./business-request-context";
import { useLocale } from "./locale-controller";
import { FormSheet } from "./form-sheet";
import { Icon } from "./icons";
import { HermesMessageBody } from "./hermes-message";
import { HermesChoiceSheet } from "./hermes-choice-sheet";
import { HermesNoteSheet } from "./hermes-note-sheet";
import { filterHermesCommands, HermesCommandMenu } from "./hermes-command-menu";
import { ErrorNotice } from "./error-notice";
import { PageLoading } from "./page-loading";
import { responseError } from "@/lib/response-error";
import { notifyHermesActivity } from "@/lib/hermes-activity";
import { hermesPending, hermesStatusText, mergeHermesMessages, type HermesCommand, type HermesData, type HermesMessage, type HermesPairing } from "@/lib/hermes";
import styles from "./hermes-chat.module.css";

export function HermesChat({ initialConversationId }: { initialConversationId?: string }) {
  const request = useBusinessRequest(), { english } = useLocale();
  const [data, setData] = useState<HermesData>(), [messages, setMessages] = useState<HermesMessage[]>([]);
  const [active, setActive] = useState<string | undefined>(initialConversationId), [draft, setDraft] = useState("");
  const [error, setError] = useState(""), [sending, setSending] = useState(false), [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(false), [setup, setSetup] = useState(false), [hasOlder, setHasOlder] = useState(false);
  const [clearId, setClearId] = useState<string>(), [connectionAction, setConnectionAction] = useState<"pair" | "disconnect">();
  const [notes, setNotes] = useState(false), [noteOpen, setNoteOpen] = useState(false), [noteDraft, setNoteDraft] = useState(""), [choiceId, setChoiceId] = useState<string>();
  const seenQuestions = useRef(new Set<string>());
  const [commandOpen, setCommandOpen] = useState(false), [commandIndex, setCommandIndex] = useState(0);
  const commandId = useId();
  const input = useRef<HTMLTextAreaElement>(null);
  const messageRef = useRef<HermesMessage[]>([]), activeRef = useRef(active), newChat = useRef(false), mounted = useRef(true);
  const requestKey = useRef<{ id: string; conversationId: string; content: string; note?: boolean; responseTo?: string } | null>(null), sendLock = useRef(false);
  const refresh = useRef<() => Promise<void>>(async () => {}), bottom = useRef<HTMLDivElement>(null), scroll = useRef<HTMLDivElement>(null), followBottom = useRef(true);
  const container = useRef<HTMLElement>(null), composerArea = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!commandOpen) return;
    const close = (event: PointerEvent | KeyboardEvent) => { if (event instanceof KeyboardEvent ? event.key === "Escape" : event.target instanceof Node && !composerArea.current?.contains(event.target)) setCommandOpen(false); };
    document.addEventListener("pointerdown", close);document.addEventListener("keydown", close);
    return () => {document.removeEventListener("pointerdown",close);document.removeEventListener("keydown",close);};
  }, [commandOpen]);
  const t = (en: string, zh: string) => english ? en : zh;
  const merge = useCallback((incoming: HermesMessage[], replace = false) => {
    const next = replace ? incoming : mergeHermesMessages(messageRef.current, incoming);
    messageRef.current = next; setMessages(next);
  }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useLayoutEffect(() => {
    const fit = () => {
      const element = container.current; if (!element) return;
      const viewport = window.visualViewport;
      let bottomEdge = (viewport?.height ?? innerHeight) + (viewport?.offsetTop ?? 0) - 12;
      const navigation = document.querySelector<HTMLElement>(".mobile-nav");
      if (navigation && getComputedStyle(navigation).display !== "none") {
        const bounds = navigation.getBoundingClientRect();
        if (bounds.height && bounds.top < bottomEdge && bounds.top > element.getBoundingClientRect().top) bottomEdge = bounds.top - 10;
      }
      element.style.setProperty("--hermes-chat-height", `${Math.max(200, bottomEdge - element.getBoundingClientRect().top)}px`);
      element.style.setProperty("--hermes-composer-height", `${(composerArea.current?.offsetHeight ?? 130) + 32}px`);
    };
    const observer = new ResizeObserver(() => { fit(); if (followBottom.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; });
    if (composerArea.current) observer.observe(composerArea.current);
    const frame = requestAnimationFrame(fit); window.addEventListener("resize", fit); window.visualViewport?.addEventListener("resize", fit); window.visualViewport?.addEventListener("scroll", fit);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener("resize", fit); window.visualViewport?.removeEventListener("resize", fit); window.visualViewport?.removeEventListener("scroll", fit); };
  }, []);
  useEffect(() => {
    const abort = new AbortController(); let inFlight = false;
    const load = async () => {
      if (inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const params = new URLSearchParams();
        if (active) params.set("conversationId", active);
        const current = messageRef.current;
        if (active && current.length) {
          params.set("after", String(Math.max(...current.map(m => m.seq))));
          const pending = current.filter(hermesPending).map(m => m.id).slice(-100);
          if (pending.length) params.set("pending", pending.join(","));
        }
        const r = await request(`/api/hermes?${params}`, { signal: abort.signal, cache: "no-store" });
        if (!r.ok) throw new Error(await responseError(r, t("Could not load messages.", "暂时无法读取消息。")));
        const next = await r.json() as HermesData;
        if (abort.signal.aborted) return;
        next.connection.online = Boolean(next.connection.online && next.connection.lastSeenAt && Date.now() - Date.parse(next.connection.lastSeenAt) < 90000);
        setData(next); setError("");
        if (!active && !newChat.current && next.conversations[0]) { activeRef.current = next.conversations[0].id; setActive(next.conversations[0].id); }
        else { if (!current.length) setHasOlder(next.hasMore); merge(next.messages); }
      } catch (reason) { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : t("Message connection failed.", "消息连接失败。")); }
      finally { inFlight = false; }
    };
    refresh.current = load;
    const initial = setTimeout(() => void load(), 0);
    // Small metadata/incremental updates only. No per-token writes or idle model calls.
    const interval = setInterval(() => void load(), 5000);
    const resume = () => void load(); window.addEventListener("focus", resume); window.addEventListener("online", resume); document.addEventListener("visibilitychange", resume);
    return () => { abort.abort(); clearTimeout(initial); clearInterval(interval); window.removeEventListener("focus", resume); window.removeEventListener("online", resume); document.removeEventListener("visibilitychange", resume); };
  }, [active, request, english, merge]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (followBottom.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [messages]);
  useEffect(() => {
    const seen = () => {
      const last = messageRef.current.at(-1);
      if (last && followBottom.current && document.visibilityState !== "hidden") notifyHermesActivity({ state: "seen", conversationId: last.conversation_id, seq: last.seq });
    };
    seen(); window.addEventListener("focus", seen); document.addEventListener("visibilitychange", seen);
    return () => { window.removeEventListener("focus", seen); document.removeEventListener("visibilitychange", seen); };
  }, [messages]);
  useEffect(() => {
    if (history || setup || notes || noteOpen || clearId || choiceId) return;
    const question = messages.findLast(message => message.role === "assistant" && message.presentation?.state === "pending" && !seenQuestions.current.has(message.id));
    if (!question) return;
    const timer = setTimeout(() => { seenQuestions.current.add(question.id); setChoiceId(question.id); }, 0);
    return () => clearTimeout(timer);
  }, [messages, history, setup, notes, noteOpen, clearId, choiceId]);
  function select(id?: string) { if (sendLock.current) return; newChat.current = !id; activeRef.current = id; setActive(id); merge([], true); setHasOlder(false); setHistory(false); setChoiceId(undefined); setNoteOpen(false); setNotes(false); followBottom.current = true; requestKey.current = null; setError(""); }
  async function post(body: object) {
    const r = await request("/api/hermes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await responseError(r, t("Could not complete this action.", "操作未完成。")));
    return r.json();
  }
  async function send(event?: FormEvent, choice?: { message: HermesMessage; content: string }, stickyContent?: string): Promise<boolean> {
    event?.preventDefault(); const content = (stickyContent ?? choice?.content ?? draft).trim(); if (!content || sendLock.current) return false;
    const asNote = stickyContent !== undefined;
    const responseTo = choice?.message.id ?? (!asNote && !/^\/[a-z][\w-]*(?:\s|$)/i.test(content) ? messageRef.current.findLast(message => message.role === "assistant" && message.presentation?.state === "pending")?.id : undefined);
    sendLock.current = true; setSending(true); setError("");
    const previous = requestKey.current;
    const submission = previous?.content === content && previous.note === asNote && previous.responseTo === responseTo && (!active || previous.conversationId === active) ? previous : { id: crypto.randomUUID(), conversationId: active ?? crypto.randomUUID(), content, note: asNote, responseTo };
    requestKey.current = submission;
    setCommandOpen(false);
    notifyHermesActivity({ state: "sending", id: submission.id, conversationId: submission.conversationId });
    try {
      const message = await post({ action: "send", ...submission }) as HermesMessage;
      notifyHermesActivity({ state: "saved", id: submission.id, conversationId: submission.conversationId });
      if (!mounted.current) return false;
      newChat.current = false; followBottom.current = true; if (asNote) { setNoteDraft(""); setNoteOpen(false); } else if (!choice) setDraft(""); requestKey.current = null;
      if (!active) { activeRef.current = message.conversation_id; setActive(message.conversation_id); }
      merge([message]); void refresh.current();
      return true;
    } catch (reason) { notifyHermesActivity({ state: "uncertain", id: submission.id, conversationId: submission.conversationId, error: reason instanceof Error ? reason.message : String(reason) }); if (mounted.current) setError(`${reason instanceof Error ? reason.message : t("Send failed.", "发送失败。")}${choice ? t(" Selection unconfirmed; you can retry.", " 选择尚未确认，可以重试。") : t(" Your text is kept; retrying uses the same message ID.", " 文字仍在，重试会复用消息 ID，避免重复提交。")}`); return false; }
    finally { sendLock.current = false; if (mounted.current) setSending(false); }
  }
  async function act(body: object) {
    if (busy) return; setBusy(true); setError("");
    try {
      const result = await post(body);
      if (!mounted.current) return;
      if ("role" in result && result.conversation_id === activeRef.current) merge([result]);
      setClearId(undefined); setConnectionAction(undefined); void refresh.current();
      return result;
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : t("Action failed.", "操作失败。")); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function older() {
    if (!active || !messages.length || busy) return;
    const cid = active; setBusy(true);
    try {
      const r = await request(`/api/hermes?conversationId=${cid}&before=${messages[0].seq}`, { cache: "no-store" });
      if (!r.ok) throw new Error(await responseError(r, t("Could not load older messages.", "未能读取更早消息。")));
      const next = await r.json() as HermesData;
      if (mounted.current && activeRef.current === cid) { followBottom.current = false; merge(next.messages); setHasOlder(next.hasMore); }
    } catch (reason) { if (mounted.current) setError(String(reason)); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function pair() {
    const config = await act({ action: "pair" }) as HermesPairing | undefined;
    if (!config) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(config, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "evaorbit-hermes-connection.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const connection = data?.connection, online = Boolean(connection?.online), current = data?.conversations.find(c => c.id === active);
  const waiting = messages.some(m => m.status === "received" || m.status === "processing");
  const question = messages.find(message => message.id === choiceId) ?? messages.findLast(message => message.role === "assistant" && message.presentation?.state === "pending");
  const commands = filterHermesCommands(connection?.commands?.length ? connection.commands : [{ name:"help",description:"Show available commands",argsHint:"",aliases:[] }], draft);
  function chooseCommand(command: HermesCommand) { setDraft(`/${command.name}${command.argsHint ? " " : ""}`);setCommandOpen(false);setCommandIndex(0);input.current?.focus(); }
  return <section ref={container} className={styles.chat} aria-label="Hermes" data-hermes-chat>
    <header className={styles.header}>
      <div><h1>Hermes</h1><button className={styles.connection} onClick={() => setSetup(true)}><span data-online={online} />{online ? "online" : "offline"}</button></div>
      <nav aria-label={t("Conversations", "对话操作")}>
        <button className="icon-button" aria-label={t("Conversation history", "历史对话")} disabled={sending || busy} onClick={() => setHistory(true)}><Icon name="history" /></button>
        <button className="icon-button" aria-label={t("New conversation", "新对话")} disabled={sending || busy} onClick={() => select()}><Icon name="plus" /></button>
        <button className={styles.notesButton} disabled={sending} aria-label={t("Note history", "便利贴记录")} aria-haspopup="dialog" onClick={() => setNotes(true)}><Icon name="memory" />{t("Notes", "便利贴")}</button>
      </nav>
    </header>
    <div className={styles.scroll} ref={scroll} onScroll={() => { const el = scroll.current; if (el) { followBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100; const last = messageRef.current.at(-1); if (followBottom.current && last && document.visibilityState !== "hidden") notifyHermesActivity({ state: "seen", conversationId: last.conversation_id, seq: last.seq }); } }}>
      {!data && !error && <PageLoading title="对话" englishTitle="conversation" inline />}
      {hasOlder && <button className="text-button" disabled={busy} onClick={() => void older()}>{t("Earlier messages", "更早的消息")}</button>}
      {data && !messages.length && <div className={styles.empty}><Icon name="ai" variant="stroke" /><p>{t("What’s on your mind?", "想到什么，直接说。")}</p>{!online && <small>{t("Messages wait here until Hermes is online.", "Hermes 离线时，消息会留在这里等待接收。")}</small>}</div>}
      <div className={styles.messages}>{messages.map((message, index) => {
        const lastInGroup = messages[index + 1]?.role !== message.role;
        return <article key={message.id} id={`hermes-${message.id}`} className={styles.message} data-role={message.role} data-group-end={lastInGroup}>
        <HermesMessageBody message={message} english={english} showTail={lastInGroup} onOpenOptions={prompt => { seenQuestions.current.add(prompt.id); setChoiceId(prompt.id); }} />
        {(lastInGroup || message.role === "user" || ["failed", "interrupted"].includes(message.status)) && <footer>{lastInGroup && <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString(english ? "en-US" : "zh-CN", { hour: "2-digit", minute: "2-digit" })}</time>}
          {message.role === "user" && <span data-state={message.status}>{hermesStatusText(message, online, english)}</span>}
          {["failed", "interrupted"].includes(message.status) && message.presentation?.kind !== "response" && <button className="text-button" disabled={busy} onClick={() => void act({ action: "retry", id: message.id })}>{t("Retry", "重新处理")}</button>}
        </footer>}{message.error && <p className={styles.diagnostic}>{message.error}</p>}
      </article>; })}</div>
      {waiting && <p className={styles.activity} role="status"><i/><i/><i/>{t("Hermes is working…", "Hermes 正在处理…")}</p>}
      <div ref={bottom}/>
    </div>
    <div ref={composerArea} className={styles.composerArea}>
      {commandOpen && <HermesCommandMenu id={commandId} commands={commands} selected={Math.min(commandIndex,Math.max(0,commands.length-1))} english={english} onChoose={chooseCommand} />}
      {error && !noteOpen && <div className={styles.notice}><ErrorNotice>{error}</ErrorNotice><button className="text-button" onClick={() => void refresh.current()}>{t("Refresh", "刷新")}</button></div>}
      <div className={styles.composerTools}><button type="button" disabled={sending} aria-label={t("Hermes commands", "Hermes 命令")} aria-haspopup="listbox" aria-expanded={commandOpen} aria-controls={commandOpen ? commandId : undefined} onClick={()=>{setCommandOpen(!commandOpen);setCommandIndex(0);input.current?.focus();}}><Menu4 className="icon" weight="Outline" />{t("Commands", "命令")}</button><button type="button" disabled={sending} aria-haspopup="dialog" onClick={() => { setCommandOpen(false);setError(""); setNoteOpen(true); }}><Icon name="memory" />{t("Sticky note", "便利贴")}</button></div>
      <form className={styles.composer} onSubmit={event => void send(event)}>
        <textarea ref={input} aria-label={t("Message", "消息内容")} aria-controls={commandOpen ? commandId : undefined} aria-activedescendant={commandOpen && commands.length ? `${commandId}-${Math.min(commandIndex,commands.length-1)}` : undefined} rows={2} maxLength={20000} value={draft} disabled={sending} onChange={event => {setDraft(event.target.value);setCommandOpen(/^\/[\w-]*$/.test(event.target.value));setCommandIndex(0);}} placeholder={t("Message Hermes…", "发给 Hermes……")} onKeyDown={event => {
          if(event.nativeEvent.isComposing)return;
          if(commandOpen && event.key==="Escape"){event.preventDefault();setCommandOpen(false);return;}
          if(commandOpen && ["ArrowDown","ArrowUp"].includes(event.key)&&commands.length){event.preventDefault();const next=(commandIndex+(event.key==="ArrowDown"?1:-1)+commands.length)%commands.length;setCommandIndex(next);document.getElementById(`${commandId}-${next}`)?.scrollIntoView({block:"nearest"});return;}
          if(commandOpen && event.key==="Enter"&&!event.shiftKey&&commands.length){event.preventDefault();chooseCommand(commands[Math.min(commandIndex,commands.length-1)]);return;}
          if (event.key === "Enter" && !event.shiftKey && window.matchMedia("(pointer:fine)").matches) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
        }}/>
        <button className="button primary" type="submit" disabled={!data || !draft.trim() || sending} aria-label={t("Send", "发送")}><Icon name="arrow" /></button>
      </form>
    </div>
    {noteOpen && <HermesNoteSheet draft={noteDraft} onChange={setNoteDraft} onSend={() => send(undefined, undefined, noteDraft)} onClose={() => setNoteOpen(false)} english={english} busy={sending} available={Boolean(data)} error={error} />}
    {question && <HermesChoiceSheet key={question.id} message={question} open={Boolean(choiceId)} english={english} busy={sending || busy} online={online} error={error} onClose={() => setChoiceId(undefined)} onAnswer={(prompt, content) => send(undefined, { message: prompt, content })} />}
    {notes && <FormSheet title={t("Sticky notes", "便利贴")} onClose={() => setNotes(false)}><div className={styles.notes}>
      <button className="button secondary" onClick={() => { setNotes(false); setNoteOpen(true); }}>{t("New note", "写张便利贴")}</button>
      {messages.filter(message => message.presentation?.kind === "note").map(message => <button key={message.id} className={styles.savedNote} onClick={() => { setNotes(false); requestAnimationFrame(() => document.getElementById(`hermes-${message.id}`)?.scrollIntoView({ block: "center" })); }}><span>{message.content}</span><small>{hermesStatusText(message, online, english)}</small></button>)}
      {!messages.some(message => message.presentation?.kind === "note") && <p>{t("No notes in this conversation yet.", "这段对话还没有便利贴。")}</p>}
      {hasOlder && <button className="text-button" disabled={busy} onClick={() => void older()}>{t("Load earlier notes", "查找更早的便利贴")}</button>}
    </div></FormSheet>}
    {history && <FormSheet title={t("Conversations", "历史对话")} onClose={() => setHistory(false)}><div className={styles.history}>{data?.conversations.map(c => <div key={c.id}><button onClick={() => select(c.id)} aria-current={active === c.id ? "true" : undefined}>{c.title}</button><button className="text-button" onClick={() => { setHistory(false); setClearId(c.id); }}>{t("Clear", "清理")}</button></div>)}{!data?.conversations.length && <p>{t("No conversations yet.", "还没有对话。")}</p>}</div></FormSheet>}
    {clearId && <FormSheet title={t("Clear cloud conversation", "清理云端对话")} onClose={() => setClearId(undefined)} busy={busy}><p>{t("Removes this EO conversation and unsent messages. Hermes’ local history and memory are kept. Active processing must finish first.", "删除这段 EO 云端对话及尚未发送的消息。Hermes 电脑上的历史和记忆保留；正在处理时需等它结束。")}</p><button className="button danger" disabled={busy} onClick={async () => { const id = clearId; if (await act({ action: "clear", conversationId: id })) { if (active === id) select(); } }}>{t("Clear conversation", "清理这段对话")}</button></FormSheet>}
    {setup && <FormSheet title={t("Connect Hermes", "连接 Hermes")} onClose={() => { setSetup(false); setConnectionAction(undefined); }} busy={busy}><div className={styles.setup}>
      <p>{online ? t("Your computer is connected.", "电脑上的 Hermes 已连接。") : t("Run Hermes with the EvaOrbit channel on your computer. EO holds messages while it is offline.", "在电脑上启动带 EO 通道的 Hermes。离线时，EO 会保留待接收的消息。")}</p>
      {connection?.lastSeenAt && <small>{t("Last connection: ", "最近连接：")}{new Date(connection.lastSeenAt).toLocaleString()}</small>}
      {connectionAction ? <><p>{connectionAction === "pair" ? t("New credentials revoke the previous connection. Import the new file on your computer.", "新凭据会替换旧连接，需要在电脑重新导入连接文件。") : t("Disconnect Hermes? Existing cloud conversations are kept.", "断开 Hermes？已有云端对话会保留。")}</p><button className="button primary" disabled={busy} onClick={() => void (connectionAction === "pair" ? pair() : act({ action: "disconnect" }))}>{t("Confirm", "确认")}</button><button className="text-button" onClick={() => setConnectionAction(undefined)}>{t("Cancel", "取消")}</button></> : <><button className="button secondary" disabled={busy} onClick={() => connection?.paired ? setConnectionAction("pair") : void pair()}>{t("Download connection file", "下载连接文件")}</button><small>{t("Import this file with the computer installer. It contains your connection credential; keep it private.", "用电脑端安装脚本导入文件。文件含连接凭据，请勿分享。")}</small>{connection?.paired && <button className="text-button" disabled={busy} onClick={() => setConnectionAction("disconnect")}>{t("Disconnect", "断开连接")}</button>}</>}
    </div></FormSheet>}
    <span className={styles.live} role="status" aria-live="polite">{current ? current.title : ""}</span>
  </section>;
}
