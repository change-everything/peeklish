import { z } from 'zod';
import { LIMITS } from '../shared/limits';
import { cleanModelText } from '../shared/english';
import { EXPRESSION_TYPES } from '../shared/types';
import type { ExpressionType, KeyPhrase, SelectionKind, TranslationPayload } from '../shared/types';
import { locateSurface } from './locate';

const typeSet = new Set<string>(EXPRESSION_TYPES);

function asType(value: unknown): ExpressionType {
  return typeof value === 'string' && typeSet.has(value) ? (value as ExpressionType) : 'other';
}

const phraseSchema = z.object({
  surface: z.string(),
  canonical: z.string().optional(),
  meaningZh: z.string().optional(),
  noteZh: z.string().optional(),
  type: z.string().optional(),
  priority: z.number().optional(),
  pos: z.string().optional(),
  occurrenceIndex: z.number().optional(),
  start: z.number().optional(),
  end: z.number().optional(),
});

const analysisSchema = z.object({
  blocks: z.array(
    z.object({
      blockId: z.string(),
      phrases: z.array(z.unknown()).optional(),
    }),
  ),
});

export type ParsedPhrase = {
  blockId: string;
  surface: string;
  canonical?: string;
  meaningZh: string;
  noteZh?: string;
  type: ExpressionType;
  priority: number;
  pos?: string;
  occurrenceIndex?: number;
  start?: number;
  end?: number;
};

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function coercePhrase(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const item = raw as Record<string, unknown>;
  const priority = typeof item.priority === 'string' ? Number(item.priority) : item.priority;
  return {
    ...item,
    surface: firstString(item.surface, item.text, item.phrase, item.expression),
    meaningZh: firstString(item.meaningZh, item.meaning, item.translation, item.gloss, item.zh),
    priority: typeof priority === 'number' && Number.isFinite(priority) ? priority : undefined,
  };
}

function looksLikePhrase(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.surface === 'string' || typeof item.phrase === 'string' || typeof item.text === 'string' || typeof item.expression === 'string';
}

function coerceAnalysis(data: unknown): unknown {
  if (Array.isArray(data)) return { blocks: [{ blockId: '', phrases: data.map(coercePhrase) }] };
  if (!data || typeof data !== 'object') return data;
  const record = data as Record<string, unknown>;
  const blocks = record.blocks ?? record.paragraphs ?? record.items;
  if (Array.isArray(blocks)) {
    return {
      blocks: blocks.map((block) => {
        if (typeof block === 'string') return { blockId: '', phrases: [] };
        if (!block || typeof block !== 'object') return { blockId: '', phrases: [] };
        const item = block as Record<string, unknown>;
        const phrases = item.phrases ?? item.expressions ?? item.candidates ?? [];
        return {
          blockId: firstString(item.blockId, item.block_id, item.id),
          phrases: Array.isArray(phrases) ? phrases.map(coercePhrase) : [],
        };
      }),
    };
  }
  const phrases = record.phrases ?? record.expressions;
  if (Array.isArray(phrases)) return { blocks: [{ blockId: '', phrases: phrases.map(coercePhrase) }] };
  const grouped = Object.entries(record).filter(([, value]) => Array.isArray(value) && value.some(looksLikePhrase));
  if (grouped.length) {
    return {
      blocks: grouped.map(([id, value]) => ({
        blockId: id,
        phrases: (value as unknown[]).map(coercePhrase),
      })),
    };
  }
  const wrapped = record.result ?? record.data;
  if (wrapped && typeof wrapped === 'object' && wrapped !== record) return coerceAnalysis(wrapped);
  return data;
}

export function parseAnalysis(data: unknown): ParsedPhrase[] {
  const parsed = analysisSchema.safeParse(coerceAnalysis(data));
  if (!parsed.success) throw new Error('BAD_ANALYSIS');
  const phrases: ParsedPhrase[] = [];
  for (const block of parsed.data.blocks.slice(0, LIMITS.maxBlocks)) {
    const blockId = block.blockId.trim();
    for (const raw of block.phrases ?? []) {
      const item = phraseSchema.safeParse(raw);
      if (!item.success) continue;
      const surface = item.data.surface.trim();
      const meaningZh = cleanModelText(item.data.meaningZh ?? '', LIMITS.maxMeaning);
      if (!surface || surface.length > LIMITS.maxSurface || !meaningZh) continue;
      const priority = item.data.priority;
      phrases.push({
        blockId,
        surface,
        canonical: item.data.canonical?.trim() || undefined,
        meaningZh,
        noteZh: item.data.noteZh ? cleanModelText(item.data.noteZh, LIMITS.maxNote) : undefined,
        type: asType(item.data.type),
        priority: typeof priority === 'number' && priority >= 0 && priority <= 1 ? priority : 0.86,
        pos: item.data.pos ? cleanModelText(item.data.pos, 16) : undefined,
        occurrenceIndex:
          typeof item.data.occurrenceIndex === 'number' && item.data.occurrenceIndex >= 0
            ? Math.floor(item.data.occurrenceIndex)
            : undefined,
        start: typeof item.data.start === 'number' ? Math.floor(item.data.start) : undefined,
        end: typeof item.data.end === 'number' ? Math.floor(item.data.end) : undefined,
      });
    }
  }
  return phrases;
}

