import {NextResponse} from "next/server";
import {apiError} from "@/lib/api";
import {currentNativeAccount} from "@/lib/native-account";
import {HttpError} from "@/lib/errors";
import {workspaceKinds,type WorkspaceKind} from "@/lib/workspace-readonly";
import {getWorkspaceReadonlySnapshot} from "@/lib/services/workspace-readonly";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(_:Request,{params}:{params:Promise<{kind:string}>}){try{const kind=(await params).kind as WorkspaceKind;if(!workspaceKinds.includes(kind))throw new HttpError("Workspace not found",404);const account=await currentNativeAccount();if(!account)throw new HttpError("Please sign in",401);return NextResponse.json(await getWorkspaceReadonlySnapshot(account.id,kind),{headers:{"Cache-Control":"no-store"}});}catch(e){const response=apiError(e);response.headers.set("Cache-Control","no-store");return response;}}
