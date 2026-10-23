import type { KeyPhrase, SelectionKind, TranslationEngine } from '../shared/types';
import { iconElement, type IconName } from '../ui/icon-shapes';
import { CARD_CSS } from './card-css';
import { canSpeak } from './speak';

export type HoverModel = {
  surface: string;
  pos?: string;
  meaningZh: string;
  noteZh?: string;
  onSpeak: () => void;
  onKnown: () => void;
  onSave: () => void;
};

export type TranslateModel = {
  requestId: string;
  status: 'loading' | 'ready' | 'error' | 'too-long' | 'not-english';
  kind?: SelectionKind;
  source: string;
  meaningZh?: string;
  translationZh?: string;
  noteZh?: string;
  pos?: string;
  keyPhrases?: KeyPhrase[];
  error?: string;
  engine?: TranslationEngine;
  extraTitle?: string;
  extraLines?: string[];
  extraLoading?: boolean;
  onSpeak: () => void;
  onClose: () => void;
  onCopySource: () => void;
  onCopyTranslation: () => void;
  onKnown?: () => void;
  onSave?: () => void;
  onSavePhrase?: (phrase: KeyPhrase) => void;
  onGrammar?: () => void;
  onPolish?: () => void;
  onRetry: () => void;
};

const CSS = `${CARD_CSS}
.layer {
  position: absolute;
  inset: 0;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  overflow-anchor: none;
  transition: opacity 0.22s linear, visibility 0.22s linear;
}
.layer.on { opacity: 1; visibility: visible; }
.veil, .beam, .band { position: absolute; pointer-events: none; overflow-anchor: none; }
.veil, .beam { left: 0; width: 100%; }
.veil {
  top: 0;
  height: 0;
  background: linear-gradient(to bottom, rgba(230, 176, 0, 0.2), rgba(230, 176, 0, 0.02));
  transition: height 0.36s cubic-bezier(0.22, 0.7, 0.2, 1);
}
.beam {
  height: 3px;
  background: linear-gradient(90deg, transparent, #ffe08a 8%, #e6b000 50%, #ffe08a 92%, transparent);
  box-shadow: 0 0 22px 6px rgba(230, 176, 0, 0.72);
  transition: top 0.36s cubic-bezier(0.22, 0.7, 0.2, 1);
}
.band {
  background: rgba(230, 176, 0, 0.16);
  box-shadow: inset 0 0 0 1px rgba(230, 176, 0, 0.32);
  transition:
    top 0.36s cubic-bezier(0.22, 0.7, 0.2, 1),
    left 0.36s cubic-bezier(0.22, 0.7, 0.2, 1),
    width 0.36s cubic-bezier(0.22, 0.7, 0.2, 1),
    height 0.36s cubic-bezier(0.22, 0.7, 0.2, 1);
}
:host(.instant) .layer,
:host(.instant) .veil,
:host(.instant) .beam,
:host(.instant) .band { transition: none; }
.card { z-index: 2; }
@media (prefers-reduced-motion: reduce) {
  .card { scroll-behavior: auto; animation: none; }
  .layer, .beam, .band, .veil { transition: none; }
}
`;

function button(label: string, className: string, onClick: () => void, options: { aria?: string; icon?: IconName; role?: string } = {}): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  if (options.icon) element.append(iconElement(document, options.icon, 15));
  if (label) element.append(label);
  if (options.aria) {
    element.setAttribute('aria-label', options.aria);
    element.title = options.aria;
  }
  if (options.role) element.dataset.role = options.role;
  element.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return element;
}

function place(card: HTMLElement, rect: DOMRect, win: Window): void {
  const margin = 8;
  const width = card.offsetWidth;
  const height = card.offsetHeight;
  let top = rect.bottom + margin;
  let left = rect.left;
  if (top + height > win.innerHeight - margin) top = rect.top - height - margin;
  if (top < margin) top = margin;
  if (left + width > win.innerWidth - margin) left = win.innerWidth - width - margin;
  if (left < margin) left = margin;
  card.style.top = `${top}px`;
  card.style.left = `${left}px`;
}

export class Popover {
  readonly host: HTMLElement;
  private readonly shadow: ShadowRoot;
  private readonly scanHost: HTMLElement;
  private readonly card: HTMLElement;
  private readonly layer: HTMLElement;
  private readonly veil: HTMLElement;
  private readonly beam: HTMLElement;
  private readonly band: HTMLElement;
  private mode: 'hover' | 'translate' | null = null;
  private scanToken = 0;
  private scanVisible = false;
  private doc: Document;
  private win: Window;
  private onHoverEnter: (() => void) | null = null;
  private onHoverLeave: (() => void) | null = null;

