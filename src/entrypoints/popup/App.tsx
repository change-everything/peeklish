import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { injectContentScript, syncRegisteredScripts } from '../../background/register-scripts';
import { canInjectPage, originMatchPattern } from '../../shared/api-url';
import { ASSISTANCE_OPTIONS, ENGINE_OPTIONS, type AssistanceLevel, type Settings, type TranslationEngine } from '../../shared/types';
import { prepareChromeTranslator } from '../../chrome/builtin-translator';
import { getApiKey } from '../../storage/keys';
import { getSettings, saveSettings } from '../../storage/settings';
import { getSite, saveSite } from '../../storage/sites';
import { Icon } from '../../ui/Icon';
import type { IconName } from '../../ui/icon-shapes';
import { Chip, Row, Section, type ChipColor } from '../../ui/List';
import { Logo, Wordmark } from '../../ui/Logo';
import { Segmented } from '../../ui/Segmented';
import { Toggle } from '../../ui/Toggle';

type Page = { ok: true; origin: string; host: string } | { ok: false; reason: string };

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [consent, setConsent] = useState(false);
  const [page, setPage] = useState<Page>({ ok: false, reason: '正在读取当前页面' });
  const [tabId, setTabId] = useState<number | null>(null);
  const [highlights, setHighlights] = useState(0);
  const [requests, setRequests] = useState(0);
  const [banner, setBanner] = useState('');
  const [lastError, setLastError] = useState('');

  async function refresh() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    setTabId(tab?.id ?? null);
    const nextPage = tab?.url ? canInjectPage(tab.url) : { ok: false as const, reason: '当前页面不支持' };
    setPage(nextPage);
    const stored = await getSettings();
    setSettings(stored);
    setHasKey(Boolean(await getApiKey(stored.keyPersistence)));
    if (nextPage.ok) {
      const site = await getSite(nextPage.origin);
      setEnabled(Boolean(site?.enabled));
      setConsent(Boolean(site?.aiTextConsentAt));
    } else {
      setEnabled(false);
    }
    const error = await browser.storage.session.get('lastError');
    const record = error.lastError as { message?: string } | undefined;
    setLastError(record?.message || '');
    if (tab?.id != null) {
      const usage = await browser.runtime.sendMessage({ type: 'GET_PAGE_USAGE', tabId: tab.id }).catch(() => null);
      setRequests(usage?.ok ? usage.data.requests : 0);
      const stats = await browser.tabs.sendMessage(tab.id, { type: 'GET_STATS' }).catch(() => null);
      setHighlights(stats?.highlights ?? 0);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function patch(partial: Partial<Settings>) {
    if (!settings) return;
    const next = { ...settings, ...partial };
    setSettings(next);
    await saveSettings(next);
    if (tabId != null) await browser.tabs.sendMessage(tabId, { type: 'APPLY_CONFIG' }).catch(() => undefined);
  }

  async function toggleSite(next: boolean) {
    if (!page.ok || tabId == null || !settings) return;
    if (!next) {
      const site = await getSite(page.origin);
      await saveSite({ origin: page.origin, enabled: false, aiTextConsentAt: site?.aiTextConsentAt ?? null });
      await syncRegisteredScripts();
      await browser.tabs.sendMessage(tabId, { type: 'CLEANUP' }).catch(() => undefined);
      await refresh();
      return;
    }
    if (settings.engine === 'api' && !hasKey) {
      openOptions('ai');
      return;
    }
    const granted = await browser.permissions.request({ origins: [originMatchPattern(page.origin)] });
    if (!granted) {
      setBanner('需要允许访问这个网站，peeklish 才能在页面上标注。');
      return;
    }
    if (settings.engine === 'chrome' && !(await prepareBuiltin())) return;
    await saveSite({ origin: page.origin, enabled: true, aiTextConsentAt: Date.now() });
    await syncRegisteredScripts();
    await injectContentScript(tabId).catch(() => undefined);
    await browser.tabs.sendMessage(tabId, { type: 'ENSURE' }).catch(() => undefined);
    setBanner('');
    await refresh();
  }

  async function chooseEngine(engine: TranslationEngine) {
    if (!settings) return;
    if (engine === 'api') {
      await patch({ engine: 'api' });
      if (!hasKey) openOptions('ai');
      return;
    }
    if (!(await prepareBuiltin())) return;
    await patch({ engine: 'chrome' });
  }

  async function prepareBuiltin(): Promise<boolean> {
    setBanner('正在准备谷歌内置翻译…');
    const ready = await prepareChromeTranslator((ratio) => setBanner(`正在下载翻译语言包 ${Math.round(ratio * 100)}%`));
    if (ready !== 'ready') {
      setBanner('当前 Chrome 无法使用内置翻译。请升级到最新版 Chrome，或在设置里改用自定义 AI。');
      return false;
    }
    setBanner('');
    return true;
  }

  function openOptions(hash: string) {
    void browser.tabs.create({ url: browser.runtime.getURL(`/options.html#${hash}`) });
  }

  const builtin = settings?.engine !== 'api';
  const [status, tone]: [string, 'on' | 'warn' | 'off'] = !page.ok
    ? [page.reason, 'off']
    : !enabled
      ? ['未在此网站启用', 'off']
      : lastError
        ? ['遇到问题', 'warn']
        : !builtin && !hasKey
          ? ['需要配置 AI 服务', 'warn']
          : !builtin && !consent
            ? ['等待你同意发送文本', 'warn']
            : ['正在此网站工作', 'on'];
  const usage = builtin ? '本机翻译' : `AI 请求 ${requests} 次`;

  return (
    <main className="popup">
      <header className="popup-head">
        <Logo size={34} />
        <div className="popup-brand">
          <Wordmark size={17} />
          <span className="popup-status" title={lastError || status}>
            <span className={tone === 'off' ? 'status-dot' : `status-dot ${tone}`} />
            {status}
          </span>
        </div>
        <button type="button" className="icon-btn" aria-label="打开设置" title="设置" onClick={() => openOptions('ai')}>
          <Icon name="gear" size={17} />
        </button>
      </header>

      <Section
        className="site"
        footer={
          enabled
            ? undefined
            : builtin
              ? '用 Chrome 内置的谷歌翻译在本机标注和翻译，网页内容不会上传。首次使用需要下载语言包。'
              : '启用后，这个网站的英文片段会发送给你配置的 AI 服务，不经过 peeklish 的服务器。'
        }
      >
        <Row icon="globe" color={enabled ? 'yellow' : 'gray'} title="在当前网站启用" sub={page.ok ? page.host : page.reason}>
          <Toggle checked={enabled} label="在当前网站启用" disabled={!page.ok} onChange={(value) => void toggleSite(value)} />
        </Row>
      </Section>

      {(banner || lastError) && (
        <div className="notices">
          {banner && (
            <p className="notice warn">
              <Icon name="info" size={16} />
              {banner}
            </p>
          )}
          {lastError && (
            <p className="notice warn">
              <Icon name="info" size={16} />
              {lastError}
            </p>
          )}
        </div>
      )}

      <Section title="阅读">
        <Row icon="underline" color="yellow" title="智能标注短语">
          <Toggle checked={settings?.autoMarkEnabled ?? true} label="智能标注短语" onChange={(value) => void patch({ autoMarkEnabled: value })} />
        </Row>
        <Row icon="eye" color="indigo" title="悬停显示释义">
          <Toggle checked={settings?.hoverEnabled ?? true} label="悬停显示释义" onChange={(value) => void patch({ hoverEnabled: value })} />
        </Row>
        <Row icon="cursor" color="teal" title="划词翻译">
          <Toggle
            checked={settings?.selectionTranslateEnabled ?? true}
            label="划词翻译"
            onChange={(value) => void patch({ selectionTranslateEnabled: value })}
          />
        </Row>
        <Row icon="languages" color="blue" title="翻译服务">
          <Segmented
            label="翻译服务"
            value={settings?.engine ?? 'chrome'}
            options={ENGINE_OPTIONS}
            onChange={(value: TranslationEngine) => void chooseEngine(value)}
          />
        </Row>
        <Row icon="gauge" color="orange" title="辅助强度">
          <Segmented
            label="辅助强度"
            value={settings?.assistanceLevel ?? 'medium'}
            options={ASSISTANCE_OPTIONS}
            onChange={(value: AssistanceLevel) => void patch({ assistanceLevel: value })}
          />
        </Row>
      </Section>

      <div className="popup-stats" aria-live="polite">
        <span>
          本页已标注 <b>{highlights}</b> 处
        </span>
        <span className="sep" aria-hidden="true" />
        <span>{usage}</span>
      </div>

      <nav className="tiles" aria-label="设置">
        <Tile icon="languages" color="blue" title="翻译服务" hint="选择谷歌内置翻译或自定义 AI" onClick={() => openOptions('ai')} />
        <Tile icon="book" color="orange" title="表达库" hint="查看收藏和已掌握的表达" onClick={() => openOptions('library')} />
        <Tile icon="sliders" color="indigo" title="阅读偏好" hint="标注密度和本地数据" onClick={() => openOptions('reading')} />
      </nav>
    </main>
  );
}


function Tile({ icon, color, title, hint, onClick }: { icon: IconName; color: ChipColor; title: string; hint: string; onClick: () => void }) {
  return (
    <button type="button" className="tile" title={hint} onClick={onClick}>
      <Chip icon={icon} color={color} />
      <span>{title}</span>
    </button>
  );
}
