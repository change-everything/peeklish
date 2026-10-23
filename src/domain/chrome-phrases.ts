import { blockAllowance, learningRank, wordCount } from './learning-value';
import { findLexemes } from './lexicon';
import { LEVEL_LIMITS } from '../shared/limits';
import { normalizeCanonical } from '../shared/normalizer';
import type { AssistanceLevel, ExpressionType, RawPhrase } from '../shared/types';

const STOP = new Set(
  `a an the of to in for on with at by from as into onto upon within without against between among over under after before during than then so if or and but nor not no yes this that these those it its it's i you he she we they me him her us them my your his their our what which who whom whose there here when where why how just also only very more most other such same own each every both few many much some any all per via about above below up out off down away back through around along across apart aside be is am are was were been being do does did doing done have has had having will would can could may might shall should must`.split(
    ' ',
  ),
);

const BASIC_VERB = new Set(
  'inspect create manage use make get set add run call see view open read write update delete remove check start stop show hide send save load click select include return require provide allow need want help build deploy look find give take put keep let go come work play try ask tell'.split(
    ' ',
  ),
);

const AUX = new Set('be is am are was were been being do does did have has had will would can could may might shall should must'.split(' '));

const PARTICLE = new Set('up out off down away back over through around along across apart aside'.split(' '));

const PATTERNS: Array<{ surface: string; type: ExpressionType; priority: number }> = [
  { surface: 'in addition to', type: 'connector', priority: 0.9 },
  { surface: 'at least one', type: 'pattern', priority: 0.88 },
  { surface: 'on the other hand', type: 'connector', priority: 0.9 },
  { surface: 'with respect to', type: 'connector', priority: 0.88 },
  { surface: 'in order to', type: 'connector', priority: 0.86 },
  { surface: 'as well as', type: 'connector', priority: 0.84 },
  { surface: 'rather than', type: 'connector', priority: 0.86 },
  { surface: 'instead of', type: 'connector', priority: 0.84 },
  { surface: 'according to', type: 'connector', priority: 0.84 },
  { surface: 'depending on', type: 'pattern', priority: 0.8 },
  { surface: 'regardless of', type: 'connector', priority: 0.86 },
  { surface: 'in contrast', type: 'connector', priority: 0.84 },
  { surface: 'for example', type: 'connector', priority: 0.62 },
  { surface: 'such as', type: 'connector', priority: 0.6 },
  { surface: 'due to', type: 'connector', priority: 0.8 },
  { surface: 'so that', type: 'connector', priority: 0.78 },
  { surface: 'even if', type: 'connector', priority: 0.8 },
  { surface: 'by default', type: 'pattern', priority: 0.82 },
  { surface: 'on top of', type: 'pattern', priority: 0.8 },
  { surface: 'make sure', type: 'phrasal_verb', priority: 0.84 },
  { surface: 'a number of', type: 'pattern', priority: 0.76 },
];

type Span = RawPhrase & { start: number; end: number };

function phrase(text: string, start: number, end: number, type: ExpressionType, priority: number): Span {
  const surface = text.slice(start, end);
  return {
    blockId: '',
    surface,
    canonical: normalizeCanonical(surface),
    meaningZh: '',
    type,
    priority,
    start,
    end,
  };
}

function tokenize(text: string): Array<{ lower: string; start: number; end: number }> {
  const tokens: Array<{ lower: string; start: number; end: number }> = [];
  const pattern = /[A-Za-z]+(?:'[A-Za-z]+)?(?:-[A-Za-z]+)*/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const before = match.index > 0 ? text[match.index - 1] : '';
    if (before === '/' || before === '@' || before === '.') continue;
    tokens.push({ lower: match[0].toLowerCase(), start: match.index, end: match.index + match[0].length });
  }
  return tokens;
}

function spaced(text: string, left: number, right: number): boolean {
  return /^\s+$/.test(text.slice(left, right));
}

function verbish(word: string): boolean {
  return word.length > 4 && /(?:ed|ing|ies|es|s)$/.test(word);
}

function mine(text: string, level: AssistanceLevel): Span[] {
  const found: Span[] = [];
  const lower = text.toLowerCase();
  for (const pattern of PATTERNS) {
    let from = 0;
    while (from < lower.length) {
      const index = lower.indexOf(pattern.surface, from);
      if (index < 0) break;
      const before = index === 0 ? '' : lower[index - 1];
      const after = lower[index + pattern.surface.length] ?? '';
      if (!/[a-z0-9]/i.test(before) && !/[a-z0-9]/i.test(after)) {
        found.push(phrase(text, index, index + pattern.surface.length, pattern.type, pattern.priority));
      }
      from = index + pattern.surface.length;
    }
  }

  const tokens = tokenize(text);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];
    const third = tokens[index + 2];
    if (next && !AUX.has(token.lower) && !STOP.has(token.lower) && PARTICLE.has(next.lower) && spaced(text, token.end, next.start)) {
      const end = third && /^(with|to|of|for|from)$/.test(third.lower) && spaced(text, next.end, third.start) ? third.end : next.end;
      found.push(phrase(text, token.start, end, 'phrasal_verb', end === next.end ? 0.74 : 0.8));
    }
    if (STOP.has(token.lower) || BASIC_VERB.has(token.lower)) continue;
    const window = [token];
    for (const follow of [next, third]) {
      if (!follow || !spaced(text, window[window.length - 1].end, follow.start)) break;
      if (STOP.has(follow.lower) || follow.lower.length < 4 || BASIC_VERB.has(follow.lower)) break;
      window.push(follow);
      if (window.some((item) => verbish(item.lower))) continue;
      const priority = window.length >= 3 ? 0.8 : 0.82;
      if (level === 'light' && priority < 0.84) continue;
      const candidate = phrase(text, window[0].start, window[window.length - 1].end, 'pattern', priority);
      if (learningRank(candidate.surface, candidate.type) === 'skip') continue;
      found.push(candidate);
    }
    if (level !== 'strong' || token.lower.length < 9) continue;
    const single = phrase(text, token.start, token.end, 'word', token.lower.length >= 11 ? 0.7 : 0.62);
    if (learningRank(single.surface, 'word') === 'skip') continue;
    found.push(single);
  }
  return found;
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

function separated(a: { start: number; end: number }, b: { start: number; end: number }, gap: number): boolean {
  if (overlaps(a, b)) return false;
  const distance = a.end <= b.start ? b.start - a.end : a.start - b.end;
  return distance >= gap;
}

export function pickChromePhrases(blocks: Array<{ id: string; text: string }>, level: AssistanceLevel): RawPhrase[] {
  const limits = LEVEL_LIMITS[level];
  return blocks.flatMap((block) => {
    const cap = blockAllowance(wordCount(block.text), level);
    const lexicon = findLexemes(block.text, level === 'strong').map((item) => ({ ...item, start: item.start ?? 0, end: item.end ?? 0 }));
    const ranked = [...lexicon, ...mine(block.text, level)].sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0) || b.surface.length - a.surface.length,
    );
    const chosen: Span[] = [];
    for (const item of ranked) {
      if (chosen.length >= cap) break;
      if (!item.surface || item.start == null || item.end == null) continue;
      if (learningRank(item.surface, item.type) === 'skip') continue;
      if ((item.priority ?? 0) < limits.minPriority) continue;
      if (item.type === 'word' && level !== 'strong') continue;
      const span = { start: item.start, end: item.end };
      if (chosen.some((kept) => !separated(kept, span, limits.minGap))) continue;
      chosen.push({ ...item, start: item.start, end: item.end });
    }
    return chosen.map((item) => ({ ...item, blockId: block.id }));
  });
}
