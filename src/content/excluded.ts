const REJECT_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEXTAREA',
  'INPUT',
  'BUTTON',
  'SELECT',
  'OPTION',
  'CODE',
  'PRE',
  'KBD',
  'SAMP',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
]);

export function isExcludedElement(element: Element | null): boolean {
  let current: Element | null = element;
  while (current) {
    if (REJECT_TAGS.has(current.tagName)) return true;
    if (current.getAttribute('contenteditable') === 'true') return true;
    if (current.getAttribute('role') === 'heading') return true;
    if (current.hasAttribute('data-peeklish-root')) return true;
    current = current.parentElement;
  }
  return false;
}

const CHROME_TOKEN = /(^|[\s_-])(sidebar|breadcrumb|breadcrumbs|toc|table-of-contents|page-toc|docs-sidebar)([\s_-]|$)/;

function looksLikeChrome(element: Element): boolean {
  const label = (element.getAttribute('aria-label') || '').toLowerCase();
  if (label.includes('breadcrumb') || label.includes('table of contents')) return true;
  const className = (element.getAttribute('class') || '').toLowerCase();
  if (CHROME_TOKEN.test(className)) return true;
  const id = (element.id || '').toLowerCase();
  return CHROME_TOKEN.test(id);
}

export function inPageChrome(element: Element): boolean {
  if (element.closest('nav, footer, aside, [role="navigation"], [role="contentinfo"], [role="doc-toc"], [role="directory"]')) return true;
  let current: Element | null = element;
  while (current) {
    if (looksLikeChrome(current)) return true;
    current = current.parentElement;
  }
  const header = element.closest('header, [role="banner"]');
  if (header && !header.closest('article, main')) return true;
  return false;
}
