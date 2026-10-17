"use client";

import type { CatMeasurement, CatMedication, CatRecordKind, CatTimelineEntry } from "@/lib/types";
import { latestCatMeasurements } from "@/lib/cat-presentation";

export function CatHealthOverview({ measurements, medications, timeline, canRecord, onRecord, onOpen, onHistory }: {
  measurements: CatMeasurement[]; medications: CatMedication[]; timeline: CatTimelineEntry[];
  canRecord: boolean; onRecord: (kind: CatRecordKind) => void; onOpen: (item: CatTimelineEntry) => void; onHistory: () => void;
}) {
  const latest = latestCatMeasurements(measurements);
  const active = medications.filter(item => item.active).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const recent = timeline.filter(item => item.kind === "symptom" || item.kind === "vet_visit").slice(0, 4);
  function open(kind: CatRecordKind, id: number) {
    const item = timeline.find(value => value.kind === kind && value.id === id);
    if (item) onOpen(item);
  }
  return <div className="cat-health-overview">
    <section className="cat-health-section"><div className="section-heading"><h2>Latest measurements</h2><button className="text-button" disabled={!canRecord} onClick={() => onRecord("measurement")}>Record measurement</button></div>
      {latest.length ? <div className="cat-health-measurements">{latest.map(item => <button key={item.id} onClick={() => open("measurement", item.id)}><span>{item.measurementType}</span><strong>{item.value} <small>{item.unit}</small></strong><time>{new Date(item.occurredAt).toLocaleDateString()}</time></button>)}</div> : <p className="cat-section-copy">No measurements yet. Start with a weight or another measurement.</p>}
    </section>
    <section className="cat-health-section"><div className="section-heading"><h2>Current medication</h2><button className="text-button" disabled={!canRecord} onClick={() => onRecord("medication")}>Add medication course</button></div>
      {active.length ? <div className="cat-health-list">{active.map(item => <button key={item.id} onClick={() => open("medication", item.id)}><span><strong>{item.name}</strong><small>{[item.dose, item.unit, item.frequencyText].filter(Boolean).join(" · ")}</small></span><time>{new Date(item.startedAt).toLocaleDateString()}</time></button>)}</div> : <p className="cat-section-copy">No medication marked as active.</p>}
    </section>
    <section className="cat-health-section"><div className="section-heading"><h2>Recent symptoms and visits</h2><div className="cat-health-actions"><button className="text-button" disabled={!canRecord} onClick={() => onRecord("symptom")}>Record symptom</button><button className="text-button" disabled={!canRecord} onClick={() => onRecord("vet_visit")}>Record vet visit</button></div></div>
      {recent.length ? <div className="cat-health-list">{recent.map(item => <button key={`${item.kind}-${item.id}`} onClick={() => onOpen(item)}><span><strong>{item.title}</strong><small>{item.summary}</small></span><time>{new Date(item.occurredAt).toLocaleDateString()}</time></button>)}</div> : <p className="cat-section-copy">No symptoms or vet visits recorded yet.</p>}
    </section>
    <button className="button secondary" onClick={onHistory}>View health history</button>
  </div>;
}
