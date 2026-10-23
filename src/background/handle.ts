import { browser } from 'wxt/browser';
import { fnv1a, parseApiBaseUrl } from '../shared/api-url';
import { analysisCacheKey, translationCacheKey } from '../shared/cache-keys';
import { errorText, ProviderError } from '../shared/error-text';
import { LIMITS } from '../shared/limits';
import type { AssistanceLevel, ExpressionType, Result, RuntimeConfig, SelectionKind } from '../shared/types';
import { nextBudget, type BudgetState } from '../domain/budget';
import { pickChromePhrases } from '../domain/chrome-phrases';
import { translateWithChrome } from './chrome-translate';
import { readModelOutput } from '../shared/json';
import { extractJson } from '../shared/json';
import { completeChat, providerCodeFromStatus, providerMessage } from '../domain/openai';
import {
  buildAnalysisMessages,
  buildExplainMessages,
  buildPolishMessages,
  buildTestMessages,
  buildTranslationMessages,
} from '../domain/prompts';
import { bindPhrasesToBlocks, parseAnalysis, parseExplanation, parsePolish, parseTranslation, type ParsedPhrase } from '../domain/schema';
import { selectMarks } from '../domain/select-marks';
import { cacheGet, cacheSet } from '../storage/cache';
import { knownCanonicals, upsertExpression } from '../storage/expressions';
import { deleteApiKey, getApiKey } from '../storage/keys';
import { getSettings } from '../storage/settings';
import { getSite } from '../storage/sites';
import { canInjectPage } from '../shared/api-url';
import { isEnglishSelection } from '../shared/english';

type Sender = Browser.runtime.MessageSender;

const budgets = new Map<number, { url: string; state: BudgetState }>();
const usage = new Map<number, { requests: number; chars: number }>();
const aborts = new Map<number, { analysis?: AbortController; selection?: AbortController }>();
let quietUntil = 0;
let quietCode = 'network';
let authStamp = '';

const analysisTail = serialLane();
const selectionTail = serialLane();

function serialLane(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail = Promise.resolve();
  return (task) => {
    const run = tail.then(task, task);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

function trusted(sender: Sender): boolean {
  return Boolean(sender.url && sender.url.startsWith(browser.runtime.getURL('')));
}

function pageOrigin(sender: Sender): string | null {
  if (!sender.tab?.url) return null;
  const page = canInjectPage(sender.tab.url);
  return page.ok ? page.origin : null;
}

async function rememberError(code: string): Promise<void> {
  await browser.storage.session.set({ lastError: { code, message: errorText(code), at: Date.now() } });
}

async function clearError(): Promise<void> {
  await browser.storage.session.remove('lastError');
}

function fail(code: string, message?: string): Result<never> {
  return { ok: false, code, error: message || errorText(code) };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(new ProviderError('aborted'));
    };
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}

function failureCode(error: unknown): string {
  if (error instanceof ProviderError) return error.code;
  const message = error instanceof Error ? error.message : '';
  if (/^(NO_JSON|BAD_ANALYSIS|BAD_TRANSLATION|BAD_EXPLANATION|BAD_POLISH)$/.test(message)) return 'bad-response';
  return 'network';
}

async function callModel(input: {
  apiBaseUrl: string;
  modelId: string;
  apiKey: string;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  temperature: number;
  signal: AbortSignal;
  maxTokens?: number;
}): Promise<string> {
  const parsed = parseApiBaseUrl(input.apiBaseUrl);
  if (!parsed || !input.modelId.trim() || !input.apiKey) throw new ProviderError('config');
  const allowed = await browser.permissions.contains({ origins: [`${parsed.origin}/*`] });
  if (!allowed) throw new ProviderError('permission');
  let attempt = 0;
  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LIMITS.requestTimeoutMs);
    const abort = () => controller.abort();
    input.signal.addEventListener('abort', abort);
    try {
      const result = await completeChat({
        url: parsed.chatUrl,
        apiKey: input.apiKey,
        model: input.modelId.trim(),
        messages: input.messages,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
        signal: controller.signal,
      });
      const code = providerCodeFromStatus(result.status);
      if (code === 'rate-limit' && attempt < LIMITS.rateLimitRetries) {
        attempt += 1;
        await sleep(800 * 2 ** (attempt - 1), input.signal);
        continue;
      }
      if (code) throw new ProviderError(code);
      const text = readModelOutput(result.raw, result.text);
      if (!text.trim()) throw new ProviderError('bad-response');
      providerMessage(result.raw);
      return text;
    } catch (error) {
      if (input.signal.aborted) throw new ProviderError('aborted');
      if (error instanceof ProviderError) throw error;
      if (controller.signal.aborted) throw new ProviderError('timeout');
      throw new ProviderError('network');
    } finally {
      clearTimeout(timer);
      input.signal.removeEventListener('abort', abort);
    }
  }
}

