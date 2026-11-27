"use client";
import { WidgetIcon } from "./widget-icon";
import { useCallback, useRef, useState } from "react";
import type { CatsDashboard } from "@/lib/cats-readonly";
import { catWidgetCare } from "@/lib/personal-widget-data";
import { responseError } from "@/lib/response-error";
import { playNativeHaptic } from "@/lib/native-haptics";
import { reconcileNativeNotifications } from "@/lib/native-bridge";
import { useLocale } from "../locale-controller";
import { showActionToast } from "../action-toast";
import { useWidgetEnvironment, useWidgetResource, WidgetLink, WidgetStatus, widgetDate } from "./widget-context";
import type { WidgetCardProps, WidgetConfigProps } from "./widget-types";
import styles from "../personal-widget-stack.module.css";
export function useWidgetCats() { const { json } = useWidgetEnvironment(); return useWidgetResource(useCallback(() => json<CatsDashboard>("/api/cats"),[json])); }
export function CatCareWidget({ widget }: WidgetCardProps) {
  const { english } = useLocale(), environment = useWidgetEnvironment(), resource = useWidgetCats();
  const [busy,setBusy] = useState(false), [error,setError] = useState(""); const pending = useRef(false);
  if (widget.type !== "cat-care") return null;
  const pet = resource.data?.pets.find(item => item.pet.id === widget.petId && item.pet.isActive)?.pet;
  const care = resource.data && catWidgetCare(resource.data,widget.petId,widget.includeHousehold), next = care?.next;
  async function complete() {
    if (!next || !environment.canCompleteCare || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const response = next.routine ? await environment.request(`/api/cats/routines/${next.routine.id}/complete`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({expectedNextDueAt:next.routine.nextDueAt,expectedLastCompletedAt:next.routine.lastCompletedAt}) }) : await environment.request(`/api/reminders/${next.reminder!.id}/complete`, {method:"POST"});
      if(!response.ok) throw new Error(await responseError(response,english ? "Could not complete care. Please retry." : "护理完成失败，请重试。"));
      playNativeHaptic("success"); showActionToast(english ? "Care completed" : "护理已完成"); environment.refresh();
      try { await reconcileNativeNotifications(); } catch { /* Existing Web Push fallback remains active. */ }
    } catch(reason) { setError(reason instanceof Error ? reason.message : String(reason)); environment.refresh(); }
    finally { pending.current = false; setBusy(false); }
  }
  return <><WidgetLink href={pet ? `/cats/${pet.id}` : "/cats"} name={pet ? `${pet.name} · ${english ? "Care" : "护理"}` : english ? "Cats" : "咪子"}/><div className={styles.widgetCopy}><h3 className="user-content"><WidgetIcon image={pet?.avatarUrl} avatar/>{pet?.name ?? (english ? "Cat Care" : "猫咪护理")}</h3><WidgetStatus loading={resource.loading} error={error || resource.error} onRetry={() => {setError("");environment.refresh();}}/>{pet && <><p className={`${styles.primaryInfo} user-content`}>{next ? `${next.title} · ${widgetDate(next.due,english,false)}` : english ? "No care scheduled" : "暂无待护理事项"}</p><p className={`${styles.detail} user-content`}>{care?.latest ? `${english ? "Last done" : "最近完成"} · ${care.latest.title} · ${widgetDate(care.latest.occurredAt,english,false)}` : english ? "No care completed yet" : "暂无已完成护理记录"}</p></>}{!pet && !resource.loading && !resource.error && <p>{english ? "Cat unavailable. Choose another in Edit." : "猫咪不可用，请编辑组件重新选择。"}</p>}</div>{pet && next && <button type="button" className={`button secondary ${styles.action} ${styles.compactAction}`} disabled={busy || !environment.canCompleteCare || !!resource.error} onClick={() => void complete()}>{busy ? english ? "Saving…" : "正在保存…" : english ? "Done" : "完成"}</button>}</>;
}
export function CatCareWidgetConfig({ id, initial, onSave }: WidgetConfigProps) {
  const { english } = useLocale(), resource = useWidgetCats(), previous = initial?.type === "cat-care" ? initial : undefined;
  if (!resource.data) return <WidgetStatus loading={resource.loading} error={resource.error}/>;
  return <form id="personal-widget-config" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); onSave({id,type:"cat-care",petId:Number(data.get("pet")),includeHousehold:data.has("household")}); }}><WidgetStatus loading={resource.loading} error={resource.error}/>
    {!resource.data.pets.some(item => item.pet.isActive) && <p>{english ? "Add a cat in Cats first." : "请先在咪子模块添加猫咪。"}</p>}
    <label className="field"><span>{english ? "Cat" : "猫咪"}</span><select name="pet" required aria-label={english ? "Cat" : "猫咪"} defaultValue={previous?.petId ?? ""}><option value="">{english ? "Choose a cat" : "选择猫咪"}</option>{resource.data?.pets.filter(item => item.pet.isActive).map(({pet}) => <option key={pet.id} value={pet.id}>{pet.name}</option>)}</select></label>
    <label className={styles.option}><input type="checkbox" name="household" defaultChecked={previous?.includeHousehold ?? false}/><span>{english ? "Include household care" : "同时展示全家护理"}</span></label>
  </form>;
}
