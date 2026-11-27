import { importantDateBackgroundRow } from "../important-date-background.ts";
import { createHash } from "node:crypto";
import { z } from "zod";
import { ValidationError } from "../validation.ts";
import { ConflictError } from "../errors.ts";
import { dateInEvaOrbit } from "../time.ts";
import { importantDateCategoryColor,importantDateStats,sortImportantDates,type ImportantDate,type ImportantDateInput,type ImportantDateCategory } from "../important-dates.ts";
import { parseImportantDate,parseImportantDatePatch } from "../important-dates-validation.ts";
import type { RegisteredResource,ResourceField,ResourceId } from "./resource-registry.ts";

export type ImportantDateResourceOperations={
  list():Promise<ImportantDate[]>;
  get(id:number):Promise<ImportantDate|null>;
  save(id:number|null,input:ImportantDateInput):Promise<ImportantDate|null>;
  remove(id:number):Promise<boolean>;
  categories():Promise<ImportantDateCategory[]>;
};

const inputMap={title:"title",date:"date",calendar:"calendar",lunar:"lunar",lunar_leap_policy:"lunarLeapPolicy",recurrence:"recurrence",category:"category",category_color:"categoryColor",note:"note",pinned:"pinned",archived:"archived",reminder_time:"reminderTime",reminder_days_before:"reminderDaysBefore",display_mode:"displayMode",count_mode:"countMode",background:"background"} as const;
function mappedInput(value:Record<string,unknown>){
  if(Object.keys(value).some(key=>!Object.hasOwn(inputMap,key)))throw new ValidationError("Unknown important_date field. Call eo_schema first.");
  return Object.fromEntries(Object.entries(inputMap).filter(([key])=>Object.hasOwn(value,key)).map(([key,target])=>[target,value[key]]));
}
function numericId(value:ResourceId){const id=typeof value==="number"?value:Number(value);if(!Number.isSafeInteger(id)||id<=0)throw new ValidationError("Important date ID must be a positive integer.");return id;}
const day=z.string().refine(value=>{try{return parseImportantDate({title:"Date",date:value}).date===value;}catch{return false;}},"Expected a valid YYYY-MM-DD date (0100–9999).");
const searchFilters=z.strictObject({status:z.enum(["active","archived","all"]).default("active"),category:z.string().trim().min(1).max(40).optional(),pinned:z.boolean().optional(),calendar:z.enum(["solar","lunar"]).optional(),recurrence:z.enum(["none","weekly","monthly","yearly"]).optional(),from:day.optional(),to:day.optional(),as_of:day.optional()}).refine(value=>!value.from||!value.to||value.from<=value.to,"from must not be after to");
const cursorSchema=z.strictObject({v:z.literal(1),offset:z.number().int().nonnegative().safe(),signature:z.string().length(64),as_of:day});
function readCursor(cursor?:string){if(cursor===undefined)return undefined;if(!/^[A-Za-z0-9_-]+$/.test(cursor))throw new ValidationError("Invalid Days cursor.");try{return cursorSchema.parse(JSON.parse(Buffer.from(cursor,"base64url").toString("utf8")));}catch{throw new ValidationError("Invalid Days cursor.");}}
function page<T>(items:T[],limit:number,cursor:ReturnType<typeof readCursor>,signature:string,asOf:string){
  if(!Number.isInteger(limit)||limit<1||limit>100)throw new ValidationError("Days limit must be 1–100.");
  if(cursor&&cursor.signature!==signature)throw new ValidationError("Continue Days pagination with the same query and filters.");
  const offset=cursor?.offset??0,next=offset+limit,hasMore=next<items.length;
  return {items:items.slice(offset,next),has_more:hasMore,next_cursor:hasMore?Buffer.from(JSON.stringify({v:1,offset:next,signature,as_of:asOf})).toString("base64url"):null};
}
function signature(value:unknown){return createHash("sha256").update(JSON.stringify(value)).digest("hex");}
function record(item:ImportantDate,asOf=dateInEvaOrbit()){
  const stats=importantDateStats(item,asOf);
  return {display_mode:item.displayMode??"auto",count_mode:item.countMode??"elapsed",day_number:stats.elapsed>=0?stats.elapsed+1:null,background:importantDateBackgroundRow(item.background).background??{kind:"none"},background_image_version:item.backgroundImageVersion??null,id:item.id,title:item.title,date:item.date,calendar:item.calendar??"solar",lunar:item.lunar??null,lunar_leap_policy:item.lunarLeapPolicy??"regular",recurrence:item.recurrence,category:item.category,category_color:item.categoryColor??null,effective_category_color:item.category?importantDateCategoryColor(item.category,item.categoryColor):null,note:item.note,pinned:item.pinned,archived:item.archived,reminder_time:item.reminderTime,reminder_days_before:item.reminderDaysBefore,reminder_timezone:"Asia/Shanghai",next_date:stats.next,remaining_days:stats.remaining,elapsed_days:stats.elapsed,anniversary_years:stats.years,calculated_for:asOf,created_at:item.createdAt,updated_at:item.updatedAt};
}

