import { LIMITS } from '../shared/limits';
import { normalizeCanonical } from '../shared/normalizer';
import type { ExpressionRecord, ExpressionType, SaveExpressionInput } from '../shared/types';
import { withStore } from './db';

export async function listExpressions(): Promise<ExpressionRecord[]> {
  const rows = await withStore('expressions', 'readonly', (store) => store.getAll());
  return (rows as ExpressionRecord[]).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function knownCanonicals(): Promise<string[]> {
  const rows = await listExpressions();
  return rows.filter((row) => row.known).map((row) => row.canonical);
}

async function findByCanonical(canonical: string): Promise<ExpressionRecord | null> {
  return withStore('expressions', 'readonly', (store) => store.index('canonical').get(canonical));
}

export async function upsertExpression(input: SaveExpressionInput, sourceOrigin?: string): Promise<ExpressionRecord> {
  const canonical = normalizeCanonical(input.canonical || input.surface);
  if (!canonical) throw new Error('empty expression');
  const existing = await findByCanonical(canonical);
  const now = Date.now();
  const type: ExpressionType = input.type || existing?.type || 'other';
  const record: ExpressionRecord = {
    id: existing?.id ?? crypto.randomUUID(),
    canonical,
    surface: input.surface.trim() || existing?.surface || canonical,
    meaningZh: input.meaningZh.trim() || existing?.meaningZh || '',
    type,
    known: input.known ?? existing?.known ?? false,
    saved: input.saved ?? existing?.saved ?? false,
    exampleEn: input.exampleEn?.trim() || existing?.exampleEn,
    sourceOrigin: sourceOrigin || existing?.sourceOrigin,
    pos: input.pos || existing?.pos,
    firstSeenAt: existing?.firstSeenAt ?? now,
    updatedAt: now,
  };
  await withStore('expressions', 'readwrite', (store) => store.put(record));
  return record;
}

export async function deleteExpressions(ids: string[]): Promise<void> {
  for (const id of ids) {
    await withStore('expressions', 'readwrite', (store) => store.delete(id));
  }
}

export async function clearExpressions(): Promise<void> {
  await withStore('expressions', 'readwrite', (store) => store.clear());
}
