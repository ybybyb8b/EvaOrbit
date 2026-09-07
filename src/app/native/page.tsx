import type { Metadata } from "next";
import { InboxView } from "../inbox/inbox-view";

export const metadata: Metadata = { title: "EvaOrbit Local" };

export default function NativePage() {
  return <InboxView localFirst />;
}