const fields:Record<string,ResourceField>={
  id:{type:"integer",read_only:true,description:"Stable important date ID."},
  display_mode:{type:"string",enum:["auto","elapsed","countdown"],default:"auto",description:"auto preserves existing behavior; elapsed counts from original date; countdown shows next occurrence. Future originals always count down. count_mode only changes cumulative counting."},
  count_mode:{type:"string",enum:["elapsed","ordinal"],default:"elapsed",description:"Display elapsed natural days or ordinal Day N (starting date is Day 1). Does not change remaining_days or reminders."},
  day_number:{type:"integer",nullable:true,read_only:true,derived:true,description:"Ordinal day from original date, including that day; null before it."},
  background:{type:"object",required:["kind"],properties:{kind:{type:"string",enum:["none","solid","gradient","photo"],description:"Background type."},color:{type:"string",description:"#RRGGBB primary color."},secondary:{type:"string",description:"#RRGGBB secondary gradient color."},x:{type:"number",description:"Horizontal position, 0–100."},y:{type:"number",description:"Vertical position, 0–100."},zoom:{type:"number",default:1,description:"Photo zoom, 1–3."},shade:{type:"number",description:"Photo shade, 0–1."},image:{type:"string",write_only:true,description:"New photo data URL, less than 100,000 bytes decoded; omit to preserve stored image."}},description:"Complete replacement: kind none; solid with color #RRGGBB; gradient with color/secondary; photo with x/y 0–100, shade 0–1, optional zoom 1–3 and image. New photos require JPG/PNG/WebP base64 data URL <100 KB. Omit image to keep the stored photo. Image bytes are excluded from records."},
  background_image_version:{type:"string",nullable:true,read_only:true,description:"Version of stored photo; image bytes are loaded separately by the app."},
  title:{type:"string",max_length:120,description:"Event name, preserved as entered."},
  date:{type:"string",format:"date",description:"Original Gregorian date, YYYY-MM-DD, 0100–9999. Required for Gregorian create; lunar create derives it. Never use this year's conversion in place of the original year."},
  calendar:{type:"string",enum:["solar","lunar"],default:"solar",description:"Gregorian or Chinese lunar calendar. PATCH switching calendar alone preserves the real original day."},
  lunar:{type:"object",nullable:true,description:"Complete replacement lunar date. Required for lunar create; valid lunar years 1901–2100. leap distinguishes the leap month from its regular namesake.",required:["year","month","day","leap"],properties:{year:{type:"integer",description:"Original lunar year, 1901–2100."},month:{type:"integer",description:"Lunar month, 1–12."},day:{type:"integer",description:"Actual lunar day, 1–29/30."},leap:{type:"boolean",description:"true only for an actual leap month in the original year."}}},
  lunar_leap_policy:{type:"string",enum:["regular","skip"],default:"regular",description:"For annual leap-month dates: regular uses the ordinary month when that leap month is absent; skip waits for a year containing that leap month."},
  recurrence:{type:"string",enum:["none","weekly","monthly","yearly"],default:"none",description:"Weekly uses natural 7-day cycles. Monthly uses the selected calendar: Gregorian missing days clamp to month end without drift; lunar uses every actual month including leap months, with day 30 clamped to 29. Yearly retains its leap-month policy."},
  category:{type:"string",max_length:40,default:"",description:"Category name; empty means uncategorized. New names are allowed; inspect important_date_category first."},
  category_color:{type:"string",nullable:true,description:"Optional #RRGGBB shared override. Explicit change recolors EVERY date with this category. null resets to the default palette; omission preserves the existing shared color. A custom override requires a nonempty category."},
  effective_category_color:{type:"string",nullable:true,read_only:true,derived:true,description:"Calculated category color after applying defaults; null when uncategorized."},
  note:{type:"string",max_length:2000,default:"",description:"Optional note."},
  pinned:{type:"boolean",default:false,description:"Manual feature priority. Days shows at most three cards; automatic fallback is calculated and never stored as pinned=true."},
  archived:{type:"boolean",default:false,description:"Archive retains the date and pauses reminders; restore reapplies its reminder rule."},
  reminder_time:{type:"string",nullable:true,description:"Explicit HH:mm Shanghai time. Omitted create/null disables reminders; never invent a time for a date-only record."},
  reminder_days_before:{type:"integer",default:0,description:"Days before the occurrence: weekly 0–6, monthly 0–27, other 0–366; 0 is the same day."},
  reminder_timezone:{type:"string",read_only:true,description:"Reminder zone: Asia/Shanghai."},
  next_date:{type:"string",format:"date",nullable:true,read_only:true,derived:true,description:"Calculated Gregorian occurrence. One-time past dates keep their original day; null means no supported future lunar occurrence."},
  remaining_days:{type:"integer",nullable:true,read_only:true,derived:true,description:"Natural-day difference from calculated_for to next_date. Today is 0; one-time past dates are negative."},
  elapsed_days:{type:"integer",read_only:true,derived:true,description:"Natural days from the real original date; future original dates are negative."},
  anniversary_years:{type:"integer",read_only:true,derived:true,description:"Original-to-next year difference in the selected calendar."},
  calculated_for:{type:"string",format:"date",read_only:true,description:"Reference date for derived counts, in Asia/Shanghai."},
  created_at:{type:"string",format:"date-time",read_only:true,description:"Creation time."},
  updated_at:{type:"string",format:"date-time",read_only:true,description:"Update time."},
};

