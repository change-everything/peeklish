import { noteTags, noteTitle, orderNotes } from '../domain/note-model';
import type { AnchorStatus, Annotation, DocRecord, Note, NoteAi, PendingAnchor } from '../shared/types';
import { withStore } from './db';

const PURGE_MS = 60_000;

async function byDoc<T>(name: 'annotations' | 'notes', docId: string): Promise<T[]> {
  const rows = await withStore(name, 'readonly', (store) => store.index('docId').getAll(docId));
  return (rows as T[]) ?? [];
}

export async function touchDocument(doc: DocRecord): Promise<DocRecord> {
  const existing = (await withStore('documents', 'readonly', (store) => store.get(doc.id))) as DocRecord | undefined;
  const now = Date.now();
  const next: DocRecord = {
    id: doc.id,
    url: doc.url,
    title: doc.title.trim() || existing?.title || doc.url,
    origin: doc.origin,
    createdAt: existing?.createdAt ?? now,
    lastOpenedAt: now,
  };
  await withStore('documents', 'readwrite', (store) => store.put(next));
  return next;
}

export async function getDocument(id: string): Promise<DocRecord | null> {
  const row = (await withStore('documents', 'readonly', (store) => store.get(id))) as DocRecord | undefined;
  return row ?? null;
}

export async function listDocuments(): Promise<DocRecord[]> {
  const rows = (await withStore('documents', 'readonly', (store) => store.getAll())) as DocRecord[];
  return rows.sort((left, right) => right.lastOpenedAt - left.lastOpenedAt);
}

export async function listAnnotations(docId: string): Promise<Annotation[]> {
  return byDoc<Annotation>('annotations', docId);
}

export async function listNotes(docId: string): Promise<Note[]> {
  return byDoc<Note>('notes', docId);
}

export async function activeAnnotations(docId: string): Promise<Annotation[]> {
  const [notes, annotations] = await Promise.all([listNotes(docId), listAnnotations(docId)]);
  const hidden = new Set(notes.filter((note) => note.deletedAt && note.annotationId).map((note) => note.annotationId));
  return annotations.filter((item) => !hidden.has(item.id));
}

export async function loadDocumentBundle(docId: string): Promise<{ notes: Note[]; annotations: Annotation[]; deleted: Note[] }> {
  await purgeDeleted(docId);
  const [notes, annotations] = await Promise.all([listNotes(docId), listAnnotations(docId)]);
  return { notes: orderNotes(notes, annotations), annotations, deleted: notes.filter((note) => note.deletedAt) };
}

export async function createExcerpt(doc: DocRecord, anchor: PendingAnchor): Promise<{ note: Note; annotation: Annotation }> {
  const savedDoc = await touchDocument(doc);
  const now = Date.now();
  const annotation: Annotation = {
    id: crypto.randomUUID(),
    docId: savedDoc.id,
    kind: anchor.kind,
    exact: anchor.exact,
    prefix: anchor.prefix,
    suffix: anchor.suffix,
    blockPath: anchor.blockPath,
    blockOffset: anchor.blockOffset,
    docOffset: anchor.docOffset,
    heading: anchor.heading,
    lang: anchor.lang,
    status: 'ok',
    createdAt: now,
  };
  const note: Note = {
    id: crypto.randomUUID(),
    docId: savedDoc.id,
    annotationId: annotation.id,
    title: noteTitle(anchor.exact, anchor.heading),
    body: '',
    tags: noteTags(anchor.exact, anchor.heading),
    createdAt: now,
    updatedAt: now,
  };
  await withStore('annotations', 'readwrite', (store) => store.put(annotation));
  await withStore('notes', 'readwrite', (store) => store.put(note));
  return { note, annotation };
}

export async function updateNote(id: string, patch: Partial<Pick<Note, 'title' | 'body'>>): Promise<Note | null> {
  const current = (await withStore('notes', 'readonly', (store) => store.get(id))) as Note | undefined;
  if (!current || current.deletedAt) return null;
  const next: Note = {
    ...current,
    title: patch.title !== undefined ? patch.title.slice(0, 80) : current.title,
    body: patch.body !== undefined ? patch.body.slice(0, 8000) : current.body,
    updatedAt: Date.now(),
  };
  await withStore('notes', 'readwrite', (store) => store.put(next));
  return next;
}

