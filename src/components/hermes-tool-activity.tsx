"use client";

import type { HermesMessage } from "@/lib/hermes";
import { Disclosure } from "./disclosure";
import styles from "./hermes-chat.module.css";

export function HermesToolActivity({ message, english }: { message: HermesMessage; english: boolean }) {
  const activity = message.presentation?.toolActivity;
  if (!activity || activity.attemptId !== message.attempt_id) return null;
  const remaining = activity.total - activity.tools.reduce((count, tool) => count + tool.count, 0);
  const running = message.status === "received" || message.status === "processing";
  const state = running && activity.running > 0 ? (english ? `${activity.running} running` : `${activity.running} 项执行中`)
    : message.status === "interrupted" ? (english ? "Interrupted" : "已中断")
      : activity.failed > 0 ? (english ? `${activity.failed} failed` : `${activity.failed} 项异常`) : undefined;
  return <Disclosure className={styles.toolActivity}
    title={english ? `Tool activity · ${activity.total}` : `工具执行 · ${activity.total} 次`}
    trailing={state}>
    <ul>{activity.tools.map(tool => <li key={tool.name}><code data-no-translate translate="no">{tool.name}</code><span>×{tool.count}</span></li>)}</ul>
    {remaining > 0 && <p>{english ? `${remaining} more calls` : `另有 ${remaining} 次调用`}</p>}
  </Disclosure>;
}
