import "server-only";

import { createChronicleEntry, deleteChronicleEntry, getChronicleEntry, listChronicle, updateChronicleEntry } from "../services/chronicle";
import { archiveInbox, createInbox, deleteInbox, getInbox, markInboxProcessed, restoreInbox, searchInbox, updateInbox } from "../services/inbox";
import { createLuciusCase, createLuciusDiaryEntry, deleteLuciusCase, deleteLuciusDiaryEntry, getLuciusCase, getLuciusDiaryEntry, getLuciusState, listLuciusCases, listLuciusDiaryEntries, recordLuciusCaseRecurrence, updateLuciusCase, updateLuciusDiaryEntry, updateLuciusState } from "../services/lucius";
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
  project: { search: listProjects, get: getProject, create: createProject, update: updateProject },
  projectItem: { search: listProjectItems, get: getProjectItem, create: createProjectItem, update: updateProjectItem },
  relationPerson:{search:listRelationPeople,get:getRelationPersonDetail,create:createRelationPerson,update:updateRelationPerson},
  relationEvent:{search:listRelationEvents,get:getRelationEvent,create:createRelationEvent,update:updateRelationEvent,delete:deleteRelationEvent,settle:settleAdvance},
  personNote:{search:listMemoryNotes,get:getMemoryNote,create:createMemoryNote,update:updateMemoryNote,delete:deleteMemoryNote},
});
