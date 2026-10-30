import type { AnchorStatus, ExcerptKind } from '../shared/types';

export type AnchorQuery = {
  exact: string;
  prefix: string;
  suffix: string;
  docOffset: number;
  kind: ExcerptKind;
};

export type AnchorMatch = { status: 'ok'; start: number; end: number } | { status: Exclude<AnchorStatus, 'ok'> };

function collapse(text: string): { value: string; map: number[] } {
  let value = '';
  const map: number[] = [];
  let pendingSpace = false;
  for (let index = 0; index < text.length; index += 1) {
    if (/\s/.test(text[index])) {
      pendingSpace = value.length > 0;
      continue;
    }
    if (pendingSpace) {
      map.push(index);
      value += ' ';
      pendingSpace = false;
    }
    map.push(index);
    value += text[index];
  }
  return { value, map };
}

function findExact(text: string, exact: string): number[] {
  const hits: number[] = [];
  if (!exact) return hits;
  let from = 0;
  while (from <= text.length) {
    const at = text.indexOf(exact, from);
    if (at < 0) break;
    hits.push(at);
    from = at + Math.max(1, exact.length);
  }
  return hits;
}

function scoreHits(text: string, anchor: AnchorQuery, hits: number[]): AnchorMatch {
  const ranked = hits.map((start) => {
    const end = start + anchor.exact.length;
    const before = text.slice(Math.max(0, start - anchor.prefix.length), start);
    const after = text.slice(end, end + anchor.suffix.length);
    let score = 0;
    if (anchor.prefix && before === anchor.prefix) score += 2;
    if (anchor.suffix && after === anchor.suffix) score += 2;
    return { start, end, score, distance: Math.abs(start - anchor.docOffset) };
  });
  ranked.sort((left, right) => right.score - left.score || left.distance - right.distance);
  const best = ranked[0];
  if (!best) return { status: 'moved' };
  const tied = ranked.filter((item) => item.score === best.score);
  if (tied.length > 1 && (best.score > 0 || hits.length > 1)) return { status: 'ambiguous' };
  if (hits.length > 1 && best.score < 2) return { status: 'ambiguous' };
  return { status: 'ok', start: best.start, end: best.end };
}

function foldHits(text: string, exact: string): Array<{ start: number; end: number }> {
  const needle = exact.replace(/\s+/g, ' ').trim();
  if (!needle) return [];
  const collapsed = collapse(text);
  const hits: Array<{ start: number; end: number }> = [];
  let from = 0;
  while (from <= collapsed.value.length) {
    const at = collapsed.value.indexOf(needle, from);
    if (at < 0) break;
    const start = collapsed.map[at];
    const last = collapsed.map[at + needle.length - 1];
    if (start != null && last != null) hits.push({ start, end: last + 1 });
    from = at + Math.max(1, needle.length);
  }
  return hits;
}

export function matchAnchor(pageText: string, anchor: AnchorQuery): AnchorMatch {
  if (!anchor.exact.trim()) return { status: 'moved' };
  const hits = findExact(pageText, anchor.exact);
  if (hits.length) return scoreHits(pageText, anchor, hits);
  if (anchor.kind === 'code') return { status: 'moved' };
  const folded = foldHits(pageText, anchor.exact);
  if (folded.length === 1) return { status: 'ok', start: folded[0].start, end: folded[0].end };
  if (folded.length > 1) return { status: 'ambiguous' };
  return { status: 'moved' };
}
