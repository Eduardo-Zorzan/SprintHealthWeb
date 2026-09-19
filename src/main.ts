import { DataProviderFactory } from './services/providers/DataProviderFactory';
import { StorageFactory } from './services/storage/StorageFactory';
import { AppConfig, ExtractionOptions, GraphicType } from './types';
import { Sidebar } from './ui/Sidebar';
import { SprintHealthTab } from './ui/SprintHealthTab';
import { SystemLog } from './ui/SystemLog';

class App {
  private storage = StorageFactory.createStorage();
  private systemLog!: SystemLog;
  private sidebar!: Sidebar;
  private sprintHealthTab!: SprintHealthTab;
  private activeConfig: AppConfig;
  private isSidebarCollapsed = false;

  constructor() {
    this.activeConfig = this.storage.loadConfig();
    this.initUI();
    this.initDefaults();
    this.initSidebarToggle();
  }

  private initUI(): void {
    // 1. System Log
    const logContainer = document.getElementById('system-log-container') as HTMLElement;
    this.systemLog = new SystemLog(logContainer);
    this.systemLog.log('DevOps Sprint Health Pro Web initialized.', 'info');

    // 2. Sidebar
    const sidebarContainer = document.getElementById('sidebar-container') as HTMLElement;
    this.sidebar = new Sidebar(sidebarContainer, this.activeConfig, {
      onLoadCombos: () => this.handleLoadCombos(),
      onLoadDates: () => this.handleLoadDates(),
      onGenerateGraphics: () => this.handleGenerateGraphics(),
      onConfigChange: (cfg) => this.handleConfigChange(cfg),
      onUseDemo: () => this.handleUseDemo(),
      onToggleCollapse: () => this.setSidebarCollapsed(!this.isSidebarCollapsed),
    });

    // 3. Sprint Health Tab
    const sprintTabContainer = document.getElementById('tab-pane-sprint') as HTMLElement;
    this.sprintHealthTab = new SprintHealthTab(sprintTabContainer, {
      onSyncMembers: () => this.handleSyncMembers(),
      onGraphicTypeChange: (type) => this.systemLog.log(`Graphic type changed to: ${type}`, 'info'),
    });
  }

  private initSidebarToggle(): void {
    const saved = localStorage.getItem('sprint_health_sidebar_collapsed');
    if (saved === 'true') {
      this.setSidebarCollapsed(true, false);
    }

    const toggleBtn = document.getElementById('btn-toggle-sidebar');
    toggleBtn?.addEventListener('click', () => {
      this.setSidebarCollapsed(!this.isSidebarCollapsed);
    });
  }

