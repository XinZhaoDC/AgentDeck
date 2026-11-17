import * as fs from 'fs/promises';
import * as path from 'path';
import { constants } from 'fs';
import { createHash, randomUUID } from 'crypto';
import { ToolId } from '../types';
import { CodexIdentity } from '../clients/codex/history/codexProfiles';
import { claudeProjectSlug } from '../clients/claude/projectHistory';
import { sharedDirectory } from '../clients/codex/history/sharedPermissions';
import { FileRecovery } from '../config/recovery';
import { HistoryLabels } from './historyLabels';
import { HistoryCatalog, HistorySession, historySessions } from './historyCatalog';

export interface HistoryCandidate extends HistorySession {
  key: string; profileId: string; profileName: string; kind: 'official' | 'api';
  environments: Array<{ id: string; label: string }>; present: boolean; native: boolean;
}
export interface HistoryImport {
  key: string; profileId: string; profileName: string; kind: 'official' | 'api'; sourceId: string; sourceFile: string;
  project: string; cwd: string; environment: string; title: string; updated: number;
  owner: string; workspace: string; nativeId: string; files: string[]; visible: boolean; retained?: string[];
}
interface Registry { version: 1; entries: HistoryImport[] }
export interface HistoryListing { sessions: HistoryCandidate[]; problems: string[] }
export type NativeHistoryChanges = (changes: { remove?: string[]; names?: Record<string, string> }) => Promise<void>;

/** Source profiles are read-only. Every imported chat gets a new native ID and
 * independent transcript. Selection is additive; removal retains continuations
 * outside native scan paths. All persisted paths are relative to this root. */
