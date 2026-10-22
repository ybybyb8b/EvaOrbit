import { useState, type FormEvent } from "react";
import { LoginFields, LoginSurface } from "@/components/login-surface";
import { ErrorNotice } from "@/components/error-notice";
import type { LocalAccount, TrackerPlatform } from "./platform";

export function LocalLogin({ platform, initialError, onSignedIn, onPreview, onCancel,embedded=false,initialEmail="",onBusyChange }: { onBusyChange?:(busy:boolean)=>void;embedded?:boolean;initialEmail?:string;platform: TrackerPlatform; initialError?: string; onSignedIn: (account: LocalAccount) => void; onPreview?: () => Promise<void>; onCancel?: () => void }) {
  const [email, setEmail] = useState(initialEmail), [password, setPassword] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true);onBusyChange?.(true); setError("");
    try { const account = await platform.signIn(email.trim(), password); setPassword(""); onSignedIn(account); }
    catch (reason) { setError(reason instanceof TypeError ? "暂时无法连接登录服务，请检查网络后重试。" : reason instanceof Error ? reason.message : "连接失败，请重试"); }
    finally { setBusy(false);onBusyChange?.(false); }
  }
  const form=<>
    <form id="local-login" onSubmit={submit}>
      <LoginFields disabled={busy} email={{value:email,onChange:event=>setEmail(event.target.value)}} password={{value:password,onChange:event=>setPassword(event.target.value)}} />
      {(error || initialError) && <ErrorNotice>{error || initialError}</ErrorNotice>}
      <button className="button primary" type="submit" disabled={busy}>{busy ? "正在登录…" : "进入 EvaOrbit"}</button>
    </form>
  </>;
  if(embedded)return form;
  return <LoginSurface actions={<div className="local-login-actions">{onCancel && <button type="button" className="text-button" disabled={busy} onClick={onCancel}>返回本机记录</button>}{onPreview && <button type="button" className="text-button" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await onPreview(); } catch { setError("暂时无法打开本机预览，请重试。"); } finally { setBusy(false); } }}>本机预览</button>}</div>}>
    {form}
  </LoginSurface>;
}
