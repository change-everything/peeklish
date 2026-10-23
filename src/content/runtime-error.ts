export function bridgeFailure(error: unknown): { ok: false; code: string; error: string } {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (/extension context invalidated/i.test(message)) {
    return { ok: false, code: 'invalidated', error: '扩展已更新，请刷新这个页面' };
  }
  return { ok: false, code: 'network', error: message || '请求失败' };
}
