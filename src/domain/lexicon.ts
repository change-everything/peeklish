import type { ExpressionType, RawPhrase } from '../shared/types';

type Lexeme = {
  surface: string;
  canonical: string;
  meaningZh: string;
  noteZh?: string;
  type: ExpressionType;
  priority: number;
  pos?: string;
  word?: boolean;
};

const LEXICON: Lexeme[] = [
  { surface: 'take into account', canonical: 'take into account', meaningZh: '考虑到；把……纳入考虑', noteZh: '强调做决定前纳入某项因素', type: 'idiom', priority: 0.95 },
  { surface: 'in the event of', canonical: 'in the event of', meaningZh: '如果发生；在……的情况下', type: 'connector', priority: 0.94 },
  { surface: 'fall back to', canonical: 'fall back to', meaningZh: '回退使用；转而依赖', type: 'phrasal_verb', priority: 0.93 },
  { surface: 'as opposed to', canonical: 'as opposed to', meaningZh: '而不是；与……相反', type: 'connector', priority: 0.9 },
  { surface: 'out of the box', canonical: 'out of the box', meaningZh: '开箱即用；无需额外设置', type: 'idiom', priority: 0.9 },
  { surface: 'as a result of', canonical: 'as a result of', meaningZh: '由于；因为', type: 'connector', priority: 0.88 },
  { surface: 'provided that', canonical: 'provided that', meaningZh: '前提是；只要', type: 'connector', priority: 0.9 },
  { surface: 'in addition to', canonical: 'in addition to', meaningZh: '除……之外还', type: 'connector', priority: 0.84 },
  { surface: 'as long as', canonical: 'as long as', meaningZh: '只要', type: 'connector', priority: 0.82 },
  { surface: 'even though', canonical: 'even though', meaningZh: '即使', type: 'connector', priority: 0.8 },
  { surface: 'in terms of', canonical: 'in terms of', meaningZh: '就……而言', type: 'connector', priority: 0.82 },
  { surface: 'carry out', canonical: 'carry out', meaningZh: '执行；开展', type: 'phrasal_verb', priority: 0.9 },
  { surface: 'figure out', canonical: 'figure out', meaningZh: '弄清楚；想出', type: 'phrasal_verb', priority: 0.86 },
  { surface: 'based on', canonical: 'based on', meaningZh: '基于', type: 'pattern', priority: 0.78 },
  { surface: 'as a result', canonical: 'as a result', meaningZh: '因此；结果是', type: 'connector', priority: 0.8 },
  { surface: 'a variety of', canonical: 'a variety of', meaningZh: '各种各样的', type: 'pattern', priority: 0.7 },
  { surface: 'rely on', canonical: 'rely on', meaningZh: '依赖', type: 'phrasal_verb', priority: 0.8 },
  { surface: 'consistent with', canonical: 'consistent with', meaningZh: '与……一致', type: 'pattern', priority: 0.76 },
  { surface: 'reliability', canonical: 'reliability', meaningZh: '可靠性；可信赖程度', type: 'word', priority: 0.62, pos: 'n.', word: true },
  { surface: 'maintainable', canonical: 'maintainable', meaningZh: '易于维护的', type: 'word', priority: 0.6, pos: 'adj.', word: true },
  { surface: 'intuitive', canonical: 'intuitive', meaningZh: '直观的', type: 'word', priority: 0.58, pos: 'adj.', word: true },
  { surface: 'expressive', canonical: 'expressive', meaningZh: '表达力强的', type: 'word', priority: 0.58, pos: 'adj.', word: true },
];

function boundaryMatch(text: string, needle: string): Array<{ start: number; end: number; surface: string }> {
  const hay = text.toLowerCase();
  const target = needle.toLowerCase();
  const found: Array<{ start: number; end: number; surface: string }> = [];
  let from = 0;
  while (from < hay.length) {
    const index = hay.indexOf(target, from);
    if (index < 0) break;
    const before = index === 0 ? '' : hay[index - 1];
    const after = hay[index + target.length] ?? '';
    const leftOk = !/[a-z0-9]/i.test(before);
    const rightOk = !/[a-z0-9]/i.test(after);
    if (leftOk && rightOk) found.push({ start: index, end: index + needle.length, surface: text.slice(index, index + needle.length) });
    from = index + target.length;
  }
  return found;
}

export function findLexemes(text: string, includeWords: boolean): RawPhrase[] {
  const occupied: Array<{ start: number; end: number }> = [];
  const phrases: RawPhrase[] = [];
  const entries = [...LEXICON].filter((item) => includeWords || !item.word).sort((a, b) => b.surface.length - a.surface.length);
  for (const entry of entries) {
    for (const hit of boundaryMatch(text, entry.surface)) {
      if (occupied.some((span) => hit.start < span.end && span.start < hit.end)) continue;
      occupied.push(hit);
      phrases.push({
        blockId: '',
        surface: hit.surface,
        canonical: entry.canonical,
        meaningZh: entry.meaningZh,
        noteZh: entry.noteZh,
        type: entry.type,
        priority: entry.priority,
        pos: entry.pos,
        start: hit.start,
        end: hit.end,
      });
    }
  }
  return phrases;
}

export function lexiconPhrases(blocks: Array<{ id: string; text: string }>): RawPhrase[] {
  return blocks.flatMap((block) => findLexemes(block.text, true).map((phrase) => ({ ...phrase, blockId: block.id })));
}
