import { describe, expect, it } from 'vitest';
import { matchAnchor } from '../src/domain/anchor-match';
import { formatNoteTime, noteTags, noteTitle, notesToMarkdown, orderNotes } from '../src/domain/note-model';
import { documentKey } from '../src/shared/doc-key';
import type { Annotation, Note } from '../src/shared/types';

describe('document key', () => {
  it('drops tracking parameters and ordinary hashes, and keeps hash routes', () => {
    expect(documentKey('https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/?utm_source=x&lang=en#tasks')).toBe(
      'https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency?lang=en',
    );
    expect(documentKey('https://react.dev/reference/react/useState/#usage')).toBe('https://react.dev/reference/react/useState');
    expect(documentKey('https://example.com/app/#/docs/concurrency')).toBe('https://example.com/app#/docs/concurrency');
    expect(documentKey('chrome://extensions')).toBeNull();
  });
});

describe('anchor matching', () => {
  it('prefers the occurrence whose surrounding text still matches', () => {
    const page = 'Intro paragraph.\nA task is a unit of work.\nLater.\nA task is a unit of work.';
    const found = matchAnchor(page, {
      exact: 'A task is a unit of work.',
      prefix: 'Intro paragraph.\n',
      suffix: '\nLater.',
      docOffset: 18,
      kind: 'text',
    });
    expect(found).toEqual({ status: 'ok', start: page.indexOf('A task'), end: page.indexOf('A task') + 'A task is a unit of work.'.length });
  });

  it('refuses to choose when two copies are equally plausible', () => {
    const page = 'A task is a unit of work. A task is a unit of work.';
    expect(matchAnchor(page, { exact: 'A task is a unit of work.', prefix: '', suffix: '', docOffset: 0, kind: 'text' }).status).toBe('ambiguous');
  });

  it('folds whitespace for prose and keeps code exact', () => {
    expect(matchAnchor('async   let user = fetchUser()', { exact: 'async let user = fetchUser()', prefix: '', suffix: '', docOffset: 0, kind: 'text' }).status).toBe('ok');
    expect(matchAnchor('async   let user = fetchUser()', { exact: 'async let user = fetchUser()', prefix: '', suffix: '', docOffset: 0, kind: 'code' }).status).toBe('moved');
  });
});

describe('note model', () => {
  it('orders notes by their place in the document and labels AI separately in markdown', () => {
    const annotations: Annotation[] = [
      { id: 'a2', docId: 'd', kind: 'text', exact: 'second', prefix: '', suffix: '', blockPath: '', blockOffset: 0, docOffset: 20, status: 'ok', createdAt: 1 },
      { id: 'a1', docId: 'd', kind: 'text', exact: 'first', prefix: '', suffix: '', blockPath: '', blockOffset: 0, docOffset: 4, status: 'ok', createdAt: 1 },
    ];
    const notes: Note[] = [
      { id: 'n2', docId: 'd', annotationId: 'a2', title: 'Later', body: '后', tags: [], createdAt: 2, updatedAt: 2 },
      { id: 'n1', docId: 'd', annotationId: 'a1', title: 'Earlier', body: '前', tags: ['Task'], createdAt: 3, updatedAt: 3, ai: { text: '模型写的', mode: 'explain', model: 'm', savedAt: 3 } },
      { id: 'gone', docId: 'd', annotationId: null, title: 'Deleted', body: '', tags: [], createdAt: 1, updatedAt: 1, deletedAt: 9 },
    ];
    expect(orderNotes(notes, annotations).map((note) => note.id)).toEqual(['n1', 'n2']);
    const markdown = notesToMarkdown({ title: 'Structured Concurrency', url: 'https://docs.swift.org/concurrency' }, [
      { title: 'Earlier', body: '前', quote: 'first', ai: '模型写的' },
    ]);
    expect(markdown).toContain('> first');
    expect(markdown).toContain('AI 解释：');
    expect(markdown).toContain('前');
    expect(noteTitle('A task is a unit of work.', 'Task Hierarchy')).toBe('Task Hierarchy');
    expect(noteTags('Cancellation happens here.', 'Task Hierarchy')).toEqual(['Task', 'Hierarchy', 'Cancellation']);
    expect(formatNoteTime(new Date(2026, 9, 30, 10, 24).getTime(), new Date(2026, 9, 30, 18, 0).getTime())).toBe('今天 10:24');
  });
});