export function bindPhrasesToBlocks(
  blocks: Array<{ id: string; text: string }>,
  phrases: ParsedPhrase[],
): ParsedPhrase[] {
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const bound: ParsedPhrase[] = [];
  for (const phrase of phrases) {
    const current = byId.get(phrase.blockId);
    if (current && locateSurface(current.text, phrase.surface)) {
      bound.push(phrase);
      continue;
    }
    const host = blocks.find((block) => locateSurface(block.text, phrase.surface));
    if (!host) continue;
    bound.push({ ...phrase, blockId: host.id });
  }
  return bound;
}

function parseKeyPhrases(source: string, value: unknown): KeyPhrase[] {
  if (!Array.isArray(value)) return [];
  const phrases: KeyPhrase[] = [];
  for (const item of value.slice(0, 4)) {
    const parsed = phraseSchema.safeParse(item);
    if (!parsed.success) continue;
    const surface = parsed.data.surface.trim();
    const meaningZh = cleanModelText(parsed.data.meaningZh ?? '', LIMITS.maxMeaning);
    if (!surface || !meaningZh || !source.includes(surface)) continue;
    phrases.push({
      surface,
      canonical: (parsed.data.canonical || surface).trim(),
      meaningZh,
      type: asType(parsed.data.type),
    });
  }
  return phrases;
}

export function parseTranslation(data: unknown, fallbackKind: SelectionKind): TranslationPayload {
  if (!data || typeof data !== 'object') throw new Error('BAD_TRANSLATION');
  const record = data as Record<string, unknown>;
  const kind = (['word', 'phrase', 'sentence', 'paragraph'] as const).includes(record.kind as SelectionKind)
    ? (record.kind as SelectionKind)
    : fallbackKind;
  const source = typeof record.source === 'string' ? record.source.trim() : '';
  const meaningZh = typeof record.meaningZh === 'string' ? cleanModelText(record.meaningZh, LIMITS.maxMeaning) : undefined;
  const translationZh =
    typeof record.translationZh === 'string' ? cleanModelText(record.translationZh, LIMITS.maxTranslation) : undefined;
  const noteZh = typeof record.noteZh === 'string' ? cleanModelText(record.noteZh, LIMITS.maxNote) : undefined;
  const pos = typeof record.pos === 'string' ? cleanModelText(record.pos, 16) : undefined;
  const keyPhrases = parseKeyPhrases(source, record.keyPhrases);
  const needsMeaning = kind === 'word' || kind === 'phrase';
  if (!source || (needsMeaning && !meaningZh) || (!needsMeaning && !translationZh)) throw new Error('BAD_TRANSLATION');
  return { kind, source, meaningZh, translationZh, noteZh, pos, keyPhrases };
}

export function parseExplanation(data: unknown): { explanationZh: string } {
  if (!data || typeof data !== 'object' || typeof (data as { explanationZh?: unknown }).explanationZh !== 'string') {
    throw new Error('BAD_EXPLANATION');
  }
  const explanationZh = cleanModelText((data as { explanationZh: string }).explanationZh, LIMITS.maxExplanation);
  if (!explanationZh) throw new Error('BAD_EXPLANATION');
  return { explanationZh };
}

export function parsePolish(data: unknown): { polishedEn: string; noteZh: string } {
  if (!data || typeof data !== 'object') throw new Error('BAD_POLISH');
  const record = data as { polishedEn?: unknown; noteZh?: unknown };
  if (typeof record.polishedEn !== 'string') throw new Error('BAD_POLISH');
  const polishedEn = cleanModelText(record.polishedEn, LIMITS.maxPolish);
  const noteZh = typeof record.noteZh === 'string' ? cleanModelText(record.noteZh, LIMITS.maxNote) : '';
  if (!polishedEn) throw new Error('BAD_POLISH');
  return { polishedEn, noteZh };
}
