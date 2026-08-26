import type { Metadata } from "next";
import { ModulePreviewCard, ModulePreviewGrid, ModuleShell } from "@/components/module-shell";

export const metadata: Metadata = { title: "Cats" };

export default function CatsPage() {
  return <ModuleShell eyebrow="LIFE" title="Cats" description="健康、照护与家庭猫咪环境会留在同一块地方，但不会把公共记录硬挂到某一只猫身上。" icon="cats" status="页面骨架 · 尚未写入猫咪数据">
    <ModulePreviewGrid>
      <ModulePreviewCard icon="cats" label="PET PROFILE" title="Luna 与胖丁" description="各自拥有档案和时间线，后续承接体重、症状、就诊、驱虫与用药。" />
      <ModulePreviewCard icon="history" label="CARE" title="日常照护" description="剪指甲、梳毛、洗澡等事件按时间留下，需要时再补详细信息。" />
      <ModulePreviewCard icon="home" label="SHARED HOME" title="家庭猫咪环境" description="猫砂盆、饮水机、小喷泉和用品更换允许不关联某一只猫。" />
    </ModulePreviewGrid>
  </ModuleShell>;
}
