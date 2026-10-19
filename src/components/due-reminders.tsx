"use client";
import Link from "next/link";
import type { ComponentProps } from "react";
import { DueRemindersView } from "./due-reminders-view";
export function DueReminders(props:Omit<ComponentProps<typeof DueRemindersView>,"LinkComponent">){return <DueRemindersView {...props} LinkComponent={Link}/>;}