export class HistoryImports {
  readonly profile: string;
  private readonly registry: string;
  private readonly recovery: string;
  readonly workspaceKey: string;
  constructor(readonly root: string, readonly tool: ToolId, readonly target: CodexIdentity, readonly environmentId: string, readonly workspace: string) {
    this.profile = path.join(root, 'profiles', target.directory);
    this.registry = path.join(this.profile, 'history-imports.json');
    this.recovery = path.join(this.profile, '.history-import-recovery', 'current');
    this.workspaceKey = createHash('sha256').update(workspace).digest('hex').slice(0, 16);
  }
  async recover(): Promise<void> { await FileRecovery.recover(this.recovery, this.profile); }
  async read(): Promise<Registry> {
    const r: Registry = await fs.readFile(this.registry, 'utf8').then(JSON.parse).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; return { version: 1, entries: [] }; });
    if (r.version !== 1 || !Array.isArray(r.entries)) throw new Error('历史显示记录无效，请保留记录后检查。');
    const keys = new Set<string>();
    for (const e of r.entries) {
      if (!uuid(e.nativeId) || !uuid(e.sourceId) || e.nativeId === e.sourceId || typeof e.key !== 'string' || typeof e.owner !== 'string' || typeof e.workspace !== 'string' || typeof e.visible !== 'boolean' || !Array.isArray(e.files) || !e.files.length || ![...e.files, ...(e.retained ?? [])].every(f => safeRelative(f) && f.endsWith('.jsonl')) || keys.has(e.owner + '\0' + e.workspace + '\0' + e.key)) throw new Error('历史显示记录无效。');
      keys.add(e.owner + '\0' + e.workspace + '\0' + e.key);
      for (const file of e.files) if (this.tool === 'claude' ? !file.startsWith('projects/') || !file.includes(e.nativeId) : !/^(sessions|archived_sessions)\//.test(file) || !file.includes(e.nativeId)) throw new Error('历史副本路径无效。');
      if (e.retained?.some(f => !f.startsWith('history-imports/'))) throw new Error('保留副本路径无效。');
    }
    return r;
  }
  // Follow native visibility: Codex lists the target profile globally; Claude
  // lists its current project. Sharing a profile must not create duplicate
  // imports merely because a second environment manages the same native view.
  private own(e: HistoryImport): boolean { return this.tool === 'codex' || e.workspace === this.workspace; }
  async selected(): Promise<HistoryImport[]> { return (await this.read()).entries.filter(e => this.own(e) && e.visible); }
  async list(profiles: CodexIdentity[], environmentLabel: string): Promise<HistoryListing> {
    const result: HistoryListing = { sessions: [], problems: [] }, selected = new Set((await this.selected()).map(e => e.key));
    const catalog = new HistoryCatalog(this.root);
    for (const profile of profiles) {
      try {
        const history = path.join(this.root, 'profiles', profile.directory, 'history');
        const imports = new HistoryImports(this.root, this.tool, profile, this.environmentId, this.workspace);
        const excluded = new Set((await imports.read()).entries.flatMap(e => e.files));
        const sessions = await historySessions(this.tool, history, (file, error) => result.problems.push(profile.name + ' · ' + file + ': ' + errorCode(error)), excluded);
        await catalog.observe(profile.id, sessions, this.environmentId, environmentLabel, [this.workspace]);
        const registry = await catalog.read();
        for (const session of sessions) {
          const key = sourceKey(profile.id, session.file);
          // Native defaults are not managed imports and cannot be hidden here.
          const native = profile.id === this.target.id && (this.tool === 'codex' || session.project === claudeProjectSlug(this.workspace));
          result.sessions.push({ ...session, key, profileId: profile.id, profileName: profile.name, kind: profile.kind, native, present: native || selected.has(key), environments: catalog.environments(registry, profile.id, session.project).sort((a, b) => Number(b === this.environmentId) - Number(a === this.environmentId)).map(id => ({ id, label: registry.environments[id] || id })) });
        }
      } catch (e) { result.problems.push(profile.name + ': ' + errorCode(e)); }
    }
    const labels = await new HistoryLabels(this.root).model(profiles, result.sessions, [], result.problems);
    result.problems = labels.problems;
    const metadata = new Map(labels.sessions.map(s => [s.key, s]));
    const currentEnvironment = (s: HistoryCandidate) => labels.data.placements[s.key]?.environment !== undefined ? labels.data.placements[s.key].environment === this.environmentId : metadata.get(s.key)?.environments.includes(this.environmentId);
    result.sessions.sort((a, b) => Number(b.profileId === this.target.id) - Number(a.profileId === this.target.id) || Number(currentEnvironment(b)) - Number(currentEnvironment(a)) || Number(b.cwd === this.workspace) - Number(a.cwd === this.workspace) || b.updated - a.updated);
    return result;
  }
  async add(candidates: HistoryCandidate[], profiles: CodexIdentity[], native?: NativeHistoryChanges, provider = 'openai'): Promise<{ added: number; problems: string[] }> {
    await this.prepare();
    const result = { added: 0, problems: [] as string[] };
    // Per-chat commit allows other readable objects to succeed independently.
    for (const candidate of new Map(candidates.map(c => [c.key, c])).values()) {
      try {
        const source = profiles.find(p => p.id === candidate.profileId);
        if (!source || candidate.key !== sourceKey(source.id, candidate.file)) throw new Error('来源档案已改变。');
        if (candidate.native) continue;
        const added = await FileRecovery.run(this.recovery, async tx => {
          const r = await this.read();
          let e = r.entries.find(e => this.own(e) && e.key === candidate.key);
          if (e?.visible) return false;
          if (e) {
            if (!e.retained || e.retained.length !== e.files.length) throw new Error('续聊副本尚未完整保留，请先检查管理记录。');
            for (let i = 0; i < e.files.length; i++) {
              await assertRegular(this.profile, e.retained[i]); await this.ensureDirectory(path.dirname(this.nativeFile(e.files[i])));
              if (await exists(this.nativeFile(e.files[i]))) throw new Error('原生副本已存在，请先刷新管理列表。');
              await tx.write(this.nativeFile(e.files[i]), await fs.readFile(path.join(this.profile, e.retained[i]), 'utf8'), 0o660);
            }
          } else {
            const sourceHome = path.join(this.root, 'profiles', source.directory, 'history');
            await assertRegular(sourceHome, candidate.file);
            const nativeId = randomUUID(), sourceText = await stableRead(sourceHome, candidate.file);
            const text = copyTranscript(sourceText, this.tool, candidate.id, nativeId, this.workspace, provider, true, sourceTitle({ profileName: source.name, environment: candidate.environments.map(e => e.label).join('、') || '环境未标注', title: candidate.title }));
            const file = this.tool === 'claude' ? 'projects/' + claudeProjectSlug(this.workspace) + '/' + nativeId + '.jsonl' : 'sessions/' + new Date().toISOString().slice(0, 10).replace(/-/g, '/') + '/rollout-' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '-' + nativeId + '.jsonl';
            e = { key: candidate.key, profileId: source.id, profileName: source.name, kind: source.kind, sourceId: candidate.id, sourceFile: candidate.file, project: candidate.project, cwd: candidate.cwd, environment: candidate.environments.map(e => e.label).join('、') || '环境未标注', title: candidate.title, updated: candidate.updated, owner: this.environmentId, workspace: this.workspace, nativeId, files: [file], visible: false };
            await this.ensureDirectory(path.dirname(this.nativeFile(file)));
            if (await exists(this.nativeFile(file))) throw new Error('原生副本编号冲突。');
            await tx.write(this.nativeFile(file), text, 0o660);
            if (this.tool === 'claude') {
              const folder = path.join(path.dirname(candidate.file), candidate.id, 'subagents');
              for (const sub of await regularJsonls(sourceHome, folder)) {
                const target = path.posix.join(path.posix.dirname(file), nativeId, 'subagents', path.posix.relative(folder, sub));
                await this.ensureDirectory(path.dirname(this.nativeFile(target)));
                await tx.write(this.nativeFile(target), copyTranscript(await stableRead(sourceHome, sub), this.tool, candidate.id, nativeId, this.workspace, provider, false), 0o660); e.files.push(target);
              }
            }
            r.entries.push(e);
          }
          e.visible = true;
          await tx.write(this.registry, JSON.stringify(r, null, 2) + '\n', 0o660);
          return true;
        }, this.profile);
        if (added) result.added++;
      } catch (e) { result.problems.push(candidate.profileName + ' · ' + candidate.title + ': ' + errorCode(e)); }
    }
    if (result.added && native) {
      try { const names = Object.fromEntries((await this.selected()).map(e => [e.nativeId, sourceTitle(e)])); await native({ names }); }
      catch { result.problems.push('副本已保存，Codex 原生索引刷新失败；请修复/刷新原生历史后重载。'); }
    }
    return result;
  }
  async remove(keys: string[], native?: NativeHistoryChanges): Promise<{ removed: number; problems: string[] }> {
    await this.prepare(); const result = { removed: 0, problems: [] as string[] };
    for (const key of new Set(keys)) {
      try {
        if (this.tool === 'codex') {
          // Retention commits BEFORE native deletion. A subsequent RPC/registry
          // failure must never roll back the only copy of a continued chat.
          await FileRecovery.run(this.recovery, async tx => {
            const r = await this.read(), e = r.entries.find(e => this.own(e) && e.key === key && e.visible);
            if (!e) throw new Error('该对象已移除或属于其他工作区。');
            let file = e.files[0];
            if (!await exists(this.nativeFile(file))) {
              const candidates = [...await regularJsonls(path.join(this.profile, 'history'), 'sessions'), ...await regularJsonls(path.join(this.profile, 'history'), 'archived_sessions')];
              const found = candidates.find(f => path.basename(f).endsWith(e.nativeId + '.jsonl'));
              if (found) { file = found; e.files = [file]; }
            }
            if (await exists(this.nativeFile(file))) {
              const saved = 'history-imports/' + randomUUID() + '/' + file;
              await this.ensureDirectory(path.dirname(path.join(this.profile, saved)));
              await tx.write(path.join(this.profile, saved), await stableRead(path.join(this.profile, 'history'), file), 0o660);
              e.retained = [saved];
            } else if (!e.retained?.length) throw new Error('原生副本已移动或丢失，未找到可保留内容。');
            await tx.write(this.registry, JSON.stringify(r, null, 2) + '\n', 0o660);
          }, this.profile);
          const e = (await this.selected()).find(e => e.key === key)!;
          if (!native) throw new Error('缺少原生索引操作，未移除展示入口。');
          await native({ remove: [e.nativeId] });
          await FileRecovery.run(this.recovery, async tx => {
            const r = await this.read(), current = r.entries.find(item => this.own(item) && item.key === key)!;
            current.visible = false; await tx.write(this.registry, JSON.stringify(r, null, 2) + '\n', 0o660);
          }, this.profile);
        } else await FileRecovery.run(this.recovery, async tx => {
          const r = await this.read(), e = r.entries.find(e => this.own(e) && e.key === key && e.visible);
          if (!e) throw new Error('该对象已移除或属于其他工作区。');
          const retained: string[] = [], generation = 'history-imports/' + randomUUID();
          for (const file of e.files) {
            const target = this.nativeFile(file), saved = generation + '/' + file;
            await assertRegular(path.join(this.profile, 'history'), file);
            await this.ensureDirectory(path.dirname(path.join(this.profile, saved)));
            await tx.moveFile(target, path.join(this.profile, saved)); retained.push(saved);
          }
          e.retained = retained; e.visible = false;
          await tx.write(this.registry, JSON.stringify(r, null, 2) + '\n', 0o660);
        }, this.profile);
        result.removed++;
      } catch (e) { result.problems.push(key.slice(0, 8) + ': ' + errorCode(e)); }
    }
    return result;
  }
  private nativeFile(file: string): string { return path.join(this.profile, 'history', file); }
  private async ensureDirectory(directory: string): Promise<void> {
    const rel = path.relative(this.profile, directory);
    if (!safeRelative(rel)) throw new Error('副本目录超出当前档案。');
    let current = this.profile;
    for (const part of rel.split(path.sep)) { current = path.join(current, part); const s = await fs.lstat(current).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; }); if (s && !s.isDirectory()) throw new Error('副本目录入口异常：' + part); await sharedDirectory(current, true); }
  }
  private async prepare(): Promise<void> {
    if (!(await fs.lstat(this.profile)).isDirectory()) throw new Error('目标档案不是普通目录。');
    await sharedDirectory(path.dirname(this.recovery), true);
    await FileRecovery.recover(this.recovery, this.profile);
    await fs.access(this.profile, constants.R_OK | constants.W_OK | constants.X_OK);
  }
}
export function sourceTitle(e: Pick<HistoryImport, 'profileName' | 'environment' | 'title'>): string { return '[' + e.profileName + ' · ' + e.environment + '] ' + e.title; }
export function sourceKey(profile: string, file: string): string { return createHash('sha256').update(profile + '\0' + file).digest('hex'); }
function uuid(s: string): boolean { return typeof s === 'string' && /^[a-f0-9-]{36}$/i.test(s); }
function safeRelative(s: string): boolean { return typeof s === 'string' && !!s && !path.isAbsolute(s) && !s.split(/[\\/]/).some(p => p === '..' || p === '.'); }
function errorCode(e: unknown): string { const code = (e as NodeJS.ErrnoException)?.code; return code === 'EACCES' || code === 'EPERM' ? '无读取或写入权限，请在文件创建环境修复共享组权限后重试' : e instanceof Error ? e.message : '历史不可用'; }
async function exists(file: string): Promise<boolean> { return !!await fs.lstat(file).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; }); }
async function assertRegular(root: string, file: string): Promise<void> {
  if (!safeRelative(file)) throw new Error('历史文件路径无效。');
  let current = root;
  if (!(await fs.lstat(current)).isDirectory()) throw new Error('历史根目录必须是普通目录。');
  const parts = file.split(/[\\/]/);
  for (const [index, part] of parts.entries()) { current = path.join(current, part); const stat = await fs.lstat(current); if (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory()) throw new Error('历史入口不是普通文件或目录。'); }
}
async function stableRead(root: string, file: string): Promise<string> {
  await assertRegular(root, file);
  const handle = await fs.open(path.join(root, file), constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try { const before = await handle.stat(), text = await handle.readFile('utf8'), after = await handle.stat(); if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || (await fs.lstat(path.join(root, file))).ino !== before.ino) throw new Error('来源聊天正在写入，请结束会话后重试。'); return text; } finally { await handle.close(); }
}
async function regularJsonls(root: string, folder: string): Promise<string[]> {
  const result: string[] = [];
  const entries = await fs.readdir(path.join(root, folder), { withFileTypes: true }).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; return []; });
  for (const entry of entries) {
    const file = folder + '/' + entry.name;
    if (entry.isDirectory()) result.push(...await regularJsonls(root, file));
    else if (entry.isFile() && entry.name.endsWith('.jsonl')) { await assertRegular(root, file); result.push(file); }
  }
  return result;
}
/** Only structural session fields change. Message bodies, tool calls and UUID
 * parent chains are preserved; source profiles are never opened for writing. */
