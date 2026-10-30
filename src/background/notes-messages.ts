import { openSidePanel } from '../chrome/side-panel';
import { publish } from '../shared/bus';
import { documentKey } from '../shared/doc-key';
import { canInjectPage } from '../shared/api-url';
import { errorText } from '../shared/error-text';
import type { AnchorStatus, PendingAnchor, Result } from '../shared/types';
import { activeAnnotations, applyStatuses, createExcerpt, findNoteByAnnotation } from '../storage/notes';
import { setPanelFocus } from '../storage/panel-state';
import { pushNotes } from '../storage/push-notes';
import { getSite } from '../storage/sites';

type Sender = Browser.runtime.MessageSender;

function fail(code: string): Result<never> {
  return { ok: false, code, error: errorText(code) };
}

function pageOrigin(sender: Sender): string | null {
  if (!sender.tab?.url) return null;
  const page = canInjectPage(sender.tab.url);
  return page.ok ? page.origin : null;
}

export function readAnchor(value: unknown): PendingAnchor | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const exact = typeof item.exact === 'string' ? item.exact : '';
  if (!exact.trim() || exact.length > 4000) return null;
  return {
    kind: item.kind === 'code' ? 'code' : 'text',
    exact,
    prefix: typeof item.prefix === 'string' ? item.prefix.slice(0, 64) : '',
    suffix: typeof item.suffix === 'string' ? item.suffix.slice(0, 64) : '',
    blockPath: typeof item.blockPath === 'string' ? item.blockPath.slice(0, 800) : '',
    blockOffset: typeof item.blockOffset === 'number' && item.blockOffset >= 0 ? Math.floor(item.blockOffset) : 0,
    docOffset: typeof item.docOffset === 'number' && item.docOffset >= 0 ? Math.floor(item.docOffset) : 0,
    heading: typeof item.heading === 'string' ? item.heading.slice(0, 120) : undefined,
    lang: typeof item.lang === 'string' ? item.lang.slice(0, 32) : undefined,
    context: typeof item.context === 'string' ? item.context.slice(0, 400) : '',
  };
}

async function enabledOrigin(sender: Sender): Promise<{ origin: string; url: string; docId: string; tabId: number; title: string } | null> {
  const origin = pageOrigin(sender);
  const url = sender.tab?.url;
  const tabId = sender.tab?.id;
  if (!origin || !url || tabId == null) return null;
  const site = await getSite(origin);
  if (!site?.enabled) return null;
  const docId = documentKey(url);
  if (!docId) return null;
  return { origin, url, docId, tabId, title: sender.tab?.title || origin };
}

export async function handleNotesMessage(message: Record<string, unknown>, sender: Sender): Promise<Result<unknown> | null> {
  if (message.type === 'PAGE_OPENED') {
    if (!pageOrigin(sender)) return fail('unsupported');
    return { ok: true, data: null };
  }
  if (message.type === 'LIST_NOTES') {
    const page = await enabledOrigin(sender);
    if (!page) return fail('disabled');
    return { ok: true, data: { annotations: await activeAnnotations(page.docId), docId: page.docId } };
  }
  if (message.type === 'UPDATE_ANCHOR_STATUS') {
    const page = await enabledOrigin(sender);
    if (!page) return fail('disabled');
    const statuses = Array.isArray(message.statuses)
      ? message.statuses.flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const record = item as { id?: unknown; status?: unknown };
          if (typeof record.id !== 'string') return [];
          if (record.status !== 'ok' && record.status !== 'moved' && record.status !== 'ambiguous') return [];
          return [{ id: record.id, status: record.status as AnchorStatus }];
        })
      : [];
    await applyStatuses(statuses);
    publish('notes', page.docId);
    return { ok: true, data: null };
  }
  if (message.type === 'CAPTURE_EXCERPT') {
    const opening = openSidePanel(sender.tab?.id ?? -1);
    const page = await enabledOrigin(sender);
    if (!page) return fail('disabled');
    const anchor = readAnchor(message.anchor);
    if (!anchor) return fail('config');
    const heading = typeof message.heading === 'string' ? message.heading.slice(0, 120) : anchor.heading;
    const created = await createExcerpt(
      { id: page.docId, url: page.url, title: heading || page.title, origin: page.origin, createdAt: 0, lastOpenedAt: 0 },
      anchor,
    );
    await setPanelFocus({ docId: page.docId, noteId: created.note.id, tab: 'notes', at: Date.now() });
    await pushNotes(page.tabId, page.docId);
    publish('notes', page.docId);
    await opening;
    return { ok: true, data: { noteId: created.note.id } };
  }
  if (message.type === 'ANCHOR_CLICKED') {
    const opening = openSidePanel(sender.tab?.id ?? -1);
    const page = await enabledOrigin(sender);
    if (!page) return fail('disabled');
    const annotationId = typeof message.annotationId === 'string' ? message.annotationId : '';
    const note = annotationId ? await findNoteByAnnotation(annotationId) : null;
    if (!note) return fail('config');
    await setPanelFocus({ docId: page.docId, noteId: note.id, tab: 'notes', at: Date.now() });
    publish('focus', page.docId);
    await opening;
    return { ok: true, data: { noteId: note.id } };
  }
  return null;
}
