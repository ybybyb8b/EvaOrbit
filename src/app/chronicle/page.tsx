import type { Metadata } from "next";
import { ModulePreviewCard, ModulePreviewGrid, ModuleShell } from "@/components/module-shell";

export const metadata: Metadata = { title: "Chronicle" };

export default function ChroniclePage() {
  return <ModuleShell eyebrow="ARCHIVE" title="Chronicle" description="这里未来负责展示、搜索和关联 Chronicle，不要求 Eva 接管日常创作。" icon="chronicle" status="Archive 占位 · MCP 接入留到后续">
    <ModulePreviewGrid>
      <ModulePreviewCard icon="chronicle" label="ARCHIVE" title="保存原文与来源" description="保留 Markdown、创作日期和来源信息，不把整理后的内容假装成原始事实。" />
      <ModulePreviewCard icon="history" label="CONNECTIONS" title="连回当天发生的事" description="未来可关联 People、Cats、Food、Media 和统一 Timeline。" />
    </ModulePreviewGrid>
  </ModuleShell>;
}
