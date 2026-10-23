import { blockAllowance, learningRank, looseCanonical, sameExpression, wordCount } from './learning-value';
import { LEVEL_LIMITS } from '../shared/limits';
import { normalizeCanonical } from '../shared/normalizer';
import type { AssistanceLevel, LocatedPhrase, RawPhrase } from '../shared/types';
import { locateSurface } from './locate';

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

function gap(a: { start: number; end: number }, b: { start: number; end: number }): number {
  if (a.end <= b.start) return b.start - a.end;
  if (b.end <= a.start) return a.start - b.end;
  return 0;
}

function normalizedList(values: string[]): { exact: Set<string>; loose: Set<string> } {
  const exact = new Set<string>();
  const loose = new Set<string>();
  for (const value of values) {
    const canonical = normalizeCanonical(value);
    if (!canonical) continue;
    exact.add(canonical);
    loose.add(looseCanonical(canonical));
  }
  return { exact, loose };
}

export function selectMarks(input: {
  blocks: Array<{ id: string; text: string }>;
  phrases: RawPhrase[];
  knownCanonicals: string[];
  existingCanonicals: string[];
  blockedSurfaces?: string[];
  level: AssistanceLevel;
}): LocatedPhrase[] {
  const limits = LEVEL_LIMITS[input.level];
  const known = normalizedList(input.knownCanonicals);
  const existing = normalizedList(input.existingCanonicals);
  const blocked = new Set(
    (input.blockedSurfaces ?? [])
      .map((item) => item.replace(/\s+/g, ' ').trim().toLowerCase())
      .filter((item) => item.length >= 3),
  );
  const blockedLoose = new Set([...blocked].map((item) => looseCanonical(item)));
  const textById = new Map(input.blocks.map((block) => [block.id, block.text]));
  const allowance = new Map(input.blocks.map((block) => [block.id, blockAllowance(wordCount(block.text), input.level)]));
  const located: LocatedPhrase[] = [];

  for (const phrase of input.phrases) {
    const text = textById.get(phrase.blockId);
    if (!text || !phrase.surface || !phrase.meaningZh.trim()) continue;
    const spot = locateSurface(text, phrase.surface, {
      occurrenceIndex: phrase.occurrenceIndex,
      start: phrase.start,
      end: phrase.end,
    });
    if (!spot) continue;
    const canonical = normalizeCanonical(phrase.canonical || phrase.surface);
    const loose = looseCanonical(canonical);
    if (!canonical || known.exact.has(canonical) || known.loose.has(loose) || existing.exact.has(canonical) || existing.loose.has(loose)) {
      continue;
    }
    const surfaceKey = phrase.surface.replace(/\s+/g, ' ').trim().toLowerCase();
    if (blocked.has(surfaceKey) || blockedLoose.has(looseCanonical(surfaceKey))) continue;
    const type = phrase.type ?? 'other';
    const priority = phrase.priority ?? 0.5;
    if (priority < limits.minPriority) continue;
    const rank = learningRank(phrase.surface, type);
    if (rank === 'skip') continue;
    if (rank === 'low' && input.level !== 'strong') continue;
    if (type === 'word' && input.level !== 'strong' && priority < 0.86) continue;
    located.push({
      blockId: phrase.blockId,
      surface: phrase.surface,
      canonical,
      meaningZh: phrase.meaningZh.trim(),
      noteZh: phrase.noteZh?.trim() || undefined,
      type,
      priority,
      pos: phrase.pos?.trim() || undefined,
      start: spot.start,
      end: spot.end,
    });
  }

  located.sort((a, b) => b.priority - a.priority || b.end - b.start - (a.end - a.start) || a.start - b.start);
  const perBlock = new Map<string, number>();
  const chosen: LocatedPhrase[] = [];
  for (const phrase of located) {
    const count = perBlock.get(phrase.blockId) ?? 0;
    if (count >= (allowance.get(phrase.blockId) ?? limits.perBlock)) continue;
    if (
      chosen.some(
        (item) =>
          item.blockId === phrase.blockId &&
          (overlaps(item, phrase) || gap(item, phrase) < limits.minGap || sameExpression(item.canonical, phrase.canonical)),
      )
    ) {
      continue;
    }
    perBlock.set(phrase.blockId, count + 1);
    chosen.push(phrase);
  }
  return chosen;
}
