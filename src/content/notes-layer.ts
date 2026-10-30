import type { AnchorStatus, Annotation } from '../shared/types';
import { restoreAnchor } from './anchor';
import { flashHighlight, syncNoteHighlights } from './highlights';

type Live = { annotation: Annotation; range: Range | null; status: AnchorStatus };

export function createNotesLayer(
  doc: Document,
  hooks?: {
    onStatus?: (statuses: Array<{ id: string; status: AnchorStatus }>) => void;
    onOpen?: (annotationId: string) => void;
  },
): {
  apply: (annotations: Annotation[]) => Array<{ id: string; status: AnchorStatus }>;
  scrollTo: (annotationId: string) => boolean;
  clear: () => void;
} {
  const win = doc.defaultView ?? window;
  let live: Live[] = [];
  let last: Annotation[] = [];
  let timer = 0;
  let stopped = false;

  function paint(annotations: Annotation[]): Array<{ id: string; status: AnchorStatus }> {
    last = annotations;
    live = annotations.map((annotation) => {
      const restored = restoreAnchor(doc, annotation);
      return { annotation, range: restored.range, status: restored.status };
    });
    syncNoteHighlights(
      doc,
      live.flatMap((item) => (item.status === 'ok' && item.range ? [item.range] : [])),
    );
    return live.map((item) => ({ id: item.annotation.id, status: item.status }));
  }

  function apply(annotations: Annotation[]): Array<{ id: string; status: AnchorStatus }> {
    return paint(annotations);
  }

  const observer = new MutationObserver((records) => {
    if (stopped || !last.length) return;
    const own = records.every((record) => {
      const node = record.target instanceof Element ? record.target : record.target.parentElement;
      return Boolean(node?.closest('[data-peeklish-root]'));
    });
    if (own) return;
    win.clearTimeout(timer);
    timer = win.setTimeout(() => {
      if (!stopped) hooks?.onStatus?.(paint(last));
    }, 500);
  });
  if (doc.body) observer.observe(doc.body, { subtree: true, childList: true, characterData: true });

  function onClick(event: MouseEvent): void {
    if (stopped) return;
    const path = event.composedPath();
    if (path.some((node) => node instanceof Element && node.hasAttribute('data-peeklish-root'))) return;
    const point = doc.caretRangeFromPoint?.(event.clientX, event.clientY);
    if (!point) return;
    for (const item of live) {
      if (!item.range || item.status !== 'ok') continue;
      try {
        if (item.range.isPointInRange(point.startContainer, point.startOffset)) {
          hooks?.onOpen?.(item.annotation.id);
          return;
        }
      } catch {
        // The caret can sit in a node the range cannot test.
      }
    }
  }
  doc.addEventListener('click', onClick);

  return {
    apply,
    scrollTo(annotationId: string) {
      const item = live.find((entry) => entry.annotation.id === annotationId);
      if (!item?.range || item.status !== 'ok') return false;
      const node = item.range.startContainer;
      const element = node instanceof Element ? node : node.parentElement;
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      flashHighlight(doc, item.range);
      return true;
    },
    clear() {
      stopped = true;
      win.clearTimeout(timer);
      observer.disconnect();
      doc.removeEventListener('click', onClick);
      live = [];
      last = [];
      syncNoteHighlights(doc, []);
    },
  };
}
