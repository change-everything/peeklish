export type ChatMessage = { role: 'system' | 'user'; content: string };

export function buildChatRequest(input: {
  url: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature: number;
  maxTokens?: number;
}): { url: string; init: RequestInit } {
  const body: Record<string, unknown> = {
    model: input.model,
    temperature: input.temperature,
    stream: false,
    messages: input.messages,
  };
  if (input.maxTokens) body.max_tokens = input.maxTokens;
  return {
    url: input.url,
    init: {
      method: 'POST',
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  };
}

export function providerCodeFromStatus(status: number): string | null {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate-limit';
  if (status >= 400) return 'network';
  return null;
}

export function providerMessage(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '';
  const message = (raw as { error?: { message?: unknown } }).error?.message;
  return typeof message === 'string' ? message.slice(0, 180) : '';
}

export async function completeChat(
  input: {
    url: string;
    apiKey: string;
    model: string;
    messages: ChatMessage[];
    temperature: number;
    maxTokens?: number;
    signal: AbortSignal;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<{ status: number; text: string; raw: unknown }> {
  const request = buildChatRequest(input);
  let response: Response;
  try {
    response = await fetchImpl(request.url, { ...request.init, signal: input.signal });
  } catch (error) {
    if (input.signal.aborted) throw error;
    throw Object.assign(new Error('NETWORK'), { code: 'network' });
  }
  const bodyText = await response.text();
  let raw: unknown = bodyText;
  if (bodyText.trim()) {
    try {
      raw = JSON.parse(bodyText);
    } catch {
      raw = bodyText;
    }
  }
  return { status: response.status, text: bodyText, raw };
}
