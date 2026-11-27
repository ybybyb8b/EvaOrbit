import assert from "node:assert/strict";
import test from "node:test";
import { initialWidgetStack, parseWidgetStack, reorderWidgets, removeWidget, validWidget } from "./personal-widgets.ts";
import { catWidgetCare, trainingWidgetSummary, trainingWidgetRange } from "./personal-widget-data.ts";
import type { CatsDashboard } from "./cats-readonly";
import type { TrainingLog } from "./types";

test("personal stack migrates saved Tracker order including an empty stack; instances, options, position round-trip without independent theme preferences", () => {
  const trackers=[{id:"1",name:"Poo",lastOccurredAt:null},{id:"2",name:"Shower",lastOccurredAt:null}];
  const config=initialWidgetStack(trackers,'["2","1"]');
  assert.deepEqual(config.widgets.map(widget => widget.type === "tracker" ? widget.trackerId : null),["2","1"]);
  assert.deepEqual(initialWidgetStack(trackers,'[]').widgets,[]);
  assert.equal(initialWidgetStack(trackers,null).widgets[0].id,"tracker-1");
  config.widgets.push({id:"duplicate",type:"tracker",trackerId:"1",showDetails:false},{id:"day",type:"days",dateId:4,display:"elapsed"},{id:"cat",type:"cat-care",petId:2,includeHousehold:true},{id:"training",type:"training",period:"month"});
  config.activeId="day";
  assert.deepEqual(parseWidgetStack(JSON.stringify(config)),config);
  for(const material of ["mauve","oat","petrol","unknown"]) assert.deepEqual(parseWidgetStack(JSON.stringify({...config,material})),config);
  const moved=reorderWidgets(config,"day",0);
  assert.equal(moved.activeId,"day");assert.equal(moved.widgets[0].id,"day");assert.equal(config.widgets[0].id,"tracker-2");
  const removed=removeWidget(moved,"day");
  assert.equal(removed.activeId,"tracker-2");assert.equal(removed.widgets.length,5);
  assert.equal(removeWidget(initialWidgetStack(trackers,'["1"]'),"tracker-1").activeId,null);
  assert.equal(parseWidgetStack(JSON.stringify({...config,activeId:"missing"}))?.activeId,config.widgets[0].id);
  for(const value of [null,"bad","{}",JSON.stringify({...config,version:2}),JSON.stringify({...config,widgets:[...config.widgets,config.widgets[0]]})]) assert.equal(parseWidgetStack(value),null);
  assert.equal(validWidget({id:"bad",type:"days",dateId:-1,display:"next"}),false);
  assert.equal(validWidget({id:"bad",type:"cat-care",petId:2,includeHousehold:"yes"}),false);
});

test("Cat Care scopes actions to the selected cat, optionally includes household work and retains completed one-time care", () => {
  const routine=(id:number,petId:number|null,due:string,last:string|null)=>({id,petId,title:`Care ${id}`,nextDueAt:due,lastCompletedAt:last,enabled:true});
  const dashboard={pets:[],household:[],routines:[routine(1,7,"2026-11-28T04:00:00Z","2026-11-25T04:00:00Z"),routine(2,8,"2026-11-26T04:00:00Z",null),routine(3,null,"2026-11-27T04:00:00Z",null)],oneTimeTasks:[{id:4,title:"Vet follow-up",targetType:"cat",targetId:7,isActive:true,nextDueAt:"2026-11-27T06:00:00Z"}],timeline:[{kind:"event",petId:7,title:"Nail trim",occurredAt:"2026-11-27T03:00:00Z",occurredHasExplicitTime:true,metadata:{sourceType:"reminder"}},{kind:"symptom",petId:7,title:"Not care",occurredAt:"2026-11-27T04:00:00Z",metadata:{}}]} as unknown as CatsDashboard;
  const own=catWidgetCare(dashboard,7,false);
  assert.equal(own.next?.id,"reminder-4");assert.equal(own.pendingCount,2);assert.equal(own.latest?.title,"Nail trim");
  assert.equal(catWidgetCare(dashboard,7,true).next?.id,"routine-3");
  assert.equal(catWidgetCare(dashboard,8,false).next?.id,"routine-2");
});

test("Training summary uses EvaOrbit calendar boundaries, excludes deleted workouts and preserves date-only records", () => {
  const logs=[{id:1,occurredAt:"2026-11-22T16:30:00Z",durationMinutes:30,occurredHasExplicitTime:false},{id:2,occurredAt:"2026-11-27T03:00:00Z",durationMinutes:20,occurredHasExplicitTime:true},{id:3,occurredAt:"2026-11-27T04:00:00Z",durationMinutes:60,workoutDeleted:true},{id:4,occurredAt:"2026-11-01T03:00:00Z",durationMinutes:null}] as TrainingLog[];
  assert.deepEqual(trainingWidgetRange("week","2026-11-27"),{from:"2026-11-23",to:"2026-11-28"});
  const week=trainingWidgetSummary(logs,"week","2026-11-27");
  assert.equal(week.count,2);assert.equal(week.minutes,50);assert.equal(week.latest?.id,2);
  assert.equal(trainingWidgetSummary(logs,"month","2026-11-27").count,3);
  assert.equal(logs[0].occurredHasExplicitTime,false);
});
