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
  parseAzureDate,
  parseAzureDateTime,
  parseBrDate,
} from '../../utils/date';
import { buildHistoricalBurndownData, SnapshotRow } from '../burndownCalculation';
import { IDataProvider } from './IDataProvider';

const COMPLETED_WORK_FIELD = 'Microsoft.VSTS.Scheduling.CompletedWork';
const REMAINING_WORK_FIELD = 'Microsoft.VSTS.Scheduling.RemainingWork';

export class AzureDevOpsApiProvider implements IDataProvider {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token.trim();
  }

  private buildUrl(path: string): string {
    return path.startsWith('http') ? path : `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  private getHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Basic ${btoa(`:${this.token}`)}`;
    }
    return headers;
  }

  private async fetchJson<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = this.buildUrl(path);
    const headers = { ...this.getHeaders(), ...(options.headers || {}) };
    
    let response: Response;
    try {
      response = await fetch(url, { ...options, headers });
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('CORS')) {
        throw new Error(
          `Network/CORS error while connecting to Azure DevOps. If calling dev.azure.com from a browser, a CORS proxy may be required. Details: ${msg}`
        );
      }
      throw err;
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error(`Authentication failed (${response.status}). Please verify your PAT token and permissions.`);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Azure DevOps request failed with status ${response.status}: ${text || response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  private normalizeAreaPath(area: string): string {
    let path = (area || '').trim().replace(/^['"]|['"]$/g, '').replace(/^\\+/, '');
    const parts = path.split('\\').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2 && parts[1].toLowerCase() === 'area') {
      parts.splice(1, 1);
    }
    return parts.join('\\');
  }

  private normalizeIterationPath(iteration: string): string {
    let path = (iteration || '').trim().replace(/^['"]|['"]$/g, '').replace(/^\\+/, '');
    const parts = path.split('\\').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2 && parts[1].toLowerCase() === 'iteration') {
      parts.splice(1, 1);
    }
    return parts.join('\\');
  }

  private getAnalyticsRootUrl(): string {
    const cleanUrl = this.baseUrl.replace(/\/+$/, '');
    try {
      const parsed = new URL(cleanUrl);
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      if (parsed.hostname.toLowerCase() === 'dev.azure.com') {
        if (pathParts.length >= 2) {
          const org = pathParts[0];
          const project = pathParts[1];
          return `${parsed.protocol}//analytics.dev.azure.com/${org}/${encodeURIComponent(project)}/_odata/v4.0-preview`;
        }
      } else if (parsed.hostname.toLowerCase().endsWith('.visualstudio.com') && pathParts.length > 0) {
        const org = parsed.hostname.split('.')[0];
        const project = pathParts[pathParts.length - 1];
        return `${parsed.protocol}//analytics.dev.azure.com/${org}/${encodeURIComponent(project)}/_odata/v4.0-preview`;
      }
    } catch {}
    return `${cleanUrl}/_odata/v4.0-preview`;
  }


  async getAreaOptions(): Promise<string[]> {
    try {
      const data = await this.fetchJson<any>('/_apis/wit/classificationnodes/Areas?$depth=5&api-version=6.0');
      const paths: string[] = [];
      const traverse = (node: any, currentPath: string) => {
        const fullPath = currentPath ? `${currentPath}\\${node.name}` : node.name;
        paths.push(this.normalizeAreaPath(fullPath));
        if (node.children && Array.isArray(node.children)) {
          for (const child of node.children) {
            traverse(child, fullPath);
          }
        }
      };
      traverse(data, '');
      return Array.from(new Set(paths));
    } catch (e: any) {
      console.warn('Failed to load areas from classification nodes:', e);
      return [];
    }
  }

  async getSprintOptions(areaPath: string, _forceRefresh = false): Promise<string[]> {
    const paths: string[] = [];

    // 1. Try team iterations if areaPath is present
    if (areaPath) {
      try {
        const teamCandidates = this.getTeamCandidates(areaPath);
        for (const team of teamCandidates) {
          try {
            const data = await this.fetchJson<any>(`/${encodeURIComponent(team)}/_apis/work/teamsettings/iterations?api-version=6.0`);
            if (data?.value && Array.isArray(data.value)) {
              for (const it of data.value) {
                if (it.path) paths.push(this.normalizeIterationPath(it.path));
              }
              if (paths.length > 0) return Array.from(new Set(paths));
            }
          } catch {
            // try next candidate
          }
        }
      } catch {
        // fallback to classification nodes
      }
    }

    // 2. Fallback to classification nodes
    try {
      const data = await this.fetchJson<any>('/_apis/wit/classificationnodes/Iterations?$depth=10&api-version=6.0');
      const traverse = (node: any, currentPath: string) => {
        const fullPath = currentPath ? `${currentPath}\\${node.name}` : node.name;
        paths.push(this.normalizeIterationPath(fullPath));
        if (node.children && Array.isArray(node.children)) {
          for (const child of node.children) {
            traverse(child, fullPath);
          }
        }
      };
      traverse(data, '');
      return Array.from(new Set(paths));
    } catch (e: any) {
      console.warn('Failed to load sprints from classification nodes:', e);
      return [];
    }
  }

  private async mapConcurrent<T, R>(
    items: T[],
    limit: number,
    fn: (item: T, index: number) => Promise<R>
  ): Promise<R[]> {
    const results = new Array<R>(items.length);
    let currentIndex = 0;

    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (currentIndex < items.length) {
        const idx = currentIndex++;
        results[idx] = await fn(items[idx], idx);
      }
    });

    await Promise.all(workers);
    return results;
  }

  private getTeamCandidates(areaPath: string): string[] {
    const parts = areaPath.split('\\').map((p) => p.trim()).filter(Boolean);
    const candidates: string[] = [];
    if (parts.length > 0) candidates.push(parts[parts.length - 1]);
    if (parts.length > 1) candidates.push(`${parts[0]}/${parts[parts.length - 1]}`);
    candidates.push('');
    return Array.from(new Set(candidates));
  }

  private getTeamPath(team: string, endpoint: string): string {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    if (!team) return cleanEndpoint;
    const encoded = team
      .split('/')
      .map((part) => encodeURIComponent(part.trim()))
      .join('/');
    return `/${encoded}${cleanEndpoint}`;
  }

  async getSprintDates(areaPath: string, sprintName: string): Promise<{ startDate: string; endDate: string }> {
    const candidates = this.getTeamCandidates(areaPath);
    const normalizedTarget = this.normalizeIterationPath(sprintName).toLowerCase();

    for (const team of candidates) {
      try {
        const teamPath = this.getTeamPath(team, '/_apis/work/teamsettings/iterations?api-version=6.0');
        const data = await this.fetchJson<any>(teamPath);
        if (data?.value && Array.isArray(data.value)) {
          for (const it of data.value) {
            const itPath = this.normalizeIterationPath(it.path || it.name).toLowerCase();
            if (itPath === normalizedTarget || itPath.endsWith(normalizedTarget) || normalizedTarget.endsWith(itPath)) {
              const start = parseAzureDate(it.attributes?.startDate);
              const end = parseAzureDate(it.attributes?.finishDate);
              if (start && end) {
                return { startDate: formatBrDate(start), endDate: formatBrDate(end) };
              }
            }
          }
        }
      } catch {
        // continue
      }
    }

    throw new Error(`Could not find dates for sprint "${sprintName}". Please specify them manually.`);
  }

  private async resolveTeamIteration(
    areaPath: string,
    sprint: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{ id: string; name: string; path: string; team: string } | null> {
    const cleanSprint = this.normalizeIterationPath(sprint);
    const candidates = this.getTeamCandidates(areaPath);
    const normalizedTarget = cleanSprint.toLowerCase();

    for (const team of candidates) {
      try {
        const queryParam = cleanSprint.startsWith('@') ? '$timeframe=current&api-version=6.0' : 'api-version=6.0';
        const teamPath = this.getTeamPath(team, `/_apis/work/teamsettings/iterations?${queryParam}`);
        const data = await this.fetchJson<any>(teamPath);
        if (data?.value && Array.isArray(data.value) && data.value.length > 0) {
          if (cleanSprint.startsWith('@')) {
            const it = data.value[0];
            return { id: it.id, name: it.name, path: it.path || it.name, team };
          }
          for (const it of data.value) {
            const p = this.normalizeIterationPath(it.path || it.name).toLowerCase();
            const n = (it.name || '').trim().toLowerCase();
            if (p === normalizedTarget || n === normalizedTarget || p.endsWith(`\\${normalizedTarget}`) || normalizedTarget.endsWith(`\\${p}`)) {
              return { id: it.id, name: it.name, path: it.path || it.name, team };
            }
            if (startDate && endDate && it.attributes?.startDate && it.attributes?.finishDate) {
              const itStart = parseAzureDate(it.attributes.startDate);
              const itEnd = parseAzureDate(it.attributes.finishDate);
              if (itStart && itEnd && itStart.getTime() === startDate.getTime() && itEnd.getTime() === endDate.getTime()) {
                return { id: it.id, name: it.name, path: it.path || it.name, team };
              }
            }
          }
        }
      } catch {
        // continue
      }
    }
    return null;
  }

  async getTeamCapacities(
    areaPath: string,
    sprint: string,
    selectedMembers?: string[],
    startDate?: string,
    endDate?: string
  ): Promise<TeamMemberCapacity[]> {
    try {
      const sDate = startDate ? parseBrDate(startDate, 'Start Date') : undefined;
      const eDate = endDate ? parseBrDate(endDate, 'End Date') : undefined;
      const resolved = await this.resolveTeamIteration(areaPath, sprint, sDate, eDate);
      if (!resolved) {
        return [];
      }

      const capPath = this.getTeamPath(
        resolved.team,
        `/_apis/work/teamsettings/iterations/${resolved.id}/capacities?api-version=6.0`
      );
      const capData = await this.fetchJson<any>(capPath);
      const capacities: TeamMemberCapacity[] = capData?.value || [];

      if (!selectedMembers || selectedMembers.length === 0) {
        return capacities;
      }

      const selected = new Set(selectedMembers.map((m) => m.trim().toLowerCase()));
      return capacities.filter((c) => {
        const dName = (c.teamMember?.displayName || '').trim().toLowerCase();
        const uName = (c.teamMember?.uniqueName || '').trim().toLowerCase();
        return selected.has(dName) || selected.has(uName);
      });
    } catch (err) {
      console.warn('Failed to fetch team capacities from Azure DevOps:', err);
      return [];
    }
  }

  private async queryWiqlTaskIds(areaPath: string, sprint: string): Promise<string[]> {
    const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] IN ('Task', 'Bug') AND [System.AreaPath] UNDER '${areaPath.replace(/'/g, "''")}' AND [System.IterationPath] UNDER '${sprint.replace(/'/g, "''")}'`;
    const res = await this.fetchJson<any>('/_apis/wit/wiql?api-version=6.0', {
      method: 'POST',
      body: JSON.stringify({ query: wiql }),
    });

    const workItems = res?.workItems || [];
    return workItems.map((item: any) => String(item.id));
  }

  private async fetchWorkItemsBatch(taskIds: string[], fields: string[]): Promise<any[]> {
    if (taskIds.length === 0) return [];
    const chunkSize = 100;
    const results: any[] = [];

    for (let i = 0; i < taskIds.length; i += chunkSize) {
      const chunk = taskIds.slice(i, i + chunkSize);
      const res = await this.fetchJson<any>('/_apis/wit/workitemsbatch?api-version=6.0', {
        method: 'POST',
        body: JSON.stringify({
          ids: chunk.map(Number),
          fields,
        }),
      });
      if (res?.value) {
        results.push(...res.value);
      }
    }
    return results;
  }

  async getTeamMembers(areaPath: string, sprint: string): Promise<string[]> {
    const ids = await this.queryWiqlTaskIds(areaPath, sprint);
    if (ids.length === 0) return [];

    const items = await this.fetchWorkItemsBatch(ids, ['System.AssignedTo']);
    const members = new Set<string>();

    for (const item of items) {
      const assigned = item.fields?.['System.AssignedTo'];
      const name = assigned?.displayName || assigned?.uniqueName || assigned;
      if (name && typeof name === 'string') {
        members.add(name.trim());
      }
    }

    return Array.from(members).sort();
  }

  private asofLiteral(day: Date): string {
    const y = day.getFullYear();
    const m = String(day.getMonth() + 1).padStart(2, '0');
    const d = String(day.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}T23:59:59Z`;
  }

  private async literalIterationPath(
    areaPath: string,
    sprint: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<string> {
    const cleanSprint = this.normalizeIterationPath(sprint);
    if (!cleanSprint.startsWith('@')) {
      return cleanSprint;
    }
    const resolved = await this.resolveTeamIteration(areaPath, cleanSprint, startDate, endDate);
    return this.normalizeIterationPath(resolved?.path || resolved?.name || cleanSprint);
  }

  private uniqueSelectedMembers(selectedMembers?: string[]): string[] {
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const m of selectedMembers || []) {
      const clean = m.trim();
      if (!clean) continue;
      const k = clean.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      unique.push(clean);
    }
    return unique;
  }

  private odataAssigneeFilter(selectedMembers: string[]): string {
    const memberFilters: string[] = [];
    for (const member of this.uniqueSelectedMembers(selectedMembers)) {
      const q = member.replace(/'/g, "''");
      memberFilters.push(`(AssignedTo/UserName eq '${q}' or AssignedTo/UserEmail eq '${q}')`);
    }
    if (memberFilters.length === 0) return '';
    return '(' + memberFilters.join(' or ') + ')';
  }

  private historicalFilter(
    areaPath: string,
    sprintPath: string,
    startSK: number,
    endSK: number,
    selectedMembers: string[]
  ): string {
    const area = this.normalizeAreaPath(areaPath);
    const sprint = this.normalizeIterationPath(sprintPath);
    const areaPrefix = area + '\\';

    const filters = [
      `DateSK ge ${startSK} and DateSK le ${endSK} and WorkItemType eq 'Task'`,
      `(Area/AreaPath eq '${area.replace(/'/g, "''")}' or startswith(Area/AreaPath,'${areaPrefix.replace(/'/g, "''")}'))`,
      `Iteration/IterationPath eq '${sprint.replace(/'/g, "''")}'`,
    ];

    const assigneeFilter = this.odataAssigneeFilter(selectedMembers);
    if (assigneeFilter) {
      filters.push(assigneeFilter);
    }
    return filters.join(' and ');
  }

  private async ensureWorkItemSnapshotSupported(analyticsRoot: string): Promise<void> {
    const res = await fetch(this.buildUrl(`${analyticsRoot}/$metadata`), {
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Analytics metadata returned ${res.status}.`);
    }
    const text = await res.text();
    if (!text.includes('WorkItemSnapshot')) {
      throw new Error('Analytics metadata does not expose WorkItemSnapshot.');
    }
  }

  private async queryHistoricalBurndownOData(
    areaPath: string,
    sprint: string,
    startDate: Date,
    endDate: Date,
    selectedMembers: string[],
    onProgress?: ProgressCallback
  ): Promise<SnapshotRow[]> {
    const analyticsRoot = this.getAnalyticsRootUrl();
    if (onProgress) onProgress(0.12, 'Checking Analytics OData support...');
    await this.ensureWorkItemSnapshotSupported(analyticsRoot);

    const sprintPath = await this.literalIterationPath(areaPath, sprint, startDate, endDate);
    const startSK = dateToDateSK(startDate);
    const endSK = dateToDateSK(endDate);
    const odataFilter = this.historicalFilter(areaPath, sprintPath, startSK, endSK, selectedMembers);

    const path = `${analyticsRoot}/WorkItemSnapshot?$apply=filter(${encodeURIComponent(odataFilter)})/groupby((DateSK),aggregate(RemainingWork with sum as RemainingWork))`;

    if (onProgress) onProgress(0.25, 'Querying Analytics WorkItemSnapshot aggregate...');
    const res = await this.fetchJson<{ value: Array<{ DateSK: number; RemainingWork: number }> }>(path);
    const rows: SnapshotRow[] = (res?.value || []).map((r) => ({
      DateSK: Number(r.DateSK),
      RemainingWork: r.RemainingWork !== undefined && r.RemainingWork !== null ? Number(r.RemainingWork) : null,
    }));
    rows.sort((a, b) => (a.DateSK || 0) - (b.DateSK || 0));

    if (onProgress) onProgress(0.35, `Loaded ${rows.length} aggregated WorkItemSnapshot burndown row(s).`);
    return rows;
  }

  private async queryTaskIdsAsof(
    areaPath: string,
    sprintPath: string,
    selectedMembers: string[] | undefined,
    day: Date
  ): Promise<string[]> {
    let memberCondition = '';
    if (selectedMembers && selectedMembers.length > 0) {
      const namesStr = selectedMembers
        .map((m) => `'${m.replace(/'/g, "''")}'`)
        .join(', ');
      memberCondition = `AND [System.AssignedTo] IN (${namesStr})`;
    }

    const normArea = this.normalizeAreaPath(areaPath);
    const normSprint = this.normalizeIterationPath(sprintPath);
    const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = 'Task' AND [System.AreaPath] UNDER '${normArea.replace(/'/g, "''")}' AND [System.IterationPath] = '${normSprint.replace(/'/g, "''")}' ${memberCondition} ASOF '${this.asofLiteral(day)}'`;

    const res = await this.fetchJson<any>('/_apis/wit/wiql?api-version=6.0', {
      method: 'POST',
      body: JSON.stringify({ query: wiql }),
    });

    return (res?.workItems || []).map((item: any) => String(item.id));
  }

  private async fetchWorkItemsAsof(taskIds: string[], day: Date): Promise<any[]> {
    if (taskIds.length === 0) return [];
    const fields = [
      REMAINING_WORK_FIELD,
      COMPLETED_WORK_FIELD,
      'System.AssignedTo',
      'System.State',
    ];
    const asOfStr = this.asofLiteral(day);
    const chunkSize = 200;
    const results: any[] = [];

    for (let i = 0; i < taskIds.length; i += chunkSize) {
      const batch = taskIds.slice(i, i + chunkSize);
      const res = await this.fetchJson<any>(
        `/_apis/wit/workitems?ids=${batch.join(',')}&fields=${fields.join(',')}&asOf=${asOfStr}&api-version=6.0`
      );
      if (res?.value) {
        results.push(...res.value);
      }
    }
    return results;
  }

  private async queryHistoricalSnapshotsWiql(
    areaPath: string,
    sprint: string,
    selectedMembers: string[],
    startDate: Date,
    endDate: Date,
    onProgress?: ProgressCallback
  ): Promise<SnapshotRow[]> {
    const sprintPath = await this.literalIterationPath(areaPath, sprint, startDate, endDate);
    const workDays = getWorkDays(startDate, endDate);
    const rows: SnapshotRow[] = [];
    const totalDays = workDays.length || 1;

    console.log('Falling back to WIQL ASOF historical membership.');
    for (let index = 0; index < workDays.length; index++) {
      const day = workDays[index];
      if (onProgress) {
        onProgress(0.12 + ((index + 1) / totalDays) * 0.23, `Querying historical snapshot for ${formatBrDate(day)}...`);
      }
      const taskIds = await this.queryTaskIdsAsof(areaPath, sprintPath, selectedMembers, day);
      if (taskIds.length === 0) continue;

      const items = await this.fetchWorkItemsAsof(taskIds, day);
      const sk = dateToDateSK(day);
      for (const item of items) {
        const fields = item.fields || {};
        const assigned = fields['System.AssignedTo'];
        const assignedName = assigned?.displayName || assigned?.uniqueName || assigned || '';
        rows.push({
          WorkItemId: item.id,
          DateSK: sk,
          RemainingWork: fields[REMAINING_WORK_FIELD] !== undefined && fields[REMAINING_WORK_FIELD] !== null
            ? Number(fields[REMAINING_WORK_FIELD])
            : null,
          CompletedWork: fields[COMPLETED_WORK_FIELD] !== undefined && fields[COMPLETED_WORK_FIELD] !== null
            ? Number(fields[COMPLETED_WORK_FIELD])
            : null,
          State: fields['System.State'] || '',
          AssignedTo: assignedName,
        });
      }
    }

    console.log(`Loaded ${rows.length} historical row(s) through WIQL ASOF.`);
    return rows;
  }

  private async getHistoricalBurndownRows(
    areaPath: string,
    sprint: string,
    startDate: Date,
    endDate: Date,
    selectedMembers?: string[],
    onProgress?: ProgressCallback
  ): Promise<SnapshotRow[]> {
    const filterMembers = this.uniqueSelectedMembers(selectedMembers);
    try {
      const rows = await this.queryHistoricalBurndownOData(
        areaPath,
        sprint,
        startDate,
        endDate,
        filterMembers,
        onProgress
      );
      if (rows && (rows.length > 0 || filterMembers.length > 0)) {
        return rows;
      }
      console.warn('Analytics WorkItemSnapshot burndown aggregate returned no rows; trying WIQL ASOF fallback.');
    } catch (exc) {
      console.warn('Analytics WorkItemSnapshot burndown aggregate unavailable; falling back to WIQL ASOF:', exc);
    }

    return this.queryHistoricalSnapshotsWiql(
      areaPath,
      sprint,
      filterMembers,
      startDate,
      endDate,
      onProgress
    );
  }

  async getBurndownData(options: ExtractionOptions, onProgress?: ProgressCallback): Promise<BurndownData> {
    const sDate = parseBrDate(options.startDate, 'Start Date');
    const eDate = parseBrDate(options.endDate, 'End Date');
    if (sDate > eDate) {
      throw new Error('Start Date must be before or equal to End Date.');
    }

    const workDays = getWorkDays(sDate, eDate);
    if (workDays.length === 0) {
      throw new Error('The selected burndown period has no working days.');
    }

    onProgress?.(0.08, 'Fetching historical sprint snapshots...');
    const snapshotRows = await this.getHistoricalBurndownRows(
      options.areaPath,
      options.sprint,
      sDate,
      eDate,
      options.selectedMembers,
      onProgress
    );

    onProgress?.(0.50, 'Fetching team capacities...');
    const capacities = await this.getTeamCapacities(
      options.areaPath,
      options.sprint,
      options.selectedMembers,
      options.startDate,
      options.endDate
    );

    onProgress?.(0.90, 'Calculating burndown series...');
    const burndownData = buildHistoricalBurndownData(snapshotRows, capacities, sDate, eDate);
    onProgress?.(1.0, 'Burndown chart generation complete.');
    return burndownData;
  }

  async getWorkHistory(options: ExtractionOptions, onProgress?: ProgressCallback): Promise<WorkHistoryData> {
    onProgress?.(0.05, 'Fetching tasks for work history...');
    const sDate = options.startDate ? parseBrDate(options.startDate, 'Start Date') : null;
    const eDate = options.endDate ? parseBrDate(options.endDate, 'End Date') : null;
    if (eDate) {
      eDate.setHours(23, 59, 59, 999);
    }

    const taskIds = await this.queryWiqlTaskIds(options.areaPath, options.sprint);
    onProgress?.(0.12, `Querying titles for ${taskIds.length} tasks...`);

    const workItems = await this.fetchWorkItemsBatch(taskIds, ['System.Id', 'System.Title']);
    const titleMap = new Map<string, string>();
    for (const item of workItems) {
      const idStr = String(item.fields?.['System.Id'] || item.id);
      const title = item.fields?.['System.Title'] || `Task #${idStr}`;
      titleMap.set(idStr, title);
    }

    const personDailyData: WorkHistoryData = {};
    const personDailyTasks = new Map<string, Map<string, Map<string, TaskWorkItemSummary>>>();
    const taskSprintUpdates = new Map<string, TaskWorkUpdate[]>();

    let processedCount = 0;
    const total = taskIds.length || 1;

    await this.mapConcurrent(taskIds, 10, async (taskId) => {
      try {
        const res = await this.fetchJson<any>(`/_apis/wit/workitems/${taskId}/updates?api-version=6.0&$top=200`);
        const updates = res?.value || [];
        const taskUpdates: TaskWorkUpdate[] = [];

        let runningAssignee = 'Unassigned';
        for (const up of updates) {
          const f = up.fields || {};
          if (f['System.AssignedTo']) {
            const val = f['System.AssignedTo'].newValue;
            if (val) runningAssignee = val.displayName || val.uniqueName || val;
          }

          if (COMPLETED_WORK_FIELD in f || REMAINING_WORK_FIELD in f) {
            const dStr = f['System.ChangedDate']?.newValue || f['System.AuthorizedDate']?.newValue;
            const dt = parseAzureDateTime(dStr);
            if (dt) {
              if (sDate && dt < sDate) continue;
              if (eDate && dt > eDate) continue;

              const compOld = Number(f[COMPLETED_WORK_FIELD]?.oldValue) || 0;
              const compNew = Number(f[COMPLETED_WORK_FIELD]?.newValue) || 0;
              const compDiff = COMPLETED_WORK_FIELD in f ? Math.round((compNew - compOld) * 100) / 100 : 0;

              const remOld = Number(f[REMAINING_WORK_FIELD]?.oldValue) || 0;
              const remNew = Number(f[REMAINING_WORK_FIELD]?.newValue) || 0;
              const remDecr = REMAINING_WORK_FIELD in f ? Math.round((remOld - remNew) * 100) / 100 : 0;

              // Do not record iterations where no completed or remaining work value was changed
              if (compDiff === 0 && remDecr === 0) continue;

              const updateEntry: TaskWorkUpdate = {
                changeDate: dt.toISOString(),
                displayDateTime: formatBrDateTimeWithWeekday(dt),
                changedBy: up.revisedBy?.displayName || up.revisedBy || 'Unknown',
                completedWork: (COMPLETED_WORK_FIELD in f && compDiff !== 0) ? {
                  oldValue: compOld,
                  newValue: compNew,
                  diff: compDiff,
                } : undefined,
                remainingWork: (REMAINING_WORK_FIELD in f && remDecr !== 0) ? {
                  oldValue: remOld,
                  newValue: remNew,
                  decr: remDecr,
                } : undefined,
              };

              taskUpdates.push(updateEntry);

              const dayKey = formatBrDate(dt);
              if (!personDailyData[runningAssignee]) personDailyData[runningAssignee] = {};
              if (!personDailyData[runningAssignee][dayKey]) {
                personDailyData[runningAssignee][dayKey] = { completed: 0, remainingDec: 0, tasks: [] };
              }

              if (compDiff !== 0) personDailyData[runningAssignee][dayKey].completed += compDiff;
              if (remDecr !== 0) personDailyData[runningAssignee][dayKey].remainingDec += remDecr;

              if (!personDailyTasks.has(runningAssignee)) {
                personDailyTasks.set(runningAssignee, new Map());
              }
              const personDays = personDailyTasks.get(runningAssignee)!;
              if (!personDays.has(dayKey)) {
                personDays.set(dayKey, new Map());
              }
              const dayTasks = personDays.get(dayKey)!;

              let summary = dayTasks.get(taskId);
              if (!summary) {
                summary = {
                  taskId,
                  title: titleMap.get(taskId) || `Task #${taskId}`,
                  url: `${this.baseUrl}/_workitems/edit/${taskId}`,
                  completedAdded: 0,
                  remainingDecreased: 0,
                  dayUpdates: [],
                  allSprintUpdates: [],
                };
                dayTasks.set(taskId, summary);
              }

              if (compDiff !== 0) summary.completedAdded += compDiff;
              if (remDecr !== 0) summary.remainingDecreased += remDecr;
              summary.dayUpdates.push(updateEntry);
            }
          }
        }
        taskSprintUpdates.set(taskId, taskUpdates);
      } catch (err) {
        console.warn(`Failed to process updates for task ${taskId}:`, err);
      } finally {
        processedCount++;
        onProgress?.(0.15 + (processedCount / total) * 0.8, `Fetching task updates: ${processedCount}/${total}...`);
      }
    });

    for (const person of Object.keys(personDailyData)) {
      const personDays = personDailyTasks.get(person);
      for (const dayKey of Object.keys(personDailyData[person])) {
        personDailyData[person][dayKey].completed =
          Math.round(personDailyData[person][dayKey].completed * 100) / 100;
        personDailyData[person][dayKey].remainingDec =
          Math.round(personDailyData[person][dayKey].remainingDec * 100) / 100;

        const dayTasks = personDays?.get(dayKey);
        if (dayTasks) {
          const taskList: TaskWorkItemSummary[] = Array.from(dayTasks.values());
          for (const t of taskList) {
            t.completedAdded = Math.round(t.completedAdded * 100) / 100;
            t.remainingDecreased = Math.round(t.remainingDecreased * 100) / 100;
            const fullUpdates = taskSprintUpdates.get(t.taskId) || [];
            t.allSprintUpdates = [...fullUpdates].sort((a, b) => b.changeDate.localeCompare(a.changeDate));
            t.dayUpdates.sort((a, b) => b.changeDate.localeCompare(a.changeDate));
          }
          taskList.sort((a, b) => (Math.abs(b.completedAdded) + Math.abs(b.remainingDecreased)) - (Math.abs(a.completedAdded) + Math.abs(a.remainingDecreased)));
          personDailyData[person][dayKey].tasks = taskList;
        } else {
          personDailyData[person][dayKey].tasks = [];
        }
      }
    }

    onProgress?.(1.0, 'Work history analysis complete.');
    return personDailyData;
  }

  async getReassignments(options: ExtractionOptions, onProgress?: ProgressCallback): Promise<ReassignmentItem[]> {
    onProgress?.(0.1, 'Querying tasks for reassignment tracking...');
    const taskIds = await this.queryWiqlTaskIds(options.areaPath, options.sprint);
    const reassignments: ReassignmentItem[] = [];

    const sDate = parseBrDate(options.startDate, 'Start Date');
    const eDate = parseBrDate(options.endDate, 'End Date');
    eDate.setHours(23, 59, 59, 999);

    let processedCount = 0;
    const total = taskIds.length || 1;

    await this.mapConcurrent(taskIds, 10, async (taskId) => {
      try {
        const res = await this.fetchJson<any>(`/_apis/wit/workitems/${taskId}/updates?api-version=6.0&$top=200`);
        const updates = res?.value || [];

        for (const up of updates) {
          const f = up.fields || {};
          if ('System.AssignedTo' in f) {
            const assignedChange = f['System.AssignedTo'];
            const oldVal = assignedChange.oldValue;
            const newVal = assignedChange.newValue;

            const fromName = (oldVal?.displayName || oldVal?.uniqueName || oldVal || '').trim();
            const toName = (newVal?.displayName || newVal?.uniqueName || newVal || '').trim();

            if (fromName === toName) continue;

            const dStr = f['System.ChangedDate']?.newValue || f['System.AuthorizedDate']?.newValue;
            const changeDate = parseAzureDateTime(dStr);
            if (!changeDate) continue;

            if (changeDate < sDate || changeDate > eDate) continue;

            const changedBy = up.revisedBy?.displayName || up.revisedBy || 'Unknown';

            reassignments.push({
              taskId,
              from: fromName || '(Unassigned)',
              to: toName || '(Unassigned)',
              date: formatBrDateTime(changeDate),
              dateSort: changeDate.toISOString(),
              changedBy,
            });
          }
        }
      } catch (err) {
        console.warn(`Failed to inspect reassignments for task ${taskId}:`, err);
      } finally {
        processedCount++;
        onProgress?.(0.1 + (processedCount / total) * 0.85, `Scanning task updates: ${processedCount}/${total}...`);
      }
    });

    reassignments.sort((a, b) => b.dateSort.localeCompare(a.dateSort));
    onProgress?.(1.0, `Found ${reassignments.length} reassignments.`);
    return reassignments;
  }
}
