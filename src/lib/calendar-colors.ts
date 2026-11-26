import type { CalendarEvent, TimelineEvent } from "./types.ts";

export const calendarColorPresets = [
  { value: "#728a9a", label: "Mist blue" },
  { value: "#668675", label: "Sage" },
  { value: "#a07886", label: "Dusty rose" },
  { value: "#9a8868", label: "Oat" },
  { value: "#8b819f", label: "Lilac" },
];

export function calendarColor(value: unknown): string | undefined {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : undefined;
}

/** Preserve the hue, adjusting extreme Apple colors so a thin axis stays visible. */
export function calendarColorInk(value: string, dark: boolean): string {
  const rgb = [1, 3, 5].map(offset => Number.parseInt(value.slice(offset, offset + 2), 16));
  const background = dark ? 0.026 : 0.974;
  for (let step = 0; step <= 20; step++) {
    const channels = rgb.map(channel => Math.round(channel + ((dark ? 255 : 0) - channel) * step / 20));
    const linear = channels.map(channel => {
      const s = channel / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    if ((Math.max(luminance, background) + 0.05) / (Math.min(luminance, background) + 0.05) >= 3) return `#${channels.map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
  }
  return dark ? "#ffffff" : "#000000";
}

export function timelineCalendarColor(item: TimelineEvent): string | undefined {
  const source = item.metadata.calendarSource as CalendarEvent["calendarSource"];
  const calendarEvent = item.metadata.calendarEvent as TimelineEvent | undefined;
  return calendarColor(source?.color) ?? calendarColor((calendarEvent?.metadata?.calendarSource as CalendarEvent["calendarSource"])?.color);
}

type Source = { identifier: string; sourceIdentifier: string; title: string; color?: string; colorOverride?: string };
export type CalendarColorBinding = { eo_id: unknown; calendar_identifier: unknown; source_identifier: unknown; last_synced_at: unknown; id: unknown };

export function colorCalendarRecords(records: CalendarEvent[], bindings: CalendarColorBinding[], sources: Source[]): CalendarEvent[] {
  const latest = new Map<number, CalendarColorBinding>();
  for (const binding of bindings) {
    const id = Number(binding.eo_id), previous = latest.get(id);
    if (!previous || String(binding.last_synced_at) > String(previous.last_synced_at) ||
      (binding.last_synced_at === previous.last_synced_at && Number(binding.id) > Number(previous.id))) latest.set(id, binding);
  }
  return records.map(record => {
    const binding = latest.get(record.id);
    if (!binding) return record;
    const matches = sources.filter(source => source.identifier === binding.calendar_identifier && source.sourceIdentifier === binding.source_identifier);
    if (matches.length !== 1) return record;
    const source = matches[0];
    return { ...record, calendarSource: { name: source.title, color: calendarColor(source.colorOverride) ?? calendarColor(source.color) } };
  });
}