function signalFor(tabId: number, lane: 'analysis' | 'selection'): AbortSignal {
  const entry = aborts.get(tabId) ?? {};
  entry[lane]?.abort();
  const controller = new AbortController();
  entry[lane] = controller;
  aborts.set(tabId, entry);
  return controller.signal;
}

function cancelTab(tabId: number): void {
  const entry = aborts.get(tabId);
  entry?.analysis?.abort();
  entry?.selection?.abort();
  aborts.delete(tabId);
}

async function noteUsage(tabId: number, chars: number): Promise<void> {
  const current = usage.get(tabId) ?? { requests: 0, chars: 0 };
  current.requests += 1;
  current.chars += chars;
  usage.set(tabId, current);
  await browser.storage.session.set({ [`usage:${tabId}`]: current });
}

function readShortStrings(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const found: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const text = item.replace(/\s+/g, ' ').trim();
    if (!text || text.length > 120) continue;
    found.push(text);
    if (found.length >= max) break;
  }
  return found;
}

function readBlocks(value: unknown): Array<{ id: string; text: string }> | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > LIMITS.maxBlocks) return null;
  const blocks: Array<{ id: string; text: string }> = [];
  let chars = 0;
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const id = (item as { id?: unknown }).id;
    const text = (item as { text?: unknown }).text;
    if (typeof id !== 'string' || typeof text !== 'string') return null;
    if (!id || id.length > 40 || text.length > LIMITS.maxBlockChars) return null;
    chars += text.length;
    if (chars > LIMITS.maxBatchChars) return null;
    blocks.push({ id, text });
  }
  return blocks;
}

async function runtimeConfig(origin: string): Promise<RuntimeConfig> {
  const [settings, site, key] = await Promise.all([
    getSettings(),
    getSite(origin),
    getSettings().then((settings) => getApiKey(settings.keyPersistence)),
  ]);
  return {
    siteEnabled: Boolean(site?.enabled),
    assistanceLevel: settings.assistanceLevel,
    autoMarkEnabled: settings.autoMarkEnabled,
    hoverEnabled: settings.hoverEnabled,
    selectionTranslateEnabled: settings.selectionTranslateEnabled,
    aiConsent: Boolean(site?.aiTextConsentAt),
    hasKey: Boolean(key),
    engine: settings.engine,
    maxAutoCharsPerPage: settings.maxAutoCharsPerPage,
  };
}

