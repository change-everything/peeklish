import type { PendingAnchor } from '../shared/types';

type Actions = {
  onTranslate: () => void;
  onExplain: () => void;
  onExcerpt: () => void;
  onCopy: () => void;
};

const CSS = `
:host { all: initial; }
.bar {
  display: flex;
  align-items: center;
  gap: 2px;
  width: max-content;
  max-width: calc(100vw - 16px);
  padding: 4px;
  border-radius: 999px;
  background: #2c2c2e;
  color: #fff;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  font: 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}
button {
  border: 0;
  background: transparent;
  color: inherit;
  border-radius: 999px;
  padding: 6px 10px;
  cursor: pointer;
}
button:hover { background: rgba(255, 255, 255, 0.12); }
`;

export class SelectionToolbar {
  readonly host: HTMLElement;
  private readonly shadow: ShadowRoot;
  private readonly bar: HTMLElement;

  constructor(doc: Document) {
    this.host = doc.createElement('div');
    this.host.id = 'peeklish-toolbar';
    this.host.setAttribute('data-peeklish-root', '');
    this.host.style.cssText = 'position:fixed;z-index:2147483647;left:0;top:0;display:none;pointer-events:auto;';
    this.shadow = this.host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = CSS;
    this.bar = doc.createElement('div');
    this.bar.className = 'bar';
    this.shadow.append(style, this.bar);
    (doc.documentElement || doc.body).append(this.host);
    this.bar.addEventListener('mousedown', (event) => event.preventDefault());
  }

  hit(event: Event): boolean {
    return event.composedPath().includes(this.host);
  }

  hide(): void {
    this.host.style.display = 'none';
    this.bar.replaceChildren();
  }

  show(rect: DOMRect, anchor: PendingAnchor, actions: Actions): void {
    const doc = this.host.ownerDocument;
    if (!doc) return;
    const code = anchor.kind === 'code';
    const buttons: Array<{ label: string; run: () => void }> = code
      ? [
          { label: '解释代码', run: actions.onExplain },
          { label: '摘录', run: actions.onExcerpt },
          { label: '复制', run: actions.onCopy },
        ]
      : [
          { label: '翻译', run: actions.onTranslate },
          { label: '解释', run: actions.onExplain },
          { label: '摘录', run: actions.onExcerpt },
          { label: '复制', run: actions.onCopy },
        ];
    this.bar.replaceChildren();
    for (const item of buttons) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.textContent = item.label === '复制' && !code ? '···' : item.label;
      button.setAttribute('aria-label', item.label);
      button.title = item.label;
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        item.run();
      });
      this.bar.append(button);
    }
    const win = doc.defaultView;
    const width = win?.innerWidth ?? 800;
    const left = Math.max(8, Math.min(rect.left, width - 220));
    const top = rect.top > 52 ? rect.top - 44 : rect.bottom + 8;
    this.host.style.left = `${left}px`;
    this.host.style.top = `${top}px`;
    this.host.style.display = 'block';
  }

  destroy(): void {
    this.host.remove();
  }
}
