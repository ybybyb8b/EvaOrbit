export const appleReadFirstDay="2026-10-01";
export const appleReadStart=()=>new Date(2026,9,1);
export const appleReadQueryStart=()=>new Date("2026-09-30T10:00:00Z");

export function appleDateInScope(value:unknown,timeZone?:unknown):boolean {
 if(typeof value!=="string"||!value)return false;
 if(/^\d{4}-\d{2}-\d{2}$/.test(value)){const date=new Date(`${value}T00:00:00Z`);return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value&&value>=appleReadFirstDay;}
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return false;
 try{
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:typeof timeZone==="string"?timeZone:undefined,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
  const get=(kind:string)=>parts.find(part=>part.type===kind)?.value??"";
  return `${get("year")}-${get("month")}-${get("day")}`>=appleReadFirstDay;
 }catch{return false;}
}
export function appleItemInScope(kind:"calendar"|"reminder",item:Record<string,unknown>):boolean {
 if(kind==="calendar")return appleDateInScope(item.startAt,item.timezone);
 if(item.completed&&appleDateInScope(item.completionDate))return true;
 return item.dueDate?appleDateInScope(item.dueDate,item.timezone):appleDateInScope(item.createdAt);
}

// A page size is an execution limit, never a permanent end of the sync scope.
export function calendarReadPage(from:Date){const to=new Date(from);to.setMonth(to.getMonth()+3);return{from:from.getTime()===appleReadStart().getTime()?appleReadQueryStart():from,to};}
export function calendarPriorityWindow(now=new Date()){
 const from=new Date(now);from.setHours(0,0,0,0);from.setDate(from.getDate()-3);
 const to=new Date(now);to.setHours(0,0,0,0);to.setDate(to.getDate()+15);
 return{from:new Date(Math.max(from.getTime(),appleReadStart().getTime())),to};
}
