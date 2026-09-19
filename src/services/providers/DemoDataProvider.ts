import {
  BurndownData,
  ExtractionOptions,
  ProgressCallback,
  ReassignmentItem,
  TaskWorkItemSummary,
  TaskWorkUpdate,
  TeamMemberCapacity,
  WorkHistoryData,
} from '../../types';
import {
  dateToDateSK,
  formatBrDate,
  formatBrDateTime,
  formatBrDateTimeWithWeekday,
  getWorkDays,
  parseBrDate,
} from '../../utils/date';
import { buildHistoricalBurndownData, SnapshotRow } from '../burndownCalculation';
import { IDataProvider } from './IDataProvider';

export const DEMO_SERVER_URL = 'mock://sprint-health';

export const DEMO_AREA_OPTIONS = [
  'SprintHealth\\Platform',
  'SprintHealth\\Mobile',
];

export const DEMO_SPRINT_OPTIONS = [
  'SprintHealth\\Sprint 2026.15',
  'SprintHealth\\Sprint 2026.14',
];

export const DEMO_SPRINT_DATES: Record<string, [string, string]> = {
  'SprintHealth\\Sprint 2026.15': ['06/07/2026', '17/07/2026'],
  'SprintHealth\\Sprint 2026.14': ['22/06/2026', '03/07/2026'],
};

export const DEMO_MEMBERS = [
  'Ana Silva',
  'Bruno Costa',
  'Camila Rocha',
  'Diego Martins',
  'Eva Almeida',
];

interface DemoTask {
  id: string;
  title: string;
  assignee: string;
  initial: number;
  burn: number;
  scopeDay?: number;
  scopeAdd?: number;
  finalRemaining?: number;
}

const DEMO_TASKS: DemoTask[] = [
  { id: '9101', title: 'Checkout validation', assignee: 'Ana Silva', initial: 10.0, burn: 1.7 },
  { id: '9102', title: 'Payment retry states', assignee: 'Ana Silva', initial: 8.0, burn: 1.1, scopeDay: 3, scopeAdd: 2.0 },
  { id: '9103', title: 'Capacity import', assignee: 'Bruno Costa', initial: 13.0, burn: 1.8 },
  { id: '9104', title: 'Burndown tooltip polish', assignee: 'Camila Rocha', initial: 5.0, burn: 1.3 },
  { id: '9105', title: 'Historical membership fallback', assignee: 'Diego Martins', initial: 16.0, burn: 2.0, scopeDay: 4, scopeAdd: 4.0 },
  { id: '9106', title: 'Reassignment table filtering', assignee: 'Eva Almeida', initial: 7.0, burn: 1.4 },
  { id: '9107', title: 'Analytics timeout handling', assignee: 'Bruno Costa', initial: 9.0, burn: 1.2 },
  { id: '9108', title: 'Chart export styling', assignee: 'Camila Rocha', initial: 6.0, burn: 1.0 },
];

const DEMO_CAPACITY_BY_MEMBER: Record<string, number> = {
  'Ana Silva': 6.0,
  'Bruno Costa': 5.5,
  'Camila Rocha': 6.0,
  'Diego Martins': 5.0,
  'Eva Almeida': 4.5,
};

const DEMO_DAYS_OFF: Record<string, Array<[string, string]>> = {
  'Bruno Costa': [['13/07/2026', '13/07/2026']],
  'Eva Almeida': [['10/07/2026', '10/07/2026']],
};

interface DemoReassignmentTemplate {
  taskId: string;
  from: string;
  to: string;
  position: number;
  timeText: string;
  changedBy: string;
}

const DEMO_REASSIGNMENT_TEMPLATES: DemoReassignmentTemplate[] = [
  { taskId: '9106', from: '(Unassigned)', to: 'Eva Almeida', position: 0.0, timeText: '09:15', changedBy: 'Ana Silva' },
  { taskId: '9102', from: 'Ana Silva', to: 'Camila Rocha', position: 0.27, timeText: '14:20', changedBy: 'Diego Martins' },
  { taskId: '9105', from: 'Diego Martins', to: 'Bruno Costa', position: 0.36, timeText: '10:45', changedBy: 'Ana Silva' },
  { taskId: '9107', from: 'Bruno Costa', to: 'Ana Silva', position: 0.73, timeText: '16:05', changedBy: 'Camila Rocha' },
  { taskId: '9108', from: 'Camila Rocha', to: 'Eva Almeida', position: 0.82, timeText: '11:30', changedBy: 'Diego Martins' },
];

