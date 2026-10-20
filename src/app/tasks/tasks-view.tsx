"use client";
import {useSearchParams} from "next/navigation";
import {TasksContent} from "./tasks-content";
export function TasksView(){return <TasksContent params={useSearchParams()}/>;}
