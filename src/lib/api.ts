import { NextResponse } from "next/server";
import { ValidationError } from "./validation.ts";
import { ConflictError, ExternalApiError, HttpError } from "./errors.ts";

export function apiError(error: unknown) {
  if (error instanceof ValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof ExternalApiError) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
  if (error instanceof ConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json({ error: "服务器暂时无法处理请求" }, { status: 500 });
}

export function parseId(value: string) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError("ID 格式不正确");
  return id;
}

/** Keep each route's existing bounds and whitespace policy explicit. */
export function optionalLimit(value: string | null, { max = 200, trimEmpty = false }: { max?: number; trimEmpty?: boolean } = {}) {
  if (value === null || value === "" || trimEmpty && value.trim() === "") return undefined;
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > max) throw new ValidationError("数量格式不正确");
  return limit;
}

export function optionalEnum<T extends string>(value: string | null, values: readonly T[], field: string) {
  if (!value) return undefined;
  if (!values.includes(value as T)) throw new ValidationError(`${field}格式不正确`);
  return value as T;
}
