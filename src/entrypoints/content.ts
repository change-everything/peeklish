import { captureAnchor, pageHeading } from '../content/anchor';
import { extensionBridge } from '../content/bridge';
import { createNotesLayer } from '../content/notes-layer';
import { createReader } from '../content/reader';

export default defineContentScript({
  registration: 'runtime',
  runAt: 'document_idle',
  main() {
    const flag = '__peeklishBoot';
    const root = globalThis as Record<string, unknown>;
    try {
      if (!browser.runtime?.id) return;
    } catch {
      return;
    }
    if (root[flag]) return;
    root[flag] = true;
    let api: ReturnType<typeof createReader> | null = null;
    let notes: ReturnType<typeof createNotesLayer> | null = null;
    const boot = () => {
      if (api) return;
      api = createReader({ bridge: extensionBridge() });
      notes = createNotesLayer(document, {
        onStatus: (statuses) => {
          void browser.runtime.sendMessage({ type: 'UPDATE_ANCHOR_STATUS', statuses }).catch(() => undefined);
        },
        onOpen: (annotationId) => {
          void browser.runtime.sendMessage({ type: 'ANCHOR_CLICKED', annotationId }).catch(() => undefined);
        },
      });
      void browser.runtime
        .sendMessage({ type: 'LIST_NOTES' })
        .then((response: { ok?: boolean; data?: { annotations?: [] } } | undefined) => {
          if (response?.ok && response.data?.annotations && notes) notes.apply(response.data.annotations);
        })
        .catch(() => undefined);
      void browser.runtime.sendMessage({ type: 'PAGE_OPENED', heading: pageHeading(document) }).catch(() => undefined);
    };
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const type = message && typeof message === 'object' && 'type' in message ? String(message.type) : '';
      if (type === 'CLEANUP') {
        api?.dispose();
        notes?.clear();
        api = null;
        notes = null;
        sendResponse({ ok: true, highlights: 0, degraded: false });
        return;
      }
      if (type === 'NOTES_SYNC') {
        const annotations = Array.isArray(message.annotations) ? message.annotations : [];
        sendResponse({ ok: true, statuses: notes?.apply(annotations) ?? [] });
        return;
      }
      if (type === 'SCROLL_TO') {
        const annotationId = typeof message.annotationId === 'string' ? message.annotationId : '';
        sendResponse({ ok: true, found: notes?.scrollTo(annotationId) ?? false });
        return;
      }
      if (type === 'QUICK_EXCERPT') {
        const selection = document.getSelection();
        const range = selection && selection.rangeCount > 0 && !selection.isCollapsed ? selection.getRangeAt(0) : null;
        const anchor = range ? captureAnchor(document, range) : null;
        if (anchor) void extensionBridge().captureExcerpt?.(anchor);
        sendResponse({ ok: Boolean(anchor) });
        return;
      }
      if (type === 'GET_PAGE_CONTEXT') {
        sendResponse({ ok: true, title: pageHeading(document), url: location.href });
        return;
      }
      if (type === 'ENSURE') {
        boot();
        sendResponse({ ok: true });
        return;
      }
      if (type === 'APPLY_CONFIG') {
        if (!api) boot();
        else void api.reload();
        sendResponse({ ok: true });
        return;
      }
      if (type === 'GET_STATS') {
        sendResponse({ ok: true, ...(api?.stats() ?? { highlights: 0, degraded: false }) });
      }
    });
    boot();
  },
});