  constructor(doc: Document) {
    this.doc = doc;
    this.win = doc.defaultView ?? window;
    this.host = doc.createElement('div');
    this.host.id = 'peeklish-root';
    this.host.setAttribute('data-peeklish-root', '');
    this.host.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;overflow:visible;z-index:2147483646;pointer-events:none;';
    this.shadow = this.host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = CSS;
    this.card = doc.createElement('div');
    this.card.className = 'card';
    this.card.hidden = true;
    this.layer = doc.createElement('div');
    this.layer.className = 'layer';
    this.veil = doc.createElement('div');
    this.veil.className = 'veil';
    this.beam = doc.createElement('div');
    this.beam.className = 'beam';
    this.band = doc.createElement('div');
    this.band.className = 'band';
    this.layer.append(this.veil, this.beam, this.band);
    this.shadow.append(style, this.card);
    this.scanHost = doc.createElement('div');
    this.scanHost.setAttribute('data-peeklish-root', '');
    this.scanHost.style.cssText = 'position:fixed;inset:0;overflow:hidden;overflow-anchor:none;z-index:2147483645;pointer-events:none;contain:layout paint;';
    const scanShadow = this.scanHost.attachShadow({ mode: 'open' });
    const scanStyle = doc.createElement('style');
    scanStyle.textContent = CSS;
    scanShadow.append(scanStyle, this.layer);
    const parent = doc.documentElement || doc.body;
    parent.append(this.host, this.scanHost);
    this.card.addEventListener('pointerenter', () => this.onHoverEnter?.());
    this.card.addEventListener('pointerleave', () => this.onHoverLeave?.());
    this.host.addEventListener('mousedown', (event) => event.stopPropagation());
    this.host.addEventListener('mouseup', (event) => event.stopPropagation());
  }

  setHoverGuard(enter: () => void, leave: () => void): void {
    this.onHoverEnter = enter;
    this.onHoverLeave = leave;
  }

  containsNode(node: Node | null): boolean {
    return !!node && (node === this.host || this.host.contains(node) || node === this.scanHost || this.scanHost.contains(node));
  }

  isHoverOpen(): boolean {
    return this.mode === 'hover' && !this.card.hidden;
  }

  isTranslateOpen(): boolean {
    return this.mode === 'translate' && !this.card.hidden;
  }

  hit(event: Event): boolean {
    return event.composedPath().includes(this.host);
  }

  hide(): void {
    this.mode = null;
    this.card.hidden = true;
    this.card.replaceChildren();
  }

  private placeScan(rect: DOMRect): void {
    const top = rect.top;
    this.veil.style.height = `${Math.min(Math.max(top, 0), this.win.innerHeight || 0)}px`;
    this.beam.style.top = `${top}px`;
    this.band.style.top = `${top}px`;
    this.band.style.left = `${rect.left}px`;
    this.band.style.width = `${Math.max(rect.width, 0)}px`;
    this.band.style.height = `${Math.max(rect.height, 22)}px`;
  }

  async focusScan(rect: DOMRect, animate: boolean): Promise<void> {
    const token = this.scanToken + 1;
    this.scanToken = token;
    if (!this.scanVisible || !animate) {
      this.scanHost.classList.add('instant');
      this.placeScan(rect);
      void this.beam.offsetHeight;
      this.scanHost.classList.remove('instant');
    } else {
      this.placeScan(rect);
    }
    this.scanVisible = true;
    this.layer.classList.add('on');
    if (!animate || token !== this.scanToken) return;
    await new Promise((resolve) => this.win.setTimeout(resolve, 220));
  }

  trackScan(rect: DOMRect): void {
    if (!this.scanVisible) return;
    this.scanHost.classList.add('instant');
    this.placeScan(rect);
    void this.beam.offsetHeight;
    this.scanHost.classList.remove('instant');
  }

  hideScan(): void {
    this.scanToken += 1;
    this.scanVisible = false;
    this.layer.classList.remove('on');
  }

  destroy(): void {
    this.hideScan();
    this.host.remove();
    this.scanHost.remove();
  }

  private appendGloss(meaning: string): void {
    const gloss = this.doc.createElement('div');
    gloss.className = 'gloss';
    gloss.textContent = meaning;
    this.card.append(gloss);
  }

  private appendContext(note?: string): void {
    const trimmed = note?.trim();
    if (!trimmed) return;
    const context = this.doc.createElement('div');
    context.className = 'context';
    const kicker = this.doc.createElement('div');
    kicker.className = 'kicker';
    kicker.textContent = '结合当前文档释义';
    const body = this.doc.createElement('p');
    body.textContent = trimmed;
    context.append(kicker, body);
    this.card.append(context);
  }

