import type { Metadata } from "next";
import { SettingsView } from "../settings-view";

export const metadata: Metadata = { title: "App & Appearance" };

export default function AppAppearancePage() { return <SettingsView />; }
