"use client";
import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Menu4 } from "reicon-react";
import { useBusinessRequest } from "./business-request-context";
import { useLocale } from "./locale-controller";
import { FormSheet } from "./form-sheet";
import { Icon } from "./icons";
import { MarkdownMessage } from "./markdown-message";
import { HermesMessageBody } from "./hermes-message";
import { HermesToolActivity } from "./hermes-tool-activity";
import { HermesChoiceSheet } from "./hermes-choice-sheet";
import { HermesNoteSheet } from "./hermes-note-sheet";
import { filterHermesCommands, HermesCommandMenu } from "./hermes-command-menu";
import { HermesErrorNotice } from "./hermes-error-notice";
import { HermesAppearanceSheet, useHermesAppearance } from "./hermes-appearance-sheet";
import { PageLoading } from "./page-loading";
import { responseError } from "@/lib/response-error";
import { notifyHermesActivity } from "@/lib/hermes-activity";
import { readHermesDraft, useHermesDraft } from "@/lib/hermes-draft";
import { hermesNotice, hermesPending, hermesStatusText, mergeHermesMessages, type HermesCommand, type HermesData, type HermesMessage, type HermesPairing } from "@/lib/hermes";
import styles from "./hermes-chat.module.css";

const noticeGraphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const nativeActive = "evaorbit:native-active";

function interruptedRequest(reason: unknown) {
  return reason instanceof Error && (
    ["TypeError", "AbortError", "TimeoutError", "SyntaxError"].includes(reason.name) ||
    /\[EO:(?:network_[\w-]+|request_failed|operation_cancelled|json_decode_failed)\]|\(HTTP 50[24]\)/.test(reason.message)
  );
}

