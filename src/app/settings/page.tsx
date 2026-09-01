import type { Metadata } from "next";
import { SettingsDirectory } from "./settings-directory";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return <SettingsDirectory />;
}
