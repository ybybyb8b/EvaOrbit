import type { IconName } from "@/components/icons";
export type QuickAction={id:string;href:string;label:string;description:string;icon:IconName};
export const defaultQuickActions:QuickAction[]=[
  {id:"inbox",href:"/inbox",label:"先记一下",description:"不用整理，先丢进去",icon:"inbox"},
  {id:"food",href:"/food",label:"记饮食",description:"吃过什么，先留下",icon:"food"},
  {id:"drink",href:"/drinks",label:"记饮品",description:"咖啡奶茶和其他",icon:"drink"},
  {id:"tracker",href:"/trackers",label:"Trackers",description:"低摩擦记录生活事件",icon:"tracker"},
  {id:"cats",href:"/cats",label:"猫咪",description:"健康与家庭照护",icon:"cats"},
  {id:"media",href:"/media",label:"Media",description:"已经看完的作品",icon:"media"},
];
