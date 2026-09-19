import { GraphicType } from '../types';
import { BurndownChartRenderer } from './BurndownChartRenderer';
import { IChartRenderer } from './IChartRenderer';
import { TimeRegistrationChartRenderer } from './TimeRegistrationChartRenderer';

/**
 * ChartRendererFactory Creator (Refactoring Guru Factory Method Pattern)
 * Instantiates the appropriate IChartRenderer product based on GraphicType.
 */
export class ChartRendererFactory {
  public static createRenderer(type: GraphicType): IChartRenderer {
    switch (type) {
      case GraphicType.Burndown:
        return new BurndownChartRenderer();
      case GraphicType.TimesRegistering:
        return new TimeRegistrationChartRenderer();
      default:
        throw new Error(`Unsupported graphic type: ${type}`);
    }
  }
}
