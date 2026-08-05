import type { ActivityNarrative } from "@/time-log/domain/narrative.js";
import type { WorkItem } from "@/time-log/domain/work-item.js";

export type SourceKind = "human_active" | "agent_turn_elapsed";

export type Repository = {
  project: string;
  repositoryId: string;
  repositoryIdentity?: string;
};

export type AutomaticTimeLogInput = {
  sourceKind: SourceKind;
  project: string;
  repositoryId: string;
  repositoryIdentity?: string;
  sessionId?: string;
  activity?: string;
  narrative?: ActivityNarrative;
  workItem?: WorkItem;
  sourceKey: string;
  startAtMs: number;
  endAtMs: number;
};

export type TimeLogEntry = {
  id: string;
  sourceKind: SourceKind;
  project: string;
  repositoryId: string;
  repositoryIdentity?: string;
  sessionId?: string;
  activity?: string;
  narrative?: ActivityNarrative;
  workItem?: WorkItem;
  startAtMs: number;
  endAtMs: number;
  createdAtMs: number;
};
