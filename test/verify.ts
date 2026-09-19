import { ChartRendererFactory } from '../src/charts/ChartRendererFactory';
import { DataProviderFactory } from '../src/services/providers/DataProviderFactory';
import { StorageFactory } from '../src/services/storage/StorageFactory';
import { AppConfig, ExtractionOptions, GraphicType } from '../src/types';
import { formatBrDate, formatBrDateTimeWithWeekday, getWorkDays, parseBrDate } from '../src/utils/date';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('=== Starting Automated Verification Tests ===\n');

  // Test 1: Date Utilities
  console.log('Test 1: Date Utilities');
  const d = parseBrDate('15/07/2026');
  assert(d.getDate() === 15, 'Day should be 15');
  assert(d.getMonth() === 6, 'Month should be July (index 6)');
  assert(d.getFullYear() === 2026, 'Year should be 2026');
  assert(formatBrDate(d) === '15/07/2026', 'Formatted date should match 15/07/2026');

  // 15/07/2026 is a Wednesday ('qua')
  const dtWithTime = new Date(2026, 6, 15, 14, 30);
  assert(formatBrDateTimeWithWeekday(dtWithTime) === 'qua 15/07/2026 14:30', `Weekday format should match, got ${formatBrDateTimeWithWeekday(dtWithTime)}`);

  // Friday 18/09/2026 18:04 ('sex 18/09/2026 18:04')
  const dtFriday = new Date(2026, 8, 18, 18, 4);
  assert(formatBrDateTimeWithWeekday(dtFriday) === 'sex 18/09/2026 18:04', `Friday format should match, got ${formatBrDateTimeWithWeekday(dtFriday)}`);

  const start = parseBrDate('06/07/2026'); // Monday
  const end = parseBrDate('17/07/2026'); // Friday of next week (10 working days)
  const workDays = getWorkDays(start, end);
  assert(workDays.length === 10, `Expected 10 working days, got ${workDays.length}`);
  console.log('  ✓ Date utilities passed.');

  // Test 2: Storage Factory & InMemory Storage
  console.log('\nTest 2: Storage Factory');
  const storage = StorageFactory.createStorage('memory');
  const initialCfg = storage.loadConfig();
  assert(initialCfg.url === 'mock://sprint-health', 'Default URL should be mock://sprint-health');

  const customCfg: AppConfig = {
    ...initialCfg,
    area: 'Custom\\Area',
    sprint: 'Custom\\Sprint 1',
  };
  storage.saveConfig(customCfg);
  const loadedCfg = storage.loadConfig();
  assert(loadedCfg.area === 'Custom\\Area', 'Custom area should be saved and loaded');

  storage.saveMembersCache(['Alice', 'Bob']);
  const members = storage.loadMembersCache();
  assert(members.length === 2 && members[0] === 'Alice', 'Members cache should match');
  console.log('  ✓ Storage factory passed.');

  // Test 3: Data Provider Factory & DemoDataProvider
  console.log('\nTest 3: Data Provider Factory & DemoDataProvider');
  const provider = DataProviderFactory.createProvider(initialCfg);

  const areas = await provider.getAreaOptions();
  assert(areas.length >= 2, `Expected at least 2 areas, got ${areas.length}`);

  const sprints = await provider.getSprintOptions(areas[0]);
  assert(sprints.length >= 2, `Expected at least 2 sprints, got ${sprints.length}`);

  const dates = await provider.getSprintDates(areas[0], sprints[0]);
  assert(Boolean(dates.startDate && dates.endDate), 'Sprint dates should be present');

  const team = await provider.getTeamMembers(areas[0], sprints[0]);
  assert(team.length === 5, `Expected 5 demo members, got ${team.length}`);

  const extractionOptions: ExtractionOptions = {
    areaPath: areas[0],
    sprint: sprints[0],
    selectedMembers: team,
    startDate: dates.startDate,
    endDate: dates.endDate,
  };

  // Burndown test
  const burndown = await provider.getBurndownData(extractionOptions);
  assert(burndown.dates.length === 10, `Expected 10 burndown dates, got ${burndown.dates.length}`);
  assert(burndown.fullActualRemaining.length === 10, 'Full actual remaining length should match dates');
  assert(burndown.idealTrend.length === 10, 'Ideal trend length should match dates');
  assert(burndown.summary.totalCapacity > 0, 'Total capacity should be greater than 0');
  assert(burndown.summary.remainingWork >= 0, 'Remaining work should be non-negative');

  // Work history test
  const workHistory = await provider.getWorkHistory(extractionOptions);
  assert(Object.keys(workHistory).length === 5, 'Work history should have 5 team members');

  // Verify task drilldown items exist on active dates
  const anaHistory = workHistory['Ana Silva'];
  assert(Boolean(anaHistory), 'Ana Silva work history should exist');
  const activeDates = Object.keys(anaHistory).filter((d) => (anaHistory[d].tasks?.length || 0) > 0);
  assert(activeDates.length > 0, 'Ana Silva should have active dates with tasks');
  const sampleTask = anaHistory[activeDates[0]].tasks![0];
  assert(Boolean(sampleTask.taskId), 'Task summary should have taskId');
  assert(Boolean(sampleTask.title), 'Task summary should have title');
  assert(Boolean(sampleTask.url), 'Task summary should have url');
  assert(sampleTask.completedAdded >= 0, 'completedAdded should be non-negative');
  assert(sampleTask.remainingDecreased >= 0, 'remainingDecreased should be non-negative');
  assert(sampleTask.allSprintUpdates.length > 0, 'allSprintUpdates should have entries');
  assert(sampleTask.dayUpdates.length > 0, 'dayUpdates should have entries');
  assert(Boolean(sampleTask.allSprintUpdates[0].displayDateTime), 'allSprintUpdates should have formatted displayDateTime');

  // Reassignments test
  const reassignments = await provider.getReassignments(extractionOptions);
  assert(reassignments.length === 5, `Expected 5 reassignments, got ${reassignments.length}`);
  assert(Boolean(reassignments[0].taskId), 'Reassignment should have taskId');
  assert(Boolean(reassignments[0].from), 'Reassignment should have from');
  assert(Boolean(reassignments[0].to), 'Reassignment should have to');
  console.log('  ✓ DemoDataProvider calculations and parity verified.');

  // Test 4: Chart Renderer Factory
  console.log('\nTest 4: Chart Renderer Factory');
  const burndownRenderer = ChartRendererFactory.createRenderer(GraphicType.Burndown);
  assert(typeof burndownRenderer.render === 'function', 'Burndown renderer should have render method');
  assert(typeof burndownRenderer.destroy === 'function', 'Burndown renderer should have destroy method');

  const timeRegRenderer = ChartRendererFactory.createRenderer(GraphicType.TimesRegistering);
  assert(typeof timeRegRenderer.render === 'function', 'Time registration renderer should have render method');
  assert(typeof timeRegRenderer.destroy === 'function', 'Time registration renderer should have destroy method');
  assert('onBarClick' in timeRegRenderer, 'Time registration renderer should support onBarClick callback');
  console.log('  ✓ ChartRendererFactory verified.');

  // Test 5: AzureDevOpsApiProvider Burndown Calculation
  console.log('\nTest 5: AzureDevOpsApiProvider Historical Burndown Calculation');
  const mockFetch = async (url: string, init?: RequestInit): Promise<Response> => {
    const urlStr = String(url);

    // WIQL query
    if (urlStr.includes('/_apis/wit/wiql')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          workItems: [{ id: 101 }, { id: 102 }, { id: 103 }],
        }),
      } as any;
    }

    // Work items with asOf (historical snapshots)
    if (urlStr.includes('/_apis/wit/workitems?')) {
      let rem101 = 0;
      let state101 = 'Closed';
      let rem102 = 12;
      if (urlStr.includes('2026-07-06')) {
        rem101 = 10;
        state101 = 'Active';
        rem102 = 20;
      } else if (urlStr.includes('2026-07-07')) {
        rem101 = 5;
        state101 = 'Active';
        rem102 = 20;
      } else if (urlStr.includes('2026-07-08')) {
        rem101 = 0;
        state101 = 'Closed';
        rem102 = 20;
      } else if (urlStr.includes('2026-07-09')) {
        rem101 = 0;
        state101 = 'Closed';
        rem102 = 12;
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          value: [
            {
              id: 101,
              fields: {
                'System.Id': 101,
                'System.Title': 'Task A',
                'System.AssignedTo': { displayName: 'Dev One' },
                'System.State': state101,
                'Microsoft.VSTS.Scheduling.RemainingWork': rem101,
              },
            },
            {
              id: 102,
              fields: {
                'System.Id': 102,
                'System.Title': 'Task B',
                'System.AssignedTo': { displayName: 'Dev Two' },
                'System.State': 'Active',
                'Microsoft.VSTS.Scheduling.RemainingWork': rem102,
              },
            },
            {
              id: 103,
              fields: {
                'System.Id': 103,
                'System.Title': 'Task C',
                'System.AssignedTo': { displayName: 'Dev One' },
                'System.State': 'Active',
                'Microsoft.VSTS.Scheduling.RemainingWork': 0,
              },
            },
          ],
        }),
      } as any;
    }

    // Work items batch
    if (urlStr.includes('/_apis/wit/workitemsbatch')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          value: [
            {
              id: 101,
              fields: {
                'System.Id': 101,
                'System.Title': 'Task A',
                'System.AssignedTo': { displayName: 'Dev One' },
                'System.State': 'Closed',
                'Microsoft.VSTS.Scheduling.RemainingWork': 0,
              },
            },
            {
              id: 102,
              fields: {
                'System.Id': 102,
                'System.Title': 'Task B',
                'System.AssignedTo': { displayName: 'Dev Two' },
                'System.State': 'Active',
                'Microsoft.VSTS.Scheduling.RemainingWork': 12,
              },
            },
            {
              id: 103,
              fields: {
                'System.Id': 103,
                'System.Title': 'Task C',
                'System.AssignedTo': { displayName: 'Dev One' },
                'System.State': 'Active',
                'Microsoft.VSTS.Scheduling.RemainingWork': 8,
              },
            },
          ],
        }),
      } as any;
    }

    // Task 101 updates: started at 10h on 06/07, changed to 5h on 07/07, completed to 0h on 08/07
    if (urlStr.includes('/_apis/wit/workitems/101/updates')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          value: [
            {
              fields: {
                'System.ChangedDate': { newValue: '2026-07-06T10:00:00Z' },
                'Microsoft.VSTS.Scheduling.RemainingWork': { oldValue: 10, newValue: 10 },
              },
            },
            {
              fields: {
                'System.ChangedDate': { newValue: '2026-07-07T14:00:00Z' },
                'Microsoft.VSTS.Scheduling.RemainingWork': { oldValue: 10, newValue: 5 },
              },
            },
            {
              fields: {
                'System.ChangedDate': { newValue: '2026-07-08T16:00:00Z' },
                'Microsoft.VSTS.Scheduling.RemainingWork': { oldValue: 5, newValue: 0 },
              },
            },
          ],
        }),
      } as any;
    }

    // Task 102 updates: started at 20h, changed to 12h on 09/07
    if (urlStr.includes('/_apis/wit/workitems/102/updates')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          value: [
            {
              fields: {
                'System.ChangedDate': { newValue: '2026-07-06T09:00:00Z' },
                'Microsoft.VSTS.Scheduling.RemainingWork': { oldValue: 20, newValue: 20 },
              },
            },
            {
              fields: {
                'System.ChangedDate': { newValue: '2026-07-09T11:00:00Z' },
                'Microsoft.VSTS.Scheduling.RemainingWork': { oldValue: 20, newValue: 12 },
              },
            },
          ],
        }),
      } as any;
    }

    // Task 103 updates: testing decreases in completed work and increases in remaining work
    if (urlStr.includes('/_apis/wit/workitems/103/updates')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          value: [
            {
              fields: {
                'System.AssignedTo': { newValue: { displayName: 'Dev One' } },
                'System.ChangedDate': { newValue: '2026-07-06T14:19:00Z' },
                'Microsoft.VSTS.Scheduling.CompletedWork': { oldValue: 0, newValue: 35 },
                'Microsoft.VSTS.Scheduling.RemainingWork': { oldValue: 10, newValue: 12 }, // Remaining increased (+2h scope, -2 decr)
              },
            },
            {
              fields: {
                'System.ChangedDate': { newValue: '2026-07-06T17:46:00Z' },
                'Microsoft.VSTS.Scheduling.CompletedWork': { oldValue: 35, newValue: 5.2 }, // Completed decreased (-29.8)
                'Microsoft.VSTS.Scheduling.RemainingWork': { oldValue: 12, newValue: 8 }, // Remaining decreased (+4 decr)
              },
            },
            {
              fields: {
                'System.ChangedDate': { newValue: '2026-07-06T17:52:00Z' },
                'Microsoft.VSTS.Scheduling.CompletedWork': { oldValue: 5.2, newValue: 4.2 }, // Completed decreased (-1.0)
              },
            },
            {
              // Update with 0 change to remaining work and no completed work change (must be skipped)
              fields: {
                'System.ChangedDate': { newValue: '2026-07-06T18:00:00Z' },
                'Microsoft.VSTS.Scheduling.RemainingWork': { oldValue: 8, newValue: 8 },
              },
            },
          ],
        }),
      } as any;
    }

    // Capacities (must be checked before iterations since URL contains both)
    if (urlStr.includes('/capacities')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          value: [
            {
              teamMember: { displayName: 'Dev One', uniqueName: 'dev1@test' },
              activities: [{ name: 'Dev', capacityPerDay: 6 }],
              daysOff: [],
            },
            {
              teamMember: { displayName: 'Dev Two', uniqueName: 'dev2@test' },
              activities: [{ name: 'Dev', capacityPerDay: 6 }],
              daysOff: [],
            },
          ],
        }),
      } as any;
    }

    // Team iterations
    if (urlStr.includes('/_apis/work/teamsettings/iterations')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          value: [
            {
              id: 'iter-1',
              name: 'Sprint 1',
              path: 'Project\\Sprint 1',
              attributes: {
                startDate: '2026-07-06T00:00:00Z',
                finishDate: '2026-07-17T00:00:00Z',
              },
            },
          ],
        }),
      } as any;
    }

    // Metadata
    if (urlStr.includes('/$metadata')) {
      return {
        ok: false,
        status: 404,
        statusText: 'Not found',
        text: async () => 'Not found',
      } as any;
    }

    return {
      ok: false,
      status: 404,
      statusText: 'Not found',
      text: async () => 'Not found',
    } as any;
  };

  const origFetch = globalThis.fetch;
  globalThis.fetch = mockFetch as any;

  try {
    const { AzureDevOpsApiProvider } = await import('../src/services/providers/AzureDevOpsApiProvider');
    const apiProvider = new AzureDevOpsApiProvider('https://devops.example.com', 'dummy-token');

    const burndownResult = await apiProvider.getBurndownData({
      areaPath: 'Project\\Squad 1',
      sprint: 'Sprint 1',
      selectedMembers: ['Dev One', 'Dev Two'],
      startDate: '06/07/2026',
      endDate: '17/07/2026',
    });

    assert(burndownResult.dates.length === 10, 'Should have 10 sprint work days');
    // Day 1 (06/07): 10 + 20 = 30h
    assert(burndownResult.fullActualRemaining[0] === 30, `Day 1 remaining should be 30h, got ${burndownResult.fullActualRemaining[0]}`);
    // Day 2 (07/07): 5 + 20 = 25h
    assert(burndownResult.fullActualRemaining[1] === 25, `Day 2 remaining should be 25h, got ${burndownResult.fullActualRemaining[1]}`);
    // Day 3 (08/07): 0 + 20 = 20h
    assert(burndownResult.fullActualRemaining[2] === 20, `Day 3 remaining should be 20h, got ${burndownResult.fullActualRemaining[2]}`);
    // Day 4 (09/07): 0 + 12 = 12h
    assert(burndownResult.fullActualRemaining[3] === 12, `Day 4 remaining should be 12h, got ${burndownResult.fullActualRemaining[3]}`);

    // Exact Python formula for ideal trend: start_remaining * (1 - (idx + 1) / len(dates))
    // On Day 1 (idx=0): 30 * (1 - 1/10) = 27
    // On Day 10 (idx=9): 30 * (1 - 10/10) = 0
    assert(burndownResult.idealTrend[0] === 27, `Ideal trend on day 1 should be 27, got ${burndownResult.idealTrend[0]}`);
    assert(burndownResult.idealTrend[9] === 0, `Ideal trend on last day should be 0, got ${burndownResult.idealTrend[9]}`);

    // Capacity: 2 devs * 6h/day * 10 days = 120h total capacity
    assert(burndownResult.summary.totalCapacity === 120, `Expected 120h capacity, got ${burndownResult.summary.totalCapacity}`);
    console.log('  ✓ AzureDevOpsApiProvider historical burndown verified successfully.');

    // Test 6: AzureDevOpsApiProvider Work History With Decreases & Increases
    console.log('\nTest 6: AzureDevOpsApiProvider Work History With Decreases & Increases');
    const workHistory = await apiProvider.getWorkHistory({
      areaPath: 'Project\\Squad 1',
      sprint: 'Sprint 1',
      selectedMembers: ['Dev One', 'Dev Two'],
      startDate: '06/07/2026',
      endDate: '17/07/2026',
    });

    const devOneHistory = workHistory['Dev One'];
    assert(Boolean(devOneHistory), 'Dev One history should exist');

    // On 06/07/2026:
    // Task 103 had:
    // - CompWork: 0 -> 35 (+35), 35 -> 5.2 (-29.8), 5.2 -> 4.2 (-1.0) => Net completed = 4.2h
    // - RemWork: 10 -> 12 (-2 decr / +2 scope), 12 -> 8 (+4 decr) => Net remainingDec = 2.0h
    const dayEntry = devOneHistory['06/07/2026'];
    assert(Boolean(dayEntry), '06/07/2026 entry should exist for Dev One');
    assert(dayEntry.completed === 4.2, `Expected completed work to be 4.2h, got ${dayEntry.completed}h`);
    assert(dayEntry.remainingDec === 2, `Expected remainingDec to be 2h, got ${dayEntry.remainingDec}h`);

    // Check task drilldown item
    const task103 = dayEntry.tasks?.find((t) => t.taskId === '103');
    assert(Boolean(task103), 'Task 103 should exist in 06/07/2026 tasks');
    assert(task103!.completedAdded === 4.2, `Expected task 103 completedAdded to be 4.2h, got ${task103!.completedAdded}h`);
    assert(task103!.remainingDecreased === 2, `Expected task 103 remainingDecreased to be 2h, got ${task103!.remainingDecreased}h`);
    assert(task103!.dayUpdates.length === 3, `Expected 3 updates for task 103, got ${task103!.dayUpdates.length}`);

    // Verify negative diffs are preserved in updates
    const updates = task103!.dayUpdates;
    const hasNegativeCompDiff = updates.some((u) => (u.completedWork?.diff || 0) < 0);
    assert(hasNegativeCompDiff, 'Should preserve negative compDiff in dayUpdates');
    const hasNegativeRemDecr = updates.some((u) => (u.remainingWork?.decr || 0) < 0);
    assert(hasNegativeRemDecr, 'Should preserve negative remDecr in dayUpdates');

    // Verify zero-change updates are not present
    const hasZeroChangeUpdate = updates.some((u) => (!u.completedWork || u.completedWork.diff === 0) && (!u.remainingWork || u.remainingWork.decr === 0));
    assert(!hasZeroChangeUpdate, 'Zero-delta updates must not be present');

    // Verify member filtering strictly excludes unselected members
    const workHistoryDevOneOnly = await apiProvider.getWorkHistory({
      areaPath: 'Project\\Squad 1',
      sprint: 'Sprint 1',
      selectedMembers: ['Dev One'],
      startDate: '06/07/2026',
      endDate: '17/07/2026',
    });
    assert(Boolean(workHistoryDevOneOnly['Dev One']), 'Dev One must be present');
    assert(!workHistoryDevOneOnly['Dev Two'], 'Dev Two must NOT be present when only Dev One is selected');
    assert(Object.keys(workHistoryDevOneOnly).length === 1, 'Only 1 member should be returned in workHistory');

    console.log('  ✓ Work history decreases, increases, and member filtering verified successfully.');
  } finally {
    globalThis.fetch = origFetch;
  }

  console.log('\n=== All Verification Tests Passed Successfully! ===');
}

runTests().catch((err) => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});
