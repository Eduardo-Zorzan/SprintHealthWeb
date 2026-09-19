/**
 * Chart Renderer Product Interface (Refactoring Guru Factory Method Pattern)
 * Defines the contract that all concrete chart visualizers must implement.
 */
export interface IChartRenderer {
  render(container: HTMLElement, data: any): void;
  destroy(): void;
  exportImage(): Promise<string>;
}
