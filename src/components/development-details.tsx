"use client";
import type {ReactNode} from "react";
import {useLocale} from "./locale-controller";
import styles from "./development-details.module.css";

export function DevelopmentDetails({children,title}:{children:ReactNode;title?:string}){
  const {english}=useLocale();
  return <details className={styles.details}><summary>{title??(english?"Development info":"开发说明")}</summary><div className={styles.content}>{children}</div></details>;
}
