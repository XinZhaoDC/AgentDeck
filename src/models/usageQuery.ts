import { withNetworkTool } from '../network/transport';
import { ToolId } from '../types';
import { networkFetch } from '../network/transport';
import { UsageQueryConfig, UsageQueryResult } from '../types';
import { resolveUsageUrl, USAGE_PRESETS } from './usagePresets';

export function defaultUsageQuery(baseUrl: string): UsageQueryConfig {
  return {
    enabled: false,
    preset: 'auto',
    url: '',
    remainingPath: '',
    usedPath: '',
    totalPath: '',
    unit: 'USD'
  };
}

export function usagePreset(
  preset: NonNullable<UsageQueryConfig['preset']>,
  baseUrl: string,
  current?: UsageQueryConfig
): UsageQueryConfig {
  const enabled = current?.enabled ?? false;
  if (preset === 'custom') return { ...(current ?? defaultUsageQuery(baseUrl)), enabled, preset };
  const definition = USAGE_PRESETS.find(item => item.id === preset);
  if (!definition) throw new Error('不支持的余额查询预设。');
  const { url, remainingPath, usedPath, totalPath, unit, divisor } = definition;
  return { enabled, preset, url: resolveUsageUrl(url, baseUrl, preset), remainingPath, usedPath, totalPath, unit, divisor,
    ...(preset === 'newapi' ? { userId: current?.userId ?? '' } : {}) };
}

export async function queryUsage(
  config: UsageQueryConfig,
  baseUrl: string,
  apiKey: string,
  usageAccessToken?: string,
  signal?: AbortSignal,
  tool: ToolId = 'claude'): Promise<UsageQueryResult> {
  return withNetworkTool(tool, () => queryUsageScoped(config, baseUrl, apiKey, usageAccessToken, signal));
}

async function queryUsageScoped(
  config: UsageQueryConfig,
  baseUrl: string,
  apiKey: string,
  usageAccessToken?: string,
  signal?: AbortSignal
): Promise<UsageQueryResult> {
  const checkedAt = new Date().toISOString();
  if (config.preset === 'auto') {
    return queryUsageAutomatically(baseUrl, apiKey, usageAccessToken, config.userId, checkedAt, signal);
  }
  const endpoint = resolveUsageUrl(config.url, baseUrl, config.preset);
  if (!endpoint) return { ok: false, checkedAt, error: 'Usage URL is required' };

  const auth = USAGE_PRESETS.find(item => item.id === config.preset)?.auth ?? 'api-key';
  if (auth === 'newapi' && (!usageAccessToken || !config.userId?.trim())) {
    return { ok: false, endpoint, checkedAt, error: 'New API 账户余额需要管理令牌和用户 ID；查询 Key 额度请选择 New API / One API · Key 额度。' };
  }
  if (auth === 'management' && !usageAccessToken) return { ok: false, endpoint, checkedAt, error: '账户余额查询需要管理令牌；仅有模型 API Key 时请选择相应的 Key 额度预设。' };
  const headers = buildUsageHeaders(
    auth === 'api-key' ? apiKey : usageAccessToken ?? '',
    auth === 'newapi' ? config.userId : undefined
  );
  return queryUsageEndpoint(
    endpoint,
    headers,
    [{
      label: config.preset ?? 'custom',
      preset: config.preset,
      remainingPath: config.remainingPath,
      usedPath: config.usedPath,
      totalPath: config.totalPath,
      unit: config.unit,
      divisor: config.divisor
    }],
    checkedAt,
    signal,
    10_000
  );
}

interface UsageShape {
  label: string;
  preset?: UsageQueryConfig['preset'];
  remainingPath: string;
  usedPath?: string;
  totalPath?: string;
  unit: string;
  divisor?: number;
}

interface UsageCandidate {
  endpoint: string;
  label: string;
  preset: NonNullable<UsageQueryConfig['preset']>;
  auth?: 'provider' | 'management' | 'newapi';
}

