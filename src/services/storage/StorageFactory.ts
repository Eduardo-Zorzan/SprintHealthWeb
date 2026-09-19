import { IStorageService } from './IStorageService';
import { LocalStorageService } from './LocalStorageService';
import { InMemoryStorageService } from './InMemoryStorageService';

/**
 * StorageFactory Creator (Refactoring Guru Factory Method Pattern)
 */
export class StorageFactory {
  /**
   * Factory method to create appropriate storage service.
   * Auto-detects localStorage availability or falls back to InMemoryStorage.
   */
  public static createStorage(type?: 'local' | 'memory'): IStorageService {
    if (type === 'memory') {
      return new InMemoryStorageService();
    }

    try {
      const testKey = '__test_storage__';
      window.localStorage.setItem(testKey, testKey);
      window.localStorage.removeItem(testKey);
      return new LocalStorageService();
    } catch {
      console.warn('LocalStorage is not available, falling back to InMemoryStorage.');
      return new InMemoryStorageService();
    }
  }
}
