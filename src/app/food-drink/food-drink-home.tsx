"use client";
import { useDataRefresh } from "@/components/use-data-refresh";
import { PageLogAction } from "@/components/bottom-log";

import Link from "next/link";
import {FoodDrinkHomeView} from "@/components/food-drink-home-view";
import type {FoodDrinkHomeData} from "@/lib/food-drink-insights";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { FormSheet } from "@/components/form-sheet";
import { dateInEvaOrbit } from "@/lib/time";
import type { DrinkLog, FoodLog, DrinkLimit } from "@/lib/types";
import { FoodRecordEditor } from "../food/food-record-editor";
import { DrinkRecordEditor } from "../drinks/drink-ui";
import { LimitEditor } from "./limit-editor";
import styles from "./food-drink.module.css";

type Editor = { kind: "choose" } | { kind: "food"; record?: FoodLog } | { kind: "drink"; record?: DrinkLog } | null;

export function FoodDrinkHome({ initialRecord }: { initialRecord?: "food" | "drink" }) {


  const [data, setData] = useState<FoodDrinkHomeData | null>(null);
  const [editor, setEditor] = useState<Editor>(initialRecord ? { kind: initialRecord } : null);
  const [limitEditor, setLimitEditor] = useState<DrinkLimit | "new" | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/food-drink/home", { signal });
      if (!response.ok) throw new Error("饮食简报加载失败，请重试");
      const next = await response.json() as FoodDrinkHomeData;
      if (!signal?.aborted) setData(next);
    } catch (reason) { if (!signal?.aborted) setError(reason instanceof Error ? reason.message : "饮食简报加载失败"); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useDataRefresh("/food-drink", () => load());
  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => void load(controller.signal), 0); return () => { clearTimeout(timer); controller.abort(); }; }, [load]);
  return <><FoodDrinkHomeView data={data} loading={loading} error={error} onRetry={()=>void load()} onRecord={setEditor} onLimit={setLimitEditor} LinkComponent={Link} action={<PageLogAction label="Add record" className="button primary" onClick={()=>setEditor({kind:"choose"})}><Icon name="plus"/>新增记录</PageLogAction>}/>
    {limitEditor && <LimitEditor limit={limitEditor === "new" ? undefined : limitEditor} onClose={() => setLimitEditor(null)} onSaved={load} />}
    {editor?.kind === "choose" && <FormSheet title="新增记录" onClose={() => setEditor(null)}><div className={styles.recordChoices}><button onClick={() => setEditor({ kind: "food" })}><Icon name="food" /><span><strong>Record food</strong><small>记录一餐、加餐或包装食品</small></span></button><button onClick={() => setEditor({ kind: "drink" })}><Icon name="drink" /><span><strong>Record drink</strong><small>记录饮品、糖度、冷热与容量</small></span></button></div></FormSheet>}
    {editor?.kind === "food" && <FoodRecordEditor date={data?.date ?? dateInEvaOrbit()} record={editor.record} onClose={() => setEditor(null)} onSaved={load} onDeleted={load} />}
    {editor?.kind === "drink" && <DrinkRecordEditor initialDate={data?.date ?? dateInEvaOrbit()} record={editor.record} onClose={() => setEditor(null)} onSaved={load} onDeleted={load} />}
  </>;
}
