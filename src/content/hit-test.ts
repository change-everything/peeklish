export type HitSpan = { blockId: string; start: number; end: number };

export function hitTest(spans: HitSpan[], blockId: string, offset: number): number {
  return spans.findIndex((span) => span.blockId === blockId && offset >= span.start && offset < span.end);
}
