"use client";

import { useLocale } from "./locale-controller";
import styles from "./page-loading.module.css";

// Grok-style 3×3 flow: top right → outside edge → center.
const dotOrder = [2, 1, 0, 3, 8, 7, 4, 5, 6];

export function PageLoading({ title = "EvaOrbit", englishTitle = "EvaOrbit", inline = false }: { title?: string; englishTitle?: string; inline?: boolean }) {
  const { english } = useLocale();
  const name = english ? englishTitle : title;
  const label = name === "EvaOrbit" ? english ? "Loading" : "正在加载" : english ? `Loading ${name}` : `正在读取${name}`;
  return <div className={inline ? styles.inline : `page ${styles.page}`} role="status" aria-live="polite">
    <span className="sr-only">{label}</span>
    <span className={styles.grid} aria-hidden="true">
      {dotOrder.map(order => <span key={order} className={styles.dot} style={{ animationDelay: `${order * 150 - 1350}ms` }} />)}
    </span>
  </div>;
}
