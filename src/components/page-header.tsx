export function PageHeader({ eyebrow, title, action }: { eyebrow: string; title: React.ReactNode; description?: string; action?: React.ReactNode }) {
  return <header className="page-header">
    <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1></div>
    {action}
  </header>;
}
