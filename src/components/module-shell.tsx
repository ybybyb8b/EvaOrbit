import type { ReactNode } from "react";
import { PageHeader } from "./page-header";
import { Icon, type IconName } from "./icons";

export function ModuleShell({ eyebrow, title, description, icon, status, children }: {
  eyebrow: string;
  title: string;
  description: string;
  icon: IconName;
  status: string;
  children: ReactNode;
}) {
  return <div className="page module-page">
    <PageHeader eyebrow={eyebrow} title={title} description={description} />
    <section className="module-intro-card">
      <span className="module-intro-icon"><Icon name={icon} /></span>
      <div><span className="module-status">{status}</span><p>这一轮先把位置、边界和未来入口放好，不会创建假数据，也不会提前锁死底层字段。</p></div>
    </section>
    {children}
  </div>;
}

export function ModulePreviewGrid({ children }: { children: ReactNode }) {
  return <div className="module-preview-grid">{children}</div>;
}

export function ModulePreviewCard({ title, label, description, icon }: { title: string; label: string; description: string; icon: IconName }) {
  return <article className="module-preview-card"><span><Icon name={icon} /></span><div><small>{label}</small><h2>{title}</h2><p>{description}</p></div></article>;
}
