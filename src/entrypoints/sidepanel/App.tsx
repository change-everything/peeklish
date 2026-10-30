import { useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { injectContentScript, syncRegisteredScripts } from '../../background/register-scripts';
import { prepareChromeTranslator } from '../../chrome/builtin-translator';
import { PEEK_CHANNEL, publish } from '../../shared/bus';
import { canInjectPage, originMatchPattern } from '../../shared/api-url';
import { documentKey } from '../../shared/doc-key';
import { formatNoteTime } from '../../domain/note-model';
import type { Annotation, ExplainJob, ExpressionRecord, Note, PanelTab, Settings } from '../../shared/types';
import { getApiKey } from '../../storage/keys';
import { consentWhenEnabling, getSettings } from '../../storage/settings';
import { listExpressions } from '../../storage/expressions';
import {
  detachAnnotation,
  loadDocumentBundle,
  restoreNote,
  saveExplanation,
  softDeleteNote,
  updateNote,
} from '../../storage/notes';
import { readExplainJob, readPanelFocus } from '../../storage/panel-state';
import { pushNotes } from '../../storage/push-notes';
import { getSite, saveSite } from '../../storage/sites';
import { Icon } from '../../ui/Icon';

type Page =
  | { ok: true; origin: string; host: string; url: string; docId: string; title: string; tabId: number }
  | { ok: false; reason: string; tabId: number };

type Dirty = { title?: string; body?: string };

export function App() {
  const [page, setPage] = useState<Page>({ ok: false, reason: '正在读取当前页面', tabId: -1 });
  const [enabled, setEnabled] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [consent, setConsent] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [words, setWords] = useState<ExpressionRecord[]>([]);
  const [job, setJob] = useState<ExplainJob | null>(null);
  const [tab, setTab] = useState<PanelTab>('notes');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [menu, setMenu] = useState(false);
  const [cardMenu, setCardMenu] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [banner, setBanner] = useState('');
  const [undo, setUndo] = useState<{ id: string; title: string } | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [saving, setSaving] = useState<Record<string, 'saving' | 'saved'>>({});
  const dirty = useRef(new Map<string, Dirty>());
  const timers = useRef(new Map<string, number>());
  const seenFocus = useRef(0);
  const focused = useRef('');
  const focusIdRef = useRef<string | null>(null);
  focusIdRef.current = focusId;

  async function refresh() {
    const [active] = await browser.tabs.query({ active: true, currentWindow: true });
    const tabId = active?.id ?? -1;
    const url = active?.url ?? '';
    const injectable = url ? canInjectPage(url) : { ok: false as const, reason: '当前页面不支持' };
    const stored = await getSettings();
    setSettings(stored);
    setHasKey(Boolean(await getApiKey(stored.keyPersistence)));
    const docId = url ? documentKey(url) : null;
    if (!injectable.ok || !docId) {
      setPage({ ok: false, reason: injectable.ok ? '当前页面不支持' : injectable.reason, tabId });
      setEnabled(false);
      setNotes([]);
      setAnnotations([]);
      setWords([]);
      setJob(null);
      return;
    }
    let title = active?.title || injectable.host;
    const meta = await browser.tabs.sendMessage(tabId, { type: 'GET_PAGE_CONTEXT' }).catch(() => null);
    if (meta && typeof meta.title === 'string' && meta.title.trim()) title = meta.title.trim();
    const next: Page = { ok: true, origin: injectable.origin, host: injectable.host, url, docId, title, tabId };
    setPage(next);
    const site = await getSite(injectable.origin);
    setEnabled(Boolean(site?.enabled));
    setConsent(Boolean(site?.aiTextConsentAt));
    const bundle = await loadDocumentBundle(docId);
    const merged = bundle.notes.map((note) => ({ ...note, ...dirty.current.get(note.id) }));
    setNotes(merged);
    setAnnotations(bundle.annotations);
    const expressions = await listExpressions().catch(() => []);
    setWords(expressions.filter((item) => item.sourceOrigin === injectable.origin && (item.saved || item.known)));
    setJob(await readExplainJob(docId));
    const focus = await readPanelFocus();
    if (focus && focus.docId === docId && focus.at !== seenFocus.current && Date.now() - focus.at < 8000) {
      seenFocus.current = focus.at;
      setTab(focus.tab);
      if (focus.noteId) setFocusId(focus.noteId);
    }
  }

  useEffect(() => {
    void refresh();
    const later = window.setTimeout(() => void refresh(), 500);
    const channel = new BroadcastChannel(PEEK_CHANNEL);
    channel.onmessage = () => void refresh();
    const onActivated = () => void refresh();
    const onUpdated = (_id: number, info: { url?: string; title?: string }) => {
      if (info.url || info.title) void refresh();
    };
    browser.tabs.onActivated.addListener(onActivated);
    browser.tabs.onUpdated.addListener(onUpdated);
    const onStorage = (changes: Record<string, unknown>, area: string) => {
      if (area === 'session' && (changes.panelFocus || Object.keys(changes).some((key) => key.startsWith('explain:')))) void refresh();
    };
    browser.storage.onChanged.addListener(onStorage);
    const flush = () => {
      for (const id of dirty.current.keys()) void flushNote(id);
    };
    const onFocus = window.setInterval(() => {
      const id = focusIdRef.current;
      if (!id || focused.current === id) return;
      const field = document.getElementById(`body-${id}`);
      if (field instanceof HTMLTextAreaElement) {
        focused.current = id;
        field.focus();
      }
    }, 200);
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      window.clearTimeout(later);
      window.clearInterval(onFocus);
      channel.close();
      browser.tabs.onActivated.removeListener(onActivated);
      browser.tabs.onUpdated.removeListener(onUpdated);
      browser.storage.onChanged.removeListener(onStorage);
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, []);

  async function flushNote(id: string) {
    const patch = dirty.current.get(id);
    if (!patch) return;
    dirty.current.delete(id);
    window.clearTimeout(timers.current.get(id));
    await updateNote(id, patch);
    setSaving((current) => ({ ...current, [id]: 'saved' }));
  }

  function edit(id: string, patch: Dirty) {
    setNotes((current) => current.map((note) => (note.id === id ? { ...note, ...patch } : note)));
    dirty.current.set(id, { ...dirty.current.get(id), ...patch });
    setSaving((current) => ({ ...current, [id]: 'saving' }));
    window.clearTimeout(timers.current.get(id));
    timers.current.set(id, window.setTimeout(() => void flushNote(id), 300));
  }

  async function toggleSite(next: boolean) {
    if (!page.ok || !settings) return;
    if (!next) {
      const site = await getSite(page.origin);
      await saveSite({ origin: page.origin, enabled: false, aiTextConsentAt: site?.aiTextConsentAt ?? null });
      await syncRegisteredScripts();
      await browser.tabs.sendMessage(page.tabId, { type: 'CLEANUP' }).catch(() => undefined);
      setMenu(false);
      await refresh();
      return;
    }
    if (settings.engine === 'api' && !hasKey) {
      openOptions('ai');
      return;
    }
    const granted = await browser.permissions.request({ origins: [originMatchPattern(page.origin)] });
    if (!granted) {
      setBanner('需要允许访问这个网站，Peeklish 才能在页面上标注和摘录。');
      return;
    }
    if (settings.engine === 'chrome') {
      setBanner('正在准备谷歌内置翻译…');
      const ready = await prepareChromeTranslator((ratio) => setBanner(`正在下载翻译语言包 ${Math.round(ratio * 100)}%`));
      if (ready !== 'ready') {
        setBanner('当前 Chrome 无法使用内置翻译。请升级 Chrome，或在设置里改用自定义 AI。');
        return;
      }
    }
    const existing = await getSite(page.origin);
    await saveSite({
      origin: page.origin,
      enabled: true,
      aiTextConsentAt: consentWhenEnabling(settings.engine, existing?.aiTextConsentAt),
    });
    await syncRegisteredScripts();
    await injectContentScript(page.tabId).catch(() => undefined);
    await browser.tabs.sendMessage(page.tabId, { type: 'ENSURE' }).catch(() => undefined);
    setBanner('');
    await refresh();
  }

  function openOptions(hash: string) {
    void browser.tabs.create({ url: browser.runtime.getURL(`/options.html#${hash}`) });
  }

  async function scrollTo(annotationId: string | null) {
    if (!page.ok || !annotationId) return;
    const response = await browser.tabs.sendMessage(page.tabId, { type: 'SCROLL_TO', annotationId }).catch(() => null);
    if (response && response.found === false) setBanner('原文位置已变化，引用仍保留在笔记里。');
  }

  async function removeNote(note: Note) {
    await flushNote(note.id);
    await softDeleteNote(note.id);
    setUndo({ id: note.id, title: note.title });
    setCardMenu(null);
    if (page.ok) {
      await pushNotes(page.tabId, page.docId);
      publish('notes', page.docId);
    }
    window.setTimeout(() => setUndo((current) => (current?.id === note.id ? null : current)), 5000);
    await refresh();
  }

  async function undoRemove() {
    if (!undo || !page.ok) return;
    await restoreNote(undo.id);
    await pushNotes(page.tabId, page.docId);
    publish('notes', page.docId);
    setUndo(null);
    await refresh();
  }

  async function dropQuote(note: Note) {
    await detachAnnotation(note.id);
    setConfirmId(null);
    if (page.ok) await pushNotes(page.tabId, page.docId);
    await refresh();
  }

  async function saveJob() {
    if (!page.ok || !job?.text || !settings) return;
    const note = await saveExplanation(
      { id: page.docId, url: page.url, title: page.title, origin: page.origin, createdAt: 0, lastOpenedAt: 0 },
      job.anchor,
      { text: job.text, mode: job.mode, model: job.model || settings.modelId || 'custom', savedAt: Date.now() },
    );
    await pushNotes(page.tabId, page.docId);
    publish('notes', page.docId);
    setFocusId(note.id);
    setTab('notes');
    await refresh();
  }

  const annotationOf = (note: Note) => annotations.find((item) => item.id === note.annotationId) ?? null;
  const needle = query.trim().toLowerCase();
  const visible = notes.filter((note) => {
    if (!needle) return true;
    const quote = annotationOf(note)?.exact ?? '';
    return [note.title, note.body, note.tags.join(' '), quote].join('\n').toLowerCase().includes(needle);
  });
  const builtin = settings?.engine !== 'api';

  return (
    <main className="sheet" onClick={() => { setMenu(false); setCardMenu(null); }}>
      <header className="top">
        <div className="brand">
          <span className="mark" aria-hidden="true">
            <Icon name="bookmark" size={18} />
          </span>
          <div>
            <h1>Peeklish</h1>
            <p>正在阅读</p>
          </div>
          <div className="tools">
            <button type="button" aria-label="搜索本页笔记" onClick={(event) => { event.stopPropagation(); setSearching((value) => !value); }}>
              <Icon name="search" size={16} />
            </button>
            <button type="button" aria-label="设置" onClick={() => openOptions('reading')}>
              <Icon name="gear" size={16} />
            </button>
            <button type="button" aria-label="更多" onClick={(event) => { event.stopPropagation(); setMenu((value) => !value); }}>
              <Icon name="more" size={16} />
            </button>
          </div>
        </div>
        {menu && (
          <div className="menu header-menu" onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => void browser.tabs.create({ url: browser.runtime.getURL('/library.html') })}>所有笔记</button>
            {page.ok && enabled && <button type="button" onClick={() => void toggleSite(false)}>暂停此网站</button>}
            <button type="button" onClick={() => openOptions('reading')}>阅读设置</button>
            <button type="button" onClick={() => openOptions('library')}>表达库</button>
          </div>
        )}
        <div className="doc">
          <h2>{page.ok ? page.title : 'Peeklish'}</h2>
          <p className="host">{page.ok ? page.host : page.reason}</p>
          <Art />
        </div>
        {searching && (
          <input className="search" value={query} placeholder="搜索本页笔记" aria-label="搜索本页笔记" onChange={(event) => setQuery(event.target.value)} />
        )}
      </header>
      <nav className="tabs" aria-label="阅读工作台">
        <button type="button" className={tab === 'notes' ? 'on' : ''} onClick={() => setTab('notes')}>笔记 ({notes.length})</button>
        <button type="button" className={tab === 'words' ? 'on' : ''} onClick={() => setTab('words')}>词汇 ({words.length})</button>
        <button type="button" className={tab === 'explain' ? 'on' : ''} onClick={() => setTab('explain')}>AI 解释</button>
      </nav>
      <div className="scroller">
        {banner && <div className="banner"><p>{banner}</p></div>}
        {!page.ok && <section className="empty"><h3>当前页面不支持标注</h3><p>笔记仍留在本机。打开普通网页后再摘录。</p></section>}
        {page.ok && !enabled && (
          <section className="banner">
            <h3>在 {page.host} 启用</h3>
            <p>{builtin ? '用 Chrome 内置翻译在本机标注和翻译，网页内容不会上传。' : '启用后，这个网站上你选中的内容会发给你配置的 AI 服务。'}</p>
            <button type="button" className="primary" onClick={() => void toggleSite(true)}>在当前网站启用</button>
          </section>
        )}
        {page.ok && enabled && !builtin && !consent && (
          <section className="banner">
            <h3>需要同意后才发送文本</h3>
            <button type="button" className="primary" onClick={() => void toggleSite(true)}>同意并继续</button>
          </section>
        )}
        {tab === 'notes' && page.ok && enabled && visible.length === 0 && (
          <section className="empty">
            <h3>摘录从阅读开始</h3>
            <p>选中网页中的文字，点击「摘录」，就会出现在这里。</p>
          </section>
        )}
        {tab === 'notes' && visible.map((note, index) => {
          const annotation = annotationOf(note);
          return (
            <article className="card" key={note.id} onClick={(event) => event.stopPropagation()}>
              <header className="card-head">
                <span className="num">{index + 1}</span>
                <input
                  className="title-input"
                  aria-label="笔记标题"
                  value={note.title}
                  onChange={(event) => edit(note.id, { title: event.target.value })}
                />
                <button type="button" className="icon-btn pin" aria-label="返回原文" title="返回原文" onClick={() => void scrollTo(note.annotationId)}>
                  <Icon name="bookmark" size={16} />
                </button>
              </header>
              {cardMenu === note.id && (
                <div className="menu">
                  {note.annotationId && <button type="button" onClick={() => { setConfirmId(note.id); setCardMenu(null); }}>去掉引用</button>}
                  <button type="button" className="danger" onClick={() => void removeNote(note)}>删除笔记</button>
                </div>
              )}
              {annotation && <blockquote className={annotation.kind === 'code' ? 'quote code' : 'quote'}>{annotation.exact}</blockquote>}
              {annotation && annotation.status !== 'ok' && (
                <p className="warn">{annotation.status === 'ambiguous' ? '原文出现了多次，先不跳转。' : '原文位置已变化'}</p>
              )}
              {confirmId === note.id && (
                <div className="confirm">
                  <p>去掉引用后，你的理解可以留下。</p>
                  <button type="button" onClick={() => void dropQuote(note)}>保留理解</button>
                  <button type="button" onClick={() => void removeNote(note)}>一起删除</button>
                </div>
              )}
              <div className="understand">我的理解</div>
              <textarea
                id={`body-${note.id}`}
                className="body"
                placeholder="写下你的理解"
                value={note.body}
                onChange={(event) => {
                  edit(note.id, { body: event.target.value });
                  event.target.style.height = 'auto';
                  event.target.style.height = `${event.target.scrollHeight}px`;
                }}
              />
              {note.ai && (
                <div className="ai">
                  <b>AI 解释</b>
                  {note.ai.text}
                </div>
              )}
              <footer className="card-foot">
                <div className="tags">{note.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
                <time className="when">{saving[note.id] === 'saving' ? '保存中' : formatNoteTime(note.createdAt)}</time>
                <button type="button" className="icon-btn" aria-label="笔记操作" onClick={() => setCardMenu(cardMenu === note.id ? null : note.id)}>
                  <Icon name="more" size={16} />
                </button>
              </footer>
            </article>
          );
        })}
        {tab === 'words' && page.ok && words.length === 0 && (
          <section className="empty"><h3>本页还没有词汇</h3><p>悬停下划线短语，可以收藏或标成已掌握。</p></section>
        )}
        {tab === 'words' && words.map((word) => (
          <article className="word" key={word.id}>
            <strong>{word.surface}</strong>
            <p>{word.meaningZh}</p>
            <span className="type">{word.known ? '已掌握' : '收藏'}</span>
          </article>
        ))}
        {tab === 'explain' && (!job || (page.ok && job.docId !== page.docId)) && (
          <section className="empty"><h3>解释留在这里</h3><p>选中文字后点「解释」。结果不会自动变成笔记，除非你保存。</p></section>
        )}
        {tab === 'explain' && job && page.ok && job.docId === page.docId && (
          <article className="card">
            <blockquote className={job.mode === 'explain-code' ? 'quote code' : 'quote'}>{job.source}</blockquote>
            {job.status === 'loading' && <p className="understand">正在理解…</p>}
            {job.status === 'needs-ai' && (
              <>
                <p className="understand">{job.error}</p>
                <button type="button" className="primary" onClick={() => openOptions('ai')}>打开翻译设置</button>
              </>
            )}
            {job.status === 'error' && (
              <>
                <p className="understand">{job.error}</p>
                <button type="button" className="primary" onClick={() => void browser.runtime.sendMessage({ type: 'RETRY_EXPLAIN' })}>重试</button>
              </>
            )}
            {job.status === 'ready' && job.text && (
              <>
                <div className="ai"><b>AI 解释</b>{job.text}</div>
                <div className="actions">
                  <button type="button" onClick={() => void navigator.clipboard.writeText(job.text || '')}>复制</button>
                  <button type="button" className="primary" onClick={() => void saveJob()}>保存到笔记</button>
                </div>
              </>
            )}
          </article>
        )}
      </div>
      {undo && (
        <div className="undo">
          <span>已删除「{undo.title}」</span>
          <button type="button" onClick={() => void undoRemove()}>撤销</button>
        </div>
      )}
      <footer className="foot">
        <span>{builtin ? '谷歌内置 · 本机' : '自定义 AI'}</span>
        <button type="button" className="icon-btn" aria-label="打开设置" onClick={() => openOptions('ai')}><Icon name="gear" size={15} /></button>
      </footer>
    </main>
  );
}

function Art() {
  return (
    <svg className="art" viewBox="0 0 64 52" aria-hidden="true">
      <rect x="18" y="8" width="28" height="34" rx="6" fill="#ffe28a" />
      <path d="M34 8h12v12H34z" fill="#f5c400" />
      <rect x="24" y="24" width="16" height="3" rx="1.5" fill="#fff" />
      <rect x="24" y="30" width="12" height="3" rx="1.5" fill="#fff" />
    </svg>
  );
}
