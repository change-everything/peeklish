export const CHROME_TRANSLATE = 'CHROME_TRANSLATE';
const SEPARATOR = '\n\u241e\n';

type Pair = { sourceLanguage: string; targetLanguage: string };
type TranslatorInstance = { translate(input: string): Promise<string> };
type TranslatorCtor = {
  availability(options: Pair): Promise<string>;
  create(options: Pair & { monitor?: (monitor: EventTarget) => void }): Promise<TranslatorInstance>;
};

const PAIRS: Pair[] = [
  { sourceLanguage: 'en', targetLanguage: 'zh' },
  { sourceLanguage: 'en', targetLanguage: 'zh-Hans' },
];

let singleton: Promise<TranslatorInstance> | null = null;

function translatorCtor(): TranslatorCtor | null {
  const value = (globalThis as { Translator?: TranslatorCtor }).Translator;
  return value ?? null;
}

export function splitTranslated(translated: string, count: number): string[] | null {
  const parts = translated.split(SEPARATOR).map((part) => part.trim());
  if (parts.length !== count) return null;
  return parts;
}

async function loadTranslator(onProgress?: (ratio: number) => void): Promise<TranslatorInstance> {
  const Translator = translatorCtor();
  if (!Translator) throw new Error('missing');
  for (const pair of PAIRS) {
    const availability = await Translator.availability(pair);
    if (availability === 'unavailable') continue;
    return Translator.create({
      ...pair,
      monitor(monitor) {
        monitor.addEventListener('downloadprogress', (event) => {
          const loaded = (event as Event & { loaded?: number }).loaded;
          if (typeof loaded === 'number') onProgress?.(loaded);
        });
      },
    });
  }
  throw new Error('missing');
}

export function chromeTranslator(onProgress?: (ratio: number) => void): Promise<TranslatorInstance> {
  if (!singleton) {
    singleton = loadTranslator(onProgress).catch((error: unknown) => {
      singleton = null;
      throw error;
    });
  }
  return singleton;
}

export async function prepareChromeTranslator(onProgress?: (ratio: number) => void): Promise<'ready' | 'missing'> {
  try {
    await chromeTranslator(onProgress);
    return 'ready';
  } catch {
    return 'missing';
  }
}

export async function translateLines(texts: string[]): Promise<string[]> {
  const pending = texts.map((text) => text.trim()).filter(Boolean);
  if (!pending.length) return texts.map(() => '');
  const translator = await chromeTranslator();
  if (pending.length === 1) {
    const translated = (await translator.translate(pending[0])).trim();
    return texts.map((text) => (text.trim() ? translated : ''));
  }
  const joined = await translator.translate(pending.join(SEPARATOR));
  const parts = splitTranslated(joined, pending.length);
  if (parts) {
    let index = 0;
    return texts.map((text) => (text.trim() ? parts[index++] || '' : ''));
  }
  const singles = await Promise.all(pending.map((text) => translator.translate(text)));
  let index = 0;
  return texts.map((text) => (text.trim() ? (singles[index++] || '').trim() : ''));
}
