/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { collectBlocks } from '../src/content/block-collector';
import { buildIndex, rangeForOffsets } from '../src/content/text-index';
import { createReader } from '../src/content/reader';
import { lexiconPhrases } from '../src/domain/lexicon';
import { selectMarks } from '../src/domain/select-marks';
import type { RuntimeConfig, SelectionKind, TranslationPayload } from '../src/shared/types';

const config: RuntimeConfig = {
  siteEnabled: true,
  assistanceLevel: 'medium',
  autoMarkEnabled: true,
  hoverEnabled: true,
  selectionTranslateEnabled: true,
  aiConsent: false,
  hasKey: false,
  engine: 'api',
  maxAutoCharsPerPage: 30000,
};

function translated(source: string, kind: SelectionKind): TranslationPayload {
  return { kind, source, meaningZh: '考虑到；把……纳入考虑', keyPhrases: [] };
}

async function until(ready: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!ready()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for the scan');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('text index', () => {
  it('maps a phrase split across inline tags', () => {
    document.body.innerHTML = '<p id="p">You should <strong>take </strong><em>into account</em> the cost.</p>';
    const indexed = buildIndex(document.getElementById('p') as HTMLElement);
    const start = indexed.text.indexOf('take into account');
    const range = rangeForOffsets(indexed, start, start + 'take into account'.length);
    expect(range?.toString()).toBe('take into account');
  });
});

describe('block collector', () => {
  it('skips navigation and code, and keeps the paragraph', () => {
    document.body.innerHTML = `
      <nav><p>You should take into account the navigation label here today.</p></nav>
      <pre><code>take into account the code sample in this block now</code></pre>
      <article><p>When you plan a migration, you should take into account the performance implications before you carry out the change.</p></article>
    `;
    const blocks = collectBlocks(document, { isVisible: () => true });
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toContain('carry out');
  });

  it('reads a documentation block when an empty anchor div sits inside it', () => {
    document.body.innerHTML = `
      <div class="sidebar">On this page you can jump to any section of the reference.</div>
      <main>
        <div class="block">
          <div class="anchor"></div>
          When you plan a migration, you should take into account the performance implications before you carry out the change.
        </div>
      </main>
    `;
    const blocks = collectBlocks(document, { isVisible: () => true });
    expect(blocks[0].text).toContain('carry out');
    expect(blocks[0].element.closest('main')).toBeTruthy();
  });

  it('skips the page title, breadcrumb, and table of contents', () => {
    document.title = 'Scheduled deployments | Docs';
    document.body.innerHTML = `
      <h1>Scheduled deployments</h1>
      <nav aria-label="Breadcrumb"><p>Docs for scheduled deployments are linked from this breadcrumb today.</p></nav>
      <div class="toc"><p>On this page you can jump to any section of the reference guide.</p></div>
      <article><p>When you plan a migration, you should take into account the performance implications before you carry out the change.</p></article>
    `;
    const blocks = collectBlocks(document, { isVisible: () => true });
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toContain('carry out');
    expect(blocks.some((block) => /^H[1-6]$/.test(block.element.tagName))).toBe(false);
    expect(blocks.some((block) => block.text.includes('breadcrumb'))).toBe(false);
  });
});

