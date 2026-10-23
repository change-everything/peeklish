import { ANALYSIS_PROMPT_VERSION, TRANSLATION_PROMPT_VERSION } from './limits';

export async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function analysisCacheKey(input: {
  model: string;
  apiOrigin: string;
  text: string;
  level?: string;
}): Promise<string> {
  return sha256([ANALYSIS_PROMPT_VERSION, input.level ?? 'medium', input.model, input.apiOrigin, 'zh-CN', input.text].join('\n'));
}

export async function translationCacheKey(input: {
  model: string;
  apiOrigin: string;
  kind: string;
  selection: string;
  context: string;
  mode: 'translate' | 'explain' | 'polish';
}): Promise<string> {
  return sha256(
    [TRANSLATION_PROMPT_VERSION, input.mode, input.model, input.apiOrigin, input.kind, input.selection, input.context].join('\n'),
  );
}
