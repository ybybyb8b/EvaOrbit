"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { getNativeHostInfo, healthKitSupported, nativeCall, type HealthKitStatus } from "@/lib/native-bridge";
import type { DailyNutritionSummary } from "@/lib/types";

function sourceLabel(source: DailyNutritionSummary["restingEnergySource"]) { return source === "manual" ? "Manual" : source === "apple_health" ? "Apple Health" : "No data"; }
function kcal(value: number | null) { return value === null ? "—" : `${Math.round(value)} kcal`; }

export function AppleHealthSummary({ energy }: { energy: DailyNutritionSummary }) {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const refresh = async () => {
      const info = await getNativeHostInfo();
      if (!healthKitSupported(info)) { setConnected(false); return; }
      try { const status = await nativeCall<HealthKitStatus>("healthkit.getStatus"); setConnected(status.available && status.credentialConfigured); }
      catch { setConnected(false); }
    };
    void refresh(); window.addEventListener("evaorbit:native-ready", refresh);
    return () => window.removeEventListener("evaorbit:native-ready", refresh);
  }, []);
  const updated = energy.healthKitLastIngestedAt ? new Date(energy.healthKitLastIngestedAt).toLocaleString() : "No Apple Health update yet";
  return <Link className="apple-health-summary" href="/settings/health-native">
    <span className="apple-health-summary-mark"><Icon name="health" /></span>
    <span className="apple-health-summary-copy"><small>{connected ? "APPLE HEALTH CONNECTED" : "HEALTH DATA"}</small><strong>Today’s energy</strong><span>Resting {kcal(energy.restingEnergyKcal)} · {sourceLabel(energy.restingEnergySource)}</span><span>Active {kcal(energy.activeEnergyKcal)} · {sourceLabel(energy.activeEnergySource)}</span><em>Updated {updated}</em></span>
    <span className="apple-health-summary-link">Manage in Settings <Icon name="arrow" /></span>
  </Link>;
}