async function queryUsageAutomatically(
  baseUrl: string,
  apiKey: string,
  usageAccessToken: string | undefined,
  userId: string | undefined,
  checkedAt: string,
  signal?: AbortSignal
): Promise<UsageQueryResult> {
  const attempts: NonNullable<UsageQueryResult['attempts']> = [];
  const deadline = Date.now() + 20_000;
  const candidates = buildAutomaticCandidates(baseUrl);
  if (usageAccessToken) {
    candidates.sort((left, right) => Number(right.auth !== undefined && right.auth !== 'provider') - Number(left.auth !== undefined && left.auth !== 'provider'));
  }
  for (const candidate of candidates) {
    if (signal?.aborted) return { ok: false, checkedAt, attempts, error: 'Cancelled' };
    if (Date.now() >= deadline) break;
    if (candidate.auth === 'management' && !usageAccessToken) {
      attempts.push({ endpoint: candidate.endpoint, error: 'Management Access Token required' });
      continue;
    }
    if (candidate.auth === 'newapi' && (!usageAccessToken || !userId?.trim())) {
      attempts.push({ endpoint: candidate.endpoint, error: 'Management Access Token and User ID required' });
      continue;
    }
    const headers = candidate.auth === 'management'
      ? buildUsageHeaders(usageAccessToken ?? '')
      : candidate.auth === 'newapi'
        ? buildUsageHeaders(usageAccessToken ?? '', userId)
        : buildUsageHeaders(apiKey);
    const result = await queryUsageEndpoint(
      candidate.endpoint,
      headers,
      automaticShapes(candidate.preset, baseUrl),
      checkedAt,
      signal,
      Math.min(4_000, Math.max(1, deadline - Date.now()))
    );
    attempts.push({
      endpoint: candidate.endpoint,
      httpStatus: result.httpStatus,
      responseShape: result.responseShape,
      error: result.ok ? undefined : result.error
    });
    if (result.ok) return { ...result, strategy: `${candidate.label} / ${result.strategy}`, attempts };
    if (result.error === 'Cancelled') return { ...result, attempts };
  }
  return {
    ok: false,
    checkedAt,
    attempts,
    error: `No supported usage endpoint found after ${attempts.length} attempts`
  };
}

