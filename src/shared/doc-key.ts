import { canInjectPage } from './api-url';

const TRACKING = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'fbclid',
  'gclid',
  'ref',
  'source',
]);

export function documentKey(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!canInjectPage(rawUrl).ok) return null;
  let path = url.pathname.replace(/\/index\.html$/, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  const params = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING.has(key.toLowerCase()))
    .sort(([left], [right]) => left.localeCompare(right));
  const next = new URL(`${url.origin}${path}`);
  for (const [key, value] of params) next.searchParams.append(key, value);
  if (url.hash.startsWith('#/') || url.hash.startsWith('#!')) next.hash = url.hash;
  return next.toString();
}