async function analyze(sender: Sender, message: Record<string, unknown>): Promise<Result<{ marks: unknown[] }>> {
  const origin = pageOrigin(sender);
  const tabId = sender.tab?.id;
  if (!origin || tabId == null) return fail('unsupported');
  const config = await runtimeConfig(origin);
  if (!config.siteEnabled) return fail('disabled');
  const blocks = readBlocks(message.blocks);
  if (!blocks) return fail('config', '分析内容超出限制，已跳过');
  const existing = Array.isArray(message.existingCanonicals)
    ? message.existingCanonicals.filter((item): item is string => typeof item === 'string').slice(0, LIMITS.maxExistingCanonicals)
    : [];
  const known = await knownCanonicals().catch(() => []);
  const blockedSurfaces = readShortStrings(message.blockedSurfaces, 40);
  const settings = await getSettings();
  if (settings.engine === 'chrome') {
    try {
      const phrases = await glossWithChrome(pickChromePhrases(blocks, settings.assistanceLevel));
      const marks = selectMarks({
        blocks,
        phrases,
        knownCanonicals: known,
        existingCanonicals: existing,
        blockedSurfaces,
        level: settings.assistanceLevel,
      });
      await clearError();
      return { ok: true, data: { marks } };
    } catch (error) {
      const code = failureCode(error);
      await rememberError(code);
      return fail(code);
    }
  }
  if (!config.aiConsent) return fail('consent');
  if (!config.hasKey) return fail('config');
  if (Date.now() < quietUntil) return fail(quietCode);
  const stamp = `${settings.apiBaseUrl}\n${settings.modelId}\n${fnv1a(await getApiKey(settings.keyPersistence))}`;
  if (authStamp && authStamp === stamp) return fail('auth');
  const parsed = parseApiBaseUrl(settings.apiBaseUrl);
  if (!parsed) return fail('config');
  const signal = signalFor(tabId, 'analysis');
  return analysisTail(async () => {
    if (signal.aborted) return fail('aborted');
    const key = await getApiKey(settings.keyPersistence);
    const pending: Array<{ id: string; text: string; cacheKey: string }> = [];
    const collected: ParsedPhrase[] = [];
    for (const block of blocks) {
      const cacheKey = await analysisCacheKey({
        model: settings.modelId,
        apiOrigin: parsed.origin,
        text: block.text,
        level: settings.assistanceLevel,
      });
      const cached = await cacheGet<Omit<ParsedPhrase, 'blockId'>[]>('analysisCache', cacheKey);
      if (cached) collected.push(...cached.map((phrase) => ({ ...phrase, blockId: block.id })));
      else pending.push({ ...block, cacheKey });
    }
    if (pending.length) {
      const pageUrl = sender.tab?.url || origin;
      const current = budgets.get(tabId);
      let state = current && current.url === pageUrl ? current.state : { chars: 0, keys: [] };
      const billable = pending.filter((block) => {
        const step = nextBudget(state, block.cacheKey, block.text.length, settings.maxAutoCharsPerPage);
        state = step.state;
        return step.status === 'ok';
      });
      if (!billable.length && pending.length) {
        await rememberError('budget');
        return fail('budget');
      }
      let noted = false;
      try {
        const text = await callModel({
          apiBaseUrl: settings.apiBaseUrl,
          modelId: settings.modelId,
          apiKey: key,
          messages: buildAnalysisMessages(billable, settings.assistanceLevel, known),
          temperature: 0.2,
          maxTokens: 4096,
          signal,
        });
        await noteUsage(tabId, billable.reduce((sum, block) => sum + block.text.length, 0));
        noted = true;
        const phrases = bindPhrasesToBlocks(billable, parseAnalysis(extractJson(text)));
        for (const block of billable) {
          const own = phrases
            .filter((phrase) => phrase.blockId === block.id)
            .map(({ blockId: _blockId, ...phrase }) => phrase);
          await cacheSet('analysisCache', block.cacheKey, own);
          collected.push(...own.map((phrase) => ({ ...phrase, blockId: block.id })));
        }
        budgets.set(tabId, { url: pageUrl, state });
        await clearError();
        authStamp = '';
      } catch (error) {
        const code = failureCode(error);
        if (!noted && code === 'bad-response') await noteUsage(tabId, billable.reduce((sum, block) => sum + block.text.length, 0));
        if (code === 'aborted') return fail('aborted');
        if (code === 'auth') authStamp = stamp;
        if (code === 'rate-limit' || code === 'network' || code === 'timeout') {
          quietUntil = Date.now() + (code === 'rate-limit' ? LIMITS.rateLimitCooldownMs : LIMITS.networkCooldownMs);
          quietCode = code;
        }
        await rememberError(code);
        return fail(code);
      }
    }
    const marks = selectMarks({
      blocks,
      phrases: collected,
      knownCanonicals: known,
      existingCanonicals: existing,
      blockedSurfaces,
      level: settings.assistanceLevel,
    });
    return { ok: true, data: { marks } };
  });
}

async function glossWithChrome<T extends { surface: string; meaningZh: string }>(phrases: T[]): Promise<T[]> {
  const surfaces = [...new Set(phrases.filter((phrase) => !/[\u4e00-\u9fff]/.test(phrase.meaningZh)).map((phrase) => phrase.surface))];
  const gloss = new Map<string, string>();
  if (surfaces.length) {
    const translated = await translateWithChrome(surfaces);
    surfaces.forEach((surface, index) => gloss.set(surface, translated[index]?.trim() || ''));
  }
  return phrases.flatMap((phrase) => {
    if (/[\u4e00-\u9fff]/.test(phrase.meaningZh)) return [phrase];
    const meaning = gloss.get(phrase.surface) || '';
    return /[\u4e00-\u9fff]/.test(meaning) ? [{ ...phrase, meaningZh: meaning }] : [];
  });
}

