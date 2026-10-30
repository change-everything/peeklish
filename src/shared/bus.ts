export const PEEK_CHANNEL = 'peeklish';

export function publish(type: string, docId?: string): void {
  const channel = new BroadcastChannel(PEEK_CHANNEL);
  channel.postMessage({ type, docId, at: Date.now() });
  channel.close();
}
