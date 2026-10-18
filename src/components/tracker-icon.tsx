"use client";

import Image from "next/image";
import { TrackerPicture } from "./tracker-picture";
import type { Tracker } from "@/lib/types";

export function TrackerIcon({ tracker, size = 52 }: { tracker: Pick<Tracker, "id" | "name" | "icon" | "iconType" | "iconValue" | "updatedAt">; size?: number }) {
  if (tracker.iconType === "image" && tracker.iconValue) {
    return <TrackerPicture size={size} image={<Image unoptimized src={`/api/trackers/${tracker.id}/icon?v=${encodeURIComponent(tracker.updatedAt)}`} alt={`${tracker.name} icon`} width={size} height={size} />} />;
  }
  return <TrackerPicture icon={tracker.icon} size={size} />;
}