async function chromeSelection(selectedText: string, kind: SelectionKind, level: AssistanceLevel) {
  const phrases = pickChromePhrases([{ id: 's', text: selectedText }], level)
    .filter((phrase) => phrase.type !== 'word')
    .slice(0, 4);
  const translated = await translateWithChrome([selectedText, ...phrases.map((phrase) => phrase.surface)]);
  const translation = translated[0]?.trim() || '';
  if (!translation) throw new ProviderError('chrome');
  const keyPhrases = phrases.map((phrase, index) => ({
    surface: phrase.surface,
    canonical: phrase.canonical || phrase.surface,
    meaningZh: translated[index + 1]?.trim() || phrase.meaningZh,
    type: phrase.type || 'other',
  }));
  if (kind === 'sentence' || kind === 'paragraph') return { kind, source: selectedText, translationZh: translation, keyPhrases };
  return { kind, source: selectedText, meaningZh: translation, keyPhrases: [] };
}

async function translateLike(
  sender: Sender,
  mode: 'translate' | 'explain' | 'polish',
  message: Record<string, unknown>,
): Promise<Result<unknown>> {
  const origin = pageOrigin(sender);
  const tabId = sender.tab?.id;
  if (!origin || tabId == null) return fail('unsupported');
  const config = await runtimeConfig(origin);
  if (!config.siteEnabled) return fail('disabled');
  const selectedText = typeof message.selectedText === 'string' ? message.selectedText.trim() : '';
  if (!selectedText) return fail('config');
  if (selectedText.length > LIMITS.maxSelectionChars) return fail('too-long');
  if (!isEnglishSelection(selectedText)) return fail('not-english');
  const context = typeof message.context === 'string' ? message.context.trim().slice(0, LIMITS.maxContextChars) : '';
  const kind = (['word', 'phrase', 'sentence', 'paragraph'] as const).includes(message.kind as SelectionKind)
    ? (message.kind as SelectionKind)
    : 'phrase';
  const settings = await getSettings();
  if (settings.engine === 'chrome') {
    if (mode !== 'translate') return fail('needs-ai');
    try {
      const data = await chromeSelection(selectedText, kind, settings.assistanceLevel);
      await clearError();
      return { ok: true, data };
    } catch (error) {
      const code = failureCode(error);
      if (code !== 'aborted') await rememberError(code);
      return fail(code);
    }
  }
  if (!config.aiConsent) return fail('consent');
  if (!config.hasKey) return fail('config');
  const parsed = parseApiBaseUrl(settings.apiBaseUrl);
  if (!parsed) return fail('config');
  const signal = signalFor(tabId, 'selection');
  return selectionTail(async () => {
    const key = await getApiKey(settings.keyPersistence);
    const cacheKey = await translationCacheKey({
      model: settings.modelId,
      apiOrigin: parsed.origin,
      kind,
      selection: selectedText,
      context,
      mode,
    });
    const cached = await cacheGet<unknown>('translationCache', cacheKey);
    if (cached) return { ok: true, data: cached };
    try {
      const messages =
        mode === 'explain'
          ? buildExplainMessages({ selectedText, context })
          : mode === 'polish'
            ? buildPolishMessages({ selectedText, context })
            : buildTranslationMessages({ kind, selectedText, context });
      const text = await callModel({
        apiBaseUrl: settings.apiBaseUrl,
        modelId: settings.modelId,
        apiKey: key,
        messages,
        temperature: mode === 'translate' ? 0.2 : 0.3,
        signal,
      });
      const data =
        mode === 'explain'
          ? parseExplanation(extractJson(text))
          : mode === 'polish'
            ? parsePolish(extractJson(text))
            : parseTranslation(extractJson(text), kind);
      await cacheSet('translationCache', cacheKey, data);
      await noteUsage(tabId, selectedText.length + context.length);
      await clearError();
      authStamp = '';
      return { ok: true, data };
    } catch (error) {
      const code = failureCode(error);
      if (code === 'auth') authStamp = `${settings.apiBaseUrl}\n${settings.modelId}\n${fnv1a(key)}`;
      if (code !== 'aborted') await rememberError(code);
      return fail(code);
    }
  });
}