export function isDemoUrl(url: string | null | undefined): boolean {
  const val = (url || '').trim().toLowerCase();
  return (
    val === 'mock' ||
    val === 'demo' ||
    val === DEMO_SERVER_URL ||
    val.startsWith('mock://') ||
    val.startsWith('demo://')
  );
}

/**
 * Concrete Product: DemoDataProvider (Refactoring Guru Factory Pattern)
 * Provides 100% offline, deterministic simulated data for instant testing on GitHub Pages.
 */
export class DemoDataProvider implements IDataProvider {
  async getAreaOptions(): Promise<string[]> {
    return [...DEMO_AREA_OPTIONS];
  }

  async getSprintOptions(_areaPath: string, _forceRefresh = false): Promise<string[]> {
    return [...DEMO_SPRINT_OPTIONS];
  }

  async getSprintDates(_areaPath: string, sprintName: string): Promise<{ startDate: string; endDate: string }> {
    const dates = DEMO_SPRINT_DATES[sprintName] || DEMO_SPRINT_DATES[DEMO_SPRINT_OPTIONS[0]];
    return { startDate: dates[0], endDate: dates[1] };
  }

  async getTeamMembers(_areaPath: string, _sprint: string): Promise<string[]> {
    return [...DEMO_MEMBERS];
  }

  private getSelectedMembers(selected?: string[]): string[] {
    if (!selected || selected.length === 0) return [...DEMO_MEMBERS];
    const set = new Set(selected.map((m) => m.trim().toLowerCase()));
    return DEMO_MEMBERS.filter((m) => set.has(m.trim().toLowerCase()));
  }

  private getSelectedTasks(selected?: string[]): DemoTask[] {
    const members = new Set(this.getSelectedMembers(selected));
    return DEMO_TASKS.filter((t) => members.has(t.assignee));
  }

  private scopeForDay(task: DemoTask, dayIndex: number): number {
    if (task.scopeDay === undefined || dayIndex < task.scopeDay) {
      return 0.0;
    }
    return task.scopeAdd ?? 0.0;
  }

  private taskRemaining(task: DemoTask, dayIndex: number, totalDays: number): number {
    const scope = this.scopeForDay(task, dayIndex);
    const effectiveInitial = task.initial + scope;
    let remaining = effectiveInitial - task.burn * dayIndex;
    if (dayIndex >= totalDays - 1) {
      remaining = Math.min(remaining, task.finalRemaining ?? 0.0);
    }
    return Math.max(remaining, 0.0);
  }

  getDemoSnapshotRows(startDate: Date, endDate: Date, selectedMembers?: string[]): SnapshotRow[] {
    const workDays = getWorkDays(startDate, endDate);
    const tasks = this.getSelectedTasks(selectedMembers);
    const rows: SnapshotRow[] = [];
    const totalDays = workDays.length || 1;

    for (const task of tasks) {
      for (let index = 0; index < workDays.length; index++) {
        const day = workDays[index];
        const remaining = this.taskRemaining(task, index, totalDays);
        const completed = Math.max(task.initial + this.scopeForDay(task, index) - remaining, 0.0);
        const state = remaining <= 0.05 ? 'Done' : 'Active';
        rows.push({
          WorkItemId: Number(task.id),
          DateSK: dateToDateSK(day),
          RemainingWork: Math.round(remaining * 100) / 100,
          CompletedWork: Math.round(completed * 100) / 100,
          State: state,
          AssignedTo: task.assignee,
          Title: task.title,
          SnapshotCount: 1,
        });
      }
    }
    return rows;
  }

