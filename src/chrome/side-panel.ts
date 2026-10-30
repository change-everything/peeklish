import { browser } from 'wxt/browser';

type SidePanelApi = {
  open: (options: { tabId?: number; windowId?: number }) => Promise<void>;
  setPanelBehavior: (options: { openPanelOnActionClick: boolean }) => Promise<void>;
};

export function sidePanelApi(): SidePanelApi | null {
  const value = (browser as unknown as { sidePanel?: SidePanelApi }).sidePanel;
  return value ?? null;
}

export function openSidePanel(tabId: number): Promise<void> {
  const api = sidePanelApi();
  if (!api || tabId < 0) return Promise.resolve();
  return api.open({ tabId }).catch(() => undefined);
}
