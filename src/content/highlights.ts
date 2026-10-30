const MARK = 'peeklish-mark';
const HOVER = 'peeklish-hover';
const NOTE = 'peeklish-note';
const FLASH = 'peeklish-flash';

export const HIGHLIGHT_CSS = `::highlight(${MARK}){background-color:transparent;text-decoration-line:underline;text-decoration-style:solid;text-decoration-color:#E6B000;text-decoration-thickness:1px;text-underline-offset:0.18em;}::highlight(${HOVER}){background-color:#FFF6D4;text-decoration-line:underline;text-decoration-style:solid;text-decoration-color:#E6B000;text-decoration-thickness:1px;text-underline-offset:0.18em;}::highlight(${NOTE}){background-color:rgba(245,196,0,0.32);}::highlight(${FLASH}){background-color:rgba(245,196,0,0.55);}`;

export function highlightsAvailable(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';
}

export function ensureHighlightStyle(doc: Document): void {
  const current = doc.getElementById('peeklish-highlight-style');
  if (current) {
    if (current.textContent !== HIGHLIGHT_CSS) current.textContent = HIGHLIGHT_CSS;
    return;
  }
  const style = doc.createElement('style');
  style.id = 'peeklish-highlight-style';
  style.textContent = HIGHLIGHT_CSS;
  (doc.head || doc.documentElement).appendChild(style);
}

export function syncHighlights(ranges: Range[], hovered?: Range | null): void {
  if (!highlightsAvailable()) return;
  CSS.highlights.set(MARK, new Highlight(...ranges));
  if (hovered) CSS.highlights.set(HOVER, new Highlight(hovered));
  else CSS.highlights.delete(HOVER);
}

export function syncNoteHighlights(doc: Document, ranges: Range[]): void {
  if (!highlightsAvailable()) return;
  ensureHighlightStyle(doc);
  if (ranges.length) CSS.highlights.set(NOTE, new Highlight(...ranges));
  else CSS.highlights.delete(NOTE);
}

export function flashHighlight(doc: Document, range: Range): void {
  if (!highlightsAvailable()) return;
  ensureHighlightStyle(doc);
  CSS.highlights.set(FLASH, new Highlight(range));
  const win = doc.defaultView ?? window;
  win.setTimeout(() => {
    if (highlightsAvailable()) CSS.highlights.delete(FLASH);
  }, 1200);
}

export function clearHighlights(doc: Document): void {
  if (highlightsAvailable()) {
    CSS.highlights.delete(MARK);
    CSS.highlights.delete(HOVER);
    CSS.highlights.delete(NOTE);
    CSS.highlights.delete(FLASH);
  }
  doc.getElementById('peeklish-highlight-style')?.remove();
}
