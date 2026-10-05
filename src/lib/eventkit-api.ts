import { NextResponse } from "next/server";
import { apiError } from "./api.ts";
import { eventKitRpcConflict } from "./eventkit-errors.ts";

export function eventKitApiError(error: unknown) {
  const conflict = eventKitRpcConflict(error);
  return conflict ? NextResponse.json(conflict, { status: 409 }) : apiError(error);
}
