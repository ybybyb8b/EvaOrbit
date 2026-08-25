import { NextResponse } from "next/server";
import { ValidationError } from "./validation.ts";
import { ExternalApiError } from "./errors.ts";

export function apiError(error: unknown) {
  if (error instanceof ValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof ExternalApiError) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
  console.error(error);
  return NextResponse.json({ error: "服务器暂时无法处理请求" }, { status: 500 });
}

export function parseId(value: string) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError("ID 格式不正确");
  return id;
}
