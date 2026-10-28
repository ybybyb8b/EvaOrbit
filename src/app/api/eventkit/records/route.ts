import {NextRequest,NextResponse} from "next/server";
import {currentNativeAccount} from "@/lib/native-account";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {HttpError} from "@/lib/errors";
import {ValidationError} from "@/lib/validation";
import {eventKitApiError} from "@/lib/eventkit-api";
import {readEventKitRows} from "@/lib/eventkit-links";
import {taskFromRow,taskReminderFromRow,reminderFromRow} from "@/lib/repositories/supabase";
export const runtime="nodejs";
export async function GET(request:NextRequest){try{
 const account=await currentNativeAccount();if(!account)throw new HttpError("登录已失效",401);
 const p=request.nextUrl.searchParams,kind=p.get("kind"),after=Number(p.get("afterId")??0),limit=Number(p.get("limit")??500);
 if(!["task","reminder"].includes(kind??"")||!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(limit)||limit<1||limit>500)throw new ValidationError("EventKit 分页参数无效");
 const client=await createSupabaseServerClient(),table=kind==="task"?"tasks":"reminders";
 const {data,error}=await client.from(table).select("*").eq("user_id",account.id).gt("id",after).order("id").limit(limit);if(error)throw error;
 if(kind==="reminder")return NextResponse.json((data??[]).map(reminderFromRow));
 const ids=(data??[]).map(row=>row.id);
 const rules=ids.length?await readEventKitRows(async cursor=>{let query=client.from("task_reminders").select("*").in("task_id",ids).order("id").limit(500);if(cursor!==undefined)query=query.gt("id",cursor);const result=await query;if(result.error)throw result.error;return result.data??[];}):[];
 const byTask=new Map<number,ReturnType<typeof taskReminderFromRow>[]>();for(const row of rules){const rule=taskReminderFromRow(row),list=byTask.get(rule.taskId)??[];list.push(rule);byTask.set(rule.taskId,list);}
 return NextResponse.json((data??[]).map(row=>({...taskFromRow(row),reminders:byTask.get(Number(row.id))??[]})));
 }catch(error){return eventKitApiError(error);}}