function copyTranscript(text: string, tool: ToolId, from: string, to: string, cwd: string, provider: string, main = true, title = ''): string {
  let meta = false;
  const rows = text.split('\n').filter(line => line.trim()).map(line => {
    let r: any; try { r = JSON.parse(line); } catch { throw new Error('历史包含未完成或无效记录，请结束原会话后重试。'); }
    if (tool === 'codex') {
      if (r.type === 'session_meta') { if (r.payload?.id !== from) throw new Error('来源会话编号已变化。'); r.payload = { ...r.payload, id: to, cwd, source: 'vscode', originator: 'codex_vscode', model_provider: provider }; meta = true; }
      if (r.type === 'turn_context' && r.payload) r.payload.cwd = cwd;
    } else {
      if (r.sessionId === from) { r.sessionId = to; meta = true; }
      if (typeof r.cwd === 'string') r.cwd = cwd;
      for (const field of ['uuid', 'parentUuid', 'logicalParentUuid']) if (typeof r[field] === 'string') {
        const hex = createHash('sha256').update(to + '\0' + r[field]).digest('hex');
        r[field] = hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-4' + hex.slice(13, 16) + '-a' + hex.slice(17, 20) + '-' + hex.slice(20, 32);
      }
    }
    return JSON.stringify(r);
  });
  if (main && !meta) throw new Error('来源会话缺少有效身份记录。');
  if (tool === 'claude' && main && title) rows.push(JSON.stringify({ type: 'custom-title', customTitle: title, sessionId: to }));
  return rows.join('\n') + '\n';
}
