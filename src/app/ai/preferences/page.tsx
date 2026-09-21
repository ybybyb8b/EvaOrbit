import type { Metadata } from "next";
import { AiPreferences } from "../ai-preferences";

export const metadata: Metadata = { title: "AI Preferences" };

export default function AiPreferencesPage() { return <AiPreferences />; }
