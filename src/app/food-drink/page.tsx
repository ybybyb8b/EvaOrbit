import type { Metadata } from "next";
import { FoodDrinkHome } from "./food-drink-home";

export const metadata: Metadata = { title: "Food & Drink" };
export default function FoodDrinkPage() { return <FoodDrinkHome />; }
