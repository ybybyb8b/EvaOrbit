"use client";

import { createIcon } from "reicon-react";
import type { HermesMessage } from "@/lib/hermes";
import { Disclosure } from "./disclosure";
import styles from "./hermes-chat.module.css";

const Wrench = createIcon("Wrench", {
  O: '<path d="M21 7a6 6 0 0 1-7.7 7.2L6.5 21a2.5 2.5 0 0 1-3.5-3.5l6.8-6.8A6 6 0 0 1 17 3l-3.5 3.5L14.2 9.8l3.3.7L21 7Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
});

export function HermesToolActivity({ message, english }: { message: HermesMessage; english: boolean }) {
  const activity = message.presentation?.toolActivity;
  if (!activity || activity.attemptId !== message.attempt_id) return null;
  const remaining = activity.total - activity.tools.reduce((count, tool) => count + tool.count, 0);
  const running = message.status === "received" || message.status === "processing";
  const state = running && activity.running > 0 ? (english ? `${activity.running} running` : `${activity.running} 项执行中`)
    : message.status === "interrupted" ? (english ? "Interrupted" : "已中断")
      : activity.failed > 0 ? (english ? `${activity.failed} failed` : `${activity.failed} 项异常`) : undefined;
  return <Disclosure className={styles.toolActivity}
    title={<><Wrench className="icon vintage-reicon" weight="Outline" aria-hidden="true" />{english ? `${activity.total} tool ${activity.total === 1 ? "call" : "calls"}` : `调用了 ${activity.total} 次工具`}</>}
    trailing={state}>
    <ul>{activity.tools.map(tool => <li key={tool.name}><code data-no-translate translate="no">{tool.name}</code><span>×{tool.count}</span></li>)}</ul>
    {remaining > 0 && <p>{english ? `${remaining} more calls` : `另有 ${remaining} 次调用`}</p>}
  </Disclosure>;
}
