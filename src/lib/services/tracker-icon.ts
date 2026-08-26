import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { detectAvatarImage, MAX_AVATAR_BYTES } from "../avatar";
import { allowedEmail, usesSupabase } from "../config";
import { getRepository } from "../repositories";
import { createSupabaseServerClient } from "../supabase/server";
import { ValidationError } from "../validation";

function localIconDirectory() {
  return path.resolve(/* turbopackIgnore: true */ process.env.EVAORBIT_TRACKER_ICON_DIR || path.join(process.cwd(), "data", "tracker-icons"));
}

function localIconPath(trackerId: number, extension: string) {
  const directory = localIconDirectory();
  const target = path.resolve(directory, `${trackerId}.${extension}`);
  if (path.dirname(target) !== directory) throw new Error("Tracker 图片路径不安全");
  return { directory, target };
}

async function cloudIdentity() {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.getClaims();
  if (error) throw new Error("验证 Tracker 图片访问失败");
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : "";
  const email = typeof data?.claims?.email === "string" ? data.claims.email.toLocaleLowerCase() : "";
  if (!userId || !allowedEmail() || email !== allowedEmail()) throw new Error("当前账户无权访问 Tracker 图片");
  return { client, userId };
}

export async function saveTrackerIcon(trackerId: number, file: File) {
  if (file.size <= 0 || file.size > MAX_AVATAR_BYTES) throw new ValidationError("Tracker 图片必须小于 4 MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = detectAvatarImage(bytes);
  if (!kind) throw new ValidationError("Tracker 图片只接受真实的 JPG、PNG 或 WebP");
  const repository = await getRepository();
  const tracker = await repository.getTracker(trackerId);
  if (!tracker) throw new ValidationError("Tracker 不存在");
  if (usesSupabase()) {
    const { client, userId } = await cloudIdentity();
    const objectPath = `${userId}/${trackerId}.${kind.extension}`;
    const { error } = await client.storage.from("tracker-icons").upload(objectPath, bytes, { contentType: kind.mime, upsert: true, cacheControl: "300" });
    if (error) throw new Error("上传 Tracker 图片失败");
    if (tracker.iconType === "image" && tracker.iconValue && tracker.iconValue !== kind.extension) {
      await client.storage.from("tracker-icons").remove([`${userId}/${trackerId}.${tracker.iconValue}`]);
    }
  } else {
    const { directory, target } = localIconPath(trackerId, kind.extension);
    await fs.mkdir(directory, { recursive: true });
    const temporary = `${target}.uploading`;
    await fs.writeFile(temporary, bytes, { flag: "w" });
    await fs.rm(target, { force: true });
    await fs.rename(temporary, target);
    if (tracker.iconType === "image" && tracker.iconValue && tracker.iconValue !== kind.extension) {
      await fs.rm(localIconPath(trackerId, tracker.iconValue).target, { force: true });
    }
  }
  return repository.updateTracker(trackerId, { iconType: "image", iconValue: kind.extension });
}

export async function readTrackerIcon(trackerId: number) {
  const tracker = await (await getRepository()).getTracker(trackerId);
  if (!tracker || tracker.iconType !== "image" || !["jpg", "png", "webp"].includes(tracker.iconValue)) return null;
  const mime = tracker.iconValue === "jpg" ? "image/jpeg" : `image/${tracker.iconValue}`;
  if (usesSupabase()) {
    const { client, userId } = await cloudIdentity();
    const { data, error } = await client.storage.from("tracker-icons").download(`${userId}/${trackerId}.${tracker.iconValue}`);
    if (error || !data) return null;
    return { bytes: new Uint8Array(await data.arrayBuffer()), mime };
  }
  try {
    return { bytes: new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ localIconPath(trackerId, tracker.iconValue).target)), mime };
  } catch {
    return null;
  }
}

export async function resetTrackerIcon(trackerId: number) {
  const repository = await getRepository();
  const tracker = await repository.getTracker(trackerId);
  if (!tracker) return null;
  if (tracker.iconType === "image" && ["jpg", "png", "webp"].includes(tracker.iconValue)) {
    if (usesSupabase()) {
      const { client, userId } = await cloudIdentity();
      await client.storage.from("tracker-icons").remove([`${userId}/${trackerId}.${tracker.iconValue}`]);
    } else {
      await fs.rm(localIconPath(trackerId, tracker.iconValue).target, { force: true });
    }
  }
  return repository.updateTracker(trackerId, { iconType: "default", iconValue: "" });
}
