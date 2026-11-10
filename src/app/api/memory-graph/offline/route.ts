import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import type { GraphOfflineSnapshot } from "@/lib/memory-graph-offline";
import { getRepository } from "@/lib/repositories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const repository = await getRepository();
    const signal = request.signal;
    const [entities, facts] = await Promise.all([
      repository.pageMemory("entity", { includeMerged: true, limit: 200, signal }),
      repository.pageMemory("fact", { limit: 200, signal }),
    ]);
    const ids = new Set(entities.items.map(entity => entity.id));
    const included = facts.items.filter(fact => ids.has(fact.subjectEntityId)
      && (!fact.objectEntityId || ids.has(fact.objectEntityId)));
    const factIds = included.map(fact => fact.id);
    const sources = factIds.length
      ? await repository.pageMemory("source", { factIds, limit: 200, signal })
      : { items: [], has_more: false };
    const snapshot: GraphOfflineSnapshot = {
      capturedAt: new Date().toISOString(),
      complete: !entities.has_more && !facts.has_more && included.length === facts.items.length
        && !sources.has_more,
      entities: entities.items,
      facts: included,
      sources: sources.items,
    };
    const json = JSON.stringify(snapshot);
    const headers = { "Cache-Control": "no-store" };
    // Leave room for the bridge response envelope within its 8 MiB cache limit.
    if (Buffer.byteLength(json) > 6 * 1024 * 1024) {
      return NextResponse.json({ error: "Graph download exceeds the offline size limit." }, { status: 413, headers });
    }
    return new NextResponse(json, { headers: { ...headers, "Content-Type": "application/json" } });
  } catch (error) {
    return apiError(error);
  }
}
