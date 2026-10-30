import { useEffect, useState } from 'react';
import { notesToMarkdown } from '../../domain/note-model';
import type { Annotation, DocRecord, Note } from '../../shared/types';
import { deleteDocument, listDocuments, loadDocumentBundle } from '../../storage/notes';

type Bundle = { doc: DocRecord; notes: Note[]; annotations: Annotation[] };

export function App() {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [query, setQuery] = useState('');

  async function reload() {
    const docs = await listDocuments();
    const next = await Promise.all(
      docs.map(async (doc) => {
        const bundle = await loadDocumentBundle(doc.id);
        return { doc, notes: bundle.notes, annotations: bundle.annotations };
      }),
    );
    setBundles(next.filter((item) => item.notes.length));
  }

  useEffect(() => {
    void reload();
  }, []);

  const needle = query.trim().toLowerCase();
  const visible = bundles.filter((bundle) => {
    if (!needle) return true;
    const text = [bundle.doc.title, bundle.doc.url, ...bundle.notes.map((note) => `${note.title}\n${note.body}`)].join('\n');
    return text.toLowerCase().includes(needle);
  });

  function download(bundle: Bundle) {
    const byId = new Map(bundle.annotations.map((item) => [item.id, item]));
    const markdown = notesToMarkdown(
      bundle.doc,
      bundle.notes.map((note) => {
        const annotation = note.annotationId ? byId.get(note.annotationId) : undefined;
        return {
          title: note.title,
          body: note.body,
          quote: annotation?.exact,
          quoteKind: annotation?.kind,
          lang: annotation?.lang,
          ai: note.ai?.text,
        };
      }),
    );
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${bundle.doc.title || 'peeklish'}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="library">
      <h1>所有笔记</h1>
      <p className="lead">按文档分组。导出时会保留原文引用，并把 AI 解释和你的理解分开。</p>
      <input className="search" value={query} placeholder="搜索标题、原文或理解" aria-label="搜索笔记" onChange={(event) => setQuery(event.target.value)} />
      {visible.length === 0 && <section className="empty"><h3>还没有笔记</h3><p>在网页里选中文字，点「摘录」。</p></section>}
      {visible.map((bundle) => (
        <section className="doc-block" key={bundle.doc.id}>
          <header>
            <div>
              <h2>{bundle.doc.title}</h2>
              <a href={bundle.doc.url}>{bundle.doc.url}</a>
            </div>
            <div className="row-actions">
              <button type="button" onClick={() => download(bundle)}>导出 Markdown</button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  if (!window.confirm(`删除「${bundle.doc.title}」的全部笔记？`)) return;
                  void deleteDocument(bundle.doc.id).then(reload);
                }}
              >
                删除
              </button>
            </div>
          </header>
          {bundle.notes.map((note) => {
            const annotation = bundle.annotations.find((item) => item.id === note.annotationId);
            return (
              <article className="card" key={note.id}>
                <h3 className="title-input">{note.title}</h3>
                {annotation && <blockquote className={annotation.kind === 'code' ? 'quote code' : 'quote'}>{annotation.exact}</blockquote>}
                {note.body && <p>{note.body}</p>}
                {note.ai && <div className="ai"><b>AI 解释</b>{note.ai.text}</div>}
              </article>
            );
          })}
        </section>
      ))}
    </main>
  );
}
