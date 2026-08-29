import type { Metadata } from "next";
import { listMedia } from "@/lib/services/media";
import { MediaView } from "./media-view";

export const metadata: Metadata = { title: "Media" };
export const dynamic = "force-dynamic";

export default async function MediaPage() {
  const items = await listMedia({ limit: 100 });
  return <MediaView initial={items} />;
}
