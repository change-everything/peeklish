import { browser } from 'wxt/browser';
import { DEFAULT_SETTINGS, type Settings } from '../shared/types';
import { listSites, saveSites } from './sites';

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

async function grantEnabledSiteConsent(): Promise<void> {
  const sites = await listSites();
  const now = Date.now();
  let changed = false;
  const next = sites.map((site) => {
    if (!site.enabled || site.aiTextConsentAt) return site;
    changed = true;
    return { ...site, aiTextConsentAt: now };
  });
  if (changed) await saveSites(next);
}

export async function getSettings(): Promise<Settings> {
  const data = await browser.storage.local.get([KEY, PREFER_REAL_API, BUILTIN_DEFAULT]);
  const stored = data[KEY];
  const value = stored && typeof stored === 'object' ? (stored as Partial<Settings>) : {};
  const settings = normalize(value);
  if (data[BUILTIN_DEFAULT] !== true) {
    if (!settings.apiBaseUrl) settings.engine = 'chrome';
    await browser.storage.local.set({ [BUILTIN_DEFAULT]: true, [KEY]: settings });
  }
  if (data[PREFER_REAL_API] !== true) {
    await browser.storage.local.set({ [PREFER_REAL_API]: true, [KEY]: settings });
    await grantEnabledSiteConsent();
  }
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
