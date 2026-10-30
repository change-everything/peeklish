import { matchAnchor } from '../domain/anchor-match';
import type { AnchorStatus, Annotation, PendingAnchor } from '../shared/types';

type TextSeg = { node: Text; start: number; end: number };
type PageIndex = { text: string; segments: TextSeg[] };

const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION']);

function skipped(element: Element | null): boolean {
  let current = element;
  while (current) {
    if (SKIP.has(current.tagName)) return true;
    if (current.hasAttribute('data-peeklish-root')) return true;
    current = current.parentElement;
  }
  return false;
}

export function contentRoot(doc: Document): Element {
  return doc.querySelector('main') || doc.querySelector('article') || doc.querySelector('[role="main"]') || doc.body;
}

export function pageHeading(doc: Document): string {
  const heading = contentRoot(doc).querySelector('h1, h2');
  const text = heading?.textContent?.replace(/\s+/g, ' ').trim();
  return (text || doc.title).slice(0, 120);
}

function blockOf(node: Text, root: Element): Element {
  const block = node.parentElement?.closest('p, li, pre, h1, h2, h3, h4, h5, h6, blockquote, td, figcaption');
  if (block && root.contains(block)) return block;
  if (node.parentElement && root.contains(node.parentElement)) return node.parentElement;
  return root;
}

export function indexRoot(root: Element): PageIndex {
  const segments: TextSeg[] = [];
  let text = '';
  const doc = root.ownerDocument;
  if (!doc) return { text, segments };
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = (node as Text).parentElement;
      if (!parent || skipped(parent) || !node.textContent) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let lastBlock: Element | null = null;
  let current = walker.nextNode() as Text | null;
  while (current) {
    const value = (current.textContent ?? '').replace(/\u00a0/g, ' ');
    const block = blockOf(current, root);
    if (lastBlock && lastBlock !== block && text && !text.endsWith('\n')) text += '\n';
    lastBlock = block;
    if (value) {
      const start = text.length;
      text += value;
      segments.push({ node: current, start, end: text.length });
    }
    current = walker.nextNode() as Text | null;
  }
  return { text, segments };
}

function firstText(node: Node): Text | null {
  if (node.nodeType === Node.TEXT_NODE) return node as Text;
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  for (const child of node.childNodes) {
    const found = firstText(child);
    if (found) return found;
  }
  return null;
}

function lastText(node: Node): Text | null {
  if (node.nodeType === Node.TEXT_NODE) return node as Text;
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  for (let index = node.childNodes.length - 1; index >= 0; index -= 1) {
    const found = lastText(node.childNodes[index]);
    if (found) return found;
  }
  return null;
}

function textPoint(node: Node, offset: number): { node: Text; offset: number } | null {
  if (node.nodeType === Node.TEXT_NODE) return { node: node as Text, offset };
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const element = node as Element;
  if (offset >= element.childNodes.length) {
    const last = lastText(element);
    return last ? { node: last, offset: last.textContent?.length ?? 0 } : null;
  }
  const child = element.childNodes[offset];
  const first = child ? firstText(child) : null;
  return first ? { node: first, offset: 0 } : null;
}

function offsetAt(index: PageIndex, node: Node, offset: number): number | null {
  const point = textPoint(node, offset);
  if (!point) return null;
  const segment = index.segments.find((item) => item.node === point.node);
  if (!segment) return null;
  const within = Math.max(0, Math.min(point.offset, point.node.textContent?.length ?? 0));
  return segment.start + within;
}

function pointAt(index: PageIndex, offset: number): { node: Text; offset: number } | null {
  for (const segment of index.segments) {
    if (offset >= segment.start && offset <= segment.end) {
      return { node: segment.node, offset: offset - segment.start };
    }
  }
  for (const segment of index.segments) {
    if (offset < segment.start) return { node: segment.node, offset: 0 };
  }
  const last = index.segments.at(-1);
  if (!last) return null;
  return { node: last.node, offset: last.node.textContent?.length ?? 0 };
}

function rangeFromOffsets(doc: Document, index: PageIndex, start: number, end: number): Range | null {
  if (end <= start) return null;
  const startPoint = pointAt(index, start);
  const endPoint = pointAt(index, end);
  if (!startPoint || !endPoint) return null;
  const range = doc.createRange();
  try {
    range.setStart(startPoint.node, Math.min(startPoint.offset, startPoint.node.length));
    range.setEnd(endPoint.node, Math.min(endPoint.offset, endPoint.node.length));
  } catch {
    return null;
  }
  return range;
}