export function importantDateResources(operations:ImportantDateResourceOperations):RegisteredResource[]{
  async function get(id:ResourceId){const item=await operations.get(numericId(id));if(!item)throw new ConflictError("Important date not found.");return item;}
  async function update(id:ResourceId,input:Record<string,unknown>){
    const item=await get(id),updated=await operations.save(item.id,parseImportantDatePatch(input,item));
    if(!updated)throw new ConflictError("Important date not found.");return record(updated);
  }
  async function categories(){
    const [dates,definitions]=await Promise.all([operations.list(),operations.categories()]);
    const colors=new Map(definitions.map(item=>[item.name,item.color]));
    for(const item of dates)if(item.category&&!colors.has(item.category))colors.set(item.category,item.categoryColor??null);
    return [...colors].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([name,color])=>({id:name,name,color,effective_color:importantDateCategoryColor(name,color),active_count:dates.filter(item=>item.category===name&&!item.archived).length,archived_count:dates.filter(item=>item.category===name&&item.archived).length}));
  }
  return [{
    schema:{resource:"important_date",description:"Days / 如期 countdowns, anniversaries and lunar birthdays, with shared category colors and owned reminders.",fields,required_fields:["title"],writable_fields:Object.keys(inputMap),searchable_fields:["title","note","category","date","status","pinned","calendar","recurrence","from","to","as_of"],supported_actions:["pin","unpin","archive","restore"],validation_rules:["Gregorian create requires date; lunar create requires calendar=lunar and complete lunar object.","Date and lunar values must describe the same real original day. Annual short-month day 30 falls on day 29; February 29 falls on February 28 in common years.","PATCH preserves omitted top-level fields. lunar is a complete replacement object, not a nested PATCH.","category_color changes all dates in that category atomically with this event save; omission never replays the previous color.","Reminders use explicit Shanghai time and configured Bark / Web Push. Past first reminders are skipped; no Task or EventKit event is created.","Archive cancels the owned reminder projection; permanent deletion cancels it and retains notification history."]},
    async search({query,filters={},limit,cursor:token}){
      const parsed=searchFilters.safeParse(filters);if(!parsed.success)throw new ValidationError("Invalid important_date filters: "+parsed.error.issues[0].message);
      const cursor=readCursor(token),asOf=parsed.data.as_of??cursor?.as_of??dateInEvaOrbit(),f={...parsed.data,as_of:asOf},term=(query??"").trim().toLowerCase();
      const matches=(await operations.list()).filter(item=>{
        if(f.status!=="all"&&item.archived!==(f.status==="archived"))return false;
        if(f.category!==undefined&&item.category!==f.category||f.pinned!==undefined&&item.pinned!==f.pinned||f.calendar!==undefined&&(item.calendar??"solar")!==f.calendar||f.recurrence!==undefined&&item.recurrence!==f.recurrence)return false;
        if(term&&!`${item.title} ${item.note} ${item.category} ${item.date}`.toLowerCase().includes(term))return false;
        const next=importantDateStats(item,asOf).next;
        return (!f.from||next!==null&&next>=f.from)&&(!f.to||next!==null&&next<=f.to);
      });
      return page(sortImportantDates(matches,asOf).map(item=>record(item,asOf)),limit,cursor,signature(["important_date",term,f]),asOf);
    },
    async get(id){return record(await get(id));},
    async create(data){const item=await operations.save(null,parseImportantDate(mappedInput(data)));if(!item)throw new ConflictError("Could not create important date.");return record(item);},
    async update(id,data){return update(id,mappedInput(data));},
    async delete(id){const value=numericId(id);if(!await operations.remove(value))throw new ConflictError("Important date not found.");return {id:value,deleted:true};},
    async action({id,action}){const value=numericId(id!);if(action==="pin"||action==="unpin")return update(value,{pinned:action==="pin"});return update(value,{archived:action==="archive"});},
  },{
    schema:{resource:"important_date_category",description:"Read-only Days category names, shared color overrides, effective palette and active/archived counts.",fields:{id:{type:"string",read_only:true,description:"Exact category name, used as get ID."},name:{type:"string",read_only:true,max_length:40,description:"Existing category name; may include retained categories without events."},color:{type:"string",nullable:true,read_only:true,description:"Stored #RRGGBB override; null uses the default palette."},effective_color:{type:"string",read_only:true,derived:true,description:"Effective color, including the default low-saturation palette."},active_count:{type:"integer",read_only:true,derived:true,description:"Number of active dates in this category."},archived_count:{type:"integer",read_only:true,derived:true,description:"Number of archived dates in this category."}},required_fields:[],writable_fields:[],searchable_fields:["name"],supported_actions:[],validation_rules:["Read-only catalog. Change category or category_color through important_date create/update.","New category names can be supplied directly on a date; empty category is not a catalog entry."]},
    async search({query,filters={},limit,cursor:token}){
      if(Object.keys(filters).length)throw new ValidationError("important_date_category accepts no filters.");
      const cursor=readCursor(token),asOf=cursor?.as_of??dateInEvaOrbit(),term=(query??"").trim().toLowerCase();
      return page((await categories()).filter(item=>item.name.toLowerCase().includes(term)),limit,cursor,signature(["important_date_category",term]),asOf);
    },
    async get(id){if(typeof id!=="string"||!id.trim()||id.trim().length>40)throw new ValidationError("Category ID must be its exact name (1–40 characters).");const item=(await categories()).find(item=>item.name===id.trim());if(!item)throw new ConflictError("Important date category not found.");return item;},
  }];
}
