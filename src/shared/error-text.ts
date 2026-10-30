const TEXT: Record<string, string> = {
  auth: 'AI 服务拒绝了请求，请检查 API Key 是否正确',
  'rate-limit': 'AI 服务请求过于频繁，自动标注已暂停，稍后会恢复',
  timeout: '请求超时，请稍后重试',
  network: '网络连接异常，请稍后重试',
  'bad-response': 'AI 服务返回的内容无法识别，请重试',
  permission: '缺少访问 AI 服务的权限，请在「翻译服务」里重新保存',
  config: '请先在「翻译服务」里填写接口地址、API Key 和模型',
  consent: '需要你同意后，才会把网页文本发送给 AI 服务',
  budget: '本页自动标注已达上限，剩余段落不再标注。可在「阅读偏好」里调高，划词翻译不受影响',
  'too-long': '选中的内容超过 2000 个字符，请缩短后再翻译',
  'not-english': '这段不是英文。peeklish 只翻译英文',
  disabled: '已在此网站关闭 peeklish',
  unsupported: '当前页面不支持',
  stale: '已忽略过期结果',
  aborted: '请求已取消',
  chrome: '当前 Chrome 无法使用内置翻译，请升级到最新版，或改用自定义 AI',
  'needs-ai': '解释需要在设置里配置自定义 AI',
};

export function errorText(code: string, fallback = ''): string {
  if (TEXT[code]) return TEXT[code];
  const clean = fallback.replace(/\s+/g, ' ').trim();
  if (!clean || /sk-|api[_-]?key/i.test(clean)) return '请求失败，请重试';
  return clean.slice(0, 180);
}

export class ProviderError extends Error {
  code: string;

  constructor(code: string, message?: string) {
    super(message || errorText(code));
    this.code = code;
    this.name = 'ProviderError';
  }
}
