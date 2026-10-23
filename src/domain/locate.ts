function collapseWithMap(text: string): { value: string; map: number[] } {
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

function flexibleFind(text: string, surface: string): { start: number; end: number } | null {
  const needle = surface.replace(/\s+/g, ' ').trim();
  if (!needle) return null;
  const direct = text.indexOf(surface);
  if (direct >= 0) return { start: direct, end: direct + surface.length };
  const collapsed = collapseWithMap(text);
  const at = collapsed.value.indexOf(needle);
  if (at < 0) return null;
  const start = collapsed.map[at];
  const last = collapsed.map[at + needle.length - 1];
  if (start == null || last == null) return null;
  return { start, end: last + 1 };
}

export function locateSurface(
  text: string,
  surface: string,
  hint?: { occurrenceIndex?: number; start?: number; end?: number },
): { start: number; end: number } | null {
  if (!surface || surface.length > 80) return null;
  if (hint?.start != null && hint.end != null && text.slice(hint.start, hint.end) === surface) {
    return { start: hint.start, end: hint.end };
  }
  const hits: number[] = [];
  let from = 0;
  while (from <= text.length) {
    const spot = flexibleFind(text.slice(from), surface);
    if (!spot) break;
    hits.push(from + spot.start);
    const step = Math.max(1, spot.end);
    from += step;
  }
  if (hits.length === 0) return null;
  if (hint?.occurrenceIndex != null) {
    const start = hits[hint.occurrenceIndex];
    if (start == null) return null;
    const spot = flexibleFind(text.slice(start), surface);
    if (!spot) return null;
    return { start, end: start + spot.end };
  }
  const spot = flexibleFind(text.slice(hits[0]), surface);
  if (!spot) return null;
  return { start: hits[0], end: hits[0] + spot.end };
}
