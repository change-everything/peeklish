const OTHER_SCRIPT = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g;

export function isEnglishSelection(text: string): boolean {
  const letters = text.match(/[A-Za-z]/g)?.length ?? 0;
  const other = text.match(OTHER_SCRIPT)?.length ?? 0;
  if (letters < 1) return false;
  if (other === 0) return true;
  return letters > other * 2;
}

export function isEnglishBlock(text: string, minChars = 30): boolean {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length < minChars) return false;
  const letters = trimmed.match(/[A-Za-z]/g)?.length ?? 0;
  const cjk = trimmed.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  if (letters < 18) return false;
  if (cjk > letters * 0.25) return false;
  const symbols = trimmed.match(/[{};=<>]/g)?.length ?? 0;
  if (symbols > letters * 0.22) return false;
  return true;
}

export function cleanModelText(input: string, max: number): string {
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, max);
}