describe('reader', () => {
  it('underlines the phrase in prose and not the same words inside a link or code', async () => {
    document.body.innerHTML = `
      <p>Read the <a href="https://example.com">take into account</a> notes in the handbook.</p>
      <pre><code>take into account()</code></pre>
      <p>When you plan a migration, you should take into account the performance implications before you carry out the change.</p>
    `;
    const highlights: Range[][] = [];
    class Highlight {
      ranges: Range[];
      constructor(...ranges: Range[]) {
        this.ranges = ranges;
      }
    }
    (globalThis as unknown as { CSS: unknown; Highlight: unknown }).CSS = {
      highlights: {
        set(_name: string, highlight: { ranges: Range[] }) {
          highlights.push(highlight.ranges);
        },
        delete(name?: string) {
          if (name === 'peeklish-mark') highlights.length = 0;
        },
      },
    };
    (globalThis as unknown as { Highlight: unknown }).Highlight = Highlight;

    const reader = createReader({
      doc: document,
      scanDelayMs: 0,
      isVisible: () => true,
      bridge: {
        async getConfig() {
          return config;
        },
        async analyze(body) {
          return {
            ok: true,
            data: {
              marks: selectMarks({
              blocks: body.blocks,
              phrases: lexiconPhrases(body.blocks),
              knownCanonicals: [],
              existingCanonicals: body.existingCanonicals,
              level: 'medium',
            }),
            },
          };
        },
        async translate(body) {
          return { ok: true, data: translated(body.selectedText, body.kind) };
        },
        async explain() {
          return { ok: true, data: { explanationZh: '语法说明' } };
        },
        async polish() {
          return { ok: true, data: { polishedEn: 'polished', noteZh: '说明' } };
        },
        async markKnown() {
          return undefined;
        },
        async saveExpression() {
          return undefined;
        },
        cancel() {
          return undefined;
        },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    const marked = highlights.at(-1) ?? [];
    expect(marked.map((range) => range.toString())).toContain('take into account');
    expect(marked.every((range) => !range.startContainer.parentElement?.closest('a, code, pre'))).toBe(true);
    reader.dispose();
  });

  it('closes the translation card when the selection is cleared and drops an invalidated context', async () => {
    document.body.innerHTML =
      '<p>When you plan a migration, you should take into account the performance implications before you carry out the change.</p>';
    const paragraph = document.querySelector('p') as HTMLParagraphElement;
    const node = paragraph.firstChild as Text;
    const start = node.data.indexOf('take into account');
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + 'take into account'.length);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);

    const reader = createReader({
      doc: document,
      scanDelayMs: 1000,
      isVisible: () => true,
      bridge: {
        async getConfig() {
          return config;
        },
        async analyze() {
          return { ok: true, data: { marks: [] } };
        },
        async translate(body) {
          return { ok: true, data: translated(body.selectedText, body.kind) };
        },
        async explain() {
          return { ok: true, data: { explanationZh: '语法说明' } };
        },
        async polish() {
          return { ok: true, data: { polishedEn: 'polished', noteZh: '说明' } };
        },
        async markKnown() {
          return undefined;
        },
        async saveExpression() {
          return undefined;
        },
        cancel() {
          return undefined;
        },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    document.dispatchEvent(new Event('pointerup', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 120));
    const card = document.getElementById('peeklish-root')?.shadowRoot?.querySelector('.card') as HTMLElement | undefined;
    expect(card?.hidden).toBe(false);
    expect(card?.textContent).toContain('考虑到');

    document.getSelection()?.removeAllRanges();
    document.dispatchEvent(new Event('selectionchange'));
    expect(card?.hidden).toBe(true);
    reader.dispose();

    const broken = createReader({
      doc: document,
      scanDelayMs: 1000,
      isVisible: () => true,
      bridge: {
        alive: () => true,
        async getConfig() {
          return config;
        },
        async analyze() {
          return { ok: false, code: 'invalidated', error: 'Extension context invalidated.' };
        },
        async translate() {
          return { ok: false, code: 'invalidated', error: 'Extension context invalidated.' };
        },
        async explain() {
          return { ok: false, code: 'invalidated', error: 'Extension context invalidated.' };
        },
        async polish() {
          return { ok: false, code: 'invalidated', error: 'Extension context invalidated.' };
        },
        async markKnown() {
          return undefined;
        },
        async saveExpression() {
          return undefined;
        },
        cancel() {
          return undefined;
        },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    document.getSelection()?.addRange(range);
    document.dispatchEvent(new Event('pointerup', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(document.body.textContent).not.toContain('Extension context invalidated');
    expect(document.getElementById('peeklish-root')).toBeNull();
    broken.dispose();
  });

  it('hides grammar and polish when the built-in translator is in use', async () => {
    document.body.innerHTML =
      '<p>When you plan a migration, you should take into account the performance implications before you carry out the change.</p>';
    const node = (document.querySelector('p') as HTMLParagraphElement).firstChild as Text;
    const start = node.data.indexOf('take into account');
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + 'take into account'.length);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
    const reader = createReader({
      doc: document,
      scanDelayMs: 1000,
      isVisible: () => true,
      bridge: {
        async getConfig() {
          return { ...config, engine: 'chrome' };
        },
        async analyze() {
          return { ok: true, data: { marks: [] } };
        },
        async translate(body) {
          return { ok: true, data: translated(body.selectedText, body.kind) };
        },
        async explain() {
          return { ok: true, data: { explanationZh: '语法说明' } };
        },
        async polish() {
          return { ok: true, data: { polishedEn: 'polished', noteZh: '说明' } };
        },
        async markKnown() {
          return undefined;
        },
        async saveExpression() {
          return undefined;
        },
        cancel() {
          return undefined;
        },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    document.dispatchEvent(new Event('pointerup', { bubbles: true }));
    const card = () => document.getElementById('peeklish-root')?.shadowRoot?.querySelector('.card') as HTMLElement | undefined;
    await until(() => Boolean(card()?.textContent?.includes('考虑到')));
    expect(card()?.textContent).toContain('谷歌翻译');
    expect(card()?.querySelector('[aria-label="解释语法"], [aria-label="润色表达"]')).toBeNull();
    document.getSelection()?.removeAllRanges();
    const chinese = document.createTextNode('选中这段中文时不应该送去翻译。');
    (document.querySelector('p') as HTMLParagraphElement).append(chinese);
    const chineseRange = document.createRange();
    chineseRange.setStart(chinese, 0);
    chineseRange.setEnd(chinese, chinese.data.length);
    document.getSelection()?.addRange(chineseRange);
    let chineseCalls = 0;
    const guarded = createReader({
      doc: document,
      scanDelayMs: 1000,
      isVisible: () => true,
      bridge: {
        async getConfig() {
          return { ...config, engine: 'chrome' };
        },
        async analyze() {
          return { ok: true, data: { marks: [] } };
        },
        async translate() {
          chineseCalls += 1;
          return { ok: true, data: translated('不应该出现', 'sentence') };
        },
        async explain() {
          return { ok: true, data: { explanationZh: '语法说明' } };
        },
        async polish() {
          return { ok: true, data: { polishedEn: 'polished', noteZh: '说明' } };
        },
        async markKnown() {
          return undefined;
        },
        async saveExpression() {
          return undefined;
        },
        cancel() {
          return undefined;
        },
      },
    });
    reader.dispose();
    document.dispatchEvent(new Event('pointerup', { bubbles: true }));
    await until(() => Boolean(document.getElementById('peeklish-root')?.shadowRoot?.textContent?.includes('只翻译英文')));
    expect(chineseCalls).toBe(0);
    guarded.dispose();
    document.getSelection()?.removeAllRanges();
    reader.dispose();
  });

  it('sweeps the whole page once from top to bottom, and scrolling neither stops nor restarts it', async () => {
    const sentences = [
      'When you plan a migration, you should take into account the performance implications first.',
      'In addition to the main queue, every worker keeps at least one retry slot for failed jobs.',
      'The team ships on a predictable cadence so that reviewers can plan their week ahead.',
      'Before you carry out the change, make sure the backup has finished and been verified.',
      'As a rule of thumb, keep each deployment small enough to roll back within minutes.',
      'Provided that the health checks pass, the scheduler moves traffic to the new version.',
      'If a step fails, the pipeline stops and reports the reason instead of guessing.',
    ];
    document.body.innerHTML = sentences.map((text) => `<p>${text}</p>`).join('');
    (globalThis as unknown as { CSS: unknown; Highlight: unknown }).CSS = { highlights: { set() {}, delete() {} } };
    (globalThis as unknown as { Highlight: unknown }).Highlight = class Highlight {
      constructor(..._ranges: Range[]) {}
    };
    const seen: string[] = [];
    let calls = 0;
    const reader = createReader({
      doc: document,
      scanDelayMs: 0,
      isVisible: () => true,
      bridge: {
        async getConfig() {
          return config;
        },
        async analyze(body) {
          calls += 1;
          seen.push(...body.blocks.map((block) => block.text));
          window.dispatchEvent(new Event('scroll'));
          await new Promise((resolve) => setTimeout(resolve, 5));
          return { ok: true, data: { marks: [] } };
        },
        async translate(body) {
          return { ok: true, data: translated(body.selectedText, body.kind) };
        },
        async explain() {
          return { ok: true, data: { explanationZh: '语法说明' } };
        },
        async polish() {
          return { ok: true, data: { polishedEn: 'polished', noteZh: '说明' } };
        },
        async markKnown() {
          return undefined;
        },
        async saveExpression() {
          return undefined;
        },
        cancel() {
          return undefined;
        },
      },
    });
    await until(() => seen.length >= sentences.length && !document.querySelectorAll('[data-peeklish-root]')[1]?.shadowRoot?.querySelector('.layer.on'));
    expect(seen).toEqual(sentences);
    expect(calls).toBeGreaterThan(1);
    const finished = calls;
    window.dispatchEvent(new Event('scroll'));
    document.dispatchEvent(new Event('scroll'));
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(calls).toBe(finished);
    const layer = document.querySelectorAll('[data-peeklish-root]')[1]?.shadowRoot?.querySelector('.layer');
    expect(layer?.classList.contains('on')).toBe(false);
    reader.dispose();
  });

  it('keeps one analysis request in flight and retries a malformed reply once', async () => {
    document.body.innerHTML = [
      'When you plan a migration, you should take into account the performance implications first.',
      'In addition to the main queue, every worker keeps at least one retry slot for failed jobs.',
      'The team ships on a predictable cadence so that reviewers can plan their week ahead.',
      'Before you carry out the change, make sure the backup has finished and been verified.',
    ]
      .map((text) => `<p>${text}</p>`)
      .join('');
    (globalThis as unknown as { CSS: unknown; Highlight: unknown }).CSS = { highlights: { set() {}, delete() {} } };
    (globalThis as unknown as { Highlight: unknown }).Highlight = class Highlight {
      constructor(..._ranges: Range[]) {}
    };
    let inFlight = 0;
    let most = 0;
    let calls = 0;
    const reader = createReader({
      doc: document,
      scanDelayMs: 0,
      isVisible: () => true,
      bridge: {
        async getConfig() {
          return config;
        },
        async analyze() {
          calls += 1;
          inFlight += 1;
          most = Math.max(most, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 5));
          inFlight -= 1;
          if (calls === 1) return { ok: false, code: 'bad-response', error: '模型没有返回可识别的结果' };
          return { ok: true, data: { marks: [] } };
        },
        async translate(body) {
          return { ok: true, data: translated(body.selectedText, body.kind) };
        },
        async explain() {
          return { ok: true, data: { explanationZh: '语法说明' } };
        },
        async polish() {
          return { ok: true, data: { polishedEn: 'polished', noteZh: '说明' } };
        },
        async markKnown() {
          return undefined;
        },
        async saveExpression() {
          return undefined;
        },
        cancel() {
          return undefined;
        },
      },
    });
    await until(() => calls >= 3 && inFlight === 0);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(most).toBe(1);
    expect(calls).toBe(3);
    reader.dispose();
  });

  it('retries a failed scan, then stops until the reader asks again', async () => {
    enableHighlights();
    document.body.innerHTML =
      '<p>When you plan a migration, you should take into account the performance implications before you carry out the change.</p>';
    let calls = 0;
    const reader = createReader({
      doc: document,
      scanDelayMs: 0,
      isVisible: () => true,
      bridge: {
        async getConfig() {
          return config;
        },
        async analyze() {
          calls += 1;
          if (calls === 1) return { ok: false, code: 'chrome', error: '当前 Chrome 无法使用内置翻译' };
          return { ok: true, data: { marks: [] } };
        },
        async translate(body) {
          return { ok: true, data: translated(body.selectedText, body.kind) };
        },
        async explain() {
          return { ok: true, data: { explanationZh: '语法说明' } };
        },
        async polish() {
          return { ok: true, data: { polishedEn: 'polished', noteZh: '说明' } };
        },
        async markKnown() {
          return undefined;
        },
        async saveExpression() {
          return undefined;
        },
        cancel() {
          return undefined;
        },
      },
    });
    await until(() => calls >= 2);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(calls).toBe(2);
    window.dispatchEvent(new Event('scroll'));
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(calls).toBe(2);
    reader.dispose();
  });

  it('retries from a scroll after repeated translation failures', async () => {
    enableHighlights();
    document.body.innerHTML =
      '<p>When you plan a migration, you should take into account the performance implications before you carry out the change.</p>';
    let calls = 0;
    const reader = createReader({
      doc: document,
      scanDelayMs: 0,
      isVisible: () => true,
      bridge: {
        async getConfig() {
          return config;
        },
        async analyze() {
          calls += 1;
          return { ok: false, code: 'timeout', error: '请求超时，请稍后重试' };
        },
        async translate(body) {
          return { ok: true, data: translated(body.selectedText, body.kind) };
        },
        async explain() {
          return { ok: true, data: { explanationZh: '语法说明' } };
        },
        async polish() {
          return { ok: true, data: { polishedEn: 'polished', noteZh: '说明' } };
        },
        async markKnown() {
          return undefined;
        },
        async saveExpression() {
          return undefined;
        },
        cancel() {
          return undefined;
        },
      },
    });
    await until(() => calls >= 4);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(calls).toBe(4);
    window.dispatchEvent(new Event('scroll'));
    await until(() => calls >= 5);
    reader.dispose();
  });

  it('scans a paragraph that appears after the first pass', async () => {
    enableHighlights();
    document.body.innerHTML =
      '<p>When you plan a migration, you should take into account the performance implications before you carry out the change.</p>';
    const seen: string[] = [];
    const reader = createReader({
      doc: document,
      scanDelayMs: 0,
      isVisible: () => true,
      bridge: {
        async getConfig() {
          return config;
        },
        async analyze(body) {
          seen.push(...body.blocks.map((block) => block.text));
          return { ok: true, data: { marks: [] } };
        },
        async translate(body) {
          return { ok: true, data: translated(body.selectedText, body.kind) };
        },
        async explain() {
          return { ok: true, data: { explanationZh: '语法说明' } };
        },
        async polish() {
          return { ok: true, data: { polishedEn: 'polished', noteZh: '说明' } };
        },
        async markKnown() {
          return undefined;
        },
        async saveExpression() {
          return undefined;
        },
        cancel() {
          return undefined;
        },
      },
    });
    await until(() => seen.length >= 1);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const added = 'In addition to the main queue, every worker keeps at least one retry slot for failed jobs.';
    const paragraph = document.createElement('p');
    paragraph.textContent = added;
    document.body.appendChild(paragraph);
    await until(() => seen.some((text) => text.includes('at least one')));
    expect(seen.filter((text) => text.includes('take into account'))).toHaveLength(1);
    reader.dispose();
  });
});

function enableHighlights(): void {
  (globalThis as unknown as { CSS: unknown; Highlight: unknown }).CSS = { highlights: { set() {}, delete() {} } };
  (globalThis as unknown as { Highlight: unknown }).Highlight = class Highlight {
    constructor(..._ranges: Range[]) {}
  };
}
