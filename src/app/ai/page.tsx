import type { Metadata } from "next";
import {ParlorUnavailable} from "@/components/parlor-unavailable";
import { PageBackButton } from "@/components/page-back-button";

export const metadata: Metadata = { title: "Parlor" };

export default function AiPage() {
  return <ParlorUnavailable back={<PageBackButton/>}/>;
}
