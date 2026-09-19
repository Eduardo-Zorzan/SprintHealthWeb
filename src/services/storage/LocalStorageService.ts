import { AppConfig, CombosCache, IterationsCache } from '../../types';
import { IStorageService } from './IStorageService';

const CONFIG_KEY = 'sprint_health_config';
const MEMBERS_KEY = 'sprint_health_members';
const COMBOS_KEY = 'sprint_health_combos';
const ITERATIONS_KEY = 'sprint_health_iterations';

export class LocalStorageService implements IStorageService {
  private isAvailable(): boolean {
    try {
      const test = '__storage_test__';
      window.localStorage.setItem(test, test);
      window.localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  loadConfig(): AppConfig {
    const defaultConfig: AppConfig = {
      url: 'mock://sprint-health',
      area: 'SprintHealth\\Platform',
      sprint: 'SprintHealth\\Sprint 2026.15',
      token: '',
      startDate: '06/07/2026',
      endDate: '17/07/2026',
    };

    if (!this.isAvailable()) return defaultConfig;

    try {
      const raw = window.localStorage.getItem(CONFIG_KEY);
      if (!raw) return defaultConfig;
      const parsed = JSON.parse(raw);
      return {
        url: parsed.url ?? defaultConfig.url,
        area: parsed.area ?? defaultConfig.area,
        sprint: parsed.sprint ?? defaultConfig.sprint,
        token: parsed.token ?? '',
        startDate: parsed.startDate ?? parsed.start_date ?? defaultConfig.startDate,
        endDate: parsed.endDate ?? parsed.end_date ?? defaultConfig.endDate,
      };
    } catch (e) {
      console.warn('Failed to parse saved config from localStorage', e);
      return defaultConfig;
    }
  }

  saveConfig(config: AppConfig): void {
    if (!this.isAvailable()) return;
    try {
      window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch (e) {
      console.error('Failed to save config to localStorage', e);
    }
  }

  loadMembersCache(): string[] {
    if (!this.isAvailable()) return [];
    try {
      const raw = window.localStorage.getItem(MEMBERS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  saveMembersCache(members: string[]): void {
    if (!this.isAvailable()) return;
    try {
      window.localStorage.setItem(MEMBERS_KEY, JSON.stringify(members));
    } catch (e) {
      console.error('Failed to save members cache', e);
    }
  }

  loadCombosCache(): CombosCache {
    const defaultCombos: CombosCache = { areas: [], sprints: [] };
    if (!this.isAvailable()) return defaultCombos;
    try {
      const raw = window.localStorage.getItem(COMBOS_KEY);
      if (!raw) return defaultCombos;
      const parsed = JSON.parse(raw);
      return {
        areas: Array.isArray(parsed.areas) ? parsed.areas : [],
        sprints: Array.isArray(parsed.sprints) ? parsed.sprints : [],
      };
    } catch {
      return defaultCombos;
    }
  }

  saveCombosCache(cache: CombosCache): void {
    if (!this.isAvailable()) return;
    try {
      window.localStorage.setItem(COMBOS_KEY, JSON.stringify(cache));
    } catch (e) {
      console.error('Failed to save combos cache', e);
    }
  }

  loadIterationsCache(): IterationsCache | null {
    if (!this.isAvailable()) return null;
    try {
      const raw = window.localStorage.getItem(ITERATIONS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  saveIterationsCache(data: any): void {
    if (!this.isAvailable()) return;
    try {
      const cache: IterationsCache = {
        timestamp: new Date().toISOString(),
        data,
      };
      window.localStorage.setItem(ITERATIONS_KEY, JSON.stringify(cache));
    } catch (e) {
      console.error('Failed to save iterations cache', e);
    }
  }

  clearAll(): void {
    if (!this.isAvailable()) return;
    try {
      window.localStorage.removeItem(CONFIG_KEY);
      window.localStorage.removeItem(MEMBERS_KEY);
      window.localStorage.removeItem(COMBOS_KEY);
      window.localStorage.removeItem(ITERATIONS_KEY);
    } catch (e) {
      console.error('Failed to clear storage', e);
    }
  }
}
