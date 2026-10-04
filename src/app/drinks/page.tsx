import { redirect } from "next/navigation";

// Preserve old bookmarks while removing the separate insights/settings page.
export default function DrinksPage() { redirect("/food-drink"); }
