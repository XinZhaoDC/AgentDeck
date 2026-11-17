import * as fs from 'fs/promises';
import * as path from 'path';
import { FileRecovery } from '../../config/recovery';
import { sharedDirectory } from '../codex/history/sharedPermissions';
import { claudeProjectSlug } from './projectHistory';
import { json } from './profiles';

interface Scope { environmentId: string; project: string; files: string[] }
interface Registry { version: 1; scopes: Record<string, Scope> }
/** Regular-file hard links are accepted by the native reader. The project
 * directory is never redirected: new sessions keep their original location. */
export class ClaudeHistoryScope {
  private readonly projects: string;
  private readonly registry: string;
  private readonly recovery: string;
  constructor(readonly history: string, readonly environmentId: string) {
    this.projects = path.join(history, 'projects');
    this.registry = path.join(path.dirname(history), 'history-browse.json');
    this.recovery = path.join(path.dirname(history), '.history-browse-recovery', 'current');
  }
  private async read(): Promise<Registry> {
    const r = await json<Registry>(this.registry, { version: 1, scopes: {} });
    if (r.version !== 1 || !r.scopes || typeof r.scopes !== 'object') throw new Error('历史浏览记录无效。');
    for (const [key, s] of Object.entries(r.scopes)) if (!slug(key) || !slug(s.project) || !Array.isArray(s.files) || !s.files.every(uuidFile) || typeof s.environmentId !== 'string') throw new Error('历史浏览记录无效。');
    return r;
  }
  async recover(): Promise<void> { await FileRecovery.recover(this.recovery, path.dirname(this.history)); }
  async current(workspace: string): Promise<{ project?: string; owned: boolean }> {
    const s = (await this.read()).scopes[claudeProjectSlug(await fs.realpath(workspace))];
    return { project: s?.project, owned: s?.environmentId === this.environmentId };
  }
  async apply(workspace: string, project: string): Promise<void> {
    if (!slug(project)) throw new Error('历史项目无效。');
    workspace = await fs.realpath(workspace);
    const key = claudeProjectSlug(workspace), current = path.join(this.projects, key);
    await sharedDirectory(path.dirname(this.recovery), true);
    const present = await fs.lstat(current).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; });
    if (present && !present.isDirectory()) throw new Error('当前项目仍有旧目录映射，请先恢复默认范围并重载，再选择历史。');
    // Creating an ordinary current-project directory does not redirect writes.
    if (!present) await sharedDirectory(current, true);
    const source = path.join(this.projects, project);
    if (!(await fs.lstat(source)).isDirectory()) throw new Error('请选择真实历史项目。');
    await FileRecovery.run(this.recovery, async tx => {
      const r = await this.read(), previous = r.scopes[key];
      if (previous && previous.environmentId !== this.environmentId) throw new Error('此工作区路径的浏览入口由其他环境管理。');
      const excluded = await this.excluded();
      await this.unlinkOwned(tx, key, previous);
      const files: string[] = [];
      if (key !== project) for (const file of await fs.readdir(source)) {
        if (!uuidFile(file) || excluded.has('projects/' + project + '/' + file)) continue;
        const from = path.join(source, file), to = path.join(current, file);
        if (!(await fs.lstat(from)).isFile()) continue;
        const existing = await fs.lstat(to).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; });
        if (existing) {
          const src = await fs.lstat(from);
          if (!existing.isFile() || existing.dev !== src.dev || existing.ino !== src.ino) throw new Error('当前项目已有相同会话编号的文件，已保留；不会覆盖或合并。');
          continue; // Existing real data is never claimed as our output.
        }
        await tx.hardLink(to, from); files.push(file);
      }
      r.scopes[key] = { environmentId: this.environmentId, project, files };
      await tx.write(this.registry, JSON.stringify(r, null, 2) + '\n', 0o660);
    }, path.dirname(this.history));
  }
  async clear(workspace: string): Promise<number> {
    const key = claudeProjectSlug(await fs.realpath(workspace));
    await sharedDirectory(path.dirname(this.recovery), true);
    return FileRecovery.run(this.recovery, async tx => {
      const r = await this.read(), s = r.scopes[key];
      if (s && s.environmentId !== this.environmentId) throw new Error('此浏览范围由其他环境管理。');
      const retained = await this.unlinkOwned(tx, key, s);
      delete r.scopes[key]; await tx.write(this.registry, JSON.stringify(r, null, 2) + '\n', 0o660);
      return retained;
    }, path.dirname(this.history));
  }
  private async unlinkOwned(tx: FileRecovery, key: string, s?: Scope): Promise<number> {
    let retained = 0;
    for (const file of s?.files ?? []) {
      const target = path.join(this.projects, key, file), source = path.join(this.projects, s!.project, file);
      const a = await fs.lstat(target).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; });
      if (!a) continue;
      const b = await fs.lstat(source).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; });
      if (!a.isFile() || !b?.isFile() || a.dev !== b.dev || a.ino !== b.ino) { retained++; continue; }
      await tx.removeHardLink(target, source);
    }
    return retained;
  }
  async excluded(): Promise<Set<string>> {
    const r = await this.read(), files = new Set<string>();
    for (const [key, s] of Object.entries(r.scopes)) for (const file of s.files) {
      const a = await fs.lstat(path.join(this.projects, key, file)).catch(() => undefined), b = await fs.lstat(path.join(this.projects, s.project, file)).catch(() => undefined);
      if (a?.isFile() && b?.isFile() && a.dev === b.dev && a.ino === b.ino) files.add('projects/' + key + '/' + file);
    }
    return files;
  }
}
function slug(s: string): boolean { return typeof s === 'string' && /^[a-zA-Z0-9-]+$/.test(s); }
function uuidFile(s: string): boolean { return typeof s === 'string' && /^[a-f0-9-]{36}\.jsonl$/i.test(s); }
