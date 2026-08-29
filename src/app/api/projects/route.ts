import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createProject, listProjects } from "@/lib/services/project";
import { parseNewProject } from "@/lib/validation";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try { return NextResponse.json(await listProjects({ query: request.nextUrl.searchParams.get("q") || undefined, status: request.nextUrl.searchParams.get("status") as "active" | "paused" | "archived" | undefined })); }
  catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest) {
  try { return NextResponse.json(await createProject(parseNewProject(await request.json())), { status: 201 }); }
  catch (error) { return apiError(error); }
}
