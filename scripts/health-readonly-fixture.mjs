export async function seedHealth(){
  const {getRepository}=await import('../src/lib/repositories/index.ts');
  const {dateInEvaOrbit,dateRange,shiftDate}=await import('../src/lib/time.ts');
  const {trainingTemplate,parseTrainingPlanWrite}=await import('../src/lib/training-plan.ts');
  const r=await getRepository(),today=dateInEvaOrbit(),when=dateRange(today).from;
  const record=await r.createHealthRecord({type:'symptom',title:'Offline Health canary',summary:'Original Health form',occurredAt:when,occurredHasExplicitTime:false,status:'active',startedAt:null,startedHasExplicitTime:false,endedAt:null,endedHasExplicitTime:false,details:{severity:'Mild'}});
  await r.createWeightRecord({occurredAt:when,occurredHasExplicitTime:false,weightKg:65.05});
  await r.createWeightRecord({occurredAt:dateRange(shiftDate(today,-1)).from,occurredHasExplicitTime:false,weightKg:65.5});
  await r.createTrainingLog({occurredAt:when,occurredHasExplicitTime:false,trainingType:'strength',bodyParts:['核心'],teacher:'Canary',course:'Offline training',durationMinutes:20,notes:'No plan advancement'});
  await r.saveTrainingPlan(parseTrainingPlanWrite({...trainingTemplate(),expectedVersion:0}));
  const period=await r.createMenstrualPeriod({startedOn:shiftDate(today,-2),endedOn:null,notes:'Active cycle'});
  await r.createMenstrualFlowRecord({periodId:period.id,occurredAt:when,occurredHasExplicitTime:false,flow:'medium',isCycleStart:false,notes:'Date only'});
  const preset=await r.createMedicationPreset({name:'Canary medication',defaultDoseText:'1 tablet',minReminderIntervalMinutes:240,reminderEnabled:true,periodLinkEnabled:true,notes:''});
  await r.createMedicationDoseEvent({medicationPresetId:preset.id,periodId:period.id,takenAt:when,doseText:'1 tablet',notes:''});
  return {record,period,preset};
}
