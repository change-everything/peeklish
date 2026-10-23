import { isExcludedElement } from './excluded';

export type TextSegment = { node: Text; start: number; end: number };

export type IndexedText = { text: string; segments: TextSegment[] };

export function buildIndex(root: HTMLElement): IndexedText {
  const segments: TextSegment[] = [];
  let text = '';
  const doc = root.ownerDocument;
  if (!doc) return { text: '', segments };
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || isExcludedElement(parent)) return NodeFilter.FILTER_REJECT;
      if (!node.textContent) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let current = walker.nextNode();
  while (current) {
    const value = (current.textContent ?? '').replace(/\u00a0/g, ' ');
    if (value) {
      const start = text.length;
      text += value;
      segments.push({ node: current as Text, start, end: text.length });
    }
    current = walker.nextNode();
  }
  return { text, segments };
}

export function pointAt(indexed: IndexedText, offset: number): { node: Text; offset: number } | null {
  for (const segment of indexed.segments) {
    if (offset >= segment.start && offset <= segment.end) {
      return { node: segment.node, offset: offset - segment.start };
    }
  }
  return null;
}

export function rangeForOffsets(indexed: IndexedText, start: number, end: number): Range | null {
  if (end <= start) return null;
  const startPoint = pointAt(indexed, start);
  const endPoint = pointAt(indexed, end);
  if (!startPoint || !endPoint) return null;
  const doc = startPoint.node.ownerDocument;
  if (!doc) return null;
  const range = doc.createRange();
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset);
  return range;
}

export function offsetInIndex(indexed: IndexedText, node: Node, offset: number): number | null {
  if (node.nodeType !== Node.TEXT_NODE) return null;
  const segment = indexed.segments.find((item) => item.node === node);
  if (!segment) return null;
  return segment.start + offset;
}
