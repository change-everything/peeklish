export type AssistanceLevel = 'light' | 'medium' | 'strong';
export type TranslationEngine = 'api' | 'chrome';
export type KeyPersistence = 'session' | 'local';
export type SelectionKind = 'word' | 'phrase' | 'sentence' | 'paragraph';
export type ExpressionType = 'phrasal_verb' | 'idiom' | 'connector' | 'pattern' | 'word' | 'other';

export type Settings = {
  schemaVersion: 1;
  apiBaseUrl: string;
  modelId: string;
  keyPersistence: KeyPersistence;
  assistanceLevel: AssistanceLevel;
  autoMarkEnabled: boolean;
  hoverEnabled: boolean;
  selectionTranslateEnabled: boolean;
  maxAutoCharsPerPage: number;
  engine: TranslationEngine;
};

export type SiteConfig = {
  origin: string;
  enabled: boolean;
  aiTextConsentAt: number | null;
};

export type ExpressionRecord = {
  id: string;
  canonical: string;
  surface: string;
  meaningZh: string;
  type: ExpressionType;
  known: boolean;
  saved: boolean;
  exampleEn?: string;
  sourceOrigin?: string;
  pos?: string;
  firstSeenAt: number;
  updatedAt: number;
};

export type LocatedPhrase = {
  blockId: string;
  surface: string;
  canonical: string;
  meaningZh: string;
  noteZh?: string;
  type: ExpressionType;
  priority: number;
  pos?: string;
  start: number;
  end: number;
};

export type RawPhrase = {
  blockId: string;
  surface: string;
  canonical?: string;
  meaningZh: string;
  noteZh?: string;
  type?: ExpressionType;
  priority?: number;
  pos?: string;
  occurrenceIndex?: number;
  start?: number;
  end?: number;
};

export type KeyPhrase = {
  surface: string;
  canonical: string;
  meaningZh: string;
  type: ExpressionType;
};

export type TranslationPayload = {
  kind: SelectionKind;
  source: string;
  meaningZh?: string;
  translationZh?: string;
  noteZh?: string;
  pos?: string;
  keyPhrases: KeyPhrase[];
};

export type RuntimeConfig = {
  siteEnabled: boolean;
  assistanceLevel: AssistanceLevel;
  autoMarkEnabled: boolean;
  hoverEnabled: boolean;
  selectionTranslateEnabled: boolean;
  aiConsent: boolean;
  hasKey: boolean;
  engine: TranslationEngine;
  maxAutoCharsPerPage: number;
};

export type SaveExpressionInput = {
  canonical: string;
  surface: string;
  meaningZh: string;
  type: ExpressionType;
  known?: boolean;
  saved?: boolean;
  exampleEn?: string;
  pos?: string;
};

export type Result<T> = { ok: true; data: T } | { ok: false; code: string; error: string };

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 1,
  apiBaseUrl: '',
  modelId: '',
  keyPersistence: 'session',
  assistanceLevel: 'medium',
  autoMarkEnabled: true,
  hoverEnabled: true,
  selectionTranslateEnabled: true,
  maxAutoCharsPerPage: 30000,
  engine: 'chrome',
};

export const ENGINE_OPTIONS: Array<{ id: TranslationEngine; label: string }> = [
  { id: 'chrome', label: '谷歌内置' },
  { id: 'api', label: '自定义 AI' },
];

export const ASSISTANCE_OPTIONS: Array<{ id: AssistanceLevel; label: string }> = [
  { id: 'light', label: '轻度' },
  { id: 'medium', label: '适中' },
  { id: 'strong', label: '重度' },
];

export const TYPE_LABELS: Record<ExpressionType, string> = {
  phrasal_verb: '短语',
  idiom: '习语',
  connector: '连接',
  pattern: '句式',
  word: '单词',
  other: '其他',
};

export const EXPRESSION_TYPES: ExpressionType[] = [
  'phrasal_verb',
  'idiom',
  'connector',
  'pattern',
  'word',
  'other',
];

export type ExcerptKind = 'text' | 'code';
export type AnchorStatus = 'ok' | 'moved' | 'ambiguous';
export type PanelTab = 'notes' | 'words' | 'explain';

export type PendingAnchor = {
  kind: ExcerptKind;
  exact: string;
  prefix: string;
  suffix: string;
  blockPath: string;
  blockOffset: number;
  docOffset: number;
  heading?: string;
  lang?: string;
  context: string;
};

export type DocRecord = {
  id: string;
  url: string;
  title: string;
  origin: string;
  createdAt: number;
  lastOpenedAt: number;
};

export type Annotation = {
  id: string;
  docId: string;
  kind: ExcerptKind;
  exact: string;
  prefix: string;
  suffix: string;
  blockPath: string;
  blockOffset: number;
  docOffset: number;
  heading?: string;
  lang?: string;
  status: AnchorStatus;
  createdAt: number;
};

export type NoteAi = {
  text: string;
  mode: 'explain' | 'explain-code';
  model: string;
  savedAt: number;
};

export type Note = {
  id: string;
  docId: string;
  annotationId: string | null;
  title: string;
  body: string;
  tags: string[];
  ai?: NoteAi;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
};

export type ExplainJob = {
  docId: string;
  requestId: string;
  mode: 'explain' | 'explain-code';
  source: string;
  heading?: string;
  context: string;
  lang?: string;
  anchor: PendingAnchor;
  status: 'loading' | 'ready' | 'error' | 'needs-ai';
  text?: string;
  error?: string;
  model?: string;
};

export type PanelFocus = {
  docId: string;
  noteId?: string;
  tab: PanelTab;
  at: number;
};