function expressionInput(value: unknown): {
  canonical: string;
  surface: string;
  meaningZh: string;
  type: ExpressionType;
  known?: boolean;
  saved?: boolean;
  exampleEn?: string;
  pos?: string;
} | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.surface !== 'string' || record.surface.trim().length > 200) return null;
  if (typeof record.canonical !== 'string' || record.canonical.trim().length > 200) return null;
  const meaning = typeof record.meaningZh === 'string' ? record.meaningZh.slice(0, LIMITS.maxMeaning) : '';
  const types: ExpressionType[] = ['phrasal_verb', 'idiom', 'connector', 'pattern', 'word', 'other'];
  const type = types.includes(record.type as ExpressionType) ? (record.type as ExpressionType) : 'other';
  return {
    canonical: record.canonical,
    surface: record.surface,
    meaningZh: meaning,
    type,
    known: record.known === true,
    saved: record.saved === true,
    exampleEn: typeof record.exampleEn === 'string' ? record.exampleEn.slice(0, 400) : undefined,
    pos: typeof record.pos === 'string' ? record.pos.slice(0, 16) : undefined,
  };
}

export async function handleMessage(message: unknown, sender: Sender): Promise<Result<unknown>> {
  if (!message || typeof message !== 'object' || typeof (message as { type?: unknown }).type !== 'string') {
    return fail('config');
  }
  const body = message as Record<string, unknown>;
  if (body.type === 'CANCEL_TAB') {
    if (sender.tab?.id != null) cancelTab(sender.tab.id);
    return { ok: true, data: null };
  }
  if (body.type === 'GET_CONFIG') {
    const origin = pageOrigin(sender);
    if (!origin) return fail('unsupported');
    return { ok: true, data: await runtimeConfig(origin) };
  }
  if (body.type === 'ANALYZE_BLOCKS') return analyze(sender, body);
  if (body.type === 'TRANSLATE_SELECTION') return translateLike(sender, 'translate', body);
  if (body.type === 'EXPLAIN_SELECTION') return translateLike(sender, 'explain', body);
  if (body.type === 'POLISH_SELECTION') return translateLike(sender, 'polish', body);
  if (body.type === 'MARK_KNOWN' || body.type === 'SAVE_EXPRESSION') {
    const origin = pageOrigin(sender);
    if (!origin) return fail('unsupported');
    const input =
      body.type === 'SAVE_EXPRESSION'
        ? expressionInput(body.expression)
        : expressionInput({
            canonical: body.canonical,
            surface: body.surface,
            meaningZh: body.meaningZh,
            type: body.type === 'MARK_KNOWN' ? body.expressionType : body.type,
            known: true,
          });
    if (!input) return fail('config');
    if (body.type === 'MARK_KNOWN') input.known = true;
    if (body.type === 'SAVE_EXPRESSION') input.saved = true;
    await upsertExpression(input, origin);
    return { ok: true, data: null };
  }
  if (!trusted(sender)) return fail('permission');
  if (body.type === 'GET_PAGE_USAGE') {
    const tabId = typeof body.tabId === 'number' ? body.tabId : -1;
    const stored = await browser.storage.session.get(`usage:${tabId}`);
    const value = stored[`usage:${tabId}`] as { requests?: number; chars?: number } | undefined;
    const memory = usage.get(tabId);
    return { ok: true, data: { requests: memory?.requests ?? value?.requests ?? 0, chars: memory?.chars ?? value?.chars ?? 0 } };
  }
  if (body.type === 'TEST_CONNECTION') {
    const apiBaseUrl = typeof body.apiBaseUrl === 'string' ? body.apiBaseUrl : '';
    const modelId = typeof body.modelId === 'string' ? body.modelId : '';
    const apiKey = typeof body.apiKey === 'string' && body.apiKey.trim() ? body.apiKey.trim() : await getApiKey((await getSettings()).keyPersistence);
    const controller = new AbortController();
    try {
      const text = await callModel({
        apiBaseUrl,
        modelId,
        apiKey,
        messages: buildTestMessages(),
        temperature: 0,
        maxTokens: 32,
        signal: controller.signal,
      });
      return { ok: true, data: { reply: text.slice(0, 80) } };
    } catch (error) {
      const code = error instanceof ProviderError ? error.code : 'network';
      return fail(code);
    }
  }
  if (body.type === 'DELETE_KEY') {
    await deleteApiKey();
    authStamp = '';
    return { ok: true, data: null };
  }
  return fail('config');
}

export function resetBackgroundState(): void {
  budgets.clear();
  usage.clear();
  quietUntil = 0;
  authStamp = '';
}
