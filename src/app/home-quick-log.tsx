"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormSheet } from "@/components/form-sheet";
import { Icon, type IconName } from "@/components/icons";
import { useLocale } from "@/components/locale-controller";
import { playNativeHaptic } from "@/lib/native-haptics";
import type { DrinkInputSuggestions, Pet, TrackerField, TrackerSummary } from "@/lib/types";
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

export function HomeQuickLog({ selectedDate, onSaved }: { selectedDate: string; onSaved: () => Promise<void> }) {
  const { english } = useLocale();
  const router = useRouter();
  const [active, setActive] = useState<QuickKind | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [drinkSuggestions, setDrinkSuggestions] = useState(emptyDrinkSuggestions);
  const [pets, setPets] = useState<Pet[]>([]);
  const [trackers, setTrackers] = useState<TrackerSummary[]>([]);
  const [trackerFields, setTrackerFields] = useState<TrackerField[]>([]);
  const [selectedTracker, setSelectedTracker] = useState<TrackerSummary>();
  const close = () => { setActive(null); setError(""); setSelectedTracker(undefined); };
  async function saved() { await onSaved(); router.refresh(); }
  async function choose(kind: QuickEntryKind) {
    playNativeHaptic("selection"); setError("");
    if (kind === "food" || kind === "inbox" || getHealthQuickLog(kind)) { setActive(kind); return; }
    setLoading(true);
    try {
      if (kind === "drink") { const response = await fetch("/api/drinks/suggestions", { cache: "no-store" }); if (!response.ok) throw new Error(); setDrinkSuggestions(await response.json()); }
      if (kind === "cats") { const response = await fetch("/api/cats", { cache: "no-store" }); if (!response.ok) throw new Error(); const dashboard = await response.json() as { pets: Array<{ pet: Pet }> }; setPets(dashboard.pets.map((item) => item.pet)); }
      if (kind === "tracker") { const response = await fetch("/api/trackers", { cache: "no-store" }); if (!response.ok) throw new Error(); setTrackers(await response.json()); }
      setActive(kind);
    } catch { setError(english ? "Could not open this form" : "暂时无法打开此表单"); }
    finally { setLoading(false); }
  }
  async function chooseTracker(tracker: TrackerSummary) {
    setLoading(true); setError("");
    try { const response = await fetch(`/api/trackers/${tracker.id}`, { cache: "no-store" }); if (!response.ok) throw new Error(); const detail = await response.json() as { fields: TrackerField[] }; setTrackerFields(detail.fields); setSelectedTracker(tracker); }
    catch { setError(english ? "Could not open this Tracker" : "暂时无法打开此观测"); }
    finally { setLoading(false); }
  }
  const options: Array<{ kind: QuickEntryKind; icon: IconName; en: string; zh: string }> = [
    { kind: "food", icon: "food", en: "Food", zh: "饮食" }, { kind: "drink", icon: "drink", en: "Drink", zh: "饮品" }, ...HEALTH_QUICK_LOGS,
    { kind: "tracker", icon: "tracker", en: "Tracker", zh: "观测" }, { kind: "cats", icon: "cats", en: "Cats", zh: "猫咪" }, { kind: "inbox", icon: "inbox", en: "Inbox", zh: "散落" },
  ];
  const healthQuickLog = getHealthQuickLog(active);
  const HealthQuickLogEditor = healthQuickLog?.Editor;
  return <>
    <button type="button" className="home-quick-log-trigger" onClick={() => { playNativeHaptic("light"); setActive("picker"); }}><Icon name="plus" variant="stroke" /><span>Log</span></button>
    {active === "picker" && <FormSheet title={english ? "Quick Log" : "快速记录"} onClose={close}><div className="home-quick-log-grid">{options.map((option) => <button type="button" key={option.kind} disabled={loading} onClick={() => void choose(option.kind)}><Icon name={option.icon} /><strong>{english ? option.en : option.zh}</strong></button>)}</div>{error && <p className="form-error" role="alert">{error}</p>}</FormSheet>}
    {active === "food" && <FoodRecordEditor key={`food-${selectedDate}`} date={selectedDate} onClose={close} onSaved={saved} />}
    {active === "drink" && <DrinkRecordEditor key={`drink-${selectedDate}`} initialDate={selectedDate} suggestions={drinkSuggestions} onClose={close} onSaved={saved} />}
    {HealthQuickLogEditor && <HealthQuickLogEditor key={`${healthQuickLog.kind}-${selectedDate}`} initialDate={selectedDate} onClose={close} onSaved={saved} />}
    {active === "cats" && <FormSheet title={english ? "New cat record" : "新增猫咪记录"} onClose={close} submitLabel={english ? "Save record" : "保存记录"} busy={loading}><CatRecordEditor key={`cats-${selectedDate}`} pets={pets} initialDate={selectedDate} onSavingChange={setLoading} onCancel={close} onSaved={async () => { await saved(); close(); }} /></FormSheet>}
    {active === "inbox" && <FormSheet title="Inbox" onClose={close} formId="home-inbox-capture" submitLabel={english ? "Save" : "记下"} busy={loading}><InboxCaptureForm formId="home-inbox-capture" sheet onSaved={async () => { await saved(); close(); }} /></FormSheet>}
    {active === "tracker" && !selectedTracker && <FormSheet title={english ? "Choose Tracker" : "选择观测"} onClose={close}><div className="home-quick-tracker-list">{trackers.map((tracker) => <button type="button" key={tracker.id} disabled={loading} onClick={() => void chooseTracker(tracker)}><TrackerIcon tracker={tracker} size={38} /><span><strong>{tracker.name}</strong><small>{tracker.groupName}</small></span><Icon name="arrow" variant="stroke" /></button>)}{!trackers.length && <p className="home-today-empty">{english ? "No Trackers yet" : "还没有观测项目"}</p>}</div>{error && <p className="form-error" role="alert">{error}</p>}</FormSheet>}
    {active === "tracker" && selectedTracker && <TrackerEntryEditor key={`tracker-${selectedTracker.id}-${selectedDate}`} trackerId={selectedTracker.id} fields={trackerFields} initialDate={selectedDate} onClose={close} onSaved={saved} />}
  </>;
}
