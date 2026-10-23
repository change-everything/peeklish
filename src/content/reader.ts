import { looseCanonical, sameExpression, wordCount } from '../domain/learning-value';
import { LEVEL_LIMITS, LIMITS } from '../shared/limits';
import { classifySelection, sentenceWindow } from '../shared/classify';
import { normalizeCanonical } from '../shared/normalizer';
import type { KeyPhrase, LocatedPhrase, RuntimeConfig, SelectionKind, TranslationPayload } from '../shared/types';
import { collectBlocks, pageLabels, type CollectedBlock } from './block-collector';
import { clearHighlights, ensureHighlightStyle, highlightsAvailable, syncHighlights } from './highlights';
import { Popover, type TranslateModel } from './popover';
import { buildIndex, rangeForOffsets, offsetInIndex, type IndexedText } from './text-index';
import { speakEnglish } from './speak';

type Failure = { ok: false; code: string; error: string };

export type Bridge = {
  alive?: () => boolean;
  getConfig: () => Promise<RuntimeConfig>;
  analyze: (body: {
    requestId: string;
    blocks: Array<{ id: string; text: string }>;
    existingCanonicals: string[];
    blockedSurfaces?: string[];
  }) => Promise<{ ok: true; data: { marks: LocatedPhrase[] } } | Failure>;
  translate: (body: {
    requestId: string;
    selectedText: string;
    context?: string;
    kind: SelectionKind;
  }) => Promise<{ ok: true; data: TranslationPayload } | Failure>;
  explain: (body: { requestId: string; selectedText: string; context?: string }) => Promise<{ ok: true; data: { explanationZh: string } } | Failure>;
  polish: (body: {
    requestId: string;
    selectedText: string;
    context?: string;
  }) => Promise<{ ok: true; data: { polishedEn: string; noteZh: string } } | Failure>;
  markKnown: (body: { canonical: string; surface: string; meaningZh?: string; type?: LocatedPhrase['type'] }) => Promise<void>;
  saveExpression: (body: {
    canonical: string;
    surface: string;
    meaningZh: string;
    type: LocatedPhrase['type'];
    exampleEn?: string;
    pos?: string;
    saved?: boolean;
    known?: boolean;
  }) => Promise<void>;
  cancel: () => void;
};

type LiveMark = LocatedPhrase & { range: Range; indexed: IndexedText };

function elementOf(node: Node): Element | null {
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}

function rangeHitsSkipped(range: Range): boolean {
  const selector = 'a, button, input, textarea, select, code, pre, kbd, samp, h1, h2, h3, h4, h5, h6';
  if (elementOf(range.startContainer)?.closest(selector) || elementOf(range.endContainer)?.closest(selector)) return true;
  const ancestor = range.commonAncestorContainer;
  const root = ancestor.nodeType === Node.ELEMENT_NODE ? (ancestor as Element) : ancestor.parentElement;
  if (!root || typeof range.intersectsNode !== 'function') return false;
  for (const node of root.querySelectorAll(selector)) {
    if (range.intersectsNode(node)) return true;
  }
  return false;
}

function clientRect(range: Range): DOMRect {
  if (typeof range.getClientRects === 'function') {
    const rects = range.getClientRects();
    if (rects.length) return rects[0];
  }
  if (typeof range.getBoundingClientRect === 'function') return range.getBoundingClientRect();
  return new DOMRect(16, 16, 12, 12);
}

