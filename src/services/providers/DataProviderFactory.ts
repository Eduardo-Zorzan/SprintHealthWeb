import { AppConfig } from '../../types';
import { AzureDevOpsApiProvider } from './AzureDevOpsApiProvider';
import { DemoDataProvider, isDemoUrl } from './DemoDataProvider';
import { IDataProvider } from './IDataProvider';

/**
 * DataProviderFactory Creator (Refactoring Guru Factory Method Pattern)
 * Decides whether to instantiate DemoDataProvider or AzureDevOpsApiProvider.
 */
export class DataProviderFactory {
  /**
   * Factory method to create appropriate data provider instance.
   */
  public static createProvider(config: AppConfig): IDataProvider {
    if (isDemoUrl(config.url)) {
      return new DemoDataProvider();
    }
    return new AzureDevOpsApiProvider(config.url, config.token);
  }
}
