import type { Metadata } from "next";
import { LifeDaySettings } from "../life-day-settings";

export const metadata: Metadata = { title: "Life day" };
export default function LifeDayPage() { return <LifeDaySettings />; }
