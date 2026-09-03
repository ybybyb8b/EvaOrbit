import type { Metadata } from "next";
import { FoodPlaceDetailView } from "./food-place-detail-view";
export const metadata:Metadata={title:"店铺详情"};
export default async function FoodPlacePage({params}:{params:Promise<{id:string}>}){const{id}=await params;return <FoodPlaceDetailView id={Number(id)}/>;}
