import { AppConfig, CombosCache } from '../types';

export interface SidebarCallbacks {
  onLoadCombos: () => Promise<void>;
  onLoadDates: () => Promise<void>;
  onGenerateGraphics: () => Promise<void>;
  onConfigChange: (config: AppConfig) => void;
  onUseDemo?: () => void;
  onToggleCollapse?: () => void;
}

export class Sidebar {
  private element: HTMLElement;
  private callbacks: SidebarCallbacks;

  // DOM elements
  private urlInput!: HTMLInputElement;
  private areaInput!: HTMLInputElement;
  private areaDatalist!: HTMLDataListElement;
  private sprintInput!: HTMLInputElement;
  private sprintDatalist!: HTMLDataListElement;
  private tokenInput!: HTMLInputElement;
  private startDateInput!: HTMLInputElement;
  private endDateInput!: HTMLInputElement;
  private loadCombosBtn!: HTMLButtonElement;
  private loadDatesBtn!: HTMLButtonElement;
  private generateBtn!: HTMLButtonElement;
  private progressFill!: HTMLElement;
  private progressText!: HTMLElement;

  constructor(container: HTMLElement, initialConfig: AppConfig, callbacks: SidebarCallbacks) {
    this.element = container;
    this.callbacks = callbacks;
    this.render();
    this.bindElements();
    this.populateConfig(initialConfig);
    this.setupListeners();
  }

  private render(): void {
    this.element.innerHTML = `
      <aside class="sidebar-wrapper">
        <div class="sidebar-header">
          <div class="sidebar-header-row">
            <div class="app-brand">
              <div class="brand-text">
                <h2>DevOps Sprint Health Pro</h2>
              </div>
            </div>
            <button type="button" id="btn-sidebar-collapse" class="btn-sidebar-collapse" title="Ocultar barra de configuração" aria-label="Ocultar barra de configuração">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m15 18-6-6 6-6"/>
              </svg>
            </button>
          </div>
          <p class="sidebar-subtitle">CONFIGURATION</p>
        </div>

        <div class="sidebar-content">
          <!-- Server URL -->
          <div class="form-group">
            <label for="cfg-url">Server URL</label>
            <input type="text" id="cfg-url" class="form-control" placeholder="mock://sprint-health or https://dev.azure.com/org" />
          </div>

          <!-- Load Combos Button -->
          <button type="button" id="btn-load-combos" class="btn btn-secondary w-full">
            <span>⟳</span> Load Combos
          </button>

          <!-- Area Path -->
          <div class="form-group">
            <label for="cfg-area">Area Path</label>
            <input type="text" id="cfg-area" list="area-options" class="form-control" placeholder="Project\\Team or Area" />
            <datalist id="area-options"></datalist>
          </div>

          <!-- Sprint -->
          <div class="form-group">
            <label for="cfg-sprint">Sprint</label>
            <input type="text" id="cfg-sprint" list="sprint-options" class="form-control" placeholder="Project\\Sprint Name" />
            <datalist id="sprint-options"></datalist>
          </div>

          <!-- PAT Token -->
          <div class="form-group">
            <label for="cfg-token">PAT Token</label>
            <div class="password-input-group">
              <input type="password" id="cfg-token" class="form-control" placeholder="Personal Access Token (empty for demo)" />
              <button type="button" id="btn-toggle-token" class="btn-input-adornment" title="Show/Hide Token">👁</button>
            </div>
          </div>

          <!-- Dates Section -->
          <div class="dates-grid">
            <div class="form-group">
              <label for="cfg-start-date">Start Date</label>
              <input type="text" id="cfg-start-date" class="form-control" placeholder="DD/MM/YYYY" />
            </div>
            <div class="form-group">
              <label for="cfg-end-date">End Date</label>
              <input type="text" id="cfg-end-date" class="form-control" placeholder="DD/MM/YYYY" />
            </div>
          </div>

          <!-- Load Dates Button -->
          <button type="button" id="btn-load-dates" class="btn btn-secondary w-full">
            <span>📅</span> Load Sprint Dates
          </button>

          <!-- Progress Bar Area -->
          <div class="progress-section">
            <div class="progress-info">
              <span id="progress-text">Ready</span>
            </div>
            <div id="progress-bar" class="progress-bar-container">
              <div id="progress-fill" class="progress-bar-fill" style="width: 0%"></div>
            </div>
          </div>

          <!-- Main Generate Button -->
          <button type="button" id="btn-generate" class="btn btn-primary btn-large w-full">
            GENERATE GRAPHICS
          </button>
        </div>
      </aside>
    `;
  }

