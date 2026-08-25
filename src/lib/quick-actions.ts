import type { IconName } from "@/components/icons";
export type QuickAction={id:string;href:string;label:string;description:string;icon:IconName};
export const defaultQuickActions:QuickAction[]=[
  {id:"think",href:"/ai",label:"想想",description:"聊、查、记、分析",icon:"spark"},
  {id:"task",href:"/tasks?new=1",label:"记个待办",description:"只写事情和时间",icon:"tasks"},
  {id:"memory",href:"/memory?new=1",label:"留下来",description:"以后还找得回来",icon:"memory"},
  {id:"inbox",href:"/inbox",label:"先记一下",description:"不用整理，先丢进去",icon:"inbox"},
  {id:"food",href:"/food",label:"饮食",description:"看看今天吃过什么",icon:"food"},
  {id:"drink",href:"/drinks",label:"饮品",description:"喝过的和当前限制",icon:"drink"},
];
