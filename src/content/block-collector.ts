import { isEnglishBlock } from '../shared/english';
import { buildIndex, type IndexedText } from './text-index';
import { inPageChrome, isExcludedElement } from './excluded';

const SEMANTIC = 'p, li, blockquote, dd, td, figcaption';

export type CollectedBlock = {
  id: string;
  text: string;
  element: HTMLElement;
  indexed: IndexedText;
};

const ids = new WeakMap<Element, string>();
let sequence = 0;

function idFor(element: Element): string {
  let id = ids.get(element);
  if (!id) {
    sequence += 1;
    id = `b_${sequence.toString(36)}`;
    ids.set(element, id);
  }
  return id;
}

export function pageLabels(doc: Document): string[] {
  const raw: string[] = [];
  if (doc.title) raw.push(doc.title);
  for (const node of doc.querySelectorAll('h1, h2, [role="heading"]')) raw.push(node.textContent ?? '');
  const labels: string[] = [];
  for (const item of raw) {
    const text = item.replace(/\s+/g, ' ').trim();
    if (text.length < 3 || text.length > 120) continue;
    labels.push(text);
    const head = text.split(/\s+[|–—]\s+|\s+-\s+/)[0]?.trim();
    if (head && head.length >= 3 && head !== text) labels.push(head);
  }
  return [...new Set(labels)].slice(0, 40);
}

function isTitleLike(element: HTMLElement): boolean {
  const label = `${element.getAttribute('class') || ''} ${element.id || ''}`.toLowerCase();
  if (!/(^|[\s_-])(title|heading|headline)([\s_-]|$)/.test(label)) return false;
  const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text.length > 0 && text.length < 100 && !/[.!?]\s/.test(text);
}

function mostlyLinks(element: HTMLElement): boolean {
  const total = (element.textContent ?? '').replace(/\s+/g, '').length;
  if (total < 24) return false;
  let linked = 0;
  for (const anchor of element.querySelectorAll('a')) linked += (anchor.textContent ?? '').replace(/\s+/g, '').length;
  return linked / total >= 0.7;
}

function isContentBox(element: Element): boolean {
  if (element.querySelector(`${SEMANTIC}, pre, ul, ol, table`)) return false;
  for (const nested of element.querySelectorAll('div, article, section')) {
    const text = (nested.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text.length >= 30) return false;
  }
  return true;
}

function collectElements(root: ParentNode): HTMLElement[] {
  const found: HTMLElement[] = [];
  for (const node of root.querySelectorAll(`${SEMANTIC}, div, article, section`)) {
    if (node instanceof HTMLElement) found.push(node);
    if (node instanceof HTMLElement && node.shadowRoot) found.push(...collectElements(node.shadowRoot));
  }
  return found;
}

export function collectBlocks(
  doc: Document,
  options?: { isVisible?: (element: Element) => boolean; limit?: number },
): CollectedBlock[] {
  const visible = options?.isVisible ?? (() => true);
  const labels = new Set(pageLabels(doc).map((item) => item.toLowerCase()));
  const nodes = collectElements(doc);
  nodes.sort((left, right) => {
    const leftMain = left.closest('main, article, [role="main"]') ? 0 : 1;
    const rightMain = right.closest('main, article, [role="main"]') ? 0 : 1;
    return leftMain - rightMain;
  });
  const blocks: CollectedBlock[] = [];
  for (const node of nodes) {
    if (node.nodeType !== 1) continue;
    const element = node as HTMLElement;
    if (isExcludedElement(element) || inPageChrome(element) || isTitleLike(element) || mostlyLinks(element)) continue;
    const semantic = element.matches(SEMANTIC);
    if (semantic && element.querySelector(SEMANTIC)) continue;
    if (!semantic && !isContentBox(element)) continue;
    if (!visible(element)) continue;
    const indexed = buildIndex(element);
    const normalized = indexed.text.replace(/\s+/g, ' ').trim().toLowerCase();
    if (labels.has(normalized)) continue;
    if (!isEnglishBlock(indexed.text, 30)) continue;
    if (indexed.text.length > 4000) continue;
    blocks.push({ id: idFor(element), text: indexed.text, element, indexed });
    if (options?.limit && blocks.length >= options.limit) break;
  }
  return blocks;
}
