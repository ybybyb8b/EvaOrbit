"use client";

import Link from "next/link";
import { useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Icon, type IconName } from "@/components/icons";
import { homeFavoriteModuleOrder, normalizeHomeModuleOrder, type HomeModuleId } from "@/lib/home-modules";
import { playNativeHaptic } from "@/lib/native-haptics";
import styles from "./home-destinations.module.css";
import { useLocale } from "@/components/locale-controller";

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
type DragPreview = { id: HomeModuleId; left: number; top: number; width: number; height: number };
const chineseNames: Partial<Record<HomeModuleId, string>> = { inbox: "散落", projects: "工坊", trackers: "观测", food: "吃吃", drinks: "喝喝", health: "体征", cats: "咪子", people: "她们", media: "展架", memo: "碎片", chronicle: "纪事" };

export function HomeDestinations({ initialOrder }: { initialOrder: HomeModuleId[] }) {
  const { english } = useLocale();
  const [order, setOrder] = useState(() => normalizeHomeModuleOrder(initialOrder));
  const [arranging, setArranging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dragged, setDragged] = useState<HomeModuleId | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const dragRef = useRef<{ id: HomeModuleId; pointerId: number; startX: number; startY: number } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
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

  function moveTo(draggedId: HomeModuleId, target: HomeModuleId) {
    if (draggedId === target) return;
    setOrder((current) => {
      const next: HomeModuleId[] = current.filter((item) => item !== "eva");
      const from = next.indexOf(draggedId); const to = next.indexOf(target);
      if (from < 0 || to < 0 || from === to) return current;
      next.splice(from, 1); next.splice(to, 0, draggedId);
      return [...next, "eva"];
    });
  }

  function startDrag(event: ReactPointerEvent<HTMLButtonElement>, id: HomeModuleId) {
    if (!event.isPrimary || saving) return;
    const card = event.currentTarget.closest<HTMLElement>("[data-home-module]");
    if (!card) return;
    const rect = card.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
    setDragged(id);
    setDragPreview({ id, left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    playNativeHaptic("selection");
  }

  function drag(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (previewRef.current) previewRef.current.style.transform = `translate3d(${event.clientX - current.startX}px,${event.clientY - current.startY}px,0) scale(1.02)`;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-home-module]")?.dataset.homeModule as HomeModuleId | undefined;
    if (target) moveTo(current.id, target);
  }

  function endDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    setDragged(null);
    setDragPreview(null);
    playNativeHaptic("light");
  }

  function moveWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, id: HomeModuleId) {
    const offsets: Partial<Record<string, number>> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    move(id, offset);
    playNativeHaptic("selection");
  }

  async function finishArranging() {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/preferences/home", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order }) });
      if (!response.ok) throw new Error(english ? "Could not save favorite spaces" : "无法保存驻点");
      const result = await response.json() as { homeModuleOrder: HomeModuleId[] };
      setOrder(normalizeHomeModuleOrder(result.homeModuleOrder)); setArranging(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : english ? "Could not save favorite spaces" : "无法保存驻点"); }
    finally { setSaving(false); }
  }

  function spaceCard(id: HomeModuleId) {
    const item = modules[id];
    const displayName = english ? item.name : chineseNames[id] ?? item.name;
    const content = <><span className={styles.icon}><Icon name={item.icon} /></span><span className={styles.copy}><strong>{displayName}</strong></span></>;
    if (!arranging) return <Link className={styles.card} href={item.href} key={id}>{content}<Icon name="arrow" /></Link>;
    return <div className={`${styles.card} ${styles.arranging} ${dragged === id ? styles.dragging : ""}`} data-home-module={id} key={id}>
      {content}<button className={styles.dragHandle} type="button" aria-label={english ? `Drag ${displayName}; use arrow keys to move` : `拖动${displayName}；也可使用方向键排序`} onPointerDown={(event) => startDrag(event, id)} onPointerMove={drag} onPointerUp={endDrag} onPointerCancel={endDrag} onKeyDown={(event) => moveWithKeyboard(event, id)}><span aria-hidden="true">••</span></button>
    </div>;
  }

  return <section className={styles.destinations}>
    <div className={styles.heading}>
      <div><h2>{english ? arranging ? "Arrange Favorites" : "Favorites" : arranging ? "管理驻点" : "驻点"}</h2>{arranging && <p>{english ? "The first six spaces appear on Home. Eva remains in All Spaces." : "排序最前的 6 个空间会显示在首页，Eva 只保留在总览。"}</p>}</div>
      <button className={styles.manageButton} onClick={() => arranging ? void finishArranging() : setArranging(true)} disabled={saving}>{english ? saving ? "Saving…" : arranging ? "Done" : "Manage" : saving ? "保存中…" : arranging ? "完成" : "管理"}</button>
    </div>
    {error && <p className={styles.error}>{error}</p>}

    <nav className={styles.favoriteGrid} aria-label={english ? arranging ? "Arrange Home spaces" : "Favorite spaces" : arranging ? "管理首页驻点" : "驻点"}>
      {(arranging ? arrangeableOrder : favorites).map((id) => spaceCard(id))}
    </nav>

    {dragPreview && <div ref={previewRef} className={`${styles.card} ${styles.dragPreview}`} style={{ left: dragPreview.left, top: dragPreview.top, width: dragPreview.width, height: dragPreview.height }} aria-hidden="true">
      <span className={styles.icon}><Icon name={modules[dragPreview.id].icon} /></span><span className={styles.copy}><strong>{english ? modules[dragPreview.id].name : chineseNames[dragPreview.id] ?? modules[dragPreview.id].name}</strong></span>
    </div>}

  </section>;
}
