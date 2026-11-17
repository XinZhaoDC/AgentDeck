import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID, createHash } from 'crypto';
import { createReadStream } from 'fs';
import { FileRecovery } from '../../config/recovery';
import { sharedDirectory, shareHistory } from '../codex/history/sharedPermissions';

export type ClaudeIdentity = { id: string; name: string; kind: 'official' | 'api'; directory: string };
interface Registry { version: 1; identities: ClaudeIdentity[] }
export interface ClaudeBinding { activeId: string; adopted?: { id: string; home: string; implicit?: boolean } }

/** Native credentials never move. In particular a refreshed OAuth cache or an
 * OS keychain entry stays associated with its original, stable config path. */
export class ClaudeProfiles {
  constructor(readonly root: string, readonly environmentId: string) {}
  get environmentDirectory(): string { return path.join(this.root, 'environments', this.environmentId); }
  get recoveryDirectory(): string { return path.join(this.environmentDirectory, '.recovery', 'current'); }
  get bindingPath(): string { return path.join(this.environmentDirectory, 'binding.json'); }
  async read(): Promise<Registry> {
    const value = await json<Registry>(path.join(this.root, 'profiles.json'), { version: 1, identities: [] });
    if (value.version !== 1 || !Array.isArray(value.identities)) throw new Error('Claude 账号注册表格式无效。');
    const ids = new Set<string>();
    for (const i of value.identities) {
      if (!/^[a-f0-9-]{36}$/.test(i.id) || ids.has(i.id) || i.directory !== 'home-' + i.id || !['official', 'api'].includes(i.kind) || typeof i.name !== 'string') throw new Error('Claude 账号档案无效。');
      ids.add(i.id);
    }
    if (value.identities.filter(i => i.kind === 'api').length > 1) throw new Error('Claude API 历史档案不唯一。');
    return value;
  }
  async binding(): Promise<ClaudeBinding | undefined> { return json(this.bindingPath, undefined); }
  home(identity: ClaudeIdentity): string { return path.join(this.root, 'profiles', identity.directory, 'history'); }
  localHome(identity: ClaudeIdentity, binding?: ClaudeBinding): string {
    return binding?.adopted?.id === identity.id ? binding.adopted.home : path.join(this.environmentDirectory, 'homes', identity.id);
  }
  async createLayout(runtimeHome: string): Promise<void> {
    const parent = await fs.realpath(path.dirname(this.root));
    const root = await fs.realpath(this.root).catch(() => path.join(parent, path.basename(this.root))), home = await fs.realpath(runtimeHome).catch(() => path.resolve(runtimeHome));
    const rel = path.relative(home, root), inverse = path.relative(root, home);
    if (!rel || !rel.startsWith('..') && !path.isAbsolute(rel) || !inverse.startsWith('..') && !path.isAbsolute(inverse) && !(await json<any>(path.join(runtimeHome, '.agentdeck-profile.json'), {})).environmentId) throw new Error('Claude 数据目录与客户端配置目录不能相互包含。');
    await sharedDirectory(root);
    for (const name of ['profiles', 'providers', 'backups', 'environments', '.registry-recovery']) await sharedDirectory(path.join(root, name), name !== 'environments' && name !== '.registry-recovery');
    await fs.mkdir(this.environmentDirectory, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(root, 'profiles.json'), JSON.stringify({ version: 1, identities: [] }), { flag: 'wx', mode: 0o660 }).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'EEXIST') throw e; });
    await fs.writeFile(path.join(root, 'readme.md'), readme, { flag: 'wx', mode: 0o660 }).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'EEXIST') throw e; });
  }
  async add(name: string, kind: ClaudeIdentity['kind']): Promise<ClaudeIdentity> {
    let identity!: ClaudeIdentity;
    await FileRecovery.run(path.join(this.root, '.registry-recovery', 'current'), async tx => {
      const registry = await this.read();
      if (kind === 'api' && registry.identities.some(i => i.kind === kind)) throw new Error('API 历史档案已存在，请刷新并选择已有档案。');
      name = checkedName(name, registry.identities);
      const id = randomUUID(); identity = { id, name, kind, directory: 'home-' + id };
      await sharedDirectory(path.join(this.root, 'profiles', identity.directory));
      await sharedDirectory(this.home(identity), true);
      await sharedDirectory(path.join(this.home(identity), 'projects'), true);
      registry.identities.push(identity);
      await tx.write(path.join(this.root, 'profiles.json'), JSON.stringify(registry, null, 2), 0o660);
    });
    return identity;
  }
  async rename(id: string, name: string): Promise<void> {
    await FileRecovery.run(path.join(this.root, '.registry-recovery', 'current'), async tx => {
      const registry = await this.read(), identity = registry.identities.find(i => i.id === id);
      if (!identity) throw new Error('账号档案不存在。');
      identity.name = checkedName(name, registry.identities.filter(i => i.id !== id));
      await tx.write(path.join(this.root, 'profiles.json'), JSON.stringify(registry, null, 2), 0o660);
    });
  }
  async prepare(identity: ClaudeIdentity, binding: ClaudeBinding, adopt = false, deferHistory = false): Promise<string> {
    const home = this.localHome(identity, binding), projects = path.join(home, 'projects'), shared = path.join(this.home(identity), 'projects');
    const marker = await json<{ environmentId: string; profileId: string } | undefined>(path.join(home, '.agentdeck-profile.json'), undefined);
    if (marker && (marker.environmentId !== this.environmentId || marker.profileId !== identity.id)) throw new Error('Claude 配置目录属于其他环境或账号，不会复用认证。');
    if (!adopt) await fs.mkdir(home, { recursive: true, mode: 0o700 });
    else await fs.mkdir(home, { recursive: true });
    if (adopt && !marker && await exists(projects)) {
      // Copy only this client's project/session tree. No credentials, settings,
      // plugins or global auth state enter shared history.
      const stat = await fs.lstat(projects);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('原 Claude projects 入口不是普通目录，请先核对后再连接。');
      if ((await fs.readdir(shared)).length) throw new Error('目标历史已存在，不会自动合并。');
      const staged = shared + '.preparing-' + randomUUID(), before = await projectFingerprint(projects);
      await fs.cp(projects, staged, { recursive: true, dereference: false, errorOnExist: true, force: false });
      if (before !== await projectFingerprint(projects) || before !== await projectFingerprint(staged)) throw new Error('原 Claude 历史在复制期间变化或校验失败。原目录与准备副本保留，请暂停写入后核对。');
      await shareHistory(staged);
      // rmdir only accepts an empty destination. A concurrent writer makes
      // publication fail and keeps both the original and staged history.
      await fs.rmdir(shared);
      try { await fs.rename(staged, shared); }
      catch (e) { await fs.mkdir(shared, { mode: 0o2770 }).catch(() => {}); throw e; }
    }
    await FileRecovery.run(this.recoveryDirectory, async tx => {
      if (!await exists(path.join(home, 'settings.json'))) await tx.write(path.join(home, 'settings.json'), '{}\n');
      if (!deferHistory && await fs.realpath(projects).catch(() => '') !== await fs.realpath(shared)) await tx.link(projects, shared);
      if (adopt) await tx.write(path.join(this.environmentDirectory, 'prepared.json'), JSON.stringify(binding));
      await tx.write(path.join(home, '.agentdeck-profile.json'), JSON.stringify({ environmentId: this.environmentId, profileId: identity.id }));
    });
    return home;
  }
  async linkHistory(tx: FileRecovery, identity: ClaudeIdentity, home: string): Promise<void> {
    const target = path.join(home, 'projects'), shared = path.join(this.home(identity), 'projects');
    if (await fs.realpath(target).catch(() => '') !== await fs.realpath(shared)) await tx.link(target, shared);
  }
  async attached(home: string, binding?: ClaudeBinding): Promise<boolean> {
    binding ??= await this.binding(); if (!binding) return false;
    const identity = (await this.read()).identities.find(i => i.id === binding!.activeId);
    if (!identity || path.resolve(home) !== path.resolve(this.localHome(identity, binding))) return false;
    const marker = await json<any>(path.join(home, '.agentdeck-profile.json'), {});
    return marker.environmentId === this.environmentId && marker.profileId === identity.id && await fs.realpath(path.join(home, 'projects')).catch(() => '') === await fs.realpath(path.join(this.home(identity), 'projects')).catch(() => '!');
  }
}
export async function json<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return fallback; throw e; }
}
async function exists(file: string): Promise<boolean> { return Boolean(await fs.lstat(file).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; })); }
function checkedName(name: string, identities: ClaudeIdentity[]): string {
  if (!name?.trim() || name.trim().length > 100) throw new Error('名称须为 1 至 100 个字符。');
  if (identities.some(i => i.name.normalize('NFKC').toLowerCase() === name.trim().normalize('NFKC').toLowerCase())) throw new Error('已有同名账号档案。');
  return name.trim();
}
async function projectFingerprint(root: string): Promise<string> {
  const result: Array<[string, string]> = [];
  const walk = async (directory: string) => {
    for (const entry of await fs.readdir(path.join(root, directory), { withFileTypes: true })) {
      const name = directory ? directory + '/' + entry.name : entry.name;
      if (entry.isDirectory()) { result.push([name, 'directory']); await walk(name); }
      else if (entry.isFile()) {
        const hash = createHash('sha256');
        for await (const bytes of createReadStream(path.join(root, name))) hash.update(bytes);
        result.push([name, hash.digest('hex')]);
      } else throw new Error('Claude 原历史包含符号链接或特殊文件，不会自动跟随，请先核对：' + name);
    }
  };
  await walk(''); return JSON.stringify(result.sort(([a], [b]) => a.localeCompare(b)));
}
const readme = `历史多选：在AgentDeck按帐号/API→环境→项目增量添加独立续聊副本；已添加灰显，只在管理中移除。来源只读，新聊天位置不变。profile/history-imports.json保存来源/显示状态，history-imports/保留隐藏续聊；当前history-only备份不含隐藏副本库。\n\n# Claude Code 数据目录

profiles 保存每个官方账号独立的 projects 原生历史；所有 API 供应商共用一个 API 历史档案。
projects也包含原生项目辅助文件与记忆，按账号共享；选择器显示元数据，正文由原生扩展读取。
新版历史浏览使用独立会话副本，不创建硬链接或重定向目录。旧history-browse.json和project-mappings.json只用于显式解除旧入口，需先重载再多选。
environments 保存各环境绑定和私有配置目录；认证由 Claude 原生客户端或系统凭据库维护，不跨环境复制。
首次连接可以保留原有配置目录原位，因此不搬动既有登录缓存或改变它的凭据路径。
backups 为手动历史快照；providers 为手动公共供应商导出。
VS Code 扩展和新终端通过 CLAUDE_CONFIG_DIR 选择同一目录；已有进程需重启。
外部终端须自行使用界面显示的 CLAUDE_CONFIG_DIR；浏览器登录使用浏览器网络。
历史备份不包含凭据、配置或插件。原 projects.before-vscodemodelswitch-* 为首次迁入保留副本，勿在验收前删除。
`;
