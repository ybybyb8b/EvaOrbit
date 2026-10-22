import type {BusinessRequest} from "@/lib/business-request";
import {responseError} from "../../lib/response-error.ts";
import type {TrackerSummary} from "@/lib/types";
import type {TrackerCreateInput} from "./tracker-create-sheet";

export async function createTrackerWithProperties(request:BusinessRequest,{draft,iconFile,fields}:TrackerCreateInput){
 const response=await request("/api/trackers",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(draft)});
 if(!response.ok)throw new Error(await responseError(response,"Could not create Tracker. Refresh before retrying."));
 const tracker=await response.json() as TrackerSummary,followUpErrors:string[]=[];
 // Creation is acknowledged. A failed follow-up must never invite a duplicate create.
 if(iconFile){try{const body=new FormData();body.set("file",iconFile);const upload=await request(`/api/trackers/${tracker.id}/icon`,{method:"POST",body});if(!upload.ok)followUpErrors.push("its image could not be uploaded");}catch{followUpErrors.push("its image upload could not be confirmed");}}
 for(const [sortOrder,field] of fields.entries()){
  try{const result=await request(`/api/trackers/${tracker.id}/fields`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:field.name,type:field.type,options:field.options.split(/[,，]/).map(item=>item.trim()).filter(Boolean),required:field.required,includeInStats:field.includeInStats,showAfterQuickCapture:false,unit:field.unit,precision:Number(field.precision),defaultValue:null,sortOrder})});if(!result.ok)followUpErrors.push(`the property “${field.name}” could not be added`);}catch{followUpErrors.push(`the property “${field.name}” could not be confirmed; refresh before retrying`);break;}
 }
 return {tracker,followUpErrors};
}