  private setSidebarCollapsed(collapsed: boolean, animate = true): void {
    this.isSidebarCollapsed = collapsed;
    const appEl = document.getElementById('app');
    const toggleBtn = document.getElementById('btn-toggle-sidebar');
    if (!appEl || !toggleBtn) return;

    const iconCollapse = toggleBtn.querySelector('.icon-sidebar-collapse') as HTMLElement;
    const iconExpand = toggleBtn.querySelector('.icon-sidebar-expand') as HTMLElement;

    if (this.isSidebarCollapsed) {
      appEl.classList.add('sidebar-collapsed');
      toggleBtn.title = 'Mostrar barra de configuração';
      toggleBtn.setAttribute('aria-label', 'Mostrar barra de configuração');
      if (iconCollapse) iconCollapse.style.display = 'none';
      if (iconExpand) iconExpand.style.display = 'block';
    } else {
      appEl.classList.remove('sidebar-collapsed');
      toggleBtn.title = 'Ocultar barra de configuração';
      toggleBtn.setAttribute('aria-label', 'Ocultar barra de configuração');
      if (iconCollapse) iconCollapse.style.display = 'block';
      if (iconExpand) iconExpand.style.display = 'none';
    }

    try {
      localStorage.setItem('sprint_health_sidebar_collapsed', String(this.isSidebarCollapsed));
    } catch {}

    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
    });
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, animate ? 260 : 50);
  }

  private initDefaults(): void {
    const cachedCombos = this.storage.loadCombosCache();
    const cachedMembers = this.storage.loadMembersCache();

    if (cachedCombos.areas.length > 0 || cachedCombos.sprints.length > 0) {
      this.sidebar.populateCombos(cachedCombos);
      this.systemLog.log(`Loaded ${cachedCombos.areas.length} area(s) and ${cachedCombos.sprints.length} sprint(s) from storage cache.`, 'info');
    } else if (this.activeConfig.url.startsWith('mock://') || this.activeConfig.url === 'demo') {
      // Auto-load demo combos if clean slate
      this.handleLoadCombos();
    }

    if (cachedMembers.length > 0) {
      this.sprintHealthTab.setMembers(cachedMembers);
      this.systemLog.log(`Loaded ${cachedMembers.length} team member(s) from storage cache.`, 'info');
    } else if (this.activeConfig.url.startsWith('mock://') || this.activeConfig.url === 'demo') {
      this.handleSyncMembers();
    }
  }

  private handleConfigChange(config: AppConfig): void {
    this.activeConfig = config;
    this.storage.saveConfig(config);
  }

  private handleUseDemo(): void {
    this.activeConfig = {
      url: 'mock://sprint-health',
      area: 'SprintHealth\\Platform',
      sprint: 'SprintHealth\\Sprint 2026.15',
      token: '',
      startDate: '06/07/2026',
      endDate: '17/07/2026',
    };
    this.sidebar.populateConfig(this.activeConfig);
    this.storage.saveConfig(this.activeConfig);
    this.systemLog.log('Switched to Mock/Demo mode (mock://sprint-health). PAT token not required.', 'success');
    this.handleLoadCombos();
    this.handleSyncMembers();
  }

  private async handleLoadCombos(): Promise<void> {
    const config = this.sidebar.getConfig();
    if (!config.url) {
      this.systemLog.log('Error: Server URL is required to load combos.', 'error');
      alert('Please enter a Server URL (or click "Mock / Demo").');
      return;
    }

    this.sidebar.setCombosLoading(true);
    this.systemLog.log(`Connecting to ${config.url} to fetch Area and Sprint options...`, 'info');

    try {
      const provider = DataProviderFactory.createProvider(config);
      const areas = await provider.getAreaOptions();
      const sprints = await provider.getSprintOptions(config.area || (areas[0] ?? ''));

      const combos = { areas, sprints };
      this.sidebar.populateCombos(combos);
      this.storage.saveCombosCache(combos);
      this.systemLog.log(`Successfully retrieved ${areas.length} area(s) and ${sprints.length} sprint(s).`, 'success');
    } catch (err: any) {
      this.systemLog.log(`Failed to load combos: ${err.message}`, 'error');
      alert(`Error loading combos: ${err.message}`);
    } finally {
      this.sidebar.setCombosLoading(false);
    }
  }

  private async handleLoadDates(): Promise<void> {
    const config = this.sidebar.getConfig();
    if (!config.url) {
      this.systemLog.log('Error: Server URL is required.', 'error');
      alert('Please enter a Server URL.');
      return;
    }
    if (!config.sprint) {
      this.systemLog.log('Error: Sprint name is required to fetch sprint dates.', 'error');
      alert('Please select or enter a Sprint.');
      return;
    }

    this.sidebar.setDatesLoading(true);
    this.systemLog.log(`Fetching dates for sprint "${config.sprint}"...`, 'info');

    try {
      const provider = DataProviderFactory.createProvider(config);
      const dates = await provider.getSprintDates(config.area, config.sprint);
      this.sidebar.setDates(dates.startDate, dates.endDate);
      this.systemLog.log(`Loaded sprint dates: ${dates.startDate} to ${dates.endDate}`, 'success');
    } catch (err: any) {
      this.systemLog.log(`Failed to fetch sprint dates: ${err.message}`, 'error');
      alert(`Error fetching sprint dates: ${err.message}`);
    } finally {
      this.sidebar.setDatesLoading(false);
    }
  }

  private async handleSyncMembers(): Promise<void> {
    const config = this.sidebar.getConfig();
    if (!config.url) {
      this.systemLog.log('Error: Server URL is required to sync members.', 'error');
      alert('Please enter a Server URL.');
      return;
    }

    this.sprintHealthTab.setSyncing(true);
    this.systemLog.log('Syncing team members from DevOps...', 'info');

    try {
      const provider = DataProviderFactory.createProvider(config);
      const members = await provider.getTeamMembers(config.area, config.sprint);
      this.sprintHealthTab.setMembers(members);
      this.storage.saveMembersCache(members);
      this.systemLog.log(`Synced ${members.length} member(s) from DevOps.`, 'success');
    } catch (err: any) {
      this.systemLog.log(`Failed to sync team members: ${err.message}`, 'error');
      alert(`Error syncing members: ${err.message}`);
    } finally {
      this.sprintHealthTab.setSyncing(false);
    }
  }

  private async handleGenerateGraphics(): Promise<void> {
    const config = this.sidebar.getConfig();
    if (!config.url) {
      this.systemLog.log('Error: Server URL is required.', 'error');
      alert('Please enter a Server URL.');
      return;
    }
    if (!config.startDate || !config.endDate) {
      this.systemLog.log('Error: Start Date and End Date are required.', 'error');
      alert('Please enter or load Sprint Start and End dates.');
      return;
    }

    const graphicType = this.sprintHealthTab.getSelectedGraphicType();
    const selectedMembers = this.sprintHealthTab.getSelectedMembers();

    const options: ExtractionOptions = {
      areaPath: config.area,
      sprint: config.sprint,
      selectedMembers,
      startDate: config.startDate,
      endDate: config.endDate,
    };

    this.sidebar.setGenerating(true);
    this.sidebar.setProgress(0, 'Initializing extraction...');
    this.systemLog.log(`Starting ${graphicType} generation for ${selectedMembers.length} member(s)...`, 'info');

    try {
      const provider = DataProviderFactory.createProvider(config);

      if (graphicType === GraphicType.Burndown) {
        const burndownData = await provider.getBurndownData(options, (progress, msg) => {
          this.sidebar.setProgress(progress, msg);
          if (msg) this.systemLog.log(msg, 'info');
        });
        this.sprintHealthTab.renderChart(GraphicType.Burndown, burndownData);
      } else {
        const workData = await provider.getWorkHistory(options, (progress, msg) => {
          this.sidebar.setProgress(progress, msg);
          if (msg) this.systemLog.log(msg, 'info');
        });
        this.sprintHealthTab.renderChart(GraphicType.TimesRegistering, workData);
      }

      this.sidebar.setProgress(1.0, 'Complete');
      this.systemLog.log(`Graphics generation finished successfully for ${graphicType}.`, 'success');
    } catch (err: any) {
      this.systemLog.log(`Generation failed: ${err.message}`, 'error');
      alert(`Error generating graphics: ${err.message}`);
    } finally {
      this.sidebar.setGenerating(false);
    }
  }
}

// Bootstrap application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  new App();
});
