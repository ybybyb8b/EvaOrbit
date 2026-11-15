"use client";
import type {ReactNode} from "react";
import {useLocale} from "./locale-controller";

export function ParlorUnavailable({back}:{back?:ReactNode}) {
  const {english}=useLocale();
  return <section className="settings-page">{back}<header className="page-header"><h1>Parlor</h1></header><p>{english?"Parlor requires the updated local Native Host.":"Parlor 需要新版的本地 Native Host。"}</p><p>{english?"Install the Native test build to configure your model and chat directly on this device.":"请安装 Native 测试版，再配置本机模型并直接聊天。"}</p></section>;
}
