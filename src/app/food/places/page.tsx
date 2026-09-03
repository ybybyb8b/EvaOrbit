import type { Metadata } from "next";
import { FoodPlacesView } from "./places-view";
export const metadata:Metadata={title:"店铺库"};
export default function FoodPlacesPage(){return <FoodPlacesView/>;}
