import type { HomeSleepSummary } from "./home-day.ts";
import { zonedDateParts } from "./time.ts";
export const firstSleepWakeDate = "2026-10-01";

export type SleepSample = {
  sampleId: string; startAt: string; endAt: string; stage: number;
  timeZone: string; timeZoneSource: "metadata" | "device";
  sourceBundle: string; sourceName: string; syncIdentifier?: string; syncVersion?: number;
};
export type ActualSleep = {
  startAt: string; endAt: string; durationMinutes: number; timeZone: string;
  sourceName: string; sourceBundle: string; timeZoneSource: "metadata" | "device";
};
export type DailySleepSummary = {
  date: string;
  actual: ActualSleep | null;
  window: { startAt: string; endAt: string; durationMinutes: number } | null;
  windowMinusActualMinutes: number | null;
  efficiency: number | null;
  comparable: boolean;
  napMinutes: number;
  secondary: Array<{ actual: ActualSleep; window: HomeSleepSummary["records"][number] | null }>;
  source: "apple_health" | "timeline_estimate" | "none";
};
type Interval = [number, number];
const asleepStages = new Set([1, 3, 4, 5]); // Unspecified, Core, Deep, REM. In Bed (0) and Awake (2) are excluded.

function union(intervals: Interval[]): Interval[] {
  const result: Interval[] = [];
  for (const [start, end] of intervals.sort((a, b) => a[0] - b[0])) {
    const last = result.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else result.push([start, end]);
  }
  return result;
}

function subtract(intervals: Interval[], exclusions: Interval[]): Interval[] {
  let result = union(intervals);
  for (const [from, to] of union(exclusions)) {
    result = result.flatMap(([start, end]): Interval[] => end <= from || start >= to ? [[start, end]] : [
      ...(start < from ? [[start, from] as Interval] : []), ...(end > to ? [[to, end] as Interval] : []),
    ]);
  }
  return result;
}

export function actualSleepSessions(samples: SleepSample[]): ActualSleep[] {
  const unique = [...new Map(samples.map(sample => [sample.sampleId, sample])).values()]
    .filter(sample => Number.isFinite(Date.parse(sample.startAt)) && Date.parse(sample.endAt) > Date.parse(sample.startAt) && sample.stage >= 0 && sample.stage <= 5)
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  const episodes: SleepSample[][] = [];
  let episodeEnd = 0;
  for (const sample of unique) {
    // HealthKit has no universal session ID. Bridge gaps up to 90 minutes (wakefulness/stage gaps);
    // larger gaps form separate sleep/nap episodes. Raw samples are retained for future session rules.
    if (!episodes.length || Date.parse(sample.startAt) > episodeEnd + 90 * 60_000) {
      episodes.push([]); episodeEnd = 0;
    }
    episodes.at(-1)!.push(sample);
    episodeEnd = Math.max(episodeEnd, Date.parse(sample.endAt));
  }
  return episodes.flatMap(episode => {
    // Prefer a staged source over a broad manual/legacy asleep envelope; never add sources together.
    const sources = [...new Set(episode.filter(sample => asleepStages.has(sample.stage)).map(sample => sample.sourceBundle))]
      .map(bundle => {
        const rows = episode.filter(sample => sample.sourceBundle === bundle);
        const intervals = subtract(rows.filter(sample => asleepStages.has(sample.stage)).map(sample => [Date.parse(sample.startAt), Date.parse(sample.endAt)]),
          rows.filter(sample => sample.stage === 2).map(sample => [Date.parse(sample.startAt), Date.parse(sample.endAt)]));
        const milliseconds = intervals.reduce((sum, [start, end]) => sum + end - start, 0);
        return { bundle, rows, intervals, milliseconds, staged: rows.some(sample => sample.stage >= 3) };
      }).filter(source => source.milliseconds > 0)
      .sort((a, b) => Number(b.staged) - Number(a.staged) || b.milliseconds - a.milliseconds || a.bundle.localeCompare(b.bundle));
    const source = sources[0];
    if (!source) return [];
    const start = source.intervals[0][0], end = source.intervals.at(-1)![1];
    const wakeSample = source.rows.filter(sample => asleepStages.has(sample.stage)).sort((a, b) => Date.parse(b.endAt) - Date.parse(a.endAt))[0];
    return [{ startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString(), durationMinutes: source.milliseconds / 60_000,
      timeZone: wakeSample.timeZone, timeZoneSource: wakeSample.timeZoneSource, sourceName: wakeSample.sourceName, sourceBundle: source.bundle }];
  });
}

export function buildDailySleepSummary(date: string, samples: SleepSample[], timeline: HomeSleepSummary | null): DailySleepSummary {
  const sessions = actualSleepSessions(samples).filter(session => date >= firstSleepWakeDate && zonedDateParts(session.endAt, session.timeZone).date === date)
    .sort((a, b) => b.durationMinutes - a.durationMinutes);
  const actual = sessions[0] ?? null;
  const overlap = (window: { startAt: string; endAt: string }) => actual ? Math.max(0, Math.min(Date.parse(window.endAt), Date.parse(actual.endAt)) - Math.max(Date.parse(window.startAt), Date.parse(actual.startAt))) : 0;
  const windows = timeline?.records ?? [];
  const matched = actual ? [...windows].sort((a, b) => overlap(b) - overlap(a))[0] : null;
  const window = matched && overlap(matched) > 0 ? matched : timeline;
  const comparable = !!(actual && window && overlap(window) > 0 && window.durationMinutes > 0);
  // Presentation only: retain every measured episode and associate its best overlapping window.
  // Never fall back to the main timeline window for an unrelated secondary episode.
  const secondary = sessions.slice(1).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)).map(session => {
    const overlapMinutes = (record: HomeSleepSummary["records"][number]) => Math.max(0,
      Math.min(Date.parse(record.endAt), Date.parse(session.endAt)) - Math.max(Date.parse(record.startAt), Date.parse(session.startAt)));
    const matchedWindow = [...windows].sort((a, b) => overlapMinutes(b) - overlapMinutes(a))[0];
    return { actual: session, window: matchedWindow && overlapMinutes(matchedWindow) > 0 ? matchedWindow : null };
  });
  return {
    date, actual, window: window ? { startAt: window.startAt, endAt: window.endAt, durationMinutes: window.durationMinutes } : null,
    // Keep the raw ratio (including >100%) so a shorter/misaligned Calendar window isn't disguised.
    windowMinusActualMinutes: comparable ? window!.durationMinutes - actual!.durationMinutes : null,
    efficiency: comparable ? actual!.durationMinutes / window!.durationMinutes : null, comparable,
    napMinutes: sessions.slice(1).reduce((sum, session) => sum + session.durationMinutes, 0),
    secondary,
    source: actual ? "apple_health" : window ? "timeline_estimate" : "none",
  };
}

export function sleepDisplay(summary: DailySleepSummary) {
  return summary.actual ? { ...summary.actual, source: "apple_health" as const } : summary.window ? { ...summary.window, source: "timeline_estimate" as const } : null;
}

export function sleepOverviewRows(summary: DailySleepSummary): Array<{ kind: "total" | "main" | "other" | "window"; durationMinutes: number }> {
  if (!summary.actual) return summary.window ? [{ kind: "window", durationMinutes: summary.window.durationMinutes }] : [];
  return [
    { kind: "total", durationMinutes: summary.actual.durationMinutes + summary.napMinutes },
    { kind: "main", durationMinutes: summary.actual.durationMinutes },
    ...summary.secondary.map(({ actual }) => ({ kind: "other" as const, durationMinutes: actual.durationMinutes })),
  ];
}
