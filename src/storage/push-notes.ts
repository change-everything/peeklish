import { browser } from 'wxt/browser';
import type { AnchorStatus } from '../shared/types';
import { activeAnnotations, applyStatuses } from './notes';

export async function pushNotes(tabId: number, docId: string): Promise<void> {
  if (tabId < 0) return;
  const annotations = await activeAnnotations(docId);
  const response = (await browser.tabs.sendMessage(tabId, { type: 'NOTES_SYNC', annotations }).catch(() => null)) as {
    statuses?: Array<{ id: string; status: AnchorStatus }>;
  } | null;
  if (response?.statuses?.length) await applyStatuses(response.statuses);
}
