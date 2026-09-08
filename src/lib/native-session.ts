import { ValidationError } from "./validation.ts";

export type NativeLoginCredentials = {
  email: string;
  password: string;
};

export function parseNativeLoginCredentials(value: unknown): NativeLoginCredentials {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("登录信息格式不正确");
  }

  const body = value as Record<string, unknown>;
  if (typeof body.email !== "string" || typeof body.password !== "string") {
    throw new ValidationError("邮箱或密码格式不正确");
  }

  const email = body.email.trim().toLocaleLowerCase();
  if (!email || email.length > 320 || !body.password || body.password.length > 1024) {
    throw new ValidationError("邮箱或密码格式不正确");
  }

  return { email, password: body.password };
}
