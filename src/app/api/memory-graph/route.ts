import { NextRequest, NextResponse } from "next/server";
import { apiError, optionalEnum, optionalLimit } from "@/lib/api";
import { getMemoryEntityDetail, getMemoryFactDetail, getMemoryGraphSnapshot, pageMemory, proposeMemoryFactCandidate, recallMemory, getMemoryFactCandidate, listMemoryFactCandidates } from "@/lib/services/memory-graph";
import { getMemoryContext } from "@/lib/services/memory-context";
import { ValidationError } from "@/lib/validation";
import { memoryUuid, parseMemoryEntitySearch, parseMemoryFactSearch } from "@/lib/memory-graph-validation";
import type { MemoryPageOrder } from "@/lib/memory-pagination";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request:NextRequest){
  try{
    const params = request.nextUrl.searchParams;
    const query = params.get("q")?.trim() || undefined;
    const echoHeaders={"Cache-Control":"no-store","X-Parlor-Echo-Protocol":"1"};
    if(params.get("resource")==="parlor_protocol")return NextResponse.json({protocol:"parlor-echo/1",fullContext:true,candidateLookup:true,manualCandidates:true},{headers:echoHeaders});
    if(params.get("context")==="1"){
      if(!query||query.length>160||query.includes("\0"))throw new ValidationError("Echo context requires bounded keywords (1–160 characters).");
      const maxChars=params.has("max_chars")?optionalLimit(params.get("max_chars"),{max:12000}):6000;
      return NextResponse.json({protocol:"parlor-echo/1",context:await getMemoryContext({query,limit:optionalLimit(params.get("limit"),{max:8})??4,max_chars:maxChars},request.signal)},{headers:echoHeaders});
    }
    if(params.get("resource")==="candidate"&&params.has("request_id")){
      const requestId=memoryUuid(params.get("request_id"),"request_id"),candidate=(await listMemoryFactCandidates({requestId,limit:1}))[0]??null;
      return NextResponse.json({protocol:"parlor-echo/1",candidate},{headers:echoHeaders});
    }
    if (params.has("resource")) {
      const resource = params.get("resource");
      const options = {
        limit: optionalLimit(params.get("limit")), cursor: params.get("cursor") ?? undefined,
        order: optionalEnum<MemoryPageOrder>(params.get("order"), ["display", "created"], "排序"),
      };
      const id = params.get("id");
      const param = (key: string) => params.get(key) ?? undefined;
      const uuid = (key: string) => params.has(key) ? memoryUuid(param(key), key) : undefined;
      if (id !== null) {
        if(resource==="candidate")return NextResponse.json(await getMemoryFactCandidate(memoryUuid(id,"id")),{headers:echoHeaders});
        if (resource !== "entity" && resource !== "fact") throw new ValidationError("Unsupported Memory detail resource.");
        const itemId = memoryUuid(id, "id");
        const item = resource === "entity" ? await getMemoryEntityDetail(itemId, options) : await getMemoryFactDetail(itemId, options);
        return item ? NextResponse.json(item) : NextResponse.json({ error: "Memory record not found." }, { status: 404 });
      }
      switch (resource) {
        case "entity":
          return NextResponse.json(await pageMemory("entity", { ...options, query, ...parseMemoryEntitySearch({
            status: param("status"), entityType: param("entity_type"),
            includeMerged: optionalEnum(params.get("include_merged"), ["true", "false"], "include_merged") === "true",
          }) }));
        case "fact":
          return NextResponse.json(await pageMemory("fact", { ...options, query, ...parseMemoryFactSearch({
            entityId: param("entity_id"), direction: param("direction"), predicate: param("predicate"),
            perspectiveEntityId: params.get("perspective_entity_id") === "null" ? null : param("perspective_entity_id"),
            status: param("status"), validOn: param("valid_on"),
          }) }));
        case "source":
          return NextResponse.json(await pageMemory("source", { ...options, query, factId: uuid("fact_id"),
            sourceResource: param("source_resource"), sourceRecordId: param("source_record_id") }));
        case "candidate":
          if (query) throw new ValidationError("Candidate search accepts structured filters only.");
          return NextResponse.json(await pageMemory("candidate", { ...options, promotedFactId: uuid("promoted_fact_id"),
            status: optionalEnum(params.get("status"), ["pending", "promoted", "rejected"], "status"),
            proposedBy: optionalEnum(params.get("proposed_by"), ["user", "model", "system", "import"], "proposed_by"),
          }));
        default:
          throw new ValidationError("Unsupported Memory resource.");
      }
    }
    if (query) {
      const detailed = params.get("recall") === "1";
      const result = await recallMemory(query, optionalLimit(params.get("limit"), { max: 20 }) ?? 8, request.signal,
        detailed ? undefined : { primary_resource: "fact" });
      if (detailed) return NextResponse.json(result);
      if (result.coverage.status === "failed" || result.coverage.status === "timeout") {
        return NextResponse.json({ error: "Memory recall did not complete.", coverage: result.coverage }, { status: result.coverage.status === "timeout" ? 504 : 503 });
      }
      return NextResponse.json(result.facts, { headers: { "X-Memory-Recall-Complete": String(result.coverage.complete) } });
    }
    return NextResponse.json(await getMemoryGraphSnapshot());
  }catch(error){return apiError(error);}
}

export async function POST(request:NextRequest){
  try{
    const value=await request.json();
    if(value?.protocol==="parlor-echo/1"){
      const input=value.submission;
      if(!input?.requestId||input.reviewMode!=="manual")throw new ValidationError("Parlor sharing requires a stable requestId and manual review.");
      return NextResponse.json({protocol:"parlor-echo/1",candidate:await proposeMemoryFactCandidate(input,"parlor")},{status:201,headers:{"Cache-Control":"no-store","X-Parlor-Echo-Protocol":"1"}});
    }
    return NextResponse.json(await proposeMemoryFactCandidate(value),{status:201});
  }catch(error){return apiError(error);}
}
