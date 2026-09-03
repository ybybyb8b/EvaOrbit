import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { encryptAiApiKey, resolveAiApiKey } from "../ai-secret";
import { maskApiKey } from "../ai-provider";
import { normalizeHomeModuleOrder, type HomeModuleId } from "../home-modules";
import { allowedEmail, supabaseConfig } from "../config";
import { ConflictError } from "../errors";
import { normalizeAppearanceMode, normalizeColorTheme } from "../theme";
import { createSupabaseServerClient } from "../supabase/server";
import type { AiModelConfig, AiProvider, CatEvent, CatMeasurement, CatMedication, CatRoutine, CatSymptom, CatVetVisit, ChatMessage, ChatRole, ChatSession, ChronicleEntry, DrinkLimit, DrinkLog, FoodDish, FoodLibraryItem, FoodLog, FoodPlace, HealthRecord, InboxItem, LuciusCase, LuciusDiaryEntry, LuciusPost, LuciusState, MediaItem, MediaSeries, MediaViewing, Memo, Memory, NotificationDelivery, PersonMemoryNote, Pet, Project, ProjectItem, PushSubscriptionRecord, RelationEvent, RelationPerson, Reminder, ReminderOccurrence, Task, TaskPriority, Tracker, TrackerEntry, TrackerField, TrackerGoal, TrackerReminder, TrainingLog } from "../types";
import type { AiModelConfigInput, AiProviderInput, AiSettingsInput, ChronicleEntryPatch, EvaOrbitRepository, FoodLibrarySearchOptions, HealthRecordListInput, InternalAiProvider, InternalAiSettings, LuciusCasePatch, LuciusDiaryPatch, LuciusPostPatch, LuciusStatePatch, MediaItemPatch, MemoPatch, NewTask, ProjectItemPatch, ProjectPatch, TaskFilter } from "./types";

type Row = Record<string, unknown>;

