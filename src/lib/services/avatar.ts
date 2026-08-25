import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { allowedEmail, usesSupabase } from "../config";
import { getRepository } from "../repositories";
import { createSupabaseServerClient } from "../supabase/server";
import type { AvatarType, ChatPreferences } from "../types";
import { ValidationError } from "../validation";
import { detectAvatarImage, MAX_AVATAR_BYTES } from "../avatar";

export type AvatarSubject = "user" | "assistant";

function preferences(settings: ChatPreferences): ChatPreferences {
  return {
    userDisplayName: settings.userDisplayName, userAvatarType: settings.userAvatarType, userAvatarValue: settings.userAvatarValue,
    assistantDisplayName: settings.assistantDisplayName, assistantAvatarType: settings.assistantAvatarType, assistantAvatarValue: settings.assistantAvatarValue,
    showUserName: settings.showUserName, showAssistantName: settings.showAssistantName, showAvatars: settings.showAvatars,
  };
}

function avatarFields(subject: AvatarSubject, type: AvatarType, value: string, current: ChatPreferences): ChatPreferences {
  return subject === "user"
    ? { ...preferences(current), userAvatarType: type, userAvatarValue: value }
    : { ...preferences(current), assistantAvatarType: type, assistantAvatarValue: value };
}

function localAvatarDirectory() {
  return path.resolve(/* turbopackIgnore: true */ process.env.EVAORBIT_AVATAR_DIR || path.join(process.cwd(), "data", "avatars"));
}

function localAvatarPath(subject: AvatarSubject, extension: string) {
  const directory = localAvatarDirectory();
  const target = path.resolve(directory, `${subject}.${extension}`);
  if (path.dirname(target) !== directory) throw new Error("头像路径不安全");
  return { directory, target };
}

async function cloudIdentity() {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.getClaims();
  if (error) throw new Error(`验证头像访问失败：${error.message}`);
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : "";
  const email = typeof data?.claims?.email === "string" ? data.claims.email.toLocaleLowerCase() : "";
  if (!userId || !allowedEmail() || email !== allowedEmail()) throw new Error("当前账户无权访问头像");
  return { client, userId };
}

function storedAvatar(settings: ChatPreferences, subject: AvatarSubject) {
  return subject === "user"
    ? { type: settings.userAvatarType, extension: settings.userAvatarValue }
    : { type: settings.assistantAvatarType, extension: settings.assistantAvatarValue };
}

export async function saveAvatar(subject: AvatarSubject, file: File) {
  if (file.size <= 0 || file.size > MAX_AVATAR_BYTES) throw new ValidationError("头像文件必须小于 4 MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = detectAvatarImage(bytes);
  if (!kind) throw new ValidationError("头像只接受真实的 JPG、PNG 或 WebP 图片");
  const repository = await getRepository();
  const current = await repository.getAiSettings();
  const previous = storedAvatar(current, subject);
  if (usesSupabase()) {
    const { client, userId } = await cloudIdentity();
    const objectPath = `${userId}/${subject}.${kind.extension}`;
    const { error } = await client.storage.from("avatars").upload(objectPath, bytes, { contentType: kind.mime, upsert: true, cacheControl: "300" });
    if (error) throw new Error(`上传头像失败：${error.message}`);
    if (previous.type === "image" && previous.extension && previous.extension !== kind.extension) await client.storage.from("avatars").remove([`${userId}/${subject}.${previous.extension}`]);
  } else {
    const { directory, target } = localAvatarPath(subject, kind.extension);
    await fs.mkdir(directory, { recursive: true });
    const temporary = `${target}.uploading`;
    await fs.writeFile(temporary, bytes, { flag: "w" });
    await fs.rm(target, { force: true });
    await fs.rename(temporary, target);
    if (previous.type === "image" && previous.extension && previous.extension !== kind.extension) await fs.rm(localAvatarPath(subject, previous.extension).target, { force: true });
  }
  return repository.updateChatPreferences(avatarFields(subject, "image", kind.extension, current));
}

export async function readAvatar(subject: AvatarSubject) {
  const settings = await (await getRepository()).getAiSettings();
  const stored = storedAvatar(settings, subject);
  if (stored.type !== "image" || !["jpg", "png", "webp"].includes(stored.extension)) return null;
  const mime = stored.extension === "jpg" ? "image/jpeg" : `image/${stored.extension}`;
  if (usesSupabase()) {
    const { client, userId } = await cloudIdentity();
    const { data, error } = await client.storage.from("avatars").download(`${userId}/${subject}.${stored.extension}`);
    if (error || !data) return null;
    return { bytes: new Uint8Array(await data.arrayBuffer()), mime };
  }
  try { return { bytes: new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ localAvatarPath(subject, stored.extension).target)), mime }; }
  catch { return null; }
}

export async function resetAvatar(subject: AvatarSubject) {
  const repository = await getRepository();
  const current = await repository.getAiSettings();
  const stored = storedAvatar(current, subject);
  if (stored.type === "image" && ["jpg", "png", "webp"].includes(stored.extension)) {
    if (usesSupabase()) {
      const { client, userId } = await cloudIdentity();
      await client.storage.from("avatars").remove([`${userId}/${subject}.${stored.extension}`]);
    } else {
      await fs.rm(localAvatarPath(subject, stored.extension).target, { force: true });
    }
  }
  return repository.updateChatPreferences(avatarFields(subject, "default", "", current));
}
