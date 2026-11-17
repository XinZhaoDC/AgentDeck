import * as fs from 'fs/promises';
import * as path from 'path';
import { FileRecovery } from '../../config/recovery';
import { json } from './profiles';
import { sharedDirectory } from '../codex/history/sharedPermissions';

interface Mapping { environmentId: string; environment: string; workspace: string; project: string }
interface Registry { version: 1; mappings: Record<string, Mapping> }
export interface HistoryProject { id: string; directory: string; sessions: number; updated: number; environments: string[] }

/** A project correspondence, not a copy or a conversation viewer. Both native
 * reads and subsequent writes follow the chosen canonical project directory. */
export class ClaudeProjectHistory {
  private readonly projects: string;
  private readonly registry: string;
  private readonly recovery: string;
  constructor(readonly history: string, readonly environmentId: string, readonly environment: string) {
    this.projects = path.join(history, 'projects');
    this.registry = path.join(path.dirname(history), 'project-mappings.json');
    this.recovery = path.join(path.dirname(history), '.project-mapping-recovery', 'current');
  }
  async recover(): Promise<void> { await FileRecovery.recover(this.recovery, path.dirname(this.history)); }
  private async read(): Promise<Registry> {
    const r = await json<Registry>(this.registry, { version: 1, mappings: {} });
    if (r.version !== 1 || !r.mappings || Array.isArray(r.mappings)) throw new Error('项目映射记录无效，请保留记录并检查。');
    for (const [slug, m] of Object.entries(r.mappings)) {
      if (!safeSlug(slug) || !safeSlug(m.project) || typeof m.workspace !== 'string' || typeof m.environmentId !== 'string' || typeof m.environment !== 'string' || slug === m.project) throw new Error('项目映射记录无效。');
    }
    return r;
  }
  async list(): Promise<HistoryProject[]> {
    const r = await this.read(), result: HistoryProject[] = [];
    for (const entry of await fs.readdir(this.projects, { withFileTypes: true })) {
      // Links are selectors, never another independent project or source.
      if (!entry.isDirectory() || !safeSlug(entry.name) || r.mappings[entry.name]) continue;
      const directory = path.join(this.projects, entry.name);
      const files = (await fs.readdir(directory, { withFileTypes: true })).filter(f => f.isFile() && /^[a-f0-9-]{36}\.jsonl$/i.test(f.name));
      if (!files.length) continue;
      const stats = await Promise.all(files.map(f => fs.stat(path.join(directory, f.name))));
      const recent = stats.reduce((best, s, i) => s.mtimeMs > stats[best].mtimeMs ? i : best, 0);
      const cwd = await projectCwd(path.join(directory, files[recent].name));
      result.push({ id: entry.name, directory: cwd || entry.name, sessions: files.length, updated: Math.max(...stats.map(s => s.mtimeMs)),
        environments: [...new Set(Object.values(r.mappings).filter(m => m.project === entry.name).map(m => m.environment))].sort() });
    }
    return result.sort((a, b) => b.updated - a.updated || a.directory.localeCompare(b.directory));
  }
  async current(workspace: string): Promise<{ project?: string; owned: boolean }> {
    workspace = await fs.realpath(workspace);
    const r = await this.read(), m = r.mappings[claudeProjectSlug(workspace)];
    if (!m) return { owned: false };
    const target = path.join(this.projects, claudeProjectSlug(workspace));
    if (await fs.readlink(target).catch(() => '') !== m.project) throw new Error('项目映射链接与归属记录不一致，请保留现场检查。');
    return { project: m.project, owned: m.environmentId === this.environmentId && m.workspace === workspace };
  }
  async apply(workspace: string, project: string): Promise<boolean> {
    workspace = await fs.realpath(workspace);
    const slug = claudeProjectSlug(workspace);
    if (!safeSlug(project)) throw new Error('历史项目无效。');
    if (slug === project) return false; // Already the native current project.
    await sharedDirectory(path.dirname(this.recovery), true);
    return FileRecovery.run(this.recovery, async tx => {
      const r = await this.read(), previous = r.mappings[slug];
      const source = path.join(this.projects, project), target = path.join(this.projects, slug);
      if (!(await fs.lstat(source)).isDirectory() || r.mappings[project]) throw new Error('请选择原始历史项目，不能映射到另一个链接。');
      if (Object.values(r.mappings).some(m => m.project === slug)) throw new Error('该项目已被其他映射引用，不能将其变为链接。');
      const stat = await fs.lstat(target).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; });
      if (stat && (!stat.isSymbolicLink() || !previous || previous.environmentId !== this.environmentId || previous.workspace !== workspace || await fs.readlink(target) !== previous.project)) throw new Error('当前项目位置已有历史目录或不属于本环境的链接。原内容保留；请在对应项目窗口读取，或为同一逻辑项目选择一个尚无历史的新目录。');
      if (!stat && previous) throw new Error('项目映射链接缺失，请检查记录后重试。');
      await tx.link(target, source, 'dir', { relative: true, expectedTarget: previous ? path.join(this.projects, previous.project) : null });
      r.mappings[slug] = { environmentId: this.environmentId, environment: this.environment, workspace, project };
      await tx.write(this.registry, JSON.stringify(r, null, 2) + '\n', 0o660);
      return true;
    }, path.dirname(this.history));
  }
  async clear(workspace: string): Promise<void> {
    workspace = await fs.realpath(workspace);
    await sharedDirectory(path.dirname(this.recovery), true);
    await FileRecovery.run(this.recovery, async tx => {
      const r = await this.read(), slug = claudeProjectSlug(workspace), m = r.mappings[slug];
      if (!m || m.environmentId !== this.environmentId || m.workspace !== workspace) throw new Error('当前工作区没有属于本环境的项目映射。');
      if (await fs.readlink(path.join(this.projects, slug)).catch(() => '') !== m.project) throw new Error('项目链接已变化，不会删除；请保留记录并检查。');
      await tx.removeLink(path.join(this.projects, slug), path.join(this.projects, m.project));
      delete r.mappings[slug];
      await tx.write(this.registry, JSON.stringify(r, null, 2) + '\n', 0o660);
    }, path.dirname(this.history));
  }
}
export function claudeProjectSlug(directory: string): string {
  if (process.platform === 'darwin') directory = directory.normalize('NFC');
  const slug = directory.replace(/[^a-zA-Z0-9]/g, '-');
  if (slug.length <= 200) return slug;
  let hash = 0;
  for (let i = 0; i < directory.length; i++) hash = (hash << 5) - hash + directory.charCodeAt(i) | 0;
  return slug.slice(0, 200) + '-' + Math.abs(hash).toString(36);
}
function safeSlug(value: string): boolean { return typeof value === 'string' && /^[a-zA-Z0-9-]+$/.test(value); }
async function projectCwd(file: string): Promise<string | undefined> {
  // Read bounded metadata only; never expose or render message content.
  const handle = await fs.open(file, 'r');
  try {
    const bytes = Buffer.alloc(65536), { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    for (const line of bytes.subarray(0, bytesRead).toString('utf8').split('\n')) {
      try { const row = JSON.parse(line); if (typeof row.cwd === 'string') return row.cwd; } catch { /* Partial or older metadata. */ }
    }
  } finally { await handle.close(); }
  return undefined;
}
