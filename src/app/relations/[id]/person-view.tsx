"use client";
import {useRouter} from "next/navigation";
import type {ComponentProps} from "react";
import {RelationPersonContent} from "./person-content";
export function RelationPersonView(props:Omit<ComponentProps<typeof RelationPersonContent>,"navigate">){const router=useRouter();return <RelationPersonContent {...props} navigate={path=>router.push(path)}/>;}
