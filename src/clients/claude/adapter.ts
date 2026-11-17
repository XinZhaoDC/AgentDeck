import { historySourceCommand, writeHistorySource, withClaudeHistorySource } from '../../storage/historySources';
import { FileRecovery } from '../../config/recovery';
import { readJsonObject } from '../../config/jsonFile';
import { PROXY_ENV_NAMES } from '../../network/manager';
import { ResolvedProvider } from '../../types';
import { getToolHome } from '../../utils/paths';
import { join } from 'path';

export class ClaudeAdapter {
  async apply(resolved: ResolvedProvider): Promise<void> {
    if (!resolved.claude) {
      return;
    }

    const settingsPath = this.getConfigPath();
    const previous = await readJsonObject(settingsPath);
    const template = JSON.parse(resolved.claude.configText) as Record<string, unknown>;
    const settings = { ...previous, ...template };
    const env = { ...normalizeObject(previous.env), ...normalizeObject(template.env) };
    // An API provider has one native auth source, while the official profile
    // and its credentials remain in their original directory.
    delete env.ANTHROPIC_API_KEY; delete env.CLAUDE_CODE_OAUTH_TOKEN;

    // Provider templates must not erase this environment's independent route.
    const existing = normalizeObject((await readJsonObject(settingsPath)).env);
    for (const name of PROXY_ENV_NAMES) {
      delete env[name];
      if (Object.hasOwn(existing, name)) env[name] = existing[name];
    }

    env.ANTHROPIC_AUTH_TOKEN = resolved.claude.key;
    settings.env = env;

    const source = resolved.historySource ? { ...resolved.historySource, version: 1 as const, tool: 'claude' as const, providerId: resolved.claude.providerId, providerName: resolved.claude.providerName } : undefined;
    if (source) withClaudeHistorySource(settings, historySourceCommand(getToolHome('claude')));
    await FileRecovery.run(join(getToolHome('claude'), '.recovery', 'modelswitch-current'), async tx => {
      if (source) await writeHistorySource(tx, getToolHome('claude'), source);
      await tx.write(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    });
  }

  getConfigPath(): string {
    return join(getToolHome('claude'), 'settings.json');
  }

  async readActiveConfig(): Promise<{ baseUrl?: string; model?: string; key?: string; mode: 'official' | 'api' }> {
    const settings = await readJsonObject(this.getConfigPath());
    const env = normalizeObject(settings.env);
    const api = Boolean(env.ANTHROPIC_BASE_URL || env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY || env.CLAUDE_CODE_USE_BEDROCK || env.CLAUDE_CODE_USE_VERTEX || env.CLAUDE_CODE_USE_FOUNDRY);
    return {
      mode: api ? 'api' : 'official',
      baseUrl: typeof env.ANTHROPIC_BASE_URL === 'string' ? env.ANTHROPIC_BASE_URL : undefined,
      model: typeof settings.model === 'string' ? settings.model : undefined,
      key: typeof env.ANTHROPIC_AUTH_TOKEN === 'string' && env.ANTHROPIC_AUTH_TOKEN ? env.ANTHROPIC_AUTH_TOKEN : typeof env.ANTHROPIC_API_KEY === 'string' ? env.ANTHROPIC_API_KEY : undefined
    };
  }
}

function normalizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}
