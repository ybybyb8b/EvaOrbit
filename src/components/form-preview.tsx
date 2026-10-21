"use client";
import {createContext,useContext,type ReactNode} from "react";
import {useLocale} from "./locale-controller";
import {DevelopmentDetails} from "./development-details";
// Preview forms keep the production layout and draft behavior, but never read or write cloud data.
export const FormPreviewContext=createContext(false);
export const useFormPreview=()=>useContext(FormPreviewContext);
export function FormPreviewNotice(){
  const {english}=useLocale();
  return <DevelopmentDetails title={english?"Preview · not saved":"预览 · 不会保存"}><p>{english?"Changes are temporary. Saving, deleting and cloud suggestions are disabled.":"填写内容仅临时保留，不会保存、删除或上传；云端候选查询已关闭。"}</p></DevelopmentDetails>;
}
export function FormPreview({children}:{children:ReactNode}){return <FormPreviewContext.Provider value={true}>{children}</FormPreviewContext.Provider>;}
