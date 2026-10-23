import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { browser } from 'wxt/browser';
import { parseApiBaseUrl } from '../../shared/api-url';
import { errorText } from '../../shared/error-text';
import { filterExpressions, type LibraryFilter } from '../../shared/expressions-query';
import { prepareChromeTranslator } from '../../chrome/builtin-translator';
import {
  ASSISTANCE_OPTIONS,
  ENGINE_OPTIONS,
  TYPE_LABELS,
  type AssistanceLevel,
  type ExpressionRecord,
  type KeyPersistence,
  type Settings,
  type TranslationEngine,
} from '../../shared/types';
import { clearCaches } from '../../storage/cache';
import { clearExpressions, deleteExpressions, listExpressions } from '../../storage/expressions';
import { deleteApiKey, getApiKey, setApiKey } from '../../storage/keys';
import { getSettings, saveSettings } from '../../storage/settings';
import { listSites, saveSites } from '../../storage/sites';
import { Icon } from '../../ui/Icon';
import type { IconName } from '../../ui/icon-shapes';
import { ActionRow, Chip, LinkRow, Row, Section, type ChipColor } from '../../ui/List';
import { Logo, Wordmark } from '../../ui/Logo';
import { Segmented } from '../../ui/Segmented';
import { Toggle } from '../../ui/Toggle';

const NAV: Array<{ id: string; label: string; icon: IconName; color: ChipColor }> = [
  { id: 'welcome', label: '欢迎', icon: 'home', color: 'yellow' },
  { id: 'ai', label: '翻译服务', icon: 'languages', color: 'blue' },
  { id: 'reading', label: '阅读偏好', icon: 'sliders', color: 'indigo' },
  { id: 'library', label: '表达库', icon: 'book', color: 'orange' },
];

const KEY_OPTIONS: Array<{ id: KeyPersistence; label: string }> = [
  { id: 'session', label: '仅本次会话' },
  { id: 'local', label: '保存在本机' },
];

const FILTERS: Array<{ id: LibraryFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'saved', label: '收藏' },
  { id: 'known', label: '已掌握' },
  { id: 'phrasal_verb', label: '短语' },
  { id: 'idiom', label: '习语' },
  { id: 'connector', label: '连接' },
  { id: 'word', label: '单词' },
];

