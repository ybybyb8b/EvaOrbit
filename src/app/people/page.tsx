import type { Metadata } from "next";
import { ModulePreviewCard, ModulePreviewGrid, ModuleShell } from "@/components/module-shell";

export const metadata: Metadata = { title: "People" };

export default function PeoplePage() {
  return <ModuleShell eyebrow="ARCHIVE" title="People" description="正式实现前会先审阅旧人际管理 App 的真实字段和使用方式，不凭想象重做。" icon="people" status="调研占位 · 暂不建立最终数据表">
    <ModulePreviewGrid>
      <ModulePreviewCard icon="people" label="DISCOVERY FIRST" title="先看旧 App" description="梳理真实数据、使用频率和迁移边界后，再决定 Person 与关系事件结构。" />
      <ModulePreviewCard icon="chronicle" label="FUTURE LINKS" title="与生活事件关联" description="以后可以从 Chronicle、Tracker 与 Timeline 找到和某个人有关的片段。" />
    </ModulePreviewGrid>
  </ModuleShell>;
}