export async function attachAi(noteId: string, ai: NoteAi): Promise<Note | null> {
  const current = (await withStore('notes', 'readonly', (store) => store.get(noteId))) as Note | undefined;
  if (!current || current.deletedAt) return null;
  const next: Note = { ...current, ai, updatedAt: Date.now() };
  await withStore('notes', 'readwrite', (store) => store.put(next));
  return next;
}

export async function saveExplanation(doc: DocRecord, anchor: PendingAnchor, ai: NoteAi): Promise<Note> {
  const [notes, annotations] = await Promise.all([listNotes(doc.id), listAnnotations(doc.id)]);
  const existing = annotations.find((item) => item.exact === anchor.exact);
  const note = existing ? notes.find((item) => item.annotationId === existing.id && !item.deletedAt) : undefined;
  if (note) {
    const saved = await attachAi(note.id, ai);
    if (saved) return saved;
  }
  const created = await createExcerpt(doc, anchor);
  const saved = await attachAi(created.note.id, ai);
  return saved ?? created.note;
}

export async function softDeleteNote(id: string): Promise<void> {
  const current = (await withStore('notes', 'readonly', (store) => store.get(id))) as Note | undefined;
  if (!current) return;
  await withStore('notes', 'readwrite', (store) => store.put({ ...current, deletedAt: Date.now(), updatedAt: Date.now() }));
}

export async function restoreNote(id: string): Promise<void> {
  const current = (await withStore('notes', 'readonly', (store) => store.get(id))) as Note | undefined;
  if (!current?.deletedAt) return;
  const next: Note = { ...current, updatedAt: Date.now() };
  delete next.deletedAt;
  await withStore('notes', 'readwrite', (store) => store.put(next));
}

export async function detachAnnotation(noteId: string): Promise<void> {
  const current = (await withStore('notes', 'readonly', (store) => store.get(noteId))) as Note | undefined;
  if (!current) return;
  const annotationId = current.annotationId;
  const next: Note = { ...current, annotationId: null, updatedAt: Date.now() };
  await withStore('notes', 'readwrite', (store) => store.put(next));
  if (annotationId) await withStore('annotations', 'readwrite', (store) => store.delete(annotationId));
}

export async function purgeDeleted(docId: string, now = Date.now()): Promise<void> {
  const notes = await listNotes(docId);
  for (const note of notes) {
    if (!note.deletedAt || now - note.deletedAt < PURGE_MS) continue;
    await withStore('notes', 'readwrite', (store) => store.delete(note.id));
    const annotationId = note.annotationId;
    if (annotationId) await withStore('annotations', 'readwrite', (store) => store.delete(annotationId));
  }
}

export async function applyStatuses(items: Array<{ id: string; status: AnchorStatus }>): Promise<void> {
  for (const item of items) {
    if (item.status !== 'ok' && item.status !== 'moved' && item.status !== 'ambiguous') continue;
    const current = (await withStore('annotations', 'readonly', (store) => store.get(item.id))) as Annotation | undefined;
    if (!current || current.status === item.status) continue;
    await withStore('annotations', 'readwrite', (store) => store.put({ ...current, status: item.status }));
  }
}

export async function deleteDocument(docId: string): Promise<void> {
  const [notes, annotations] = await Promise.all([listNotes(docId), listAnnotations(docId)]);
  for (const note of notes) await withStore('notes', 'readwrite', (store) => store.delete(note.id));
  for (const annotation of annotations) await withStore('annotations', 'readwrite', (store) => store.delete(annotation.id));
  await withStore('documents', 'readwrite', (store) => store.delete(docId));
}

export async function findNoteByAnnotation(annotationId: string): Promise<Note | null> {
  const rows = (await withStore('notes', 'readonly', (store) => store.index('annotationId').getAll(annotationId))) as Note[];
  return rows.find((note) => !note.deletedAt) ?? null;
}
