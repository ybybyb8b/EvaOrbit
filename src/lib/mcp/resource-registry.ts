import { ConflictError } from "../errors.ts";
import type { CatRecordKind, CatRoutine, CatTimelineEntry, ChronicleEntry, DrinkLimit, HealthRecord, InboxItem, InboxStatus, LuciusCase, LuciusCaseErrorType, LuciusCaseSeverity, LuciusCaseStatus, LuciusDiaryEntry, LuciusPost, LuciusState, MediaDetail, MediaListItem, Memo, MemoStatus, MemoType, PersonMemoryNote, Pet, Project, ProjectItem, ProjectItemStatus, ProjectItemType, ProjectStatus, RelationEvent, RelationPerson, RelationPersonSummary, Reminder, Tracker, TrackerSummary, TrainingLog } from "../types.ts";
import { parseCatRecord, parseCatRoutine, parsePet, parsePetPatch, parseReminder } from "../cats-validation.ts";
import { parseMemoryNote,parseRelationEvent,parseRelationPerson,parseRelationPersonPatch,parseSettleAdvance } from "../relations-validation.ts";
import { dateOnly, parseChronicleEntryPatch, parseDrinkLimit, parseHealthRecordPatch, parseInboxPatch, parseLuciusCasePatch, parseLuciusDiaryPatch, parseLuciusPostPatch, parseLuciusStatePatch, parseMediaPatch, parseMediaSeries, parseMediaViewing, parseMemoPatch, parseNewChronicleEntry, parseNewHealthRecord, parseNewInbox, parseNewLuciusCase, parseNewLuciusDiaryEntry, parseNewLuciusPost, parseNewMedia, parseNewMemo, parseNewProject, parseNewProjectItem, parseNewTracker, parseNewTrackerEntry, parseNewTrackerField, parseNewTrackerGoal, parseNewTrackerReminder, parseNewTrainingLog, parseProjectItemPatch, parseProjectPatch, parseTrackerEntryPatch, parseTrackerPatch, parseTrainingLogPatch, ValidationError } from "../validation.ts";

export type ResourceId = string | number;
export type ResourceCapability = "search" | "get" | "create" | "update" | "delete" | "action";
export type ResourceRecord = Record<string, unknown>;

export type ResourceField = {
  type: "integer" | "string" | "boolean" | "array" | "object";
  description: string;
  format?: string;
  enum?: Array<string | number>;
  items?: { type: "string" | "object"; properties?: Record<string,ResourceField> };
  max_length?: number;
  read_only?: boolean;
  default?: unknown;
};

export type ResourceSchema = {
  resource: string;
  description: string;
  fields: Record<string, ResourceField>;
  required_fields: string[];
  writable_fields: string[];
  searchable_fields: string[];
  supported_actions: string[];
  validation_rules: string[];
};

type ResourceSearchInput = { query?: string; filters?: ResourceRecord; limit: number; cursor?: string };
type ResourceActionInput = { id?: ResourceId; action: string; data: ResourceRecord };

type RegisteredResource = {
  schema: ResourceSchema;
  search?: (input: ResourceSearchInput) => Promise<{ items: ResourceRecord[]; next_cursor: string | null }>;
  get?: (id: ResourceId) => Promise<ResourceRecord>;
  create?: (data: ResourceRecord) => Promise<ResourceRecord>;
  update?: (id: ResourceId, data: ResourceRecord) => Promise<ResourceRecord>;
  delete?: (id: ResourceId) => Promise<{ deleted: true; id: ResourceId }>;
  action?: (input: ResourceActionInput) => Promise<ResourceRecord>;
};

export type ChronicleResourceOperations = {
  search(input: { query?: string; limit?: number }): Promise<ChronicleEntry[]>;
  get(id: number): Promise<ChronicleEntry | null>;
  create(input: Pick<ChronicleEntry, "date" | "title" | "contentMd" | "source">): Promise<ChronicleEntry>;
  update(id: number, input: Partial<Pick<ChronicleEntry, "date" | "title" | "contentMd" | "source">>): Promise<ChronicleEntry | null>;
  delete(id: number): Promise<boolean>;
};

export type InboxResourceOperations = {
  search(input: { query?: string; status?: InboxStatus | "all"; limit?: number }): Promise<InboxItem[]>;
  get(id: number): Promise<InboxItem | null>;
  create(input: Pick<InboxItem, "content" | "source">): Promise<InboxItem>;
  update(id: number, input: Pick<InboxItem, "content">): Promise<InboxItem | null>;
  delete(id: number): Promise<boolean>;
  markProcessed(id: number): Promise<InboxItem | null>;
  archive(id: number): Promise<InboxItem | null>;
  restore(id: number): Promise<InboxItem | null>;
};

export type MemoResourceOperations = {
  search(input: { query?: string; tag?: string; type?: MemoType; status?: MemoStatus; limit?: number }): Promise<Memo[]>;
  get(id: number): Promise<Memo | null>;
  create(input: Omit<Memo, "id" | "createdAt" | "updatedAt">): Promise<Memo>;
  update(id: number, input: Partial<Omit<Memo, "id" | "createdAt" | "updatedAt">>): Promise<Memo | null>;
  delete(id: number): Promise<boolean>;
};

export type ProjectResourceOperations = {
  search(input: { query?: string; status?: ProjectStatus; limit?: number }): Promise<Project[]>;
  get(id: number): Promise<Project | null>;
  create(input: Pick<Project, "name" | "description" | "status">): Promise<Project>;
  update(id: number, input: Partial<Pick<Project, "name" | "description" | "status">>): Promise<Project | null>;
};

export type ProjectItemResourceOperations = {
  search(input: { query?: string; projectId?: number; project?: string; status?: ProjectItemStatus; type?: ProjectItemType; module?: string; limit?: number }): Promise<ProjectItem[]>;
  get(id: number): Promise<ProjectItem | null>;
  create(input: Omit<ProjectItem, "id" | "projectName" | "createdAt" | "startedAt" | "completedAt" | "verifiedAt" | "updatedAt">): Promise<ProjectItem>;
  update(id: number, input: Partial<Omit<ProjectItem, "id" | "projectName" | "createdAt" | "startedAt" | "completedAt" | "verifiedAt" | "updatedAt">>): Promise<ProjectItem | null>;
};

export type LuciusDiaryResourceOperations = {
  search(input: { query?: string; tag?: string; limit?: number }): Promise<LuciusDiaryEntry[]>;
  get(id: number): Promise<LuciusDiaryEntry | null>;
  create(input: Omit<LuciusDiaryEntry, "id" | "createdAt" | "updatedAt">): Promise<LuciusDiaryEntry>;
  update(id: number, input: Partial<Omit<LuciusDiaryEntry, "id" | "createdAt" | "updatedAt">>): Promise<LuciusDiaryEntry | null>;
  delete(id: number): Promise<boolean>;
};

export type LuciusCaseResourceOperations = {
  search(input: { query?: string; errorType?: LuciusCaseErrorType; severity?: LuciusCaseSeverity; status?: LuciusCaseStatus; currentOnly?: boolean; limit?: number }): Promise<LuciusCase[]>;
  get(id: number): Promise<LuciusCase | null>;
  create(input: Omit<LuciusCase, "id" | "createdAt" | "updatedAt">): Promise<LuciusCase>;
  update(id: number, input: Partial<Omit<LuciusCase, "id" | "createdAt" | "updatedAt">>): Promise<LuciusCase | null>;
  delete(id: number): Promise<boolean>;
  recordRecurrence(id: number, occurredDate?: string): Promise<LuciusCase | null>;
};

export type LuciusStateResourceOperations = {
  get(): Promise<LuciusState>;
  update(input: Partial<Pick<LuciusState, "currentNote" | "status" | "mood">>): Promise<LuciusState>;
};

export type ResourceRegistryOperations = {
  inbox: InboxResourceOperations;
  memo: MemoResourceOperations;
  chronicle: ChronicleResourceOperations;
  luciusDiary: LuciusDiaryResourceOperations;
  luciusCase: LuciusCaseResourceOperations;
  luciusState: LuciusStateResourceOperations;
  project: ProjectResourceOperations;
  projectItem: ProjectItemResourceOperations;
  relationPerson: {search(input:{query?:string;includeArchived?:boolean;relationshipStatus?:"active"|"ended"}):Promise<RelationPersonSummary[]>;get(id:number):Promise<{person:RelationPerson;balance:{settlementMinor:number;socialMinor:number};latestEvent:RelationEvent|null;lastMetAt:string|null;lastMetHasExplicitTime:boolean|null;events:RelationEvent[];memoryNotes:PersonMemoryNote[]}|null>;create(input:ReturnType<typeof parseRelationPerson>):Promise<RelationPerson>;update(id:number,input:Partial<ReturnType<typeof parseRelationPersonPatch>>):Promise<RelationPerson|null>};
  relationEvent: {search(input:{personId?:number;limit?:number}):Promise<RelationEvent[]>;get(id:number):Promise<RelationEvent|null>;create(input:ReturnType<typeof parseRelationEvent>):Promise<RelationEvent>;update(id:number,input:ReturnType<typeof parseRelationEvent>):Promise<RelationEvent|null>;delete(id:number):Promise<boolean>;settle(flowId:number,input:ReturnType<typeof parseSettleAdvance>):Promise<RelationEvent>};
  personNote: {search(personId:number):Promise<PersonMemoryNote[]>;get(id:number):Promise<PersonMemoryNote|null>;create(personId:number,content:string):Promise<PersonMemoryNote>;update(id:number,content:string):Promise<PersonMemoryNote|null>;delete(id:number):Promise<boolean>};
  luciusPost?: { search(input:{limit?:number}):Promise<LuciusPost[]>; get(id:number):Promise<LuciusPost|null>; create(input:Omit<LuciusPost,"id"|"createdAt"|"updatedAt">):Promise<LuciusPost>; update(id:number,input:Partial<Omit<LuciusPost,"id"|"createdAt"|"updatedAt">>):Promise<LuciusPost|null>; delete(id:number):Promise<boolean> };
  healthRecord?: { search(input:{status?:"active"|"resolved";type?:HealthRecord["type"];from?:string;to?:string;limit?:number}):Promise<HealthRecord[]>; get(id:number):Promise<HealthRecord|null>; create(input:Omit<HealthRecord,"id"|"createdAt"|"updatedAt">):Promise<HealthRecord>; update(id:number,input:Record<string,unknown>):Promise<HealthRecord|null>; delete(id:number):Promise<boolean> };
  trainingLog?: { search(input:{from?:string;to?:string;limit?:number}):Promise<TrainingLog[]>; get(id:number):Promise<TrainingLog|null>; create(input:Omit<TrainingLog,"id"|"createdAt"|"updatedAt">):Promise<TrainingLog>; update(id:number,input:Partial<Omit<TrainingLog,"id"|"createdAt"|"updatedAt">>):Promise<TrainingLog|null>; delete(id:number):Promise<boolean> };
  media?: { search(input:{query?:string;mediaType?:MediaListItem["mediaType"];status?:MediaListItem["status"];rating?:NonNullable<MediaListItem["rating"]>;seriesId?:number;favorite?:boolean;rewatched?:boolean;limit?:number}):Promise<MediaListItem[]>; get(id:number):Promise<MediaDetail|null>; create(input:ReturnType<typeof parseNewMedia>):Promise<MediaDetail>; update(id:number,input:ReturnType<typeof parseMediaPatch>):Promise<MediaDetail|null>; delete(id:number):Promise<boolean>; addViewing(mediaId:number,watchedDate:string):Promise<object>; updateViewing(mediaId:number,viewingId:number,watchedDate:string):Promise<object|null>; deleteViewing(mediaId:number,viewingId:number):Promise<boolean> };
  mediaSeries?: { search():Promise<import("../types.ts").MediaSeries[]>; get(id:number):Promise<import("../types.ts").MediaSeries|null>; create(name:string):Promise<import("../types.ts").MediaSeries> };
  drinkLimit?: { search():Promise<DrinkLimit[]>; create(input:ReturnType<typeof parseDrinkLimit>):Promise<DrinkLimit>; update(id:number,input:ReturnType<typeof parseDrinkLimit>):Promise<DrinkLimit|null>; delete(id:number):Promise<boolean> };
  tracker?: { search():Promise<TrackerSummary[]>; get(id:number,query?:string):Promise<{tracker:Tracker;fields:unknown[];goals:unknown[];reminders:unknown[];entries:unknown[];stats:unknown;insights:unknown}|null>; create(input:ReturnType<typeof parseNewTracker>):Promise<Tracker>; update(id:number,input:ReturnType<typeof parseTrackerPatch>):Promise<Tracker|null>; delete(id:number):Promise<boolean>; createField(input:ReturnType<typeof parseNewTrackerField>):Promise<object>; deleteField(id:number):Promise<boolean>; createEntry(input:ReturnType<typeof parseNewTrackerEntry>):Promise<object>; updateEntry(id:number,input:ReturnType<typeof parseTrackerEntryPatch>):Promise<object|null>; deleteEntry(id:number):Promise<boolean>; createGoal(input:ReturnType<typeof parseNewTrackerGoal>):Promise<object>; deleteGoal(id:number):Promise<boolean>; createReminder(input:ReturnType<typeof parseNewTrackerReminder>):Promise<object>; deleteReminder(id:number):Promise<boolean> };
  catPet?: { search(includeInactive?:boolean):Promise<Pet[]>; get(id:number):Promise<{pet:Pet;timeline:unknown[];reminders:unknown[];routines:unknown[];medications:unknown[];measurements:unknown[]}>; create(input:ReturnType<typeof parsePet>):Promise<Pet>; update(id:number,input:ReturnType<typeof parsePetPatch>):Promise<Pet|null>; archive(id:number):Promise<boolean> };
  catRecord?: { search(petId?:number|null):Promise<CatTimelineEntry[]>; get(kind:CatRecordKind,id:number):Promise<object|null>; create(kind:CatRecordKind,input:ReturnType<typeof parseCatRecord>["record"]):Promise<object>; update(kind:CatRecordKind,id:number,input:Record<string,unknown>):Promise<object|null>; delete(kind:CatRecordKind,id:number):Promise<boolean> };
  catRoutine?: { search(input:{scope?:string;petId?:number|null;enabledOnly?:boolean}):Promise<CatRoutine[]>; get(id:number):Promise<CatRoutine|null>; create(input:ReturnType<typeof parseCatRoutine>):Promise<CatRoutine>; update(id:number,input:Record<string,unknown>):Promise<CatRoutine|null>; complete(id:number,actedAt?:Date):Promise<unknown>; skip(id:number,actedAt?:Date):Promise<unknown>; archive(id:number):Promise<boolean> };
  reminder?: { search(input:{targetType?:string;targetId?:number|null;activeOnly?:boolean}):Promise<Reminder[]>; create(input:ReturnType<typeof parseReminder>):Promise<Reminder>; update(id:number,input:Record<string,unknown>):Promise<Reminder|null>; delete(id:number):Promise<boolean>; complete(id:number,actedAt?:Date):Promise<unknown>; skip(id:number,actedAt?:Date):Promise<unknown>; snooze(id:number,choice:"later_today"|"tomorrow"|"custom",custom?:string):Promise<Reminder|null> };
};

