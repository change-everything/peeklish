import { disableRemovedOrigins, injectEnabledTabs, syncRegisteredScripts } from '../background/register-scripts';
import { handleMessage } from '../background/handle';
import { sidePanelApi } from '../chrome/side-panel';
import { errorText } from '../shared/error-text';

async function lockStorage(): Promise<void> {
  await browser.storage.local.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => undefined);
  await browser.storage.session.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => undefined);
}

async function boot(): Promise<void> {
  await lockStorage();
  await sidePanelApi()?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
  await syncRegisteredScripts();
  await injectEnabledTabs();
}

export default defineBackground(() => {
  void boot();

  browser.runtime.onInstalled.addListener((details) => {
    void (async () => {
      await boot();
      if (details.reason === 'install') {
        await browser.tabs.create({ url: browser.runtime.getURL('/options.html#welcome') });
      }
    })();
  });

  browser.runtime.onStartup.addListener(() => {
    void boot();
  });

  browser.permissions.onRemoved.addListener((removed) => {
    void disableRemovedOrigins(removed.origins ?? []);
  });

  browser.commands.onCommand.addListener((command) => {
    if (command !== 'quick-excerpt') return;
    void browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId == null) return;
      const opening = sidePanelApi()?.open({ tabId }).catch(() => undefined);
      void browser.tabs.sendMessage(tabId, { type: 'QUICK_EXCERPT' }).catch(() => undefined);
      return opening;
    });
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && typeof message === 'object' && (message as { type?: unknown }).type === 'CHROME_TRANSLATE') return;
    void handleMessage(message, sender)
      .then(sendResponse)
      .catch((error: unknown) => {
        const code = error instanceof Error ? 'network' : 'network';
        sendResponse({ ok: false, code, error: errorText(code, error instanceof Error ? error.message : '') });
      });
    return true;
  });
});
