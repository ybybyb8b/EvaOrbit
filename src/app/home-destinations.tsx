"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { normalizeHomeModuleOrder, type HomeModuleId } from "@/lib/home-modules";

const modules: Record<HomeModuleId, { href: string; name: string; description: string; icon: IconName }> = {
  inbox: { href: "/inbox", name: "Inbox", description: "Unsorted thoughts", icon: "inbox" },
  eva: { href: "/ai", name: "Eva", description: "Think and explore", icon: "ai" },
  trackers: { href: "/trackers", name: "Trackers", description: "Recurring life events", icon: "tracker" },
  food: { href: "/food", name: "Food", description: "Meals and energy", icon: "food" },
  drinks: { href: "/drinks", name: "Drinks", description: "Coffee and everything else", icon: "drink" },
  cats: { href: "/cats", name: "Cats", description: "Care and shared home", icon: "cats" },
  people: { href: "/people", name: "People", description: "People and relationships", icon: "people" },
  media: { href: "/media", name: "Media", description: "Things fully watched", icon: "media" },
  chronicle: { href: "/chronicle", name: "Chronicle", description: "The long timeline", icon: "chronicle" },
  settings: { href: "/settings", name: "Settings", description: "Models and preferences", icon: "settings" },
};

export function HomeDestinations({ initialOrder }: { initialOrder: HomeModuleId[] }) {
  const [order, setOrder] = useState(() => normalizeHomeModuleOrder(initialOrder));
  const [arranging, setArranging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dragged, setDragged] = useState<HomeModuleId | null>(null);

  function move(id: HomeModuleId, offset: number) {
    setOrder((current) => {
      const from = current.indexOf(id); const to = Math.max(0, Math.min(current.length - 1, from + offset));
      if (from === to) return current;
      const next = [...current]; next.splice(from, 1); next.splice(to, 0, id); return next;
    });
  }

  function moveBefore(target: HomeModuleId) {
    if (!dragged || dragged === target) return;
    setOrder((current) => {
      const next = current.filter((item) => item !== dragged);
      next.splice(next.indexOf(target), 0, dragged);
      return next;
    });
  }

  async function finishArranging() {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/preferences/home", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order }) });
      if (!response.ok) throw new Error("Could not save this order");
      const result = await response.json() as { homeModuleOrder: HomeModuleId[] };
      setOrder(normalizeHomeModuleOrder(result.homeModuleOrder)); setArranging(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save this order"); }
    finally { setSaving(false); }
  }

  return <section className={`home-destinations ${arranging ? "arranging" : ""}`}>
    <div className="section-heading"><div><span className="eyebrow">SPACES</span><h2>All Spaces</h2></div><button className="home-arrange-button" onClick={() => arranging ? void finishArranging() : setArranging(true)} disabled={saving}>{saving ? "Saving…" : arranging ? "Done" : "Arrange"}</button></div>
    {error && <p className="home-order-error">{error}</p>}
    <nav className="home-destination-grid" aria-label="All EvaOrbit spaces">{order.map((id, index) => {
      const item = modules[id];
      const content = <><span className="home-space-icon"><Icon name={item.icon} /></span><span className="home-space-copy"><strong>{item.name}</strong><small>{item.description}</small></span></>;
      return arranging ? <div className="home-space-card arranging" draggable onDragStart={() => setDragged(id)} onDragEnd={() => setDragged(null)} onDragOver={(event) => { event.preventDefault(); moveBefore(id); }} key={id}>
        {content}<span className="home-drag-handle" aria-hidden="true">••</span><div className="home-order-controls"><button onClick={() => move(id, -1)} disabled={index === 0} aria-label={`Move ${item.name} earlier`}>↑</button><button onClick={() => move(id, 1)} disabled={index === order.length - 1} aria-label={`Move ${item.name} later`}>↓</button></div>
      </div> : <Link className="home-space-card" href={item.href} key={id}>{content}</Link>;
    })}</nav>
  </section>;
}
