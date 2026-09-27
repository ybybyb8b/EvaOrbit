"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Cat, Cup, ForkKnife, Inbox, type IconComponent } from "reicon-react";
import { FormSheet } from "@/components/form-sheet";
import { Icon } from "@/components/icons";
import { useLocale } from "@/components/locale-controller";
import { playNativeHaptic } from "@/lib/native-haptics";
import { invalidateCachedJson, loadCachedJson, prefetchCachedJson } from "@/lib/client-json-cache";
import type { ApiError, DrinkInputSuggestions, Pet, Tracker, TrackerField } from "@/lib/types";
import { CatRecordEditor } from "./cats/cat-record-editor";
import { DrinkRecordEditor } from "./drinks/drink-ui";
import { FoodRecordEditor } from "./food/food-record-editor";
import { getHealthQuickLog, HEALTH_QUICK_LOGS, type HealthQuickLogKind } from "./health/health-quick-log";
import { InboxCaptureForm } from "./inbox/inbox-capture-form";
import { TrackerEntryEditor } from "./trackers/tracker-entry-editor";
import { TrackerIcon } from "@/components/tracker-icon";

type QuickEntryKind = "food" | "drink" | "tracker" | "cats" | "inbox" | HealthQuickLogKind;
type QuickKind = "picker" | QuickEntryKind;
const emptyDrinkSuggestions: DrinkInputSuggestions = { names: [], brands: [] };
const quickLogUrls = {
  cats: "/api/cats/pets",
  drinks: "/api/drinks/suggestions",
  trackers: "/api/trackers/quick-log",
  training: "/api/health/training/suggestions",
} as const;
type QuickTracker = Pick<Tracker, "id" | "name" | "groupName" | "quickCaptureEnabled" | "icon" | "iconType" | "iconValue" | "updatedAt"> & { fields: TrackerField[] };

