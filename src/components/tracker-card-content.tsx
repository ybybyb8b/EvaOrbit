import type { ReactNode } from "react";

function ago(value: string) {
  const milliseconds = Date.now() - new Date(value).getTime();
  const days = Math.floor(milliseconds / 86400000);
  if (days > 0) return `${days}d ago`;
  const hours = Math.floor(milliseconds / 3600000);
  if (hours > 0) return `${hours}h ago`;
  return `${Math.max(1, Math.floor(milliseconds / 60000))}m ago`;
}

export function TrackerCardContent({ name, lastOccurredAt, picture }: { name: string; lastOccurredAt: string | null; picture: ReactNode }) {
  return <div className="tracker-card-head">{picture}<div><h3>{name}</h3><p>{lastOccurredAt ? `Last recorded · ${ago(lastOccurredAt)}` : "No records yet"}</p></div></div>;
}
