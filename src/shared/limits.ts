export const LIMITS = {
  maxBlocks: 8,
  maxBatchChars: 6000,
  maxBlockChars: 4000,
  maxSelectionChars: 2000,
  maxContextChars: 300,
  maxExistingCanonicals: 200,
  maxSurface: 80,
  maxMeaning: 200,
  maxNote: 200,
  maxTranslation: 4000,
  maxExplanation: 500,
  maxPolish: 2000,
  hoverOpenMs: 250,
  hoverCloseMs: 280,
  scanWordBudget: 450,
  scanBatchBlocks: 3,
  scanMaxBlocks: 300,
  scanDebounceMs: 450,
  cacheTtlMs: 30 * 24 * 60 * 60 * 1000,
  cacheCap: 300,
  requestTimeoutMs: 30000,
  rateLimitRetries: 2,
  networkCooldownMs: 30000,
  rateLimitCooldownMs: 5 * 60 * 1000,
} as const;

export const LEVEL_LIMITS = {
  light: { perBlock: 2, per150Words: 2, perScreen: 4, minPriority: 0.78, minGap: 36 },
  medium: { perBlock: 2, per150Words: 4, perScreen: 8, minPriority: 0.7, minGap: 24 },
  strong: { perBlock: 3, per150Words: 8, perScreen: 12, minPriority: 0.55, minGap: 16 },
} as const;

export const ANALYSIS_PROMPT_VERSION = 'a6';
export const TRANSLATION_PROMPT_VERSION = 't2';
export const CONTENT_SCRIPT_FILE = '/content-scripts/content.js';
export const CONTENT_STYLE_FILE = '/highlight.css';
