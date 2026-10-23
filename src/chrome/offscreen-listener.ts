import { CHROME_TRANSLATE, translateLines } from './builtin-translator';
import { browser } from 'wxt/browser';

browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object' || (message as { type?: unknown }).type !== CHROME_TRANSLATE) return;
  const texts = Array.isArray((message as { texts?: unknown }).texts)
    ? (message as { texts: unknown[] }).texts.filter((item): item is string => typeof item === 'string')
    : [];
  void translateLines(texts)
    .then((translations) => sendResponse({ ok: true, translations }))
    .catch(() => sendResponse({ ok: false }));
  return true;
});
