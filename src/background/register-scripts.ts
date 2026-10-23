import { browser } from 'wxt/browser';
import { CONTENT_SCRIPT_FILE, CONTENT_STYLE_FILE } from '../shared/limits';
import { originMatchPattern, scriptIdForOrigin } from '../shared/api-url';
import { listSites, saveSites } from '../storage/sites';

let registrationTail: Promise<void> = Promise.resolve();

export function syncRegisteredScripts(): Promise<void> {
  const run = registrationTail.then(registerEnabledOrigins);
  registrationTail = run.catch(() => undefined);
  return run;
}

async function registerEnabledOrigins(): Promise<void> {
  const enabled = (await listSites()).filter((site) => site.enabled);
  const existing = await browser.scripting.getRegisteredContentScripts();
  const ours = existing.filter((script) => script.id.startsWith('peeklish_')).map((script) => script.id);
  if (ours.length) await browser.scripting.unregisterContentScripts({ ids: ours });
  for (const site of enabled) {
    try {
      await browser.scripting.registerContentScripts([
        {
          id: scriptIdForOrigin(site.origin),
          js: [CONTENT_SCRIPT_FILE],
          css: [CONTENT_STYLE_FILE],
          matches: [originMatchPattern(site.origin)],
          runAt: 'document_idle',
          persistAcrossSessions: true,
        },
      ]);
    } catch {
      // The site permission may have been removed. Enabling from the popup asks again.
    }
  }
}

export async function injectContentScript(tabId: number): Promise<void> {
  await browser.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT_FILE] });
  await browser.scripting.insertCSS({ target: { tabId }, files: [CONTENT_STYLE_FILE] }).catch(() => undefined);
}

export async function injectEnabledTabs(): Promise<void> {
  const enabled = (await listSites()).filter((site) => site.enabled);
  for (const site of enabled) {
    const tabs = await browser.tabs.query({ url: originMatchPattern(site.origin) }).catch(() => []);
    for (const tab of tabs) {
      if (tab.id == null) continue;
      await injectContentScript(tab.id).catch(() => undefined);
    }
  }
}

function patternCovers(pattern: string, origin: string): boolean {
  if (pattern === '<all_urls>' || pattern === '*://*/*') return true;
  if (pattern === 'https://*/*') return origin.startsWith('https://');
  if (pattern === 'http://*/*') return origin.startsWith('http://');
  return pattern === `${origin}/*`;
}

export async function disableRemovedOrigins(patterns: string[]): Promise<void> {
  if (!patterns.length) return;
  const sites = await listSites();
  let changed = false;
  for (const site of sites) {
    if (site.enabled && patterns.some((pattern) => patternCovers(pattern, site.origin))) {
      site.enabled = false;
      changed = true;
    }
  }
  if (changed) await saveSites(sites);
  await syncRegisteredScripts();
}