function numericId(value: ResourceId, resource = "Resource") {
  const id = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError(`${resource} id must be a positive integer.`);
  return id;
}

function assertOnlyKeys(data: ResourceRecord, allowed: readonly string[], operation: string) {
  const unknown = Object.keys(data).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new ValidationError(`${operation} does not accept: ${unknown.join(", ")}. Call eo_schema first.`);
}

function definedValues<T extends ResourceRecord>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function mappedInput(data: ResourceRecord, fields: Record<string, string>) {
  return Object.fromEntries(Object.entries(fields).filter(([source]) => Object.hasOwn(data, source)).map(([source, target]) => [target, data[source]]));
}

function rejectCursor(cursor: string | undefined, resource: string) {
  if (cursor) throw new ValidationError(`${resource} does not support cursor pagination yet.`);
}

function filterEnum<T extends string>(value: unknown, values: readonly T[], field: string): T | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !values.includes(value as T)) throw new ValidationError(`${field} filter is invalid.`);
  return value as T;
}

function filterText(value: unknown, field: string) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim() || value.length > 60) throw new ValidationError(`${field} filter is invalid.`);
  return value.trim();
}

function migrationFields(): Record<string, ResourceField> {
  return {
    source_system: { type: "string", max_length: 120, description: "Optional source system reserved for migrations." },
    source_id: { type: "string", max_length: 300, description: "Optional identifier in the source system." },
    source_url: { type: "string", format: "uri", max_length: 2000, description: "Optional HTTP or HTTPS source URL." },
    imported_at: { type: "string", format: "date-time", description: "Optional import timestamp." },
  };
}

const migrationWritableFields = ["source_system", "source_id", "source_url", "imported_at"];
const migrationInputMap = { source_system: "sourceSystem", source_id: "sourceId", source_url: "sourceUrl", imported_at: "importedAt" };

function chronicleRecord(entry: ChronicleEntry): ResourceRecord {
  return {
    id: entry.id,
    date: entry.date,
    title: entry.title,
    content_md: entry.contentMd,
    source: entry.source,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  };
}

