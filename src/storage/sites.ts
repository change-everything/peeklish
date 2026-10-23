import { browser } from 'wxt/browser';
import type { SiteConfig } from '../shared/types';

const KEY = 'sites';

export async function listSites(): Promise<SiteConfig[]> {
  const data = await browser.storage.local.get(KEY);
  if (!Array.isArray(data[KEY])) return [];
  return data[KEY].filter((site): site is SiteConfig => {
    return Boolean(site && typeof site.origin === 'string' && typeof site.enabled === 'boolean');
  });
}

export async function getSite(origin: string): Promise<SiteConfig | null> {
  const sites = await listSites();
  return sites.find((site) => site.origin === origin) ?? null;
}

export async function saveSite(next: SiteConfig): Promise<void> {
  const sites = await listSites();
  const index = sites.findIndex((site) => site.origin === next.origin);
  if (index >= 0) sites[index] = next;
  else sites.push(next);
  await browser.storage.local.set({ [KEY]: sites });
}

export async function saveSites(sites: SiteConfig[]): Promise<void> {
  await browser.storage.local.set({ [KEY]: sites });
}
