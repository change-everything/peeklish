import type { SelectionKind } from './types';

export function classifySelection(text: string): SelectionKind {
  const trimmed = text.trim();
  const lines = trimmed.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > 1) return 'paragraph';
  const words = trimmed.split(/\s+/).filter(Boolean);
  const sentenceBreaks = trimmed.match(/[.!?](\s|$)/g)?.length ?? 0;
  if (sentenceBreaks > 1) return 'paragraph';
  if (words.length > 18 || (sentenceBreaks === 1 && words.length > 8)) return 'sentence';
  if (words.length > 10) return 'sentence';
  if (words.length <= 1) return 'word';
  return 'phrase';
}

export function sentenceWindow(blockText: string, selected: string, max = 300): string {
  const idx = blockText.indexOf(selected);
  if (idx < 0) return '';
  const start = Math.max(0, idx - Math.floor(max / 2));
  const end = Math.min(blockText.length, idx + selected.length + Math.floor(max / 2));
  let slice = blockText.slice(start, end).trim();
  if (slice.length > max) slice = slice.slice(0, max);
  if (slice === selected.trim()) return '';
  return slice;
}
