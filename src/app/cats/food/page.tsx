import type { Metadata } from "next";
import { listCatFood } from "@/lib/services/cat-food";
import { CatFoodLibraryView } from "./cat-food-library-view";
export const metadata: Metadata = { title: "Cat Food Library" };
export const dynamic = "force-dynamic";
export default async function CatFoodPage() { return <CatFoodLibraryView initialItems={await listCatFood()}/>; }
