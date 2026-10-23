import { extensionBridge } from '../content/bridge';
import { createReader } from '../content/reader';

export default defineContentScript({
  registration: 'runtime',
  runAt: 'document_idle',
  main() {
    const flag = '__peeklishBoot';
    const root = globalThis as Record<string, unknown>;
    try {
      if (!browser.runtime?.id) return;
    } catch {
      return;
    }
    if (root[flag]) return;
    root[flag] = true;
    let api: ReturnType<typeof createReader> | null = null;
    const boot = () => {
      if (api) return;
      api = createReader({ bridge: extensionBridge() });
    };
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const type = message && typeof message === 'object' && 'type' in message ? String(message.type) : '';
      if (type === 'CLEANUP') {
        api?.dispose();
        api = null;
        sendResponse({ ok: true, highlights: 0, degraded: false });
        return;
      }
      if (type === 'ENSURE') {
        boot();
        sendResponse({ ok: true });
        return;
      }
      if (type === 'APPLY_CONFIG') {
        if (!api) boot();
        else void api.reload();
        sendResponse({ ok: true });
        return;
      }
      if (type === 'GET_STATS') {
        sendResponse({ ok: true, ...(api?.stats() ?? { highlights: 0, degraded: false }) });
      }
    });
    boot();
  },
});
