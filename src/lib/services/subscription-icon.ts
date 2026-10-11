import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { detectAvatarImage, MAX_AVATAR_BYTES } from "../avatar";
import { allowedEmail, usesSupabase } from "../config";
import { getRepository } from "../repositories";
import { createSupabaseServerClient } from "../supabase/server";
import { validSubscriptionIconKey } from "../subscription-icon";
import { ValidationError } from "../validation";

function localPath(id: number, key: string) {
  if (!Number.isSafeInteger(id) || id <= 0 || !validSubscriptionIconKey(key)) throw new ValidationError("订阅图标路径无效");
  const directory = path.resolve(/* turbopackIgnore: true */ process.env.EVAORBIT_SUBSCRIPTION_ICON_DIR || path.join(process.cwd(), "data", "subscription-icons"), String(id));
  return { directory, target: path.join(directory, key) };
}

async function cloudIdentity() {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : "";
  const email = typeof data?.claims?.email === "string" ? data.claims.email.toLowerCase() : "";
  if (error || !userId || !allowedEmail() || email !== allowedEmail()) throw new Error("当前账户无权访问订阅图标");
  return { client, userId };
}

async function removeImage(id: number, key: string) {
  if (!validSubscriptionIconKey(key)) return;
  if (usesSupabase()) {
    const { client, userId } = await cloudIdentity();
    const { error } = await client.storage.from("avatars").remove([`${userId}/subscriptions/${id}/${key}`]);
    if (error) throw new Error("清理订阅图标失败");
  } else await fs.rm(localPath(id, key).target, { force: true });
}

export async function saveSubscriptionIcon(id: number, file: File) {
  if (file.size <= 0 || file.size > MAX_AVATAR_BYTES) throw new ValidationError("订阅图标必须大于 0 且不超过 4 MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = detectAvatarImage(bytes);
  if (!kind) throw new ValidationError("订阅图标只接受 JPG、PNG 或 WebP 图片");
  const repository = await getRepository();
  const item = await repository.getSubscription(id);
  if (!item) return null;
  const key = `${randomUUID()}.${kind.extension}`;
  if (usesSupabase()) {
    const { client, userId } = await cloudIdentity();
    const { error } = await client.storage.from("avatars").upload(`${userId}/subscriptions/${id}/${key}`, bytes, { contentType: kind.mime, cacheControl: "31536000", upsert: false });
    if (error) throw new Error("上传订阅图标失败");
  } else {
    const { directory, target } = localPath(id, key);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(target, bytes, { flag: "wx" });
  }
  let updated;
  try {
    updated = await repository.updateSubscription(id, { iconPath: key });
    if (!updated) { await removeImage(id, key); return null; }
  } catch (error) {
    // A cloud response can fail after the metadata commit. Keep a possibly active image.
    const current = await repository.getSubscription(id).catch(() => undefined);
    if (current !== undefined && current?.iconPath !== key) await removeImage(id, key).catch(() => {});
    throw error;
  }
  // Metadata now points at the new image; cleanup failure must not invalidate that save.
  if (item.iconPath) await removeImage(id, item.iconPath).catch(error => console.warn("Old subscription icon cleanup failed", error));
  return updated;
}

export async function readSubscriptionIcon(id: number, version: string | null) {
  const item = await (await getRepository()).getSubscription(id);
  const key = item?.iconPath;
  if (!key || !validSubscriptionIconKey(key) || (version !== null && version !== key)) return null;
  const extension = key.split(".").pop();
  const mime = extension === "jpg" ? "image/jpeg" : `image/${extension}`;
  if (usesSupabase()) {
    const { client, userId } = await cloudIdentity();
    const { data, error } = await client.storage.from("avatars").download(`${userId}/subscriptions/${id}/${key}`);
    if (error || !data) return null;
    return { bytes: new Uint8Array(await data.arrayBuffer()), mime };
  }
  try { return { bytes: new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ localPath(id, key).target)), mime }; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

export async function resetSubscriptionIcon(id: number) {
  const repository = await getRepository();
  const item = await repository.getSubscription(id);
  if (!item) return null;
  const updated = await repository.updateSubscription(id, { iconPath: "" });
  if (updated && item.iconPath) await removeImage(id, item.iconPath).catch(error => console.warn("Old subscription icon cleanup failed", error));
  return updated;
}
