export type ParsedApiBase = {
  origin: string;
  chatUrl: string;
};

export function parseApiBaseUrl(input: string): ParsedApiBase | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 300) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.hash) return null;
  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = path.endsWith('/chat/completions') ? path : `${path}/chat/completions`;
  url.hash = '';
  return { origin: url.origin, chatUrl: url.toString() };
}

export function canInjectPage(rawUrl: string): { ok: true; origin: string; host: string } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: '当前页面不支持' };
  }
  const localHttp = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if (url.protocol !== 'https:' && !localHttp) return { ok: false, reason: '当前页面不支持' };
  if (url.hostname === 'chrome.google.com' || url.hostname === 'chromewebstore.google.com') {
    return { ok: false, reason: '当前页面不支持' };
  }
  return { ok: true, origin: url.origin, host: url.host };
}

export function originMatchPattern(origin: string): string {
  return `${origin}/*`;
}

export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function scriptIdForOrigin(origin: string): string {
  return `peeklish_${fnv1a(origin)}`;
}
