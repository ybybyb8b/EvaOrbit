"use client";
import { useState } from "react";
import styles from "../personal-widget-stack.module.css";

/** Shared icon slot; modules can supply their own image without changing card layout. */
export function WidgetIcon({ image, avatar=false }: { image?:string; avatar?:boolean }) {
  const [failed,setFailed]=useState<string>();
  if(!image || failed === image)return null;
  return <span className={styles.widgetIcon} data-avatar={avatar} aria-hidden="true">
    {/* eslint-disable-next-line @next/next/no-img-element -- Also renders account-scoped local data URLs. */}
    <img src={image} alt="" onError={() => setFailed(image)}/></span>;
}
