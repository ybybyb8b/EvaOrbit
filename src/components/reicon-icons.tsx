import { Home, Checklist, Folder, NoteText, Sparkles, Settings, Plus, Search, Trash, Edit2, Check, Star, Lightbulb, History, ChevronDown, CloseCircle, ArrowRight, InboxIn, Plate, ChefHat, MapPoint, Book2, Pet, Bone, FoodTray, Cookie, PillJar, CupHot, Chart2, Cat, Users, Clapperboard, Notebook, ChatRoundDots, More, Bell, Calendar, HeartPulse, WalletMoney } from "reicon-react";
import type { IconName } from "./icons";

/** One distinct module symbol, reused consistently in menus, headings and navigation. */
export const vintageIcons = {
  home: Home, tasks: Checklist, projects: Folder, memory: NoteText, ai: Sparkles,
  settings: Settings, plus: Plus, search: Search, trash: Trash, edit: Edit2, check: Check,
  spark: Star, insights: Lightbulb, history: History, chevronDown: ChevronDown,
  close: CloseCircle, arrow: ArrowRight, inbox: InboxIn, food: Plate, foodDrink: ChefHat,
  foodPlaces: MapPoint, foodLibrary: Book2, catFood: Pet, catFoodDry: Bone,
  catFoodWet: FoodTray, catFoodTreat: Cookie, catFoodSupplement: PillJar,
  drink: CupHot, tracker: Chart2, cats: Cat, people: Users, media: Clapperboard,
  chronicle: Notebook, lucius: ChatRoundDots, more: More, notifications: Bell,
  calendar: Calendar, health: HeartPulse, subscriptions: WalletMoney,
} satisfies Record<IconName | "subscriptions", typeof Home>;

export function ReiconGlyph({name,className="icon vintage-reicon"}:{name:keyof typeof vintageIcons;className?:string}) {
  const Glyph=vintageIcons[name];
  return <Glyph className={className} data-reicon={name} weight="Outline" aria-hidden="true"/>;
}
