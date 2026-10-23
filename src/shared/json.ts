function parseLoose(slice: string): unknown | undefined {
  try {
    return JSON.parse(slice);
  } catch {
    try {
      return JSON.parse(slice.replace(/,\s*([}\]])/g, '$1'));
    } catch {
      return undefined;
    }
  }
}

function matchBracket(text: string, start: number): number {
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let quote = false;
  let escape = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (escape) {
        escape = false;
        continue;
      }
      if (char === '\\') {
        escape = true;
        continue;
      }
      if (char === '"') quote = false;
      continue;
    }
    if (char === '"') {
      quote = true;
      continue;
    }
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function scanJsonValues(text: string): unknown[] {
  const found: unknown[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char !== '{' && char !== '[') continue;
    const end = matchBracket(text, index);
    if (end < 0) continue;
    const parsed = parseLoose(text.slice(index, end + 1));
    if (parsed !== undefined) found.push(parsed);
    index = end;
  }
  return found;
}

function prefersAnalysis(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return Array.isArray(record.blocks) || Array.isArray(record.phrases) || Array.isArray(record.paragraphs);
}

export function extractJson(text: string): unknown {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  const fenced = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((match) => match[1]);
  const values = [...fenced, trimmed].flatMap((item) => scanJsonValues(item));
  const preferred = values.find(prefersAnalysis) ?? values.find((value) => value !== null && typeof value === 'object');
  if (preferred !== undefined) return preferred;
  throw new Error('NO_JSON');
}

function renderContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(renderContent).join('');
  if (!content || typeof content !== 'object') return '';
  const record = content as Record<string, unknown>;
  if (typeof record.text === 'string') return record.text;
  if (typeof record.content === 'string') return record.content;
  if ('blocks' in record || 'phrases' in record) return JSON.stringify(record);
  return '';
}

function choiceText(record: Record<string, unknown>): string {
  if (!Array.isArray(record.choices)) return '';
  const chunks: string[] = [];
  for (const choice of record.choices) {
    if (!choice || typeof choice !== 'object') continue;
    const item = choice as Record<string, unknown>;
    const message = item.message;
    if (message && typeof message === 'object') {
      const body = message as Record<string, unknown>;
      const content = renderContent(body.content).trim();
      if (content) chunks.push(content);
      else if (typeof body.reasoning_content === 'string' && body.reasoning_content.includes('{')) chunks.push(body.reasoning_content);
    }
    if (typeof item.text === 'string' && item.text.trim()) chunks.push(item.text);
    if (item.delta && typeof item.delta === 'object') {
      const delta = renderContent((item.delta as Record<string, unknown>).content).trim();
      if (delta) chunks.push(delta);
    }
  }
  return chunks.join('');
}

function geminiText(record: Record<string, unknown>): string {
  if (!Array.isArray(record.candidates)) return '';
  return record.candidates.map((candidate) => {
    if (!candidate || typeof candidate !== 'object') return '';
    const content = (candidate as { content?: { parts?: unknown } }).content;
    return renderContent(content?.parts);
  }).join('');
}

function responsesText(record: Record<string, unknown>): string {
  if (typeof record.output_text === 'string' && record.output_text.trim()) return record.output_text;
  if (!Array.isArray(record.output)) return '';
  return record.output.map((item) => {
    if (!item || typeof item !== 'object') return '';
    const output = item as { content?: unknown };
    return renderContent(output.content);
  }).join('');
}

export function assistantText(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as Record<string, unknown>;
  const direct = choiceText(record) || geminiText(record) || responsesText(record);
  if (direct.trim()) return direct;
  if (typeof record.result === 'string' && record.result.trim()) return record.result;
  const nested = record.data ?? record.result;
  if (nested && typeof nested === 'object' && nested !== payload) {
    const inner = assistantText(nested);
    if (inner.trim()) return inner;
  }
  return '';
}

export function joinSse(body: string): string {
  if (!body.includes('data:')) return '';
  const parts: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const data = trimmed.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    try {
      const text = assistantText(JSON.parse(data));
      if (text) parts.push(text);
    } catch {
      parts.push(data);
    }
  }
  return parts.join('');
}

export function readModelOutput(raw: unknown, bodyText = ''): string {
  const fromRaw = assistantText(raw).trim();
  if (fromRaw) return fromRaw;
  const streamed = joinSse(bodyText).trim();
  if (streamed) return streamed;
  return '';
}