function elementPath(element: Element, root: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== root && root.contains(current)) {
    const owner: Element | null = current.parentElement;
    if (!owner) break;
    let index = 1;
    let sibling: Element | null = current.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === current.tagName) index += 1;
      sibling = sibling.previousElementSibling;
    }
    parts.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${index})`);
    current = owner;
  }
  return parts.join(' > ');
}

function headingFor(node: Node, root: Element): string | undefined {
  const start = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  let current = start;
  while (current && root.contains(current)) {
    let previous = current.previousElementSibling;
    while (previous) {
      if (/^H[1-6]$/.test(previous.tagName)) {
        const text = previous.textContent?.replace(/\s+/g, ' ').trim();
        if (text) return text.slice(0, 120);
      }
      const nested = previous.querySelector('h1, h2, h3, h4, h5, h6');
      const nestedText = nested?.textContent?.replace(/\s+/g, ' ').trim();
      if (nestedText) return nestedText.slice(0, 120);
      previous = previous.previousElementSibling;
    }
    if (current === root) break;
    current = current.parentElement;
  }
  return undefined;
}

function languageOf(element: Element | null): string | undefined {
  if (!element) return undefined;
  const host = element.closest('pre, code') ?? element;
  const label = `${host.className} ${host.parentElement?.className ?? ''}`;
  return label.match(/language-([\w#+-]+)/i)?.[1];
}

function blockElement(node: Node, root: Element): Element {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  const block = element?.closest('p, li, pre, h1, h2, h3, h4, h5, h6, blockquote, td, figcaption');
  if (block && root.contains(block)) return block;
  if (element && root.contains(element)) return element;
  return root;
}

export function captureAnchor(doc: Document, range: Range): PendingAnchor | null {
  const root = contentRoot(doc);
  const page = indexRoot(root);
  const start = offsetAt(page, range.startContainer, range.startOffset);
  const end = offsetAt(page, range.endContainer, range.endOffset);
  if (start == null || end == null || end <= start) return null;
  const exact = page.text.slice(start, end);
  if (!exact.trim() || exact.length > 4000) return null;
  const block = blockElement(range.startContainer, root);
  const blockIndex = indexRoot(block);
  const blockOffset = offsetAt(blockIndex, range.startContainer, range.startOffset) ?? 0;
  const code = (range.startContainer.nodeType === Node.ELEMENT_NODE
    ? (range.startContainer as Element)
    : range.startContainer.parentElement
  )?.closest('pre, code');
  const heading = headingFor(range.startContainer, root);
  const prefix = page.text.slice(Math.max(0, start - 32), start);
  const suffix = page.text.slice(end, end + 32);
  return {
    kind: code ? 'code' : 'text',
    exact,
    prefix,
    suffix,
    blockPath: block === root ? '' : elementPath(block, root),
    blockOffset,
    docOffset: start,
    heading,
    lang: languageOf(code ?? null),
    context: [heading, prefix, suffix].filter(Boolean).join('\n').slice(0, 300),
  };
}

export function restoreAnchor(
  doc: Document,
  anchor: Pick<Annotation, 'exact' | 'prefix' | 'suffix' | 'blockPath' | 'blockOffset' | 'docOffset' | 'kind'>,
): { range: Range | null; status: AnchorStatus } {
  const root = contentRoot(doc);
  if (anchor.blockPath) {
    let block: Element | null = null;
    try {
      block = root.querySelector(anchor.blockPath);
    } catch {
      block = null;
    }
    if (block) {
      const indexed = indexRoot(block);
      const slice = indexed.text.slice(anchor.blockOffset, anchor.blockOffset + anchor.exact.length);
      if (slice === anchor.exact) {
        const range = rangeFromOffsets(doc, indexed, anchor.blockOffset, anchor.blockOffset + anchor.exact.length);
        if (range) return { range, status: 'ok' };
      }
    }
  }
  const page = indexRoot(root);
  const found = matchAnchor(page.text, anchor);
  if (found.status !== 'ok') return { range: null, status: found.status };
  const range = rangeFromOffsets(doc, page, found.start, found.end);
  if (!range) return { range: null, status: 'moved' };
  return { range, status: 'ok' };
}