  private getCapacities(selected?: string[]): TeamMemberCapacity[] {
    const members = this.getSelectedMembers(selected);
    return members.map((member) => {
      const daysOff = (DEMO_DAYS_OFF[member] || []).map(([s, e]) => ({
        start: s,
        end: e,
      }));
      return {
        teamMember: {
          displayName: member,
          uniqueName: `${member.toLowerCase().replace(/\s+/g, '.')}@example.test`,
        },
        activities: [
          {
            name: 'Development',
            capacityPerDay: DEMO_CAPACITY_BY_MEMBER[member] ?? 5.0,
          },
        ],
        daysOff,
      };
    });
  }

  async getBurndownData(options: ExtractionOptions, onProgress?: ProgressCallback): Promise<BurndownData> {
    onProgress?.(0.08, 'Parsing sprint dates and generating demo snapshot rows...');
    const sDate = parseBrDate(options.startDate, 'Start Date');
    const eDate = parseBrDate(options.endDate, 'End Date');
    if (sDate > eDate) {
      throw new Error('Start Date must be before or equal to End Date.');
    }

    const snapshotRows = this.getDemoSnapshotRows(sDate, eDate, options.selectedMembers);
    onProgress?.(0.50, 'Loading demo capacities...');
    const capacities = this.getCapacities(options.selectedMembers);
    onProgress?.(0.90, 'Building burndown data...');
    const burndownData = buildHistoricalBurndownData(snapshotRows, capacities, sDate, eDate);
    onProgress?.(1.0, 'Burndown chart generation complete.');
    return burndownData;
  }

  async getWorkHistory(options: ExtractionOptions, onProgress?: ProgressCallback): Promise<WorkHistoryData> {
    onProgress?.(0.1, 'Parsing work history dates...');
    const sDate = parseBrDate(options.startDate, 'Start Date');
    const eDate = parseBrDate(options.endDate, 'End Date');
    const workDays = getWorkDays(sDate, eDate);
    const totalDays = workDays.length || 1;
    const tasks = this.getSelectedTasks(options.selectedMembers);

    const personDailyData: WorkHistoryData = {};
    const taskSprintUpdates = new Map<string, TaskWorkUpdate[]>();
    const personDailyTasks = new Map<string, Map<string, TaskWorkItemSummary[]>>();

    for (const member of this.getSelectedMembers(options.selectedMembers)) {
      personDailyData[member] = {};
      personDailyTasks.set(member, new Map());
    }

    for (let taskIndex = 0; taskIndex < tasks.length; taskIndex++) {
      const task = tasks[taskIndex];
      onProgress?.(0.15 + (taskIndex / tasks.length) * 0.8, `Processing updates for task #${task.id}...`);

      for (let dayIndex = 0; dayIndex < totalDays; dayIndex++) {
        const day = workDays[dayIndex];
        const dayKey = formatBrDate(day);

        const prevRemaining = this.taskRemaining(task, Math.max(dayIndex - 1, 0), totalDays);
        const remaining = this.taskRemaining(task, dayIndex, totalDays);
        const decrease = dayIndex === 0 ? Math.max(task.initial - remaining, 0) : Math.max(prevRemaining - remaining, 0);

        if (decrease <= 0) continue;

        const completed = Math.round(decrease * (0.65 + ((dayIndex + taskIndex) % 3) * 0.15) * 100) / 100;
        const roundedDecr = Math.round(decrease * 100) / 100;
        const assignee = task.assignee;

        if (!personDailyData[assignee]) {
          personDailyData[assignee] = {};
        }
        if (!personDailyData[assignee][dayKey]) {
          personDailyData[assignee][dayKey] = { completed: 0, remainingDec: 0, tasks: [] };
        }

        personDailyData[assignee][dayKey].completed =
          Math.round((personDailyData[assignee][dayKey].completed + completed) * 100) / 100;
        personDailyData[assignee][dayKey].remainingDec =
          Math.round((personDailyData[assignee][dayKey].remainingDec + roundedDecr) * 100) / 100;

        const updateDt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 14 + (taskIndex % 4), 10 + (dayIndex * 5) % 50);
        const compOld = Math.max(Math.round((task.initial - prevRemaining) * 100) / 100, 0);
        const compNew = Math.round((compOld + completed) * 100) / 100;

        const updateEntry: TaskWorkUpdate = {
          changeDate: updateDt.toISOString(),
          displayDateTime: formatBrDateTimeWithWeekday(updateDt),
          changedBy: assignee,
          completedWork: {
            oldValue: compOld,
            newValue: compNew,
            diff: completed,
          },
          remainingWork: {
            oldValue: Math.round(prevRemaining * 100) / 100,
            newValue: Math.round(remaining * 100) / 100,
            decr: roundedDecr,
          },
        };

        if (!taskSprintUpdates.has(task.id)) {
          taskSprintUpdates.set(task.id, []);
        }
        taskSprintUpdates.get(task.id)!.push(updateEntry);

        const memberDays = personDailyTasks.get(assignee);
        if (memberDays) {
          if (!memberDays.has(dayKey)) {
            memberDays.set(dayKey, []);
          }
          const taskSummary: TaskWorkItemSummary = {
            taskId: task.id,
            title: task.title,
            url: `mock://sprint-health/workitems/${task.id}`,
            completedAdded: completed,
            remainingDecreased: roundedDecr,
            dayUpdates: [updateEntry],
            allSprintUpdates: [],
          };
          memberDays.get(dayKey)!.push(taskSummary);
        }
      }
    }

