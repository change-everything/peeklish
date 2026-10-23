import type { ExpressionRecord, ExpressionType } from './types';

export type LibraryFilter = 'all' | 'saved' | 'known' | ExpressionType;

export function filterExpressions(items: ExpressionRecord[], query: string, filter: LibraryFilter): ExpressionRecord[] {
  const needle = query.trim().toLowerCase();
  return items
    .filter((item) => {
      if (filter === 'saved' && !item.saved) return false;
      if (filter === 'known' && !item.known) return false;
      if (filter !== 'all' && filter !== 'saved' && filter !== 'known' && item.type !== filter) return false;
      if (!needle) return true;
      return [item.surface, item.canonical, item.meaningZh, item.exampleEn ?? '', item.sourceOrigin ?? '']
        .join('\n')
        .toLowerCase()
        .includes(needle);
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
