import {redirect} from "next/navigation";
// Keep old bookmarks pointed at the single Parlor settings destination.
export default function AiConnectionPage(){redirect("/ai/settings");}
