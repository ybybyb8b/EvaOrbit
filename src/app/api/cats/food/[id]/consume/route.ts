import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { consumeCatFoodPackage } from "@/lib/services/cat-food";
export const runtime = "nodejs";
export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) { try { return NextResponse.json(await consumeCatFoodPackage(parseId((await params).id))); } catch (error) { return apiError(error); } }