function inboxRecord(item: InboxItem): ResourceRecord {
  return {
    id: item.id,
    content: item.content,
    status: item.status,
    source: item.source,
    processed_at: item.processedAt,
    converted_type: item.convertedType,
    converted_id: item.convertedId,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

function inboxResource(operations: InboxResourceOperations): RegisteredResource {
  return {
    schema: {
      resource: "inbox",
      description: "Temporary, user-controlled capture items awaiting sorting in EvaOrbit Inbox.",
      fields: {
        id: { type: "integer", description: "Stable Inbox item identifier.", read_only: true },
        content: { type: "string", max_length: 10000, description: "The captured free-form text." },
        status: { type: "string", enum: ["inbox", "processed", "archived"], description: "Server-managed Inbox lifecycle state.", read_only: true },
        source: { type: "string", description: "Capture source.", read_only: true },
        processed_at: { type: "string", format: "date-time", description: "When the item was marked processed.", read_only: true },
        converted_type: { type: "string", description: "Legacy conversion target, when present.", read_only: true },
        converted_id: { type: "integer", description: "Legacy conversion record id, when present.", read_only: true },
        created_at: { type: "string", format: "date-time", description: "Server-assigned creation timestamp.", read_only: true },
        updated_at: { type: "string", format: "date-time", description: "Server-assigned update timestamp.", read_only: true },
      },
      required_fields: ["content"],
      writable_fields: ["content"],
      searchable_fields: ["content", "status"],
      supported_actions: ["mark_processed", "archive", "restore"],
      validation_rules: [
        "search defaults to status=inbox; use filters.status=all to search all history",
        "search filters accept only status: inbox, processed, archived, or all",
        "status is never client-writable; use mark_processed, archive, or restore",
        "creating an item records source=chatgpt",
        "moving content to Memo, Chronicle, or Project uses those resources separately and is never automatic",
        "delete only after an explicit user request",
        "unknown fields are rejected",
      ],
    },
    async search({ query, filters = {}, limit, cursor }) {
      assertOnlyKeys(filters, ["status"], "inbox search filters");
      rejectCursor(cursor, "Inbox");
      const status = filterEnum(filters.status, ["inbox", "processed", "archived", "all"] as const, "status") ?? "inbox";
      return { items: (await operations.search({ query, status, limit })).map(inboxRecord), next_cursor: null };
    },
    async get(resourceId) {
      const item = await operations.get(numericId(resourceId, "Inbox"));
      if (!item) throw new ConflictError("Inbox item not found.");
      return inboxRecord(item);
    },
    async create(data) {
      assertOnlyKeys(data, ["content"], "inbox create");
      return inboxRecord(await operations.create(parseNewInbox({ content: data.content, source: "chatgpt" })));
    },
    async update(resourceId, data) {
      assertOnlyKeys(data, ["content"], "inbox update");
      const patch = parseInboxPatch(data);
      const item = await operations.update(numericId(resourceId, "Inbox"), { content: patch.content! });
      if (!item) throw new ConflictError("Inbox item not found.");
      return inboxRecord(item);
    },
    async delete(resourceId) {
      const id = numericId(resourceId, "Inbox");
      if (!await operations.delete(id)) throw new ConflictError("Inbox item not found.");
      return { deleted: true, id };
    },
    async action({ id, action, data }) {
      if (id === undefined) throw new ValidationError(`${action} requires an Inbox item id.`);
      assertOnlyKeys(data, [], `inbox ${action}`);
      const numeric = numericId(id, "Inbox");
      const operation = action === "mark_processed" ? operations.markProcessed : action === "archive" ? operations.archive : operations.restore;
      const item = await operation(numeric);
      if (!item) throw new ConflictError("Inbox item not found.");
      return inboxRecord(item);
    },
  };
}

function migrationRecord(item: Memo | LuciusDiaryEntry | LuciusCase) {
  return { source_system: item.sourceSystem, source_id: item.sourceId, source_url: item.sourceUrl, imported_at: item.importedAt };
}

function memoRecord(item: Memo): ResourceRecord {
  return { id: item.id, title: item.title, content: item.content, type: item.type, status: item.status, tags: item.tags, event_date: item.eventDate, confirmed_at: item.confirmedAt, merged_into_id: item.mergedIntoId, ...migrationRecord(item), created_at: item.createdAt, updated_at: item.updatedAt };
}

function projectRecord(item:Project):ResourceRecord{return{id:item.id,name:item.name,description:item.description,status:item.status,doing_count:item.doingCount,to_solve_count:item.toSolveCount,created_at:item.createdAt,updated_at:item.updatedAt};}
function projectItemRecord(item:ProjectItem):ResourceRecord{return{id:item.id,project_id:item.projectId,project:item.projectName,title:item.title,description:item.description,type:item.type,status:item.status,module:item.module,priority:item.priority,next_step:item.nextStep,resolution:item.resolution,created_at:item.createdAt,started_at:item.startedAt,completed_at:item.completedAt,verified_at:item.verifiedAt,updated_at:item.updatedAt};}

function projectResource(operations:ProjectResourceOperations):RegisteredResource{
  const writable=["name","description","status"];
  return{schema:{resource:"project",description:"EvaOrbit project containers and their current open-work counts.",fields:{id:{type:"integer",description:"Stable project identifier.",read_only:true},name:{type:"string",max_length:200,description:"Project name."},description:{type:"string",max_length:5000,description:"Optional project context."},status:{type:"string",enum:["active","paused","archived"],default:"active",description:"Project lifecycle state."},doing_count:{type:"integer",description:"Current doing item count.",read_only:true},to_solve_count:{type:"integer",description:"Current to_solve item count.",read_only:true},created_at:{type:"string",format:"date-time",description:"Creation timestamp.",read_only:true},updated_at:{type:"string",format:"date-time",description:"Latest project or item activity.",read_only:true}},required_fields:["name"],writable_fields:writable,searchable_fields:["name","description","status"],supported_actions:[],validation_rules:["search filters accept only status","archive by updating status; project records are retained","unknown fields are rejected"]},async search({query,filters={},limit,cursor}){assertOnlyKeys(filters,["status"],"project search filters");rejectCursor(cursor,"Project");return{items:(await operations.search({query,status:filterEnum(filters.status,["active","paused","archived"] as const,"status"),limit})).map(projectRecord),next_cursor:null};},async get(id){const item=await operations.get(numericId(id,"Project"));if(!item)throw new ConflictError("Project not found.");return projectRecord(item);},async create(data){assertOnlyKeys(data,writable,"project create");return projectRecord(await operations.create(parseNewProject(data)));},async update(id,data){assertOnlyKeys(data,writable,"project update");const item=await operations.update(numericId(id,"Project"),definedValues(parseProjectPatch(data)));if(!item)throw new ConflictError("Project not found.");return projectRecord(item);}};
}

function projectItemResource(operations:ProjectItemResourceOperations):RegisteredResource{
  const writable=["project_id","title","description","type","status","module","priority","next_step","resolution"];
  const inputMap={project_id:"projectId",title:"title",description:"description",type:"type",status:"status",module:"module",priority:"priority",next_step:"nextStep",resolution:"resolution"};
  return{schema:{resource:"project_item",description:"Persistent EvaOrbit project requirements, issues, research, and completed work. This is the project delivery source of truth.",fields:{id:{type:"integer",description:"Stable item identifier.",read_only:true},project_id:{type:"integer",description:"Owning project identifier."},project:{type:"string",description:"Owning project name.",read_only:true},title:{type:"string",max_length:300,description:"Concise requirement or issue title."},description:{type:"string",max_length:20000,description:"Original request or problem statement."},type:{type:"string",enum:["feature","bug","ui","migration","research","tech_debt","other"],default:"other",description:"Work classification."},status:{type:"string",enum:["to_solve","doing","blocked","done","verified","dropped"],default:"to_solve",description:"done means implementation is claimed complete; verified requires actual user confirmation."},module:{type:"string",max_length:120,description:"Optional product area."},priority:{type:"string",max_length:60,description:"Optional free-form priority."},next_step:{type:"string",max_length:5000,description:"Concrete next action, especially for doing or blocked work."},resolution:{type:"string",max_length:10000,description:"Outcome shown in Recently Solved and Project Chronicle."},created_at:{type:"string",format:"date-time",description:"Creation timestamp.",read_only:true},started_at:{type:"string",format:"date-time",description:"First doing timestamp, assigned by the server.",read_only:true},completed_at:{type:"string",format:"date-time",description:"First done or verified timestamp, assigned by the server.",read_only:true},verified_at:{type:"string",format:"date-time",description:"First explicit verified timestamp, assigned by the server.",read_only:true},updated_at:{type:"string",format:"date-time",description:"Latest update timestamp.",read_only:true}},required_fields:["project_id","title"],writable_fields:writable,searchable_fields:["project","status","type","module","keyword"],supported_actions:[],validation_rules:["search filters accept project, project_id, status, type, and module","query searches title, description, and resolution","new requirements default to to_solve","done is never automatically promoted to verified","set verified only after the user actually checks and confirms the result","use dropped instead of deleting abandoned requirements","lifecycle timestamps are server-managed and retained","unknown fields are rejected"]},async search({query,filters={},limit,cursor}){assertOnlyKeys(filters,["project","project_id","status","type","module"],"project_item search filters");rejectCursor(cursor,"Project Item");const projectId=filters.project_id===undefined?undefined:numericId(filters.project_id as ResourceId,"Project");return{items:(await operations.search({query,projectId,project:filterText(filters.project,"project"),status:filterEnum(filters.status,["to_solve","doing","blocked","done","verified","dropped"] as const,"status"),type:filterEnum(filters.type,["feature","bug","ui","migration","research","tech_debt","other"] as const,"type"),module:filterText(filters.module,"module"),limit})).map(projectItemRecord),next_cursor:null};},async get(id){const item=await operations.get(numericId(id,"Project Item"));if(!item)throw new ConflictError("Project item not found.");return projectItemRecord(item);},async create(data){assertOnlyKeys(data,writable,"project_item create");return projectItemRecord(await operations.create(parseNewProjectItem(mappedInput(data,inputMap))));},async update(id,data){assertOnlyKeys(data,writable,"project_item update");const item=await operations.update(numericId(id,"Project Item"),definedValues(parseProjectItemPatch(mappedInput(data,inputMap))));if(!item)throw new ConflictError("Project item not found.");return projectItemRecord(item);}};
}

function luciusDiaryRecord(item: LuciusDiaryEntry): ResourceRecord {
  return { id: item.id, date: item.date, content: item.content, tags: item.tags, ...migrationRecord(item), created_at: item.createdAt, updated_at: item.updatedAt };
}

function luciusCaseRecord(item: LuciusCase): ResourceRecord {
  return { id: item.id, title: item.title, error_type: item.errorType, severity: item.severity, status: item.status, trigger_scenes: item.triggerScenes, error_quote: item.errorQuote, cause: item.cause, correct_behavior: item.correctBehavior, mandatory_rule: item.mandatoryRule, next_check: item.nextCheck, punishment: item.punishment, first_occurred_date: item.firstOccurredDate, latest_occurred_date: item.latestOccurredDate, occurrence_count: item.occurrenceCount, consecutive_correct_count: item.consecutiveCorrectCount, recurrence_interval_days: item.recurrenceIntervalDays, is_recurrence: item.isRecurrence, reset_threshold: item.resetThreshold, ...migrationRecord(item), created_at: item.createdAt, updated_at: item.updatedAt };
}

function luciusStateRecord(item: LuciusState): ResourceRecord {
  return { id: "current", current_note: item.currentNote, status: item.status, mood: item.mood, updated_at: item.updatedAt };
}

function luciusStateResource(operations: LuciusStateResourceOperations): RegisteredResource {
  const writableFields = ["current_note", "status", "mood"];
  const current = (id: ResourceId) => { if (id !== "current") throw new ValidationError("Lucius state id must be current."); };
  return {
    schema: {
      resource: "lucius_state",
      description: "The single persisted display state for the Lucius space. It does not generate text or keep mood history.",
      fields: {
        id: { type: "string", description: "Stable singleton id: current.", read_only: true },
        current_note: { type: "string", max_length: 2000, description: "The last explicitly saved Lucius note; empty is allowed." },
        status: { type: "string", max_length: 80, description: "Short persisted status text." },
        mood: { type: "string", max_length: 80, description: "Short persisted mood text." },
        updated_at: { type: "string", format: "date-time", description: "Server-managed last update timestamp, or null before first save.", read_only: true },
      },
      required_fields: [], writable_fields: writableFields, searchable_fields: [], supported_actions: [],
      validation_rules: ["use resource id current", "state changes only through explicit update", "no mood history, scores, or generated text", "unknown fields are rejected"],
    },
    async get(id) { current(id); return luciusStateRecord(await operations.get()); },
    async update(id, data) { current(id); assertOnlyKeys(data, writableFields, "lucius_state update"); return luciusStateRecord(await operations.update(parseLuciusStatePatch(mappedInput(data, { current_note: "currentNote", status: "status", mood: "mood" })))); },
  };
}

function chronicleResource(operations: ChronicleResourceOperations): RegisteredResource {
  const writableFields = ["date", "title", "content_md", "source"];
  const schema: ResourceSchema = {
    resource: "chronicle",
    description: "Dated Markdown entries in EvaOrbit Chronicle. Multiple entries may share the same date.",
    fields: {
      id: { type: "integer", description: "Stable Chronicle entry identifier.", read_only: true },
      date: { type: "string", format: "date", description: "Entry date in YYYY-MM-DD format." },
      title: { type: "string", max_length: 300, description: "Entry title; surrounding whitespace is trimmed." },
      content_md: { type: "string", max_length: 100000, description: "Original Markdown body. Markdown is stored without rewriting." },
      source: { type: "string", enum: ["manual", "chatgpt"], default: "manual", description: "How the entry text originated." },
      created_at: { type: "string", format: "date-time", description: "Server-assigned creation timestamp.", read_only: true },
      updated_at: { type: "string", format: "date-time", description: "Server-assigned update timestamp.", read_only: true },
    },
    required_fields: ["date", "title", "content_md"],
    writable_fields: writableFields,
    searchable_fields: ["title", "content_md"],
    supported_actions: [],
    validation_rules: [
      "date must be a real calendar date in YYYY-MM-DD format",
      "title must contain 1-300 characters after trimming",
      "content_md must contain non-whitespace Markdown and be at most 100000 characters",
      "source must be manual or chatgpt and defaults to manual",
      "update is PATCH: omitted fields remain unchanged",
      "unknown fields are rejected",
    ],
  };

  return {
    schema,
    async search({ query, filters = {}, limit, cursor }) {
      assertOnlyKeys(filters, [], "chronicle search filters");
      if (cursor) throw new ValidationError("Chronicle does not support cursor pagination yet.");
      return { items: (await operations.search({ query, limit })).map(chronicleRecord), next_cursor: null };
    },
    async get(resourceId) {
      const entry = await operations.get(numericId(resourceId));
      if (!entry) throw new ConflictError("Chronicle entry not found.");
      return chronicleRecord(entry);
    },
    async create(data) {
      assertOnlyKeys(data, writableFields, "chronicle create");
      const parsed = parseNewChronicleEntry({ date: data.date, title: data.title, contentMd: data.content_md, source: data.source });
      return chronicleRecord(await operations.create(parsed));
    },
    async update(resourceId, data) {
      assertOnlyKeys(data, writableFields, "chronicle update");
      const mapped: Record<string, unknown> = {};
      if (Object.hasOwn(data, "date")) mapped.date = data.date;
      if (Object.hasOwn(data, "title")) mapped.title = data.title;
      if (Object.hasOwn(data, "content_md")) mapped.contentMd = data.content_md;
      if (Object.hasOwn(data, "source")) mapped.source = data.source;
      const validated = parseChronicleEntryPatch(mapped);
      const patch = Object.fromEntries(Object.entries(validated).filter(([, value]) => value !== undefined));
      const entry = await operations.update(numericId(resourceId), patch);
      if (!entry) throw new ConflictError("Chronicle entry not found.");
      return chronicleRecord(entry);
    },
    async delete(resourceId) {
      const id = numericId(resourceId);
      if (!await operations.delete(id)) throw new ConflictError("Chronicle entry not found.");
      return { deleted: true, id };
    },
  };
}

function memoResource(operations: MemoResourceOperations): RegisteredResource {
  const writableFields = ["title", "content", "type", "status", "tags", "event_date", "confirmed_at", "merged_into_id", ...migrationWritableFields];
  const inputMap = { title: "title", content: "content", type: "type", status: "status", tags: "tags", event_date: "eventDate", confirmed_at: "confirmedAt", merged_into_id: "mergedIntoId", ...migrationInputMap };
  return {
    schema: {
      resource: "memo",
      description: "Long-term facts, rules, people, events, and context used by EvaOrbit. Search defaults to current active Memo only.",
      fields: {
        id: { type: "integer", description: "Stable Memo identifier.", read_only: true },
        title: { type: "string", max_length: 300, description: "Memo title." },
        content: { type: "string", max_length: 100000, description: "Long-term fact, rule, event, or note content." },
        type: { type: "string", enum: ["basic", "supplement", "event", "note"], default: "note", description: "Memo classification: 基本信息、补充信息、事件内容或便签内容." },
        status: { type: "string", enum: ["active", "merged", "archived", "historical"], default: "active", description: "Lifecycle state: 当前有效、已合并、已归档或历史记录." },
        tags: { type: "array", items: { type: "string" }, description: "Up to 20 unique tags." },
        event_date: { type: "string", format: "date", description: "Optional related event date." },
        confirmed_at: { type: "string", format: "date-time", description: "Optional confirmation timestamp." },
        merged_into_id: { type: "integer", description: "Optional target Memo identifier when merged." },
        ...migrationFields(),
        created_at: { type: "string", format: "date-time", description: "Server-assigned creation timestamp.", read_only: true },
        updated_at: { type: "string", format: "date-time", description: "Server-assigned update timestamp.", read_only: true },
      },
      required_fields: ["title", "content"],
      writable_fields: writableFields,
      searchable_fields: ["title", "content"],
      supported_actions: [],
      validation_rules: [
        "search without filters.status returns only status=active Memo",
        "set filters.status explicitly to active, merged, archived, or historical to search that lifecycle state",
        "search filters accept only status, type, and tag",
        "update is PATCH: omitted fields remain unchanged",
        "archive by PATCHing status to archived; eo_delete uses the Memo business service",
        "unknown fields are rejected",
      ],
    },
    async search({ query, filters = {}, limit, cursor }) {
      assertOnlyKeys(filters, ["status", "type", "tag"], "memo search filters"); rejectCursor(cursor, "Memo");
      const status = filterEnum(filters.status, ["active", "merged", "archived", "historical"] as const, "status") ?? "active";
      const type = filterEnum(filters.type, ["basic", "supplement", "event", "note"] as const, "type");
      const tag = filterText(filters.tag, "tag");
      return { items: (await operations.search({ query, status, type, tag, limit })).map(memoRecord), next_cursor: null };
    },
    async get(resourceId) { const item = await operations.get(numericId(resourceId, "Memo")); if (!item) throw new ConflictError("Memo not found."); return memoRecord(item); },
    async create(data) { assertOnlyKeys(data, writableFields, "memo create"); return memoRecord(await operations.create(parseNewMemo(mappedInput(data, inputMap)))); },
    async update(resourceId, data) { assertOnlyKeys(data, writableFields, "memo update"); const item = await operations.update(numericId(resourceId, "Memo"), definedValues(parseMemoPatch(mappedInput(data, inputMap)))); if (!item) throw new ConflictError("Memo not found."); return memoRecord(item); },
    async delete(resourceId) { const id = numericId(resourceId, "Memo"); if (!await operations.delete(id)) throw new ConflictError("Memo not found."); return { deleted: true, id }; },
  };
}

function luciusDiaryResource(operations: LuciusDiaryResourceOperations): RegisteredResource {
  const writableFields = ["date", "content", "tags", ...migrationWritableFields];
  const inputMap = { date: "date", content: "content", tags: "tags", ...migrationInputMap };
  return {
    schema: {
      resource: "lucius_diary",
      description: "Lucius subjective diary entries, stored as a lightweight date-descending timeline.",
      fields: {
        id: { type: "integer", description: "Stable Diary entry identifier.", read_only: true },
        date: { type: "string", format: "date", description: "Diary date in YYYY-MM-DD format." },
        content: { type: "string", max_length: 100000, description: "Subjective Diary content." },
        tags: { type: "array", items: { type: "string" }, description: "Free-form tags; common values include 日常、连接、信任、修正、误解、情绪、成长." },
        ...migrationFields(),
        created_at: { type: "string", format: "date-time", description: "Server-assigned creation timestamp.", read_only: true },
        updated_at: { type: "string", format: "date-time", description: "Server-assigned update timestamp.", read_only: true },
      },
      required_fields: ["date", "content"], writable_fields: writableFields, searchable_fields: ["content"], supported_actions: [],
      validation_rules: ["date must be a real calendar date in YYYY-MM-DD format", "search filters accept only tag", "update is PATCH: omitted fields remain unchanged", "unknown fields are rejected"],
    },
    async search({ query, filters = {}, limit, cursor }) { assertOnlyKeys(filters, ["tag"], "lucius_diary search filters"); rejectCursor(cursor, "Lucius Diary"); return { items: (await operations.search({ query, tag: filterText(filters.tag, "tag"), limit })).map(luciusDiaryRecord), next_cursor: null }; },
    async get(resourceId) { const item = await operations.get(numericId(resourceId, "Lucius Diary")); if (!item) throw new ConflictError("Lucius Diary entry not found."); return luciusDiaryRecord(item); },
    async create(data) { assertOnlyKeys(data, writableFields, "lucius_diary create"); return luciusDiaryRecord(await operations.create(parseNewLuciusDiaryEntry(mappedInput(data, inputMap)))); },
    async update(resourceId, data) { assertOnlyKeys(data, writableFields, "lucius_diary update"); const item = await operations.update(numericId(resourceId, "Lucius Diary"), definedValues(parseLuciusDiaryPatch(mappedInput(data, inputMap)))); if (!item) throw new ConflictError("Lucius Diary entry not found."); return luciusDiaryRecord(item); },
    async delete(resourceId) { const id = numericId(resourceId, "Lucius Diary"); if (!await operations.delete(id)) throw new ConflictError("Lucius Diary entry not found."); return { deleted: true, id }; },
  };
}

function luciusCaseResource(operations: LuciusCaseResourceOperations): RegisteredResource {
  const writableFields = ["title", "error_type", "severity", "status", "trigger_scenes", "error_quote", "cause", "correct_behavior", "mandatory_rule", "next_check", "punishment", "first_occurred_date", "latest_occurred_date", "occurrence_count", "consecutive_correct_count", "recurrence_interval_days", "is_recurrence", "reset_threshold", ...migrationWritableFields];
  const inputMap = { title: "title", error_type: "errorType", severity: "severity", status: "status", trigger_scenes: "triggerScenes", error_quote: "errorQuote", cause: "cause", correct_behavior: "correctBehavior", mandatory_rule: "mandatoryRule", next_check: "nextCheck", punishment: "punishment", first_occurred_date: "firstOccurredDate", latest_occurred_date: "latestOccurredDate", occurrence_count: "occurrenceCount", consecutive_correct_count: "consecutiveCorrectCount", recurrence_interval_days: "recurrenceIntervalDays", is_recurrence: "isRecurrence", reset_threshold: "resetThreshold", ...migrationInputMap };
  return {
    schema: {
      resource: "lucius_case",
      description: "Lucius correction and recurrence case records. Use record_recurrence instead of calculating recurrence counters client-side.",
      fields: {
        id: { type: "integer", description: "Stable case identifier.", read_only: true }, title: { type: "string", max_length: 300, description: "Case name." },
        error_type: { type: "string", enum: ["naming", "memory_omission", "factual", "tool_misuse", "expression", "other"], description: "Error classification." },
        severity: { type: "string", enum: ["minor", "moderate", "serious", "habitual"], default: "moderate", description: "Case severity." },
        status: { type: "string", enum: ["serving", "probation", "temporary_release", "permanent_record"], default: "serving", description: "Case status." },
        trigger_scenes: { type: "array", items: { type: "string" }, description: "Scenes that trigger this error." }, error_quote: { type: "string", max_length: 10000, description: "Original erroneous wording." },
        cause: { type: "string", max_length: 20000, description: "Root cause." }, correct_behavior: { type: "string", max_length: 20000, description: "Expected correct behavior." }, mandatory_rule: { type: "string", max_length: 20000, description: "Mandatory rule." },
        next_check: { type: "string", format: "date", description: "Optional next review date." }, punishment: { type: "string", max_length: 10000, description: "Optional consequence or corrective task." },
        first_occurred_date: { type: "string", format: "date", description: "First occurrence date." }, latest_occurred_date: { type: "string", format: "date", description: "Latest occurrence date." },
        occurrence_count: { type: "integer", default: 1, description: "Total occurrences." }, consecutive_correct_count: { type: "integer", default: 0, description: "Consecutive correct interactions." }, recurrence_interval_days: { type: "integer", description: "Days between the two latest occurrences; null for same-day recurrence." }, is_recurrence: { type: "boolean", default: false, description: "Whether recurrence has been recorded." }, reset_threshold: { type: "integer", default: 3, description: "Correct streak threshold." },
        ...migrationFields(), created_at: { type: "string", format: "date-time", description: "Server-assigned creation timestamp.", read_only: true }, updated_at: { type: "string", format: "date-time", description: "Server-assigned update timestamp.", read_only: true },
      },
      required_fields: ["title", "error_type", "cause", "correct_behavior", "mandatory_rule", "first_occurred_date"], writable_fields: writableFields,
      searchable_fields: ["title", "cause", "mandatory_rule"], supported_actions: ["record_recurrence"],
      validation_rules: ["search filters accept error_type, severity, status, and current_only", "latest_occurred_date cannot be earlier than first_occurred_date", "record_recurrence accepts optional data.occurred_date and atomically updates recurrence state", "do not send occurrence_count or other derived recurrence values to record_recurrence", "update is PATCH: omitted fields remain unchanged", "unknown fields are rejected"],
    },
    async search({ query, filters = {}, limit, cursor }) { assertOnlyKeys(filters, ["error_type", "severity", "status", "current_only"], "lucius_case search filters"); rejectCursor(cursor, "Lucius Case"); if (filters.current_only !== undefined && typeof filters.current_only !== "boolean") throw new ValidationError("current_only filter is invalid."); return { items: (await operations.search({ query, errorType: filterEnum(filters.error_type, ["naming", "memory_omission", "factual", "tool_misuse", "expression", "other"] as const, "error_type"), severity: filterEnum(filters.severity, ["minor", "moderate", "serious", "habitual"] as const, "severity"), status: filterEnum(filters.status, ["serving", "probation", "temporary_release", "permanent_record"] as const, "status"), currentOnly: filters.current_only as boolean | undefined, limit })).map(luciusCaseRecord), next_cursor: null }; },
    async get(resourceId) { const item = await operations.get(numericId(resourceId, "Lucius Case")); if (!item) throw new ConflictError("Lucius Case not found."); return luciusCaseRecord(item); },
    async create(data) { assertOnlyKeys(data, writableFields, "lucius_case create"); return luciusCaseRecord(await operations.create(parseNewLuciusCase(mappedInput(data, inputMap)))); },
    async update(resourceId, data) { assertOnlyKeys(data, writableFields, "lucius_case update"); const item = await operations.update(numericId(resourceId, "Lucius Case"), definedValues(parseLuciusCasePatch(mappedInput(data, inputMap)))); if (!item) throw new ConflictError("Lucius Case not found."); return luciusCaseRecord(item); },
    async delete(resourceId) { const id = numericId(resourceId, "Lucius Case"); if (!await operations.delete(id)) throw new ConflictError("Lucius Case not found."); return { deleted: true, id }; },
    async action({ id, action, data }) { if (action !== "record_recurrence") throw new ValidationError(`lucius_case does not support action: ${action}.`); if (id === undefined) throw new ValidationError("record_recurrence requires a case id."); assertOnlyKeys(data, ["occurred_date"], "lucius_case record_recurrence"); const occurredDate = data.occurred_date === undefined ? undefined : dateOnly(data.occurred_date, "复发日期"); const item = await operations.recordRecurrence(numericId(id, "Lucius Case"), occurredDate); if (!item) throw new ConflictError("Lucius Case not found."); return luciusCaseRecord(item); },
  };
}

function relationPersonRecord(person:RelationPerson|RelationPersonSummary):ResourceRecord{return{id:person.id,name:person.name,nickname:person.nickname,relation_label:person.relationLabel,closeness_rank:person.closenessRank,relationship_status:person.relationshipStatus,photo_path:person.photoPath,birthday:person.birthday,likes:person.likes,avoid:person.avoid,note:person.note,archived_at:person.archivedAt,...("balance" in person?{settlement_balance_minor:person.balance.settlementMinor,social_balance_minor:person.balance.socialMinor,latest_event:person.latestEvent?relationEventRecord(person.latestEvent):null,last_met_at:person.lastMetAt,last_met_has_explicit_time:person.lastMetHasExplicitTime}:{}),created_at:person.createdAt,updated_at:person.updatedAt};}
function relationEventRecord(event:RelationEvent):ResourceRecord{return{id:event.id,event_type:event.eventType,title:event.title,note:event.note,occurred_at:event.occurredAt,occurred_has_explicit_time:event.occurredHasExplicitTime,currency:event.currency,total_amount_minor:event.totalAmountMinor,is_in_person:event.isInPerson,parties:event.parties.map(p=>({id:p.id,party_type:p.partyType,person_id:p.personId,share_amount_minor:p.shareAmountMinor,paid_amount_minor:p.paidAmountMinor})),items:event.items.map(i=>({id:i.id,label:i.label,amount_minor:i.amountMinor,sort_order:i.sortOrder})),flows:event.flows.map(f=>({id:f.id,from_party_id:f.fromPartyId,to_party_id:f.toPartyId,flow_type:f.flowType,amount_minor:f.amountMinor,settles_flow_id:f.settlesFlowId,note:f.note})),created_at:event.createdAt,updated_at:event.updatedAt};}
function relationEventInput(data:ResourceRecord){const array=(value:unknown,field:string)=>{if(!Array.isArray(value))throw new ValidationError(`${field} must be an array.`);return value as ResourceRecord[];};return parseRelationEvent({eventType:data.event_type,title:data.title,note:data.note,occurredAt:data.occurred_at,occurredHasExplicitTime:data.occurred_has_explicit_time,totalAmountMinor:data.total_amount_minor,isInPerson:data.is_in_person,parties:array(data.parties,"parties").map(p=>({key:p.key,partyType:p.party_type,personId:p.person_id,shareAmountMinor:p.share_amount_minor,paidAmountMinor:p.paid_amount_minor})),items:array(data.items??[],"items").map(i=>({label:i.label,amountMinor:i.amount_minor,sortOrder:i.sort_order})),flows:array(data.flows??[],"flows").map(f=>({fromKey:f.from_key,toKey:f.to_key,flowType:f.flow_type,amountMinor:f.amount_minor,settlesFlowId:f.settles_flow_id,note:f.note}))});}
function relationPersonResource(operations:ResourceRegistryOperations["relationPerson"]):RegisteredResource{const writable=["name","nickname","relation_label","closeness_rank","relationship_status","birthday","likes","avoid","note"];const map={name:"name",nickname:"nickname",relation_label:"relationLabel",closeness_rank:"closenessRank",relationship_status:"relationshipStatus",birthday:"birthday",likes:"likes",avoid:"avoid",note:"note"};return{schema:{resource:"relation_person",description:"A lightweight person index for human exchanges. Relationship status and subjective closeness are user-maintained; recency and balances are independently derived from events.",fields:{id:{type:"integer",description:"Person id.",read_only:true},name:{type:"string",description:"Name."},nickname:{type:"string",description:"Optional nickname."},relation_label:{type:"string",description:"Optional relationship label."},closeness_rank:{type:"integer",enum:[1,2,3,4,5],description:"Optional user-maintained closeness; 5 is closest. Never inferred."},relationship_status:{type:"string",enum:["active","ended"],description:"User-maintained relationship status. Ended people may still have new events."},birthday:{type:"string",format:"date",description:"Optional date-only birthday."},likes:{type:"string",description:"Likes."},avoid:{type:"string",description:"Things to avoid."},note:{type:"string",description:"Profile note."},settlement_balance_minor:{type:"integer",description:"Derived advance/repayment net; positive means the person owes the user.",read_only:true},social_balance_minor:{type:"integer",description:"Derived treat/gift/favor net; kept separate from debt.",read_only:true},latest_event:{type:"object",description:"Most recent aggregate event, independent of status and closeness.",read_only:true},last_met_at:{type:"string",format:"date-time",description:"Latest in-person event timestamp, or null.",read_only:true},last_met_has_explicit_time:{type:"boolean",description:"Whether last_met_at includes a user-entered time.",read_only:true},archived_at:{type:"string",format:"date-time",description:"Archive timestamp, independent of relationship status.",read_only:true},photo_path:{type:"string",description:"Private optional photo endpoint.",read_only:true},created_at:{type:"string",format:"date-time",description:"Created.",read_only:true},updated_at:{type:"string",format:"date-time",description:"Updated.",read_only:true}},required_fields:["name"],writable_fields:writable,searchable_fields:["name","nickname","relation_label"],supported_actions:["archive","restore"],validation_rules:["closeness_rank and relationship_status are only changed explicitly by the user or client","new events never change closeness_rank or relationship_status","ended and archived are independent","balances, latest_event, and last_met_at are derived and never writable","birthday is date-only","unknown fields are rejected"]},async search({query,filters={},limit,cursor}){assertOnlyKeys(filters,["include_archived","relationship_status"],"relation_person search filters");rejectCursor(cursor,"Relation person");if(filters.include_archived!==undefined&&typeof filters.include_archived!=="boolean")throw new ValidationError("include_archived must be boolean.");const relationshipStatus=filterEnum(filters.relationship_status,["active","ended"] as const,"relationship_status");return{items:(await operations.search({query,includeArchived:filters.include_archived as boolean|undefined,relationshipStatus})).slice(0,limit).map(relationPersonRecord),next_cursor:null};},async get(value){const detail=await operations.get(numericId(value,"Relation person"));if(!detail)throw new ConflictError("Relation person not found.");return{...relationPersonRecord(detail.person),settlement_balance_minor:detail.balance.settlementMinor,social_balance_minor:detail.balance.socialMinor,latest_event:detail.latestEvent?relationEventRecord(detail.latestEvent):null,last_met_at:detail.lastMetAt,last_met_has_explicit_time:detail.lastMetHasExplicitTime,events:detail.events.map(relationEventRecord),memory_notes:detail.memoryNotes.map(personNoteRecord)};},async create(data){assertOnlyKeys(data,writable,"relation_person create");return relationPersonRecord(await operations.create(parseRelationPerson(mappedInput(data,map))));},async update(value,data){assertOnlyKeys(data,writable,"relation_person update");const item=await operations.update(numericId(value,"Relation person"),parseRelationPersonPatch(mappedInput(data,map)));if(!item)throw new ConflictError("Relation person not found.");return relationPersonRecord(item);},async action({id,action,data}){if(id===undefined)throw new ValidationError(`${action} requires a person id.`);if(action!=="archive"&&action!=="restore")throw new ValidationError(`relation_person does not support action: ${action}.`);assertOnlyKeys(data,[],`relation_person ${action}`);const item=await operations.update(numericId(id,"Relation person"),{archivedAt:action==="archive"?new Date().toISOString():null});if(!item)throw new ConflictError("Relation person not found.");return relationPersonRecord(item);}};}
function relationEventResource(operations:ResourceRegistryOperations["relationEvent"]):RegisteredResource{const writable=["event_type","title","note","occurred_at","occurred_has_explicit_time","total_amount_minor","is_in_person","parties","items","flows"];return{schema:{resource:"relation_event",description:"One real multi-person exchange aggregate with participants, optional expense items, and directed value flows.",fields:{id:{type:"integer",description:"Event id.",read_only:true},event_type:{type:"string",enum:["expense","gift","repayment","favor","interaction"],description:"Stable event type."},title:{type:"string",description:"Event title."},note:{type:"string",description:"Optional note."},occurred_at:{type:"string",format:"date-time",description:"Occurrence timestamp; date-only events use noon plus the explicit-time flag."},occurred_has_explicit_time:{type:"boolean",description:"Whether the user entered a real time."},currency:{type:"string",enum:["CNY"],description:"Phase 1 currency.",read_only:true},total_amount_minor:{type:"integer",description:"Expense total in integer fen; null otherwise."},is_in_person:{type:"boolean",description:"Optional in-person signal."},parties:{type:"array",items:{type:"object"},description:"Exactly one self plus unique people, with expense share and paid amounts."},items:{type:"array",items:{type:"object"},description:"Optional expense items."},flows:{type:"array",items:{type:"object"},description:"Directed advance/treat/gift/repayment/favor flows. Inputs use from_key and to_key."},created_at:{type:"string",format:"date-time",description:"Created.",read_only:true},updated_at:{type:"string",format:"date-time",description:"Updated.",read_only:true}},required_fields:["event_type","title","occurred_at","occurred_has_explicit_time","parties","items","flows"],writable_fields:writable,searchable_fields:["title","person_id","event_type"],supported_actions:["settle_advance"],validation_rules:["expense total equals sum of shares and sum of paid amounts","expense payment deltas must be fully represented by advance or treat flows","non-expenses have null share/paid and total","amounts are integer fen","one group activity is one aggregate event","settle_advance requires data amount_minor, occurred_at, occurred_has_explicit_time and optional note"]},async search({query,filters={},limit,cursor}){assertOnlyKeys(filters,["person_id","event_type"],"relation_event search filters");rejectCursor(cursor,"Relation event");const personId=filters.person_id===undefined?undefined:numericId(filters.person_id as ResourceId,"Person");let events=await operations.search({personId,limit:Math.min(limit*3,100)});if(query)events=events.filter(e=>`${e.title} ${e.note??""}`.toLowerCase().includes(query.toLowerCase()));if(filters.event_type)events=events.filter(e=>e.eventType===filters.event_type);return{items:events.slice(0,limit).map(relationEventRecord),next_cursor:null};},async get(value){const item=await operations.get(numericId(value,"Relation event"));if(!item)throw new ConflictError("Relation event not found.");return relationEventRecord(item);},async create(data){assertOnlyKeys(data,writable,"relation_event create");return relationEventRecord(await operations.create(relationEventInput(data)));},async update(value,data){assertOnlyKeys(data,writable,"relation_event update");const item=await operations.update(numericId(value,"Relation event"),relationEventInput(data));if(!item)throw new ConflictError("Relation event not found.");return relationEventRecord(item);},async delete(value){const id=numericId(value,"Relation event");if(!await operations.delete(id))throw new ConflictError("Relation event not found.");return{deleted:true,id};},async action({action,id,data}){if(action!=="settle_advance"||id===undefined)throw new ValidationError("settle_advance requires the advance flow id as id.");assertOnlyKeys(data,["amount_minor","occurred_at","occurred_has_explicit_time","note"],"settle_advance");return relationEventRecord(await operations.settle(numericId(id,"Advance flow"),parseSettleAdvance({amountMinor:data.amount_minor,occurredAt:data.occurred_at,occurredHasExplicitTime:data.occurred_has_explicit_time,note:data.note})));}};}
function personNoteRecord(note:PersonMemoryNote):ResourceRecord{return{id:note.id,person_id:note.personId,content:note.content,created_at:note.createdAt,updated_at:note.updatedAt};}
function personNoteResource(operations:ResourceRegistryOperations["personNote"]):RegisteredResource{return{schema:{resource:"person_note",description:"A small memory fragment attached to one relation person.",fields:{id:{type:"integer",description:"Note id.",read_only:true},person_id:{type:"integer",description:"Owning person id."},content:{type:"string",description:"Memory fragment."},created_at:{type:"string",format:"date-time",description:"Created.",read_only:true},updated_at:{type:"string",format:"date-time",description:"Updated.",read_only:true}},required_fields:["person_id","content"],writable_fields:["person_id","content"],searchable_fields:["person_id","content"],supported_actions:[],validation_rules:["search requires person_id filter","person_id cannot be changed by update"]},async search({query,filters={},limit,cursor}){assertOnlyKeys(filters,["person_id"],"person_note search filters");rejectCursor(cursor,"Person note");if(filters.person_id===undefined)throw new ValidationError("person_note search requires person_id.");let notes=await operations.search(numericId(filters.person_id as ResourceId,"Person"));if(query)notes=notes.filter(n=>n.content.toLowerCase().includes(query.toLowerCase()));return{items:notes.slice(0,limit).map(personNoteRecord),next_cursor:null};},async get(value){const item=await operations.get(numericId(value,"Person note"));if(!item)throw new ConflictError("Person note not found.");return personNoteRecord(item);},async create(data){assertOnlyKeys(data,["person_id","content"],"person_note create");return personNoteRecord(await operations.create(numericId(data.person_id as ResourceId,"Person"),parseMemoryNote({content:data.content})));},async update(value,data){assertOnlyKeys(data,["content"],"person_note update");const item=await operations.update(numericId(value,"Person note"),parseMemoryNote({content:data.content}));if(!item)throw new ConflictError("Person note not found.");return personNoteRecord(item);},async delete(value){const id=numericId(value,"Person note");if(!await operations.delete(id))throw new ConflictError("Person note not found.");return{deleted:true,id};}};}

const timestamps={created_at:{type:"string",format:"date-time",description:"Server-assigned creation timestamp.",read_only:true},updated_at:{type:"string",format:"date-time",description:"Server-assigned update timestamp.",read_only:true}} satisfies Record<string,ResourceField>;
function luciusPostRecord(item:LuciusPost):ResourceRecord{return{id:item.id,content:item.content,published_at:item.publishedAt,created_at:item.createdAt,updated_at:item.updatedAt};}
function luciusPostResource(operations:NonNullable<ResourceRegistryOperations["luciusPost"]>):RegisteredResource{const writable=["content","published_at"];return{schema:{resource:"lucius_post",description:"Short text posts published on Lucius's private profile.",fields:{id:{type:"integer",description:"Post id.",read_only:true},content:{type:"string",max_length:1000,description:"Short post body."},published_at:{type:"string",format:"date-time",description:"Publication timestamp."},...timestamps},required_fields:["content"],writable_fields:writable,searchable_fields:["content"],supported_actions:[],validation_rules:["search is newest first","update is PATCH","unknown fields are rejected"]},async search({query,filters={},limit,cursor}){assertOnlyKeys(filters,[],"lucius_post search filters");rejectCursor(cursor,"Lucius Post");let items=await operations.search({limit:Math.min(limit*3,100)});if(query)items=items.filter(item=>item.content.toLocaleLowerCase().includes(query.toLocaleLowerCase()));return{items:items.slice(0,limit).map(luciusPostRecord),next_cursor:null};},async get(value){const item=await operations.get(numericId(value,"Lucius Post"));if(!item)throw new ConflictError("Lucius Post not found.");return luciusPostRecord(item);},async create(data){assertOnlyKeys(data,writable,"lucius_post create");return luciusPostRecord(await operations.create(parseNewLuciusPost(mappedInput(data,{content:"content",published_at:"publishedAt"}))));},async update(value,data){assertOnlyKeys(data,writable,"lucius_post update");const item=await operations.update(numericId(value,"Lucius Post"),parseLuciusPostPatch(mappedInput(data,{content:"content",published_at:"publishedAt"})));if(!item)throw new ConflictError("Lucius Post not found.");return luciusPostRecord(item);},async delete(value){const id=numericId(value,"Lucius Post");if(!await operations.delete(id))throw new ConflictError("Lucius Post not found.");return{deleted:true,id};}};}

function healthRecord(item:HealthRecord):ResourceRecord{return{id:item.id,occurred_at:item.occurredAt,occurred_has_explicit_time:item.occurredHasExplicitTime,type:item.type,title:item.title,summary:item.summary,status:item.status,started_at:item.startedAt,started_has_explicit_time:item.startedHasExplicitTime,ended_at:item.endedAt,ended_has_explicit_time:item.endedHasExplicitTime,details:item.details,created_at:item.createdAt,updated_at:item.updatedAt};}
const healthMap={occurred_at:"occurredAt",occurred_has_explicit_time:"occurredHasExplicitTime",type:"type",title:"title",summary:"summary",status:"status",started_at:"startedAt",started_has_explicit_time:"startedHasExplicitTime",ended_at:"endedAt",ended_has_explicit_time:"endedHasExplicitTime",details:"details"};
function healthRecordResource(operations:NonNullable<ResourceRegistryOperations["healthRecord"]>):RegisteredResource{const writable=Object.keys(healthMap);return{schema:{resource:"health_record",description:"Personal symptoms, medications, visits, tests, conditions, treatments, measurements, and notes.",fields:{id:{type:"integer",description:"Health record id.",read_only:true},occurred_at:{type:"string",format:"date-time",description:"Occurrence date or time."},occurred_has_explicit_time:{type:"boolean",description:"Whether occurred_at contains a user-entered time."},type:{type:"string",enum:["symptom","medication","visit","test","condition","treatment","measurement","note"],description:"Record type."},title:{type:"string",max_length:200,description:"Title."},summary:{type:"string",max_length:5000,description:"Summary."},status:{type:"string",enum:["active","resolved"],description:"Lifecycle status."},started_at:{type:"string",format:"date-time",description:"Optional start."},started_has_explicit_time:{type:"boolean",description:"Whether start has explicit time."},ended_at:{type:"string",format:"date-time",description:"Optional end."},ended_has_explicit_time:{type:"boolean",description:"Whether end has explicit time."},details:{type:"object",description:"Type-specific structured details."},...timestamps},required_fields:["occurred_at","type","title"],writable_fields:writable,searchable_fields:["type","status","date_range"],supported_actions:[],validation_rules:["search filters accept type, status, from, and to","date-only values keep their explicit-time flags","update is PATCH","unknown fields are rejected"]},async search({filters={},limit,cursor}){assertOnlyKeys(filters,["type","status","from","to"],"health_record search filters");rejectCursor(cursor,"Health record");return{items:(await operations.search({type:filterEnum(filters.type,["symptom","medication","visit","test","condition","treatment","measurement","note"] as const,"type"),status:filterEnum(filters.status,["active","resolved"] as const,"status"),from:filterText(filters.from,"from"),to:filterText(filters.to,"to"),limit})).map(healthRecord),next_cursor:null};},async get(value){const item=await operations.get(numericId(value,"Health record"));if(!item)throw new ConflictError("Health record not found.");return healthRecord(item);},async create(data){assertOnlyKeys(data,writable,"health_record create");return healthRecord(await operations.create(parseNewHealthRecord(mappedInput(data,healthMap))));},async update(value,data){assertOnlyKeys(data,writable,"health_record update");const item=await operations.update(numericId(value,"Health record"),parseHealthRecordPatch(mappedInput(data,healthMap)));if(!item)throw new ConflictError("Health record not found.");return healthRecord(item);},async delete(value){const id=numericId(value,"Health record");if(!await operations.delete(id))throw new ConflictError("Health record not found.");return{deleted:true,id};}};}

function trainingRecord(item:TrainingLog):ResourceRecord{return{id:item.id,occurred_at:item.occurredAt,occurred_has_explicit_time:item.occurredHasExplicitTime,training_type:item.trainingType,body_parts:item.bodyParts,teacher:item.teacher,course:item.course,duration_minutes:item.durationMinutes,notes:item.notes,created_at:item.createdAt,updated_at:item.updatedAt};}
const trainingMap={occurred_at:"occurredAt",occurred_has_explicit_time:"occurredHasExplicitTime",training_type:"trainingType",body_parts:"bodyParts",teacher:"teacher",course:"course",duration_minutes:"durationMinutes",notes:"notes"};
function trainingLogResource(operations:NonNullable<ResourceRegistryOperations["trainingLog"]>):RegisteredResource{const writable=Object.keys(trainingMap);return{schema:{resource:"training_log",description:"Personal cardio, strength, and mixed training sessions.",fields:{id:{type:"integer",description:"Training log id.",read_only:true},occurred_at:{type:"string",format:"date-time",description:"Training date or time."},occurred_has_explicit_time:{type:"boolean",description:"Whether time was explicitly entered."},training_type:{type:"string",enum:["cardio","strength","mixed"],description:"Training type."},body_parts:{type:"array",items:{type:"string"},description:"Body parts trained."},teacher:{type:"string",description:"Teacher."},course:{type:"string",description:"Course."},duration_minutes:{type:"integer",description:"Optional duration."},notes:{type:"string",description:"Notes."},...timestamps},required_fields:["occurred_at","body_parts"],writable_fields:writable,searchable_fields:["date_range"],supported_actions:[],validation_rules:["search filters accept from and to","date-only values keep occurred_has_explicit_time=false","update is PATCH","unknown fields are rejected"]},async search({filters={},limit,cursor}){assertOnlyKeys(filters,["from","to"],"training_log search filters");rejectCursor(cursor,"Training log");return{items:(await operations.search({from:filterText(filters.from,"from"),to:filterText(filters.to,"to"),limit})).map(trainingRecord),next_cursor:null};},async get(value){const item=await operations.get(numericId(value,"Training log"));if(!item)throw new ConflictError("Training log not found.");return trainingRecord(item);},async create(data){assertOnlyKeys(data,writable,"training_log create");return trainingRecord(await operations.create(parseNewTrainingLog(mappedInput(data,trainingMap))));},async update(value,data){assertOnlyKeys(data,writable,"training_log update");const item=await operations.update(numericId(value,"Training log"),parseTrainingLogPatch(mappedInput(data,trainingMap)));if(!item)throw new ConflictError("Training log not found.");return trainingRecord(item);},async delete(value){const id=numericId(value,"Training log");if(!await operations.delete(id))throw new ConflictError("Training log not found.");return{deleted:true,id};}};}

function mediaRecord(item:MediaListItem|MediaDetail):ResourceRecord{return{id:item.id,title:item.title,original_title:item.originalTitle,translated_title:item.translatedTitle,media_type:item.mediaType,status:item.status,rating:item.rating,is_favorite:item.isFavorite,note:item.note,cover_url:item.coverUrl,series_id:item.seriesId,series_name:item.seriesName,season_number:item.seasonNumber,season_title:item.seasonTitle,...("latestWatchedDate" in item?{latest_watched_date:item.latestWatchedDate,viewing_count:item.viewingCount}:{}),...("viewings" in item?{viewings:item.viewings.map(v=>({id:v.id,watched_date:v.watchedDate,viewing_number:v.viewingNumber,created_at:v.createdAt}))}:{}),created_at:item.createdAt,updated_at:item.updatedAt};}
const mediaMap={title:"title",original_title:"originalTitle",translated_title:"translatedTitle",media_type:"mediaType",status:"status",rating:"rating",is_favorite:"isFavorite",note:"note",series_id:"seriesId",season_number:"seasonNumber",season_title:"seasonTitle",watched_date:"watchedDate"};
function mediaResource(operations:NonNullable<ResourceRegistryOperations["media"]>):RegisteredResource{const createFields=Object.keys(mediaMap),updateFields=createFields.filter(k=>k!=="watched_date"&&k!=="title");return{schema:{resource:"media",description:"Movies, television, anime, documentaries, and other watched or planned media.",fields:{id:{type:"integer",description:"Media id.",read_only:true},title:{type:"string",description:"Resolved display title.",read_only:true},original_title:{type:"string",description:"Original title."},translated_title:{type:"string",description:"Translated title."},media_type:{type:"string",enum:["movie","tv","anime","documentary","other"],description:"Media type."},status:{type:"string",enum:["planned","watching","completed","paused","dropped"],description:"Viewing status."},rating:{type:"string",description:"Optional EvaOrbit rating."},is_favorite:{type:"boolean",description:"Favorite flag."},note:{type:"string",description:"Note."},series_id:{type:"integer",description:"Optional series id."},season_number:{type:"integer",description:"Optional season number."},season_title:{type:"string",description:"Optional season title."},watched_date:{type:"string",format:"date",description:"Initial watched date; create only."},viewings:{type:"array",items:{type:"object"},description:"Viewing history.",read_only:true},cover_url:{type:"string",description:"Cover URL.",read_only:true},series_name:{type:"string",description:"Series name.",read_only:true},latest_watched_date:{type:"string",format:"date",description:"Latest viewing date.",read_only:true},viewing_count:{type:"integer",description:"Viewing count.",read_only:true},...timestamps},required_fields:["media_type"],writable_fields:createFields,searchable_fields:["title"],supported_actions:["add_viewing","update_viewing","delete_viewing"],validation_rules:["search filters accept media_type, status, rating, series_id, favorite, and rewatched","completed items require watched_date on create","viewing actions use the existing media viewing services","cover upload remains on its Web API","unknown fields are rejected"]},async search({query,filters={},limit,cursor}){assertOnlyKeys(filters,["media_type","status","rating","series_id","favorite","rewatched"],"media search filters");rejectCursor(cursor,"Media");return{items:(await operations.search({query,mediaType:filterEnum(filters.media_type,["movie","tv","anime","documentary","other"] as const,"media_type"),status:filterEnum(filters.status,["planned","watching","completed","paused","dropped"] as const,"status"),rating:filterEnum(filters.rating,["goat","goat+","goat-","dope","dope+","dope-","mid","mid+","mid-","nope","nope+","nope-","shit","shit+","shit-"] as const,"rating"),seriesId:filters.series_id===undefined?undefined:numericId(filters.series_id as ResourceId,"Series"),favorite:filters.favorite as boolean|undefined,rewatched:filters.rewatched as boolean|undefined,limit})).map(mediaRecord),next_cursor:null};},async get(value){const item=await operations.get(numericId(value,"Media"));if(!item)throw new ConflictError("Media not found.");return mediaRecord(item);},async create(data){assertOnlyKeys(data,createFields,"media create");return mediaRecord(await operations.create(parseNewMedia(mappedInput(data,mediaMap))));},async update(value,data){assertOnlyKeys(data,updateFields,"media update");const item=await operations.update(numericId(value,"Media"),parseMediaPatch(mappedInput(data,mediaMap)));if(!item)throw new ConflictError("Media not found.");return mediaRecord(item);},async delete(value){const id=numericId(value,"Media");if(!await operations.delete(id))throw new ConflictError("Media not found.");return{deleted:true,id};},async action({id,action,data}){if(id===undefined)throw new ValidationError(`${action} requires a media id.`);const mediaId=numericId(id,"Media");if(action==="add_viewing"){assertOnlyKeys(data,["watched_date"],"media add_viewing");return snakeRecord(await operations.addViewing(mediaId,parseMediaViewing({watchedDate:data.watched_date}).watchedDate));}if(action==="update_viewing"){assertOnlyKeys(data,["viewing_id","watched_date"],"media update_viewing");const item=await operations.updateViewing(mediaId,numericId(data.viewing_id as ResourceId,"Viewing"),parseMediaViewing({watchedDate:data.watched_date}).watchedDate);if(!item)throw new ConflictError("Media viewing not found.");return snakeRecord(item);}if(action==="delete_viewing"){assertOnlyKeys(data,["viewing_id"],"media delete_viewing");const viewingId=numericId(data.viewing_id as ResourceId,"Viewing");if(!await operations.deleteViewing(mediaId,viewingId))throw new ConflictError("Media viewing not found.");return{deleted:true,id:viewingId};}throw new ValidationError(`media does not support action: ${action}.`);}};}

function mediaSeriesResource(operations:NonNullable<ResourceRegistryOperations["mediaSeries"]>):RegisteredResource{return{schema:{resource:"media_series",description:"Media series and franchises used to group media items.",fields:{id:{type:"integer",description:"Series id.",read_only:true},name:{type:"string",description:"Series name."},item_count:{type:"integer",description:"Number of media items.",read_only:true},...timestamps},required_fields:["name"],writable_fields:["name"],searchable_fields:["name"],supported_actions:[],validation_rules:["the current Web API supports list, get, and create only","unknown fields are rejected"]},async search({query,filters={},limit,cursor}){assertOnlyKeys(filters,[],"media_series search filters");rejectCursor(cursor,"Media series");let items=await operations.search();if(query)items=items.filter(item=>item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));return{items:items.slice(0,limit).map(snakeRecord),next_cursor:null};},async get(value){const item=await operations.get(numericId(value,"Media series"));if(!item)throw new ConflictError("Media series not found.");return snakeRecord(item);},async create(data){assertOnlyKeys(data,["name"],"media_series create");return snakeRecord(await operations.create(parseMediaSeries(data).name));}};}

function drinkLimitRecord(item:DrinkLimit):ResourceRecord{return{id:item.id,name:item.name,target_type:item.targetType,period:item.period,limit_value:item.limitValue,enabled:item.enabled,created_at:item.createdAt,updated_at:item.updatedAt};}
function drinkLimitResource(operations:NonNullable<ResourceRegistryOperations["drinkLimit"]>):RegisteredResource{const writable=["name","target_type","period","limit_value","enabled"],map={name:"name",target_type:"targetType",period:"period",limit_value:"limitValue",enabled:"enabled"};return{schema:{resource:"drink_limit",description:"Configurable limits for drink categories.",fields:{id:{type:"integer",description:"Limit id.",read_only:true},name:{type:"string",description:"Limit name."},target_type:{type:"string",description:"Drink category target."},period:{type:"string",enum:["daily","weekly","monthly"],description:"Limit period."},limit_value:{type:"integer",description:"Maximum count."},enabled:{type:"boolean",description:"Whether enforced."},...timestamps},required_fields:["name","target_type","period","limit_value"],writable_fields:writable,searchable_fields:[],supported_actions:[],validation_rules:["search has no filters","updates replace all writable fields, matching the Web API","unknown fields are rejected"]},async search({filters={},limit,cursor}){assertOnlyKeys(filters,[],"drink_limit search filters");rejectCursor(cursor,"Drink limit");return{items:(await operations.search()).slice(0,limit).map(drinkLimitRecord),next_cursor:null};},async get(value){const id=numericId(value,"Drink limit"),item=(await operations.search()).find(entry=>entry.id===id);if(!item)throw new ConflictError("Drink limit not found.");return drinkLimitRecord(item);},async create(data){assertOnlyKeys(data,writable,"drink_limit create");return drinkLimitRecord(await operations.create(parseDrinkLimit(mappedInput(data,map))));},async update(value,data){assertOnlyKeys(data,writable,"drink_limit update");const item=await operations.update(numericId(value,"Drink limit"),parseDrinkLimit(mappedInput(data,map)));if(!item)throw new ConflictError("Drink limit not found.");return drinkLimitRecord(item);},async delete(value){const id=numericId(value,"Drink limit");if(!await operations.delete(id))throw new ConflictError("Drink limit not found.");return{deleted:true,id};}};}

function trackerRecord(item:Tracker|TrackerSummary):ResourceRecord{return{id:item.id,name:item.name,icon:item.icon,icon_type:item.iconType,icon_value:item.iconValue,group_name:item.groupName,time_type:item.timeType,quick_capture_enabled:item.quickCaptureEnabled,stats_config:item.statsConfig,...("stats" in item?{stats:item.stats}:{}),created_at:item.createdAt,updated_at:item.updatedAt};}
function trackerResource(operations:NonNullable<ResourceRegistryOperations["tracker"]>):RegisteredResource{const writable=["name","group_name","quick_capture_enabled","stats_config"],map={name:"name",group_name:"groupName",quick_capture_enabled:"quickCaptureEnabled",stats_config:"statsConfig"};return{schema:{resource:"tracker",description:"Custom structured trackers. Detail includes fields, goals, reminders, entries, stats, and insights.",fields:{id:{type:"integer",description:"Tracker id.",read_only:true},name:{type:"string",description:"Name."},group_name:{type:"string",description:"Group."},quick_capture_enabled:{type:"boolean",description:"Quick capture flag."},stats_config:{type:"object",description:"Statistics configuration."},icon:{type:"string",description:"Resolved icon.",read_only:true},icon_type:{type:"string",description:"Icon type.",read_only:true},icon_value:{type:"string",description:"Icon value.",read_only:true},time_type:{type:"string",description:"Time type.",read_only:true},stats:{type:"object",description:"Derived statistics.",read_only:true},...timestamps},required_fields:["name"],writable_fields:writable,searchable_fields:["name"],supported_actions:["create_field","delete_field","create_entry","update_entry","delete_entry","create_goal","delete_goal","create_reminder","delete_reminder"],validation_rules:["search accepts no filters and can filter by name query","get returns fields, goals, reminders, entries, stats, and insights","child Web APIs are exposed through eo_action and still use their existing parsers and services","icon upload remains on its Web API","unknown fields are rejected"]},async search({query,filters={},limit,cursor}){assertOnlyKeys(filters,[],"tracker search filters");rejectCursor(cursor,"Tracker");let items=await operations.search();if(query)items=items.filter(item=>item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));return{items:items.slice(0,limit).map(trackerRecord),next_cursor:null};},async get(value){const detail=await operations.get(numericId(value,"Tracker"));if(!detail)throw new ConflictError("Tracker not found.");return{...trackerRecord(detail.tracker),fields:detail.fields,goals:detail.goals,reminders:detail.reminders,entries:detail.entries,stats:detail.stats,insights:detail.insights};},async create(data){assertOnlyKeys(data,writable,"tracker create");return trackerRecord(await operations.create(parseNewTracker(mappedInput(data,map))));},async update(value,data){assertOnlyKeys(data,writable,"tracker update");const item=await operations.update(numericId(value,"Tracker"),parseTrackerPatch(mappedInput(data,map)));if(!item)throw new ConflictError("Tracker not found.");return trackerRecord(item);},async delete(value){const id=numericId(value,"Tracker");if(!await operations.delete(id))throw new ConflictError("Tracker not found.");return{deleted:true,id};},async action({id,action,data}){if(id===undefined)throw new ValidationError(`${action} requires a tracker id.`);const trackerId=numericId(id,"Tracker");if(action==="create_field")return snakeRecord(await operations.createField(parseNewTrackerField(mappedInput(data,{name:"name",type:"type",required:"required",default_value:"defaultValue",options:"options",show_after_quick_capture:"showAfterQuickCapture",include_in_stats:"includeInStats",sort_order:"sortOrder",unit:"unit",precision:"precision",config:"config"}),trackerId)));if(action==="create_entry")return snakeRecord(await operations.createEntry(parseNewTrackerEntry(mappedInput(data,{occurred_at:"occurredAt",values:"values",note:"note"}),trackerId)));if(action==="update_entry"){assertOnlyKeys(data,["entry_id","occurred_at","values","note"],"tracker update_entry");const item=await operations.updateEntry(numericId(data.entry_id as ResourceId,"Tracker entry"),parseTrackerEntryPatch(mappedInput(data,{occurred_at:"occurredAt",values:"values",note:"note"})));if(!item)throw new ConflictError("Tracker entry not found.");return snakeRecord(item);}const deletes:{[key:string]:(childId:number)=>Promise<boolean>}={delete_field:operations.deleteField,delete_entry:operations.deleteEntry,delete_goal:operations.deleteGoal,delete_reminder:operations.deleteReminder};if(action in deletes){assertOnlyKeys(data,["child_id"],`tracker ${action}`);const childId=numericId(data.child_id as ResourceId,"Tracker child");if(!await deletes[action](childId))throw new ConflictError("Tracker child not found.");return{deleted:true,id:childId};}if(action==="create_goal")return snakeRecord(await operations.createGoal(parseNewTrackerGoal(mappedInput(data,{name:"name",field_id:"fieldId",operator:"operator",target_value:"targetValue",period_type:"periodType",period_start:"periodStart",period_end:"periodEnd",enabled:"enabled"}),trackerId)));if(action==="create_reminder")return snakeRecord(await operations.createReminder(parseNewTrackerReminder(mappedInput(data,{reminder_type:"reminderType",time_of_day:"timeOfDay",days_of_week:"daysOfWeek",interval_days:"intervalDays",enabled:"enabled"}),trackerId)));throw new ValidationError(`tracker does not support action: ${action}.`);}};}

