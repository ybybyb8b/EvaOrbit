"use client";
import { Disclosure } from "./disclosure";
import type {ReactNode} from "react";
import {useLocale} from "./locale-controller";
import styles from "./development-details.module.css";

export function DevelopmentDetails({children,title}:{children:ReactNode;title?:string}){
  const {english}=useLocale();
  return <Disclosure className={styles.details} title={<>{title??(english?"Development info":"开发说明")}</>}><div className={styles.content}>{children}</div></Disclosure>;
}
