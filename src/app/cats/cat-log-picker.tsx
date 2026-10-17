"use client";

import { useState } from "react";
import type { CatRecordKind } from "@/lib/types";
import { Icon } from "@/components/icons";

export const catRecordTitles: Record<CatRecordKind, string> = {
  event: "Record care", symptom: "Record symptom", vet_visit: "Record vet visit",
  medication: "Add medication course", measurement: "Record measurement",
};

export function CatLogPicker({ onRecord, onPlan, initialHealth = false, canHealth = true }: {
  onRecord: (kind: CatRecordKind) => void; onPlan?: () => void; initialHealth?: boolean; canHealth?: boolean;
}) {
  const [health, setHealth] = useState(initialHealth);
  return <div className="cat-log-choices">
    {health ? <>
      <p className="cat-section-copy">Choose what you want to record.</p>
      {(["symptom", "vet_visit", "medication", "measurement"] as const).map(kind => <button key={kind} type="button" onClick={() => onRecord(kind)}><span><strong>{catRecordTitles[kind]}</strong><small>{kind === "symptom" ? "A change you noticed" : kind === "vet_visit" ? "Reason, clinic and treatment" : kind === "medication" ? "A course with a start date and dose" : "Weight, temperature or another value"}</small></span><Icon name="arrow" variant="stroke"/></button>)}
      {!initialHealth && <button type="button" className="text-button" onClick={() => setHealth(false)}>Back</button>}
    </> : <>
      <button type="button" onClick={() => onRecord("event")}><span><strong>Record care</strong><small>Care, grooming or cleaning already done</small></span><Icon name="arrow" variant="stroke"/></button>
      <button type="button" disabled={!canHealth} onClick={() => setHealth(true)}><span><strong>Health record</strong><small>Symptoms, vet visits, medication or measurements</small></span><Icon name="arrow" variant="stroke"/></button>
      {onPlan && <button type="button" onClick={onPlan}><span><strong>Plan care</strong><small>A one-time task or a repeating routine</small></span><Icon name="arrow" variant="stroke"/></button>}
    </>}
  </div>;
}