function snakeKey(key:string){return key.replace(/[A-Z]/g,letter=>`_${letter.toLowerCase()}`);}
function snakeValue(value:unknown):unknown{if(Array.isArray(value))return value.map(snakeValue);if(value&&typeof value==="object"&&!(value instanceof Date))return Object.fromEntries(Object.entries(value).map(([key,item])=>[snakeKey(key),snakeValue(item)]));return value;}
function snakeRecord(value:object):ResourceRecord{return snakeValue(value) as ResourceRecord;}
function camelKey(key:string){return key.replace(/_([a-z])/g,(_,letter:string)=>letter.toUpperCase());}
function camelRecord(value:ResourceRecord):ResourceRecord{return Object.fromEntries(Object.entries(value).map(([key,item])=>[camelKey(key),item]));}
const petMap={name:"name",avatar_url:"avatarUrl",sex:"sex",birthday:"birthday",adoption_date:"adoptionDate",notes:"notes",is_active:"isActive"};
function catPetResource(operations:NonNullable<ResourceRegistryOperations["catPet"]>):RegisteredResource{const writable=Object.keys(petMap);return{schema:{resource:"cat_pet",description:"Cats in the household. Deletion archives the pet and disables its active reminders and routines.",fields:{id:{type:"integer",description:"Cat id.",read_only:true},name:{type:"string",description:"Name."},avatar_url:{type:"string",description:"Avatar URL."},sex:{type:"string",enum:["female","male","unknown"],description:"Sex."},birthday:{type:"string",format:"date",description:"Birthday."},adoption_date:{type:"string",format:"date",description:"Adoption date."},notes:{type:"string",description:"Notes."},is_active:{type:"boolean",description:"Active flag."},timeline:{type:"array",items:{type:"object"},description:"Recent cat records.",read_only:true},reminders:{type:"array",items:{type:"object"},description:"Related reminders.",read_only:true},routines:{type:"array",items:{type:"object"},description:"Related routines.",read_only:true},...timestamps},required_fields:["name"],writable_fields:writable,searchable_fields:["name"],supported_actions:[],validation_rules:["search filters accept include_inactive","delete is a recoverable business archive, not a hard delete","avatar upload remains on its Web API","unknown fields are rejected"]},async search({query,filters={},limit,cursor}){assertOnlyKeys(filters,["include_inactive"],"cat_pet search filters");rejectCursor(cursor,"Cat pet");if(filters.include_inactive!==undefined&&typeof filters.include_inactive!=="boolean")throw new ValidationError("include_inactive must be boolean.");let items=await operations.search(filters.include_inactive as boolean|undefined);if(query)items=items.filter(item=>item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));return{items:items.slice(0,limit).map(snakeRecord),next_cursor:null};},async get(value){return snakeRecord(await operations.get(numericId(value,"Cat pet")));},async create(data){assertOnlyKeys(data,writable,"cat_pet create");return snakeRecord(await operations.create(parsePet(mappedInput(data,petMap))));},async update(value,data){assertOnlyKeys(data,writable,"cat_pet update");const item=await operations.update(numericId(value,"Cat pet"),parsePetPatch(mappedInput(data,petMap)));if(!item)throw new ConflictError("Cat pet not found.");return snakeRecord(item);},async delete(value){const id=numericId(value,"Cat pet");if(!await operations.archive(id))throw new ConflictError("Cat pet not found.");return{deleted:true,id};}};}

