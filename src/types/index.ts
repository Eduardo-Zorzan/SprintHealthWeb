export interface AppConfig {
  url: string;
  area: string;
  sprint: string;
  token: string;
  startDate: string;
  endDate: string;
}

export enum GraphicType {
  TimesRegistering = 'Times Registering',
  Burndown = 'Burndown',
}

export interface CombosCache {
  areas: string[];
  sprints: string[];
}

export interface IterationsCache {
  timestamp: string;
  data: any;
}

export interface BurndownSummary {
  startDate: string;
  endDate: string;
  completedPercent: number;
  averageBurndown: number;
  itemsNotEstimated: number;
  remainingWork: number;
  totalScopeIncrease: number;
  totalCapacity: number;
  actualThroughDate: string | null;
}

export interface BurndownData {
  dates: string[]; // DD/MM/YYYY
  actualRemaining: (number | null)[];
  fullActualRemaining: number[];
  remainingCapacity: number[];
  idealTrend: number[];
  dailyCapacity: number[];
  capacityMembers: string[];
  summary: BurndownSummary;
}

export interface TaskWorkUpdate {
  changeDate: string; // ISO string
  displayDateTime: string; // e.g. "sex 18/09/2026 18:04"
  changedBy?: string;
  completedWork?: {
    oldValue: number;
    newValue: number;
    diff: number;
  };
  remainingWork?: {
    oldValue: number;
    newValue: number;
    decr: number;
  };
}

export interface TaskWorkItemSummary {
  taskId: string;
  title: string;
  url?: string;
  completedAdded: number;
  remainingDecreased: number;
  dayUpdates: TaskWorkUpdate[];
  allSprintUpdates: TaskWorkUpdate[];
}

export interface DailyWorkEntry {
  completed: number;
  remainingDec: number;
  tasks?: TaskWorkItemSummary[];
}

export type WorkHistoryData = Record<string, Record<string, DailyWorkEntry>>;

export interface ReassignmentItem {
  taskId: string;
  from: string;
  to: string;
  date: string; // DD/MM/YYYY HH:MM
  dateSort: string; // ISO string for sorting
  changedBy: string;
}

export type ProgressCallback = (progress: number, message?: string) => void;

export interface TeamMemberCapacity {
  teamMember: {
    displayName: string;
    uniqueName: string;
  };
  activities: Array<{
    name: string;
    capacityPerDay: number;
  }>;
  daysOff: Array<{
    start: string;
    end: string;
  }>;
}

export interface ExtractionOptions {
  areaPath: string;
  sprint: string;
  selectedMembers: string[];
  startDate: string;
  endDate: string;
}
