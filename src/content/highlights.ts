const MARK = 'peeklish-mark';
const HOVER = 'peeklish-hover';

export const HIGHLIGHT_CSS = `::highlight(${MARK}){background-color:transparent;text-decoration-line:underline;text-decoration-style:solid;text-decoration-color:#E6B000;text-decoration-thickness:1px;text-underline-offset:0.18em;}::highlight(${HOVER}){background-color:#FFF6D4;text-decoration-line:underline;text-decoration-style:solid;text-decoration-color:#E6B000;text-decoration-thickness:1px;text-underline-offset:0.18em;}`;

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

export function clearHighlights(doc: Document): void {
  if (highlightsAvailable()) {
    CSS.highlights.delete(MARK);
    CSS.highlights.delete(HOVER);
  }
  doc.getElementById('peeklish-highlight-style')?.remove();
}
