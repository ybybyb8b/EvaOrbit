"use client";

import { useEffect, useState } from "react";
import { useLocale } from "./locale-controller";
import styles from "./page-loading.module.css";

// Same 260 × 176.8 artwork and ellipse geometry as Host's OrbitArtworkView.
const orbitPath = (width: number, height: number, rotation: number, start = 0) => Array.from({ length: 121 }, (_, index) => {
  const angle = start + index / 120 * 2 * Math.PI;
  const x = Math.cos(angle) * 260 * width / 2, y = Math.sin(angle) * 176.8 * height / 2;
  return `${index ? "L" : "M"}${(130 + x * Math.cos(rotation) - y * Math.sin(rotation)).toFixed(3)} ${(88.4 + x * Math.sin(rotation) + y * Math.cos(rotation)).toFixed(3)}`;
}).join(" ") + " Z";
const orbitPaths = [orbitPath(.88, .40, -.24), orbitPath(.80, .58, .25), orbitPath(.72, .67, -.04)];
const planetPath = orbitPath(.88, .40, -.24, .38);

export function PageLoading({ title = "EvaOrbit", englishTitle = "EvaOrbit", inline = false }: { title?: string; englishTitle?: string; inline?: boolean }) {
  const { english } = useLocale();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 12000);
    return () => window.clearTimeout(timer);
  }, []);
  const name = english ? englishTitle : title;
  const label = name === "EvaOrbit" ? english ? "Loading…" : "正在加载…" : english ? `Loading ${name}…` : `正在读取${name}…`;
  return <div className={inline ? styles.inline : `page ${styles.page}`}>
    <div className={styles.content}>
      <div className={styles.symbol} aria-hidden="true">
        <svg viewBox="0 0 260 176.8" fill="none">
          <g>
            {orbitPaths.map((path, index) => <path key={index} className={styles.orbit} d={path} pathLength="1" />)}
            <circle className={styles.satellite} r="6" style={{ offsetPath: `path("${planetPath}")` }} />
          </g>
          <g className={styles.stars} fill="currentColor">
            {[[117, 5, 5], [153.4, 169.8, 5], [23.4, 83.4, 2.2], [234, 102.4, 2.2]].map(([x, y, r], index) => <path key={index} d={`M${x} ${y-r}l${r*.22} ${r*.78}L${x+r} ${y}l${-r*.78} ${r*.22}L${x} ${y+r}l${-r*.22} ${-r*.78}L${x-r} ${y}l${r*.78} ${-r*.22}Z`} />)}
          </g>
          <g className={styles.core}>
            <image className={styles.coreLight} href="/loading/core-light.webp" x="97" y="55.4" width="66" height="66" />
            <image className={styles.coreDark} href="/loading/core-dark.webp" x="97" y="55.4" width="66" height="66" />
          </g>
        </svg>
      </div>
      {!inline && <h1 className={styles.wordmark} translate="no">EvaOrbit</h1>}
      <p className={styles.status} role="status" aria-live="polite" aria-atomic="true">{label}</p>
      {slow && <div className={styles.afterword}>
        <p aria-live="polite">{english ? "This is taking a little longer. Still waiting for content." : "比平时久一点，仍在等待内容返回。"}</p>
        <button type="button" className={styles.retry} onClick={() => window.location.reload()}>{english ? "Reload page" : "重新加载页面"}</button>
      </div>}
    </div>
  </div>;
}
