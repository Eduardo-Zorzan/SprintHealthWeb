import { ChartRendererFactory } from '../charts/ChartRendererFactory';
import { IChartRenderer } from '../charts/IChartRenderer';
import { TimeRegistrationChartRenderer } from '../charts/TimeRegistrationChartRenderer';
import { GraphicType } from '../types';
import { TimeRegistrationModal } from './TimeRegistrationModal';

export interface SprintHealthTabCallbacks {
  onSyncMembers: () => Promise<void>;
  onGraphicTypeChange: (type: GraphicType) => void;
}

export class SprintHealthTab {
  private element: HTMLElement;
  private callbacks: SprintHealthTabCallbacks;

  // DOM elements
  private graphicTypeSelect!: HTMLSelectElement;
  private selectAllCheckbox!: HTMLInputElement;
  private membersListContainer!: HTMLElement;
  private syncBtn!: HTMLButtonElement;
  private chartStage!: HTMLElement;
  private chartTitle!: HTMLElement;
  private viewerPane!: HTMLElement;
  private maximizeBtn!: HTMLButtonElement;

  // State
  private activeRenderer: IChartRenderer | null = null;
  private members: string[] = [];
  private selectedMembers: Set<string> = new Set();
  private timeModal = new TimeRegistrationModal();
  private isMaximized = false;

  constructor(container: HTMLElement, callbacks: SprintHealthTabCallbacks) {
    this.element = container;
    this.callbacks = callbacks;
    this.render();
    this.bindElements();
    this.setupListeners();
  }