export function HomeQuickLog({ selectedDate, onSaved }: { selectedDate: string; onSaved: () => Promise<void> }) {
  const { english } = useLocale();
  const router = useRouter();
  const [active, setActive] = useState<QuickKind | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [drinkSuggestions, setDrinkSuggestions] = useState(emptyDrinkSuggestions);
  const [pets, setPets] = useState<Pet[]>([]);
  const [trackers, setTrackers] = useState<QuickTracker[]>([]);
  const [selectedTracker, setSelectedTracker] = useState<QuickTracker>();
  useEffect(() => {
    const warm = () => { for (const url of Object.values(quickLogUrls)) void prefetchCachedJson(url).catch(() => undefined); };
    if (window.requestIdleCallback) {
      const id = window.requestIdleCallback(warm, { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(warm, 800);
    return () => window.clearTimeout(id);
  }, []);
  const close = () => { setActive(null); setError(""); setSelectedTracker(undefined); };
  async function saved() {
    if (active === "drink") invalidateCachedJson(quickLogUrls.drinks);
    if (active === "training") invalidateCachedJson(quickLogUrls.training);
    if (active === "weight") invalidateCachedJson("/api/health/weight?limit=1");
    if (active === "period" || active === "medication-dose") invalidateCachedJson("/api/health/periods?limit=30");
    if (active === "medication-dose") invalidateCachedJson("/api/health/medications?limit=100");
    await onSaved(); router.refresh();
  }
  async function choose(kind: QuickEntryKind) {
    playNativeHaptic("selection"); setError("");
    if (kind === "food" || kind === "inbox" || getHealthQuickLog(kind)) { setActive(kind); return; }
    if (kind === "drink") {
      setActive(kind);
      void loadCachedJson<DrinkInputSuggestions>(quickLogUrls.drinks).then(setDrinkSuggestions).catch(() => undefined);
      return;
    }
    setLoading(true);
    try {
      if (kind === "cats") setPets(await loadCachedJson<Pet[]>(quickLogUrls.cats));
      if (kind === "tracker") setTrackers(await loadCachedJson<QuickTracker[]>(quickLogUrls.trackers));
      setActive(kind);
    } catch { setError(english ? "Could not open this form" : "暂时无法打开此表单"); }
    finally { setLoading(false); }
  }
  async function chooseTracker(tracker: QuickTracker) {
    setError("");
    if (!tracker.quickCaptureEnabled) { setSelectedTracker(tracker); return; }
    setLoading(true);
    try {
      const response = await fetch(`/api/trackers/${tracker.id}/entries`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ occurredAt: new Date().toISOString(), values: {}, note: "" }) });
      if (!response.ok) { setError(((await response.json()) as ApiError).error); return; }
      playNativeHaptic("light"); await saved(); close();
    } catch { setError(english ? "Could not save this record" : "暂时无法保存记录"); }
    finally { setLoading(false); }
  }
  const options: Array<{ kind: QuickEntryKind; icon: IconComponent; en: string; zh: string }> = [
    { kind: "food", icon: ForkKnife, en: "Food", zh: "饮食" }, { kind: "drink", icon: Cup, en: "Drink", zh: "饮品" }, ...HEALTH_QUICK_LOGS,
    { kind: "tracker", icon: Activity, en: "Tracker", zh: "观测" }, { kind: "cats", icon: Cat, en: "Cats", zh: "猫咪" }, { kind: "inbox", icon: Inbox, en: "Inbox", zh: "散落" },
  ];
  const healthQuickLog = getHealthQuickLog(active);
  const HealthQuickLogEditor = healthQuickLog?.Editor;
  return <>
    <button type="button" className="home-quick-log-trigger" aria-label={english ? "Quick Log" : "快速记录"} onClick={() => { playNativeHaptic("light"); setActive("picker"); }}><Icon name="plus" variant="stroke" /></button>
    {active === "picker" && <FormSheet title={english ? "Quick Log" : "快速记录"} onClose={close}><div className="home-quick-log-grid">{options.map(({ kind, icon: LogIcon, en, zh }) => <button type="button" key={kind} disabled={loading} onClick={() => void choose(kind)}><LogIcon className="home-quick-log-icon" size={20} weight="Outline" strokeWidth={1.5} /><strong>{english ? en : zh}</strong></button>)}</div>{error && <p className="form-error" role="alert">{error}</p>}</FormSheet>}
    {active === "food" && <FoodRecordEditor key={`food-${selectedDate}`} date={selectedDate} onClose={close} onSaved={saved} />}
    {active === "drink" && <DrinkRecordEditor key={`drink-${selectedDate}`} initialDate={selectedDate} suggestions={drinkSuggestions} onClose={close} onSaved={saved} />}
    {HealthQuickLogEditor && <HealthQuickLogEditor key={`${healthQuickLog.kind}-${selectedDate}`} initialDate={selectedDate} onClose={close} onSaved={saved} />}
    {active === "cats" && <FormSheet title={english ? "New cat record" : "新增猫咪记录"} onClose={close} submitLabel={english ? "Save record" : "保存记录"} busy={loading}><CatRecordEditor key={`cats-${selectedDate}`} pets={pets} initialDate={selectedDate} onSavingChange={setLoading} onCancel={close} onSaved={async () => { await saved(); close(); }} /></FormSheet>}
    {active === "inbox" && <FormSheet title="Inbox" onClose={close} formId="home-inbox-capture" submitLabel={english ? "Save" : "记下"} busy={loading}><InboxCaptureForm formId="home-inbox-capture" sheet onSaved={async () => { await saved(); close(); }} /></FormSheet>}
    {active === "tracker" && !selectedTracker && <FormSheet title={english ? "Choose Tracker" : "选择观测"} onClose={close}><div className="home-quick-tracker-list">{trackers.map((tracker) => <button type="button" key={tracker.id} disabled={loading} aria-label={tracker.quickCaptureEnabled ? `${english ? "Quick record" : "快速记录"} ${tracker.name}` : tracker.name} onClick={() => void chooseTracker(tracker)}><TrackerIcon tracker={tracker} size={38} /><span><strong>{tracker.name}</strong><small>{tracker.groupName}{tracker.quickCaptureEnabled ? ` · ${english ? "Quick" : "快速"}` : ""}</small></span><Icon name={tracker.quickCaptureEnabled ? "plus" : "arrow"} variant="stroke" /></button>)}{!trackers.length && <p className="home-today-empty">{english ? "No Trackers yet" : "还没有观测项目"}</p>}</div>{error && <p className="form-error" role="alert">{error}</p>}</FormSheet>}
    {active === "tracker" && selectedTracker && <TrackerEntryEditor key={`tracker-${selectedTracker.id}-${selectedDate}`} trackerId={selectedTracker.id} fields={selectedTracker.fields} initialDate={selectedDate} onClose={close} onSaved={saved} />}
  </>;
}
