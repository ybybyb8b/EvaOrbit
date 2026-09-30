import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCatFoodDetail } from "@/lib/services/cat-food";
import { CatFoodDetailView } from "./cat-food-detail-view";
export const metadata: Metadata = { title: "Cat Food" };
export const dynamic = "force-dynamic";
export default async function CatFoodDetailPage({ params }: { params: Promise<{ id: string }> }) { const id = Number((await params).id); if (!Number.isSafeInteger(id) || id <= 0) notFound(); const item = await getCatFoodDetail(id); if (!item) notFound(); return <CatFoodDetailView initialItem={item}/>; }