  private render(): void {
    this.element.innerHTML = `
      <div class="tab-layout">
        <!-- Controls Sidebar within Tab -->
        <div class="tab-controls-pane">
          <!-- Graphic Type -->
          <div class="control-box">
            <label class="section-title">GRAPHIC TYPE</label>
            <select id="sel-graphic-type" class="form-control select-control">
              <option value="${GraphicType.Burndown}">Burndown</option>
              <option value="${GraphicType.TimesRegistering}">Times Registering</option>
            </select>
          </div>

          <!-- Team Members Selection -->
          <div class="control-box flex-grow">
            <div class="members-header">
              <label class="section-title">TEAM MEMBERS SELECTION</label>
              <label class="checkbox-label select-all-label">
                <input type="checkbox" id="cb-select-all" />
                <span>Select All</span>
              </label>
            </div>

            <div id="members-scroll-list" class="members-scroll-list">
              <div class="empty-hint">No members loaded. Click "Sync Team From DevOps" or "Load Combos".</div>
            </div>

            <button type="button" id="btn-sync-members" class="btn btn-secondary w-full mt-2">
              ↻ SYNC TEAM FROM DEVOPS
            </button>
          </div>
        </div>

        <!-- Viewer Pane -->
        <div class="tab-viewer-pane" id="tab-viewer-pane">
          <div class="viewer-toolbar">
            <div class="viewer-title-group">
              <h3 id="chart-display-title">Sprint Health Chart</h3>
              <span id="chart-status-pill" class="status-pill">Ready</span>
            </div>
            <div class="viewer-actions">
              <button type="button" id="btn-maximize-chart" class="btn-chart-action" title="Maximizar gráfico" aria-label="Maximizar gráfico">
                <svg class="icon-maximize" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                </svg>
                <svg class="icon-minimize" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: none;">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
                </svg>
                <span class="btn-action-text">Maximizar</span>
              </button>
            </div>
          </div>

          <div id="chart-stage" class="chart-stage">
            <div class="chart-empty-state">
              <h4>No Chart Generated Yet</h4>
              <p>Configure your sprint parameters on the left and click <strong>GENERATE GRAPHICS</strong> to display burndown or time registration analytics.</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private bindElements(): void {
    this.graphicTypeSelect = this.element.querySelector('#sel-graphic-type') as HTMLSelectElement;
    this.selectAllCheckbox = this.element.querySelector('#cb-select-all') as HTMLInputElement;
    this.membersListContainer = this.element.querySelector('#members-scroll-list') as HTMLElement;
    this.syncBtn = this.element.querySelector('#btn-sync-members') as HTMLButtonElement;
    this.chartStage = this.element.querySelector('#chart-stage') as HTMLElement;
    this.chartTitle = this.element.querySelector('#chart-display-title') as HTMLElement;
    this.viewerPane = this.element.querySelector('#tab-viewer-pane') as HTMLElement;
    this.maximizeBtn = this.element.querySelector('#btn-maximize-chart') as HTMLButtonElement;
  }

  public getSelectedGraphicType(): GraphicType {
    return this.graphicTypeSelect.value as GraphicType;
  }

  public getSelectedMembers(): string[] {
    return Array.from(this.selectedMembers);
  }

  public setMembers(members: string[], initialSelection?: string[]): void {
    this.members = members;
    this.selectedMembers = new Set(initialSelection && initialSelection.length > 0 ? initialSelection : members);
    this.renderMembersList();
  }

  private renderMembersList(): void {
    this.membersListContainer.innerHTML = '';
    if (this.members.length === 0) {
      this.membersListContainer.innerHTML = '<div class="empty-hint">No members available.</div>';
      this.selectAllCheckbox.checked = false;
      return;
    }

    for (const member of this.members) {
      const row = document.createElement('label');
      row.className = 'checkbox-label member-row';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = member;
      cb.checked = this.selectedMembers.has(member);

      cb.addEventListener('change', () => {
        if (cb.checked) {
          this.selectedMembers.add(member);
        } else {
          this.selectedMembers.delete(member);
        }
        this.updateSelectAllState();
      });

      const span = document.createElement('span');
      span.textContent = member;

      row.appendChild(cb);
      row.appendChild(span);
      this.membersListContainer.appendChild(row);
    }

    this.updateSelectAllState();
  }

  private updateSelectAllState(): void {
    if (this.members.length === 0) {
      this.selectAllCheckbox.checked = false;
      return;
    }
    this.selectAllCheckbox.checked = this.selectedMembers.size === this.members.length;
  }

  public setSyncing(isSyncing: boolean): void {
    this.syncBtn.disabled = isSyncing;
    this.syncBtn.textContent = isSyncing ? 'Syncing...' : '↻ SYNC TEAM FROM DEVOPS';
  }

  public renderChart(type: GraphicType, data: any): void {
    this.chartTitle.textContent = type === GraphicType.Burndown ? 'Sprint Burndown Chart' : 'Times Registering Analysis';
    
    // Create new renderer via ChartRendererFactory (Refactoring Guru Factory Method)
    if (this.activeRenderer) {
      this.activeRenderer.destroy();
    }
    this.activeRenderer = ChartRendererFactory.createRenderer(type);

    if (type === GraphicType.TimesRegistering && this.activeRenderer instanceof TimeRegistrationChartRenderer) {
      this.activeRenderer.onBarClick = (person, date, entry) => {
        this.timeModal.open(person, date, entry);
      };
    }

    this.activeRenderer.render(this.chartStage, data);

    const statusPill = this.element.querySelector('#chart-status-pill') as HTMLElement;
    if (statusPill) {
      statusPill.textContent = 'Rendered';
      statusPill.className = 'status-pill status-success';
    }
  }

  private setupListeners(): void {
    this.graphicTypeSelect.addEventListener('change', () => {
      this.callbacks.onGraphicTypeChange(this.getSelectedGraphicType());
    });

    this.selectAllCheckbox.addEventListener('change', () => {
      const checked = this.selectAllCheckbox.checked;
      if (checked) {
        this.selectedMembers = new Set(this.members);
      } else {
        this.selectedMembers.clear();
      }
      const cbs = this.membersListContainer.querySelectorAll('input[type="checkbox"]');
      cbs.forEach((cb) => ((cb as HTMLInputElement).checked = checked));
    });

    this.syncBtn.addEventListener('click', () => {
      this.callbacks.onSyncMembers();
    });

    this.maximizeBtn.addEventListener('click', () => {
      this.toggleMaximize();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.timeModal.isOpen()) {
          return;
        }
        if (this.isMaximized) {
          this.setMaximized(false);
        }
      }
    });

    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && this.isMaximized) {
        this.setMaximized(false);
      }
    });
  }

  public toggleMaximize(): void {
    this.setMaximized(!this.isMaximized);
  }

  public setMaximized(maximized: boolean): void {
    if (this.isMaximized === maximized) return;
    this.isMaximized = maximized;

    const iconMaximize = this.maximizeBtn.querySelector('.icon-maximize') as HTMLElement;
    const iconMinimize = this.maximizeBtn.querySelector('.icon-minimize') as HTMLElement;
    const actionText = this.maximizeBtn.querySelector('.btn-action-text') as HTMLElement;

    if (this.isMaximized) {
      this.viewerPane.classList.add('is-maximized');
      this.maximizeBtn.title = 'Restaurar gráfico (Esc)';
      this.maximizeBtn.setAttribute('aria-label', 'Restaurar gráfico');
      if (iconMaximize) iconMaximize.style.display = 'none';
      if (iconMinimize) iconMinimize.style.display = 'block';
      if (actionText) actionText.textContent = 'Restaurar';
    } else {
      this.viewerPane.classList.remove('is-maximized');
      this.maximizeBtn.title = 'Maximizar gráfico';
      this.maximizeBtn.setAttribute('aria-label', 'Maximizar gráfico');
      if (iconMaximize) iconMaximize.style.display = 'block';
      if (iconMinimize) iconMinimize.style.display = 'none';
      if (actionText) actionText.textContent = 'Maximizar';
    }

    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
    });
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 150);
  }
}
