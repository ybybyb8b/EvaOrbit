"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import styles from "./food-delete-action.module.css";

export function FoodDeleteAction({ label, description, onDelete, disabled = false }: {
  label: string;
  description: string;
  onDelete: () => Promise<void>;
  disabled?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const confirmation = useRef<HTMLDivElement>(null);
  const descriptionId = useId();
  useEffect(() => {
    if (confirming) confirmation.current?.scrollIntoView({ block: "nearest" });
  }, [confirming]);
  async function remove() {
    if (running.current || disabled) return;
    running.current = true;
    setPending(true);
    setError("");
    try { await onDelete(); setConfirming(false); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "删除失败，请重试"); }
    finally { running.current = false; setPending(false); }
  }
  return <div className={styles.root}>
    <button ref={trigger} type="button" className={`${styles.trigger} danger`} disabled={disabled || pending} aria-expanded={confirming} onClick={() => { setError(""); setConfirming(true); }}><Icon name="trash"/>{label}</button>
    {confirming && <div ref={confirmation} className={styles.confirm} role="group" aria-label={label} aria-describedby={descriptionId}>
      <p id={descriptionId}>{description}</p>
      {error && <p role="alert">{error}</p>}
      <div className={styles.actions}>
        <button type="button" disabled={disabled || pending} onClick={() => { setConfirming(false); trigger.current?.focus(); }}>取消删除</button>
        <button type="button" className="danger" disabled={disabled || pending} onClick={() => void remove()}>{pending ? "正在删除…" : "确认删除"}</button>
      </div>
    </div>}
  </div>;
}
