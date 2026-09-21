import "server-only";

import { ConflictError } from "../errors";
import { getRepository } from "../repositories";
import type { NewTask, TaskFilter } from "../repositories/types";
import type { Task, TaskReminder } from "../types";
import { EVAORBIT_TIME_ZONE, shiftDate, zonedDateTimeToUtc } from "../time";

type ReminderMode = "none" | "at_due" | "custom";
type TaskReminderWrite = { reminderMode?:ReminderMode;reminderDate?:string|null;reminderTime?:string|null;repeatWhileOverdue?:boolean;timezone?:string };
type TaskCreateInput = NewTask & Required<TaskReminderWrite>;
type TaskPatch = Record<string, unknown> & TaskReminderWrite;

async function hydrateTask(task:Task|null){if(!task)return null;return{...task,reminders:await(await getRepository()).listTaskReminders(task.id)};}

function reminderAt(rule:TaskReminder,task:Task){
  if(rule.triggerType==="absolute")return rule.absoluteDate&&rule.absoluteTime?zonedDateTimeToUtc(rule.absoluteDate,rule.absoluteTime,rule.timezone):null;
  if(!task.dueDate||!task.dueTime||rule.offsetMinutes===null)return null;
  return new Date(new Date(zonedDateTimeToUtc(task.dueDate,task.dueTime,rule.timezone)).getTime()+rule.offsetMinutes*60_000).toISOString();
}

function overdueAfter(task:Task,timezone:string){
  if(!task.dueDate)return null;
  if(task.dueTime)return zonedDateTimeToUtc(task.dueDate,task.dueTime,timezone);
  // A date-only task becomes overdue after its calendar day; this boundary is not a fabricated due time.
  return zonedDateTimeToUtc(shiftDate(task.dueDate,1),"00:00",timezone);
}

async function reconcileRule(rule:TaskReminder,task:Task,resetOccurrence:boolean){
  const repository=await getRepository(),nextDueAt=reminderAt(rule,task),enabled=!task.completed&&Boolean(nextDueAt);
  const existing=rule.reminderId?await repository.getReminder(rule.reminderId):null;
  const common={title:task.title,targetType:"task" as const,targetId:task.id,sourceType:"task_reminder",sourceId:rule.id,scheduleType:"one_time" as const,startsAt:nextDueAt??existing?.startsAt??new Date().toISOString(),nextDueAt:enabled?nextDueAt:null,overdueAfter:overdueAfter(task,rule.timezone),dueHasExplicitTime:true,intervalValue:null,intervalUnit:null,timesOfDay:[],endsAt:null,timezone:rule.timezone,note:task.notes,leadTimeMinutes:0,repeatWhileOverdue:rule.repeatWhileOverdue,status:enabled?"scheduled" as const:task.completed?"completed" as const:"cancelled" as const,isActive:enabled};
  let reminderId=existing?.id??null;
  if(existing)await repository.updateReminder(existing.id,{...common,cancelledAt:enabled?null:new Date().toISOString(),...(resetOccurrence?{snoozedUntil:null,lastNotifiedAt:null,sentAt:null}:{})});
  else if(enabled){const reminder=await repository.createReminder(common);reminderId=reminder.id;await repository.updateTaskReminder(rule.id,{reminderId});}
  return reminderId;
}

async function reconcileTaskReminders(taskId:number,resetOccurrence:boolean){
  const repository=await getRepository(),task=await repository.getTask(taskId);if(!task)return null;
  const ids=await Promise.all((await repository.listTaskReminders(taskId)).map(rule=>reconcileRule(rule,task,resetOccurrence)));
  const primaryId=ids.find((id):id is number=>id!==null)??null;
  if(task.reminderId!==primaryId)await repository.updateTask(task.id,{reminderId:primaryId});
  return hydrateTask(await repository.getTask(task.id));
}

function reminderFields(input:TaskPatch){return{mode:input.reminderMode,date:input.reminderDate,time:input.reminderTime,repeat:input.repeatWhileOverdue,timezone:input.timezone};}

