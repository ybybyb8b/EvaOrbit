import type { Metadata } from "next";
import { ModulePreviewCard, ModulePreviewGrid, ModuleShell } from "@/components/module-shell";

export const metadata: Metadata = { title: "Media" };

export default function MediaPage() {
  return <ModuleShell eyebrow="ARCHIVE" title="Media" description="不接管想看、在看和弃看；这里仅保存已经完整看过的作品与每次观看。" icon="media" status="页面骨架 · 不替代 3x3">
    <ModulePreviewGrid>
      <ModulePreviewCard icon="media" label="WATCHED" title="已看作品" description="标题、类型、总评分和一句可选短备注，保持录入足够轻。" />
      <ModulePreviewCard icon="history" label="WATCH EVENTS" title="每次看完都有日期" description="重温不会只累加一个数字，每次完整观看都能进入未来 Timeline。" />
      <ModulePreviewCard icon="search" label="FIND" title="搜索与轻筛选" description="按作品名、类型、年份、评分与是否重温快速找到。" />
    </ModulePreviewGrid>
  </ModuleShell>;
}
