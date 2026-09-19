import { Chart, registerables } from 'chart.js';
import { BurndownData } from '../types';
import { IChartRenderer } from './IChartRenderer';

Chart.register(...registerables);

const BACKGROUND_COLOR = '#111417';
const REMAINING_COLOR = '#4db4ff';
const REMAINING_FILL = 'rgba(77, 180, 255, 0.4)';
const CAPACITY_COLOR = '#a8e063';
const IDEAL_COLOR = '#a8a18f';
const GRID_COLOR = '#33383d';
const AXIS_COLOR = '#aaa';

export class BurndownChartRenderer implements IChartRenderer {
  private chart: Chart | null = null;
  private canvas: HTMLCanvasElement | null = null;

  render(container: HTMLElement, data: BurndownData): void {
    this.destroy();
    container.innerHTML = '';

    // Summary banner
    const summary = data.summary;
    const formatH = (val: number) => (val !== undefined && val !== null && !isNaN(val) ? `${Number(val.toFixed(2))}h` : '0h');
    const formatPct = (val: number) => (val !== undefined && val !== null && !isNaN(val) ? `${Number(val.toFixed(1))}%` : '0%');
    const formatRate = (val: number) => (val !== undefined && val !== null && !isNaN(val) ? `${Number(val.toFixed(2))}h/d` : '0h/d');

    const banner = document.createElement('div');
    banner.className = 'burndown-banner';
    banner.innerHTML = `
      <div class="banner-dates">${summary.startDate} — ${summary.endDate}</div>
      <div class="banner-metrics">
        <div class="metric-chip">
          <span class="metric-val">${formatH(summary.remainingWork)}</span>
          <span class="metric-lbl">Remaining Work</span>
        </div>
        <div class="metric-chip">
          <span class="metric-val">${formatH(summary.totalCapacity)}</span>
          <span class="metric-lbl">Total Capacity</span>
        </div>
        <div class="metric-chip">
          <span class="metric-val">${formatPct(summary.completedPercent)}</span>
          <span class="metric-lbl">Completed</span>
        </div>
        <div class="metric-chip">
          <span class="metric-val">${formatRate(summary.averageBurndown)}</span>
          <span class="metric-lbl">Avg Burndown</span>
        </div>
      </div>
    `;
    container.appendChild(banner);

    // Canvas container
    const chartWrapper = document.createElement('div');
    chartWrapper.className = 'chart-canvas-wrapper';
    chartWrapper.style.position = 'relative';
    chartWrapper.style.width = '100%';
    chartWrapper.style.height = '500px';

    this.canvas = document.createElement('canvas');
    chartWrapper.appendChild(this.canvas);
    container.appendChild(chartWrapper);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.dates,
        datasets: [
          {
            label: 'Remaining',
            data: data.actualRemaining,
            borderColor: REMAINING_COLOR,
            backgroundColor: REMAINING_FILL,
            fill: true,
            tension: 0.1,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: REMAINING_COLOR,
            spanGaps: false,
          },
          {
            label: 'Remaining Capacity',
            data: data.remainingCapacity,
            borderColor: CAPACITY_COLOR,
            borderDash: [6, 4],
            fill: false,
            tension: 0,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: CAPACITY_COLOR,
          },
          {
            label: 'Ideal Trend',
            data: data.idealTrend,
            borderColor: IDEAL_COLOR,
            borderDash: [2, 2],
            fill: false,
            tension: 0,
            pointRadius: 2,
            pointHoverRadius: 4,
            pointBackgroundColor: IDEAL_COLOR,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#d0d0d0',
              font: { family: 'inherit', size: 12, weight: 'bold' },
              padding: 20,
              boxWidth: 16,
            },
          },
          tooltip: {
            backgroundColor: 'rgba(20, 24, 28, 0.95)',
            titleColor: '#ffffff',
            bodyColor: '#e0e0e0',
            borderColor: '#444c56',
            borderWidth: 1,
            padding: 12,
            callbacks: {
              label: (context) => {
                const val = context.parsed.y;
                return `${context.dataset.label}: ${val !== null && val !== undefined ? val.toFixed(2) + ' h' : 'No data'}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: {
              display: false,
            },
            ticks: {
              color: AXIS_COLOR,
              font: { size: 11 },
            },
          },
          y: {
            beginAtZero: true,
            grid: {
              color: GRID_COLOR,
            },
            ticks: {
              color: AXIS_COLOR,
              font: { size: 11 },
              callback: (val) => `${val} h`,
            },
          },
        },
      },
    });
  }

  destroy(): void {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
    this.canvas = null;
  }

  async exportImage(): Promise<string> {
    if (!this.canvas) return '';
    // Draw background before export so exported PNG has solid dark background
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = this.canvas.width;
    exportCanvas.height = this.canvas.height;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return this.canvas.toDataURL('image/png');

    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    ctx.drawImage(this.canvas, 0, 0);
    return exportCanvas.toDataURL('image/png');
  }
}