    // Attach allSprintUpdates and finalize day tasks
    for (const member of Object.keys(personDailyData)) {
      const memberDays = personDailyTasks.get(member);
      for (const dayKey of Object.keys(personDailyData[member])) {
        const dayTasks = memberDays?.get(dayKey) || [];
        for (const t of dayTasks) {
          const allUpdates = taskSprintUpdates.get(t.taskId) || [];
          t.allSprintUpdates = [...allUpdates].sort((a, b) => b.changeDate.localeCompare(a.changeDate));
        }
        dayTasks.sort((a, b) => (Math.abs(b.completedAdded) + Math.abs(b.remainingDecreased)) - (Math.abs(a.completedAdded) + Math.abs(a.remainingDecreased)));
        personDailyData[member][dayKey].tasks = dayTasks;
      }
    }

    onProgress?.(1.0, 'Work history analysis complete.');
    return personDailyData;
  }

  async getReassignments(options: ExtractionOptions, onProgress?: ProgressCallback): Promise<ReassignmentItem[]> {
    onProgress?.(0.1, 'Scanning task assignment logs...');
    const sDate = parseBrDate(options.startDate, 'Start Date');
    const eDate = parseBrDate(options.endDate, 'End Date');

    if (sDate > eDate) return [];

    const allowedTaskIds = new Set(this.getSelectedTasks(options.selectedMembers).map((t) => t.id));
    const spanMs = Math.max(eDate.getTime() - sDate.getTime(), 0);
    const reassignments: ReassignmentItem[] = [];

    for (let i = 0; i < DEMO_REASSIGNMENT_TEMPLATES.length; i++) {
      const template = DEMO_REASSIGNMENT_TEMPLATES[i];
      onProgress?.(0.2 + (i / DEMO_REASSIGNMENT_TEMPLATES.length) * 0.75, `Inspecting task #${template.taskId}...`);

      if (!allowedTaskIds.has(template.taskId)) continue;

      const eventTime = new Date(sDate.getTime() + spanMs * template.position);
      const [hh, mm] = template.timeText.split(':').map(Number);
      eventTime.setHours(hh || 9, mm || 0, 0, 0);

      reassignments.push({
        taskId: template.taskId,
        from: template.from,
        to: template.to,
        date: formatBrDateTime(eventTime),
        dateSort: eventTime.toISOString(),
        changedBy: template.changedBy,
      });
    }

    reassignments.sort((a, b) => b.dateSort.localeCompare(a.dateSort));
    onProgress?.(1.0, `Found ${reassignments.length} reassignments.`);
    return reassignments;
  }
}
