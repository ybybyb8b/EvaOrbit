import type { MemoryEntity, MemoryFact, MemorySource } from "./types";

export const graphOfflinePath = "/api/memory-graph/offline";
export const graphWebUrl = "https://eva-orbit.vercel.app/memo/graph";

export type GraphOfflineSnapshot = {
  capturedAt: string;
  complete: boolean;
  entities: MemoryEntity[];
  facts: MemoryFact[];
  sources: MemorySource[];
};
