import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import { FileRecovery } from '../config/recovery';
import { sharedDirectory } from '../clients/codex/history/sharedPermissions';
import { ClaudeHistoryScope } from '../clients/claude/historyScope';
import { json } from '../clients/claude/profiles';
import { ToolId } from '../types';

export interface HistorySession { id: string; title: string; project: string; cwd: string; file: string; updated: number; archived: boolean }
interface Registry { version: 1; environments: Record<string, string>; projects: Record<string, string[]> }
export class HistoryCatalog {
  private readonly file: string;
  private readonly recovery: string;
  constructor(readonly root: string) { this.file = path.join(root, 'history-catalog.json'); this.recovery = path.join(root, '.history-catalog-recovery', 'current'); }
  async read(): Promise<Registry> {
    const r = await json<Registry>(this.file, { version: 1, environments: {}, projects: {} });
    if (r.version !== 1 || !r.environments || !r.projects || Object.values(r.environments).some(v => typeof v !== 'string') || Object.values(r.projects).some(v => !Array.isArray(v) || v.some(e => typeof e !== 'string'))) throw new Error('历史项目目录记录无效。');
    return r;
  }
  private key(profile: string, project: string): string { return createHash('sha256').update(profile + '\0' + project).digest('hex'); }
  async observe(profile: string, sessions: HistorySession[], environmentId: string, label: string, workspaces: string[]): Promise<void> {
    await this.update(async r => {
      const entries = await fs.readdir(path.join(this.root, 'environments'), { withFileTypes: true }).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; return []; });
      for (const e of entries) if (e.isDirectory()) r.environments[e.name] ??= '未命名环境 · ' + e.name.slice(0, 8);
      if (!r.environments[environmentId] || r.environments[environmentId].startsWith('未命名环境 ·')) r.environments[environmentId] = label;
      for (const session of sessions) if (session.cwd && workspaces.includes(session.cwd)) {
        const key = this.key(profile, session.project), ids = r.projects[key] ?? [];
        if (!ids.includes(environmentId)) r.projects[key] = [...ids, environmentId];
      }
    });
  }
  async associate(profile: string, project: string, environmentId: string, label: string): Promise<void> {
    if (!label.trim() || label.length > 100) throw new Error('环境名称须为1至100个字符。');
    await this.update(async r => { r.environments[environmentId] = label.trim(); r.projects[this.key(profile, project)] = [environmentId]; });
  }
  environments(r: Registry, profile: string, project: string): string[] { return r.projects[this.key(profile, project)] ?? []; }
  private async update(action: (r: Registry) => Promise<void>): Promise<void> {
    await sharedDirectory(path.dirname(this.recovery), true);
    await FileRecovery.run(this.recovery, async tx => { const r = await this.read(); await action(r); await tx.write(this.file, JSON.stringify(r, null, 2) + '\n', 0o660); }, this.root);
  }
}

/** Metadata chooser only. Transcripts are displayed by the official extension. */
export async function historySessions(tool: ToolId, home: string, onError?: (file: string, error: unknown) => void, additionalExcluded = new Set<string>()): Promise<HistorySession[]> {
  const files: string[] = [], result: HistorySession[] = [];
  const excluded = tool === 'claude' ? await new ClaudeHistoryScope(home, '').excluded() : new Set<string>();
  async function walk(directory: string): Promise<void> {
    for (const entry of await fs.readdir(path.join(home, directory), { withFileTypes: true }).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') { if (!onError) throw e; onError(directory, e); } return []; })) {
      const file = directory + '/' + entry.name;
      if (entry.isDirectory()) { if (tool === 'codex' || directory === 'projects') await walk(file); }
      else if (entry.isFile() && file.endsWith('.jsonl') && !excluded.has(file) && !additionalExcluded.has(file) && (tool === 'codex' || /^[a-f0-9-]{36}\.jsonl$/i.test(entry.name))) files.push(file);
    }
  }
  for (const directory of tool === 'claude' ? ['projects'] : ['sessions', 'archived_sessions']) await walk(directory);
  const names = new Map<string, string>();
  if (tool === 'codex') {
    const text = await fs.readFile(path.join(home, 'session_index.jsonl'), 'utf8').catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') { if (!onError) throw e; onError('session_index.jsonl', e); } return ''; });
    for (const line of text.split('\n')) try { const r = JSON.parse(line); if (typeof r.id === 'string' && typeof r.thread_name === 'string') names.set(r.id, r.thread_name); } catch { /* Live final line. */ }
  }
  for (const file of files) {
    try {
    const absolute = path.join(home, file), stat = await fs.stat(absolute), rows = await metadataRows(absolute);
    let id = tool === 'claude' ? path.basename(file, '.jsonl') : '', cwd = '', title = '', custom = '';
    for (const row of rows) {
      if (tool === 'codex' && row.type === 'session_meta') { id = String(row.payload?.id ?? ''); cwd = String(row.payload?.cwd ?? ''); }
      if (tool === 'claude' && !cwd && typeof row.cwd === 'string') cwd = row.cwd;
      if (typeof row.customTitle === 'string') custom = row.customTitle;
      if (!title && tool === 'claude' && row.type === 'user') title = content(row.message?.content);
      if (!title && tool === 'codex' && row.type === 'event_msg' && row.payload?.type === 'user_message') title = typeof row.payload.message === 'string' ? row.payload.message : '';
    }
    if (!/^[a-f0-9-]{36}$/i.test(id)) continue;
    result.push({ id, cwd, title: (names.get(id) || custom || title || id).replace(/\s+/g, ' ').slice(0, 140), project: tool === 'claude' ? file.split('/')[1] : cwd || '未记录项目', file, updated: stat.mtimeMs, archived: file.startsWith('archived_sessions/') });
    } catch (e) { if (!onError) throw e; onError(file, e); }
  }
  return result.sort((a, b) => b.updated - a.updated);
}
async function metadataRows(file: string): Promise<any[]> {
  const handle = await fs.open(file, 'r');
  try {
    const size = (await handle.stat()).size, pieces: string[] = [];
    for (const offset of size > 65536 ? [0, Math.max(0, size - 65536)] : [0]) {
      let bytes = Buffer.alloc(Math.min(65536, size)), { bytesRead } = await handle.read(bytes, 0, bytes.length, offset);
      // Codex stores base instructions on its first metadata line. A valid
      // header can exceed the normal preview window; do not silently lose it.
      if (!offset && size > bytesRead && !bytes.subarray(0, bytesRead).includes(10)) {
        bytes = Buffer.alloc(Math.min(1024 * 1024, size));
        bytesRead = (await handle.read(bytes, 0, bytes.length, 0)).bytesRead;
      }
      const lines = bytes.subarray(0, bytesRead).toString('utf8').split('\n'); if (offset) lines.shift(); pieces.push(...lines);
    }
    return pieces.flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
  } finally { await handle.close(); }
}
function content(value: unknown): string { return typeof value === 'string' ? value : Array.isArray(value) ? value.filter(v => v?.type === 'text').map(v => v.text || '').join(' ') : ''; }
