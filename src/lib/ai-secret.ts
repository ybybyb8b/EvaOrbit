import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const AAD = Buffer.from("evaorbit:ai-api-key:v1", "utf8");

export type EncryptedAiApiKey = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

type StoredAiApiKey = {
  ciphertext?: string | null;
  iv?: string | null;
  authTag?: string | null;
};

function encryptionKey() {
  const value = process.env.EVAORBIT_ENCRYPTION_KEY?.trim() ?? "";
  if (!value) {
    throw new Error("EVAORBIT_ENCRYPTION_KEY 未配置，无法安全保存或读取 API Key");
  }

  const key = /^[0-9a-f]{64}$/i.test(value)
    ? Buffer.from(value, "hex")
    : Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new Error("EVAORBIT_ENCRYPTION_KEY 必须是 32 字节密钥（Base64 或 64 位十六进制）");
  }
  return key;
}

export function encryptAiApiKey(apiKey: string): EncryptedAiApiKey {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

function developmentFallback() {
  if (process.env.NODE_ENV === "production") return "";
  return process.env.AI_API_KEY?.trim() ?? "";
}

export function resolveAiApiKey(stored: StoredAiApiKey) {
  const values = [stored.ciphertext, stored.iv, stored.authTag];
  if (values.every((value) => !value)) return developmentFallback();
  if (values.some((value) => !value)) {
    throw new Error("已保存的 API Key 数据不完整，请在设置中重新配置");
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(stored.iv!, "base64"));
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(stored.authTag!, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(stored.ciphertext!, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("EVAORBIT_ENCRYPTION_KEY")) throw error;
    throw new Error("已保存的 API Key 无法解密，请确认 EVAORBIT_ENCRYPTION_KEY 未被更换");
  }
}