  private el(tag: string, className: string, text?: string): HTMLElement {
    const node = this.doc.createElement(tag);
    node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  private savedOnClick(onSave: () => void, label = '收藏'): HTMLButtonElement {
    const element = button(label, 'text-btn', () => {
      if (element.classList.contains('done')) return;
      onSave();
      element.replaceChildren(iconElement(this.doc, 'check', 15), '已收藏');
      element.classList.add('done');
    }, { icon: 'bookmark' });
    return element;
  }

  private copyButton(label: string, aria: string, onCopy: () => void): HTMLButtonElement {
    const element = button(label, 'text-btn quiet', () => {
      onCopy();
      element.replaceChildren(iconElement(this.doc, 'check', 15), '已复制');
      this.win.setTimeout(() => element.replaceChildren(iconElement(this.doc, 'copy', 15), label), 1200);
    }, { icon: 'copy', aria });
    return element;
  }

  showHover(rect: DOMRect, model: HoverModel): void {
    this.mode = 'hover';
    this.card.hidden = false;
    this.card.replaceChildren();
    const head = this.el('div', 'head');
    head.append(this.el('div', 'title', model.surface));
    if (canSpeak()) head.append(button('', 'icon', model.onSpeak, { icon: 'speaker', aria: '朗读' }));
    this.card.append(head);
    const gloss = this.el('div', 'gloss');
    if (model.pos) gloss.append(this.el('span', 'pos', model.pos));
    gloss.append(model.meaningZh);
    this.card.append(gloss);
    this.appendContext(model.noteZh);
    const actions = this.el('div', 'actions');
    actions.append(button('已掌握', 'text-btn', model.onKnown, { icon: 'check' }), this.savedOnClick(model.onSave));
    this.card.append(actions);
    place(this.card, rect, this.win);
  }

  showTranslate(rect: DOMRect, model: TranslateModel): void {
    this.mode = 'translate';
    this.card.hidden = false;
    this.card.replaceChildren();
    const head = this.el('div', 'head');
    const label = this.el('div', 'label');
    if (model.status === 'not-english') label.textContent = 'peeklish';
    else if (model.engine === 'chrome') label.append(iconElement(this.doc, 'languages', 14), '谷歌翻译');
    else label.append(iconElement(this.doc, 'sparkles', 14), 'AI 翻译');
    const tools = this.el('div', 'tools');
    if (model.status !== 'not-english' && canSpeak()) tools.append(button('', 'icon', model.onSpeak, { icon: 'speaker', aria: '朗读' }));
    tools.append(button('', 'icon', model.onClose, { icon: 'close', aria: '关闭' }));
    head.append(label, tools);
    this.card.append(head);

    if (model.status === 'loading') {
      const loading = this.el('div', 'loading');
      loading.append(this.el('span', 'spinner'), '正在翻译…');
      this.card.append(loading);
    } else if (model.status === 'too-long') {
      this.card.append(this.el('div', 'error', '选区超过 2000 个字符，请缩短后再翻译。'));
    } else if (model.status === 'not-english') {
      this.card.append(this.el('div', 'meaning', '这段不是英文。peeklish 只翻译英文。'));
    } else if (model.status === 'error') {
      const actions = this.el('div', 'actions');
      actions.append(button('重试', 'text-btn', model.onRetry));
      this.card.append(this.el('div', 'error', model.error || '翻译失败'), actions);
    } else {
      const expression = model.kind === 'word' || model.kind === 'phrase';
      if (expression) {
        this.card.append(this.el('div', 'title', model.source));
        const gloss = this.el('div', 'gloss');
        if (model.pos) gloss.append(this.el('span', 'pos', model.pos));
        gloss.append(model.meaningZh || model.translationZh || '');
        this.card.append(gloss);
      } else {
        this.card.append(this.el('div', 'meaning', model.translationZh || model.meaningZh || ''));
      }
      this.appendContext(model.noteZh);
      if (model.keyPhrases && model.keyPhrases.length) {
        const keys = this.el('div', 'keys');
        keys.append(this.el('h4', '', '重点表达'));
        for (const phrase of model.keyPhrases) {
          const row = this.el('div', 'key-row');
          row.append(this.el('b', '', phrase.surface), this.el('span', '', phrase.meaningZh));
          if (model.onSavePhrase) row.append(this.savedOnClick(() => model.onSavePhrase?.(phrase)));
          keys.append(row);
        }
        this.card.append(keys);
      }
      if (model.extraTitle && model.extraLines?.length) {
        const extra = this.el('div', 'extra');
        extra.append(this.el('strong', '', model.extraTitle));
        for (const line of model.extraLines) extra.append(this.el('div', '', line));
        this.card.append(extra);
      }
      const actions = this.el('div', 'actions');
      if (expression && model.onKnown) actions.append(button('已掌握', 'text-btn', model.onKnown, { icon: 'check' }));
      if (expression && model.onSave) actions.append(this.savedOnClick(model.onSave));
      if (model.onGrammar && model.onPolish) {
        const grammar = button(model.extraLoading ? '处理中…' : '语法', 'text-btn', model.onGrammar, { icon: 'lightbulb', role: 'extra', aria: '解释语法' });
        const polish = button('润色', 'text-btn', model.onPolish, { icon: 'wand', role: 'extra', aria: '润色表达' });
        grammar.disabled = Boolean(model.extraLoading);
        polish.disabled = Boolean(model.extraLoading);
        actions.append(grammar, polish);
      }
      actions.append(
        this.el('span', 'spacer'),
        this.copyButton('译文', '复制译文', model.onCopyTranslation),
        this.copyButton('原文', '复制原文', model.onCopySource),
      );
      this.card.append(actions);
    }
    place(this.card, rect, this.win);
  }
}