async function queryUsageEndpoint(
  endpoint: string,
  headers: Record<string, string>,
  shapes: UsageShape[],
  checkedAt: string,
  signal: AbortSignal | undefined,
  timeoutMs: number
): Promise<UsageQueryResult> {

  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await networkFetch(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json', ...headers },
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) {
      return { ok: false, endpoint, httpStatus: response.status, checkedAt, error: `HTTP ${response.status}` };
    }
    let data: unknown;
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      const contentType = response.headers.get('content-type') ?? '';
      const looksLikeHtml = contentType.includes('text/html') || /^\s*<!doctype|^\s*<html/i.test(text);
      return {
        ok: false,
        endpoint: response.url || endpoint,
        httpStatus: response.status,
        checkedAt,
        error: looksLikeHtml ? 'Usage endpoint returned HTML instead of JSON' : 'Usage endpoint returned invalid JSON'
      };
    }
    const object = data as Record<string, unknown> | null;
    if (object && (object.success === false || object.code === false || object.isValid === false)) {
      return { ok: false, endpoint, httpStatus: response.status, checkedAt, error: '余额接口拒绝查询，请检查凭据或供应商状态。' };
    }
    for (const shape of shapes) {
      const divisor = shape.divisor && shape.divisor > 0 ? shape.divisor : 1;
      if (shape.preset === 'deepseek' && shape.remainingPath === 'balance_infos.0.total_balance') {
        const wallets = object?.balance_infos;
        if (Array.isArray(wallets)) {
          const wallet = wallets.find(item => (readNumber(item, 'total_balance') ?? 0) > 0) ?? wallets[0];
          const remaining = divide(readNumber(wallet, 'total_balance'), divisor);
          if (remaining !== undefined) return { ok: true, endpoint: response.url || endpoint, httpStatus: response.status, remaining,
            unit: readString(wallet, 'currency') || shape.unit, strategy: shape.label, checkedAt };
        }
      }
      const used = divide(readNumber(data, shape.usedPath), divisor);
      let total = divide(readNumber(data, shape.totalPath), divisor);
      let directRemaining = divide(readNumber(data, shape.remainingPath), divisor);
      if (shape.preset === 'siliconflow' && directRemaining === undefined) directRemaining = divide(readNumber(data, 'data.balance'), divisor);
      const unlimited = shape.preset === 'newapi-key' && readValue(data, 'data.unlimited_quota') === true
        || shape.preset === 'openrouter' && readValue(data, 'data.limit') === null
        || shape.preset === 'sub2api' && directRemaining !== undefined && directRemaining < 0;
      let unit = shape.unit;
      if (shape.preset === 'generic' || shape.preset === 'sub2api') unit = readString(data, 'unit') || readString(data, 'quota.unit') || unit;
      if (shape.preset === 'siliconflow' && new URL(endpoint).hostname === 'api.siliconflow.com') unit = 'USD';
      if (shape.preset === 'moonshot' && new URL(endpoint).hostname === 'api.moonshot.ai' || shape.preset === 'stepfun' && new URL(endpoint).hostname === 'api.stepfun.ai') unit = 'USD';
      if (unlimited) return { ok: true, endpoint: response.url || endpoint, httpStatus: response.status, unlimited: true, used, unit, strategy: shape.label, checkedAt };
      if (shape.preset === 'sub2api' && total !== undefined && total <= 0) total = undefined;
      const remaining = directRemaining ?? (used !== undefined && total !== undefined ? total - used : undefined);
      if (remaining === undefined) continue;
      if (shape.preset === 'newapi' && total === undefined && used !== undefined) total = remaining + used;
      return {
        ok: true,
        endpoint: response.url || endpoint,
        httpStatus: response.status,
        remaining,
        used,
        total,
        unit,
        strategy: shape.label,
        checkedAt
      };
    }
    const responseShape = describeJsonShape(data);
    return {
      ok: false,
      endpoint: response.url || endpoint,
      httpStatus: response.status,
      responseShape,
      checkedAt,
      error: `JSON response did not match ${shapes.length} known usage schema${shapes.length === 1 ? '' : 's'} (${responseShape})`
    };
  } catch (error) {
    return {
      ok: false,
      endpoint,
      checkedAt,
      error: signal?.aborted
        ? 'Cancelled'
        : error instanceof Error && error.name === 'AbortError'
          ? 'Request timed out'
          : error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

function buildUsageHeaders(token: string, newApiUserId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'User-Agent': 'VSCodeModelSwitch/0.1'
  };
  if (newApiUserId?.trim()) headers['New-Api-User'] = newApiUserId.trim();
  return headers;
}

function buildAutomaticCandidates(baseUrl: string): UsageCandidate[] {
  let host = '';
  try { host = new URL(baseUrl).hostname.toLowerCase(); } catch { /* Validation reports invalid provider URLs. */ }
  const known: Record<string, NonNullable<UsageQueryConfig['preset']>[]> = {
    'api.deepseek.com': ['deepseek'], 'api.siliconflow.cn': ['siliconflow'], 'api.siliconflow.com': ['siliconflow'],
    'openrouter.ai': ['openrouter-credits', 'openrouter'], 'api.moonshot.cn': ['moonshot'], 'api.moonshot.ai': ['moonshot'],
    'api.stepfun.com': ['stepfun'], 'api.stepfun.ai': ['stepfun'], 'api.novita.ai': ['novita']
  };
  const ids = [...(known[host] ?? []), 'sub2api', 'newapi-key', 'openai-credit', 'generic', 'newapi', 'sub2api-account'] as NonNullable<UsageQueryConfig['preset']>[];
  const candidates = ids.map(preset => {
    const definition = USAGE_PRESETS.find(item => item.id === preset)!;
    return { endpoint: resolveUsageUrl(definition.url, baseUrl, preset), label: definition.label, preset,
      auth: definition.auth === 'api-key' ? 'provider' as const : definition.auth };
  });
  const root = baseUrl.trim().replace(/\/+$/g, '').replace(/\/v1$/i, '');
  candidates.push({ endpoint: root + '/user/balance', label: '通用余额（根地址）', preset: 'generic', auth: 'provider' });
  const seen = new Set<string>();
  return candidates.filter(candidate => {
    const identity = candidate.auth + ':' + candidate.endpoint;
    if (seen.has(identity)) return false;
    seen.add(identity); return true;
  });
}

function automaticShapes(preset: NonNullable<UsageQueryConfig['preset']>, baseUrl: string): UsageShape[] {
  const definition = usagePreset(preset, baseUrl);
  const primary = { label: preset, preset, remainingPath: definition.remainingPath, usedPath: definition.usedPath,
    totalPath: definition.totalPath, unit: definition.unit, divisor: definition.divisor };
  // The generic endpoint is also used by DeepSeek-compatible relays.
  return preset === 'generic' ? [primary, { label: 'deepseek', preset: 'deepseek', remainingPath: 'balance_infos.0.total_balance', unit: 'USD' }] : [primary];
}

function describeJsonShape(value: unknown): string {
  if (Array.isArray(value)) return `array[${value.length}]`;
  if (!value || typeof value !== 'object') return typeof value;
  const object = value as Record<string, unknown>;
  const topLevel = Object.keys(object).slice(0, 12);
  const nested = topLevel.flatMap((key) => {
    const child = object[key];
    if (!child || typeof child !== 'object' || Array.isArray(child)) return [];
    return Object.keys(child as Record<string, unknown>).slice(0, 12).map((childKey) => `${key}.${childKey}`);
  });
  return `keys: ${[...topLevel, ...nested].join(', ') || '(none)'}`;
}

function divide(value: number | undefined, divisor: number): number | undefined {
  return value === undefined ? undefined : value / divisor;
}

function readValue(value: unknown, path: string | undefined): unknown {
  if (!path?.trim()) return undefined;
  let current: unknown = value;
  for (const segment of path.split('.').filter(Boolean)) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return undefined;
      current = current[index];
      continue;
    }
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function readString(value: unknown, path: string): string | undefined {
  const result = readValue(value, path);
  return typeof result === 'string' && result.trim() ? result.trim() : undefined;
}

function readNumber(value: unknown, path: string | undefined): number | undefined {
  const current = readValue(value, path);
  if (typeof current === 'number' && Number.isFinite(current)) return current;
  if (typeof current === 'string' && current.trim() && Number.isFinite(Number(current))) return Number(current);
  return undefined;
}
