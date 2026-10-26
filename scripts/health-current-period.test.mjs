import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import React from 'react';
import * as runtime from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {periodDayForDate} from '../src/lib/timeline.ts';

const today='2026-10-23';
function fixture(remotePeriods = null) {
  const writes=[];
  const empty=()=>null;
  const hooks={useState:value=>[value && typeof value==='object' && 'data' in value ? {data:remotePeriods,error:''} : typeof value==='function'?value():value,()=>{}],useEffect:()=>{}};
  let section;
  const shared={
    HealthLink:props=>React.createElement("a",props),useHealthData:()=>({local:false,read:async(url,init)=>{writes.push({url,body:JSON.parse(init.body)});return {ok:true,json:async()=>({id:99})};}}),
    useFormPreview:()=>false,FormPreviewNotice:empty,ErrorNotice:empty,
    useBusinessRequest:()=>async(url,init)=>{writes.push({url,body:JSON.parse(init.body)});return {ok:true,json:async()=>({id:99})};},
    useLocale:()=>({english:true}),useDataRefresh:()=>{},useServerDataState:hooks.useState,
    currentLocalDate:()=>today,DateTimeField:empty,compactDateTimeValue:value=>value,
    compactDateTimePayload:value=>({value,hasExplicitTime:value.includes('T')}),
    FormSheet:props=>React.createElement('div',null,props.children),Icon:empty,
    ChoiceSelect:props=>React.createElement('select',null,props.children),SearchableSelect:empty,
    BottomLogScope:empty,ToastNotice:empty,
    syncMenstrualFlowToHealthKit:async()=>{},flushPendingMenstrualFlowToHealthKit:async()=>{},
    healthPeriodHistoryFrom:()=> '2026-04-23',PERIOD_MEDICATION_REMINDER_SOURCE:'period_medication',
    periodDayForDate,EVAORBIT_TIME_ZONE:'Asia/Shanghai',dateInEvaOrbit:()=>today,
    sleepDisplay:()=>null,homeDurationLabel:String,formatWeightKg:String,normalizeWeightKg:x=>x,
    trainingTypeLabels:{},
  };
  function load(file) {
    const code=ts.transpileModule(readFileSync(new URL('../src/app/health/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    const exports={};
    new Function('require','exports','fetch',code)(name=>{
      if(name==='react')return hooks;
      if(name==='react/jsx-runtime')return runtime;
      if(name==='next/link')return {__esModule:true,default:'a'};
      if(name==='./period-medication-section')return section;
      if(name.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,key)=>key})};
      if(name==='reicon-react')return new Proxy({},{get:()=>empty});
      return shared;
    },exports,async(url,init)=>{writes.push({url,body:JSON.parse(init.body)});return {ok:true,json:async()=>({id:99})};});
    return exports;
  }
  section=load('period-medication-section.tsx');
  return {section,overview:load('health-overview.tsx'),quickLog:load('health-quick-log.tsx'),writes};
}
const period=(startedOn,endedOn)=>({id:7,startedOn,endedOn,notes:''});
function findForm(node){if(!node||typeof node!=='object')return null;if(node.type==='form')return node;for(const child of [node.props?.children].flat(Infinity)){const found=findForm(child);if(found)return found;}return null;}

test('Health section and overview show the same first day as Home for a one-day imported range',()=>{
  for(const endedOn of [today,null]){
    const {section,overview}=fixture(),periods=[period(today,endedOn)];
    const home=periodDayForDate(periods,today,today);
    assert.equal(home.day,1);
    const html=renderToStaticMarkup(section.PeriodMedicationSection({initialPeriods:periods,initialFlows:[],initialPresets:[],initialDoses:[],initialReminders:[]}));
    assert.match(html,/Day 1/);assert.doesNotMatch(html,/No active period/);
    assert.equal(html.includes('End period'),endedOn===null);
    const summary=renderToStaticMarkup(overview.HealthOverview({initialPeriods:periods,initialSleep:{date:today,secondary:[]},initialEnergy:{estimatedIntakeKcal:null,totalExpenditureKcal:null,energyBalance:null},initialTraining:[],initialWeights:[],initialMedicationReminders:[],today}));
    assert.match(summary,/<small>Day<\/small>1/);assert.doesNotMatch(summary,/>Ended</);
  }
});

test('Home quick logging uses the existing imported period instead of creating another first-day period',()=>{
  for(const periods of [[period(today,today)],[]]){
    const {section,quickLog}=fixture(periods);
    const editor=quickLog.getHealthQuickLog('period').Editor({initialDate:today,onClose(){},async onSaved(){}});
    assert.equal(editor.type,periods.length?section.PeriodFlowEditor:section.StartPeriodEditor);
  }
});

test('Health does not treat past closed periods or future starts as current',()=>{
  for(const row of [period('2026-10-20','2026-10-22'),period('2026-10-24',null)]){
    const {section}=fixture();
    const html=renderToStaticMarkup(section.PeriodMedicationSection({initialPeriods:[row],initialFlows:[],initialPresets:[],initialDoses:[],initialReminders:[]}));
    assert.match(html,/No active period/);
  }
});

test('new flow and dose forms link the imported period covering their date, while edits preserve their link',async()=>{
  for(const kind of ['flow','dose'])for(const editing of [false,true]){
    const {section,writes}=fixture(),row=period(today,today);
    const record=editing?{id:5,periodId:91,isCycleStart:false,occurredAt:today,occurredHasExplicitTime:false,takenAt:today+'T09:00',medicationPresetId:2,flow:'light',notes:''}:undefined;
    const tree=kind==='flow'?section.PeriodFlowEditor({initialDate:today,periods:[row],record,onClose(){},onSaved(){}}):section.MedicationDoseEditor({initialDate:today,periods:[row],presets:[{id:2,name:'Fixture'}],record,onClose(){},onSaved(){}});
    await findForm(tree).props.onSubmit({preventDefault(){}});
    assert.equal(writes.length,1);assert.equal(writes[0].body.periodId,editing?91:7);
    if(kind==='flow'&&!editing)assert.equal(writes[0].body.occurredHasExplicitTime,false);
  }
});
