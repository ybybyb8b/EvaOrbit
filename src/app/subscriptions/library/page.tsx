import type { Metadata } from "next";
import { listSoftwareLibrary } from "@/lib/services/software-library";
import { SoftwareLibraryView } from "./software-library-view";
export const metadata: Metadata = { title: "Software library" };
export const dynamic = "force-dynamic";
export default async function SoftwareLibraryPage() { return <SoftwareLibraryView initial={await listSoftwareLibrary()} />; }
