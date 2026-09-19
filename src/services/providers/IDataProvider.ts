import {
  BurndownData,
  ExtractionOptions,
  ProgressCallback,
  ReassignmentItem,
  WorkHistoryData,
} from '../../types';

/**
 * Data Provider Product Interface (Refactoring Guru Factory Method Pattern)
 * Defines the contract that all concrete data sources must implement.
 */
export interface IDataProvider {
  getAreaOptions(): Promise<string[]>;
  getSprintOptions(areaPath: string, forceRefresh?: boolean): Promise<string[]>;
  getSprintDates(areaPath: string, sprintName: string): Promise<{ startDate: string; endDate: string }>;
  getTeamMembers(areaPath: string, sprint: string): Promise<string[]>;
  getBurndownData(options: ExtractionOptions, onProgress?: ProgressCallback): Promise<BurndownData>;
  getWorkHistory(options: ExtractionOptions, onProgress?: ProgressCallback): Promise<WorkHistoryData>;
  getReassignments(options: ExtractionOptions, onProgress?: ProgressCallback): Promise<ReassignmentItem[]>;
}
