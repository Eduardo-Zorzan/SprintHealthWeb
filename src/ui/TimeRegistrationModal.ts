import { DailyWorkEntry, TaskWorkItemSummary } from '../types';

export class TimeRegistrationModal {
  private overlay: HTMLElement | null = null;
  private currentPerson = '';
  private currentDate = '';
  private currentEntry: DailyWorkEntry | null = null;

  constructor() {
    this.createDom();
    this.bindGlobalEvents();
  }

  private createDom(): void {
    const existing = document.getElementById('time-reg-modal-backdrop');
    if (existing) {
      existing.remove();
    }

    const backdrop = document.createElement('div');
    backdrop.id = 'time-reg-modal-backdrop';
    backdrop.className = 'modal-backdrop hidden';
    backdrop.innerHTML = `
      <div class="modal-dialog modal-lg" role="dialog" aria-modal="true">
        <div class="modal-header">
          <div class="modal-header-left" id="modal-header-left">
            <h3 id="modal-title" class="modal-title">Apontamentos</h3>
          </div>
          <div class="modal-header-right">
            <span id="modal-date-badge" class="modal-date-badge"></span>
            <button type="button" id="modal-btn-close" class="modal-close-btn" aria-label="Fechar modal">✕</button>
          </div>
        </div>
        <div class="modal-body" id="modal-body-container">
          <!-- Dynamically swapped between Daily Tasks and Task History -->
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    this.overlay = backdrop;

    const closeBtn = backdrop.querySelector('#modal-btn-close');
    closeBtn?.addEventListener('click', () => this.close());

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        this.close();
      }
    });
  }

  private bindGlobalEvents(): void {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        this.close();
      }
    });
  }

  public isOpen(): boolean {
    return Boolean(this.overlay && !this.overlay.classList.contains('hidden'));
  }

  public open(person: string, date: string, entry: DailyWorkEntry): void {
    this.currentPerson = person;
    this.currentDate = date;
    this.currentEntry = entry;

    if (this.overlay) {
      // Ensure the modal overlay is mounted inside the active fullscreen container if any, or document.body
      const activeFullscreen = document.fullscreenElement as HTMLElement | null;
      const targetParent = activeFullscreen || document.body;
      if (this.overlay.parentElement !== targetParent) {
        targetParent.appendChild(this.overlay);
      }

      this.renderDailyTasksView();
      this.overlay.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    }
  }

  public close(): void {
    if (this.overlay) {
      this.overlay.classList.add('hidden');
      document.body.style.overflow = '';
      if (this.overlay.parentElement !== document.body) {
        document.body.appendChild(this.overlay);
      }
    }
  }

  /**
   * Level 1 View: Tasks worked on by the member on the selected date
   */
  private renderDailyTasksView(): void {
    if (!this.overlay || !this.currentEntry) return;

    const headerLeft = this.overlay.querySelector('#modal-header-left') as HTMLElement;
    const dateBadge = this.overlay.querySelector('#modal-date-badge') as HTMLElement;
    const bodyContainer = this.overlay.querySelector('#modal-body-container') as HTMLElement;

    headerLeft.innerHTML = `<h3 class="modal-title">${this.escapeHtml(this.currentPerson)}</h3>`;
    dateBadge.textContent = this.currentDate;

    const tasks = this.currentEntry.tasks || [];

    if (tasks.length === 0) {
      bodyContainer.innerHTML = `
        <div class="modal-empty-state">
          <p>Nenhum detalhe de tarefa disponível para <strong>${this.escapeHtml(this.currentPerson)}</strong> em <strong>${this.currentDate}</strong>.</p>
          <div class="modal-summary-totals">
            <span>Total Comp. Added: <strong>${this.currentEntry.completed.toFixed(2)}h</strong></span>
            <span>Total Rem. Decr.: <strong>${this.currentEntry.remainingDec.toFixed(2)}h</strong></span>
          </div>
        </div>
      `;
      return;
    }

    // Find max value for proportional mini-bars
    let maxVal = 1;
    for (const t of tasks) {
      const absComp = Math.abs(t.completedAdded);
      const absRem = Math.abs(t.remainingDecreased);
      if (absComp > maxVal) maxVal = absComp;
      if (absRem > maxVal) maxVal = absRem;
    }

    let tasksHtml = '';
    for (const task of tasks) {
      const compPct = task.completedAdded !== 0
        ? Math.max(Math.min((Math.abs(task.completedAdded) / maxVal) * 100, 100), 2)
        : 0;
      const remPct = task.remainingDecreased !== 0
        ? Math.max(Math.min((Math.abs(task.remainingDecreased) / maxVal) * 100, 100), 2)
        : 0;

      const compBarClass = task.completedAdded < 0 ? 'bar-comp-neg' : 'bar-comp';
      const compTextClass = task.completedAdded < 0 ? 'comp-text-neg' : 'comp-text';

      const remBarClass = task.remainingDecreased < 0 ? 'bar-rem-inc' : 'bar-rem';
      const remTextClass = task.remainingDecreased < 0 ? 'rem-text-inc' : 'rem-text';

      tasksHtml += `
        <div class="task-drill-card" data-task-id="${this.escapeHtml(task.taskId)}">
          <div class="task-drill-header">
            <div class="task-title-group">
              <span class="task-id-tag">#${this.escapeHtml(task.taskId)}</span>
              <a href="${this.escapeHtml(task.url || '#')}" target="_blank" rel="noopener noreferrer" class="task-clickable-title" title="Abrir tarefa no Azure DevOps">
                ${this.escapeHtml(task.title)}
                <span class="external-icon">↗</span>
              </a>
            </div>
          </div>

          <div class="task-drill-bars">
            <!-- Comp. Added bar -->
            <div class="drill-bar-row">
              <div class="drill-bar-track">
                <div class="drill-bar-fill ${compBarClass}" style="width: ${compPct}%"></div>
              </div>
              <span class="drill-bar-val ${compTextClass}">${task.completedAdded.toFixed(2)}h</span>
            </div>

            <!-- Rem. Decr. bar -->
            <div class="drill-bar-row">
              <div class="drill-bar-track">
                <div class="drill-bar-fill ${remBarClass}" style="width: ${remPct}%"></div>
              </div>
              <span class="drill-bar-val ${remTextClass}">${task.remainingDecreased.toFixed(2)}h</span>
            </div>
          </div>
        </div>
      `;
    }

    bodyContainer.innerHTML = `
      <div class="modal-tasks-list">
        ${tasksHtml}
      </div>

      <div class="modal-legend">
        <div class="legend-item">
          <span class="legend-box comp-bg"></span>
          <span>Comp. Added</span>
        </div>
        <div class="legend-item">
          <span class="legend-box rem-bg"></span>
          <span>Rem. Decr.</span>
        </div>
      </div>
    `;

    const cards = bodyContainer.querySelectorAll('.task-drill-card');
    cards.forEach((card) => {
      card.addEventListener('click', (e) => {
        // If clicked directly on the external devops link, let browser open link
        if ((e.target as HTMLElement).closest('.task-clickable-title')) {
          return;
        }
        const taskId = (card as HTMLElement).dataset.taskId;
        const selectedTask = tasks.find((t) => t.taskId === taskId);
        if (selectedTask) {
          this.renderTaskHistoryView(selectedTask);
        }
      });
    });
  }

  /**
   * Level 2 View: Chronological update history for a specific task (day iterations only)
   */
  private renderTaskHistoryView(task: TaskWorkItemSummary): void {
    if (!this.overlay) return;

    const headerLeft = this.overlay.querySelector('#modal-header-left') as HTMLElement;
    const dateBadge = this.overlay.querySelector('#modal-date-badge') as HTMLElement;
    const bodyContainer = this.overlay.querySelector('#modal-body-container') as HTMLElement;

    headerLeft.innerHTML = `
      <button type="button" id="modal-btn-back" class="btn-back-nav">
        ← Voltar
      </button>
      <div class="task-subnav-title">
        <span class="task-id-tag">#${this.escapeHtml(task.taskId)}</span>
        <a href="${this.escapeHtml(task.url || '#')}" target="_blank" rel="noopener noreferrer" class="task-clickable-title" title="Abrir tarefa no Azure DevOps">
          ${this.escapeHtml(task.title)}
          <span class="external-icon">↗</span>
        </a>
      </div>
    `;
    dateBadge.textContent = this.currentDate;

    const backBtn = this.overlay.querySelector('#modal-btn-back');
    backBtn?.addEventListener('click', () => {
      this.renderDailyTasksView();
    });

    const updates = (task.dayUpdates && task.dayUpdates.length > 0)
      ? task.dayUpdates
      : (task.allSprintUpdates || []).filter((u) => u.displayDateTime.includes(this.currentDate));

    // Filter out iterations where neither completed nor remaining work changed
    const meaningfulUpdates = updates.filter((u) => {
      const hasComp = Boolean(u.completedWork && u.completedWork.diff !== 0);
      const hasRem = Boolean(u.remainingWork && u.remainingWork.decr !== 0);
      return hasComp || hasRem;
    });

    if (meaningfulUpdates.length === 0) {
      bodyContainer.innerHTML = `
        <div class="modal-empty-state">
          <p>Nenhum apontamento registrado para esta tarefa em <strong>${this.escapeHtml(this.currentDate)}</strong>.</p>
        </div>
      `;
      return;
    }

    let updatesHtml = '';
    for (const up of meaningfulUpdates) {
      const isCurrentDay = up.displayDateTime.includes(this.currentDate);

      const hasCompChange = Boolean(up.completedWork && up.completedWork.diff !== 0);
      const hasRemChange = Boolean(up.remainingWork && up.remainingWork.decr !== 0);

      let compBlock = '';
      if (hasCompChange && up.completedWork) {
        const comp = up.completedWork;
        let diffBadge = '';
        if (comp.diff > 0) {
          diffBadge = `<span class="diff-badge comp-diff">+${comp.diff.toFixed(2)}h</span>`;
        } else if (comp.diff < 0) {
          diffBadge = `<span class="diff-badge comp-diff-neg">${comp.diff.toFixed(2)}h</span>`;
        }
        compBlock = `
          <div class="metric-change-row">
            <span class="field-label">Completed Work</span>
            <div class="change-badges">
              <span class="val-badge new-badge comp-val">${comp.newValue.toFixed(2)}</span>
              <span class="val-badge old-badge">${comp.oldValue.toFixed(2)}</span>
              ${diffBadge}
            </div>
          </div>
        `;
      }

      let remBlock = '';
      if (hasRemChange && up.remainingWork) {
        const rem = up.remainingWork;
        let remBadge = '';
        if (rem.decr > 0) {
          remBadge = `<span class="diff-badge rem-diff">-${rem.decr.toFixed(2)}h</span>`;
        } else if (rem.decr < 0) {
          const incVal = Math.abs(rem.decr);
          remBadge = `<span class="diff-badge rem-diff-inc">+${incVal.toFixed(2)}h</span>`;
        }
        remBlock = `
          <div class="metric-change-row">
            <span class="field-label">Remaining Work</span>
            <div class="change-badges">
              <span class="val-badge new-badge rem-val">${rem.newValue.toFixed(2)}</span>
              <span class="val-badge old-badge">${rem.oldValue.toFixed(2)}</span>
              ${remBadge}
            </div>
          </div>
        `;
      }

      updatesHtml += `
        <div class="history-entry-card ${isCurrentDay ? 'highlight-entry' : ''}">
          <div class="history-entry-metrics">
            ${compBlock}
            ${remBlock}
          </div>
          <div class="history-entry-meta">
            <span class="history-timestamp">${this.escapeHtml(up.displayDateTime)}</span>
            ${up.changedBy ? `<span class="history-author">por ${this.escapeHtml(up.changedBy)}</span>` : ''}
          </div>
        </div>
      `;
    }

    bodyContainer.innerHTML = `
      <div class="history-timeline-container">
        ${updatesHtml}
      </div>
    `;
  }

  private escapeHtml(str: string): string {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
