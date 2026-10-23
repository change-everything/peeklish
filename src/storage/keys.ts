import { browser } from 'wxt/browser';
import type { KeyPersistence } from '../shared/types';

export async function getApiKey(persistence: KeyPersistence): Promise<string> {
  const area = persistence === 'local' ? browser.storage.local : browser.storage.session;
  const data = await area.get('apiKey');
  return typeof data.apiKey === 'string' ? data.apiKey : '';
}

export async function setApiKey(key: string, persistence: KeyPersistence): Promise<void> {
  const trimmed = key.trim();
  if (persistence === 'local') {
    await browser.storage.session.remove('apiKey');
    if (trimmed) await browser.storage.local.set({ apiKey: trimmed });
    else await browser.storage.local.remove('apiKey');
    return;
  }
  await browser.storage.local.remove('apiKey');
  if (trimmed) await browser.storage.session.set({ apiKey: trimmed });
  else await browser.storage.session.remove('apiKey');
}

export async function deleteApiKey(): Promise<void> {
  await browser.storage.session.remove('apiKey');
  await browser.storage.local.remove('apiKey');
}
