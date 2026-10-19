import { TrackerPicture } from "@/components/tracker-picture";
import type { LocalTrackerRecord, TrackerLocalState } from "@/lib/tracker-local-store";

export function LocalTrackerPicture({ row, state, size=52 }: { row: LocalTrackerRecord; state: TrackerLocalState; size?: number }) {
  const image = row.payload.iconType === "image" && row.serverId ? state.readOnly?.images[String(row.serverId)] : undefined;
  // eslint-disable-next-line @next/next/no-img-element -- Packaged React uses account-scoped data URLs, never the Next image runtime.
  return <TrackerPicture icon={String(row.payload.icon ?? "")} size={size} image={image ? <img src={image.dataUrl} width={size} height={size} alt={String(row.payload.name) + " icon"} /> : undefined} />;
}
