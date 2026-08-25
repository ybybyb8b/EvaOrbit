import type { Metadata } from "next";
import { FoodLibraryView } from "./food-library-view";

export const metadata: Metadata = { title: "Food Library" };
export default function FoodLibraryPage() { return <FoodLibraryView />; }
