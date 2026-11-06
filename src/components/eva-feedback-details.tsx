"use client";
import { useState } from "react";
import type { EvaJob } from "@/lib/eva";
import { evaDeliveryText, evaFailureTitle } from "@/lib/eva-feedback";
import { useLocale } from "./locale-controller";
import { Disclosure } from "./disclosure";
import styles from "./eva-activity.module.css";

export function EvaFeedbackDetails({ job }: { job: EvaJob }) {
  const { english } = useLocale(), [copied, setCopied] = useState(false);
  const f = job.feedback;
  const t = (en: string, zh: string) => english ? en : zh;
  const stages = { configuration: t("Configuration", "读取模型配置"), request: t("Sending model request", "发起模型请求"), response: t("Model API response", "模型接口响应"), parse: t("Reading reply", "解析回复"), validation: t("Validating reply", "校验回复"), save: t("Saving result", "保存结果") };
  return <section className={styles.receipt}>
    <p>{evaDeliveryText(job, english)}</p>
    {job.status === "failed" && <p role="alert"><strong>{evaFailureTitle(f, english)}</strong></p>}
    {f?.failure && <p>{f.failure.message}</p>}
    {!f && job.status === "failed" && <p>{t("This older attempt has no detailed diagnostic. Retrying will record the exact failure stage.", "这次旧尝试没有详细诊断。再次处理时会记录具体失败阶段。")}</p>}
    {f && <Disclosure title={t("Request details", "请求详情")} defaultOpen={Boolean(f.failure)}>
      <dl className={styles.diagnostics}>
        <dt>{t("Stage", "阶段")}</dt><dd>{stages[f.stage]}</dd>
        {f.provider && <><dt>Provider</dt><dd>{f.provider}</dd></>}
        {f.model && <><dt>{t("Model", "模型")}</dt><dd>{f.model}</dd></>}
        {f.requestStartedAt && <><dt>{t("Request started", "发起请求")}</dt><dd>{new Date(f.requestStartedAt).toLocaleString(english ? "en-US" : "zh-CN")}</dd></>}
        {f.respondedAt && <><dt>{t("API responded", "接口响应")}</dt><dd>{new Date(f.respondedAt).toLocaleString(english ? "en-US" : "zh-CN")}</dd></>}
        {f.httpStatus && <><dt>HTTP</dt><dd>{f.httpStatus}</dd></>}
        {f.requestId && <><dt>Request ID</dt><dd>{f.requestId}</dd></>}
        {f.failure && <><dt>{t("Error code", "错误代码")}</dt><dd>{f.failure.code}</dd></>}
        {f.failure?.databaseCode && <><dt>{t("Database code", "数据库代码")}</dt><dd>{f.failure.databaseCode}</dd></>}
      </dl>
      <button className="text-button" type="button" onClick={() => { void navigator.clipboard?.writeText(JSON.stringify({ paperId: job.id, ...f }, null, 2)).then(() => setCopied(true)).catch(() => setCopied(false)); }}>{copied ? t("Copied", "已复制") : t("Copy diagnostic", "复制诊断信息")}</button>
    </Disclosure>}
  </section>;
}
