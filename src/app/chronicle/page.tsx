import type { Metadata } from "next";
import { listChronicle } from "@/lib/services/chronicle";
import { ChronicleView } from "./chronicle-view";

export const metadata: Metadata = { title: "Chronicle" };
export const dynamic = "force-dynamic";

export default async function ChroniclePage() {
  return <ChronicleView initial={await listChronicle({ limit: 100 })} />;
}
