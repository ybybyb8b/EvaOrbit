import {NextResponse} from "next/server";
import {currentNativeAccount} from "@/lib/native-account";
import {apiError} from "@/lib/api";
import {HttpError} from "@/lib/errors";
import {getRelationsReadonlySnapshot} from "@/lib/services/relations-readonly";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){try{
  const account=await currentNativeAccount();if(!account)throw new HttpError("Please sign in",401);
  return NextResponse.json(await getRelationsReadonlySnapshot(account.id),{headers:{"Cache-Control":"no-store"}});
}catch(error){const response=apiError(error);response.headers.set("Cache-Control","no-store");return response;}}