const catKinds=["event","symptom","vet_visit","medication","measurement"] as const;
const catRecordWritable=["kind","pet_id","event_type","occurred_at","occurred_has_explicit_time","title","note","severity","description","body_area","clinic","doctor","reason","symptoms","diagnosis","examinations","treatment","prescriptions","cost","follow_up_at","notes","name","dose","unit","frequency_text","started_at","started_has_explicit_time","ended_at","ended_has_explicit_time","active","measurement_type","value"];
function catRecordId(value:ResourceId){if(typeof value!=="string")throw new ValidationError("Cat record id must use kind:id.");const [kind,rawId,...rest]=value.split(":");if(rest.length||!catKinds.includes(kind as CatRecordKind))throw new ValidationError("Cat record id must use kind:id.");return{kind:kind as CatRecordKind,id:numericId(rawId,"Cat record")};}
function catRecordOutput(kind:CatRecordKind,item:object):ResourceRecord{const record=snakeRecord(item);return{...record,id:`${kind}:${record.id}`,record_id:record.id,kind};}
function catRecordResource(operations:NonNullable<ResourceRegistryOperations["catRecord"]>):RegisteredResource{return{schema:{resource:"cat_record",description:"Cat events, symptoms, vet visits, medications, and measurements. IDs use kind:id because each kind has its own table.",fields:{id:{type:"string",description:"Composite kind:id.",read_only:true},record_id:{type:"integer",description:"Kind-local numeric id.",read_only:true},kind:{type:"string",enum:[...catKinds],description:"Record kind."},pet_id:{type:"integer",description:"Cat id; household events may be null."},occurred_at:{type:"string",format:"date-time",description:"Occurrence or start."},occurred_has_explicit_time:{type:"boolean",description:"Whether time is explicit."},title:{type:"string",description:"Title when applicable."},details:{type:"object",description:"Kind-specific fields; call eo_schema for writable field names."},...timestamps},required_fields:["kind","pet_id"],writable_fields:catRecordWritable,searchable_fields:["title","summary"],supported_actions:[],validation_rules:["search accepts pet_id and returns timeline summaries","get, update, and delete ids use kind:id","kind cannot change during update","non-event records require pet_id","all inputs use existing parseCatRecord validation"]},async search({query,filters={},limit,cursor}){assertOnlyKeys(filters,["pet_id"],"cat_record search filters");rejectCursor(cursor,"Cat record");let items=await operations.search(filters.pet_id===undefined?undefined:filters.pet_id===null?null:numericId(filters.pet_id as ResourceId,"Cat"));if(query)items=items.filter(item=>`${item.title} ${item.summary}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));return{items:items.slice(0,limit).map(item=>catRecordOutput(item.kind,item)),next_cursor:null};},async get(value){const {kind,id}=catRecordId(value),item=await operations.get(kind,id);if(!item)throw new ConflictError("Cat record not found.");return catRecordOutput(kind,item);},async create(data){assertOnlyKeys(data,catRecordWritable,"cat_record create");const parsed=parseCatRecord(camelRecord(data));return catRecordOutput(parsed.kind,await operations.create(parsed.kind,parsed.record));},async update(value,data){assertOnlyKeys(data,catRecordWritable.filter(field=>field!=="kind"),"cat_record update");const {kind,id}=catRecordId(value),existing=await operations.get(kind,id);if(!existing)throw new ConflictError("Cat record not found.");const parsed=parseCatRecord({...existing,...camelRecord(data),kind},kind);const item=await operations.update(kind,id,parsed.record);if(!item)throw new ConflictError("Cat record not found.");return catRecordOutput(kind,item);},async delete(value){const {kind,id}=catRecordId(value);if(!await operations.delete(kind,id))throw new ConflictError("Cat record not found.");return{deleted:true,id:`${kind}:${id}`};}};}

const routineMap={scope:"scope",pet_id:"petId",title:"title",interval_value:"intervalValue",interval_unit:"intervalUnit",first_due_at:"firstDueAt",next_due_at:"nextDueAt",reminder_lead_minutes:"reminderLeadMinutes",notes:"notes",enabled:"enabled"};
function catRoutineResource(operations:NonNullable<ResourceRegistryOperations["catRoutine"]>):RegisteredResource{const writable=Object.keys(routineMap);return{schema:{resource:"cat_routine",description:"Recurring cat or household care routines.",fields:{id:{type:"integer",description:"Routine id.",read_only:true},scope:{type:"string",enum:["cat","household"],description:"Routine scope."},pet_id:{type:"integer",description:"Cat id for cat-scoped routines."},title:{type:"string",description:"Title."},interval_value:{type:"integer",description:"Interval amount."},interval_unit:{type:"string",enum:["day","week","month"],description:"Interval unit."},first_due_at:{type:"string",format:"date-time",description:"First due time."},next_due_at:{type:"string",format:"date-time",description:"Next due time."},reminder_lead_minutes:{type:"integer",description:"Reminder lead time."},notes:{type:"string",description:"Notes."},enabled:{type:"boolean",description:"Enabled flag."},...timestamps},required_fields:["scope","title","interval_value","interval_unit","first_due_at"],writable_fields:writable,searchable_fields:["title"],supported_actions:["complete","skip","archive"],validation_rules:["search filters accept scope, pet_id, and enabled_only","complete and skip update the schedule through the routine business service","archive disables the linked reminder","updates are validated after merging with the existing routine","unknown fields are rejected"]},async search({query,filters={},limit,cursor}){assertOnlyKeys(filters,["scope","pet_id","enabled_only"],"cat_routine search filters");rejectCursor(cursor,"Cat routine");let items=await operations.search({scope:filterEnum(filters.scope,["cat","household"] as const,"scope"),petId:filters.pet_id===undefined?undefined:filters.pet_id===null?null:numericId(filters.pet_id as ResourceId,"Cat"),enabledOnly:filters.enabled_only as boolean|undefined});if(query)items=items.filter(item=>item.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));return{items:items.slice(0,limit).map(snakeRecord),next_cursor:null};},async get(value){const item=await operations.get(numericId(value,"Cat routine"));if(!item)throw new ConflictError("Cat routine not found.");return snakeRecord(item);},async create(data){assertOnlyKeys(data,writable,"cat_routine create");return snakeRecord(await operations.create(parseCatRoutine(mappedInput(data,routineMap))));},async update(value,data){assertOnlyKeys(data,writable,"cat_routine update");const id=numericId(value,"Cat routine"),existing=await operations.get(id);if(!existing)throw new ConflictError("Cat routine not found.");const merged={...snakeRecord(existing),...data};const item=await operations.update(id,parseCatRoutine(mappedInput(merged,routineMap)));if(!item)throw new ConflictError("Cat routine not found.");return snakeRecord(item);},async delete(value){const id=numericId(value,"Cat routine");if(!await operations.archive(id))throw new ConflictError("Cat routine not found.");return{deleted:true,id};},async action({id,action,data}){if(id===undefined)throw new ValidationError(`${action} requires a routine id.`);assertOnlyKeys(data,["acted_at"],`cat_routine ${action}`);const actedAt=data.acted_at===undefined?undefined:new Date(String(data.acted_at));if(actedAt&&Number.isNaN(actedAt.getTime()))throw new ValidationError("acted_at is invalid.");if(action==="complete")return snakeRecord(await operations.complete(numericId(id,"Cat routine"),actedAt) as object);if(action==="skip")return snakeRecord(await operations.skip(numericId(id,"Cat routine"),actedAt) as object);if(action==="archive"){if(!await operations.archive(numericId(id,"Cat routine")))throw new ConflictError("Cat routine not found.");return{archived:true,id};}throw new ValidationError(`cat_routine does not support action: ${action}.`);}};}

const reminderMap={title:"title",target_type:"targetType",target_id:"targetId",source_type:"sourceType",source_id:"sourceId",schedule_type:"scheduleType",starts_at:"startsAt",next_due_at:"nextDueAt",due_has_explicit_time:"dueHasExplicitTime",interval_value:"intervalValue",interval_unit:"intervalUnit",times_of_day:"timesOfDay",ends_at:"endsAt",timezone:"timezone",note:"note",lead_time_minutes:"leadTimeMinutes",status:"status",is_active:"isActive"};
function reminderResource(operations:NonNullable<ResourceRegistryOperations["reminder"]>):RegisteredResource{const writable=Object.keys(reminderMap);return{schema:{resource:"reminder",description:"User reminders attached to cats, the cat household, or trackers.",fields:{id:{type:"integer",description:"Reminder id.",read_only:true},title:{type:"string",description:"Title."},target_type:{type:"string",enum:["cat","cat_household","tracker"],description:"Target type."},target_id:{type:"integer",description:"Target id when required."},schedule_type:{type:"string",enum:["one_time","interval","course"],description:"Schedule type."},starts_at:{type:"string",format:"date-time",description:"Start."},next_due_at:{type:"string",format:"date-time",description:"Next due."},due_has_explicit_time:{type:"boolean",description:"Whether due time is explicit."},interval_value:{type:"integer",description:"Interval amount."},interval_unit:{type:"string",enum:["hour","day","week","month"],description:"Interval unit."},times_of_day:{type:"array",items:{type:"string"},description:"Times of day."},ends_at:{type:"string",format:"date-time",description:"Optional end."},timezone:{type:"string",description:"IANA timezone."},note:{type:"string",description:"Note."},lead_time_minutes:{type:"integer",description:"Lead time."},status:{type:"string",description:"Status."},is_active:{type:"boolean",description:"Active flag."},...timestamps},required_fields:["title","target_type","schedule_type","starts_at"],writable_fields:writable,searchable_fields:["title"],supported_actions:["complete","skip","snooze"],validation_rules:["search filters accept target_type, target_id, and active_only","delete uses the existing cancellation service","complete and skip record an occurrence","snooze accepts choice later_today, tomorrow, or custom plus custom time","updates are validated after merging with the existing reminder","delivery and due-reminder control endpoints are not resources"]},async search({query,filters={},limit,cursor}){assertOnlyKeys(filters,["target_type","target_id","active_only"],"reminder search filters");rejectCursor(cursor,"Reminder");let items=await operations.search({targetType:filterEnum(filters.target_type,["cat","cat_household","tracker"] as const,"target_type"),targetId:filters.target_id===undefined?undefined:filters.target_id===null?null:numericId(filters.target_id as ResourceId,"Target"),activeOnly:filters.active_only as boolean|undefined});if(query)items=items.filter(item=>item.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));return{items:items.slice(0,limit).map(snakeRecord),next_cursor:null};},async get(value){const id=numericId(value,"Reminder"),item=(await operations.search({})).find(entry=>entry.id===id);if(!item)throw new ConflictError("Reminder not found.");return snakeRecord(item);},async create(data){assertOnlyKeys(data,writable,"reminder create");return snakeRecord(await operations.create(parseReminder(mappedInput(data,reminderMap))));},async update(value,data){assertOnlyKeys(data,writable,"reminder update");const id=numericId(value,"Reminder"),existing=(await operations.search({})).find(entry=>entry.id===id);if(!existing)throw new ConflictError("Reminder not found.");const merged={...snakeRecord(existing),...data};const item=await operations.update(id,parseReminder(mappedInput(merged,reminderMap)));if(!item)throw new ConflictError("Reminder not found.");return snakeRecord(item);},async delete(value){const id=numericId(value,"Reminder");if(!await operations.delete(id))throw new ConflictError("Reminder not found.");return{deleted:true,id};},async action({id,action,data}){if(id===undefined)throw new ValidationError(`${action} requires a reminder id.`);const resourceId=numericId(id,"Reminder");if(action==="complete"||action==="skip"){assertOnlyKeys(data,["acted_at"],`reminder ${action}`);const actedAt=data.acted_at===undefined?undefined:new Date(String(data.acted_at));if(actedAt&&Number.isNaN(actedAt.getTime()))throw new ValidationError("acted_at is invalid.");return snakeRecord(await (action==="complete"?operations.complete(resourceId,actedAt):operations.skip(resourceId,actedAt)) as object);}if(action==="snooze"){assertOnlyKeys(data,["choice","custom"],"reminder snooze");const choice=filterEnum(data.choice,["later_today","tomorrow","custom"] as const,"choice");if(!choice)throw new ValidationError("snooze requires choice.");const item=await operations.snooze(resourceId,choice,data.custom===undefined?undefined:String(data.custom));if(!item)throw new ConflictError("Reminder not found.");return snakeRecord(item);}throw new ValidationError(`reminder does not support action: ${action}.`);}};}

export class ResourceRegistry {
  readonly #resources: Map<string, RegisteredResource>;

  constructor(resources: RegisteredResource[]) {
    this.#resources = new Map(resources.map((resource) => [resource.schema.resource, resource]));
  }

  #resource(name: string) {
    const resource = this.#resources.get(name);
    if (!resource) throw new ValidationError(`Unknown resource: ${name}. Call eo_resources for available resources.`);
    return resource;
  }

  resources() {
    return [...this.#resources.values()].map((resource) => ({
      resource: resource.schema.resource,
      description: resource.schema.description,
      capabilities: (["search", "get", "create", "update", "delete", "action"] as const).filter((capability) => Boolean(resource[capability])),
      actions: resource.schema.supported_actions,
    }));
  }

  schema(resource: string) {
    return this.#resource(resource).schema;
  }

  async search(resource: string, input: ResourceSearchInput) {
    const handler = this.#resource(resource).search;
    if (!handler) throw new ValidationError(`${resource} does not support search.`);
    return handler(input);
  }

  async get(resource: string, id: ResourceId) {
    const handler = this.#resource(resource).get;
    if (!handler) throw new ValidationError(`${resource} does not support get.`);
    return handler(id);
  }

  async create(resource: string, data: ResourceRecord) {
    const handler = this.#resource(resource).create;
    if (!handler) throw new ValidationError(`${resource} does not support create.`);
    return handler(data);
  }

  async update(resource: string, id: ResourceId, data: ResourceRecord) {
    const handler = this.#resource(resource).update;
    if (!handler) throw new ValidationError(`${resource} does not support update.`);
    return handler(id, data);
  }

  async delete(resource: string, id: ResourceId) {
    const handler = this.#resource(resource).delete;
    if (!handler) throw new ValidationError(`${resource} does not support delete.`);
    return handler(id);
  }

  async action(resource: string, input: ResourceActionInput) {
    const registered = this.#resource(resource);
    if (!registered.action || !registered.schema.supported_actions.includes(input.action)) throw new ValidationError(`${resource} does not support action: ${input.action}.`);
    return registered.action(input);
  }
}

export function createResourceRegistry(operations: ResourceRegistryOperations) {
  const resources:RegisteredResource[]=[
    inboxResource(operations.inbox),
    memoResource(operations.memo),
    chronicleResource(operations.chronicle),
    luciusDiaryResource(operations.luciusDiary),
    luciusCaseResource(operations.luciusCase),
    luciusStateResource(operations.luciusState),
    projectResource(operations.project),
    projectItemResource(operations.projectItem),
    relationPersonResource(operations.relationPerson),
    relationEventResource(operations.relationEvent),
    personNoteResource(operations.personNote),
  ];
  if(operations.luciusPost)resources.push(luciusPostResource(operations.luciusPost));
  if(operations.healthRecord)resources.push(healthRecordResource(operations.healthRecord));
  if(operations.trainingLog)resources.push(trainingLogResource(operations.trainingLog));
  if(operations.media)resources.push(mediaResource(operations.media));
  if(operations.mediaSeries)resources.push(mediaSeriesResource(operations.mediaSeries));
  if(operations.drinkLimit)resources.push(drinkLimitResource(operations.drinkLimit));
  if(operations.tracker)resources.push(trackerResource(operations.tracker));
  if(operations.catPet)resources.push(catPetResource(operations.catPet));
  if(operations.catRecord)resources.push(catRecordResource(operations.catRecord));
  if(operations.catRoutine)resources.push(catRoutineResource(operations.catRoutine));
  if(operations.reminder)resources.push(reminderResource(operations.reminder));
  return new ResourceRegistry(resources);
}
