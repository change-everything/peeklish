import { LEVEL_LIMITS } from '../shared/limits';
import type { AssistanceLevel, ExpressionType } from '../shared/types';

const STOP = new Set(
  'a an the of to in for on with at by from as into onto upon within without against between among over under after before during than then so if or and but nor not no yes this that these those it its i you he she we they me him her us them my your his their our what which who whom whose there here when where why how just also only very more most other such same own each every both few many much some any all per via about above below up out off down away back through around along across apart'.split(
    ' ',
  ),
);

const BASIC = new Set(
  'inspect create manage use make get set add run call see view open read write update delete remove check start stop show hide send save load click select include return require provide allow need want help build deploy look find give take put keep let go come work play try ask tell list define change follow include'.split(
    ' ',
  ),
);

const BASIC_PHRASES = new Set(['create and manage', 'create or manage', 'read and write', 'and so on']);

export function contentTokens(surface: string): string[] {
  return surface.toLowerCase().match(/[a-z]+(?:-[a-z]+)*/g) ?? [];
}

export function wordCount(text: string): number {
  return text.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g)?.length ?? 0;
}

export function blockAllowance(words: number, level: AssistanceLevel): number {
  if (words <= 0) return 0;
  const limits = LEVEL_LIMITS[level];
  const scaled = Math.round((words / 150) * limits.per150Words);
  return Math.min(limits.perBlock, Math.max(1, scaled));
}

export function looseCanonical(canonical: string): string {
  return canonical
    .split(' ')
    .map((word) => (word.length > 4 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word))
    .join(' ');
}

export function sameExpression(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  return looseCanonical(left) === looseCanonical(right);
}

export type LearningRank = 'skip' | 'low' | 'ok' | 'high';

export function learningRank(surface: string, type?: ExpressionType): LearningRank {
  const tokens = contentTokens(surface);
  if (!tokens.length) return 'skip';
  if (BASIC_PHRASES.has(tokens.join(' '))) return 'skip';
  if (tokens.length === 1) {
    const word = tokens[0];
    if (BASIC.has(word) || STOP.has(word) || word.length < 8) return 'skip';
    return 'low';
  }
  const meaningful = tokens.filter((token) => !STOP.has(token));
  if (!meaningful.length) return 'skip';
  if (meaningful.every((token) => BASIC.has(token)) && type !== 'idiom' && type !== 'connector' && type !== 'phrasal_verb') {
    return 'skip';
  }
  if (type === 'connector' || type === 'idiom' || type === 'phrasal_verb') return 'high';
  return 'ok';
}
