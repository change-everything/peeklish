import { browser } from 'wxt/browser';
import { DEFAULT_SETTINGS, type Settings, type TranslationEngine } from '../shared/types';

const KEY = 'settings';
const PREFER_REAL_API = 'preferRealApi';
const BUILTIN_DEFAULT = 'builtinDefault';

function clampBudget(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS.maxAutoCharsPerPage;
  return Math.min(100000, Math.max(2000, Math.round(value)));
}

function normalize(value: Partial<Settings>): Settings {
  const level = value.assistanceLevel;
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    schemaVersion: 1,
    assistanceLevel: level === 'light' || level === 'strong' || level === 'medium' ? level : 'medium',
    keyPersistence: value.keyPersistence === 'local' ? 'local' : 'session',
    maxAutoCharsPerPage: clampBudget(value.maxAutoCharsPerPage ?? DEFAULT_SETTINGS.maxAutoCharsPerPage),
    engine: value.engine === 'api' ? 'api' : 'chrome',
  };
}

export function migrateStoredSettings(stored: Partial<Settings> | undefined, builtinDefault: boolean): Settings {
  const settings = normalize(stored ?? {});
  if (builtinDefault) return settings;
  if (!settings.apiBaseUrl) settings.engine = 'chrome';
  else if (stored?.engine !== 'chrome') settings.engine = 'api';
  return settings;
}

export function consentWhenEnabling(engine: TranslationEngine, existing: number | null | undefined): number | null {
  if (engine !== 'api') return existing ?? null;
  return existing ?? Date.now();
}

export async function getSettings(): Promise<Settings> {
  const data = await browser.storage.local.get([KEY, PREFER_REAL_API, BUILTIN_DEFAULT]);
  const stored = data[KEY];
  const value = stored && typeof stored === 'object' ? (stored as Partial<Settings>) : undefined;
  const settings = migrateStoredSettings(value, data[BUILTIN_DEFAULT] === true);
  const patch: Record<string, unknown> = {};
  if (data[BUILTIN_DEFAULT] !== true) {
    patch[BUILTIN_DEFAULT] = true;
    patch[KEY] = settings;
  }
  if (data[PREFER_REAL_API] !== true) {
    patch[PREFER_REAL_API] = true;
    patch[KEY] = settings;
  }
  if (Object.keys(patch).length) await browser.storage.local.set(patch);
  return settings;
}

export async function saveSettings(next: Settings): Promise<void> {
  const clean: Settings = {
    schemaVersion: 1,
    apiBaseUrl: next.apiBaseUrl.trim(),
    modelId: next.modelId.trim(),
    keyPersistence: next.keyPersistence === 'local' ? 'local' : 'session',
    assistanceLevel: next.assistanceLevel,
    autoMarkEnabled: Boolean(next.autoMarkEnabled),
    hoverEnabled: Boolean(next.hoverEnabled),
    selectionTranslateEnabled: Boolean(next.selectionTranslateEnabled),
    maxAutoCharsPerPage: clampBudget(next.maxAutoCharsPerPage),
    engine: next.engine === 'api' ? 'api' : 'chrome',
  };
  await browser.storage.local.set({ [KEY]: clean });
}