export function App() {
  const [hash, setHash] = useState(() => location.hash.replace('#', '') || 'welcome');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [message, setMessage] = useState('');
  const [items, setItems] = useState<ExpressionRecord[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [needsConsent, setNeedsConsent] = useState(false);

  useEffect(() => {
    const onHash = () => {
      setHash(location.hash.replace('#', '') || 'welcome');
      setMessage('');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  async function load() {
    const stored = await getSettings();
    setSettings(stored);
    setBaseUrl(stored.apiBaseUrl);
    setModel(stored.modelId);
    setKey(await getApiKey(stored.keyPersistence));
    setItems(await listExpressions());
    const sites = await listSites();
    setNeedsConsent(sites.some((site) => site.enabled && !site.aiTextConsentAt));
  }

  useEffect(() => {
    void load();
  }, []);

  const visible = useMemo(() => filterExpressions(items, query, filter), [items, query, filter]);

  async function chooseEngine(engine: TranslationEngine) {
    if (!settings) return;
    if (engine === 'api') {
      await patch({ engine: 'api' });
      setMessage(key.trim() ? '已切换到自定义 AI。' : '已切换到自定义 AI。填写下面的连接信息并保存后即可使用。');
      return;
    }
    setMessage('正在准备谷歌内置翻译…');
    const ready = await prepareChromeTranslator((ratio) => setMessage(`正在下载翻译语言包 ${Math.round(ratio * 100)}%`));
    if (ready !== 'ready') {
      setMessage('当前 Chrome 无法使用内置翻译。请升级到最新版 Chrome，或继续使用自定义 AI。');
      return;
    }
    await patch({ engine: 'chrome' });
    setMessage('已切换到谷歌内置翻译。');
  }

  async function patch(partial: Partial<Settings>) {
    if (!settings) return;
    const next = { ...settings, ...partial };
    setSettings(next);
    await saveSettings(next);
  }

  async function saveApi() {
    if (!settings) return;
    const parsed = parseApiBaseUrl(baseUrl);
    if (baseUrl.trim() && !parsed) {
      setMessage('接口地址需要以 https:// 开头，例如 https://api.openai.com/v1。');
      return;
    }
    if (parsed) {
      const granted = await browser.permissions.request({ origins: [`${parsed.origin}/*`] });
      if (!granted) {
        setMessage('需要允许访问这个接口地址，否则无法连接。');
        return;
      }
    }
    const persistence = settings.keyPersistence;
    if (persistence === 'local' && key.trim()) {
      const accepted = window.confirm('API Key 会以未加密的形式保存在这台电脑的浏览器中。确定保存在本机吗？');
      if (!accepted) return;
    }
    const next = { ...settings, apiBaseUrl: baseUrl.trim(), modelId: model.trim() };
    await saveSettings(next);
    setSettings(next);
    if (key.trim()) {
      await setApiKey(key.trim(), persistence);
      const sites = await listSites();
      const now = Date.now();
      await saveSites(sites.map((site) => (site.enabled ? { ...site, aiTextConsentAt: site.aiTextConsentAt ?? now } : site)));
      setNeedsConsent(false);
    }
    setMessage(key.trim() ? '已保存，可以开始使用了。' : '已保存。填写 API Key 后才能使用。');
  }

  async function testConnection() {
    const parsed = parseApiBaseUrl(baseUrl);
    if (!parsed || !model.trim() || !key.trim()) {
      setMessage('请先填写接口地址、API Key 和模型。');
      return;
    }
    const granted = await browser.permissions.request({ origins: [`${parsed.origin}/*`] });
    if (!granted) {
      setMessage('需要允许访问这个接口地址，才能测试连接。');
      return;
    }
    setMessage('正在测试连接…');
    const result = (await browser.runtime.sendMessage({
      type: 'TEST_CONNECTION',
      apiBaseUrl: baseUrl.trim(),
      modelId: model.trim(),
      apiKey: key.trim(),
    })) as { ok: boolean; code?: string; error?: string };
    setMessage(result.ok ? '连接成功。记得点「保存」。' : errorText(result.code || 'network', result.error));
  }

  async function grantConsent() {
    const sites = await listSites();
    const now = Date.now();
    await saveSites(sites.map((site) => (site.enabled ? { ...site, aiTextConsentAt: site.aiTextConsentAt ?? now } : site)));
    setNeedsConsent(false);
    setMessage('已同意。已启用的网站会开始使用 AI 服务。');
  }

  async function removeSelected() {
    if (!selected.length) return;
    await deleteExpressions(selected);
    setSelected([]);
    setItems(await listExpressions());
  }

  const page = NAV.find((item) => item.id === hash) ?? NAV[0];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <Logo size={36} />
          <div>
            <Wordmark size={17} />
            <small>Read English. Peek when needed.</small>
          </div>
        </div>
        <nav aria-label="设置">
          {NAV.map((item) => (
            <a key={item.id} href={`#${item.id}`} className={page.id === item.id ? 'nav-item active' : 'nav-item'} aria-current={page.id === item.id ? 'page' : undefined}>
              <Chip icon={item.icon} color={item.color} />
              {item.label}
            </a>
          ))}
        </nav>
        <p className="sidebar-foot">
          <Icon name="shield" size={14} />
          无需账号，数据只保存在你的浏览器
        </p>
      </aside>

      <main className="content">
        {page.id === 'welcome' && <Welcome />}

        {page.id === 'ai' && settings && (
          <Page title="翻译服务" lead="选择 peeklish 用什么来标注短语和翻译。peeklish 没有自己的服务器。">
            <Section>
              <div className="row-block">
                <Segmented label="翻译服务" value={settings.engine} options={ENGINE_OPTIONS} onChange={(value: TranslationEngine) => void chooseEngine(value)} />
              </div>
            </Section>

            {settings.engine === 'chrome' ? (
              <>
                <Section footer="首次使用会自动下载英译中语言包，之后离线也能用。">
                  <Row icon="shield" color="green" title="在本机完成" sub="网页内容不会离开你的电脑" />
                  <Row icon="check" color="blue" title="免费，无需配置" sub="使用 Chrome 内置的谷歌翻译" />
                </Section>
                <Section>
                  <LinkRow icon="sparkles" color="orange" title="需要语法解释和润色？" sub="切换到自定义 AI，接入你自己的大模型" onClick={() => void chooseEngine('api')} />
                </Section>
              </>
            ) : (
              <>
            <Section
              title="连接"
              footer="支持兼容 OpenAI 接口的服务。网页片段会直接发送给该服务，不经过 peeklish 的服务器。API Key 默认只在本次浏览器会话中有效；选择「保存在本机」可免去重复填写。"
            >
              <FormRow label="接口地址" htmlFor="api-url">
                <input
                  id="api-url"
                  className="field"
                  value={baseUrl}
                  placeholder="https://api.openai.com/v1"
                  spellCheck={false}
                  onChange={(event) => setBaseUrl(event.target.value)}
                />
              </FormRow>
              <FormRow label="API Key" htmlFor="api-key">
                <span className="field-wrap">
                  <input
                    id="api-key"
                    className="field"
                    type={showKey ? 'text' : 'password'}
                    value={key}
                    placeholder="sk-…"
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => setKey(event.target.value)}
                  />
                  <button type="button" className="btn plain field-addon" onClick={() => setShowKey((value) => !value)}>
                    {showKey ? '隐藏' : '查看'}
                  </button>
                </span>
              </FormRow>
              <FormRow label="模型" htmlFor="model-id">
                <input
                  id="model-id"
                  className="field"
                  value={model}
                  placeholder="gpt-4o-mini"
                  spellCheck={false}
                  onChange={(event) => setModel(event.target.value)}
                />
              </FormRow>
              <FormRow label="Key 保存位置">
                <Segmented label="Key 保存位置" value={settings.keyPersistence} options={KEY_OPTIONS} onChange={(value: KeyPersistence) => void patch({ keyPersistence: value })} />
              </FormRow>
            </Section>

            <div className="toolbar">
              <button type="button" className="btn primary large" onClick={() => void saveApi()}>
                保存
              </button>
              <button type="button" className="btn large" onClick={() => void testConnection()}>
                测试连接
              </button>
              <span className="toolbar-spacer" />
              <button
                type="button"
                className="btn plain danger"
                onClick={() => {
                  void deleteApiKey().then(() => {
                    setKey('');
                    setMessage('已删除 API Key。');
                  });
                }}
              >
                <Icon name="trash" size={15} />
                删除 API Key
              </button>
            </div>

            {needsConsent && (
              <div className="consent">
                <Icon name="shield" size={18} />
                <span>已启用的网站需要你同意后，才会把文本发送给 AI 服务。</span>
                <button type="button" className="btn primary" onClick={() => void grantConsent()}>
                  同意并继续
                </button>
              </div>
            )}
              </>
            )}
            <Message text={message} />
          </Page>
        )}

        {page.id === 'reading' && settings && (
          <Page title="阅读偏好" lead="peeklish 平时几乎没有存在感，只在你需要时出现。">
            <Section title="阅读">
              <Row icon="underline" color="yellow" title="智能标注短语" sub="在值得学的表达下加一条细下划线">
                <Toggle checked={settings.autoMarkEnabled} label="智能标注短语" onChange={(value) => void patch({ autoMarkEnabled: value })} />
              </Row>
              <Row icon="eye" color="indigo" title="悬停显示释义" sub="鼠标停在下划线上，查看结合语境的释义">
                <Toggle checked={settings.hoverEnabled} label="悬停显示释义" onChange={(value) => void patch({ hoverEnabled: value })} />
              </Row>
              <Row icon="cursor" color="teal" title="划词翻译" sub="选中单词、句子或段落即可翻译">
                <Toggle
                  checked={settings.selectionTranslateEnabled}
                  label="划词翻译"
                  onChange={(value) => void patch({ selectionTranslateEnabled: value })}
                />
              </Row>
            </Section>

            <Section title="辅助强度" footer="适中大约每 150 个词标注 3–5 个表达。没有值得学的就不标。">
              <div className="row-block">
                <Segmented
                  label="辅助强度"
                  value={settings.assistanceLevel}
                  options={ASSISTANCE_OPTIONS}
                  onChange={(value: AssistanceLevel) => void patch({ assistanceLevel: value })}
                />
                <DensityPreview level={settings.assistanceLevel} />
              </div>
            </Section>

            {settings.engine === 'api' && (
            <Section title="AI 用量" footer="用于控制自定义 AI 的花费。达到上限后，本页剩余段落不再自动标注，划词翻译不受影响。">
              <FormRow label="每页自动分析上限" htmlFor="budget">
                <span className="field-wrap number">
                  <input
                    id="budget"
                    className="field"
                    type="number"
                    min={2000}
                    max={100000}
                    step={1000}
                    value={settings.maxAutoCharsPerPage}
                    onChange={(event) => void patch({ maxAutoCharsPerPage: Number(event.target.value) })}
                  />
                  <span className="field-unit">字符</span>
                </span>
              </FormRow>
            </Section>
            )}

            <Section title="本地数据" footer="清除缓存后，页面会重新分析。清除表达库会删除所有收藏和已掌握的记录，且无法恢复。">
              <ActionRow icon="trash" color="gray" title="清除缓存" onClick={() => void clearCaches().then(() => setMessage('已清除缓存。'))} />
              <ActionRow
                icon="trash"
                color="red"
                danger
                title="清除表达库"
                onClick={() => {
                  if (!window.confirm('确定清除表达库吗？所有收藏和已掌握的记录都会被删除，且无法恢复。')) return;
                  void clearExpressions().then(() => {
                    setItems([]);
                    setMessage('已清除表达库。');
                  });
                }}
              />
            </Section>
            <Message text={message} />
          </Page>
        )}

        {page.id === 'library' && (
          <Page title="表达库" lead={items.length ? `共 ${items.length} 条。阅读时收藏或标为已掌握的表达都在这里。` : undefined}>
            <div className="library-tools">
              <label className="search">
                <Icon name="search" size={16} />
                <input className="field" placeholder="搜索表达、释义或来源" aria-label="搜索表达" value={query} onChange={(event) => setQuery(event.target.value)} />
              </label>
              <select className="field select" aria-label="筛选" value={filter} onChange={(event) => setFilter(event.target.value as LibraryFilter)}>
                {FILTERS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button type="button" className="btn danger" disabled={!selected.length} onClick={() => void removeSelected()}>
                <Icon name="trash" size={15} />
                删除所选{selected.length ? `（${selected.length}）` : ''}
              </button>
            </div>
            {visible.length === 0 ? (
              <div className="empty">
                <span className="empty-mark">
                  <Icon name="book" size={30} />
                </span>
                <p>还没有表达。阅读时在卡片里点「收藏」或「已掌握」。</p>
              </div>
            ) : (
              <ul className="group library">
                {visible.map((item) => {
                  const checked = selected.includes(item.id);
                  return (
                    <li key={item.id} className={checked ? 'row lib-row selected' : 'row lib-row'}>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={checked}
                          aria-label={`选择 ${item.surface}`}
                          onChange={(event) =>
                            setSelected((current) => (event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id)))
                          }
                        />
                        <span aria-hidden="true">
                          <Icon name="check" size={12} />
                        </span>
                      </label>
                      <span className="row-text">
                        <span className="lib-surface">{item.surface}</span>
                        <span className="row-sub">{item.meaningZh}</span>
                      </span>
                      <span className="lib-meta">
                        <span className="lib-tags">
                          {item.saved && <span className="tag saved">已收藏</span>}
                          {item.known && <span className="tag known">已掌握</span>}
                          <span className="tag">{TYPE_LABELS[item.type]}</span>
                        </span>
                        <small>{item.sourceOrigin?.replace(/^https?:\/\//, '') || '—'}</small>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Page>
        )}
      </main>
    </div>
  );
}

function Page({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <section className="page">
      <header className="page-head">
        <h1>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
      </header>
      {children}
    </section>
  );
}

function FormRow({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="row form-row">
      {htmlFor ? (
        <label className="form-label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="form-label">{label}</span>
      )}
      <div className="form-control">{children}</div>
    </div>
  );
}

function Message({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p className="notice message" role="status">
      <Icon name="info" size={16} />
      {text}
    </p>
  );
}

const DENSITY_TEXT: Array<string | { phrase: string; from: AssistanceLevel }> = [
  'Teams that ship on a ',
  { phrase: 'predictable cadence', from: 'medium' },
  ' tend to ',
  { phrase: 'take into account', from: 'light' },
  ' the cost of each change ',
  { phrase: 'in addition to', from: 'medium' },
  ' its value, ',
  { phrase: 'as opposed to', from: 'strong' },
  ' chasing ',
  { phrase: 'short-term wins', from: 'strong' },
  '.',
];

const LEVEL_ORDER: AssistanceLevel[] = ['light', 'medium', 'strong'];

function DensityPreview({ level }: { level: AssistanceLevel }) {
  const reach = LEVEL_ORDER.indexOf(level);
  return (
    <p className="density" aria-hidden="true">
      {DENSITY_TEXT.map((piece, index) =>
        typeof piece === 'string' ? (
          piece
        ) : (
          <span key={index} className={LEVEL_ORDER.indexOf(piece.from) <= reach ? 'mark' : undefined}>
            {piece.phrase}
          </span>
        ),
      )}
    </p>
  );
}

function Welcome() {
  const features: Array<{ icon: IconName; color: ChipColor; title: string; sub: string }> = [
    { icon: 'underline', color: 'yellow', title: '智能标注短语', sub: '不打断阅读' },
    { icon: 'eye', color: 'indigo', title: '鼠标悬停显示', sub: '简洁释义' },
    { icon: 'cursor', color: 'teal', title: '选中文本翻译', sub: '单词、短语、句子、段落' },
    { icon: 'book', color: 'orange', title: '个人表达库', sub: '已掌握与收藏，随时查看' },
  ];
  const steps = ['打开任意英文网页', '点击工具栏里的 peeklish，打开「在当前网站启用」', '鼠标停在下划线上看释义，选中文字即可翻译'];
  return (
    <section className="welcome">
      <div className="hero">
        <Logo size={88} />
        <h1>peeklish</h1>
        <p className="tagline">Read English. Peek when needed.</p>
        <p className="tagline zh">读英文，需要时看一眼。</p>
      </div>

      <div className="showcase" aria-hidden="true">
        <p className="showcase-text">
          Before you ship, <span className="anchor"><span className="mark live">take into account</span>
        <span className="showcase-card">
          <span className="showcase-head">
            <strong>take into account</strong>
            <span className="icon-btn small">
              <Icon name="speaker" size={14} />
            </span>
          </span>
          <span className="showcase-gloss">考虑到；把……纳入考虑</span>
          <span className="showcase-context">
            <span className="showcase-kicker">结合当前文档释义</span>
            <span>做决定前把这项因素算进去。</span>
          </span>
          <span className="showcase-actions">
            <span>
              <Icon name="check" size={13} />
              已掌握
            </span>
            <span>
              <Icon name="bookmark" size={13} />
              收藏
            </span>
          </span>
        </span></span>{' '}
          the cost of each change.
        </p>
      </div>

      <div className="features">
        {features.map((feature) => (
          <article key={feature.title}>
            <Chip icon={feature.icon} color={feature.color} />
            <b>{feature.title}</b>
            <span>{feature.sub}</span>
          </article>
        ))}
      </div>

      <Section title="三步开始" className="steps">
        {steps.map((step, index) => (
          <div key={step} className="row step">
            <span className="step-index" aria-hidden="true">
              {index + 1}
            </span>
            <span className="row-text">
              <span className="row-title">{step}</span>
            </span>
          </div>
        ))}
      </Section>

      <div className="cta">
        <a className="btn primary large" href="#reading">
          调整阅读偏好
        </a>
        <a className="btn large" href="#ai">
          翻译服务
        </a>
      </div>
    </section>
  );
}
