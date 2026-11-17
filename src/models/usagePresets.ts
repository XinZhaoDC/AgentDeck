import type { UsageQueryConfig } from '../types';

/** Query rules shared by the host and all three editors; never credentials. */
export const USAGE_PRESETS = [
  { id: 'auto', label: '自动识别', description: '优先识别服务商和 Sub2API / New API 的 Key 查询；管理令牌仅用于账户接口。', auth: 'api-key', url: '', remainingPath: '', usedPath: '', totalPath: '', unit: 'USD', divisor: 1 },
  { id: 'sub2api', label: 'Sub2API · 当前 Key 可用额度', description: '使用模型 API Key；返回金额已是货币单位，无需除以 500000。whu-usi 使用此预设。', auth: 'api-key', url: '{{rootUrl}}/v1/usage', remainingPath: 'remaining', usedPath: 'quota.used', totalPath: 'quota.limit', unit: 'USD', divisor: 1 },
  { id: 'newapi-key', label: 'New API / One API · Key 额度', description: '只需模型 API Key，不需要管理令牌或用户 ID；默认每 500000 额度折合 1 USD。不限额 Key 不代表账户余额无限。', auth: 'api-key', url: '{{rootUrl}}/api/usage/token', remainingPath: 'data.total_available', usedPath: 'data.total_used', totalPath: 'data.total_granted', unit: 'USD', divisor: 500000 },
  { id: 'newapi', label: 'New API · 账户余额', description: '需要该供应商单独保存的管理令牌和用户 ID；默认每 500000 额度折合 1 USD。', auth: 'newapi', url: '{{rootUrl}}/api/user/self', remainingPath: 'data.quota', usedPath: 'data.used_quota', totalPath: '', unit: 'USD', divisor: 500000 },
  { id: 'sub2api-account', label: 'Sub2API · 账户钱包', description: '使用控制台管理令牌查询账户钱包，不使用模型 API Key；令牌在单个供应商中填写。', auth: 'management', url: '{{rootUrl}}/api/v1/user/profile', remainingPath: 'data.balance', usedPath: '', totalPath: '', unit: 'USD', divisor: 1 },
  { id: 'openai-credit', label: 'OpenAI 兼容中转 · Credit Grants', description: '使用模型 API Key 查询旧式中转余额接口；不用于 OpenAI 官方订阅余额。', auth: 'api-key', url: '{{rootUrl}}/dashboard/billing/credit_grants', remainingPath: 'total_available', usedPath: 'total_used', totalPath: 'total_granted', unit: 'USD', divisor: 1 },
  { id: 'deepseek', label: 'DeepSeek · 账户余额', description: '使用模型 API Key；显示接口返回的钱包币种，优先选择有余额的钱包。', auth: 'api-key', url: '{{rootUrl}}/user/balance', remainingPath: 'balance_infos.0.total_balance', usedPath: '', totalPath: '', unit: 'USD', divisor: 1 },
  { id: 'siliconflow', label: 'SiliconFlow · 账户余额', description: '使用模型 API Key；读取 totalBalance（包含赠送额）。部分站点可能已停用此接口。', auth: 'api-key', url: '{{apiBaseUrl}}/user/info', remainingPath: 'data.totalBalance', usedPath: '', totalPath: '', unit: 'CNY', divisor: 1 },
  { id: 'moonshot', label: 'Moonshot / Kimi · 账户余额', description: '使用模型 API Key；国内站以 CNY 显示，api.moonshot.ai 以 USD 显示。', auth: 'api-key', url: '{{apiBaseUrl}}/users/me/balance', remainingPath: 'data.available_balance', usedPath: '', totalPath: '', unit: 'CNY', divisor: 1 },
  { id: 'stepfun', label: 'StepFun · 账户余额', description: '使用模型 API Key；国内站以 CNY 显示，api.stepfun.ai 以 USD 显示。', auth: 'api-key', url: '{{apiBaseUrl}}/accounts', remainingPath: 'balance', usedPath: '', totalPath: '', unit: 'CNY', divisor: 1 },
  { id: 'novita', label: 'Novita · 账户余额', description: '使用模型 API Key；接口金额除以 10000 转换为 USD。', auth: 'api-key', url: '{{rootUrl}}/openapi/v1/billing/balance/detail', remainingPath: 'availableBalance', usedPath: '', totalPath: '', unit: 'USD', divisor: 10000 },
  { id: 'openrouter-credits', label: 'OpenRouter · 账户余额', description: '需要 OpenRouter 管理密钥（Management Key），在下方管理令牌中单独填写；余额为 total_credits 减 total_usage，单位 USD。', auth: 'management', url: '{{apiBaseUrl}}/credits', remainingPath: '', usedPath: 'data.total_usage', totalPath: 'data.total_credits', unit: 'USD', divisor: 1 },
  { id: 'openrouter', label: 'OpenRouter · Key 额度', description: '使用模型 API Key；这是 Key 的消费上限，未设置上限时不会冒充账户钱包余额。', auth: 'api-key', url: '{{apiBaseUrl}}/key', remainingPath: 'data.limit_remaining', usedPath: 'data.usage', totalPath: 'data.limit', unit: 'USD', divisor: 1 },
  { id: 'generic', label: '通用余额 · balance 字段', description: '使用模型 API Key，读取 balance；实际单位优先使用响应中的 unit。', auth: 'api-key', url: '{{baseUrl}}/user/balance', remainingPath: 'balance', usedPath: '', totalPath: '', unit: 'USD', divisor: 1 },
  { id: 'custom', label: '自定义查询规则', description: '使用模型 API Key；配置接口、JSON 字段路径和数值除数。其他预设也可展开调整参数，并保留各自认证方式。', auth: 'api-key', url: '', remainingPath: '', usedPath: '', totalPath: '', unit: 'USD', divisor: 1 }
] satisfies Array<{ id: NonNullable<UsageQueryConfig['preset']>; label: string; description: string; auth: 'api-key' | 'management' | 'newapi'; url: string; remainingPath: string; usedPath: string; totalPath: string; unit: string; divisor: number }>;

export function resolveUsageUrl(value: string, baseUrl: string, preset?: UsageQueryConfig['preset']): string {
  const exact = baseUrl.trim().replace(/\/+$/g, '');
  const root = exact.replace(/\/v1$/i, '');
  let apiBase = /\/v1$/i.test(exact) ? exact : `${exact}/v1`;
  if (preset?.startsWith('openrouter')) {
    try { const url = new URL(exact); if (url.hostname === 'openrouter.ai' && url.pathname === '/') apiBase = url.origin + '/api/v1'; } catch { /* Validation reports malformed URLs. */ }
  }
  // Keep the meaning of pre-0.12.2 saved New API / DeepSeek templates.
  const legacyBase = preset === 'deepseek' || preset === 'newapi' ? root : exact;
  return value.trim().replace(/\{\{baseUrl\}\}/g, legacyBase).replace(/\{\{rootUrl\}\}/g, root).replace(/\{\{apiBaseUrl\}\}/g, apiBase);
}
