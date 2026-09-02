import "server-only";

import { createChronicleEntry, deleteChronicleEntry, getChronicleEntry, listChronicle, updateChronicleEntry } from "../services/chronicle";
import { archiveInbox, createInbox, deleteInbox, getInbox, markInboxProcessed, restoreInbox, searchInbox, updateInbox } from "../services/inbox";
import { createLuciusCase, createLuciusDiaryEntry, createLuciusPost, deleteLuciusCase, deleteLuciusDiaryEntry, deleteLuciusPost, getLuciusCase, getLuciusDiaryEntry, getLuciusPost, getLuciusState, listLuciusCases, listLuciusDiaryEntries, listLuciusPosts, recordLuciusCaseRecurrence, updateLuciusCase, updateLuciusDiaryEntry, updateLuciusPost, updateLuciusState } from "../services/lucius";
import { createHealthRecord, deleteHealthRecord, getHealthRecord, listHealthRecords, updateHealthRecord } from "../services/health";
import { createTrainingLog, deleteTrainingLog, getTrainingLog, listTrainingLogs, updateTrainingLog } from "../services/training";
import { addMediaRewatch, createMedia, createMediaSeries, deleteMedia, deleteMediaViewing, getMediaDetail, getMediaSeries, listMedia, listMediaSeries, updateMedia, updateMediaViewing } from "../services/media";
import { createDrinkLimit, deleteDrinkLimit, getDrinkLimits, updateDrinkLimit } from "../services/drink";
import { createTracker, createTrackerEntry, createTrackerField, createTrackerGoal, createTrackerReminder, deleteTracker, deleteTrackerEntry, deleteTrackerField, deleteTrackerGoal, deleteTrackerReminder, getTrackerDetail, listTrackerSummaries, updateTracker, updateTrackerEntry } from "../services/tracker";
import { archivePet, catTimeline, createCatRecord, createPet, deleteCatRecord, getCatRecord, getPetDetail, listPets, updateCatRecord, updatePet } from "../services/cats";
import { archiveCatRoutine, completeCatRoutine, createCatRoutine, getCatRoutine, listCatRoutines, skipCatRoutineOccurrence, updateCatRoutine } from "../services/cat-routine";
import { completeReminder, createReminder, deleteReminder, listReminders, skipReminder, snoozeReminder, updateReminder } from "../services/reminder";
import { createMemo, deleteMemo, getMemo, listMemos, updateMemo } from "../services/memo";
import { createProject, createProjectItem, getProject, getProjectItem, listProjectItems, listProjects, updateProject, updateProjectItem } from "../services/project";
import { createMemoryNote,createRelationEvent,createRelationPerson,deleteMemoryNote,deleteRelationEvent,getMemoryNote,getRelationEvent,getRelationPersonDetail,listMemoryNotes,listRelationEvents,listRelationPeople,settleAdvance,updateMemoryNote,updateRelationEvent,updateRelationPerson } from "../services/relations";
import { createResourceRegistry } from "./resource-registry";

export const resourceRegistry = createResourceRegistry({
  inbox: { search: searchInbox, get: getInbox, create: createInbox, update: updateInbox, delete: deleteInbox, markProcessed: markInboxProcessed, archive: archiveInbox, restore: restoreInbox },
  memo: { search: listMemos, get: getMemo, create: createMemo, update: updateMemo, delete: deleteMemo },
  chronicle: { search: listChronicle, get: getChronicleEntry, create: createChronicleEntry, update: updateChronicleEntry, delete: deleteChronicleEntry },
  luciusDiary: { search: listLuciusDiaryEntries, get: getLuciusDiaryEntry, create: createLuciusDiaryEntry, update: updateLuciusDiaryEntry, delete: deleteLuciusDiaryEntry },
  luciusCase: { search: listLuciusCases, get: getLuciusCase, create: createLuciusCase, update: updateLuciusCase, delete: deleteLuciusCase, recordRecurrence: recordLuciusCaseRecurrence },
  luciusState: { get: getLuciusState, update: updateLuciusState },
  luciusPost: { search: listLuciusPosts, get: getLuciusPost, create: createLuciusPost, update: updateLuciusPost, delete: deleteLuciusPost },
  healthRecord: { search: listHealthRecords, get: getHealthRecord, create: createHealthRecord, update: updateHealthRecord, delete: deleteHealthRecord },
  trainingLog: { search: listTrainingLogs, get: getTrainingLog, create: createTrainingLog, update: updateTrainingLog, delete: deleteTrainingLog },
  media: { search: listMedia, get: getMediaDetail, create: createMedia, update: updateMedia, delete: deleteMedia, addViewing: addMediaRewatch, updateViewing: updateMediaViewing, deleteViewing: deleteMediaViewing },
  mediaSeries: { search: listMediaSeries, get: getMediaSeries, create: createMediaSeries },
  drinkLimit: { search: getDrinkLimits, create: createDrinkLimit, update: updateDrinkLimit, delete: deleteDrinkLimit },
  tracker: { search: listTrackerSummaries, get: getTrackerDetail, create: createTracker, update: updateTracker, delete: deleteTracker, createField: createTrackerField, deleteField: deleteTrackerField, createEntry: createTrackerEntry, updateEntry: updateTrackerEntry, deleteEntry: deleteTrackerEntry, createGoal: createTrackerGoal, deleteGoal: deleteTrackerGoal, createReminder: createTrackerReminder, deleteReminder: deleteTrackerReminder },
  catPet: { search: listPets, get: getPetDetail, create: createPet, update: updatePet, archive: archivePet },
  catRecord: { search: catTimeline, get: getCatRecord, create: createCatRecord, update: updateCatRecord, delete: deleteCatRecord },
  catRoutine: { search: listCatRoutines, get: getCatRoutine, create: createCatRoutine, update: updateCatRoutine, complete: completeCatRoutine, skip: skipCatRoutineOccurrence, archive: archiveCatRoutine },
  reminder: { search: listReminders, create: createReminder, update: updateReminder, delete: deleteReminder, complete: completeReminder, skip: skipReminder, snooze: snoozeReminder },
  project: { search: listProjects, get: getProject, create: createProject, update: updateProject },
  projectItem: { search: listProjectItems, get: getProjectItem, create: createProjectItem, update: updateProjectItem },
  relationPerson:{search:listRelationPeople,get:getRelationPersonDetail,create:createRelationPerson,update:updateRelationPerson},
  relationEvent:{search:listRelationEvents,get:getRelationEvent,create:createRelationEvent,update:updateRelationEvent,delete:deleteRelationEvent,settle:settleAdvance},
  personNote:{search:listMemoryNotes,get:getMemoryNote,create:createMemoryNote,update:updateMemoryNote,delete:deleteMemoryNote},
});
