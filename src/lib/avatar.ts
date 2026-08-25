export type AvatarImageKind = { extension: "jpg" | "png" | "webp"; mime: "image/jpeg" | "image/png" | "image/webp" };
export const MAX_AVATAR_BYTES = 4 * 1024 * 1024;

export function detectAvatarImage(bytes: Uint8Array): AvatarImageKind | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return { extension: "png", mime: "image/png" };
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { extension: "jpg", mime: "image/jpeg" };
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return { extension: "webp", mime: "image/webp" };
  return null;
}
