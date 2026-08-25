import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createTask, listTasks } from "@/lib/services/evaorbit";
import { parseNewTask } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const value = request.nextUrl.searchParams.get("status");
  const status = value === "open" || value === "done" ? value : "all";
  return NextResponse.json(await listTasks(status));
}

export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(await createTask(parseNewTask(await request.json())), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
