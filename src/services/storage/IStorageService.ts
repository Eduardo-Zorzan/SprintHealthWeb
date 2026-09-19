import { AppConfig, CombosCache, IterationsCache } from '../../types';

/**
 * Storage Service Product Interface (Refactoring Guru Factory Pattern)
 */
export interface IStorageService {
  loadConfig(): AppConfig;
  saveConfig(config: AppConfig): void;
  loadMembersCache(): string[];
  saveMembersCache(members: string[]): void;
  loadCombosCache(): CombosCache;
  saveCombosCache(cache: CombosCache): void;
  loadIterationsCache(): IterationsCache | null;
  saveIterationsCache(data: any): void;
  clearAll(): void;
}
