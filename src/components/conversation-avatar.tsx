"use client";

import Image from "next/image";
import type { AvatarType } from "@/lib/types";

export function ConversationAvatar({ subject, name, type, value, version = "" }: { subject: "user" | "assistant"; name: string; type: AvatarType; value: string; version?: string }) {
  const initial = Array.from(name.trim())[0] || (subject === "assistant" ? "E" : "我");
  return <span className={`conversation-avatar ${type}`} aria-hidden="true">
    <span className="avatar-fallback">{type === "emoji" ? value : initial.toLocaleUpperCase()}</span>
    {type === "image" && <Image key={`${value}-${version}`} src={`/api/avatars/${subject}?v=${encodeURIComponent(version || value)}`} alt="" width={32} height={32} unoptimized onError={(event) => { event.currentTarget.style.display = "none"; }} />}
  </span>;
}