async function writePrimaryRule(task:Task,input:TaskReminderWrite){
  const repository=await getRepository(),existing=(await repository.listTaskReminders(task.id))[0]??null;
  const mode=input.reminderMode??(existing?(existing.triggerType==="absolute"?"custom":"at_due"):"none");
  if(mode==="none"){
    if(existing?.reminderId)await repository.deleteReminder(existing.reminderId);
    if(existing)await repository.deleteTaskReminder(existing.id);
    if(task.reminderId)await repository.updateTask(task.id,{reminderId:null});
    return;
  }
  const timezone=input.timezone??existing?.timezone??EVAORBIT_TIME_ZONE,repeatWhileOverdue=input.repeatWhileOverdue??existing?.repeatWhileOverdue??false;
  const shape=mode==="at_due"?{triggerType:"relative" as const,absoluteDate:null,absoluteTime:null,relativeTo:"due" as const,offsetMinutes:0}:{triggerType:"absolute" as const,absoluteDate:input.reminderDate??existing?.absoluteDate??null,absoluteTime:input.reminderTime??existing?.absoluteTime??null,relativeTo:null,offsetMinutes:null};
  if(mode==="at_due"&&(!task.dueDate||!task.dueTime))throw new ConflictError("按截止时间提醒需要完整的截止日期和时间");
  if(mode==="custom"&&(!shape.absoluteDate||!shape.absoluteTime))throw new ConflictError("自定义提醒需要完整的日期和时间");
  if(existing)await repository.updateTaskReminder(existing.id,{...shape,timezone,repeatWhileOverdue});
  else await repository.createTaskReminder({taskId:task.id,reminderId:null,...shape,timezone,repeatWhileOverdue});
}

export async function listTasks(filter:TaskFilter="all"){return Promise.all((await(await getRepository()).listTasks(filter)).map(async task=>(await hydrateTask(task))!));}
export async function getTask(id:number){return hydrateTask(await(await getRepository()).getTask(id));}

export async function createTask(input:TaskCreateInput){
  if(input.dueTime&&!input.dueDate)throw new ConflictError("设置截止时间前需要先选择截止日期");
  const{reminderMode,reminderDate,reminderTime,repeatWhileOverdue,timezone,...taskInput}=input;
  const task=await(await getRepository()).createTask(taskInput);
  await writePrimaryRule(task,{reminderMode,reminderDate,reminderTime,repeatWhileOverdue,timezone});
  return(await reconcileTaskReminders(task.id,true))!;
}

export async function updateTask(id:number,input:TaskPatch){
  const repository=await getRepository(),current=await repository.getTask(id);if(!current)return null;
  const reminder=reminderFields(input),taskPatch=Object.fromEntries(Object.entries(input).filter(([key])=>!["reminderMode","reminderDate","reminderTime","repeatWhileOverdue","timezone"].includes(key)));
  if(taskPatch.dueDate===null)taskPatch.dueTime=null;
  const nextDueDate=taskPatch.dueDate===undefined?current.dueDate:taskPatch.dueDate,nextDueTime=taskPatch.dueTime===undefined?current.dueTime:taskPatch.dueTime;
  if(nextDueTime&&!nextDueDate)throw new ConflictError("设置截止时间前需要先选择截止日期");
  const task=await repository.updateTask(id,taskPatch);if(!task)return null;
  const reminderChanged=Object.values(reminder).some(value=>value!==undefined);
  if(reminderChanged)await writePrimaryRule(task,input);
  return reconcileTaskReminders(id,reminderChanged||input.dueDate!==undefined||input.dueTime!==undefined||input.completed!==undefined);
}

export async function disableTaskReminder(ruleId:number){
  const repository=await getRepository(),rule=await repository.getTaskReminder(ruleId);if(!rule)return false;
  if(rule.reminderId)await repository.deleteReminder(rule.reminderId);await repository.deleteTaskReminder(rule.id);
  const task=await repository.getTask(rule.taskId);if(task?.reminderId===rule.reminderId)await repository.updateTask(task.id,{reminderId:null});return true;
}

export async function completeTaskFromReminder(ruleId:number){const rule=await(await getRepository()).getTaskReminder(ruleId);if(!rule)throw new ConflictError("Task reminder rule not found.");return updateTask(rule.taskId,{completed:true});}

export async function deleteTask(id:number){const repository=await getRepository(),task=await repository.getTask(id);if(!task)return false;for(const rule of await repository.listTaskReminders(id))if(rule.reminderId)await repository.deleteReminder(rule.reminderId);return repository.deleteTask(id);}
