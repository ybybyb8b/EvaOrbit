import type { Metadata } from "next";
import { DrinkHistoryView } from "./drink-history-view";

export const metadata:Metadata={title:"Drink History"};
export default function DrinkHistoryPage(){return <DrinkHistoryView/>;}
