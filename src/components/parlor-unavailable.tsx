"use client";
import type {ReactNode} from "react";
import {useLocale} from "./locale-controller";

export function ParlorUnavailable({back}:{back?:ReactNode}) {
  const {english}=useLocale();
  return <section className="settings-page">{back}<header className="page-header"><h1>Parlor</h1></header><p>{english?"Update Host to open Parlor":"更新 Host 后使用 Parlor"}</p></section>;
}