function foodLibrarySearchValue(value: string) { return value.trim().replace(/[\\%_]/g, "\\$&").replace(/[(),]/g, " "); }
function postgrestQuoted(value: string) { return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`; }

function fail(error: { message: string } | null, operation: string) {
  if (error) throw new Error(`${operation}失败：${error.message}`);
}

function taskFromRow(row: Row): Task {
  return {
    id: Number(row.id), title: String(row.title), notes: String(row.notes ?? ""), completed: Boolean(row.completed),
    dueDate: row.due_date ? String(row.due_date) : null, priority: row.priority as TaskPriority,
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [], createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function memoryFromRow(row: Row): Memory {
  return {
    id: Number(row.id), title: String(row.title), content: String(row.content), category: String(row.category),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function messageFromRow(row: Row): ChatMessage {
  return {
    id: Number(row.id), sessionId: Number(row.session_id), role: row.role as ChatRole,
    content: String(row.content), model: row.model ? String(row.model) : null,
    providerId: row.provider_id ? Number(row.provider_id) : null, modelConfigId: row.model_config_id ? Number(row.model_config_id) : null,
    createdAt: String(row.created_at),
  };
}

function sessionFromRow(row: Row, preview = "", messageCount = 0): ChatSession {
  const providerRelation = row.ai_providers as Row | null | undefined;
  const modelRelation = row.ai_model_configs as Row | null | undefined;
  return {
    id: Number(row.id), title: String(row.title), model: row.model ? String(row.model) : null,
    providerId: row.provider_id ? Number(row.provider_id) : null, modelConfigId: row.model_config_id ? Number(row.model_config_id) : null,
    providerName: providerRelation?.name ? String(providerRelation.name) : null,
    modelDisplayName: modelRelation?.display_name ? String(modelRelation.display_name) : null,
    createdAt: String(row.created_at), updatedAt: String(row.updated_at), preview, messageCount,
  };
}

function inboxFromRow(row: Row): InboxItem { return { id: Number(row.id), content: String(row.content), status: row.status as InboxItem["status"], source: String(row.source), processedAt: row.processed_at ? String(row.processed_at) : null, convertedType: row.converted_type ? String(row.converted_type) : null, convertedId: row.converted_id === null ? null : Number(row.converted_id), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }; }
function foodFromRow(row: Row): FoodLog { const place=row.food_places as Row|null|undefined,dish=row.food_dishes as Row|null|undefined;return { id:Number(row.id),occurredAt:String(row.occurred_at),mealType:row.meal_type as FoodLog["mealType"],title:String(row.title),description:String(row.description),portion:String(row.portion),scene:row.scene as FoodLog["scene"],rating:row.rating?row.rating as FoodLog["rating"]:null,estimatedKcal:row.estimated_kcal===null?null:Number(row.estimated_kcal),kcalMin:row.kcal_min===null?null:Number(row.kcal_min),kcalMax:row.kcal_max===null?null:Number(row.kcal_max),confidence:row.confidence as FoodLog["confidence"],notes:String(row.notes),imageUrl:row.image_url?String(row.image_url):null,attachmentId:row.attachment_id?String(row.attachment_id):null,foodPlaceId:row.food_place_id==null?null:Number(row.food_place_id),foodDishId:row.food_dish_id==null?null:Number(row.food_dish_id),foodPlaceName:place?.name?String(place.name):null,foodPlaceBranch:place?.branch?String(place.branch):null,foodDishName:dish?.name?String(dish.name):null,createdAt:String(row.created_at),updatedAt:String(row.updated_at)}; }
function libraryFromRow(row: Row): FoodLibraryItem { return {id:Number(row.id),name:String(row.name),brand:String(row.brand),category:row.category as FoodLibraryItem["category"],defaultPortion:String(row.default_portion),referenceType:row.reference_type as FoodLibraryItem["referenceType"],referenceEnergyKj:row.reference_energy_kj===null?null:Number(row.reference_energy_kj),referenceKcal:row.reference_kcal===null?null:Number(row.reference_kcal),servingWeight:row.serving_weight===null?null:Number(row.serving_weight),servingKcal:row.serving_kcal===null?null:Number(row.serving_kcal),dataSource:row.data_source as FoodLibraryItem["dataSource"],notes:String(row.notes),archivedAt:row.archived_at?String(row.archived_at):null,updatedAt:String(row.updated_at)}; }
function foodPlaceFromRow(row:Row,stats:{dishCount?:number;visitCount?:number;lastVisitedAt?:string|null}={}):FoodPlace{return{id:Number(row.id),name:String(row.name),branch:String(row.branch??""),category:String(row.category??""),rating:row.rating as FoodPlace["rating"],status:row.status as FoodPlace["status"],notes:String(row.notes??""),archivedAt:row.archived_at?String(row.archived_at):null,dishCount:stats.dishCount??0,visitCount:stats.visitCount??0,lastVisitedAt:stats.lastVisitedAt??null,createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function foodDishFromRow(row:Row,stats:{eatCount?:number;lastEatenAt?:string|null}={}):FoodDish{return{id:Number(row.id),foodPlaceId:Number(row.food_place_id),name:String(row.name),category:String(row.category??""),rating:row.rating as FoodDish["rating"],recommended:Boolean(row.recommended),notes:String(row.notes??""),archivedAt:row.archived_at?String(row.archived_at):null,eatCount:stats.eatCount??0,lastEatenAt:stats.lastEatenAt??null,createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function drinkFromRow(row: Row): DrinkLog { return {id:Number(row.id),occurredAt:String(row.occurred_at),occurredHasExplicitTime:row.occurred_has_explicit_time===undefined?true:Boolean(row.occurred_has_explicit_time),name:String(row.name),brand:String(row.brand),drinkType:row.drink_type as DrinkLog["drinkType"],volumeMl:row.volume_ml===null?null:Number(row.volume_ml),sugarLevel:String(row.sugar_level),temperature:row.temperature?row.temperature as DrinkLog["temperature"]:null,rating:row.rating?row.rating as DrinkLog["rating"]:null,caffeineMg:row.caffeine_mg===null?null:Number(row.caffeine_mg),estimatedKcal:row.estimated_kcal===null?null:Number(row.estimated_kcal),kcalMin:row.kcal_min===null?null:Number(row.kcal_min),kcalMax:row.kcal_max===null?null:Number(row.kcal_max),confidence:row.confidence as DrinkLog["confidence"],foodLibraryId:row.food_library_id===null?null:Number(row.food_library_id),notes:String(row.notes),createdAt:String(row.created_at),updatedAt:String(row.updated_at)}; }
function healthRecordDetailsFromRow(value: unknown): HealthRecord["details"] { if (!value || typeof value !== "object" || Array.isArray(value)) return {}; return Object.fromEntries(Object.entries(value).filter(([, item]) => item === null || typeof item === "string" || typeof item === "number" || typeof item === "boolean")); }
function healthRecordFromRow(row: Row): HealthRecord { return { id: Number(row.id), occurredAt: String(row.occurred_at), occurredHasExplicitTime: row.occurred_has_explicit_time === undefined ? true : Boolean(row.occurred_has_explicit_time), type: row.type as HealthRecord["type"], title: String(row.title), summary: String(row.summary ?? ""), status: row.status as HealthRecord["status"], startedAt: row.started_at ? String(row.started_at) : null, startedHasExplicitTime: row.started_has_explicit_time === undefined ? true : Boolean(row.started_has_explicit_time), endedAt: row.ended_at ? String(row.ended_at) : null, endedHasExplicitTime: row.ended_has_explicit_time === undefined ? true : Boolean(row.ended_has_explicit_time), details: healthRecordDetailsFromRow(row.details), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }; }
function trainingLogFromRow(row:Row):TrainingLog{return{id:Number(row.id),occurredAt:String(row.occurred_at),occurredHasExplicitTime:Boolean(row.occurred_has_explicit_time),trainingType:row.training_type as TrainingLog["trainingType"],bodyParts:Array.isArray(row.body_parts)?row.body_parts.map(String) as TrainingLog["bodyParts"]:[],teacher:String(row.teacher??""),course:String(row.course??""),durationMinutes:row.duration_minutes===null?null:Number(row.duration_minutes),notes:String(row.notes??""),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function mediaItemFromRow(row:Row):MediaItem{const series=row.media_series as Row|null|undefined;return{id:Number(row.id),title:String(row.title),originalTitle:row.original_title===null?null:String(row.original_title),translatedTitle:row.translated_title===null?null:String(row.translated_title),mediaType:row.media_type as MediaItem["mediaType"],status:row.status as MediaItem["status"],rating:row.rating as MediaItem["rating"],isFavorite:Boolean(row.is_favorite),note:row.note===null?null:String(row.note),coverUrl:row.cover_url===null?null:String(row.cover_url),seriesId:row.series_id===null?null:Number(row.series_id),seriesName:series?.name?String(series.name):null,seasonNumber:row.season_number===null?null:Number(row.season_number),seasonTitle:row.season_title===null?null:String(row.season_title),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function mediaSeriesFromRow(row:Row):MediaSeries{const items=Array.isArray(row.media_items)?row.media_items:[];return{id:Number(row.id),name:String(row.name),itemCount:items.length,createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function mediaViewingFromRow(row:Row):MediaViewing{return{id:Number(row.id),mediaId:Number(row.media_id),watchedDate:String(row.watched_date),viewingNumber:Number(row.viewing_number),createdAt:String(row.created_at)};}
function chronicleEntryFromRow(row:Row):ChronicleEntry{return{id:Number(row.id),date:String(row.date),title:String(row.title),contentMd:String(row.content_md),source:row.source as ChronicleEntry["source"],createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function projectFromRow(row:Row):Project{return{id:Number(row.id),name:String(row.name),description:row.description===null?null:String(row.description),status:row.status as Project["status"],doingCount:Number(row.doing_count??0),toSolveCount:Number(row.to_solve_count??0),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function projectItemFromRow(row:Row):ProjectItem{return{id:Number(row.id),projectId:Number(row.project_id),projectName:row.project_name===undefined?undefined:String(row.project_name),title:String(row.title),description:row.description===null?null:String(row.description),type:row.type as ProjectItem["type"],status:row.status as ProjectItem["status"],module:row.module===null?null:String(row.module),priority:row.priority===null?null:String(row.priority),nextStep:row.next_step===null?null:String(row.next_step),resolution:row.resolution===null?null:String(row.resolution),createdAt:String(row.created_at),startedAt:row.started_at===null?null:String(row.started_at),completedAt:row.completed_at===null?null:String(row.completed_at),verifiedAt:row.verified_at===null?null:String(row.verified_at),updatedAt:String(row.updated_at)};}
function migrationTraceFromRow(row:Row){return{sourceSystem:row.source_system===null?null:String(row.source_system),sourceId:row.source_id===null?null:String(row.source_id),sourceUrl:row.source_url===null?null:String(row.source_url),importedAt:row.imported_at===null?null:String(row.imported_at)};}
function rowStrings(value:unknown){return Array.isArray(value)?value.map(String):[];}
function memoFromRow(row:Row):Memo{return{id:Number(row.id),title:String(row.title),content:String(row.content),type:row.type as Memo["type"],status:row.status as Memo["status"],tags:rowStrings(row.tags),eventDate:row.event_date===null?null:String(row.event_date),confirmedAt:row.confirmed_at===null?null:String(row.confirmed_at),mergedIntoId:row.merged_into_id===null?null:Number(row.merged_into_id),...migrationTraceFromRow(row),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function luciusDiaryFromRow(row:Row):LuciusDiaryEntry{return{id:Number(row.id),date:String(row.date),content:String(row.content),tags:rowStrings(row.tags),...migrationTraceFromRow(row),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function luciusPostFromRow(row:Row):LuciusPost{return{id:Number(row.id),content:String(row.content),publishedAt:String(row.published_at),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function luciusCaseFromRow(row:Row):LuciusCase{return{id:Number(row.id),title:String(row.title),errorType:row.error_type as LuciusCase["errorType"],severity:row.severity as LuciusCase["severity"],status:row.status as LuciusCase["status"],triggerScenes:rowStrings(row.trigger_scenes),errorQuote:String(row.error_quote),cause:String(row.cause),correctBehavior:String(row.correct_behavior),mandatoryRule:String(row.mandatory_rule),nextCheck:row.next_check===null?null:String(row.next_check),punishment:String(row.punishment),firstOccurredDate:String(row.first_occurred_date),latestOccurredDate:String(row.latest_occurred_date),occurrenceCount:Number(row.occurrence_count),consecutiveCorrectCount:Number(row.consecutive_correct_count),recurrenceIntervalDays:row.recurrence_interval_days===null?null:Number(row.recurrence_interval_days),isRecurrence:Boolean(row.is_recurrence),resetThreshold:Number(row.reset_threshold),...migrationTraceFromRow(row),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function luciusStateFromRow(row:Row|null):LuciusState{return row?{currentNote:String(row.current_note??""),status:String(row.status??"quiet"),mood:String(row.mood??"composed"),updatedAt:row.updated_at?String(row.updated_at):null}:{currentNote:"",status:"quiet",mood:"composed",updatedAt:null};}
function limitFromRow(row: Row): DrinkLimit { return {id:Number(row.id),name:String(row.name),targetType:String(row.target_type),period:row.period as DrinkLimit["period"],limitValue:Number(row.limit_value),enabled:Boolean(row.enabled),createdAt:String(row.created_at),updatedAt:String(row.updated_at)}; }
function trackerFromRow(row:Row):Tracker{return{id:Number(row.id),name:String(row.name),icon:String(row.icon),iconType:(row.icon_type??"default") as Tracker["iconType"],iconValue:String(row.icon_value??""),groupName:String(row.group_name),timeType:row.time_type as Tracker["timeType"],quickCaptureEnabled:Boolean(row.quick_capture_enabled),statsConfig:row.stats_config&&typeof row.stats_config==="object"?row.stats_config as Record<string,unknown>:{},createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function trackerFieldFromRow(row:Row):TrackerField{return{id:Number(row.id),trackerId:Number(row.tracker_id),key:String(row.field_key??`field_${row.id}`),name:String(row.name),type:row.type as TrackerField["type"],required:Boolean(row.required),defaultValue:row.default_value??null,options:Array.isArray(row.options_json)?row.options_json.map(String):[],showAfterQuickCapture:Boolean(row.show_after_quick_capture),includeInStats:Boolean(row.include_in_stats),sortOrder:Number(row.sort_order),unit:String(row.unit??""),precision:Number(row.precision??0),config:row.config_json&&typeof row.config_json==="object"?row.config_json as Record<string,unknown>:{},archivedAt:row.archived_at?String(row.archived_at):null,createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function trackerEntryFromRow(row:Row):TrackerEntry{return{id:Number(row.id),trackerId:Number(row.tracker_id),occurredAt:String(row.occurred_at),endAt:row.end_at?String(row.end_at):null,values:row.values_json&&typeof row.values_json==="object"?row.values_json as Record<string,unknown>:{},note:String(row.note),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function trackerGoalFromRow(row:Row):TrackerGoal{return{id:Number(row.id),trackerId:Number(row.tracker_id),operator:row.operator as TrackerGoal["operator"],targetValue:Number(row.target_value),periodType:row.period_type as TrackerGoal["periodType"],customPeriod:String(row.custom_period),enabled:Boolean(row.enabled),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function trackerReminderFromRow(row:Row):TrackerReminder{return{id:Number(row.id),trackerId:Number(row.tracker_id),reminderType:row.reminder_type as TrackerReminder["reminderType"],scheduleRule:String(row.schedule_rule),intervalDays:row.interval_days===null?null:Number(row.interval_days),enabled:Boolean(row.enabled),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function petFromRow(row:Row):Pet{return{id:Number(row.id),name:String(row.name),avatarUrl:String(row.avatar_url??""),sex:row.sex as Pet["sex"],birthday:row.birthday?String(row.birthday):null,adoptionDate:row.adoption_date?String(row.adoption_date):null,notes:String(row.notes??""),isActive:Boolean(row.is_active),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function catEventFromRow(row:Row):CatEvent{return{id:Number(row.id),petId:row.pet_id===null?null:Number(row.pet_id),eventType:row.event_type as CatEvent["eventType"],occurredAt:String(row.occurred_at),occurredHasExplicitTime:row.occurred_has_explicit_time===undefined?true:Boolean(row.occurred_has_explicit_time),title:String(row.title),note:String(row.note??""),sourceType:row.source_type?String(row.source_type):null,sourceId:row.source_id===null?null:Number(row.source_id),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function catSymptomFromRow(row:Row):CatSymptom{return{id:Number(row.id),petId:Number(row.pet_id),occurredAt:String(row.occurred_at),occurredHasExplicitTime:row.occurred_has_explicit_time===undefined?true:Boolean(row.occurred_has_explicit_time),title:String(row.title),severity:String(row.severity??""),description:String(row.description??""),bodyArea:String(row.body_area??""),note:String(row.note??""),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function catVetVisitFromRow(row:Row):CatVetVisit{return{id:Number(row.id),petId:Number(row.pet_id),occurredAt:String(row.occurred_at),occurredHasExplicitTime:row.occurred_has_explicit_time===undefined?true:Boolean(row.occurred_has_explicit_time),clinic:String(row.clinic??""),doctor:String(row.doctor??""),reason:String(row.reason),symptoms:String(row.symptoms??""),diagnosis:String(row.diagnosis??""),examinations:String(row.examinations??""),treatment:String(row.treatment??""),prescriptions:String(row.prescriptions??""),cost:row.cost===null?null:Number(row.cost),followUpAt:row.follow_up_at?String(row.follow_up_at):null,notes:String(row.notes??""),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function catMedicationFromRow(row:Row):CatMedication{return{id:Number(row.id),petId:Number(row.pet_id),name:String(row.name),dose:String(row.dose??""),unit:String(row.unit??""),frequencyText:String(row.frequency_text??""),startedAt:String(row.started_at),startedHasExplicitTime:row.started_has_explicit_time===undefined?true:Boolean(row.started_has_explicit_time),endedAt:row.ended_at?String(row.ended_at):null,endedHasExplicitTime:row.ended_has_explicit_time===undefined?true:Boolean(row.ended_has_explicit_time),reason:String(row.reason??""),active:Boolean(row.active),notes:String(row.notes??""),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function catMeasurementFromRow(row:Row):CatMeasurement{return{id:Number(row.id),petId:Number(row.pet_id),occurredAt:String(row.occurred_at),occurredHasExplicitTime:row.occurred_has_explicit_time===undefined?true:Boolean(row.occurred_has_explicit_time),measurementType:String(row.measurement_type),value:Number(row.value),unit:String(row.unit),note:String(row.note??""),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function catRoutineFromRow(row:Row):CatRoutine{return{id:Number(row.id),scope:row.scope as CatRoutine["scope"],petId:row.pet_id===null?null:Number(row.pet_id),title:String(row.title),intervalValue:Number(row.interval_value),intervalUnit:row.interval_unit as CatRoutine["intervalUnit"],firstDueAt:String(row.first_due_at),lastCompletedAt:row.last_completed_at?String(row.last_completed_at):null,nextDueAt:String(row.next_due_at),reminderLeadMinutes:Number(row.reminder_lead_minutes??0),notes:String(row.notes??""),enabled:Boolean(row.enabled),reminderId:row.reminder_id===null?null:Number(row.reminder_id),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function reminderFromRow(row:Row):Reminder{return{id:Number(row.id),title:String(row.title),targetType:row.target_type as Reminder["targetType"],targetId:row.target_id===null?null:Number(row.target_id),sourceType:row.source_type?String(row.source_type):null,sourceId:row.source_id===null?null:Number(row.source_id),scheduleType:row.schedule_type as Reminder["scheduleType"],startsAt:String(row.starts_at),nextDueAt:row.next_due_at?String(row.next_due_at):null,dueHasExplicitTime:row.due_has_explicit_time===undefined?true:Boolean(row.due_has_explicit_time),intervalValue:row.interval_value===null?null:Number(row.interval_value),intervalUnit:row.interval_unit as Reminder["intervalUnit"],timesOfDay:Array.isArray(row.times_of_day)?row.times_of_day.map(String):[],endsAt:row.ends_at?String(row.ends_at):null,timezone:String(row.timezone),note:String(row.note??""),leadTimeMinutes:Number(row.lead_time_minutes??0),status:(row.status??"scheduled") as Reminder["status"],sentAt:row.sent_at?String(row.sent_at):null,cancelledAt:row.cancelled_at?String(row.cancelled_at):null,isActive:Boolean(row.is_active),lastCompletedAt:row.last_completed_at?String(row.last_completed_at):null,snoozedUntil:row.snoozed_until?String(row.snoozed_until):null,lastNotifiedAt:row.last_notified_at?String(row.last_notified_at):null,createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function reminderOccurrenceFromRow(row:Row):ReminderOccurrence{return{id:Number(row.id),reminderId:Number(row.reminder_id),action:row.action as ReminderOccurrence["action"],scheduledFor:String(row.scheduled_for),actedAt:String(row.acted_at),createdEventId:row.created_event_id===null?null:Number(row.created_event_id),createdAt:String(row.created_at)};}
function notificationDeliveryFromRow(row:Row):NotificationDelivery{return{id:Number(row.id),reminderId:row.reminder_id===null?null:Number(row.reminder_id),title:String(row.title),sourceType:row.source_type?String(row.source_type):null,sourceId:row.source_id===null?null:Number(row.source_id),targetType:row.target_type as Reminder["targetType"],targetId:row.target_id===null?null:Number(row.target_id),scheduledAt:String(row.scheduled_at),scheduledHasExplicitTime:row.scheduled_has_explicit_time===undefined?true:Boolean(row.scheduled_has_explicit_time),sentAt:row.sent_at?String(row.sent_at):null,status:row.status as NotificationDelivery["status"],createdAt:String(row.created_at)};}
function pushSubscriptionFromRow(row:Row):PushSubscriptionRecord{return{id:Number(row.id),endpoint:String(row.endpoint),p256dh:String(row.p256dh),auth:String(row.auth),createdAt:String(row.created_at),lastUsedAt:String(row.last_used_at)};}
function mappedPatch(input: Record<string, unknown>, map: Record<string, string>) { return Object.fromEntries(Object.entries(map).filter(([key]) => input[key] !== undefined).map(([key, column]) => [column, input[key]])); }
function relationPersonFromRow(row:Row):RelationPerson{return{id:Number(row.id),name:String(row.name),nickname:row.nickname?String(row.nickname):null,relationLabel:row.relation_label?String(row.relation_label):null,closenessRank:row.closeness_rank===null||row.closeness_rank===undefined?null:Number(row.closeness_rank) as RelationPerson["closenessRank"],relationshipStatus:(row.relationship_status??"active") as RelationPerson["relationshipStatus"],photoPath:row.photo_path?String(row.photo_path):null,birthday:row.birthday?String(row.birthday):null,likes:row.likes?String(row.likes):null,avoid:row.avoid?String(row.avoid):null,note:row.note?String(row.note):null,archivedAt:row.archived_at?String(row.archived_at):null,createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function relationEventFromRow(row:Row):RelationEvent{const parties=((row.relation_event_parties??[]) as Row[]).map(p=>({id:Number(p.id),partyType:p.party_type as "self"|"person",personId:p.person_id===null?null:Number(p.person_id),shareAmountMinor:p.share_amount_minor===null?null:Number(p.share_amount_minor),paidAmountMinor:p.paid_amount_minor===null?null:Number(p.paid_amount_minor)}));return{id:Number(row.id),eventType:row.event_type as RelationEvent["eventType"],title:String(row.title),note:row.note?String(row.note):null,occurredAt:String(row.occurred_at),occurredHasExplicitTime:Boolean(row.occurred_has_explicit_time),currency:"CNY",totalAmountMinor:row.total_amount_minor===null?null:Number(row.total_amount_minor),isInPerson:row.is_in_person===null?null:Boolean(row.is_in_person),parties,items:((row.relation_event_items??[]) as Row[]).map(i=>({id:Number(i.id),label:String(i.label),amountMinor:Number(i.amount_minor),sortOrder:Number(i.sort_order)})).sort((a,b)=>a.sortOrder-b.sortOrder),flows:((row.relation_event_flows??[]) as Row[]).map(f=>({id:Number(f.id),fromPartyId:Number(f.from_party_id),toPartyId:Number(f.to_party_id),flowType:f.flow_type as RelationEvent["flows"][number]["flowType"],amountMinor:Number(f.amount_minor),settlesFlowId:f.settles_flow_id===null?null:Number(f.settles_flow_id),note:f.note?String(f.note):null})),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function memoryNoteFromRow(row:Row):PersonMemoryNote{return{id:Number(row.id),personId:Number(row.person_id),content:String(row.content),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
const relationEventSelect="*,relation_event_parties(*),relation_event_items(*),relation_event_flows(*)";

const defaultAiSettings: Omit<InternalAiSettings, "apiKey" | "hasApiKey" | "updatedAt"> = {
  providerPreset: "openai", providerName: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini",
  enabled: false, temperature: 0.6, systemPrompt: "", responseLength: "balanced", initiative: "quiet",
  allowSuggestions: true, allowTeasing: true, includeTasks: true, includeMemories: true, allowWriteActions: false,
  userDisplayName: "我", userAvatarType: "default", userAvatarValue: "",
  assistantDisplayName: "Eva", assistantAvatarType: "default", assistantAvatarValue: "",
  showUserName: true, showAssistantName: true, showAvatars: true,
  maskedApiKey: null,
  providerId: null, modelConfigId: null,
};

function settingsFromRows(row: Row | null, provider: Row | null, model: Row | null): InternalAiSettings {
  const apiKey = provider ? resolveAiApiKey({
    ciphertext: provider.api_key_ciphertext ? String(provider.api_key_ciphertext) : null,
    iv: provider.api_key_iv ? String(provider.api_key_iv) : null,
    authTag: provider.api_key_auth_tag ? String(provider.api_key_auth_tag) : null,
  }) : "";
  return {
    providerPreset: provider ? String(provider.provider_type) : row ? String(row.provider_preset) : defaultAiSettings.providerPreset,
    providerName: provider ? String(provider.name) : row ? String(row.provider_name) : defaultAiSettings.providerName,
    baseUrl: provider ? String(provider.base_url) : row ? String(row.base_url) : defaultAiSettings.baseUrl,
    model: model ? String(model.model_id) : row ? String(row.model) : defaultAiSettings.model,
    enabled: Boolean(provider?.enabled && model?.enabled),
    providerId: provider ? Number(provider.id) : null,
    modelConfigId: model ? Number(model.id) : null,
    temperature: row ? Number(row.temperature) : defaultAiSettings.temperature,
    systemPrompt: row ? String(row.system_prompt) : defaultAiSettings.systemPrompt,
    responseLength: row ? row.response_length as InternalAiSettings["responseLength"] : defaultAiSettings.responseLength,
    initiative: row ? row.initiative as InternalAiSettings["initiative"] : defaultAiSettings.initiative,
    allowSuggestions: row ? Boolean(row.allow_suggestions) : defaultAiSettings.allowSuggestions,
    allowTeasing: row ? Boolean(row.allow_teasing) : defaultAiSettings.allowTeasing,
    includeTasks: row ? Boolean(row.include_tasks) : defaultAiSettings.includeTasks,
    includeMemories: row ? Boolean(row.include_memories) : defaultAiSettings.includeMemories,
    allowWriteActions: row ? Boolean(row.allow_write_actions) : defaultAiSettings.allowWriteActions,
    userDisplayName: row ? String(row.user_display_name) : defaultAiSettings.userDisplayName,
    userAvatarType: row ? row.user_avatar_type as InternalAiSettings["userAvatarType"] : defaultAiSettings.userAvatarType,
    userAvatarValue: row ? String(row.user_avatar_value) : defaultAiSettings.userAvatarValue,
    assistantDisplayName: row ? String(row.assistant_display_name) : defaultAiSettings.assistantDisplayName,
    assistantAvatarType: row ? row.assistant_avatar_type as InternalAiSettings["assistantAvatarType"] : defaultAiSettings.assistantAvatarType,
    assistantAvatarValue: row ? String(row.assistant_avatar_value) : defaultAiSettings.assistantAvatarValue,
    showUserName: row ? Boolean(row.show_user_name) : defaultAiSettings.showUserName,
    showAssistantName: row ? Boolean(row.show_assistant_name) : defaultAiSettings.showAssistantName,
    showAvatars: row ? Boolean(row.show_avatars) : defaultAiSettings.showAvatars,
    apiKey, hasApiKey: Boolean(apiKey), maskedApiKey: null,
    updatedAt: row ? String(row.updated_at) : "",
  };
}

function modelFromRow(row: Row): AiModelConfig {
  const capabilities = row.capabilities && typeof row.capabilities === "object" ? row.capabilities as Record<string, unknown> : {};
  return { id:Number(row.id),providerId:Number(row.provider_id),modelId:String(row.model_id),displayName:String(row.display_name),enabled:Boolean(row.enabled),isDefault:Boolean(row.is_default),capabilities,createdAt:String(row.created_at),updatedAt:String(row.updated_at) };
}

function providerFromRow(row: Row, models: AiModelConfig[] = []): AiProvider {
  const apiKey = resolveAiApiKey({ ciphertext: row.api_key_ciphertext ? String(row.api_key_ciphertext) : null, iv: row.api_key_iv ? String(row.api_key_iv) : null, authTag: row.api_key_auth_tag ? String(row.api_key_auth_tag) : null });
  return { id:Number(row.id),name:String(row.name),providerType:String(row.provider_type),baseUrl:String(row.base_url),enabled:Boolean(row.enabled),hasApiKey:Boolean(apiKey),maskedApiKey:maskApiKey(apiKey),models,createdAt:String(row.created_at),updatedAt:String(row.updated_at) };
}

function internalProviderFromRow(row: Row): InternalAiProvider {
  const apiKey = resolveAiApiKey({ ciphertext: row.api_key_ciphertext ? String(row.api_key_ciphertext) : null, iv: row.api_key_iv ? String(row.api_key_iv) : null, authTag: row.api_key_auth_tag ? String(row.api_key_auth_tag) : null });
  return { id:Number(row.id),name:String(row.name),providerType:String(row.provider_type),baseUrl:String(row.base_url),enabled:Boolean(row.enabled),apiKey,createdAt:String(row.created_at),updatedAt:String(row.updated_at) };
}

async function identity(client: SupabaseClient) {
  const { data, error } = await client.auth.getClaims();
  fail(error, "验证登录状态");
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : "";
  const email = typeof data?.claims?.email === "string" ? data.claims.email.toLocaleLowerCase() : "";
  const expected = allowedEmail();
  if (!expected) throw new Error("EVAORBIT_ALLOWED_EMAIL 未配置；已拒绝访问私人数据");
  if (!userId || email !== expected) throw new Error("当前账户无权访问 EvaOrbit");
  return userId;
}

async function oneSession(client: SupabaseClient, row: Row) {
  const sessionId = Number(row.id);
  const [{ data: latest, error: latestError }, { count, error: countError }] = await Promise.all([
    client.from("chat_messages").select("content").eq("session_id", sessionId).order("id", { ascending: false }).limit(1).maybeSingle(),
    client.from("chat_messages").select("id", { count: "exact", head: true }).eq("session_id", sessionId),
  ]);
  fail(latestError, "读取会话预览"); fail(countError, "统计会话消息");
  return sessionFromRow(row, latest?.content ? String(latest.content) : "", count ?? 0);
}

function buildSupabaseRepository(client: SupabaseClient, userId: string): EvaOrbitRepository {
  const catList = async <T>(table:string, mapper:(row:Row)=>T, petId:number|null|undefined, timeColumn="occurred_at") => { let request=client.from(table).select("*");if(petId===null)request=request.is("pet_id",null);else if(typeof petId==="number")request=request.eq("pet_id",petId);const{data,error}=await request.order(timeColumn,{ascending:false}).order("id",{ascending:false});fail(error,`读取 ${table}`);return(data as Row[]).map(mapper); };
  const catUpdate = async <T>(table:string,id:number,input:Record<string,unknown>,map:Record<string,string>,mapper:(row:Row)=>T) => {const patch=mappedPatch(input,map);if(!Object.keys(patch).length){const{data,error}=await client.from(table).select("*").eq("id",id).maybeSingle();fail(error,`读取 ${table}`);return data?mapper(data):null;}const{data,error}=await client.from(table).update(patch).eq("id",id).select().maybeSingle();fail(error,`更新 ${table}`);return data?mapper(data):null;};
  const runtimeSettings = async (modelConfigId: number | null = null) => {
    const [settingsResult, modelResult] = await Promise.all([
      client.from("ai_settings").select("*").maybeSingle(),
      modelConfigId
        ? client.from("ai_model_configs").select("*").eq("id", modelConfigId).maybeSingle()
        : client.from("ai_model_configs").select("*").eq("is_default", true).maybeSingle(),
    ]);
    fail(settingsResult.error, "读取 AI 设置"); fail(modelResult.error, "读取模型配置");
    if (modelConfigId && !modelResult.data) throw new ConflictError("当前会话选择的模型不存在");
    const model = modelResult.data as Row | null;
    const providerResult = model
      ? await client.from("ai_providers").select("*").eq("id", model.provider_id).maybeSingle()
      : { data: null, error: null };
    fail(providerResult.error, "读取 Provider");
    return settingsFromRows(settingsResult.data, providerResult.data as Row | null, model);
  };

  const repository: EvaOrbitRepository = {
    async listRelationPeople(input={}){let q=client.from("relation_people").select("*");if(!input.includeArchived)q=q.is("archived_at",null);if(input.relationshipStatus)q=q.eq("relationship_status",input.relationshipStatus);if(input.query){const v=`%${input.query.replace(/[\\%_]/g,"\\$&")}%`;q=q.or(`name.ilike.${postgrestQuoted(v)},nickname.ilike.${postgrestQuoted(v)},relation_label.ilike.${postgrestQuoted(v)}`);}const{data,error}=await q.order("updated_at",{ascending:false}).order("id",{ascending:false});fail(error,"读取人物");return(data as Row[]).map(relationPersonFromRow);},
    async getRelationPerson(id){const{data,error}=await client.from("relation_people").select("*").eq("id",id).maybeSingle();fail(error,"读取人物");return data?relationPersonFromRow(data):null;},
    async createRelationPerson(input){const{data,error}=await client.from("relation_people").insert({user_id:userId,name:input.name,nickname:input.nickname,relation_label:input.relationLabel,closeness_rank:input.closenessRank,relationship_status:input.relationshipStatus,birthday:input.birthday,likes:input.likes,avoid:input.avoid,note:input.note}).select().single();fail(error,"创建人物");return relationPersonFromRow(data);},
    async updateRelationPerson(id,input){const patch=mappedPatch(input,{name:"name",nickname:"nickname",relationLabel:"relation_label",closenessRank:"closeness_rank",relationshipStatus:"relationship_status",photoPath:"photo_path",birthday:"birthday",likes:"likes",avoid:"avoid",note:"note",archivedAt:"archived_at"});if(!Object.keys(patch).length)return repository.getRelationPerson(id);const{data,error}=await client.from("relation_people").update(patch).eq("id",id).select().maybeSingle();fail(error,"更新人物");return data?relationPersonFromRow(data):null;},
    async listRelationEvents(input={}){let eventIds:number[]|undefined;if(input.personId){const{data:links,error:linkError}=await client.from("relation_event_parties").select("event_id").eq("person_id",input.personId);fail(linkError,"读取人物往来索引");eventIds=(links as Row[]).map(row=>Number(row.event_id));if(!eventIds.length)return[];}let q=client.from("relation_events").select(relationEventSelect);if(eventIds)q=q.in("id",eventIds);if(input.from)q=q.gte("occurred_at",input.from);if(input.to)q=q.lt("occurred_at",input.to);const{data,error}=await q.order("occurred_at",{ascending:false}).order("id",{ascending:false}).limit(Math.min(Math.max(input.limit??200,1),500));fail(error,"读取人情往来");return(data as Row[]).map(relationEventFromRow);},
    async getRelationEvent(id){const{data,error}=await client.from("relation_events").select(relationEventSelect).eq("id",id).maybeSingle();fail(error,"读取人情往来");return data?relationEventFromRow(data):null;},
    async createRelationEvent(input){const{data,error}=await client.rpc("save_relation_event",{p_event_id:null,p_payload:input});fail(error,"创建人情往来");return(await repository.getRelationEvent(Number(data)))!;},
    async updateRelationEvent(id,input){const{data,error}=await client.rpc("save_relation_event",{p_event_id:id,p_payload:input});fail(error,"更新人情往来");return data?repository.getRelationEvent(Number(data)):null;},
    async deleteRelationEvent(id){const{data,error}=await client.from("relation_events").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除人情往来");return Boolean(data);},
    async listPersonMemoryNotes(personId){const{data,error}=await client.from("person_memory_notes").select("*").eq("person_id",personId).order("created_at",{ascending:false}).order("id",{ascending:false});fail(error,"读取记忆碎片");return(data as Row[]).map(memoryNoteFromRow);},
    async getPersonMemoryNote(id){const{data,error}=await client.from("person_memory_notes").select("*").eq("id",id).maybeSingle();fail(error,"读取记忆碎片");return data?memoryNoteFromRow(data):null;},
    async createPersonMemoryNote(personId,content){const{data,error}=await client.from("person_memory_notes").insert({user_id:userId,person_id:personId,content}).select().single();fail(error,"创建记忆碎片");return memoryNoteFromRow(data);},
    async updatePersonMemoryNote(id,content){const{data,error}=await client.from("person_memory_notes").update({content}).eq("id",id).select().maybeSingle();fail(error,"更新记忆碎片");return data?memoryNoteFromRow(data):null;},
    async deletePersonMemoryNote(id){const{data,error}=await client.from("person_memory_notes").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除记忆碎片");return Boolean(data);},
    async listTasks(filter: TaskFilter = "all") {
      let query = client.from("tasks").select("*");
      if (filter === "open") query = query.eq("completed", false);
      if (filter === "done") query = query.eq("completed", true);
      const { data, error } = await query.order("completed").order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });
      fail(error, "读取任务");
      const priority = { high: 0, medium: 1, low: 2 };
      return (data as Row[]).map(taskFromRow).sort((a, b) => Number(a.completed) - Number(b.completed) || priority[a.priority] - priority[b.priority]);
    },
    async getTask(id) {
      const { data, error } = await client.from("tasks").select("*").eq("id", id).maybeSingle();
      fail(error, "读取任务"); return data ? taskFromRow(data) : null;
    },
    async createTask(input: NewTask) {
      const { data, error } = await client.from("tasks").insert({ user_id: userId, title: input.title, notes: input.notes, due_date: input.dueDate, priority: input.priority, tags: input.tags }).select().single();
      fail(error, "创建任务"); return taskFromRow(data);
    },
    async updateTask(id, input) {
      const map: Record<string, string> = { title: "title", notes: "notes", completed: "completed", dueDate: "due_date", priority: "priority", tags: "tags" };
      const patch = Object.fromEntries(Object.entries(map).filter(([key]) => input[key] !== undefined).map(([key, column]) => [column, input[key]]));
      if (!Object.keys(patch).length) return repository.getTask(id);
      const { data, error } = await client.from("tasks").update(patch).eq("id", id).select().maybeSingle();
      fail(error, "更新任务"); return data ? taskFromRow(data) : null;
    },
    async deleteTask(id) {
      const { data, error } = await client.from("tasks").delete().eq("id", id).select("id").maybeSingle();
      fail(error, "删除任务"); return Boolean(data);
    },
    async listMemories(query = "", category = "") {
      let request = client.from("memories").select("*");
      if (query) request = request.ilike("search_text", `%${query.replace(/[\\%_]/g, "\\$&")}%`);
      if (category) request = request.eq("category", category);
      const { data, error } = await request.order("updated_at", { ascending: false }).order("id", { ascending: false });
      fail(error, "读取记忆"); return (data as Row[]).map(memoryFromRow);
    },
    async getMemory(id) {
      const { data, error } = await client.from("memories").select("*").eq("id", id).maybeSingle();
      fail(error, "读取记忆"); return data ? memoryFromRow(data) : null;
    },
    async createMemory(input) {
      const { data, error } = await client.from("memories").insert({ user_id: userId, ...input }).select().single();
      fail(error, "创建记忆"); return memoryFromRow(data);
    },
    async updateMemory(id, input) {
      const patch = Object.fromEntries(["title", "content", "category"].filter((key) => input[key] !== undefined).map((key) => [key, input[key]]));
      if (!Object.keys(patch).length) return repository.getMemory(id);
      const { data, error } = await client.from("memories").update(patch).eq("id", id).select().maybeSingle();
      fail(error, "更新记忆"); return data ? memoryFromRow(data) : null;
    },
    async deleteMemory(id) {
      const { data, error } = await client.from("memories").delete().eq("id", id).select("id").maybeSingle();
      fail(error, "删除记忆"); return Boolean(data);
    },
    async getDashboardSummary() {
      const [tasks, memories] = await Promise.all([repository.listTasks(), repository.listMemories()]);
      const today = new Date().toLocaleDateString("en-CA");
      return {
        openTasks: tasks.filter((task) => !task.completed).length,
        dueToday: tasks.filter((task) => !task.completed && task.dueDate === today).length,
        memories: memories.length,
        recentTasks: [...tasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4),
        recentMemories: memories.slice(0, 3),
      };
    },
    async getUiPreferences() {
      const { data, error } = await client.from("ui_preferences").select("home_module_order,appearance_mode,color_theme,updated_at").maybeSingle();
      fail(error, "Read UI preferences");
      return { homeModuleOrder: normalizeHomeModuleOrder(data?.home_module_order), appearanceMode: normalizeAppearanceMode(data?.appearance_mode), colorTheme: normalizeColorTheme(data?.color_theme), updatedAt: data?.updated_at ? String(data.updated_at) : "" };
    },
    async updateHomeModuleOrder(order: HomeModuleId[]) {
      const { data, error } = await client.from("ui_preferences").upsert({ user_id: userId, home_module_order: normalizeHomeModuleOrder(order) }, { onConflict: "user_id" }).select("home_module_order,appearance_mode,color_theme,updated_at").single();
      fail(error, "Save home module order");
      if (!data) throw new Error("Save home module order failed");
      return { homeModuleOrder: normalizeHomeModuleOrder(data.home_module_order), appearanceMode: normalizeAppearanceMode(data.appearance_mode), colorTheme: normalizeColorTheme(data.color_theme), updatedAt: String(data.updated_at) };
    },
    async updateAppearancePreferences(input) {
      const values = { user_id: userId, appearance_mode: input.appearanceMode, color_theme: input.colorTheme };
      const { data, error } = await client.from("ui_preferences").upsert(values, { onConflict: "user_id" }).select("home_module_order,appearance_mode,color_theme,updated_at").single();
      fail(error, "Save appearance preferences");
      if (!data) throw new Error("Save appearance preferences failed");
      return { homeModuleOrder: normalizeHomeModuleOrder(data.home_module_order), appearanceMode: normalizeAppearanceMode(data.appearance_mode), colorTheme: normalizeColorTheme(data.color_theme), updatedAt: String(data.updated_at) };
    },
    async getAiSettings() {
      return runtimeSettings();
    },
    async updateAiSettings(input: AiSettingsInput) {
      const values: Row = {
        user_id: userId, temperature: input.temperature, system_prompt: input.systemPrompt,
        response_length: input.responseLength, initiative: input.initiative, allow_suggestions: input.allowSuggestions,
        allow_teasing: input.allowTeasing, include_tasks: input.includeTasks, include_memories: input.includeMemories,
        allow_write_actions: input.allowWriteActions,
        user_display_name: input.userDisplayName, user_avatar_type: input.userAvatarType, user_avatar_value: input.userAvatarValue,
        assistant_display_name: input.assistantDisplayName, assistant_avatar_type: input.assistantAvatarType, assistant_avatar_value: input.assistantAvatarValue,
        show_user_name: input.showUserName, show_assistant_name: input.showAssistantName, show_avatars: input.showAvatars,
      };
      const { error } = await client.from("ai_settings").upsert(values, { onConflict: "user_id" });
      fail(error, "保存 AI 设置");
      return runtimeSettings();
    },
    async updateChatPreferences(input) {
      const { error } = await client.from("ai_settings").upsert({
        user_id: userId,
        user_display_name: input.userDisplayName, user_avatar_type: input.userAvatarType, user_avatar_value: input.userAvatarValue,
        assistant_display_name: input.assistantDisplayName, assistant_avatar_type: input.assistantAvatarType, assistant_avatar_value: input.assistantAvatarValue,
        show_user_name: input.showUserName, show_assistant_name: input.showAssistantName, show_avatars: input.showAvatars,
      }, { onConflict: "user_id" });
      fail(error, "保存对话身份");
      return runtimeSettings();
    },
    async getAiRuntimeSettings(modelConfigId) { return runtimeSettings(modelConfigId ?? null); },
    async listAiProviders() {
      const [{ data: providers, error: providerError }, { data: models, error: modelError }] = await Promise.all([
        client.from("ai_providers").select("*").order("enabled", { ascending: false }).order("updated_at", { ascending: false }),
        client.from("ai_model_configs").select("*").order("is_default", { ascending: false }).order("display_name"),
      ]);
      fail(providerError, "读取 Providers"); fail(modelError, "读取模型配置");
      const parsedModels = (models as Row[]).map(modelFromRow);
      return (providers as Row[]).map((row) => providerFromRow(row, parsedModels.filter((model) => model.providerId === Number(row.id))));
    },
    async getAiProvider(id) {
      const { data, error } = await client.from("ai_providers").select("*").eq("id", id).maybeSingle();
      fail(error, "读取 Provider"); return data ? internalProviderFromRow(data) : null;
    },
    async createAiProvider(input: AiProviderInput) {
      const encrypted = input.apiKey ? encryptAiApiKey(input.apiKey) : { ciphertext: null, iv: null, authTag: null };
      const { data, error } = await client.from("ai_providers").insert({ user_id:userId,name:input.name,provider_type:input.providerType,base_url:input.baseUrl,enabled:input.enabled,api_key_ciphertext:encrypted.ciphertext,api_key_iv:encrypted.iv,api_key_auth_tag:encrypted.authTag }).select().single();
      fail(error, "创建 Provider"); return providerFromRow(data);
    },
    async updateAiProvider(id, input: AiProviderInput) {
      const current = await repository.getAiProvider(id); if (!current) return null;
      if (!input.enabled) {
        const { count, error } = await client.from("ai_model_configs").select("id", { count:"exact", head:true }).eq("provider_id", id).eq("is_default", true);
        fail(error, "检查默认模型"); if (count) throw new ConflictError("这个 Provider 正在承载全局默认模型，请先更换默认模型");
      }
      const secret = input.clearApiKey ? {api_key_ciphertext:null,api_key_iv:null,api_key_auth_tag:null} : input.apiKey !== undefined ? (()=>{const encrypted=encryptAiApiKey(input.apiKey!);return{api_key_ciphertext:encrypted.ciphertext,api_key_iv:encrypted.iv,api_key_auth_tag:encrypted.authTag};})() : {};
      const { data, error } = await client.from("ai_providers").update({name:input.name,provider_type:input.providerType,base_url:input.baseUrl,enabled:input.enabled,...secret}).eq("id",id).select().maybeSingle();
      fail(error,"保存 Provider"); return data ? providerFromRow(data,(await repository.listAiProviders()).find((provider)=>provider.id===id)?.models ?? []) : null;
    },
    async deleteAiProvider(id) {
      const [{count:sessions,error:sessionError},{count:messages,error:messageError},{count:defaults,error:defaultError}] = await Promise.all([
        client.from("chat_sessions").select("id",{count:"exact",head:true}).eq("provider_id",id),
        client.from("chat_messages").select("id",{count:"exact",head:true}).eq("provider_id",id),
        client.from("ai_model_configs").select("id",{count:"exact",head:true}).eq("provider_id",id).eq("is_default",true),
      ]); fail(sessionError,"检查会话引用");fail(messageError,"检查消息引用");fail(defaultError,"检查默认模型");
      if(defaults)throw new ConflictError("这个 Provider 正在承载全局默认模型，请先把另一个模型设为默认");
      if ((sessions??0)+(messages??0)>0) throw new ConflictError(`这个 Provider 仍被 ${(sessions??0)+(messages??0)} 条会话或消息使用，不能删除；可以先停用`);
      const {data,error}=await client.from("ai_providers").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除 Provider");return Boolean(data);
    },
    async createAiModelConfig(providerId, input: AiModelConfigInput) {
      const providers=await repository.listAiProviders(); const provider=providers.find((item)=>item.id===providerId); if(!provider) throw new ConflictError("Provider 不存在");
      const makeDefault=input.isDefault || (!providers.some((item)=>item.models.some((model)=>model.isDefault)) && input.enabled && provider.enabled);
      const {data,error}=await client.from("ai_model_configs").insert({user_id:userId,provider_id:providerId,model_id:input.modelId,display_name:input.displayName,enabled:input.enabled,is_default:false,capabilities:input.capabilities}).select().single();fail(error,"添加模型");
      if(makeDefault){const{error:defaultError}=await client.rpc("set_ai_default_model",{p_model_id:Number(data.id)});fail(defaultError,"设置默认模型");data.is_default=true;}
      return modelFromRow(data);
    },
    async updateAiModelConfig(id, input: AiModelConfigInput) {
      const {data:current,error:currentError}=await client.from("ai_model_configs").select("*").eq("id",id).maybeSingle();fail(currentError,"读取模型配置");if(!current)return null;
      if(Boolean(current.is_default)&&(!input.isDefault||!input.enabled)) throw new ConflictError("请先把另一个已启用模型设为全局默认，再停用或取消当前默认模型");
      if(input.isDefault){const provider=await repository.getAiProvider(Number(current.provider_id));if(!provider?.enabled||!input.enabled)throw new ConflictError("只有已启用 Provider 下的已启用模型可以设为默认");const{error}=await client.rpc("set_ai_default_model",{p_model_id:id});fail(error,"更新默认模型");}
      const{data,error}=await client.from("ai_model_configs").update({model_id:input.modelId,display_name:input.displayName,enabled:input.enabled,is_default:input.isDefault,capabilities:input.capabilities}).eq("id",id).select().maybeSingle();fail(error,"保存模型");return data?modelFromRow(data):null;
    },
    async deleteAiModelConfig(id) {
      const [{count:sessions,error:sessionError},{count:messages,error:messageError},{data:current,error:currentError}] = await Promise.all([client.from("chat_sessions").select("id",{count:"exact",head:true}).eq("model_config_id",id),client.from("chat_messages").select("id",{count:"exact",head:true}).eq("model_config_id",id),client.from("ai_model_configs").select("is_default").eq("id",id).maybeSingle()]);fail(sessionError,"检查会话引用");fail(messageError,"检查消息引用");fail(currentError,"读取模型配置");if(!current)return false;if(current.is_default)throw new ConflictError("这是全局默认模型，请先把另一个模型设为默认");if((sessions??0)+(messages??0)>0)throw new ConflictError(`这个模型仍被 ${(sessions??0)+(messages??0)} 条会话或消息使用，不能删除；可以先停用`);
      const{data,error}=await client.from("ai_model_configs").delete().eq("id",id).select("id,is_default").maybeSingle();fail(error,"删除模型");
      if(data?.is_default){const{data:replacement,error:replacementError}=await client.from("ai_model_configs").select("id,ai_providers!inner(enabled)").eq("enabled",true).eq("ai_providers.enabled",true).order("id").limit(1).maybeSingle();fail(replacementError,"选择默认模型");if(replacement)await client.from("ai_model_configs").update({is_default:true}).eq("id",replacement.id);}
      return Boolean(data);
    },
    async listChatSessions() {
      const { data, error } = await client.from("chat_sessions").select("*,ai_providers(name),ai_model_configs(display_name)").order("updated_at", { ascending: false }).order("id", { ascending: false });
      fail(error, "读取会话"); return Promise.all((data as Row[]).map((row) => oneSession(client, row)));
    },
    async getChatSession(id) {
      const { data, error } = await client.from("chat_sessions").select("*,ai_providers(name),ai_model_configs(display_name)").eq("id", id).maybeSingle();
      fail(error, "读取会话"); return data ? oneSession(client, data) : null;
    },
    async createChatSession(title = "New conversation", requestedModelConfigId) {
      const {data:model,error:modelError}=requestedModelConfigId
        ? await client.from("ai_model_configs").select("*").eq("id",requestedModelConfigId).maybeSingle()
        : await client.from("ai_model_configs").select("*").eq("is_default",true).maybeSingle();
      fail(modelError,"读取默认模型");if(requestedModelConfigId&&(!model||!model.enabled))throw new ConflictError("选择的模型不存在或已停用");
      if(model){const{data:provider,error:providerError}=await client.from("ai_providers").select("enabled").eq("id",model.provider_id).maybeSingle();fail(providerError,"读取 Provider");if(!provider?.enabled)throw new ConflictError("这个模型所属的 Provider 已停用");}
      const { data, error } = await client.from("chat_sessions").insert({ user_id: userId, title, provider_id:model?.provider_id??null,model_config_id:model?.id??null,model:model?.model_id??null }).select("*,ai_providers(name),ai_model_configs(display_name)").single();
      fail(error, "创建会话"); return sessionFromRow(data);
    },
    async updateChatSession(id, input) {
      const patch:Row={};if(input.title!==undefined)patch.title=input.title;
      if(input.modelConfigId!==undefined){const{data:model,error:modelError}=await client.from("ai_model_configs").select("*,ai_providers(enabled)").eq("id",input.modelConfigId).maybeSingle();fail(modelError,"读取模型配置");const provider=model?.ai_providers as Row|undefined;if(!model||!model.enabled||!provider?.enabled)throw new ConflictError("选择的模型不存在或已停用");patch.provider_id=model.provider_id;patch.model_config_id=model.id;patch.model=model.model_id;}
      const { data, error } = await client.from("chat_sessions").update(patch).eq("id", id).select("*,ai_providers(name),ai_model_configs(display_name)").maybeSingle();
      fail(error, "更新会话"); return data ? oneSession(client, data) : null;
    },
    async deleteChatSession(id) {
      const { data, error } = await client.from("chat_sessions").delete().eq("id", id).select("id").maybeSingle();
      fail(error, "删除会话"); return Boolean(data);
    },
    async listChatMessages(sessionId) {
      const { data, error } = await client.from("chat_messages").select("*").eq("session_id", sessionId).order("id");
      fail(error, "读取消息"); return (data as Row[]).map(messageFromRow);
    },
    async addChatMessage(sessionId, role, content, model = null, providerId = null, modelConfigId = null) {
      const { data, error } = await client.from("chat_messages").insert({ user_id: userId, session_id: sessionId, role, content, model, provider_id:providerId, model_config_id:modelConfigId }).select().single();
      fail(error, "保存消息");
      const sessionPatch = model ? { model } : { updated_at: new Date().toISOString() };
      const { error: sessionError } = await client.from("chat_sessions").update(sessionPatch).eq("id", sessionId);
      fail(sessionError, "更新会话"); return messageFromRow(data);
    },
    async listInbox(status = "inbox") {
      let request = client.from("inbox_items").select("*"); if (status !== "all") request = request.eq("status", status);
      const { data, error } = await request.order("created_at", { ascending: false }).order("id", { ascending: false }); fail(error,"读取 Inbox"); return (data as Row[]).map(inboxFromRow);
    },
    async getInboxItem(id) { const {data,error}=await client.from("inbox_items").select("*").eq("id",id).maybeSingle();fail(error,"读取 Inbox");return data?inboxFromRow(data):null; },
    async createInboxItem(input) { const {data,error}=await client.from("inbox_items").insert({user_id:userId,content:input.content,source:input.source}).select().single();fail(error,"写入 Inbox");return inboxFromRow(data); },
    async updateInboxItem(id,input) { const patch=mappedPatch(input,{content:"content",status:"status",processedAt:"processed_at",convertedType:"converted_type",convertedId:"converted_id"});if(!Object.keys(patch).length)return repository.getInboxItem(id);const{data,error}=await client.from("inbox_items").update(patch).eq("id",id).select().maybeSingle();fail(error,"更新 Inbox");return data?inboxFromRow(data):null; },
    async deleteInboxItem(id){const{data,error}=await client.from("inbox_items").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除 Inbox");return Boolean(data);},
    async listFoodLogs(input={}) { let request=client.from("food_logs").select("*,food_places(name,branch),food_dishes(name)");if(input.query){const pattern=postgrestQuoted(`%${input.query.replace(/[\\%_]/g,"\\$&")}%`);request=request.or(`search_text.ilike.${pattern}`);}if(input.mealType)request=request.eq("meal_type",input.mealType);if(input.from)request=request.gte("occurred_at",input.from);if(input.to)request=request.lt("occurred_at",input.to);if(input.foodPlaceId)request=request.eq("food_place_id",input.foodPlaceId);if(input.foodDishId)request=request.eq("food_dish_id",input.foodDishId);const limit=Math.min(Math.max(input.limit??500,1),500);const{data,error}=await request.order("occurred_at",{ascending:false}).order("id",{ascending:false}).limit(limit);fail(error,"读取饮食记录");return(data as Row[]).map(foodFromRow);},
    async getFoodLog(id){const{data,error}=await client.from("food_logs").select("*,food_places(name,branch),food_dishes(name)").eq("id",id).maybeSingle();fail(error,"读取饮食记录");return data?foodFromRow(data):null;},
    async createFoodLog(input){const{data,error}=await client.from("food_logs").insert({user_id:userId,occurred_at:input.occurredAt,meal_type:input.mealType,title:input.title,description:input.description,portion:input.portion,scene:input.scene,rating:input.rating,estimated_kcal:input.estimatedKcal,kcal_min:input.kcalMin,kcal_max:input.kcalMax,confidence:input.confidence,notes:input.notes,image_url:input.imageUrl,attachment_id:input.attachmentId,food_place_id:input.foodPlaceId,food_dish_id:input.foodDishId}).select("*,food_places(name,branch),food_dishes(name)").single();fail(error,"创建饮食记录");return foodFromRow(data);},
    async updateFoodLog(id,input){const patch=mappedPatch(input,{occurredAt:"occurred_at",mealType:"meal_type",title:"title",description:"description",portion:"portion",scene:"scene",rating:"rating",estimatedKcal:"estimated_kcal",kcalMin:"kcal_min",kcalMax:"kcal_max",confidence:"confidence",notes:"notes",imageUrl:"image_url",attachmentId:"attachment_id",foodPlaceId:"food_place_id",foodDishId:"food_dish_id"});if(!Object.keys(patch).length)return repository.getFoodLog(id);const{data,error}=await client.from("food_logs").update(patch).eq("id",id).select("*,food_places(name,branch),food_dishes(name)").maybeSingle();fail(error,"更新饮食记录");return data?foodFromRow(data):null;},
    async deleteFoodLog(id){const{data,error}=await client.from("food_logs").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除饮食记录");return Boolean(data);},
    async searchFoodLibrary(query="",brand="",options:FoodLibrarySearchOptions={}){let request=client.from("food_library").select("*").is("archived_at",null);const keyword=foodLibrarySearchValue(query);if(keyword)request=request.or(`name.ilike.%${keyword}%,brand.ilike.%${keyword}%`);if(options.name)request=request.ilike("name",`%${foodLibrarySearchValue(options.name)}%`);if(brand)request=request.eq("brand",brand);if(options.category)request=request.eq("category",options.category);const limit=Math.min(Math.max(options.limit??100,1),100);const{data,error}=await request.order("updated_at",{ascending:false}).limit(limit);fail(error,"搜索 Food Library");return(data as Row[]).map(libraryFromRow);},
    async getFoodLibraryItem(id){const{data,error}=await client.from("food_library").select("*").eq("id",id).maybeSingle();fail(error,"读取 Food Library");return data?libraryFromRow(data):null;},
    async upsertFoodLibraryItem(input){const values={user_id:userId,name:input.name,brand:input.brand,category:input.category,default_portion:input.defaultPortion,reference_type:input.referenceType,reference_energy_kj:input.referenceEnergyKj,reference_kcal:input.referenceKcal,serving_weight:input.servingWeight,serving_kcal:input.servingKcal,data_source:input.dataSource,notes:input.notes,archived_at:null};const{data,error}=await client.from("food_library").upsert(values,{onConflict:"user_id,name,brand"}).select().single();fail(error,"保存 Food Library");return libraryFromRow(data);},
    async updateFoodLibraryItem(id,input){const values={name:input.name,brand:input.brand,category:input.category,default_portion:input.defaultPortion,reference_type:input.referenceType,reference_energy_kj:input.referenceEnergyKj,reference_kcal:input.referenceKcal,serving_weight:input.servingWeight,serving_kcal:input.servingKcal,data_source:input.dataSource,notes:input.notes};const{data,error}=await client.from("food_library").update(values).eq("id",id).is("archived_at",null).select().maybeSingle();fail(error,"更新 Food Library");return data?libraryFromRow(data):null;},
    async removeFoodLibraryItem(id){const{data:item,error:itemError}=await client.from("food_library").select("id").eq("id",id).maybeSingle();fail(itemError,"读取 Food Library");if(!item)return null;const{count,error:countError}=await client.from("drink_logs").select("id",{count:"exact",head:true}).eq("food_library_id",id);fail(countError,"检查 Food Library 引用");if((count??0)>0){const{data,error}=await client.from("food_library").update({archived_at:new Date().toISOString()}).eq("id",id).select("id").maybeSingle();fail(error,"归档 Food Library");return data?{id,action:"archived"}:null;}const{data,error}=await client.from("food_library").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除 Food Library");return data?{id,action:"deleted"}:null;},
    async listFoodPlaces(query="",options={}){let request=client.from("food_places").select("*");if(!options.includeArchived)request=request.is("archived_at",null);if(query.trim()){const pattern=postgrestQuoted(`%${query.trim().replace(/[\\%_]/g,"\\$&")}%`);request=request.or(`name.ilike.${pattern},branch.ilike.${pattern},category.ilike.${pattern},notes.ilike.${pattern}`);}if(options.status)request=request.eq("status",options.status);if(options.category)request=request.eq("category",options.category);const limit=Math.min(Math.max(options.limit??100,1),200);const{data,error}=await request.order("updated_at",{ascending:false}).limit(limit);fail(error,"读取店铺库");const rows=data as Row[],ids=rows.map(row=>Number(row.id));if(!ids.length)return[];const[{data:dishes,error:dishError},{data:logs,error:logError}]=await Promise.all([client.from("food_dishes").select("id,food_place_id,archived_at").in("food_place_id",ids),client.from("food_logs").select("id,food_place_id,occurred_at").in("food_place_id",ids)]);fail(dishError,"统计店铺菜品");fail(logError,"统计店铺记录");return rows.map(row=>{const id=Number(row.id),activeDishes=(dishes as Row[]).filter(item=>Number(item.food_place_id)===id&&!item.archived_at),visits=(logs as Row[]).filter(item=>Number(item.food_place_id)===id);return foodPlaceFromRow(row,{dishCount:activeDishes.length,visitCount:visits.length,lastVisitedAt:visits.reduce<string|null>((latest,item)=>!latest||String(item.occurred_at)>latest?String(item.occurred_at):latest,null)});});},
    async getFoodPlace(id){const[{data,error},{data:dishes,error:dishError},{data:logs,error:logError}]=await Promise.all([client.from("food_places").select("*").eq("id",id).maybeSingle(),client.from("food_dishes").select("id,archived_at").eq("food_place_id",id),client.from("food_logs").select("id,occurred_at").eq("food_place_id",id)]);fail(error,"读取店铺");fail(dishError,"统计店铺菜品");fail(logError,"统计店铺记录");if(!data)return null;const visits=logs as Row[];return foodPlaceFromRow(data,{dishCount:(dishes as Row[]).filter(item=>!item.archived_at).length,visitCount:visits.length,lastVisitedAt:visits.reduce<string|null>((latest,item)=>!latest||String(item.occurred_at)>latest?String(item.occurred_at):latest,null)});},
    async createFoodPlace(input){const{data,error}=await client.from("food_places").insert({user_id:userId,name:input.name,branch:input.branch,category:input.category,rating:input.rating,status:input.status,notes:input.notes}).select().single();fail(error,"创建店铺");return foodPlaceFromRow(data);},
    async updateFoodPlace(id,input){const patch=mappedPatch(input,{name:"name",branch:"branch",category:"category",rating:"rating",status:"status",notes:"notes"});if(!Object.keys(patch).length)return repository.getFoodPlace(id);const{data,error}=await client.from("food_places").update(patch).eq("id",id).select().maybeSingle();fail(error,"更新店铺");return data?foodPlaceFromRow(data):null;},
    async removeFoodPlace(id){const place=await repository.getFoodPlace(id);if(!place)return null;const{count,error:countError}=await client.from("food_logs").select("id",{count:"exact",head:true}).eq("food_place_id",id);fail(countError,"检查店铺引用");if((count??0)>0){const{data,error}=await client.from("food_places").update({status:"closed",archived_at:new Date().toISOString()}).eq("id",id).select("id").maybeSingle();fail(error,"归档店铺");return data?{id,action:"archived"}:null;}const{data,error}=await client.from("food_places").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除店铺");return data?{id,action:"deleted"}:null;},
    async listFoodDishes(query="",options={}){let request=client.from("food_dishes").select("*");if(!options.includeArchived)request=request.is("archived_at",null);if(query.trim()){const pattern=postgrestQuoted(`%${query.trim().replace(/[\\%_]/g,"\\$&")}%`);request=request.or(`name.ilike.${pattern},category.ilike.${pattern},notes.ilike.${pattern}`);}if(options.foodPlaceId)request=request.eq("food_place_id",options.foodPlaceId);if(options.recommended!==undefined)request=request.eq("recommended",options.recommended);if(options.rating!==undefined)request=options.rating===null?request.is("rating",null):request.eq("rating",options.rating);const limit=Math.min(Math.max(options.limit??100,1),200);const{data,error}=await request.order("recommended",{ascending:false}).order("updated_at",{ascending:false}).limit(limit);fail(error,"读取店铺菜品");const rows=data as Row[],ids=rows.map(row=>Number(row.id));if(!ids.length)return[];const{data:logs,error:logError}=await client.from("food_logs").select("id,food_dish_id,occurred_at").in("food_dish_id",ids);fail(logError,"统计菜品记录");return rows.map(row=>{const id=Number(row.id),eaten=(logs as Row[]).filter(item=>Number(item.food_dish_id)===id);return foodDishFromRow(row,{eatCount:eaten.length,lastEatenAt:eaten.reduce<string|null>((latest,item)=>!latest||String(item.occurred_at)>latest?String(item.occurred_at):latest,null)});});},
    async getFoodDish(id){const{data,error}=await client.from("food_dishes").select("*").eq("id",id).maybeSingle();fail(error,"读取菜品");if(!data)return null;const{data:logs,error:logError}=await client.from("food_logs").select("occurred_at").eq("food_dish_id",id);fail(logError,"统计菜品记录");const eaten=logs as Row[];return foodDishFromRow(data,{eatCount:eaten.length,lastEatenAt:eaten.reduce<string|null>((latest,item)=>!latest||String(item.occurred_at)>latest?String(item.occurred_at):latest,null)});},
    async createFoodDish(input){const{data,error}=await client.from("food_dishes").insert({user_id:userId,food_place_id:input.foodPlaceId,name:input.name,category:input.category,rating:input.rating,recommended:input.recommended,notes:input.notes}).select().single();fail(error,"创建菜品");return foodDishFromRow(data);},
    async updateFoodDish(id,input){const patch=mappedPatch(input,{foodPlaceId:"food_place_id",name:"name",category:"category",rating:"rating",recommended:"recommended",notes:"notes"});if(!Object.keys(patch).length)return repository.getFoodDish(id);const{data,error}=await client.from("food_dishes").update(patch).eq("id",id).select().maybeSingle();fail(error,"更新菜品");return data?foodDishFromRow(data):null;},
    async removeFoodDish(id){const dish=await repository.getFoodDish(id);if(!dish)return null;const{count,error:countError}=await client.from("food_logs").select("id",{count:"exact",head:true}).eq("food_dish_id",id);fail(countError,"检查菜品引用");if((count??0)>0){const{data,error}=await client.from("food_dishes").update({archived_at:new Date().toISOString()}).eq("id",id).select("id").maybeSingle();fail(error,"归档菜品");return data?{id,action:"archived"}:null;}const{data,error}=await client.from("food_dishes").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除菜品");return data?{id,action:"deleted"}:null;},
    async listHealthRecords(input:HealthRecordListInput={}){let request=client.from("health_records").select("*");if(input.status)request=request.eq("status",input.status);if(input.type)request=request.eq("type",input.type);if(input.from)request=request.gte("occurred_at",input.from);if(input.to)request=request.lt("occurred_at",input.to);const limit=Math.min(Math.max(input.limit??100,1),100);const{data,error}=await request.order("occurred_at",{ascending:false}).order("id",{ascending:false}).limit(limit);fail(error,"读取健康记录");return(data as Row[]).map(healthRecordFromRow);},
    async getHealthRecord(id){const{data,error}=await client.from("health_records").select("*").eq("id",id).maybeSingle();fail(error,"读取健康记录");return data?healthRecordFromRow(data):null;},
    async createHealthRecord(input){const{data,error}=await client.from("health_records").insert({user_id:userId,occurred_at:input.occurredAt,occurred_has_explicit_time:input.occurredHasExplicitTime,type:input.type,title:input.title,summary:input.summary,status:input.status,started_at:input.startedAt,started_has_explicit_time:input.startedHasExplicitTime,ended_at:input.endedAt,ended_has_explicit_time:input.endedHasExplicitTime,details:input.details}).select().single();fail(error,"创建健康记录");return healthRecordFromRow(data);},
    async updateHealthRecord(id,input){const patch=mappedPatch(input,{occurredAt:"occurred_at",occurredHasExplicitTime:"occurred_has_explicit_time",type:"type",title:"title",summary:"summary",status:"status",startedAt:"started_at",startedHasExplicitTime:"started_has_explicit_time",endedAt:"ended_at",endedHasExplicitTime:"ended_has_explicit_time",details:"details"});if(!Object.keys(patch).length)return repository.getHealthRecord(id);const{data,error}=await client.from("health_records").update(patch).eq("id",id).select().maybeSingle();fail(error,"更新健康记录");return data?healthRecordFromRow(data):null;},
    async deleteHealthRecord(id){const{data,error}=await client.from("health_records").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除健康记录");return Boolean(data);},
    async listTrainingLogs(input={}){let request=client.from("training_logs").select("*");if(input.from)request=request.gte("occurred_at",input.from);if(input.to)request=request.lt("occurred_at",input.to);const limit=Math.min(Math.max(input.limit??100,1),100);const{data,error}=await request.order("occurred_at",{ascending:false}).order("id",{ascending:false}).limit(limit);fail(error,"读取训练记录");return(data as Row[]).map(trainingLogFromRow);},
    async getTrainingLog(id){const{data,error}=await client.from("training_logs").select("*").eq("id",id).maybeSingle();fail(error,"读取训练记录");return data?trainingLogFromRow(data):null;},
    async createTrainingLog(input){const{data,error}=await client.from("training_logs").insert({user_id:userId,occurred_at:input.occurredAt,occurred_has_explicit_time:input.occurredHasExplicitTime,training_type:input.trainingType,body_parts:input.bodyParts,teacher:input.teacher,course:input.course,duration_minutes:input.durationMinutes,notes:input.notes}).select().single();fail(error,"创建训练记录");return trainingLogFromRow(data);},
    async updateTrainingLog(id,input){const patch=mappedPatch(input,{occurredAt:"occurred_at",occurredHasExplicitTime:"occurred_has_explicit_time",trainingType:"training_type",bodyParts:"body_parts",teacher:"teacher",course:"course",durationMinutes:"duration_minutes",notes:"notes"});if(!Object.keys(patch).length)return repository.getTrainingLog(id);const{data,error}=await client.from("training_logs").update(patch).eq("id",id).select().maybeSingle();fail(error,"更新训练记录");return data?trainingLogFromRow(data):null;},
    async deleteTrainingLog(id){const{data,error}=await client.from("training_logs").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除训练记录");return Boolean(data);},
    async listMediaItems(input={}){let request=client.from("media_items").select("*,media_series(name)");if(input.query){const pattern=postgrestQuoted(`%${input.query.replace(/[\\%_]/g,"\\$&")}%`);request=request.or(`title.ilike.${pattern},original_title.ilike.${pattern},translated_title.ilike.${pattern},season_title.ilike.${pattern}`);}if(input.mediaType)request=request.eq("media_type",input.mediaType);if(input.status)request=request.eq("status",input.status);if(input.rating)request=request.eq("rating",input.rating);if(input.seriesId)request=request.eq("series_id",input.seriesId);if(input.favorite!==undefined)request=request.eq("is_favorite",input.favorite);const limit=Math.min(Math.max(input.limit??100,1),200);const{data,error}=await request.order("updated_at",{ascending:false}).order("id",{ascending:false}).limit(limit);fail(error,"读取 Media");return(data as Row[]).map(mediaItemFromRow);},
    async getMediaItem(id){const{data,error}=await client.from("media_items").select("*,media_series(name)").eq("id",id).maybeSingle();fail(error,"读取 Media");return data?mediaItemFromRow(data):null;},
    async listMediaSeries(){const{data,error}=await client.from("media_series").select("*,media_items(id)").order("name");fail(error,"读取 Media Series");return(data as Row[]).map(mediaSeriesFromRow);},
    async getMediaSeries(id){const{data,error}=await client.from("media_series").select("*,media_items(id)").eq("id",id).maybeSingle();fail(error,"读取 Media Series");return data?mediaSeriesFromRow(data):null;},
    async createMediaSeries(name){const existing=(await repository.listMediaSeries()).find(series=>series.name.toLocaleLowerCase()===name.toLocaleLowerCase());if(existing)return existing;const{data,error}=await client.from("media_series").insert({user_id:userId,name}).select("*,media_items(id)").single();fail(error,"创建 Media Series");return mediaSeriesFromRow(data);},
    async createMediaItem(input){const{data,error}=await client.from("media_items").insert({user_id:userId,title:input.title,original_title:input.originalTitle,translated_title:input.translatedTitle,media_type:input.mediaType,status:input.status,rating:input.rating,is_favorite:input.isFavorite,note:input.note,cover_url:input.coverUrl,series_id:input.seriesId,season_number:input.seasonNumber,season_title:input.seasonTitle}).select("*,media_series(name)").single();fail(error,"创建 Media");return mediaItemFromRow(data);},
    async updateMediaItem(id,input:MediaItemPatch){const patch=mappedPatch(input,{title:"title",originalTitle:"original_title",translatedTitle:"translated_title",mediaType:"media_type",status:"status",rating:"rating",isFavorite:"is_favorite",note:"note",coverUrl:"cover_url",seriesId:"series_id",seasonNumber:"season_number",seasonTitle:"season_title"});if(!Object.keys(patch).length)return repository.getMediaItem(id);const{data,error}=await client.from("media_items").update(patch).eq("id",id).select("*,media_series(name)").maybeSingle();fail(error,"更新 Media");return data?mediaItemFromRow(data):null;},
    async deleteMediaItem(id){const{data,error}=await client.from("media_items").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除 Media");return Boolean(data);},
    async listMediaViewings(mediaId){let request=client.from("media_viewings").select("*");if(mediaId!==undefined)request=request.eq("media_id",mediaId);const{data,error}=await request.order("media_id").order("viewing_number").order("id");fail(error,"读取观看记录");return(data as Row[]).map(mediaViewingFromRow);},
    async getMediaViewing(id){const{data,error}=await client.from("media_viewings").select("*").eq("id",id).maybeSingle();fail(error,"读取观看记录");return data?mediaViewingFromRow(data):null;},
    async createMediaViewing(input){const{data,error}=await client.from("media_viewings").insert({user_id:userId,media_id:input.mediaId,watched_date:input.watchedDate}).select().single();fail(error,"创建观看记录");return mediaViewingFromRow(data);},
    async updateMediaViewing(id,watchedDate){const{data,error}=await client.from("media_viewings").update({watched_date:watchedDate}).eq("id",id).select().maybeSingle();fail(error,"更新观看日期");return data?mediaViewingFromRow(data):null;},
    async deleteMediaViewing(id){const{data,error}=await client.from("media_viewings").delete().eq("id",id).gt("viewing_number",1).select("id").maybeSingle();fail(error,"删除重温记录");return Boolean(data);},
    async listChronicleEntries(input={}){let request=client.from("chronicle_entries").select("*");const query=input.query?.trim();if(query){const pattern=`%${query.replace(/[\\%_]/g,"\\$&")}%`;request=request.or(`title.ilike.${postgrestQuoted(pattern)},content_md.ilike.${postgrestQuoted(pattern)}`);}const limit=Math.min(Math.max(input.limit??100,1),200);const{data,error}=await request.order("date",{ascending:false}).order("id",{ascending:false}).limit(limit);fail(error,"读取 Chronicle");return(data as Row[]).map(chronicleEntryFromRow);},
    async getChronicleEntry(id){const{data,error}=await client.from("chronicle_entries").select("*").eq("id",id).maybeSingle();fail(error,"读取 Chronicle");return data?chronicleEntryFromRow(data):null;},
    async createChronicleEntry(input){const{data,error}=await client.from("chronicle_entries").insert({user_id:userId,date:input.date,title:input.title,content_md:input.contentMd,source:input.source}).select().single();fail(error,"创建 Chronicle");return chronicleEntryFromRow(data);},
    async updateChronicleEntry(id,input:ChronicleEntryPatch){const patch=mappedPatch(input,{date:"date",title:"title",contentMd:"content_md",source:"source"});if(!Object.keys(patch).length)return repository.getChronicleEntry(id);const{data,error}=await client.from("chronicle_entries").update(patch).eq("id",id).select().maybeSingle();fail(error,"更新 Chronicle");return data?chronicleEntryFromRow(data):null;},
    async deleteChronicleEntry(id){const{data,error}=await client.from("chronicle_entries").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除 Chronicle");return Boolean(data);},
    async listProjects(input={}){let request=client.from("projects").select("*,project_items(status)");if(input.query)request=request.or(`name.ilike.${postgrestQuoted(`%${input.query}%`)},description.ilike.${postgrestQuoted(`%${input.query}%`)}`);if(input.status)request=request.eq("status",input.status);const{data,error}=await request.order("updated_at",{ascending:false}).order("id",{ascending:false}).limit(Math.min(Math.max(input.limit??100,1),200));fail(error,"读取 Projects");return(data as Row[]).map((row)=>{const items:unknown[]=Array.isArray(row.project_items)?row.project_items:[];return projectFromRow({...row,doing_count:items.filter((item:unknown)=>item&&typeof item==="object"&&(item as Row).status==="doing").length,to_solve_count:items.filter((item:unknown)=>item&&typeof item==="object"&&(item as Row).status==="to_solve").length});});},
    async getProject(id){const{data,error}=await client.from("projects").select("*,project_items(status)").eq("id",id).maybeSingle();fail(error,"读取 Project");if(!data)return null;const items:unknown[]=Array.isArray(data.project_items)?data.project_items:[];return projectFromRow({...data,doing_count:items.filter((item:unknown)=>item&&typeof item==="object"&&(item as Row).status==="doing").length,to_solve_count:items.filter((item:unknown)=>item&&typeof item==="object"&&(item as Row).status==="to_solve").length});},
    async createProject(input){const{data,error}=await client.from("projects").insert({user_id:userId,name:input.name,description:input.description,status:input.status}).select().single();fail(error,"创建 Project");return projectFromRow(data);},
    async updateProject(id,input:ProjectPatch){const patch=mappedPatch(input,{name:"name",description:"description",status:"status"});const{data,error}=await client.from("projects").update(patch).eq("id",id).select().maybeSingle();fail(error,"更新 Project");return data?projectFromRow(data):null;},
    async listProjectItems(input={}){let request=client.from("project_items").select("*,projects!inner(name)");if(input.projectId)request=request.eq("project_id",input.projectId);if(input.project)request=request.eq("projects.name",input.project);if(input.status)request=request.eq("status",input.status);if(input.type)request=request.eq("type",input.type);if(input.module)request=request.eq("module",input.module);if(input.query){const pattern=postgrestQuoted(`%${input.query}%`);request=request.or(`title.ilike.${pattern},description.ilike.${pattern},resolution.ilike.${pattern}`);}const{data,error}=await request.order("updated_at",{ascending:false}).order("id",{ascending:false}).limit(Math.min(Math.max(input.limit??100,1),200));fail(error,"读取 Project Items");return(data as Row[]).map((row)=>projectItemFromRow({...row,project_name:(row.projects as Row|undefined)?.name}));},
    async getProjectItem(id){const{data,error}=await client.from("project_items").select("*,projects(name)").eq("id",id).maybeSingle();fail(error,"读取 Project Item");return data?projectItemFromRow({...data,project_name:(data.projects as Row|undefined)?.name}):null;},
    async createProjectItem(input){const now=new Date().toISOString();const life=input.status==="doing"?{started_at:now}:input.status==="done"?{completed_at:now}:input.status==="verified"?{completed_at:now,verified_at:now}:{};const{data,error}=await client.from("project_items").insert({user_id:userId,project_id:input.projectId,title:input.title,description:input.description,type:input.type,status:input.status,module:input.module,priority:input.priority,next_step:input.nextStep,resolution:input.resolution,...life}).select().single();fail(error,"创建 Project Item");await client.from("projects").update({updated_at:now}).eq("id",input.projectId);return projectItemFromRow(data);},
    async updateProjectItem(id,input:ProjectItemPatch){const existing=await repository.getProjectItem(id);if(!existing)return null;const now=new Date().toISOString();const life=input.status==="doing"&&!existing.startedAt?{started_at:now}:input.status==="done"&&!existing.completedAt?{completed_at:now}:input.status==="verified"?{...(existing.completedAt?{}:{completed_at:now}),...(existing.verifiedAt?{}:{verified_at:now})}:{};const patch={...mappedPatch(input,{projectId:"project_id",title:"title",description:"description",type:"type",status:"status",module:"module",priority:"priority",nextStep:"next_step",resolution:"resolution"}),...life};const{data,error}=await client.from("project_items").update(patch).eq("id",id).select().maybeSingle();fail(error,"更新 Project Item");await client.from("projects").update({updated_at:now}).in("id",[existing.projectId,input.projectId??existing.projectId]);return data?projectItemFromRow(data):null;},
    async listMemos(input={}){let request=client.from("memos").select("*");const query=input.query?.trim();if(query){const pattern=`%${query.replace(/[\\%_]/g,"\\$&")}%`;request=request.or(`title.ilike.${postgrestQuoted(pattern)},content.ilike.${postgrestQuoted(pattern)}`);}if(input.tag)request=request.contains("tags",[input.tag]);if(input.type)request=request.eq("type",input.type);if(input.status)request=request.eq("status",input.status);const limit=Math.min(Math.max(input.limit??100,1),200);const{data,error}=await request.order("updated_at",{ascending:false}).order("id",{ascending:false}).limit(limit);fail(error,"读取 Memo");return(data as Row[]).map(memoFromRow);},
    async getMemo(id){const{data,error}=await client.from("memos").select("*").eq("id",id).maybeSingle();fail(error,"读取 Memo");return data?memoFromRow(data):null;},
    async createMemo(input){const{data,error}=await client.from("memos").insert({user_id:userId,title:input.title,content:input.content,type:input.type,status:input.status,tags:input.tags,event_date:input.eventDate,confirmed_at:input.confirmedAt,merged_into_id:input.mergedIntoId,source_system:input.sourceSystem,source_id:input.sourceId,source_url:input.sourceUrl,imported_at:input.importedAt}).select().single();fail(error,"创建 Memo");return memoFromRow(data);},
    async updateMemo(id,input:MemoPatch){const patch=mappedPatch(input,{title:"title",content:"content",type:"type",status:"status",tags:"tags",eventDate:"event_date",confirmedAt:"confirmed_at",mergedIntoId:"merged_into_id",sourceSystem:"source_system",sourceId:"source_id",sourceUrl:"source_url",importedAt:"imported_at"});if(!Object.keys(patch).length)return repository.getMemo(id);const{data,error}=await client.from("memos").update(patch).eq("id",id).select().maybeSingle();fail(error,"更新 Memo");return data?memoFromRow(data):null;},
    async deleteMemo(id){const{data,error}=await client.from("memos").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除 Memo");return Boolean(data);},
    async listLuciusDiaryEntries(input={}){let request=client.from("lucius_diary_entries").select("*");if(input.query)request=request.ilike("content",`%${input.query.replace(/[\\%_]/g,"\\$&")}%`);if(input.tag)request=request.contains("tags",[input.tag]);const limit=Math.min(Math.max(input.limit??100,1),200);const{data,error}=await request.order("date",{ascending:false}).order("id",{ascending:false}).limit(limit);fail(error,"读取 Lucius Diary");return(data as Row[]).map(luciusDiaryFromRow);},
    async getLuciusDiaryEntry(id){const{data,error}=await client.from("lucius_diary_entries").select("*").eq("id",id).maybeSingle();fail(error,"读取 Lucius Diary");return data?luciusDiaryFromRow(data):null;},
    async createLuciusDiaryEntry(input){const{data,error}=await client.from("lucius_diary_entries").insert({user_id:userId,date:input.date,content:input.content,tags:input.tags,source_system:input.sourceSystem,source_id:input.sourceId,source_url:input.sourceUrl,imported_at:input.importedAt}).select().single();fail(error,"创建 Lucius Diary");return luciusDiaryFromRow(data);},
    async updateLuciusDiaryEntry(id,input:LuciusDiaryPatch){const patch=mappedPatch(input,{date:"date",content:"content",tags:"tags",sourceSystem:"source_system",sourceId:"source_id",sourceUrl:"source_url",importedAt:"imported_at"});if(!Object.keys(patch).length)return repository.getLuciusDiaryEntry(id);const{data,error}=await client.from("lucius_diary_entries").update(patch).eq("id",id).select().maybeSingle();fail(error,"更新 Lucius Diary");return data?luciusDiaryFromRow(data):null;},
    async deleteLuciusDiaryEntry(id){const{data,error}=await client.from("lucius_diary_entries").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除 Lucius Diary");return Boolean(data);},
    async listLuciusCases(input={}){let request=client.from("lucius_cases").select("*");if(input.currentOnly)request=request.in("status",["serving","probation"]);if(input.query){const pattern=`%${input.query.replace(/[\\%_]/g,"\\$&")}%`;request=request.or(`title.ilike.${postgrestQuoted(pattern)},cause.ilike.${postgrestQuoted(pattern)},mandatory_rule.ilike.${postgrestQuoted(pattern)}`);}if(input.errorType)request=request.eq("error_type",input.errorType);if(input.severity)request=request.eq("severity",input.severity);if(input.status)request=request.eq("status",input.status);const limit=Math.min(Math.max(input.limit??100,1),200);const{data,error}=await request.order("latest_occurred_date",{ascending:false}).order("id",{ascending:false}).limit(limit);fail(error,"读取 Lucius Cases");return(data as Row[]).map(luciusCaseFromRow);},
    async getLuciusCase(id){const{data,error}=await client.from("lucius_cases").select("*").eq("id",id).maybeSingle();fail(error,"读取 Lucius Case");return data?luciusCaseFromRow(data):null;},
    async createLuciusCase(input){const{data,error}=await client.from("lucius_cases").insert({user_id:userId,title:input.title,error_type:input.errorType,severity:input.severity,status:input.status,trigger_scenes:input.triggerScenes,error_quote:input.errorQuote,cause:input.cause,correct_behavior:input.correctBehavior,mandatory_rule:input.mandatoryRule,next_check:input.nextCheck,punishment:input.punishment,first_occurred_date:input.firstOccurredDate,latest_occurred_date:input.latestOccurredDate,occurrence_count:input.occurrenceCount,consecutive_correct_count:input.consecutiveCorrectCount,recurrence_interval_days:input.recurrenceIntervalDays,is_recurrence:input.isRecurrence,reset_threshold:input.resetThreshold,source_system:input.sourceSystem,source_id:input.sourceId,source_url:input.sourceUrl,imported_at:input.importedAt}).select().single();fail(error,"创建 Lucius Case");return luciusCaseFromRow(data);},
    async updateLuciusCase(id,input:LuciusCasePatch){const patch=mappedPatch(input,{title:"title",errorType:"error_type",severity:"severity",status:"status",triggerScenes:"trigger_scenes",errorQuote:"error_quote",cause:"cause",correctBehavior:"correct_behavior",mandatoryRule:"mandatory_rule",nextCheck:"next_check",punishment:"punishment",firstOccurredDate:"first_occurred_date",latestOccurredDate:"latest_occurred_date",occurrenceCount:"occurrence_count",consecutiveCorrectCount:"consecutive_correct_count",recurrenceIntervalDays:"recurrence_interval_days",isRecurrence:"is_recurrence",resetThreshold:"reset_threshold",sourceSystem:"source_system",sourceId:"source_id",sourceUrl:"source_url",importedAt:"imported_at"});if(!Object.keys(patch).length)return repository.getLuciusCase(id);const{data,error}=await client.from("lucius_cases").update(patch).eq("id",id).select().maybeSingle();fail(error,"更新 Lucius Case");return data?luciusCaseFromRow(data):null;},
    async deleteLuciusCase(id){const{data,error}=await client.from("lucius_cases").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除 Lucius Case");return Boolean(data);},
    async recordLuciusCaseRecurrence(id,occurredDate){const{data,error}=await client.rpc("record_lucius_case_recurrence",{p_case_id:id,p_occurred_date:occurredDate});fail(error,"记录 Lucius Case 复发");const row=Array.isArray(data)?data[0]:data;return row?luciusCaseFromRow(row as Row):null;},
    async getLuciusState(){const{data,error}=await client.from("lucius_state").select("current_note,status,mood,updated_at").maybeSingle();fail(error,"读取 Lucius state");return luciusStateFromRow(data as Row|null);},
    async updateLuciusState(input:LuciusStatePatch){const current=await repository.getLuciusState();const values={current_note:input.currentNote??current.currentNote,status:input.status??current.status,mood:input.mood??current.mood};const request=current.updatedAt?client.from("lucius_state").update(values).eq("user_id",userId):client.from("lucius_state").insert({user_id:userId,...values});const{data,error}=await request.select("current_note,status,mood,updated_at").single();fail(error,"更新 Lucius state");return luciusStateFromRow(data as Row);},
    async listLuciusPosts(input={}){const limit=Math.min(Math.max(input.limit??50,1),100);const{data,error}=await client.from("lucius_posts").select("*").order("published_at",{ascending:false}).order("id",{ascending:false}).limit(limit);fail(error,"读取 Lucius Posts");return(data as Row[]).map(luciusPostFromRow);},
    async getLuciusPost(id){const{data,error}=await client.from("lucius_posts").select("*").eq("id",id).maybeSingle();fail(error,"读取 Lucius Post");return data?luciusPostFromRow(data):null;},
    async createLuciusPost(input){const{data,error}=await client.from("lucius_posts").insert({user_id:userId,content:input.content,published_at:input.publishedAt}).select().single();fail(error,"创建 Lucius Post");return luciusPostFromRow(data);},
    async updateLuciusPost(id,input:LuciusPostPatch){const patch=mappedPatch(input,{content:"content",publishedAt:"published_at"});if(!Object.keys(patch).length)return repository.getLuciusPost(id);const{data,error}=await client.from("lucius_posts").update(patch).eq("id",id).select().maybeSingle();fail(error,"更新 Lucius Post");return data?luciusPostFromRow(data):null;},
    async deleteLuciusPost(id){const{data,error}=await client.from("lucius_posts").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除 Lucius Post");return Boolean(data);},
    async listDrinkLogs(input={}){let request=client.from("drink_logs").select("*");if(input.from)request=request.gte("occurred_at",input.from);if(input.to)request=request.lt("occurred_at",input.to);if(input.drinkType)request=request.eq("drink_type",input.drinkType);const{data,error}=await request.order("occurred_at",{ascending:false}).order("id",{ascending:false});fail(error,"读取饮品记录");return(data as Row[]).map(drinkFromRow);},
    async getDrinkLog(id){const{data,error}=await client.from("drink_logs").select("*").eq("id",id).maybeSingle();fail(error,"读取饮品记录");return data?drinkFromRow(data):null;},
    async createDrinkLog(input){const{data,error}=await client.from("drink_logs").insert({user_id:userId,occurred_at:input.occurredAt,occurred_has_explicit_time:input.occurredHasExplicitTime,name:input.name,brand:input.brand,drink_type:input.drinkType,volume_ml:input.volumeMl,sugar_level:input.sugarLevel,temperature:input.temperature,rating:input.rating,caffeine_mg:input.caffeineMg,estimated_kcal:input.estimatedKcal,kcal_min:input.kcalMin,kcal_max:input.kcalMax,confidence:input.confidence,food_library_id:input.foodLibraryId,notes:input.notes}).select().single();fail(error,"创建饮品记录");return drinkFromRow(data);},
    async updateDrinkLog(id,input){const patch=mappedPatch(input,{occurredAt:"occurred_at",occurredHasExplicitTime:"occurred_has_explicit_time",name:"name",brand:"brand",drinkType:"drink_type",volumeMl:"volume_ml",sugarLevel:"sugar_level",temperature:"temperature",rating:"rating",caffeineMg:"caffeine_mg",estimatedKcal:"estimated_kcal",kcalMin:"kcal_min",kcalMax:"kcal_max",confidence:"confidence",foodLibraryId:"food_library_id",notes:"notes"});if(!Object.keys(patch).length)return repository.getDrinkLog(id);const{data,error}=await client.from("drink_logs").update(patch).eq("id",id).select().maybeSingle();fail(error,"更新饮品记录");return data?drinkFromRow(data):null;},
    async deleteDrinkLog(id){const{data,error}=await client.from("drink_logs").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除饮品记录");return Boolean(data);},
    async listDrinkLimits(){const{data,error}=await client.from("drink_limits").select("*").order("enabled",{ascending:false}).order("id");fail(error,"读取饮品限制");return(data as Row[]).map(limitFromRow);},
    async createDrinkLimit(input){const{data,error}=await client.from("drink_limits").insert({user_id:userId,name:input.name,target_type:input.targetType,period:input.period,limit_value:input.limitValue,enabled:input.enabled}).select().single();fail(error,"创建饮品限制");return limitFromRow(data);},
    async updateDrinkLimit(id,input){const patch=mappedPatch(input,{name:"name",targetType:"target_type",period:"period",limitValue:"limit_value",enabled:"enabled"});const{data,error}=await client.from("drink_limits").update(patch).eq("id",id).select().maybeSingle();fail(error,"更新饮品限制");return data?limitFromRow(data):null;},
    async deleteDrinkLimit(id){const{data,error}=await client.from("drink_limits").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除饮品限制");return Boolean(data);},
    async listTrackers(){const{data,error}=await client.from("trackers").select("*").order("group_name").order("name");fail(error,"读取 Trackers");return(data as Row[]).map(trackerFromRow);},
    async getTracker(id){const{data,error}=await client.from("trackers").select("*").eq("id",id).maybeSingle();fail(error,"读取 Tracker");return data?trackerFromRow(data):null;},
    async createTracker(input){const{data,error}=await client.from("trackers").insert({user_id:userId,name:input.name,icon:input.icon,icon_type:input.iconType,icon_value:input.iconValue,group_name:input.groupName,time_type:"point",quick_capture_enabled:input.quickCaptureEnabled,stats_config:input.statsConfig}).select().single();fail(error,"创建 Tracker");return trackerFromRow(data);},
    async updateTracker(id,input){const patch=mappedPatch(input,{name:"name",icon:"icon",iconType:"icon_type",iconValue:"icon_value",groupName:"group_name",quickCaptureEnabled:"quick_capture_enabled",statsConfig:"stats_config"});if(!Object.keys(patch).length)return repository.getTracker(id);const{data,error}=await client.from("trackers").update(patch).eq("id",id).select().maybeSingle();fail(error,"更新 Tracker");return data?trackerFromRow(data):null;},
    async deleteTracker(id){const{data,error}=await client.from("trackers").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除 Tracker");return Boolean(data);},
    async listTrackerFields(trackerId){const{data,error}=await client.from("tracker_fields").select("*").eq("tracker_id",trackerId).order("sort_order").order("id");fail(error,"读取 Tracker 字段");return(data as Row[]).map(trackerFieldFromRow);},
    async createTrackerField(input){const{data,error}=await client.from("tracker_fields").insert({user_id:userId,tracker_id:input.trackerId,field_key:input.key,name:input.name,type:input.type,required:input.required,default_value:input.defaultValue,options_json:input.options,show_after_quick_capture:input.showAfterQuickCapture,include_in_stats:input.includeInStats,sort_order:input.sortOrder,unit:input.unit,precision:input.precision,config_json:input.config,archived_at:input.archivedAt}).select().single();fail(error,"创建 Tracker 字段");return trackerFieldFromRow(data);},
    async deleteTrackerField(id){const{data,error}=await client.from("tracker_fields").update({archived_at:new Date().toISOString()}).eq("id",id).is("archived_at",null).select("id").maybeSingle();fail(error,"归档 Tracker 字段");return Boolean(data);},
    async listTrackerEntries(trackerId,input={}){let request=client.from("tracker_entries").select("*");if(trackerId!==undefined)request=request.eq("tracker_id",trackerId);if(input.from)request=request.gte("occurred_at",input.from);if(input.to)request=request.lt("occurred_at",input.to);const{data,error}=await request.order("occurred_at",{ascending:false}).order("id",{ascending:false});fail(error,"读取 Tracker 记录");const entries=(data as Row[]).map(trackerEntryFromRow);if(!input.query)return entries;const query=input.query.toLocaleLowerCase();return entries.filter((entry)=>`${entry.note} ${JSON.stringify(entry.values)}`.toLocaleLowerCase().includes(query));},
    async getTrackerEntry(id){const{data,error}=await client.from("tracker_entries").select("*").eq("id",id).maybeSingle();fail(error,"读取 Tracker 记录");return data?trackerEntryFromRow(data):null;},
    async createTrackerEntry(input){const{data,error}=await client.from("tracker_entries").insert({user_id:userId,tracker_id:input.trackerId,occurred_at:input.occurredAt,end_at:input.endAt,values_json:input.values,note:input.note}).select().single();fail(error,"创建 Tracker 记录");return trackerEntryFromRow(data);},
    async updateTrackerEntry(id,input){const patch=mappedPatch(input,{occurredAt:"occurred_at",endAt:"end_at",values:"values_json",note:"note"});if(!Object.keys(patch).length)return repository.getTrackerEntry(id);const{data,error}=await client.from("tracker_entries").update(patch).eq("id",id).select().maybeSingle();fail(error,"更新 Tracker 记录");return data?trackerEntryFromRow(data):null;},
    async deleteTrackerEntry(id){const{data,error}=await client.from("tracker_entries").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除 Tracker 记录");return Boolean(data);},
    async listTrackerGoals(trackerId){const{data,error}=await client.from("tracker_goals").select("*").eq("tracker_id",trackerId).order("enabled",{ascending:false}).order("id");fail(error,"读取 Tracker Goal");return(data as Row[]).map(trackerGoalFromRow);},
    async createTrackerGoal(input){const{data,error}=await client.from("tracker_goals").insert({user_id:userId,tracker_id:input.trackerId,operator:input.operator,target_value:input.targetValue,period_type:input.periodType,custom_period:input.customPeriod,enabled:input.enabled}).select().single();fail(error,"创建 Tracker Goal");return trackerGoalFromRow(data);},
    async deleteTrackerGoal(id){const{data,error}=await client.from("tracker_goals").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除 Tracker Goal");return Boolean(data);},
    async listTrackerReminders(trackerId){const{data,error}=await client.from("tracker_reminders").select("*").eq("tracker_id",trackerId).order("enabled",{ascending:false}).order("id");fail(error,"读取 Tracker Reminder");return(data as Row[]).map(trackerReminderFromRow);},
    async createTrackerReminder(input){const{data,error}=await client.from("tracker_reminders").insert({user_id:userId,tracker_id:input.trackerId,reminder_type:input.reminderType,schedule_rule:input.scheduleRule,interval_days:input.intervalDays,enabled:input.enabled}).select().single();fail(error,"创建 Tracker Reminder");return trackerReminderFromRow(data);},
    async deleteTrackerReminder(id){const{data,error}=await client.from("tracker_reminders").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除 Tracker Reminder");return Boolean(data);},
    async listPets(includeInactive=false){let request=client.from("pets").select("*");if(!includeInactive)request=request.eq("is_active",true);const{data,error}=await request.order("is_active",{ascending:false}).order("name");fail(error,"读取猫咪档案");return(data as Row[]).map(petFromRow);},
    async getPet(id){const{data,error}=await client.from("pets").select("*").eq("id",id).maybeSingle();fail(error,"读取猫咪档案");return data?petFromRow(data):null;},
    async createPet(input){const{data,error}=await client.from("pets").insert({user_id:userId,name:input.name,avatar_url:input.avatarUrl,sex:input.sex,birthday:input.birthday,adoption_date:input.adoptionDate,notes:input.notes,is_active:input.isActive}).select().single();fail(error,"创建猫咪档案");return petFromRow(data);},
    async updatePet(id,input){return catUpdate("pets",id,input,{name:"name",avatarUrl:"avatar_url",sex:"sex",birthday:"birthday",adoptionDate:"adoption_date",notes:"notes",isActive:"is_active"},petFromRow);},
    async archivePet(id){const{data,error}=await client.from("pets").update({is_active:false}).eq("id",id).select("id").maybeSingle();fail(error,"归档猫咪档案");return Boolean(data);},
    async listCatEvents(petId){return catList("cat_events",catEventFromRow,petId);},
    async getCatEvent(id){const{data,error}=await client.from("cat_events").select("*").eq("id",id).maybeSingle();fail(error,"读取猫咪护理记录");return data?catEventFromRow(data):null;},
    async createCatEvent(input){const{data,error}=await client.from("cat_events").insert({user_id:userId,pet_id:input.petId,event_type:input.eventType,occurred_at:input.occurredAt,occurred_has_explicit_time:input.occurredHasExplicitTime,title:input.title,note:input.note,source_type:input.sourceType,source_id:input.sourceId}).select().single();fail(error,"创建猫咪护理记录");return catEventFromRow(data);},
    async updateCatEvent(id,input){return catUpdate("cat_events",id,input,{petId:"pet_id",eventType:"event_type",occurredAt:"occurred_at",occurredHasExplicitTime:"occurred_has_explicit_time",title:"title",note:"note",sourceType:"source_type",sourceId:"source_id"},catEventFromRow);},
    async deleteCatEvent(id){const{data,error}=await client.from("cat_events").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除猫咪护理记录");return Boolean(data);},
    async listCatSymptoms(petId){return catList("cat_symptoms",catSymptomFromRow,petId);},
    async getCatSymptom(id){const{data,error}=await client.from("cat_symptoms").select("*").eq("id",id).maybeSingle();fail(error,"读取症状记录");return data?catSymptomFromRow(data):null;},
    async createCatSymptom(input){const{data,error}=await client.from("cat_symptoms").insert({user_id:userId,pet_id:input.petId,occurred_at:input.occurredAt,occurred_has_explicit_time:input.occurredHasExplicitTime,title:input.title,severity:input.severity,description:input.description,body_area:input.bodyArea,note:input.note}).select().single();fail(error,"创建症状记录");return catSymptomFromRow(data);},
    async updateCatSymptom(id,input){return catUpdate("cat_symptoms",id,input,{petId:"pet_id",occurredAt:"occurred_at",occurredHasExplicitTime:"occurred_has_explicit_time",title:"title",severity:"severity",description:"description",bodyArea:"body_area",note:"note"},catSymptomFromRow);},
    async deleteCatSymptom(id){const{data,error}=await client.from("cat_symptoms").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除症状记录");return Boolean(data);},
    async listCatVetVisits(petId){return catList("vet_visits",catVetVisitFromRow,petId);},
    async getCatVetVisit(id){const{data,error}=await client.from("vet_visits").select("*").eq("id",id).maybeSingle();fail(error,"读取就诊记录");return data?catVetVisitFromRow(data):null;},
    async createCatVetVisit(input){const{data,error}=await client.from("vet_visits").insert({user_id:userId,pet_id:input.petId,occurred_at:input.occurredAt,occurred_has_explicit_time:input.occurredHasExplicitTime,clinic:input.clinic,doctor:input.doctor,reason:input.reason,symptoms:input.symptoms,diagnosis:input.diagnosis,examinations:input.examinations,treatment:input.treatment,prescriptions:input.prescriptions,cost:input.cost,follow_up_at:input.followUpAt,notes:input.notes}).select().single();fail(error,"创建就诊记录");return catVetVisitFromRow(data);},
    async updateCatVetVisit(id,input){return catUpdate("vet_visits",id,input,{petId:"pet_id",occurredAt:"occurred_at",occurredHasExplicitTime:"occurred_has_explicit_time",clinic:"clinic",doctor:"doctor",reason:"reason",symptoms:"symptoms",diagnosis:"diagnosis",examinations:"examinations",treatment:"treatment",prescriptions:"prescriptions",cost:"cost",followUpAt:"follow_up_at",notes:"notes"},catVetVisitFromRow);},
    async deleteCatVetVisit(id){const{data,error}=await client.from("vet_visits").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除就诊记录");return Boolean(data);},
    async listCatMedications(petId){return catList("cat_medications",catMedicationFromRow,petId,"started_at");},
    async getCatMedication(id){const{data,error}=await client.from("cat_medications").select("*").eq("id",id).maybeSingle();fail(error,"读取用药记录");return data?catMedicationFromRow(data):null;},
    async createCatMedication(input){const{data,error}=await client.from("cat_medications").insert({user_id:userId,pet_id:input.petId,name:input.name,dose:input.dose,unit:input.unit,frequency_text:input.frequencyText,started_at:input.startedAt,started_has_explicit_time:input.startedHasExplicitTime,ended_at:input.endedAt,ended_has_explicit_time:input.endedHasExplicitTime,reason:input.reason,active:input.active,notes:input.notes}).select().single();fail(error,"创建用药记录");return catMedicationFromRow(data);},
    async updateCatMedication(id,input){return catUpdate("cat_medications",id,input,{petId:"pet_id",name:"name",dose:"dose",unit:"unit",frequencyText:"frequency_text",startedAt:"started_at",startedHasExplicitTime:"started_has_explicit_time",endedAt:"ended_at",endedHasExplicitTime:"ended_has_explicit_time",reason:"reason",active:"active",notes:"notes"},catMedicationFromRow);},
    async deleteCatMedication(id){const{data,error}=await client.from("cat_medications").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除用药记录");return Boolean(data);},
    async listCatMeasurements(petId){return catList("cat_measurements",catMeasurementFromRow,petId);},
    async getCatMeasurement(id){const{data,error}=await client.from("cat_measurements").select("*").eq("id",id).maybeSingle();fail(error,"读取测量记录");return data?catMeasurementFromRow(data):null;},
    async createCatMeasurement(input){const{data,error}=await client.from("cat_measurements").insert({user_id:userId,pet_id:input.petId,occurred_at:input.occurredAt,occurred_has_explicit_time:input.occurredHasExplicitTime,measurement_type:input.measurementType,value:input.value,unit:input.unit,note:input.note}).select().single();fail(error,"创建测量记录");return catMeasurementFromRow(data);},
    async updateCatMeasurement(id,input){return catUpdate("cat_measurements",id,input,{petId:"pet_id",occurredAt:"occurred_at",occurredHasExplicitTime:"occurred_has_explicit_time",measurementType:"measurement_type",value:"value",unit:"unit",note:"note"},catMeasurementFromRow);},
    async deleteCatMeasurement(id){const{data,error}=await client.from("cat_measurements").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除测量记录");return Boolean(data);},
    async listCatRoutines(input={}){let request=client.from("cat_routines").select("*");if(input.scope)request=request.eq("scope",input.scope);if(input.petId===null)request=request.is("pet_id",null);else if(typeof input.petId==="number")request=request.eq("pet_id",input.petId);if(input.enabledOnly)request=request.eq("enabled",true);const{data,error}=await request.order("enabled",{ascending:false}).order("next_due_at").order("id");fail(error,"读取护理日程");return(data as Row[]).map(catRoutineFromRow);},
    async getCatRoutine(id){const{data,error}=await client.from("cat_routines").select("*").eq("id",id).maybeSingle();fail(error,"读取护理日程");return data?catRoutineFromRow(data):null;},
    async createCatRoutine(input){const{data,error}=await client.from("cat_routines").insert({user_id:userId,scope:input.scope,pet_id:input.petId,title:input.title,interval_value:input.intervalValue,interval_unit:input.intervalUnit,first_due_at:input.firstDueAt,next_due_at:input.nextDueAt,reminder_lead_minutes:input.reminderLeadMinutes,notes:input.notes,enabled:input.enabled,reminder_id:input.reminderId}).select().single();fail(error,"创建护理日程");return catRoutineFromRow(data);},
    async updateCatRoutine(id,input){return catUpdate("cat_routines",id,input,{scope:"scope",petId:"pet_id",title:"title",intervalValue:"interval_value",intervalUnit:"interval_unit",firstDueAt:"first_due_at",lastCompletedAt:"last_completed_at",nextDueAt:"next_due_at",reminderLeadMinutes:"reminder_lead_minutes",notes:"notes",enabled:"enabled",reminderId:"reminder_id"},catRoutineFromRow);},
    async archiveCatRoutine(id){const{data,error}=await client.from("cat_routines").update({enabled:false}).eq("id",id).select("id").maybeSingle();fail(error,"停用护理日程");return Boolean(data);},
    async listReminders(input={}){let request=client.from("reminders").select("*");if(input.targetType)request=request.eq("target_type",input.targetType);if(input.targetId===null)request=request.is("target_id",null);else if(typeof input.targetId==="number")request=request.eq("target_id",input.targetId);if(input.activeOnly)request=request.eq("is_active",true);if(input.dueBefore)request=request.or(`and(snoozed_until.not.is.null,snoozed_until.lte.${input.dueBefore}),and(snoozed_until.is.null,next_due_at.lte.${input.dueBefore})`);const{data,error}=await request.order("next_due_at").order("id");fail(error,"读取提醒");return(data as Row[]).map(reminderFromRow);},
    async getReminder(id){const{data,error}=await client.from("reminders").select("*").eq("id",id).maybeSingle();fail(error,"读取提醒");return data?reminderFromRow(data):null;},
    async createReminder(input){const{data,error}=await client.from("reminders").insert({user_id:userId,title:input.title,target_type:input.targetType,target_id:input.targetId,source_type:input.sourceType,source_id:input.sourceId,schedule_type:input.scheduleType,starts_at:input.startsAt,next_due_at:input.nextDueAt,due_has_explicit_time:input.dueHasExplicitTime,interval_value:input.intervalValue,interval_unit:input.intervalUnit,times_of_day:input.timesOfDay,ends_at:input.endsAt,timezone:input.timezone,note:input.note,lead_time_minutes:input.leadTimeMinutes,status:input.status,is_active:input.isActive}).select().single();fail(error,"创建提醒");return reminderFromRow(data);},
    async updateReminder(id,input){return catUpdate("reminders",id,input,{title:"title",targetType:"target_type",targetId:"target_id",sourceType:"source_type",sourceId:"source_id",scheduleType:"schedule_type",startsAt:"starts_at",nextDueAt:"next_due_at",dueHasExplicitTime:"due_has_explicit_time",intervalValue:"interval_value",intervalUnit:"interval_unit",timesOfDay:"times_of_day",endsAt:"ends_at",timezone:"timezone",note:"note",leadTimeMinutes:"lead_time_minutes",status:"status",sentAt:"sent_at",cancelledAt:"cancelled_at",isActive:"is_active",lastCompletedAt:"last_completed_at",snoozedUntil:"snoozed_until",lastNotifiedAt:"last_notified_at"},reminderFromRow);},
    async deleteReminder(id){const{data,error}=await client.from("reminders").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除提醒");return Boolean(data);},
    async createReminderOccurrence(input){const{data,error}=await client.from("reminder_occurrences").insert({user_id:userId,reminder_id:input.reminderId,action:input.action,scheduled_for:input.scheduledFor,acted_at:input.actedAt,created_event_id:input.createdEventId}).select().single();fail(error,"保存提醒操作");return reminderOccurrenceFromRow(data);},
    async listNotificationDeliveries(limit=100){const{data,error}=await client.from("notification_deliveries").select("*").order("created_at",{ascending:false}).order("id",{ascending:false}).limit(limit);fail(error,"读取通知历史");return(data as Row[]).map(notificationDeliveryFromRow);},
    async createNotificationDelivery(input){const{data,error}=await client.from("notification_deliveries").insert({user_id:userId,reminder_id:input.reminderId,title:input.title,source_type:input.sourceType,source_id:input.sourceId,target_type:input.targetType,target_id:input.targetId,scheduled_at:input.scheduledAt,scheduled_has_explicit_time:input.scheduledHasExplicitTime,sent_at:input.sentAt,status:input.status}).select().single();fail(error,"保存通知历史");return notificationDeliveryFromRow(data);},
    async listPushSubscriptions(){const{data,error}=await client.from("push_subscriptions").select("*").order("id");fail(error,"读取通知订阅");return(data as Row[]).map(pushSubscriptionFromRow);},
    async upsertPushSubscription(input){const{data,error}=await client.from("push_subscriptions").upsert({user_id:userId,endpoint:input.endpoint,p256dh:input.p256dh,auth:input.auth,last_used_at:new Date().toISOString()},{onConflict:"user_id,endpoint"}).select().single();fail(error,"保存通知订阅");return pushSubscriptionFromRow(data);},
    async deletePushSubscription(endpoint){const{data,error}=await client.from("push_subscriptions").delete().eq("endpoint",endpoint).select("id").maybeSingle();fail(error,"删除通知订阅");return Boolean(data);},
    async getNutritionSettings(date){const{data,error}=await client.from("daily_nutrition_summaries").select("resting_energy_kcal,active_energy_kcal,notes").eq("date",date).maybeSingle();fail(error,"读取能量设置");return{restingEnergyKcal:data?.resting_energy_kcal===null||data?.resting_energy_kcal===undefined?null:Number(data.resting_energy_kcal),activeEnergyKcal:data?.active_energy_kcal===null||data?.active_energy_kcal===undefined?null:Number(data.active_energy_kcal),notes:data?String(data.notes):""};},
    async listNutritionSettings(limit=30){const size=Math.min(Math.max(Math.trunc(limit),1),90);const{data,error}=await client.from("daily_nutrition_summaries").select("date,resting_energy_kcal,active_energy_kcal,notes").or("resting_energy_kcal.not.is.null,active_energy_kcal.not.is.null").order("date",{ascending:false}).limit(size);fail(error,"读取能量历史");return(data as Row[]).map((row)=>({date:String(row.date),restingEnergyKcal:row.resting_energy_kcal===null||row.resting_energy_kcal===undefined?null:Number(row.resting_energy_kcal),activeEnergyKcal:row.active_energy_kcal===null||row.active_energy_kcal===undefined?null:Number(row.active_energy_kcal),notes:String(row.notes??"")}));},
    async updateNutritionSettings(date,input){const{error}=await client.from("daily_nutrition_summaries").upsert({date,user_id:userId,resting_energy_kcal:input.restingEnergyKcal,active_energy_kcal:input.activeEnergyKcal,notes:input.notes},{onConflict:"date,user_id"});fail(error,"保存能量设置");},
    async autoTitleChatSession(id, content) {
      const session = await repository.getChatSession(id);
      if (!session || session.messageCount > 1 || !["新对话", "New conversation"].includes(session.title)) return;
      const compact = content.replace(/\s+/g, " ").trim();
      const title = compact.length > 28 ? `${compact.slice(0, 28)}…` : compact;
      const { error } = await client.from("chat_sessions").update({ title }).eq("id", id);
      fail(error, "生成会话标题");
    },
  };
  return repository;
}

export async function createSupabaseRepository(): Promise<EvaOrbitRepository> {
  const client = await createSupabaseServerClient();
  return buildSupabaseRepository(client, await identity(client));
}

export async function createMcpSupabaseRepository(accessToken: string, userId: string): Promise<EvaOrbitRepository> {
  const { url, publishableKey } = supabaseConfig();
  const client = createClient(url, publishableKey, {
    accessToken: async () => accessToken,
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return buildSupabaseRepository(client, userId);
}
