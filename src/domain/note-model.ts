import type { Annotation, ExcerptKind, Note } from '../shared/types';

const SKIP = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'are',
  'was',
  'were',
  'have',
  'has',
  'not',
  'but',
  'you',
  'your',
  'into',
  'when',
  'then',
  'than',
  'can',
  'all',
  'any',
  'its',
  'their',
]);

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

export function noteTitle(exact: string, heading?: string): string {
  const fromHeading = heading?.replace(/\s+/g, ' ').trim();
  if (fromHeading) return clip(fromHeading, 42);
  const line = exact
    .split('\n')
    .map((item) => item.trim())
    .find(Boolean);
  return clip(line || '摘录', 42);
}

export function noteTags(exact: string, heading?: string): string[] {
  const found = `${heading ?? ''}\n${exact}`.match(/\b[A-Za-z][A-Za-z0-9]{2,}\b/g) ?? [];
  const tags: string[] = [];
  for (const word of found) {
    if (SKIP.has(word.toLowerCase())) continue;
    if (word[0] === word[0].toLowerCase() && word.length < 8) continue;
    if (tags.some((tag) => tag.toLowerCase() === word.toLowerCase())) continue;
    tags.push(word);
    if (tags.length >= 3) break;
  }
  return tags;
}

export function orderNotes(notes: Note[], annotations: Annotation[]): Note[] {
  const offsets = new Map(annotations.map((item) => [item.id, item.docOffset]));
  return notes
    .filter((note) => !note.deletedAt)
    .sort((left, right) => {
      const leftOffset = left.annotationId ? (offsets.get(left.annotationId) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
      const rightOffset = right.annotationId ? (offsets.get(right.annotationId) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
      if (leftOffset !== rightOffset) return leftOffset - rightOffset;
      return left.createdAt - right.createdAt;
    });
}

export function formatNoteTime(at: number, now = Date.now()): string {
  const date = new Date(at);
  const today = new Date(now);
  const hm = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  const sameDay =
    date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
  if (sameDay) return `今天 ${hm}`;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${hm}`;
}

export function notesToMarkdown(
  doc: { title: string; url: string },
  items: Array<{ title: string; body: string; quote?: string; quoteKind?: ExcerptKind; lang?: string; ai?: string }>,
): string {
  const lines = [`# ${doc.title}`, '', `来源：${doc.url}`, ''];
  for (const item of items) {
    lines.push(`## ${item.title}`, '');
    if (item.quote) {
      if (item.quoteKind === 'code') {
        lines.push(`\`\`\`${item.lang ?? ''}`, item.quote, '```', '');
      } else {
        lines.push(item.quote.split('\n').map((line) => `> ${line}`).join('\n'), '');
      }
    }
    if (item.body.trim()) lines.push(item.body.trim(), '');
    if (item.ai?.trim()) lines.push('AI 解释：', '', item.ai.trim(), '');
  }
  return lines.join('\n').trim() + '\n';
}
