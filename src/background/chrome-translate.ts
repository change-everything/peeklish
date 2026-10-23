import { browser } from 'wxt/browser';
import { CHROME_TRANSLATE } from '../chrome/builtin-translator';
import { ProviderError } from '../shared/error-text';

async function ensureOffscreen(): Promise<void> {
  const contexts = await browser.runtime.getContexts?.({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts && contexts.length > 0) return;
  try {
    await browser.offscreen.createDocument({
      url: browser.runtime.getURL('/offscreen.html'),
      reasons: ['DOM_PARSER'],
      justification: 'Run Chrome built-in translation outside the service worker',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (!/exists|single offscreen/i.test(message)) throw error;
  }
}

export async function translateWithChrome(texts: string[]): Promise<string[]> {
  if (!texts.length) return [];
  await ensureOffscreen();
  let response = (await browser.runtime.sendMessage({ type: CHROME_TRANSLATE, texts })) as
    | { ok: true; translations: string[] }
    | { ok: false; error?: string }
    | undefined;
  if (!response) {
    await new Promise((resolve) => setTimeout(resolve, 80));
    response = (await browser.runtime.sendMessage({ type: CHROME_TRANSLATE, texts })) as typeof response;
  }
  if (!response?.ok || !Array.isArray(response.translations)) throw new ProviderError('chrome');
  return response.translations;
}