  private bindElements(): void {
    this.urlInput = this.element.querySelector('#cfg-url') as HTMLInputElement;
    this.areaInput = this.element.querySelector('#cfg-area') as HTMLInputElement;
    this.areaDatalist = this.element.querySelector('#area-options') as HTMLDataListElement;
    this.sprintInput = this.element.querySelector('#cfg-sprint') as HTMLInputElement;
    this.sprintDatalist = this.element.querySelector('#sprint-options') as HTMLDataListElement;
    this.tokenInput = this.element.querySelector('#cfg-token') as HTMLInputElement;
    this.startDateInput = this.element.querySelector('#cfg-start-date') as HTMLInputElement;
    this.endDateInput = this.element.querySelector('#cfg-end-date') as HTMLInputElement;
    this.loadCombosBtn = this.element.querySelector('#btn-load-combos') as HTMLButtonElement;
    this.loadDatesBtn = this.element.querySelector('#btn-load-dates') as HTMLButtonElement;
    this.generateBtn = this.element.querySelector('#btn-generate') as HTMLButtonElement;
    this.progressFill = this.element.querySelector('#progress-fill') as HTMLElement;
    this.progressText = this.element.querySelector('#progress-text') as HTMLElement;
  }

  public populateConfig(config: AppConfig): void {
    this.urlInput.value = config.url;
    this.areaInput.value = config.area;
    this.sprintInput.value = config.sprint;
    this.tokenInput.value = config.token;
    this.startDateInput.value = config.startDate;
    this.endDateInput.value = config.endDate;
  }

  public populateCombos(combos: CombosCache): void {
    this.areaDatalist.innerHTML = '';
    for (const area of combos.areas) {
      const opt = document.createElement('option');
      opt.value = area;
      this.areaDatalist.appendChild(opt);
    }
    if (!this.areaInput.value && combos.areas.length > 0) {
      this.areaInput.value = combos.areas[0];
    }

    this.sprintDatalist.innerHTML = '';
    for (const sprint of combos.sprints) {
      const opt = document.createElement('option');
      opt.value = sprint;
      this.sprintDatalist.appendChild(opt);
    }
    if (!this.sprintInput.value && combos.sprints.length > 0) {
      this.sprintInput.value = combos.sprints[0];
    }
  }

  public setDates(start: string, end: string): void {
    this.startDateInput.value = start;
    this.endDateInput.value = end;
    this.emitConfigChange();
  }

  public getConfig(): AppConfig {
    return {
      url: this.urlInput.value.trim(),
      area: this.areaInput.value.trim(),
      sprint: this.sprintInput.value.trim(),
      token: this.tokenInput.value.trim(),
      startDate: this.startDateInput.value.trim(),
      endDate: this.endDateInput.value.trim(),
    };
  }

  public setProgress(progress: number, message = ''): void {
    const pct = Math.max(0, Math.min(100, Math.round(progress * 100)));
    this.progressFill.style.width = `${pct}%`;
    this.progressText.textContent = message ? `${message} (${pct}%)` : (pct > 0 ? `${pct}%` : 'Ready');
  }

  public setGenerating(isGenerating: boolean): void {
    this.generateBtn.disabled = isGenerating;
    this.generateBtn.textContent = isGenerating ? 'PROCESSING...' : 'GENERATE GRAPHICS';
  }

  public setCombosLoading(isLoading: boolean): void {
    this.loadCombosBtn.disabled = isLoading;
    this.loadCombosBtn.innerHTML = isLoading ? 'Loading...' : '<span>⟳</span> Load Combos';
  }

  public setDatesLoading(isLoading: boolean): void {
    this.loadDatesBtn.disabled = isLoading;
    this.loadDatesBtn.innerHTML = isLoading ? 'Loading...' : '<span>📅</span> Load Sprint Dates';
  }

  private emitConfigChange(): void {
    this.callbacks.onConfigChange(this.getConfig());
  }

  private setupListeners(): void {
    const inputs = [
      this.urlInput,
      this.areaInput,
      this.sprintInput,
      this.tokenInput,
      this.startDateInput,
      this.endDateInput,
    ];

    inputs.forEach((input) => {
      input.addEventListener('input', () => this.emitConfigChange());
    });

    const toggleTokenBtn = this.element.querySelector('#btn-toggle-token');
    toggleTokenBtn?.addEventListener('click', () => {
      const isPassword = this.tokenInput.type === 'password';
      this.tokenInput.type = isPassword ? 'text' : 'password';
      toggleTokenBtn.textContent = isPassword ? '🔒' : '👁';
    });

    this.loadCombosBtn.addEventListener('click', () => {
      this.callbacks.onLoadCombos();
    });

    this.loadDatesBtn.addEventListener('click', () => {
      this.callbacks.onLoadDates();
    });

    this.generateBtn.addEventListener('click', () => {
      this.callbacks.onGenerateGraphics();
    });

    const collapseBtn = this.element.querySelector('#btn-sidebar-collapse');
    collapseBtn?.addEventListener('click', () => {
      this.callbacks.onToggleCollapse?.();
    });
  }
}
