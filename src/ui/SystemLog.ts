export class SystemLog {
  private element: HTMLElement;
  private logContainer: HTMLElement;
  private lines: string[] = [];

  constructor(container: HTMLElement) {
    this.element = container;
    this.element.innerHTML = `
      <div class="system-log-wrapper">
        <div class="system-log-header">
          <div class="log-title">
            <span class="terminal-dot"></span>
            <span>SYSTEM LOG</span>
          </div>
          <div class="log-actions">
            <button id="btn-copy-log" class="btn-log-action" title="Copy Log">Copy</button>
            <button id="btn-clear-log" class="btn-log-action" title="Clear Log">Clear</button>
          </div>
        </div>
        <div id="log-output" class="log-output" role="log" aria-live="polite"></div>
      </div>
    `;

    this.logContainer = this.element.querySelector('#log-output') as HTMLElement;
    this.setupListeners();
  }

  private setupListeners(): void {
    const copyBtn = this.element.querySelector('#btn-copy-log');
    copyBtn?.addEventListener('click', () => {
      navigator.clipboard.writeText(this.lines.join('\n'));
      this.log('System log copied to clipboard.', 'info');
    });

    const clearBtn = this.element.querySelector('#btn-clear-log');
    clearBtn?.addEventListener('click', () => {
      this.clear();
    });
  }

  public log(message: string, type: 'info' | 'warn' | 'error' | 'success' = 'info'): void {
    const timestamp = new Date().toLocaleTimeString();
    const formatted = `[${timestamp}] ${message}`;
    this.lines.push(formatted);

    const lineEl = document.createElement('div');
    lineEl.className = `log-line log-${type}`;
    lineEl.textContent = formatted;

    this.logContainer.appendChild(lineEl);
    this.logContainer.scrollTop = this.logContainer.scrollHeight;

    // Also forward to browser console
    if (type === 'error') console.error(message);
    else if (type === 'warn') console.warn(message);
    else console.log(message);
  }

  public clear(): void {
    this.lines = [];
    this.logContainer.innerHTML = '';
  }
}
