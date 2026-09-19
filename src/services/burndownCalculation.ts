import { BurndownData, TeamMemberCapacity } from '../types';
import {
  dateToDateSK,
  formatBrDate,
  getWorkDays,
  parseAzureDate,
  parseBrDate,
} from '../utils/date';

export interface SnapshotRow {
  WorkItemId?: number | string;
  DateSK: number;
  RemainingWork?: number | null;
  CompletedWork?: number | null;
  State?: string;
  AssignedTo?: string;
  Title?: string;
  SnapshotCount?: number;
}

export function isDayOff(day: Date, daysOff?: Array<{ start: string; end: string }>): boolean {
  for (const off of daysOff || []) {
    const s = parseAzureDate(off.start) || parseBrDate(off.start);
    const e = parseAzureDate(off.end) || parseBrDate(off.end);
    if (!s || !e) continue;
    const dayOnly = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const sOnly = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    const eOnly = new Date(e.getFullYear(), e.getMonth(), e.getDate());
    if (dayOnly >= sOnly && dayOnly <= eOnly) return true;
  }
  return false;
}

export function buildCapacitySeries(
  capacities: TeamMemberCapacity[],
  workDays: Date[]
): {
  dailyCapacity: number[];
  remainingCapacity: number[];
  capacityMembers: string[];
  totalCapacity: number;
} {
  const dailyCapacityMap = new Map<string, number>();
  for (const day of workDays) {
    dailyCapacityMap.set(formatBrDate(day), 0);
  }

  const capacityMembers: string[] = [];
  for (const cap of capacities) {
    const identity = cap.teamMember;
    const identityName = identity?.displayName || identity?.uniqueName || '';
    if (identityName) capacityMembers.push(identityName);

    const capacityPerDay = (cap.activities || []).reduce(
      (acc, act) => acc + (Number(act.capacityPerDay) || 0),
      0
    );

    for (const day of workDays) {
      if (!isDayOff(day, cap.daysOff)) {
        const dayKey = formatBrDate(day);
        dailyCapacityMap.set(dayKey, (dailyCapacityMap.get(dayKey) || 0) + capacityPerDay);
      }
    }
  }

  const dailyCapacity = workDays.map((d) => Math.round((dailyCapacityMap.get(formatBrDate(d)) || 0) * 100) / 100);
  const totalCapacity = Math.round(dailyCapacity.reduce((a, b) => a + b, 0) * 100) / 100;

  const remainingCapacity: number[] = [];
  let capacityLeft = totalCapacity;
  for (let i = 0; i < workDays.length; i++) {
    capacityLeft -= dailyCapacity[i];
    remainingCapacity.push(Math.round(Math.max(capacityLeft, 0) * 100) / 100);
  }
  if (remainingCapacity.length > 0) {
    remainingCapacity[remainingCapacity.length - 1] = 0;
  }

  return { dailyCapacity, remainingCapacity, capacityMembers, totalCapacity };
}

/**
 * Exact replica of `build_historical_burndown_data` from SprintHealth (Python).
 */
export function buildHistoricalBurndownData(
  snapshotRows: SnapshotRow[],
  capacities: TeamMemberCapacity[],
  startDate: Date,
  endDate: Date,
  asOfDate?: Date
): BurndownData {
  if (startDate > endDate) {
    throw new Error('Start Date must be before or equal to End Date.');
  }

  const dates = getWorkDays(startDate, endDate);
  if (dates.length === 0) {
    throw new Error('The selected burndown period has no working days.');
  }

  const rowsByDate = new Map<number, SnapshotRow[]>();
  for (const row of snapshotRows) {
    if (row.DateSK === undefined || row.DateSK === null) continue;
    const list = rowsByDate.get(row.DateSK) || [];
    list.push(row);
    rowsByDate.set(row.DateSK, list);
  }

  const completedStates = new Set(['closed', 'completed', 'done', 'resolved']);
  const fullActualRemaining: number[] = [];
  let itemsNotEstimated = 0;

  for (const day of dates) {
    const sk = dateToDateSK(day);
    const rows = rowsByDate.get(sk) || [];
    let totalRemaining = 0.0;
    for (const row of rows) {
      const rem = row.RemainingWork;
      if (rem === undefined || rem === null) {
        itemsNotEstimated++;
        continue;
      }
      totalRemaining += Number(rem) || 0;
    }
    fullActualRemaining.push(Math.round(totalRemaining * 100) / 100);
  }

  const now = new Date();
  let cutoffDate: Date;
  if (!asOfDate) {
    cutoffDate = new Date(Math.min(now.getTime(), endDate.getTime()));
  } else {
    cutoffDate = new Date(Math.min(asOfDate.getTime(), endDate.getTime()));
  }
  cutoffDate.setHours(23, 59, 59, 999);

  const actualRemaining: (number | null)[] = dates.map((day, idx) => {
    return day <= cutoffDate ? fullActualRemaining[idx] : null;
  });

  const elapsedActual = actualRemaining.filter((v): v is number => v !== null);
  const actualThroughDate = elapsedActual.length > 0 ? formatBrDate(dates[elapsedActual.length - 1]) : null;

  const actualThroughDay = elapsedActual.length > 0 ? dates[elapsedActual.length - 1] : null;
  const latestRows = actualThroughDay ? (rowsByDate.get(dateToDateSK(actualThroughDay)) || []) : [];
  const completedItems = latestRows.filter((row) =>
    completedStates.has((row.State || '').trim().toLowerCase())
  ).length;
  const completedPercent = latestRows.length > 0
    ? Math.round((completedItems / latestRows.length) * 10000) / 100
    : 0;

  const { dailyCapacity, remainingCapacity, capacityMembers, totalCapacity } = buildCapacitySeries(capacities, dates);

  const startRemaining = fullActualRemaining[0] ?? 0;
  const remainingWork = elapsedActual.length > 0 ? elapsedActual[elapsedActual.length - 1] : 0;
  const totalScopeIncrease = Math.round((remainingWork - startRemaining) * 100) / 100;
  const averageBurndown = Math.round((Math.max(startRemaining - remainingWork, 0) / dates.length) * 100) / 100;

  // Exact Python formula: round(max(start_remaining * (1 - ((idx + 1) / len(dates))), 0.0), 2)
  const idealTrend: number[] = dates.map((_, idx) => {
    return Math.round(Math.max(startRemaining * (1 - ((idx + 1) / dates.length)), 0) * 100) / 100;
  });

  return {
    dates: dates.map((d) => formatBrDate(d)),
    actualRemaining,
    fullActualRemaining,
    remainingCapacity,
    idealTrend,
    dailyCapacity,
    capacityMembers,
    summary: {
      startDate: formatBrDate(startDate),
      endDate: formatBrDate(endDate),
      completedPercent,
      averageBurndown,
      itemsNotEstimated,
      remainingWork: Math.round(remainingWork * 100) / 100,
      totalScopeIncrease,
      totalCapacity,
      actualThroughDate,
    },
  };
}
