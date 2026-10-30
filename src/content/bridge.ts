import { browser } from 'wxt/browser';
import type { PendingAnchor, RuntimeConfig } from '../shared/types';
import type { Bridge } from './reader';
import { bridgeFailure } from './runtime-error';

export { bridgeFailure };

export function extensionAlive(): boolean {
  try {
    return Boolean(browser.runtime?.id);
  } catch {
    return false;
  }
}

async function send<T>(message: unknown): Promise<T> {
  return (await browser.runtime.sendMessage(message)) as T;
}

export function extensionBridge(): Bridge {
  return {
    alive: extensionAlive,
    async getConfig() {
      const response = await send<{ ok: boolean; data?: RuntimeConfig }>({ type: 'GET_CONFIG' });
      if (!response?.ok || !response.data) throw new Error('config');
      return response.data;
    },
    async analyze(body) {
      try {
        return await send({ type: 'ANALYZE_BLOCKS', ...body });
      } catch (error) {
        return bridgeFailure(error);
      }
    },
    async translate(body) {
      try {
        return await send({ type: 'TRANSLATE_SELECTION', ...body });
      } catch (error) {
        return bridgeFailure(error);
      }
    },
    async explain(body) {
      try {
        return await send({ type: 'EXPLAIN_SELECTION', ...body });
      } catch (error) {
        return bridgeFailure(error);
      }
    },
    async polish(body) {
      try {
        return await send({ type: 'POLISH_SELECTION', ...body });
      } catch (error) {
        return bridgeFailure(error);
      }
    },
    async markKnown(body) {
      await send({
        type: 'MARK_KNOWN',
        canonical: body.canonical,
        surface: body.surface,
        meaningZh: body.meaningZh,
        expressionType: body.type,
      });
    },
    async saveExpression(body) {
      await send({ type: 'SAVE_EXPRESSION', expression: body });
    },
    cancel() {
      void browser.runtime.sendMessage({ type: 'CANCEL_TAB' }).catch(() => undefined);
    },
    async captureExcerpt(anchor: PendingAnchor) {
      await send({ type: 'CAPTURE_EXCERPT', anchor }).catch(() => undefined);
    },
    async requestExplain(anchor: PendingAnchor) {
      await send({ type: 'EXPLAIN_PAGE', anchor }).catch(() => undefined);
    },
  };
}
