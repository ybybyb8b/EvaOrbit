import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { detectAvatarImage, MAX_AVATAR_BYTES } from "../avatar";
import { isAllowedAccountEmail, usesSupabase } from "../config";
import { getRepository } from "../repositories";
import { createSupabaseServerClient } from "../supabase/server";
import { validSubscriptionIconKey as validSoftwareLibraryIconKey } from "../subscription-icon";
import { ValidationError } from "../validation";

function localPath(id: number, key: string) {
  if (!Number.isSafeInteger(id) || id <= 0 || !validSoftwareLibraryIconKey(key)) throw new ValidationError("软件图标路径无效");
  const directory = path.resolve(/* turbopackIgnore: true */ process.env.EVAORBIT_SOFTWARE_ICON_DIR || path.join(process.cwd(), "data", "software-icons"), String(id));
  return { directory, target: path.join(directory, key) };
}

async function cloudIdentity() {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : "";
  const email = typeof data?.claims?.email === "string" ? data.claims.email.toLowerCase() : "";
  if (error || !userId || !isAllowedAccountEmail(email)) throw new Error("当前账户无权访问软件图标");
  return { client, userId };
}

export async function removeSoftwareLibraryImage(id: number, key: string) {
  if (!validSoftwareLibraryIconKey(key)) return;
  if (usesSupabase()) {
    const { client, userId } = await cloudIdentity();
    const { error } = await client.storage.from("avatars").remove([`${userId}/software-library/${id}/${key}`]);
    if (error) throw new Error("清理软件图标失败");
  } else await fs.rm(localPath(id, key).target, { force: true });
}

export async function saveSoftwareLibraryIcon(id: number, file: File) {
  if (file.size <= 0 || file.size > MAX_AVATAR_BYTES) throw new ValidationError("软件图标必须大于 0 且不超过 4 MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = detectAvatarImage(bytes);
  if (!kind) throw new ValidationError("软件图标只接受 JPG、PNG 或 WebP 图片");
  const repository = await getRepository();
  const item = await repository.getSoftwareLibraryEntry(id);
  if (!item) return null;
  const key = `${randomUUID()}.${kind.extension}`;
  if (usesSupabase()) {
    const { client, userId } = await cloudIdentity();
    const { error } = await client.storage.from("avatars").upload(`${userId}/software-library/${id}/${key}`, bytes, { contentType: kind.mime, cacheControl: "31536000", upsert: false });
    if (error) throw new Error("上传软件图标失败");
  } else {
    const { directory, target } = localPath(id, key);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(target, bytes, { flag: "wx" });
  }
  let updated;
  try {
    updated = await repository.setSoftwareLibraryIcon(id, key);
    if (!updated) { await removeSoftwareLibraryImage(id, key); return null; }
  } catch (error) {
    // A cloud response can fail after the metadata commit. Keep a possibly active image.
    const current = await repository.getSoftwareLibraryEntry(id).catch(() => undefined);
    if (current !== undefined && current?.iconPath !== key) await removeSoftwareLibraryImage(id, key).catch(() => {});
    throw error;
  }
  // Metadata now points at the new image; cleanup failure must not invalidate that save.
  if (item.iconPath) await removeSoftwareLibraryImage(id, item.iconPath).catch(error => console.warn("Old software icon cleanup failed", error));
  return updated;
}

export async function readSoftwareLibraryIcon(id: number, version: string | null) {
  const item = await (await getRepository()).getSoftwareLibraryEntry(id);
  const key = item?.iconPath;
  if (!key || !validSoftwareLibraryIconKey(key) || (version !== null && version !== key)) return null;
  const extension = key.split(".").pop();
  const mime = extension === "jpg" ? "image/jpeg" : `image/${extension}`;
  if (usesSupabase()) {
    const { client, userId } = await cloudIdentity();
    const { data, error } = await client.storage.from("avatars").download(`${userId}/software-library/${id}/${key}`);
    if (error || !data) return null;
    return { bytes: new Uint8Array(await data.arrayBuffer()), mime };
  }
  try { return { bytes: new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ localPath(id, key).target)), mime }; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

export async function resetSoftwareLibraryIcon(id: number) {
  const repository = await getRepository();
  const item = await repository.getSoftwareLibraryEntry(id);
  if (!item) return null;
  const updated = await repository.setSoftwareLibraryIcon(id, "");
  if (updated && item.iconPath) await removeSoftwareLibraryImage(id, item.iconPath).catch(error => console.warn("Old software icon cleanup failed", error));
  return updated;
}
