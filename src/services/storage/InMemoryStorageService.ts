import { AppConfig, CombosCache, IterationsCache } from '../../types';
import { IStorageService } from './IStorageService';

export class InMemoryStorageService implements IStorageService {
  private config: AppConfig = {
    url: 'mock://sprint-health',
    area: 'SprintHealth\\Platform',
    sprint: 'SprintHealth\\Sprint 2026.15',
    token: '',
    startDate: '06/07/2026',
    endDate: '17/07/2026',
  };

  private members: string[] = [];
  private combos: CombosCache = { areas: [], sprints: [] };
  private iterations: IterationsCache | null = null;

  loadConfig(): AppConfig {
    return { ...this.config };
  }

  saveConfig(config: AppConfig): void {
    this.config = { ...config };
  }

  loadMembersCache(): string[] {
    return [...this.members];
  }

  saveMembersCache(members: string[]): void {
    this.members = [...members];
  }

  loadCombosCache(): CombosCache {
    return {
      areas: [...this.combos.areas],
      sprints: [...this.combos.sprints],
    };
  }

  saveCombosCache(cache: CombosCache): void {
    this.combos = {
      areas: [...cache.areas],
      sprints: [...cache.sprints],
    };
  }

  loadIterationsCache(): IterationsCache | null {
    return this.iterations ? JSON.parse(JSON.stringify(this.iterations)) : null;
  }

  saveIterationsCache(data: any): void {
    this.iterations = {
      timestamp: new Date().toISOString(),
      data: JSON.parse(JSON.stringify(data)),
    };
  }

  clearAll(): void {
    this.members = [];
    this.combos = { areas: [], sprints: [] };
    this.iterations = null;
  }
}
