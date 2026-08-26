import Image from "next/image";
import { Icon } from "./icons";
import type { Tracker } from "@/lib/types";

export function TrackerIcon({ tracker, size = 52 }: { tracker: Pick<Tracker, "id" | "name" | "icon" | "iconType" | "iconValue" | "updatedAt">; size?: number }) {
  if (tracker.iconType === "image" && tracker.iconValue) {
    return <span className="tracker-picture" style={{ width: size, height: size }}><Image unoptimized src={`/api/trackers/${tracker.id}/icon?v=${encodeURIComponent(tracker.updatedAt)}`} alt={`${tracker.name} icon`} width={size} height={size} /></span>;
  }
  if (tracker.icon && tracker.icon !== "◉") return <span className="tracker-picture tracker-picture-legacy" style={{ width: size, height: size }} aria-hidden="true">{tracker.icon}</span>;
  return <span className="tracker-picture tracker-picture-default" style={{ width: size, height: size }} aria-hidden="true"><Icon name="tracker" /></span>;
}
