import "server-only";

import { createChronicleEntry, deleteChronicleEntry, getChronicleEntry, listChronicle, updateChronicleEntry } from "../services/chronicle";
import { createResourceRegistry } from "./resource-registry";

export const resourceRegistry = createResourceRegistry({
  search: listChronicle,
  get: getChronicleEntry,
  create: createChronicleEntry,
  update: updateChronicleEntry,
  delete: deleteChronicleEntry,
});
