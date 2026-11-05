import type { Metadata } from "next";
import { EvaWorkbench } from "@/components/eva-workbench";

export const metadata: Metadata = { title: "Eva" };

export default function AiPage() {
  return <EvaWorkbench />;
}
