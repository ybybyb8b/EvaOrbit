"use client";

import cytoscape, { type Core, type ElementDefinition, type StylesheetJson } from "cytoscape";
import { useEffect, useEffectEvent, useRef } from "react";
import { Icon } from "@/components/icons";
import { GraphIcon } from "../echo-entries";
import type { graphProjection } from "./graph-model";
import styles from "./graph.module.css";

const orbit = [[-130, -110], [119, -123], [-163, 2], [151, -5], [-113, 112], [118, 118], [8, 161]];

function nodeMaterial(light: string, body: string, shade: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
    <defs>
      <radialGradient id="face" cx=".31" cy=".27" r=".78">
        <stop stop-color="${light}"/><stop offset=".62" stop-color="${body}"/><stop offset="1" stop-color="${shade}"/>
      </radialGradient>
      <linearGradient id="rim" x2=".24" y2="1">
        <stop stop-color="#fff5ef" stop-opacity=".7"/><stop offset=".56" stop-color="#fff5ef" stop-opacity=".13"/>
        <stop offset="1" stop-color="#4c3043" stop-opacity=".28"/>
      </linearGradient>
      <filter id="lift" x="0" y="0" width="100" height="100" filterUnits="userSpaceOnUse">
        <feDropShadow dx="1" dy="3" stdDeviation="4" flood-color="#312a36" flood-opacity=".24"/>
      </filter>
    </defs>
    <circle cx="50" cy="50" r="34.7" fill="url(#face)" filter="url(#lift)"/>
    <circle cx="50" cy="50" r="32.6" fill="none" stroke="url(#rim)" stroke-width="2.1"/>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const materials: Record<string, string> = {
  person: nodeMaterial("#e4becd", "#aa7790", "#865a74"),
  place: nodeMaterial("#dbcedd", "#9f8ba7", "#786781"),
  event: nodeMaterial("#ebcfc2", "#bc938c", "#906b69"),
  concept: nodeMaterial("#d9d3e4", "#a097b6", "#776b91"),
  project: nodeMaterial("#e3d5b9", "#aa9a7d", "#83765e"),
  other: nodeMaterial("#e2ced9", "#ad92a2", "#876b7e"),
};
const hubMaterial = nodeMaterial("#d8adbf", "#9b6984", "#71435f");

function graphStyle(element: HTMLElement): StylesheetJson {
  const { mode, designTheme } = document.documentElement.dataset;
  const dark = mode === "dark";
  const vintageDark = dark && designTheme === "vintage";
  const theme = getComputedStyle(element);
  const ink = vintageDark ? theme.getPropertyValue("--text-primary").trim() : dark ? "#f6eaf2" : "#382531";
  const surface = vintageDark ? theme.getPropertyValue("--surface-raised").trim() : dark ? "#483b46" : "#fbf7f6";
  const accent = vintageDark ? theme.getPropertyValue("--accent-primary").trim() : dark ? "#e6afcc" : "#814862";
  const thread = vintageDark ? theme.getPropertyValue("--text-tertiary").trim() : dark ? "#bf9aae" : "#8e657c";
  return [
    { selector: "node", style: {
      label: "data(name)", width: 25, height: 25, "background-color": "#a98a9d", "background-opacity": .07,
      "background-image": "data(material)", "background-width": "144%", "background-height": "144%",
      "background-clip": "none", "bounds-expansion": 6, "font-family": "system-ui, sans-serif",
      "font-size": 14, "font-weight": 500, color: ink, "text-valign": "bottom", "text-margin-y": 6,
      "text-wrap": "ellipsis", "text-max-width": "125px", "text-background-color": surface,
      "text-background-opacity": .84, "text-background-padding": "5px", "text-background-shape": "roundrectangle",
      "min-zoomed-font-size": 8,
    } },
    { selector: "node.hub", style: { width: 46, height: 46, "background-image": hubMaterial, "font-size": 15 } },
    { selector: "node.focused", style: {
      "outline-width": 1.5, "outline-offset": 3, "outline-color": accent, "outline-opacity": .82,
      "border-width": 1.4, "border-color": dark ? "#f7dce8" : "#fff8f4",
      "underlay-color": accent, "underlay-opacity": .13, "underlay-padding": 8, "underlay-shape": "ellipse",
    } },
    { selector: "edge", style: {
      width: 1.4, "curve-style": "unbundled-bezier", "control-point-distances": "data(bend)", "control-point-weights": .48,
      "line-color": thread, "line-opacity": .75,
      "target-arrow-shape": "triangle", "target-arrow-color": thread, "arrow-scale": .83, opacity: .64,
    } },
    { selector: "edge.historical", style: { "line-style": "dashed" } },
    { selector: "edge.focused, edge.hovered", style: { width: 2, opacity: .94, "line-color": accent, "target-arrow-color": accent } },
    { selector: "edge.chosen", style: { width: 2.8, opacity: 1, "line-opacity": 1, "line-color": accent, "target-arrow-color": accent, "arrow-scale": .94 } },
    { selector: ".dimmed", style: { opacity: .25 } },
  ];
}

type Props = {
  graph: ReturnType<typeof graphProjection>; focused: string | null; selectedFact: string | null;
  ego: boolean; english: boolean; resetVersion: number; onEgo: () => void; onEntity: (id: string) => void; onFact: (id: string) => void;
};

export function GraphCanvas({ graph, focused, selectedFact, ego, english, resetVersion, onEgo, onEntity, onFact }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<Core | null>(null);
  const lastReset = useRef(resetVersion);
  const selectEntity = useEffectEvent(onEntity);
  const selectFact = useEffectEvent(onFact);

  useEffect(() => {
    const element = container.current!;
    const cy = cytoscape({
      container: element, layout: { name: "preset", fit: false }, style: graphStyle(element),
      minZoom: .35, maxZoom: 2.5, boxSelectionEnabled: false, autounselectify: true,
    });
    instance.current = cy;
    cy.on("tap", "node", event => selectEntity(event.target.id()));
    cy.on("tap", "edge", event => selectFact(event.target.id()));
    cy.on("mouseover mouseout", "node, edge", event => {
      element.style.cursor = event.type === "mouseover" ? "pointer" : "";
      event.target.toggleClass("hovered", event.type === "mouseover");
    });
    const resize = new ResizeObserver(() => cy.resize());
    resize.observe(element);
    const theme = new MutationObserver(() => cy.style(graphStyle(element)));
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode", "data-design-theme"] });
    return () => {
      resize.disconnect();
      theme.disconnect();
      cy.destroy();
      instance.current = null;
    };
  }, []);

  useEffect(() => {
    const cy = instance.current;
    if (!cy) return;
    const elements: ElementDefinition[] = graph.nodes.map((entity, index) => {
      const [x, y] = index === 0 ? [0, 0] : orbit[index - 1];
      return {
        data: { id: entity.id, name: entity.canonicalName, material: materials[entity.entityType] ?? materials.other },
        position: { x: x * (cy.width() > 600 ? 1.65 : 1), y }, classes: index === 0 ? "hub" : "",
      };
    });
    elements.push(...graph.edges.map((fact, index) => ({
      data: { id: fact.id, source: fact.subjectEntityId, target: fact.objectEntityId!, bend: (index % 2 ? -1 : 1) * (12 + index % 4 * 5) },
      classes: fact.status === "invalidated" ? "historical" : "",
    })));
    const previous = new Map(cy.nodes().map(node => [node.id(), node.position()]));
    const sameNodes = lastReset.current === resetVersion && previous.size === graph.nodes.length && graph.nodes.every(node => previous.has(node.id));
    lastReset.current = resetVersion;
    if (sameNodes) for (const element of elements) {
      if (element.position) element.position = previous.get(element.data.id!) ?? element.position;
    }
    cy.batch(() => { cy.elements().remove(); cy.add(elements); });
    if (elements.length && !sameNodes) cy.fit(undefined, 28);
  }, [graph, resetVersion]);

  useEffect(() => {
    const cy = instance.current;
    if (!cy) return;
    cy.elements().removeClass("focused chosen dimmed");
    if (focused) {
      const node = cy.getElementById(focused);
      const context = node.closedNeighborhood();
      if (context.nonempty()) cy.elements().difference(context).addClass("dimmed");
      node.addClass("focused");
      node.connectedEdges().addClass("focused");
    }
    if (selectedFact) {
      const edge = cy.getElementById(selectedFact).edges();
      if (edge.nonempty()) {
        cy.edges().difference(edge).addClass("dimmed");
        edge.removeClass("dimmed").addClass("chosen");
        edge.connectedNodes().removeClass("dimmed");
      }
    }
  }, [graph, focused, selectedFact, resetVersion]);

  function zoom(factor: number) {
    const cy = instance.current;
    if (cy) cy.zoom({ level: Math.max(cy.minZoom(), Math.min(cy.maxZoom(), cy.zoom() * factor)), renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  }
  function fit() {
    const cy = instance.current;
    if (cy?.elements().nonempty()) cy.fit(undefined, 28);
  }
  const tr = (en: string, zh: string) => english ? en : zh;
  return <section className={styles.map} aria-label={tr("Relationship map", "关系地图")}>
    <div className={styles.mapStage}>
      <div ref={container} className={styles.canvas} aria-hidden="true" data-graph-canvas/>
      {!graph.nodes.length && <p className={styles.mapEmpty}>{tr("No entities in this view.", "当前视图没有实体。")}</p>}
      {graph.nodes.length > 0 && <div className={styles.mapTools}>
        <button type="button" aria-label={tr("Ego view", "单点关系视图")} aria-pressed={ego} onClick={onEgo}><GraphIcon/></button>
        <div>
          <button type="button" aria-label={tr("Zoom in", "放大")} onClick={() => zoom(1.22)}><Icon name="plus"/></button>
          <button type="button" aria-label={tr("Zoom out", "缩小")} onClick={() => zoom(1 / 1.22)}>−</button>
          <button type="button" aria-label={tr("Fit graph", "适应画布")} onClick={fit}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M3 7V3h4m6 0h4v4m0 6v4h-4m-6 0H3v-4"/></svg>
          </button>
        </div>
      </div>}
    </div>
    <div className={styles.mapFoot}>
      <span>{ego ? tr("Direct connections", "直接关联") : tr("Local view", "局部视图")}</span>
      <span>{graph.nodes.length > 0 && (graph.edges.length
        ? tr("Drag to explore · Pinch to zoom", "拖动探索 · 双指缩放")
        : tr("No links between these entities", "这些实体之间暂无连线"))}</span>
    </div>
  </section>;
}