export function createReader(options: {
  bridge: Bridge;
  doc?: Document;
  scanDelayMs?: number;
  hoverOpenMs?: number;
  hoverCloseMs?: number;
  isVisible?: (element: Element) => boolean;
}): { dispose: () => void; reload: () => Promise<void>; stats: () => { highlights: number; degraded: boolean } } {
  const doc = options.doc ?? document;
  const win = doc.defaultView ?? window;
  const popover = new Popover(doc);
  let pointerOverCard = false;
  popover.setHoverGuard(
    () => {
      pointerOverCard = true;
      win.clearTimeout(closeTimer);
    },
    () => {
      pointerOverCard = false;
      hideHoverSoon();
    },
  );
  let disposed = false;
  let generation = 0;
  let config: RuntimeConfig | null = null;
  let marks: LiveMark[] = [];
  const sent = new Set<string>();
  const localKnown = new Set<string>();
  const localSaved = new Set<string>();
  let scanTimer = 0;
  let hoverTimer = 0;
  let closeTimer = 0;
  let translateTimer = 0;
  let activeMark = -1;
  let translateSerial = 0;
  let selecting = false;
  let href = win.location.href;
  let scanRun = 0;
  let scanState: 'idle' | 'running' | 'done' = 'idle';
  let scanElement: HTMLElement | null = null;
  let followFrame = 0;
  let configKey = '';
  let lastModel: TranslateModel | null = null;
  let pointerInPopover = false;

  function clearMarkState(): void {
    marks = [];
    activeMark = -1;
    if (highlightsAvailable()) syncHighlights([]);
  }

  function paint(): void {
    if (!highlightsAvailable()) return;
    ensureHighlightStyle(doc);
    const hovered = activeMark >= 0 && popover.isHoverOpen() ? marks[activeMark]?.range : null;
    syncHighlights(
      marks.map((mark) => mark.range),
      hovered,
    );
  }

  function topOf(range: Range): number | null {
    if (typeof range.getBoundingClientRect !== 'function') return null;
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;
    return rect.top;
  }

  function screenCrowded(range: Range, cap: number): boolean {
    const half = (win.innerHeight || 800) / 2;
    const top = topOf(range);
    const near = marks.filter((mark) => {
      const other = topOf(mark.range);
      return top == null || other == null || Math.abs(other - top) < half;
    });
    return near.length >= cap;
  }

  function applyMarks(group: CollectedBlock[], found: LocatedPhrase[]): void {
    const byId = new Map(group.map((block) => [block.id, block]));
    const cap = LEVEL_LIMITS[config?.assistanceLevel ?? 'medium'].perScreen;
    for (const phrase of [...found].sort((a, b) => b.priority - a.priority)) {
      if (
        localKnown.has(phrase.canonical) ||
        localKnown.has(looseCanonical(phrase.canonical)) ||
        localSaved.has(phrase.canonical) ||
        localSaved.has(looseCanonical(phrase.canonical)) ||
        marks.some((mark) => sameExpression(mark.canonical, phrase.canonical))
      ) {
        continue;
      }
      const block = byId.get(phrase.blockId);
      if (!block) continue;
      const range = rangeForOffsets(block.indexed, phrase.start, phrase.end);
      if (!range || range.toString().replace(/\s+/g, ' ').trim() !== phrase.surface.replace(/\s+/g, ' ').trim()) continue;
      if (rangeHitsSkipped(range)) continue;
      if (marks.some((mark) => mark.blockId === phrase.blockId && phrase.start < mark.end && mark.start < phrase.end)) continue;
      if (screenCrowded(range, cap)) continue;
      marks.push({ ...phrase, range, indexed: block.indexed });
    }
    paint();
  }

  function ensureAlive(): boolean {
    if (!options.bridge.alive || options.bridge.alive()) return true;
    dispose();
    return false;
  }

  function dismissTranslate(): void {
    win.clearTimeout(translateTimer);
    translateSerial += 1;
    if (popover.isTranslateOpen()) popover.hide();
  }

  function renderedBlock(element: Element): boolean {
    if (options.isVisible) return options.isVisible(element);
    if (typeof element.getBoundingClientRect !== 'function') return true;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  }

  function resetScan(): void {
    scanRun += 1;
    scanState = 'idle';
    scanElement = null;
    win.clearTimeout(scanTimer);
    win.cancelAnimationFrame?.(followFrame);
    popover.hideScan();
  }

  function scanBatches(blocks: CollectedBlock[]): CollectedBlock[][] {
    const batches: CollectedBlock[][] = [];
    let batch: CollectedBlock[] = [];
    let words = 0;
    let chars = 0;
    for (const block of blocks) {
      const count = wordCount(block.text);
      const full =
        batch.length >= LIMITS.scanBatchBlocks ||
        words + count > LIMITS.scanWordBudget ||
        chars + block.text.length > LIMITS.maxBatchChars;
      if (batch.length && full) {
        batches.push(batch);
        batch = [];
        words = 0;
        chars = 0;
      }
      batch.push(block);
      words += count;
      chars += block.text.length;
    }
    if (batch.length) batches.push(batch);
    return batches;
  }

  async function focusBlock(block: CollectedBlock, animate: boolean): Promise<void> {
    scanElement = block.element;
    const rect = block.element.getBoundingClientRect();
    const onScreen = rect.bottom > 0 && rect.top < (win.innerHeight || 800);
    await popover.focusScan(rect, animate && onScreen);
  }

  function followScan(): void {
    if (scanState !== 'running' || !scanElement) return;
    win.cancelAnimationFrame?.(followFrame);
    const run = () => {
      if (scanState === 'running' && scanElement?.isConnected) popover.trackScan(scanElement.getBoundingClientRect());
    };
    if (win.requestAnimationFrame) followFrame = win.requestAnimationFrame(run);
    else run();
  }

  async function scan(): Promise<void> {
    if (!ensureAlive()) return;
    if (scanState !== 'idle' || disposed || !config?.siteEnabled || !config.autoMarkEnabled || !highlightsAvailable()) return;
    if (doc.visibilityState === 'hidden') return;
    scanState = 'running';
    const run = scanRun;
    const live = () => run === scanRun && !disposed;
    const animate = (options.scanDelayMs ?? LIMITS.scanDebounceMs) > 0 && !win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let requests = 0;
    try {
      const blocks = collectBlocks(doc, { isVisible: renderedBlock, limit: LIMITS.scanMaxBlocks }).filter((block) => !sent.has(block.text));
      blocks.sort((left, right) => {
        const a = left.element.getBoundingClientRect?.();
        const b = right.element.getBoundingClientRect?.();
        return (a?.top ?? 0) - (b?.top ?? 0) || (a?.left ?? 0) - (b?.left ?? 0);
      });
      const batches = scanBatches(blocks);
      const labels = pageLabels(doc);
      const request = (batch: CollectedBlock[]) => {
        requests += 1;
        return options.bridge.analyze({
          requestId: `a${run}_${requests}`,
          blocks: batch.map((block) => ({ id: block.id, text: block.text })),
          existingCanonicals: [...marks.map((mark) => mark.canonical), ...localKnown, ...localSaved],
          blockedSurfaces: labels,
        });
      };
      let pending = batches.length ? request(batches[0]) : null;
      for (let index = 0; index < batches.length && pending; index += 1) {
        const batch = batches[index];
        await focusBlock(batch[0], animate);
        if (!live()) return;
        let response = await pending;
        if (!live()) return;
        if (!response.ok && response.code === 'bad-response') {
          response = await request(batch);
          if (!live()) return;
        }
        if (!response.ok) {
          if (response.code === 'invalidated') {
            dispose();
            return;
          }
          if (response.code !== 'bad-response') return;
        }
        pending = index + 1 < batches.length ? request(batches[index + 1]) : null;
        for (const [position, block] of batch.entries()) {
          if (position > 0) {
            await focusBlock(block, animate);
            if (!live()) return;
          }
          sent.add(block.text);
          if (response.ok) applyMarks([block], response.data.marks.filter((mark) => mark.blockId === block.id));
        }
      }
    } finally {
      if (run === scanRun) {
        scanState = 'done';
        scanElement = null;
        popover.hideScan();
      }
    }
  }

  function scheduleScan(): void {
    if (scanState !== 'idle') return;
    win.clearTimeout(scanTimer);
    scanTimer = win.setTimeout(() => void scan(), options.scanDelayMs ?? LIMITS.scanDebounceMs);
  }

  function caretFromPoint(x: number, y: number): { node: Node; offset: number } | null {
    const view = doc as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    const position = view.caretPositionFromPoint?.(x, y);
    if (position?.offsetNode) return { node: position.offsetNode, offset: position.offset };
    const range = view.caretRangeFromPoint?.(x, y);
    if (!range) return null;
    return { node: range.startContainer, offset: range.startOffset };
  }

  function hideHoverSoon(): void {
    win.clearTimeout(closeTimer);
    closeTimer = win.setTimeout(() => {
      if (pointerOverCard) return;
      if (popover.isHoverOpen()) popover.hide();
      activeMark = -1;
      paint();
    }, options.hoverCloseMs ?? LIMITS.hoverCloseMs);
  }

  function showHover(index: number): void {
    const mark = marks[index];
    if (!mark || !config?.hoverEnabled || selecting) return;
    const selection = doc.getSelection();
    if (selection && !selection.isCollapsed) return;
    activeMark = index;
    popover.showHover(clientRect(mark.range), {
      surface: mark.surface,
      pos: mark.pos,
      meaningZh: mark.meaningZh,
      noteZh: mark.noteZh,
      onSpeak: () => speakEnglish(mark.surface),
      onKnown: () => {
        const canonical = normalizeCanonical(mark.canonical);
        localKnown.add(canonical);
        localKnown.add(looseCanonical(canonical));
        void options.bridge.markKnown({
          canonical: mark.canonical,
          surface: mark.surface,
          meaningZh: mark.meaningZh,
          type: mark.type,
        });
        marks = marks.filter((item) => !sameExpression(item.canonical, canonical));
        activeMark = -1;
        popover.hide();
        paint();
      },
      onSave: () => {
        const canonical = normalizeCanonical(mark.canonical);
        localSaved.add(canonical);
        localSaved.add(looseCanonical(canonical));
        void options.bridge.saveExpression({
          canonical: mark.canonical,
          surface: mark.surface,
          meaningZh: mark.meaningZh,
          type: mark.type,
          pos: mark.pos,
          saved: true,
          exampleEn: contextFor(mark.surface, mark.range) || undefined,
        });
      },
    });
    paint();
  }

  function onPointerMove(event: PointerEvent): void {
    if (!config?.hoverEnabled || selecting) return;
    if (pointerOverCard || popover.containsNode(event.target as Node)) {
      win.clearTimeout(closeTimer);
      return;
    }
    const point = caretFromPoint(event.clientX, event.clientY);
    const index = point
      ? marks.findIndex((mark) => {
          const offset = offsetInIndex(mark.indexed, point.node, point.offset);
          return offset != null && offset >= mark.start && offset < mark.end;
        })
      : -1;
    if (index < 0) {
      hideHoverSoon();
      return;
    }
    win.clearTimeout(closeTimer);
    if (index === activeMark && popover.isHoverOpen()) return;
    win.clearTimeout(hoverTimer);
    hoverTimer = win.setTimeout(() => showHover(index), options.hoverOpenMs ?? LIMITS.hoverOpenMs);
  }

  function contextFor(source: string, range: Range): string {
    const block = elementOf(range.startContainer)?.closest('p, li, blockquote, h1, h2, h3, h4, div');
    if (!block) return '';
    return sentenceWindow(buildIndex(block as HTMLElement).text, source, LIMITS.maxContextChars);
  }

  function selectionRange(): Range | null {
    const selection = doc.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
    return selection.getRangeAt(0);
  }

  async function copyText(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = doc.createElement('textarea');
      area.value = text;
      doc.body.appendChild(area);
      area.select();
      doc.execCommand('copy');
      area.remove();
    }
  }

  function renderTranslate(model: TranslateModel, rect: DOMRect): void {
    popover.showTranslate(rect, model);
  }

  function queueTranslate(): void {
    win.clearTimeout(translateTimer);
    translateTimer = win.setTimeout(() => void translateSelection(), 80);
  }

  async function translateSelection(): Promise<void> {
    if (!ensureAlive()) return;
    if (disposed || !config?.siteEnabled || !config.selectionTranslateEnabled) return;
    const range = selectionRange();
    const raw = doc.getSelection()?.toString() ?? '';
    if (!range || !raw.trim()) return;
    if (popover.containsNode(range.startContainer)) return;
    if (elementOf(range.startContainer)?.closest('input, textarea, [contenteditable="true"]')) return;
    const source = raw.trim();
    const rect = clientRect(range);
    translateSerial += 1;
    const serial = translateSerial;
    const requestId = `t${serial}`;
    const kind = classifySelection(source);
    const base = {
      requestId,
      kind,
      source,
      engine: config.engine,
      onSpeak: () => speakEnglish(source),
      onClose: () => popover.hide(),
      onCopySource: () => void copyText(source),
      onCopyTranslation: () => void copyText(''),
      onRetry: () => void translateSelection(),
    };
    if (raw.length > LIMITS.maxSelectionChars) {
      renderTranslate({ ...base, status: 'too-long' }, rect);
      return;
    }
    renderTranslate({ ...base, status: 'loading' }, rect);
    const context = contextFor(source, range);
    const response = await options.bridge.translate({ requestId, selectedText: source, context, kind });
    if (disposed || serial !== translateSerial) return;
    if (!response.ok) {
      if (response.code === 'invalidated') {
        dispose();
        return;
      }
      renderTranslate({ ...base, status: 'error', error: response.error, onRetry: () => void translateSelection() }, rect);
      return;
    }
    const data = response.data;
    const model: TranslateModel = {
      ...base,
      status: 'ready',
      kind: data.kind,
      meaningZh: data.meaningZh,
      translationZh: data.translationZh,
      noteZh: data.noteZh,
      pos: data.pos,
      keyPhrases: data.keyPhrases,
      onCopyTranslation: () => void copyText(data.translationZh || data.meaningZh || ''),
      onKnown:
        data.kind === 'word' || data.kind === 'phrase'
          ? () => {
              const canonical = data.source;
              localKnown.add(canonical);
              void options.bridge.markKnown({ canonical, surface: data.source, meaningZh: data.meaningZh, type: 'other' });
              marks = marks.filter((mark) => mark.surface !== data.source && mark.canonical !== canonical);
              paint();
            }
          : undefined,
      onSave:
        data.kind === 'word' || data.kind === 'phrase'
          ? () => {
              void options.bridge.saveExpression({
                canonical: data.source,
                surface: data.source,
                meaningZh: data.meaningZh || '',
                type: 'other',
                pos: data.pos,
                saved: true,
                exampleEn: context || undefined,
              });
            }
          : undefined,
      onSavePhrase: (phrase: KeyPhrase) => {
        void options.bridge.saveExpression({
          canonical: phrase.canonical,
          surface: phrase.surface,
          meaningZh: phrase.meaningZh,
          type: phrase.type,
          saved: true,
          exampleEn: source,
        });
      },
      ...(config?.engine === 'api' && {
        onGrammar: () => void runExtra('grammar', source, context, rect, serial),
        onPolish: () => void runExtra('polish', source, context, rect, serial),
      }),
    };
    lastModel = model;
    renderTranslate(model, rect);
  }

  async function runExtra(
    mode: 'grammar' | 'polish',
    source: string,
    context: string,
    rect: DOMRect,
    serial: number,
  ): Promise<void> {
    if (!lastModel || serial !== translateSerial || lastModel.requestId !== `t${serial}`) return;
    lastModel = { ...lastModel, extraLoading: true };
    renderTranslate(lastModel, rect);
    const response =
      mode === 'grammar'
        ? await options.bridge.explain({ requestId: `e${serial}`, selectedText: source, context })
        : await options.bridge.polish({ requestId: `p${serial}`, selectedText: source, context });
    if (!lastModel || serial !== translateSerial) return;
    const range = selectionRange();
    const nextRect = range ? clientRect(range) : rect;
    if (!response.ok) {
      lastModel = { ...lastModel, extraLoading: false, extraTitle: '暂时没有结果', extraLines: [response.error] };
      renderTranslate(lastModel, nextRect);
      return;
    }
    const lines =
      mode === 'grammar'
        ? [(response.data as { explanationZh: string }).explanationZh]
        : [(response.data as { polishedEn: string }).polishedEn, (response.data as { noteZh: string }).noteZh].filter(Boolean);
    lastModel = {
      ...lastModel,
      extraLoading: false,
      extraTitle: mode === 'grammar' ? '语法' : '更地道的说法',
      extraLines: lines,
    };
    renderTranslate(lastModel, nextRect);
  }

  function onPointerDown(event: PointerEvent): void {
    if (!ensureAlive()) return;
    pointerInPopover = popover.hit(event);
    selecting = true;
    win.clearTimeout(hoverTimer);
    if (!pointerInPopover && popover.isHoverOpen()) {
      pointerOverCard = false;
      popover.hide();
      activeMark = -1;
      paint();
    }
  }

  function onPointerUp(event: PointerEvent): void {
    selecting = false;
    if (popover.hit(event)) {
      pointerInPopover = true;
      return;
    }
    pointerInPopover = false;
    const text = doc.getSelection()?.toString().trim() ?? '';
    if (!text) {
      dismissTranslate();
      return;
    }
    queueTranslate();
  }

  function onSelectionChange(): void {
    if (disposed || pointerInPopover) return;
    const text = doc.getSelection()?.toString().trim() ?? '';
    if (text || !popover.isTranslateOpen()) return;
    dismissTranslate();
  }

  function onKeyUp(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      popover.hide();
      return;
    }
    if (event.key === 'Shift' || event.key.startsWith('Arrow')) queueTranslate();
  }

  function onScroll(): void {
    if (popover.isHoverOpen()) {
      pointerOverCard = false;
      popover.hide();
      activeMark = -1;
      paint();
    }
    followScan();
  }

  function onVisibilityChange(): void {
    if (doc.visibilityState === 'visible') scheduleScan();
  }

  const observer = new MutationObserver((records) => {
    if (records.every((record) => popover.containsNode(record.target))) return;
    marks = marks.filter((mark) => mark.range.startContainer.isConnected);
    paint();
  });
  if (doc.body) observer.observe(doc.body, { subtree: true, childList: true, characterData: true });

  doc.addEventListener('pointerdown', onPointerDown, true);
  doc.addEventListener('pointerup', onPointerUp);
  doc.addEventListener('pointermove', onPointerMove);
  doc.addEventListener('selectionchange', onSelectionChange);
  doc.addEventListener('keyup', onKeyUp);
  win.addEventListener('scroll', onScroll, true);
  win.addEventListener('resize', followScan);
  doc.addEventListener('visibilitychange', onVisibilityChange);
  const urlTimer = win.setInterval(() => {
    if (win.location.href === href) return;
    href = win.location.href;
    generation += 1;
    resetScan();
    sent.clear();
    localSaved.clear();
    clearMarkState();
    popover.hide();
    options.bridge.cancel();
    scheduleScan();
  }, 1000);
  const configTimer = win.setInterval(() => void reload(), 5000);

  async function reload(): Promise<void> {
    if (!ensureAlive()) return;
    let next: RuntimeConfig;
    try {
      next = await options.bridge.getConfig();
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (/extension context invalidated/i.test(message)) dispose();
      return;
    }
    if (disposed) return;
    const key = JSON.stringify(next);
    const changed = key !== configKey;
    configKey = key;
    config = next;
    if (!config.siteEnabled || !config.autoMarkEnabled) {
      clearMarkState();
      if (changed) {
        resetScan();
        sent.clear();
      }
      if (!config.siteEnabled) popover.hide();
      return;
    }
    if (changed) {
      clearMarkState();
      sent.clear();
      resetScan();
      scheduleScan();
    }
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    generation += 1;
    win.clearTimeout(scanTimer);
    win.clearTimeout(hoverTimer);
    win.clearTimeout(closeTimer);
    win.clearTimeout(translateTimer);
    win.clearInterval(urlTimer);
    win.clearInterval(configTimer);
    observer.disconnect();
    doc.removeEventListener('pointerdown', onPointerDown, true);
    doc.removeEventListener('pointerup', onPointerUp);
    doc.removeEventListener('pointermove', onPointerMove);
    doc.removeEventListener('selectionchange', onSelectionChange);
    doc.removeEventListener('keyup', onKeyUp);
    win.removeEventListener('scroll', onScroll, true);
    win.removeEventListener('resize', followScan);
    doc.removeEventListener('visibilitychange', onVisibilityChange);
    win.cancelAnimationFrame?.(followFrame);
    clearMarkState();
    clearHighlights(doc);
    popover.hideScan();
    popover.destroy();
    options.bridge.cancel();
  }

  void reload();
  return {
    dispose,
    reload,
    stats: () => ({ highlights: marks.length, degraded: !highlightsAvailable() }),
  };
}