function waitForForeground(signal: AbortSignal) {
  if (!document.hidden || signal.aborted) return Promise.resolve();
  return new Promise<void>(resolve => {
    const finish = () => {
      document.removeEventListener("visibilitychange", resume);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const resume = () => { if (!document.hidden) finish(); };
    document.addEventListener("visibilitychange", resume);
    signal.addEventListener("abort", finish, { once: true });
  });
}

export function HermesChat({ initialConversationId, scope, back }: { initialConversationId?: string; scope: string | null; back: ReactNode }) {
  const request = useBusinessRequest(), { english } = useLocale();
  const appearance = useHermesAppearance(scope);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [data, setData] = useState<HermesData>(), [messages, setMessages] = useState<HermesMessage[]>([]);
  const [active, setActive] = useState<string | undefined>(initialConversationId);
  const [draft, setDraft] = useHermesDraft(scope, active, "chat");
  const [noteDraft, setNoteDraft] = useHermesDraft(scope, active, "note");
  const [error, setError] = useState(""), [sending, setSending] = useState(false), [busy, setBusy] = useState(false);
  const [confirmingDelivery, setConfirmingDelivery] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loadErrorDismissed, setLoadErrorDismissed] = useState(false);
  const [stopping, setStopping] = useState(false), [stopError, setStopError] = useState("");
  const [awayFromLatest, setAwayFromLatest] = useState(false), [newReply, setNewReply] = useState(false);
  const [history, setHistory] = useState(false), [setup, setSetup] = useState(false), [hasOlder, setHasOlder] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; title: string }>();
  const [renameError, setRenameError] = useState("");
  const [clearId, setClearId] = useState<string>(), [connectionAction, setConnectionAction] = useState<"pair" | "disconnect">();
  const [notes, setNotes] = useState(false), [noteOpen, setNoteOpen] = useState(false), [choiceId, setChoiceId] = useState<string>();
  const seenQuestions = useRef(new Set<string>());
  const [commandOpen, setCommandOpen] = useState(false), [commandIndex, setCommandIndex] = useState(0);
  const commandId = useId();
  const renameFormId = useId();
  const titleRevision = useRef(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const messageRef = useRef<HermesMessage[]>([]), activeRef = useRef(active), newChat = useRef(false), mounted = useRef(true);
  const requestKey = useRef<{ id: string; conversationId: string; content: string; note?: boolean; responseTo?: string } | null>(null), sendLock = useRef(false);
  const sendRecovery = useRef<AbortController | null>(null);
  const stopRequest = useRef<{ id: string; conversationId: string; targetAttempt: string } | null>(null), stopLock = useRef(false);
  const refresh = useRef<() => Promise<void>>(async () => {}), scroll = useRef<HTMLDivElement>(null), followBottom = useRef(true);
  const readingAnchor = useRef<{ element: HTMLElement; top: number } | null>(null);
  const container = useRef<HTMLElement>(null), composerArea = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!commandOpen) return;
    const close = (event: PointerEvent | KeyboardEvent) => { if (event instanceof KeyboardEvent ? event.key === "Escape" : event.target instanceof Node && !composerArea.current?.contains(event.target)) setCommandOpen(false); };
    document.addEventListener("pointerdown", close);document.addEventListener("keydown", close);
    return () => {document.removeEventListener("pointerdown",close);document.removeEventListener("keydown",close);};
  }, [commandOpen]);
  const t = (en: string, zh: string) => english ? en : zh;
  const merge = useCallback((incoming: HermesMessage[], replace = false) => {
    const lastSeq = messageRef.current.at(-1)?.seq ?? 0;
    if (!replace && !followBottom.current && incoming.some(message => message.seq > lastSeq && message.role === "assistant" && !hermesNotice(message))) {
      setNewReply(true);
    }
    const next = replace ? incoming : mergeHermesMessages(messageRef.current, incoming);
    messageRef.current = next; setMessages(next);
  }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; sendRecovery.current?.abort(); }; }, []);
  useLayoutEffect(() => {
    const element = container.current;
    const surface = element?.parentElement;
    if (!element || !surface) return;
    let fullHeight = window.visualViewport?.height ?? window.innerHeight;
    let layoutWidth = window.innerWidth;
    let keyboardOpen = false;
    let frame = 0;
    const fit = () => {
      frame = 0;
      const viewport = window.visualViewport;
      const visibleHeight = viewport?.height ?? window.innerHeight;
      const visibleTop = viewport?.offsetTop ?? 0;
      const focused = document.activeElement === input.current;
      if (layoutWidth !== window.innerWidth) {
        layoutWidth = window.innerWidth;
        fullHeight = window.innerHeight;
      }
      const keyboardInset = (focused || keyboardOpen) && window.matchMedia("(any-pointer: coarse)").matches
        && Math.abs((viewport?.scale ?? 1) - 1) < .05 ? Math.max(0, fullHeight - visibleHeight) : 0;
      keyboardOpen = keyboardInset > (keyboardOpen ? 2 : 100);
      if (!keyboardOpen && !focused) fullHeight = visibleHeight;
      element.dataset.keyboardOpen = String(keyboardOpen);

      const top = element.getBoundingClientRect().top;
      // Keep the wallpaper crop tied to the resting viewport, even when WebKit pans it to reveal the input.
      const wallpaperOffset = keyboardInset > 0 ? visibleTop - surface.getBoundingClientRect().top : 0;
      surface.style.setProperty("--hermes-wallpaper-height", `${Math.max(fullHeight, visibleHeight)}px`);
      surface.style.setProperty("--hermes-wallpaper-offset", `${wallpaperOffset}px`);
      element.style.setProperty("--hermes-chat-height", `${Math.max(0, visibleTop + visibleHeight - top)}px`);
      element.style.setProperty("--hermes-keyboard-inset", `${keyboardInset}px`);
      element.style.setProperty("--hermes-header-offset", `${keyboardInset > 0 ? Math.max(0, visibleTop - top) : 0}px`);
      element.style.setProperty("--hermes-composer-height", `${(composerArea.current?.offsetHeight ?? 130) + 32}px`);
      if (followBottom.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
    };
    const scheduleFit = () => { if (!frame) frame = requestAnimationFrame(fit); };
    const observer = new ResizeObserver(scheduleFit);
    if (composerArea.current) observer.observe(composerArea.current);
    fit();
    window.addEventListener("resize", scheduleFit);
    window.addEventListener("scroll", scheduleFit, { passive: true });
    window.visualViewport?.addEventListener("resize", scheduleFit);
    window.visualViewport?.addEventListener("scroll", scheduleFit);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleFit);
      window.removeEventListener("scroll", scheduleFit);
      window.visualViewport?.removeEventListener("resize", scheduleFit);
      window.visualViewport?.removeEventListener("scroll", scheduleFit);
      surface.style.removeProperty("--hermes-wallpaper-height");
      surface.style.removeProperty("--hermes-wallpaper-offset");
    };
  }, []);
  useEffect(() => {
    const abort = new AbortController(); let inFlight = false, refreshAgain = false, resuming = false;
    const load = async () => {
      if (inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      const requestedTitleRevision = titleRevision.current;
      try {
        const params = new URLSearchParams();
        if (active) params.set("conversationId", active);
        const current = messageRef.current;
        if (active && current.length) {
          params.set("after", String(Math.max(...current.map(m => m.seq))));
          const pending = current.filter(hermesPending).map(m => m.id).slice(-100);
          if (pending.length) params.set("pending", pending.join(","));
        }
        const r = await request(`/api/hermes?${params}`, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(12000)]), cache: "no-store" });
        if (!r.ok) throw new Error(await responseError(r, t("Could not load messages.", "暂时无法读取消息。")));
        const next = await r.json() as HermesData;
        if (abort.signal.aborted) return;
        next.connection.online = Boolean(next.connection.online && next.connection.lastSeenAt && Date.now() - Date.parse(next.connection.lastSeenAt) < 90000);
        setData(previous => requestedTitleRevision === titleRevision.current || !previous
          ? next
          : { ...next, conversations: previous.conversations });
        setLoadError(""); setLoadErrorDismissed(false);
        if (!active && !newChat.current && next.conversations[0] && !readHermesDraft(scope, undefined, "chat") && !readHermesDraft(scope, undefined, "note")) {
          activeRef.current = next.conversations[0].id; setActive(next.conversations[0].id);
        }
        else { if (!current.length) setHasOlder(next.hasMore); merge(next.messages); }
      } catch (reason) {
        if (!abort.signal.aborted && !document.hidden && !(resuming && interruptedRequest(reason))) {
          setLoadError(reason instanceof Error ? reason.message : t("Message connection failed.", "消息连接失败。"));
        }
      } finally {
        inFlight = false; resuming = false;
        if (refreshAgain && !abort.signal.aborted) { refreshAgain = false; void load(); }
      }
    };
    refresh.current = load;
    const initial = setTimeout(() => void load(), 0);
    // Small metadata/incremental updates only. No per-token writes or idle model calls.
    const interval = setInterval(() => void load(), 5000);
    const resume = () => {
      resuming = true;
      if (document.hidden) return;
      if (inFlight) refreshAgain = true;
      else void load();
    };
    window.addEventListener("focus", resume); window.addEventListener("online", resume); window.addEventListener(nativeActive, resume); document.addEventListener("visibilitychange", resume);
    return () => { abort.abort(); clearTimeout(initial); clearInterval(interval); window.removeEventListener("focus", resume); window.removeEventListener("online", resume); window.removeEventListener(nativeActive, resume); document.removeEventListener("visibilitychange", resume); };
  }, [active, request, english, merge, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const pane = scroll.current, anchor = readingAnchor.current;
    readingAnchor.current = null;
    if (!pane) return;
    if (anchor?.element.isConnected) pane.scrollTop += anchor.element.getBoundingClientRect().top - anchor.top;
    else if (followBottom.current) pane.scrollTop = pane.scrollHeight;
  }, [messages, hasOlder]);
  const dialogOpen = Boolean(history || setup || notes || noteOpen || clearId || choiceId || appearanceOpen);
  const confirmSeen = useCallback(() => {
    const last = messageRef.current.at(-1), pane = scroll.current;
    if (!last || !pane || !followBottom.current || dialogOpen || document.visibilityState === "hidden" ||
      document.querySelector(".form-sheet-layer,.space-drawer-layer")) return;
    if (messageRef.current.some(message => message.presentation?.state === "pending" && !seenQuestions.current.has(message.id))) return;
    const row = document.getElementById(`hermes-${last.id}`);
    if (!row) return;
    const bounds = row.getBoundingClientRect();
    const viewport = window.visualViewport, paneBounds = pane.getBoundingClientRect();
    const top = Math.max(viewport?.offsetTop ?? 0, paneBounds.top + 28);
    const bottom = Math.min((viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight), paneBounds.bottom,
      composerArea.current?.getBoundingClientRect().top ?? window.innerHeight);
    if (Math.min(bottom, bounds.bottom) > Math.max(top, bounds.top)) {
      notifyHermesActivity({ state: "seen", conversationId: last.conversation_id, seq: last.seq });
    }
  }, [dialogOpen]);
  useEffect(() => {
    const frame = requestAnimationFrame(confirmSeen);
    window.addEventListener("focus", confirmSeen);
    document.addEventListener("visibilitychange", confirmSeen);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("focus", confirmSeen);
      document.removeEventListener("visibilitychange", confirmSeen);
    };
  }, [messages, confirmSeen]);
  useEffect(() => {
    if (dialogOpen) return;
    const question = messages.findLast(message => message.role === "assistant" && message.presentation?.state === "pending" && !seenQuestions.current.has(message.id));
    if (!question) return;
    const timer = setTimeout(() => { seenQuestions.current.add(question.id); setChoiceId(question.id); }, 0);
    return () => clearTimeout(timer);
  }, [messages, dialogOpen]);
  function select(id?: string) {
    if (sendLock.current || stopLock.current) return;
    if (id && id === activeRef.current) { setHistory(false); return; }
    newChat.current = !id; activeRef.current = id; setActive(id); merge([], true); setHasOlder(false); setHistory(false); setChoiceId(undefined); setNoteOpen(false); setNotes(false);
    followBottom.current = true; setAwayFromLatest(false); setNewReply(false); setCommandOpen(false); requestKey.current = null;
  }
  function updateReadingPosition() {
    const pane = scroll.current;
    if (!pane) return;
    const nearBottom = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 80;
    followBottom.current = nearBottom;
    setAwayFromLatest(!nearBottom);
    if (nearBottom) { setNewReply(false); confirmSeen(); }
  }
  function jumpToLatest() {
    const pane = scroll.current;
    if (!pane) return;
    pane.scrollTop = pane.scrollHeight;
    updateReadingPosition();
  }
  async function post(body: object, signal?: AbortSignal) {
    const r = await request("/api/hermes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
    if (!r.ok) throw new Error(await responseError(r, t("Could not complete this action.", "操作未完成。")));
    return r.json();
  }
  async function confirmDelivery(submission: { id: string; conversationId: string }, signal: AbortSignal) {
    const params = new URLSearchParams({ conversationId: submission.conversationId, after: String(Number.MAX_SAFE_INTEGER), pending: submission.id });
    for (let attempt = 0; attempt < 2; attempt++) {
      await waitForForeground(signal);
      if (signal.aborted) return;
      try {
        const response = await request(`/api/hermes?${params}`, { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) });
        if (response.ok) {
          const data = await response.json() as HermesData;
          const receipt = data.messages.find(message => message.id === submission.id && message.role === "user");
          if (receipt) return receipt;
        }
      } catch { /* Keep the original send diagnostic if confirmation is also unavailable. */ }
      if (attempt === 0 && !signal.aborted && !document.hidden) await new Promise(resolve => setTimeout(resolve, 1000));
    }
    await waitForForeground(signal);
  }
  async function send(event?: FormEvent, choice?: { message: HermesMessage; content: string }, stickyContent?: string): Promise<boolean> {
    event?.preventDefault(); const content = stickyContent ?? choice?.content ?? draft; if (!content.trim() || sendLock.current) return false;
    const asNote = stickyContent !== undefined;
    const responseTo = choice?.message.id ?? (!asNote && !/^\/[a-z][\w-]*(?:\s|$)/i.test(content.trimStart()) ? messageRef.current.findLast(message => message.role === "assistant" && message.presentation?.state === "pending")?.id : undefined);
    sendLock.current = true; setSending(true);
    const previous = requestKey.current;
    const submission = previous?.content === content && previous.note === asNote && previous.responseTo === responseTo && (!active || previous.conversationId === active) ? previous : { id: crypto.randomUUID(), conversationId: active ?? crypto.randomUUID(), content, note: asNote, responseTo };
    setError("");
    requestKey.current = submission;
    setCommandOpen(false);
    notifyHermesActivity({ state: "sending", id: submission.id, conversationId: submission.conversationId });
    try {
      let message: HermesMessage;
      try {
        message = await post({ action: "send", ...submission }, AbortSignal.timeout(20000)) as HermesMessage;
      } catch (reason) {
        if (!interruptedRequest(reason) || !mounted.current) throw reason;
        const recovery = new AbortController();
        sendRecovery.current = recovery;
        setConfirmingDelivery(true);
        notifyHermesActivity({ state: "confirming", id: submission.id, conversationId: submission.conversationId });
        const receipt = await confirmDelivery(submission, recovery.signal);
        if (recovery.signal.aborted) return false;
        if (!receipt) throw new Error(`[EO:hermes_delivery_unconfirmed] ${reason instanceof Error ? reason.message : String(reason)}`);
        message = receipt;
      }
      notifyHermesActivity({ state: "saved", id: submission.id, conversationId: submission.conversationId });
      if (asNote) setNoteDraft("", active, content); else if (!choice) setDraft("", active, content);
      if (!active) {
        if (asNote && draft) { setDraft(draft, message.conversation_id, ""); setDraft("", active, draft); }
        if (!asNote && noteDraft) { setNoteDraft(noteDraft, message.conversation_id, ""); setNoteDraft("", active, noteDraft); }
      }
      if (!mounted.current) return false;
      newChat.current = false; followBottom.current = true; setAwayFromLatest(false); setNewReply(false);
      if (asNote) setNoteOpen(false);
      requestKey.current = null;
      if (!active) { activeRef.current = message.conversation_id; setActive(message.conversation_id); }
      merge([message]); void refresh.current();
      return true;
    } catch (reason) { notifyHermesActivity({ state: "uncertain", id: submission.id, conversationId: submission.conversationId, error: reason instanceof Error ? reason.message : String(reason) }); if (mounted.current) setError(`${reason instanceof Error ? reason.message : t("Send failed.", "发送失败。")}${choice ? t(" Selection unconfirmed; you can retry.", " 选择尚未确认，可以重试。") : t(" Your text is kept; retrying uses the same message ID.", " 文字仍在，重试会复用消息 ID，避免重复提交。")}`); return false; }
    finally {
      sendRecovery.current = null; sendLock.current = false;
      if (mounted.current) { setSending(false); setConfirmingDelivery(false); }
    }
  }
  async function stopConversation() {
    if (!active || !stopTarget || online !== true || stopLock.current || stopPending) return;
    stopLock.current = true;
    setStopping(true);
    setStopError("");
    const submission = stopRequest.current?.targetAttempt === stopTarget.attempt_id && stopRequest.current.conversationId === active
      ? stopRequest.current : { id: crypto.randomUUID(), conversationId: active, targetAttempt: stopTarget.attempt_id };
    stopRequest.current = submission;
    try {
      const message = await post({ action: "send", id: submission.id, conversationId: active, content: "/stop" }) as HermesMessage;
      stopRequest.current = null;
      if (mounted.current && activeRef.current === active) { merge([message]); void refresh.current(); }
    } catch (reason) {
      if (mounted.current) setStopError(reason instanceof Error ? reason.message : t("Could not request a stop.", "未能发送停止请求。"));
    } finally {
      stopLock.current = false;
      if (mounted.current) setStopping(false);
    }
  }
  async function act(body: object) {
    if (busy) return; setBusy(true);
    try {
      const result = await post(body);
      if (!mounted.current) return;
      if ("role" in result && result.conversation_id === activeRef.current) merge([result]);
      setClearId(undefined); setConnectionAction(undefined); void refresh.current();
      return result;
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : t("Action failed.", "操作失败。")); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function renameConversation(event: FormEvent) {
    event.preventDefault();
    const title = renaming?.title.trim();
    if (!renaming || !title || title.length > 80 || busy) return;
    setBusy(true);
    setRenameError("");
    try {
      const renamed = await post({ action: "rename", conversationId: renaming.id, title }) as { id: string; title: string };
      if (!mounted.current) return;
      titleRevision.current++;
      setData(previous => previous && {
        ...previous,
        conversations: previous.conversations.map(conversation =>
          conversation.id === renamed.id ? { ...conversation, title: renamed.title } : conversation),
      });
      setRenaming(undefined);
      void refresh.current();
    } catch (reason) {
      if (mounted.current) setRenameError(reason instanceof Error ? reason.message : t("Could not rename conversation.", "未能修改对话名称。"));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function older() {
    if (!active || !messages.length || busy) return;
    const cid = active; setBusy(true);
    try {
      const r = await request(`/api/hermes?conversationId=${cid}&before=${messages[0].seq}`, { cache: "no-store" });
      if (!r.ok) throw new Error(await responseError(r, t("Could not load older messages.", "未能读取更早消息。")));
      const next = await r.json() as HermesData;
      if (mounted.current && activeRef.current === cid) {
        const pane = scroll.current;
        if (pane) {
          const top = pane.getBoundingClientRect().top + 28;
          const element = Array.from(pane.querySelectorAll<HTMLElement>("[data-hermes-message]"))
            .find(row => row.getBoundingClientRect().bottom > top);
          if (element) readingAnchor.current = { element, top: element.getBoundingClientRect().top };
        }
        followBottom.current = false;
        merge(next.messages);
        setHasOlder(next.hasMore);
      }
    } catch (reason) { if (mounted.current) setError(String(reason)); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function pair() {
    const config = await act({ action: "pair" }) as HermesPairing | undefined;
    if (!config) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(config, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "evaorbit-hermes-connection.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const connection = data?.connection, online = loadError ? undefined : connection?.online, current = data?.conversations.find(c => c.id === active);
  const statusLabel = loadError ? t("Connection issue", "连接异常") : online === undefined ? t("Checking…", "正在检查…") : online ? "online" : "offline";
  const waiting = messages.some(m => m.status === "received" || m.status === "processing");
  const stopTarget = messages.findLast(message => message.role === "user" && message.presentation?.kind !== "command" &&
    (message.status === "received" || message.status === "processing"));
  const stopPending = messages.some(message => message.role === "user" && message.presentation?.kind !== "note" &&
    message.content.trim() === "/stop" && hermesPending(message));
  const visibleLoadError = loadErrorDismissed ? "" : loadError;
  const noticeError = error || stopError || visibleLoadError;
  const question = messages.find(message => message.id === choiceId) ?? messages.findLast(message => message.role === "assistant" && message.presentation?.state === "pending");
  const commands = filterHermesCommands(connection?.commands?.length ? connection.commands : [{ name:"help",description:"Show available commands",argsHint:"",aliases:[] }], draft);
  function chooseCommand(command: HermesCommand) { setDraft(`/${command.name}${command.argsHint ? " " : ""}`);setCommandOpen(false);setCommandIndex(0);input.current?.focus({ preventScroll: true }); }
  return <>
  {appearance.images.wallpaper && <div className={styles.wallpaper} data-hermes-wallpaper aria-hidden="true" style={{ backgroundImage: `url("${appearance.images.wallpaper}")` }} />}
  <section ref={container} className={styles.chat} aria-label="Hermes" data-hermes-chat data-wallpaper={Boolean(appearance.images.wallpaper) || undefined}>
    <header className={styles.header}>
      <div className={styles.back}>{back}</div>
      <div className={styles.identity}><h1>Hermes</h1><button className={styles.connection} onClick={() => setSetup(true)}><span data-online={online} data-error={Boolean(loadError)} />{statusLabel}</button></div>
      <nav aria-label={t("Conversations", "对话操作")}>
        <button type="button" aria-label={t("Conversation history", "历史对话")} disabled={sending || stopping || busy} onClick={() => setHistory(true)}><Icon name="history" /></button>
        <button type="button" aria-label={t("New conversation", "新对话")} disabled={sending || stopping || busy} onClick={() => select()}><Icon name="plus" /></button>
        <button type="button" disabled={sending} aria-label={t("Note history", "便利贴记录")} title={t("Note history", "便利贴记录")} aria-haspopup="dialog" onClick={() => setNotes(true)}><Icon name="memory" /></button>
      </nav>
    </header>
    <div className={styles.scroll} ref={scroll} onScroll={updateReadingPosition}>
      {!data && !loadError && <PageLoading title="对话" englishTitle="conversation" inline />}
      {hasOlder && <button className="text-button" disabled={busy} onClick={() => void older()}>{t("Earlier messages", "更早的消息")}</button>}
      {data && !messages.length && <div className={styles.empty}><Icon name="ai" variant="stroke" /><p>{t("What’s on your mind?", "想到什么，直接说。")}</p>{online === false && <small>{t("Messages wait here until Hermes is online.", "Hermes 离线时，消息会留在这里等待接收。")}</small>}</div>}
      <div className={styles.messages}>{messages.map((message, index) => {
        if (hermesNotice(message)) {
          const content = message.content.trim();
          const first = noticeGraphemes.segment(content).containing(0)?.segment ?? "";
          const emoji = /\p{Extended_Pictographic}|\p{Emoji_Presentation}|\u20e3/u.test(first) ? first : "";
          return <aside key={message.id} id={`hermes-${message.id}`} className={styles.systemNotice} data-hermes-notice data-hermes-message>
            <span className={styles.systemNoticeIcon}>{emoji || <Icon name="notifications" variant="stroke" />}</span>
            <MarkdownMessage content={content.slice(emoji.length).trimStart()} offlineMedia />
          </aside>;
        }
        const next = messages[index + 1];
        const lastInGroup = !next || next.role !== message.role || hermesNotice(next);
        const avatar = appearance.images[message.role];
        return <Fragment key={message.id}><article id={`hermes-${message.id}`} className={styles.message} data-hermes-message data-role={message.role} data-group-end={lastInGroup} data-avatar={Boolean(avatar)}>
        {avatar && lastInGroup && (
          // eslint-disable-next-line @next/next/no-img-element -- The resized image is a device-local blob.
          <img className={styles.messageAvatar} data-hermes-avatar src={avatar} alt="" width={28} height={28} />
        )}
        <HermesMessageBody message={message} responseQuestion={message.reply_to ? messages.find(row => row.id === message.reply_to) : undefined}
          english={english} showTail={lastInGroup} onOpenOptions={prompt => { seenQuestions.current.add(prompt.id); setChoiceId(prompt.id); }} />
        {(lastInGroup || message.role === "user" || ["failed", "interrupted"].includes(message.status)) && <footer>{lastInGroup && <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString(english ? "en-US" : "zh-CN", { hour: "2-digit", minute: "2-digit" })}</time>}
          {message.role === "user" && <span data-state={message.status}>{hermesStatusText(message, online, english)}</span>}
          {["failed", "interrupted"].includes(message.status) && message.presentation?.kind !== "response" && <button className="text-button" disabled={busy} onClick={() => void act({ action: "retry", id: message.id })}>{t("Retry", "重新处理")}</button>}
        </footer>}
        {message.error && <HermesErrorNotice inline className={styles.diagnostic} error={message.error} fallback={t("Hermes could not finish.", "Hermes 处理未完成。")} />}
      </article><HermesToolActivity message={message} english={english} /></Fragment>; })}</div>
      {waiting && <p className={styles.activity} role="status"><i/><i/><i/>{t("Hermes is working", "Hermes 正在处理")}</p>}
    </div>
    <div ref={composerArea} className={styles.composerArea}>
      {confirmingDelivery && <div className={styles.notice} role="status">{t("Checking delivery…", "正在确认送达…")}</div>}
      {commandOpen && <HermesCommandMenu id={commandId} commands={commands} selected={Math.min(commandIndex,Math.max(0,commands.length-1))} english={english} onChoose={chooseCommand} />}
      {awayFromLatest && !commandOpen && <button className={styles.latestButton} type="button" onClick={jumpToLatest}>
        <Icon name="chevronDown" />{newReply ? t("New messages", "有新消息") : t("Back to latest", "回到最新")}
      </button>}
      {noticeError && !noteOpen && !choiceId && <div className={styles.notice}>
        <HermesErrorNotice error={noticeError} />
        {noticeError === visibleLoadError && <button className="text-button" onClick={() => void refresh.current()}>{t("Retry connection", "重试连接")}</button>}
        <button className="text-button" onClick={() => {
          if (error) setError("");
          else if (stopError) setStopError("");
          else setLoadErrorDismissed(true);
        }}>{t("Dismiss notice", "关闭提示")}</button>
      </div>}
      <div className={styles.composerTools}><button type="button" disabled={sending} aria-label={t("Hermes commands", "Hermes 命令")} aria-haspopup="listbox" aria-expanded={commandOpen} aria-controls={commandOpen ? commandId : undefined} onClick={()=>{setCommandOpen(!commandOpen);setCommandIndex(0);input.current?.focus({ preventScroll: true });}}><Menu4 className="icon" weight="Outline" />{t("Commands", "命令")}</button><button type="button" disabled={sending || !data} aria-haspopup="dialog" onClick={() => { setCommandOpen(false); setNoteOpen(true); }}><Icon name="memory" />{t("Sticky note", "便利贴")}</button>
        {scope && <button type="button" aria-label={t("Chat appearance", "聊天外观")} title={t("Chat appearance", "聊天外观")} aria-haspopup="dialog" disabled={sending} onClick={() => { setCommandOpen(false); setAppearanceOpen(true); }}><Icon name="settings" /></button>}
        {(stopTarget && connection?.commands?.some(command => command.name === "stop") || stopPending || stopping) && <button type="button" className={styles.stopButton} disabled={online !== true || stopping || stopPending}
          onClick={() => void stopConversation()}>{stopping ? t("Requesting stop…", "正在请求停止…") : stopPending ? t("Stop requested", "已请求停止") : t("Stop", "停止")}</button>}
      </div>
      <form className={styles.composer} onSubmit={event => void send(event)}>
        <textarea ref={input} aria-label={t("Message", "消息内容")} aria-controls={commandOpen ? commandId : undefined} aria-activedescendant={commandOpen && commands.length ? `${commandId}-${Math.min(commandIndex,commands.length-1)}` : undefined} rows={1} maxLength={20000} value={draft} disabled={sending || !data && !active} onChange={event => {setDraft(event.target.value);setCommandOpen(/^\/[\w-]*$/.test(event.target.value));setCommandIndex(0);}} placeholder={t("Message Hermes…", "发给 Hermes……")} onKeyDown={event => {
          if(event.nativeEvent.isComposing)return;
          if(commandOpen && event.key==="Escape"){event.preventDefault();setCommandOpen(false);return;}
          if(commandOpen && ["ArrowDown","ArrowUp"].includes(event.key)&&commands.length){event.preventDefault();const next=(commandIndex+(event.key==="ArrowDown"?1:-1)+commands.length)%commands.length;setCommandIndex(next);document.getElementById(`${commandId}-${next}`)?.scrollIntoView({block:"nearest"});return;}
          if(commandOpen && event.key==="Enter"&&!event.shiftKey&&commands.length){event.preventDefault();chooseCommand(commands[Math.min(commandIndex,commands.length-1)]);return;}
          if (event.key === "Enter" && !event.shiftKey && window.matchMedia("(pointer:fine)").matches) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
        }}/>
        <button className="button primary" type="submit" disabled={!data || !draft.trim() || sending} aria-label={t("Send", "发送")}><Icon name="arrow" /></button>
      </form>
    </div>
    {noteOpen && <HermesNoteSheet draft={noteDraft} onChange={setNoteDraft} onSend={() => send(undefined, undefined, noteDraft)} onClose={() => setNoteOpen(false)} english={english} busy={sending} available={Boolean(data)} error={error} onDismissError={() => setError("")} />}
    {appearanceOpen && <HermesAppearanceSheet appearance={appearance} english={english} onClose={() => setAppearanceOpen(false)} />}
    {question && <HermesChoiceSheet key={question.id} scope={scope} message={question} open={Boolean(choiceId)} english={english} busy={sending || busy} online={online} error={error} onDismissError={() => setError("")} onClose={() => setChoiceId(undefined)} onAnswer={(prompt, content) => send(undefined, { message: prompt, content })} />}
    {notes && <FormSheet title={t("Sticky notes", "便利贴")} onClose={() => setNotes(false)}><div className={styles.notes}>
      <button className="button secondary" onClick={() => { setNotes(false); setNoteOpen(true); }}>{t("New note", "写张便利贴")}</button>
      {messages.filter(message => message.presentation?.kind === "note").map(message => <button key={message.id} className={styles.savedNote} onClick={() => { setNotes(false); requestAnimationFrame(() => document.getElementById(`hermes-${message.id}`)?.scrollIntoView({ block: "center" })); }}><span>{message.content}</span><small>{hermesStatusText(message, online, english)}</small></button>)}
      {!messages.some(message => message.presentation?.kind === "note") && <p>{t("No notes in this conversation yet.", "这段对话还没有便利贴。")}</p>}
      {hasOlder && <button className="text-button" disabled={busy} onClick={() => void older()}>{t("Load earlier notes", "查找更早的便利贴")}</button>}
    </div></FormSheet>}
    {history && (renaming ? <FormSheet key="rename" title={t("Rename conversation", "修改对话名称")}
      onClose={() => setRenaming(undefined)} formId={renameFormId} submitLabel={t("Save", "保存")}
      cancelLabel={t("Cancel", "取消")} busyLabel={t("Saving…", "正在保存…")} busy={busy} submitDisabled={!renaming.title.trim()}>
      <form id={renameFormId} className={styles.renameForm} onSubmit={event => void renameConversation(event)}>
        <label className="field"><span>{t("Conversation name", "对话名称")}</span>
          <input data-sheet-initial-focus value={renaming.title} maxLength={80} required disabled={busy}
            onChange={event => { setRenaming({ ...renaming, title: event.target.value }); setRenameError(""); }} />
        </label>
        {renameError && <HermesErrorNotice inline error={renameError} fallback={t("Could not rename conversation.", "未能修改对话名称。")} />}
      </form>
    </FormSheet> : <FormSheet key="history" title={t("Conversations", "历史对话")} onClose={() => setHistory(false)}>
      <div className={styles.history}>{data?.conversations.map(c => <div key={c.id}>
        <button title={c.title} onClick={() => select(c.id)} aria-current={active === c.id ? "true" : undefined}>{c.title}</button>
        <button type="button" className="icon-button" aria-label={t(`Rename ${c.title}`, `修改名称：${c.title}`)}
          onClick={() => { setRenameError(""); setRenaming({ id: c.id, title: c.title }); }}><Icon name="edit" /></button>
        <button className="text-button" onClick={() => { setHistory(false); setClearId(c.id); }}>{t("Clear", "清理")}</button>
      </div>)}{!data?.conversations.length && <p>{t("No conversations yet.", "还没有对话。")}</p>}</div>
    </FormSheet>)}
    {clearId && <FormSheet title={t("Clear cloud conversation", "清理云端对话")} onClose={() => setClearId(undefined)} busy={busy}><p>{t("Removes this EO conversation and unsent messages. Hermes’ local history and memory are kept. Active processing must finish first.", "删除这段 EO 云端对话及尚未发送的消息。Hermes 电脑上的历史和记忆保留；正在处理时需等它结束。")}</p><button className="button danger" disabled={busy} onClick={async () => { const id = clearId; if (await act({ action: "clear", conversationId: id })) { if (active === id) select(); } }}>{t("Clear conversation", "清理这段对话")}</button></FormSheet>}
    {setup && <FormSheet title={t("Connect Hermes", "连接 Hermes")} onClose={() => { setSetup(false); setConnectionAction(undefined); }} busy={busy}><div className={styles.setup}>
      <p>{online === undefined ? t("The current connection status is unavailable.", "暂时无法确认电脑上的 Hermes 连接状态。") : online ? t("Your computer is connected.", "电脑上的 Hermes 已连接。") : t("Run Hermes with the EvaOrbit channel on your computer. EO holds messages while it is offline.", "在电脑上启动带 EO 通道的 Hermes。离线时，EO 会保留待接收的消息。")}</p>
      {connection?.lastSeenAt && <small>{t("Last connection: ", "最近连接：")}{new Date(connection.lastSeenAt).toLocaleString()}</small>}
      {connectionAction ? <><p>{connectionAction === "pair" ? t("New credentials revoke the previous connection. Import the new file on your computer.", "新凭据会替换旧连接，需要在电脑重新导入连接文件。") : t("Disconnect Hermes? Existing cloud conversations are kept.", "断开 Hermes？已有云端对话会保留。")}</p><button className="button primary" disabled={busy} onClick={() => void (connectionAction === "pair" ? pair() : act({ action: "disconnect" }))}>{t("Confirm", "确认")}</button><button className="text-button" onClick={() => setConnectionAction(undefined)}>{t("Cancel", "取消")}</button></> : <><button className="button secondary" disabled={busy} onClick={() => connection?.paired ? setConnectionAction("pair") : void pair()}>{t("Download connection file", "下载连接文件")}</button><small>{t("Import this file with the computer installer. It contains your connection credential; keep it private.", "用电脑端安装脚本导入文件。文件含连接凭据，请勿分享。")}</small>{connection?.paired && <button className="text-button" disabled={busy} onClick={() => setConnectionAction("disconnect")}>{t("Disconnect", "断开连接")}</button>}</>}
    </div></FormSheet>}
    <span className={styles.live} role="status" aria-live="polite">{current ? current.title : ""}</span>
  </section></>;
}
