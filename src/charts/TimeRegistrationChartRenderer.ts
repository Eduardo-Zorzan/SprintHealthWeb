import { Chart, registerables } from 'chart.js';
import { DailyWorkEntry, WorkHistoryData } from '../types';
import { parseBrDate } from '../utils/date';
import { IChartRenderer } from './IChartRenderer';

Chart.register(...registerables);

const COMPLETED_COLOR = '#2ecc71';
const REMAINING_DEC_COLOR = '#3498db';
const BACKGROUND_COLOR = '#111417';
const CARD_BG = '#1e1e1e';
const AXIS_COLOR = '#aaa';
const GRID_COLOR = '#33383d';

export class TimeRegistrationChartRenderer implements IChartRenderer {
  private charts: Chart[] = [];
  public onBarClick?: (person: string, date: string, entry: DailyWorkEntry) => void;

  render(container: HTMLElement, data: WorkHistoryData): void {
    this.destroy();
    container.innerHTML = '';

    const people = Object.keys(data).sort();
    if (people.length === 0) {
      container.innerHTML = '<div class="empty-state">No work history data found for the selected team members.</div>';
      return;
    }

    // Grid container for multi-person display
    const grid = document.createElement('div');
    grid.className = 'time-reg-grid';
    container.appendChild(grid);

    for (const person of people) {
      const daily = data[person];
      const dates = Object.keys(daily).sort((a, b) => {
        try {
          return parseBrDate(a).getTime() - parseBrDate(b).getTime();
        } catch {
          return a.localeCompare(b);
        }
      });
      const compValues = dates.map((d) => daily[d].completed);
      const remValues = dates.map((d) => daily[d].remainingDec);

      const card = document.createElement('div');
      card.className = 'time-reg-card';

      const title = document.createElement('h3');
      title.className = 'time-reg-title';
      title.textContent = `Sprint Health: ${person}`;
      card.appendChild(title);

      const canvasWrapper = document.createElement('div');
      canvasWrapper.className = 'time-reg-canvas-wrapper';
      canvasWrapper.style.position = 'relative';
      canvasWrapper.style.height = '280px';

      const canvas = document.createElement('canvas');
      canvasWrapper.appendChild(canvas);
      card.appendChild(canvasWrapper);
      grid.appendChild(card);

      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      const chart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: dates.map((d) => d.slice(0, 5)), // format DD/MM
          datasets: [
            {
              label: 'Comp. Added',
              data: compValues,
              backgroundColor: COMPLETED_COLOR,
              borderRadius: 4,
              categoryPercentage: 0.8,
              barPercentage: 0.9,
            },
            {
              label: 'Rem. Decr.',
              data: remValues,
              backgroundColor: REMAINING_DEC_COLOR,
              borderRadius: 4,
              categoryPercentage: 0.8,
              barPercentage: 0.9,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          onClick: (_event, elements) => {
            if (elements && elements.length > 0) {
              const elementIndex = elements[0].index;
              const dateStr = dates[elementIndex];
              const entry = daily[dateStr];
              if (dateStr && entry) {
                this.onBarClick?.(person, dateStr, entry);
              }
            }
          },
          onHover: (event, elements) => {
            const target = event.native?.target as HTMLElement | undefined;
            if (target) {
              target.style.cursor = elements && elements.length > 0 ? 'pointer' : 'default';
            }
          },
          plugins: {
            legend: {
              position: 'top',
              align: 'end',
              labels: {
                color: '#d0d0d0',
                boxWidth: 12,
                font: { size: 11 },
              },
            },
            tooltip: {
              backgroundColor: 'rgba(20, 24, 28, 0.95)',
              padding: 10,
              callbacks: {
                label: (ctx) => {
                  const val = ctx.parsed.y;
                  return `${ctx.dataset.label}: ${val !== null && val !== undefined ? Number(val.toFixed(2)) + ' h' : '0 h'}`;
                },
                afterBody: () => '\n(Clique para ver tarefas e apontamentos)',
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: AXIS_COLOR, font: { size: 10 } },
            },
            y: {
              beginAtZero: true,
              grid: { color: GRID_COLOR },
              ticks: {
                color: AXIS_COLOR,
                font: { size: 10 },
                callback: (val) => `${val}h`,
              },
            },
          },
        },
      });

      this.charts.push(chart);
    }
  }

  destroy(): void {
    for (const chart of this.charts) {
      chart.destroy();
    }
    this.charts = [];
  }

  async exportImage(): Promise<string> {
    if (this.charts.length === 0) return '';
    // Combine all chart canvases into a 2-column image similar to matplotlib plot_all_graphs
    const nCols = Math.min(this.charts.length, 2);
    const nRows = Math.ceil(this.charts.length / nCols);
    const cardWidth = 600;
    const cardHeight = 350;
    const padding = 20;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = nCols * cardWidth + (nCols + 1) * padding;
    exportCanvas.height = nRows * cardHeight + (nRows + 1) * padding;

    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return '';

    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    for (let i = 0; i < this.charts.length; i++) {
      const col = i % nCols;
      const row = Math.floor(i / nCols);
      const x = padding + col * (cardWidth + padding);
      const y = padding + row * (cardHeight + padding);

      // Card background
      ctx.fillStyle = CARD_BG;
      ctx.roundRect(x, y, cardWidth, cardHeight, 8);
      ctx.fill();

      // Card content
      const canvas = this.charts[i].canvas;
      if (canvas) {
        ctx.drawImage(canvas, x + 10, y + 40, cardWidth - 20, cardHeight - 50);
      }
    }

    return exportCanvas.toDataURL('image/png');
  }
}
