import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash, randomUUID } from 'crypto';
import { FileRecovery } from '../config/recovery';
import { ToolId } from '../types';
import { sharedDirectory } from '../clients/codex/history/sharedPermissions';

export interface HistorySourceBinding { root: string; profileId: string; environmentId: string; environment: string }
export interface ApiHistorySource extends HistorySourceBinding { version: 1; tool: ToolId; providerId: string; providerName: string }
export interface ApiHistoryReceipt { version: 1; sessionId: string; providerId: string; providerName: string; environmentId: string; environment: string; recordedAt: string; origin: 'session-start' }
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9-]{36}$/i.test(value);
export const historySourceFile = (home: string): string => path.join(home, '.agentdeck-api-source.json');
export const apiSourceId = (providerName: string): string => { const h = createHash('sha256').update(providerName.trim().normalize('NFKC').toLowerCase()).digest('hex'); return 'api:' + [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20, 32)].join('-'); };
export const receiptDirectory = (root: string, profileId: string): string => path.join(root, 'profiles', 'home-' + profileId, 'history-sources');
const begin = '# AgentDeck API history source begin', end = '# AgentDeck API history source end';
const quote = (s: string) => "'" + s.replace(/'/g, "'\"'\"'") + "'";
/** Stable command: changing API does not change the hook's trust definition.
 * The local receipt binding is committed with the native API configuration. */
export function historySourceCommand(home: string, executable = process.execPath, platform = process.platform): string {
  const args = [executable, path.join(__dirname, 'historySourceHook.js'), historySourceFile(home)];
  if (platform === 'win32') {
    const ps = "$env:ELECTRON_RUN_AS_NODE='1'; & " + args.map(s => "'" + s.replace(/'/g, "''") + "'").join(' ');
    return 'powershell.exe -NoProfile -NonInteractive -EncodedCommand ' + Buffer.from(ps, 'utf16le').toString('base64');
  }
  return 'ELECTRON_RUN_AS_NODE=1 ' + args.map(quote).join(' ');
}
export function withCodexHistorySource(config: string, command: string): string {
  const start = config.indexOf(begin);
  if (start !== -1) {
    const stop = config.indexOf(end, start);
    if (stop === -1) throw new Error('API历史记录设置不完整，请保留配置后检查。');
    config = config.slice(0, start) + config.slice(stop + end.length);
  }
  return config.trimEnd() + '\n\n' + begin + '\n[[hooks.SessionStart]]\nmatcher = "^(startup|clear|fork)$"\n[[hooks.SessionStart.hooks]]\ntype = "command"\ncommand = ' + JSON.stringify(command) + '\ntimeout = 5\n' + end + '\n';
}
export function withClaudeHistorySource(settings: Record<string, unknown>, command: string): void {
  const hooks = settings.hooks === undefined ? {} : settings.hooks;
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) throw new Error('Claude hooks设置无效，请先检查现有配置。');
  const all = hooks as Record<string, unknown>, groups = all.SessionStart ?? [];
  if (!Array.isArray(groups)) throw new Error('Claude SessionStart设置无效。');
  // A reserved statusMessage identifies only our handler; all user handlers,
  // including handlers in the same matcher group, remain intact.
  const existing = groups.map(group => ({ ...group, hooks: (group.hooks ?? []).filter((h: any) => h.statusMessage !== 'AgentDeck API history source') })).filter(group => group.hooks.length);
  settings.hooks = { ...all, SessionStart: [...existing, { matcher: '^(startup|clear|fork)$', hooks: [{ type: 'command', command, timeout: 5, statusMessage: 'AgentDeck API history source' }] }] };
}
export async function writeHistorySource(tx: FileRecovery, home: string, source: ApiHistorySource): Promise<void> {
  if (!uuid(source.profileId) || !source.providerId || !source.providerName.trim()) throw new Error('API历史来源绑定无效。');
  await sharedDirectory(receiptDirectory(source.root, source.profileId));
  await tx.write(historySourceFile(home), JSON.stringify(source) + '\n', 0o600);
}
/** Called only by the native lifecycle event, never by a filesystem watcher.
 * Resuming/compacting an old chat cannot classify it as a newly created one. */
export async function recordApiHistorySource(bindingFile: string, event: any): Promise<void> {
  if (event?.hook_event_name !== 'SessionStart' || !['startup', 'clear', 'fork'].includes(event.source) || !uuid(event.session_id)) return;
  const source: ApiHistorySource = JSON.parse(await fs.readFile(bindingFile, 'utf8'));
  if (source.version !== 1 || !uuid(source.profileId) || !source.providerId || !source.providerName || !['codex', 'claude'].includes(source.tool)) throw new Error('来源绑定无效');
  const home = path.dirname(bindingFile), marker = JSON.parse(await fs.readFile(path.join(home, source.tool === 'codex' ? '.modelswitch-environment.json' : '.agentdeck-profile.json'), 'utf8'));
  if (marker.profileId !== source.profileId || marker.environmentId !== source.environmentId) return;
  const registry = JSON.parse(await fs.readFile(path.join(source.root, 'profiles.json'), 'utf8'));
  if (!registry.identities?.some((p: any) => p.id === source.profileId && p.kind === 'api' && p.directory === 'home-' + source.profileId)) return;
  // No transcript needs to exist at SessionStart. The native session ID is the
  // stable key, also when Codex later moves its file to archived_sessions.
  const folder = receiptDirectory(source.root, source.profileId), file = path.join(folder, event.session_id + '.json');
  const receipt: ApiHistoryReceipt = { version: 1, sessionId: event.session_id, providerId: source.providerId, providerName: source.providerName, environmentId: source.environmentId, environment: source.environment, recordedAt: new Date().toISOString(), origin: 'session-start' };
  const temporary = path.join(folder, '.' + randomUUID() + '.tmp');
  const handle = await fs.open(temporary, 'wx', 0o660);
  try {
    try { await handle.writeFile(JSON.stringify(receipt) + '\n'); if (process.platform !== 'win32') await handle.chmod(0o660); }
    finally { await handle.close(); }
    // Publish a complete immutable receipt without replacing a concurrent writer.
    // Both names are our own new metadata file, never another user's transcript.
    try { await fs.link(temporary, file); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
  } finally { await fs.unlink(temporary); }
}
export async function readApiHistorySource(root: string, profileId: string, sessionId: string): Promise<ApiHistoryReceipt | undefined> {
  if (!uuid(profileId) || !uuid(sessionId)) return;
  const file = path.join(receiptDirectory(root, profileId), sessionId + '.json');
  const receipt = await fs.readFile(file, 'utf8').then(JSON.parse).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; });
  if (!receipt) return;
  if (receipt.version !== 1 || receipt.sessionId !== sessionId || receipt.origin !== 'session-start' || typeof receipt.providerId !== 'string' || typeof receipt.providerName !== 'string' || typeof receipt.environmentId !== 'string' || typeof receipt.environment !== 'string') throw new Error('API历史来源记录无效。');
  return receipt;
}
