import { browser } from 'wxt/browser';
import type { ExplainJob, PanelFocus } from '../shared/types';

const FOCUS = 'panelFocus';

function explainKey(docId: string): string {
  return `explain:${docId}`;
}

export async function writeExplainJob(job: ExplainJob): Promise<void> {
  await browser.storage.session.set({ [explainKey(job.docId)]: job });
}

export async function readExplainJob(docId: string): Promise<ExplainJob | null> {
  const stored = await browser.storage.session.get(explainKey(docId));
  const job = stored[explainKey(docId)] as ExplainJob | undefined;
  if (!job || job.docId !== docId) return null;
  return job;
}

export async function setPanelFocus(focus: PanelFocus): Promise<void> {
  await browser.storage.session.set({ [FOCUS]: focus });
}

export async function readPanelFocus(): Promise<PanelFocus | null> {
  const stored = await browser.storage.session.get(FOCUS);
  const focus = stored[FOCUS] as PanelFocus | undefined;
  return focus?.docId ? focus : null;
}
