export const CARD_CSS = `
:host {
  all: initial;
  --card-bg: rgba(255, 255, 255, 0.9);
  --card-label: #1d1d1f;
  --card-secondary: rgba(60, 60, 67, 0.64);
  --card-separator: rgba(60, 60, 67, 0.13);
  --card-fill: rgba(118, 118, 128, 0.12);
  --card-fill-strong: rgba(118, 118, 128, 0.2);
  --card-inset: rgba(118, 118, 128, 0.08);
  --card-tint: #f5c400;
  --card-tint-ink: #2b2100;
  --card-tint-text: #8a6400;
  --card-success: #248a3d;
  --card-danger: #d70015;
  --card-edge: rgba(0, 0, 0, 0.06);
  --card-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(0, 0, 0, 0.08), 0 18px 44px rgba(0, 0, 0, 0.14);
}
@media (prefers-color-scheme: dark) {
  :host {
    --card-bg: rgba(40, 40, 42, 0.9);
    --card-label: #f5f5f7;
    --card-secondary: rgba(235, 235, 245, 0.62);
    --card-separator: rgba(84, 84, 88, 0.6);
    --card-fill: rgba(118, 118, 128, 0.26);
    --card-fill-strong: rgba(118, 118, 128, 0.36);
    --card-inset: rgba(118, 118, 128, 0.18);
    --card-tint-text: #ffd426;
    --card-success: #30d158;
    --card-danger: #ff453a;
    --card-edge: rgba(255, 255, 255, 0.08);
    --card-shadow: 0 0 0 0.5px rgba(255, 255, 255, 0.1), 0 18px 44px rgba(0, 0, 0, 0.55);
  }
}
.card {
  position: fixed;
  z-index: 2147483646;
  box-sizing: border-box;
  width: max-content;
  min-width: 240px;
  max-width: min(360px, calc(100vw - 16px));
  max-height: min(70vh, 480px);
  overflow: auto;
  overscroll-behavior: contain;
  padding: 14px 16px 12px;
  border: 0;
  border-radius: 14px;
  background: var(--card-bg);
  -webkit-backdrop-filter: saturate(180%) blur(28px);
  backdrop-filter: saturate(180%) blur(28px);
  color: var(--card-label);
  font: 15px/1.45 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif;
  -webkit-font-smoothing: antialiased;
  text-align: left;
  box-shadow: var(--card-shadow);
  pointer-events: auto;
  transform-origin: top left;
}
.card *, .card *::before, .card *::after { box-sizing: border-box; }
.card:not([hidden]) { animation: card-in 0.22s cubic-bezier(0.2, 0.8, 0.2, 1); }
@keyframes card-in {
  from { opacity: 0; transform: translateY(4px) scale(0.98); }
  to { opacity: 1; transform: none; }
}
.head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.tools { display: flex; align-items: center; gap: 6px; }
.title { min-width: 0; font-size: 17px; font-weight: 650; letter-spacing: -0.02em; line-height: 1.3; overflow-wrap: anywhere; }
.pos { margin-right: 6px; color: var(--card-secondary); font-size: 13px; font-weight: 500; font-style: italic; }
.label { display: inline-flex; align-items: center; gap: 6px; color: var(--card-tint-text); font-size: 13px; font-weight: 650; letter-spacing: 0.01em; }
.label svg { width: 14px; height: 14px; }
.gloss { margin-top: 6px; font-size: 17px; font-weight: 600; line-height: 1.45; letter-spacing: -0.01em; }
.meaning { margin-top: 8px; font-size: 16px; line-height: 1.6; }
.context { margin-top: 10px; padding: 9px 11px; border-radius: 10px; background: var(--card-inset); }
.kicker { color: var(--card-secondary); font-size: 12px; font-weight: 650; letter-spacing: 0.02em; }
.context p { margin: 2px 0 0; font-size: 14px; line-height: 1.5; }
.loading { display: flex; align-items: center; gap: 10px; margin-top: 10px; color: var(--card-secondary); font-size: 14px; }
.spinner { width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--card-fill-strong); border-top-color: var(--card-tint); animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.error { margin-top: 8px; color: var(--card-danger); font-size: 14px; }
.icon, .text-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 0;
  background: var(--card-fill);
  color: var(--card-label);
  cursor: pointer;
  font: inherit;
  transition: background 0.18s cubic-bezier(0.2, 0.8, 0.2, 1), transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1), color 0.18s;
}
.icon { flex: 0 0 auto; width: 28px; height: 28px; padding: 0; border-radius: 50%; }
.icon svg { width: 15px; height: 15px; }
.text-btn { min-height: 30px; padding: 5px 11px; border-radius: 8px; font-size: 14px; font-weight: 500; white-space: nowrap; }
.text-btn svg { width: 14px; height: 14px; }
.icon:hover, .text-btn:hover { background: var(--card-fill-strong); }
.icon:active, .text-btn:active { transform: scale(0.95); }
.text-btn.quiet { padding: 5px 8px; background: transparent; color: var(--card-secondary); }
.text-btn.quiet:hover { background: var(--card-fill); color: var(--card-label); }
.text-btn.done { background: transparent; color: var(--card-success); cursor: default; transform: none; }
.text-btn:disabled, .icon:disabled { opacity: 0.45; cursor: default; transform: none; }
.icon:focus-visible, .text-btn:focus-visible { outline: 2px solid var(--card-tint); outline-offset: 2px; }
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 12px; }
.actions .spacer { flex: 1; }
.keys { margin-top: 12px; padding-top: 10px; border-top: 0.5px solid var(--card-separator); }
.keys h4 { margin: 0 0 4px; color: var(--card-secondary); font-size: 12px; font-weight: 650; letter-spacing: 0.02em; }
.key-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 34px; font-size: 14px; }
.key-row span { flex: 1; color: var(--card-secondary); }
.key-row b { font-weight: 650; }
.extra { margin-top: 10px; padding: 10px 12px; border-radius: 10px; background: var(--card-inset); font-size: 14px; line-height: 1.5; }
.extra strong { display: block; margin-bottom: 2px; color: var(--card-secondary); font-size: 12px; font-weight: 650; letter-spacing: 0.02em; }
.extra div + div { margin-top: 4px; }
@media (prefers-reduced-motion: reduce) {
  .card:not([hidden]) { animation: none; }
  .spinner { animation-duration: 2.4s; }
  .icon, .text-btn { transition: none; }
}
`;
