"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { homeFavoriteModuleOrder, normalizeHomeModuleOrder, type HomeModuleId } from "@/lib/home-modules";
import styles from "./home-destinations.module.css";

const modules: Record<HomeModuleId, { href: string; name: string; icon: IconName }> = {
  inbox: { href: "/inbox", name: "Inbox", icon: "inbox" },
  eva: { href: "/ai", name: "Eva", icon: "ai" },
  projects: { href: "/projects", name: "Projects", icon: "tasks" },
  trackers: { href: "/trackers", name: "Trackers", icon: "tracker" },
  food: { href: "/food", name: "Food", icon: "food" },
  drinks: { href: "/drinks", name: "Drinks", icon: "drink" },
  health: { href: "/health", name: "Health", icon: "health" },
  cats: { href: "/cats", name: "Cats", icon: "cats" },
  people: { href: "/relations", name: "Relations", icon: "people" },
  media: { href: "/media", name: "Media", icon: "media" },
  memo: { href: "/memo", name: "Memo", icon: "memory" },
  chronicle: { href: "/chronicle", name: "Chronicle", icon: "chronicle" },
  lucius: { href: "/lucius", name: "Lucius", icon: "lucius" },
};

const FAVORITE_LIMIT = 6;

export function HomeDestinations({ initialOrder }: { initialOrder: HomeModuleId[] }) {
  const [order, setOrder] = useState(() => normalizeHomeModuleOrder(initialOrder));
  const [arranging, setArranging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dragged, setDragged] = useState<HomeModuleId | null>(null);
  const arrangeableOrder = order.filter((id) => id !== "eva");
  const favorites = homeFavoriteModuleOrder(order, FAVORITE_LIMIT);

  function move(id: HomeModuleId, offset: number) {
    setOrder((current) => {
      const next: HomeModuleId[] = current.filter((item) => item !== "eva");
      const from = next.indexOf(id); const to = Math.max(0, Math.min(next.length - 1, from + offset));
      if (from === to) return current;
      next.splice(from, 1); next.splice(to, 0, id); return [...next, "eva"];
    });
  }

  function moveBefore(target: HomeModuleId) {
    if (!dragged || dragged === target) return;
    setOrder((current) => {
      const next: HomeModuleId[] = current.filter((item) => item !== dragged && item !== "eva");
      next.splice(next.indexOf(target), 0, dragged);
      return [...next, "eva"];
    });
  }

  async function finishArranging() {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/preferences/home", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order }) });
      if (!response.ok) throw new Error("无法保存常用空间");
      const result = await response.json() as { homeModuleOrder: HomeModuleId[] };
      setOrder(normalizeHomeModuleOrder(result.homeModuleOrder)); setArranging(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "无法保存常用空间"); }
    finally { setSaving(false); }
  }

  function spaceCard(id: HomeModuleId, index: number) {
    const item = modules[id];
    const content = <><span className={styles.icon}><Icon name={item.icon} /></span><span className={styles.copy}><strong>{item.name}</strong></span></>;
    if (!arranging) return <Link className={styles.card} href={item.href} key={id}>{content}<Icon name="arrow" /></Link>;
    return <div className={`${styles.card} ${styles.arranging}`} draggable onDragStart={() => setDragged(id)} onDragEnd={() => setDragged(null)} onDragOver={(event) => { event.preventDefault(); moveBefore(id); }} key={id}>
      {content}<span className={styles.dragHandle} aria-hidden="true">••</span><div className={styles.orderControls}><button onClick={() => move(id, -1)} disabled={index === 0} aria-label={`将 ${item.name} 前移`}>↑</button><button onClick={() => move(id, 1)} disabled={index === arrangeableOrder.length - 1} aria-label={`将 ${item.name} 后移`}>↓</button></div>
    </div>;
  }

  return <section className={styles.destinations}>
    <div className={styles.heading}>
      <div><h2>{arranging ? "管理常用空间" : "常用空间"}</h2>{arranging && <p>排序最前的 6 个空间会显示在首页，Eva 只保留在全部空间。</p>}</div>
      <button className={styles.manageButton} onClick={() => arranging ? void finishArranging() : setArranging(true)} disabled={saving}>{saving ? "保存中…" : arranging ? "完成" : "管理"}</button>
    </div>
    {error && <p className={styles.error}>{error}</p>}

    <nav className={styles.favoriteGrid} aria-label={arranging ? "管理首页空间" : "常用空间"}>
      {(arranging ? arrangeableOrder : favorites).map((id, index) => spaceCard(id, index))}
    </nav>

  </section>;
}
