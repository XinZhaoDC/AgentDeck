import { getTopLevelStringValue, setTopLevelValue } from '../../../config/tomlEdit';
import { FileRecovery } from '../../../config/recovery';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { sharedDirectory, shareHistory } from './sharedPermissions';

export type IdentityKind = 'official' | 'api';
export interface CodexIdentity { id: string; name: string; kind: IdentityKind; directory: string }
export interface IdentityManifest { version: 1 | 2; environmentId?: string; activeId: string; identities: CodexIdentity[] }
interface Registry { version: 2; identities: CodexIdentity[] }
interface Binding { version: 2; activeId: string; homeMode?: 'fixed' }
interface HomeMarker { version: number; environmentId: string; profileId?: string; storageRoot?: string }

/** Shared rollouts, private environment+identity homes and SQLite caches. The runtime
 * entry may be linked. Linux directory entries (including bind mounts) stay
 * in place; their active private files are saved on each explicit switch. */
export class CodexProfiles {
  readonly environmentId: string;
  constructor(readonly root: string, readonly runtimeHome: string, environmentId = 'local', private readonly onActivated?: () => Promise<void>, private readonly rebuildIndex?: (home: string, sqlite: string) => Promise<void>) { this.environmentId = environmentId; }
  get environmentDirectory(): string { return path.join(this.root, 'environments', this.environmentId); }
  get recoveryDirectory(): string { return path.join(this.environmentDirectory, '.recovery', 'current'); }
  async read(): Promise<IdentityManifest> {
    if (!await exists(path.join(this.root, 'profiles.json'))) {
      const old = JSON.parse(await fs.readFile(path.join(this.root, 'identities.json'), 'utf8')) as IdentityManifest;
      if (old.version !== 1 || !Array.isArray(old.identities)) throw new Error('Invalid legacy identity manifest');
      validate(old.identities);
      return old;
    }
    const registry = await this.registry();
    const binding = await this.binding();
    return { ...registry, environmentId: this.environmentId, activeId: binding?.activeId ?? '' };
  }
  /** History-only home: safe to use for manual backups, never holds credentials. */
  home(identity: CodexIdentity): string { return path.join(this.root, 'profiles', identity.directory, 'history'); }
  localHome(identity: CodexIdentity): string { return path.join(this.environmentDirectory, 'homes', identity.id); }
  async assertAttached(manifest?: IdentityManifest): Promise<void> {
    manifest ??= await this.read();
    if (manifest.version !== 2) throw new Error('旧版目录尚未升级。请选择数据目录迁入；旧目录会保留。');
    const active = manifest.identities.find(p => p.id === manifest.activeId);
    if (!active) throw new Error('当前 CODEX_HOME 尚未绑定所选账号，请连接数据目录。');
    const binding = await this.binding();
    if (binding?.homeMode === 'fixed') {
      const stat = await fs.lstat(this.runtimeHome), marker = await this.homeMarker(this.runtimeHome);
      if (!stat.isDirectory() || stat.isSymbolicLink() || marker?.environmentId !== this.environmentId || marker.profileId !== active.id || marker.storageRoot !== path.resolve(this.root)) throw new Error('当前固定 CODEX_HOME 的账号绑定标记不一致，请重新连接数据目录。');
    } else if (await fs.realpath(this.runtimeHome).catch(() => '') !== await fs.realpath(this.localHome(active)).catch(() => '')) throw new Error('当前 CODEX_HOME 尚未绑定所选账号，请连接数据目录。');
    for (const name of ['sessions', 'archived_sessions']) {
      if (await fs.realpath(path.join(this.runtimeHome, name)).catch(() => '') !== await fs.realpath(path.join(this.home(active), name)).catch(() => '!')) throw new Error('历史目录链接已失效：' + name);
    }
    const config = await fs.readFile(path.join(this.runtimeHome, 'config.toml'), 'utf8');
    const sqlite = getTopLevelStringValue(config, 'sqlite_home');
    if (!sqlite || ![this.sqliteHome(active), path.join(this.home(active), 'sqlite')].some(p => path.resolve(p) === path.resolve(sqlite))) throw new Error('会话索引路径与账号档案不一致，请重新绑定。');
    if (process.env.CODEX_SQLITE_HOME && path.resolve(process.env.CODEX_SQLITE_HOME) !== path.resolve(sqlite)) throw new Error('启动环境 CODEX_SQLITE_HOME 覆盖了账号索引，请更正其来源后完整重启 VS Code。');
  }
  /** SQLite contains absolute rollout paths; it is a per-environment cache. */
  sqliteHome(identity: CodexIdentity): string { return path.join(this.environmentDirectory, 'indexes', identity.id); }
  async localIndexActive(): Promise<boolean> {
    const m = await this.read(), active = m.identities.find(i => i.id === m.activeId); if (!active) return false;
    return getTopLevelStringValue(await fs.readFile(path.join(this.runtimeHome, 'config.toml'), 'utf8'), 'sqlite_home') === this.sqliteHome(active) && Boolean((await fs.stat(this.sqliteHome(active)).catch(() => undefined))?.isDirectory());
  }
  async refreshIndex(upgrade = false): Promise<void> {
    const m = await this.read(); await this.assertAttached(m);
    const active = m.identities.find(i => i.id === m.activeId)!;
    if (process.env.CODEX_SQLITE_HOME && path.resolve(process.env.CODEX_SQLITE_HOME) !== path.resolve(this.sqliteHome(active))) throw new Error('请先移除启动环境中覆盖索引位置的 CODEX_SQLITE_HOME，再完整重启 VS Code。');
    if (!upgrade && !await this.localIndexActive()) throw new Error('当前仍使用旧共享索引，请点击“修复/刷新原生历史”升级本环境索引。');
    await fs.mkdir(this.sqliteHome(active), { recursive: true, mode: 0o700 });
    if (!upgrade) { await this.rebuildIndex?.(this.runtimeHome, this.sqliteHome(active)); return; }
    // Only the index location changes. Credentials, rollouts and the old shared
    // SQLite files remain intact; a failed native scan rolls back these fields.
    await FileRecovery.run(this.recoveryDirectory, async tx => {
      const file = path.join(this.runtimeHome, 'config.toml');
      await tx.write(file, setTopLevelValue(await fs.readFile(file, 'utf8'), 'sqlite_home', this.sqliteHome(active)));
      const cached = path.join(this.localHome(active), 'config.toml');
      if (await fs.realpath(cached).catch(() => '') !== await fs.realpath(file)) await tx.write(cached, setTopLevelValue(await fs.readFile(cached, 'utf8'), 'sqlite_home', this.sqliteHome(active)));
      await this.linkNames(tx, active, this.runtimeHome);
      await this.linkNames(tx, active, this.localHome(active));
      await this.rebuildIndex?.(this.runtimeHome, this.sqliteHome(active));
    });
  }
  async initialize(kind: IdentityKind, newApiInExisting = false): Promise<void> {
    const marker = await this.homeMarker(this.runtimeHome);
    if (marker && marker.environmentId !== this.environmentId) throw new Error('当前 CODEX_HOME 属于另一个环境，不会复用其认证缓存。');
    await this.createLayout();
    const registry = await this.registry();
    if (registry.identities.length && !(newApiInExisting && kind === 'api' && !registry.identities.some(p => p.kind === 'api'))) throw new Error('已有账号档案，请选择并连接，不会自动覆盖或合并历史。');
    const identity = await this.add(kind === 'official' ? '官方账号 1' : 'API 共享历史', kind, true);
    await this.seedHistory(identity, this.runtimeHome);
    await this.activate(identity, this.runtimeHome);
  }
  async createLayout(): Promise<void> {
    const runtime = await fs.realpath(this.runtimeHome).catch(() => path.resolve(this.runtimeHome));
    const parent = await fs.realpath(path.dirname(this.root)).catch(() => path.resolve(path.dirname(this.root)));
    const storage = await fs.realpath(this.root).catch(() => path.join(parent, path.basename(this.root)));
    const rel = path.relative(runtime, storage);
    if (!rel || !rel.startsWith('..') && !path.isAbsolute(rel)) throw new Error('数据目录不能放在当前 CODEX_HOME 内。');
    await sharedDirectory(this.root);
    for (const directory of ['profiles', 'providers', 'environments', 'backups', '.registry-recovery']) await sharedDirectory(path.join(this.root, directory), ['profiles', 'providers', 'backups'].includes(directory));
    if (!await exists(path.join(this.root, 'profiles.json'))) {
      // Publish a complete registry without replacing another environment's file.
      const temp = path.join(this.root, '.profiles-' + randomUUID());
      await fs.writeFile(temp, JSON.stringify({ version: 2, identities: [] }), { mode: 0o660 });
      if (process.platform !== 'win32') await fs.chmod(temp, 0o660);
      try { await fs.link(temp, path.join(this.root, 'profiles.json')); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
      finally { await fs.unlink(temp); }
    }
    if (!await exists(path.join(this.root, 'readme.md'))) await fs.writeFile(path.join(this.root, 'readme.md'), storageReadme, { mode: 0o660, flag: 'wx' }).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'EEXIST') throw e; });
    if (process.platform !== 'win32') {
      for (const name of ['profiles.json', 'readme.md']) {
        const file = path.join(this.root, name), stat = await fs.lstat(file);
        if (stat.isFile() && stat.uid === process.getuid?.()) await fs.chmod(file, 0o660);
      }
    }
  }
  async bindEnvironment(): Promise<void> { await this.createLayout(); }
  async attach(id?: string): Promise<void> {
    const m = await this.read();
    const identity = m.identities.find(p => p.id === (id ?? m.activeId));
    if (!identity) throw new Error('请为当前环境选择一个账号档案。');
    await this.activate(identity);
  }
  async add(name: string, kind: IdentityKind, requireNewApi = false): Promise<CodexIdentity> {
    return this.lock(async tx => {
      const registry = await this.registry();
      const api = registry.identities.find(p => p.kind === 'api');
      if (kind === 'api' && api) {
        if (requireNewApi) throw new Error('API 档案已存在，请重新连接并选择已有档案，不会自动合并历史。');
        return api;
      }
      name = name.trim();
      if (!name || name.length > 100 || registry.identities.some(p => p.name === name)) throw new Error('Use a unique identity name (1–100 characters)');
      const identity = { id: randomUUID(), name, kind, directory: 'home-' + randomUUID() };
      await fs.mkdir(path.join(this.home(identity), 'sqlite'), { recursive: true, mode: 0o700 });
      for (const n of ['sessions', 'archived_sessions']) await fs.mkdir(path.join(this.home(identity), n), { mode: 0o700 });
      await shareHistory(path.join(this.root, 'profiles', identity.directory));
      registry.identities.push(identity); await this.saveRegistry(registry, tx); return identity;
    });
  }
  async rename(id: string, name: string): Promise<void> {
    await this.lock(async tx => {
      const m = await this.registry(); name = name.trim();
      if (!name || name.length > 100 || m.identities.some(p => p.id !== id && p.name === name)) throw new Error('Use a unique identity name (1–100 characters)');
      const identity = m.identities.find(p => p.id === id); if (!identity) throw new Error('Identity not found');
      identity.name = name; await this.saveRegistry(m, tx);
    });
  }
  async switchTo(id: string): Promise<void> {
    const m = await this.read(); if (m.version !== 2) throw new Error('请先迁入新版共享数据目录。');
    const identity = m.identities.find(p => p.id === id); if (!identity) throw new Error('Identity not found');
    await this.activate(identity);
  }
  async recover(): Promise<string | undefined> { return FileRecovery.recover(this.recoveryDirectory); }
  /** Explicit migration copies history into an EMPTY unpublished profile and
   * only this environment's local settings/auth. Originals remain untouched. */
  async importLegacy(sourceRoot: string): Promise<void> {
    const legacy = JSON.parse(await fs.readFile(path.join(sourceRoot, 'identities.json'), 'utf8')) as IdentityManifest;
    if (legacy.version !== 1 || !legacy.identities?.some(i => i.id === legacy.activeId) || legacy.environmentId && legacy.environmentId !== this.environmentId) throw new Error('只能迁移当前环境的旧版身份目录；不会读取其他环境的登录缓存。');
    validate(legacy.identities); await this.createLayout();
    if ((await this.registry()).identities.length) throw new Error('目标已有档案，不自动合并。请选择空数据目录，或连接已有档案。');
    let active: CodexIdentity | undefined;
    for (const old of legacy.identities) {
      const identity = await this.add(old.name, old.kind);
      const source = path.join(sourceRoot, old.directory);
      await this.seedHistory(identity, source); await this.prepareLocal(identity, source);
      if (old.id === legacy.activeId) active = identity;
    }
    if (active) await this.activate(active);
  }
  async importHistory(kind: IdentityKind, name: string, populate: (home: string) => Promise<void>): Promise<CodexIdentity> {
    const m = await this.read();
    if (kind === 'api' && m.identities.some(p => p.kind === 'api')) throw new Error('API 档案已存在。不会覆盖共享历史；请将备份恢复到另一个空数据目录。');
    const identity = await this.add(name, kind); await populate(this.home(identity));
    await shareHistory(path.join(this.root, 'profiles', identity.directory)); return identity;
  }
  private async activate(identity: CodexIdentity, seed?: string): Promise<void> {
    const marker = await this.homeMarker(this.runtimeHome);
    if (marker && marker.environmentId !== this.environmentId) throw new Error('当前 CODEX_HOME 属于另一个环境，不会复用其认证缓存。');
    const stat = await fs.lstat(this.runtimeHome).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; });
    // Do not rename a Linux directory: it may be a bind mount, even when its
    // device number equals its parent. Existing symlink entries remain linked.
    const fixed = process.platform === 'linux' && stat?.isDirectory() && !stat.isSymbolicLink();
    await this.prepareLocal(identity, seed);
    const local = this.localHome(identity), file = path.join(local, 'config.toml');
    await FileRecovery.run(this.recoveryDirectory, async tx => {
      if (fixed) await this.saveFixedPrivate(tx, marker);
      // Read after saving: a client may atomically refresh auth/config in the
      // fixed entry between switches, including a rebind to the same profile.
      const content = setTopLevelValue(setTopLevelValue(await fs.readFile(file, 'utf8'), 'sqlite_home', this.sqliteHome(identity)), 'cli_auth_credentials_store', 'file');
      for (const name of ['sessions', 'archived_sessions']) {
        const destination = path.join(this.home(identity), name), actual = await fs.realpath(destination);
        if (await fs.realpath(path.join(local, name)).catch(() => '') !== actual) await tx.link(path.join(local, name), destination);
        if (fixed && await fs.realpath(path.join(this.runtimeHome, name)).catch(() => '') !== actual) await tx.link(path.join(this.runtimeHome, name), destination);
      }
      await tx.write(file, content);
      await this.linkNames(tx, identity, local);
      if (fixed) await this.linkNames(tx, identity, this.runtimeHome);
      if (fixed) {
        await tx.write(path.join(this.runtimeHome, 'config.toml'), content);
        await tx.write(path.join(this.runtimeHome, 'auth.json'), await textOrEmpty(path.join(local, 'auth.json')));
        await tx.write(path.join(this.runtimeHome, '.modelswitch-environment.json'), JSON.stringify({ version: 2, environmentId: this.environmentId, profileId: identity.id, storageRoot: path.resolve(this.root) }));
      } else if (await fs.realpath(this.runtimeHome).catch(() => '') !== await fs.realpath(local)) await tx.link(this.runtimeHome, local);
      await tx.write(path.join(this.environmentDirectory, 'binding.json'), JSON.stringify({ version: 2, activeId: identity.id, ...(fixed ? { homeMode: 'fixed' } : {}) }));
      await this.assertAttached();
      await this.rebuildIndex?.(this.runtimeHome, this.sqliteHome(identity));
      await this.onActivated?.();
    });
  }
  /** Preserve refreshed local credentials without file symlinks: native clients
   * replace auth.json atomically, which would otherwise detach such a symlink. */
  private async saveFixedPrivate(tx: FileRecovery, marker?: HomeMarker): Promise<void> {
    let destination: string;
    if (marker?.storageRoot && marker.profileId) {
      const previous = new CodexProfiles(marker.storageRoot, this.runtimeHome, this.environmentId);
      const manifest = await previous.read(), profile = manifest.identities.find(p => p.id === marker.profileId);
      if (!profile || manifest.activeId !== profile.id) throw new Error('原账号缓存位置与当前绑定不一致，不会覆盖。');
      destination = previous.localHome(profile);
      const cached = await this.homeMarker(destination);
      if (cached?.environmentId !== this.environmentId || cached.profileId !== profile.id) throw new Error('原账号缓存的环境标记异常，不会覆盖。');
    } else {
      // First enrollment retains the original private files, just as a movable
      // home retained its original directory. This is not a per-Apply backup.
      destination = path.join(this.environmentDirectory, 'original-home-' + randomUUID());
    }
    for (const name of ['config.toml', 'auth.json']) await tx.write(path.join(destination, name), await textOrEmpty(path.join(this.runtimeHome, name)));
  }
  private async homeMarker(home: string): Promise<HomeMarker | undefined> {
    const content = await textOrEmpty(path.join(home, '.modelswitch-environment.json'));
    if (!content) return;
    const marker = JSON.parse(content) as HomeMarker;
    if (!marker || typeof marker.environmentId !== 'string') throw new Error('CODEX_HOME 的环境标记无效，请保留现场后检查。');
    return marker;
  }
  private async prepareLocal(identity: CodexIdentity, source?: string): Promise<void> {
    await fs.mkdir(this.sqliteHome(identity), { recursive: true, mode: 0o700 });
    const local = this.localHome(identity);
    if (await exists(local)) return;
    const next = local + '.prepare-' + randomUUID();
    await fs.mkdir(next, { recursive: true, mode: 0o700 });
    if (source && await exists(source)) {
      const real = await fs.realpath(source);
      for (const name of ['auth.json', 'config.toml']) {
        if ((await fs.lstat(path.join(real, name)).catch(() => undefined))?.isSymbolicLink()) throw new Error('请先将当前环境的 auth.json/config.toml 转为普通文件，再迁入。');
      }
      for (const entry of await fs.readdir(real, { withFileTypes: true })) {
        if (isHistory(entry.name) || entry.name === 'vscodemodelswitchbak' || entry.name.startsWith('.recovery')) continue;
        if (entry.isFile() || entry.isDirectory()) await fs.cp(path.join(real, entry.name), path.join(next, entry.name), { recursive: true, dereference: false, filter: async file => { const stat = await fs.lstat(file); return stat.isFile() || stat.isDirectory() || stat.isSymbolicLink(); } });
      }
    }
    let config = await fs.readFile(path.join(next, 'config.toml'), 'utf8').catch(() => '');
    config = setTopLevelValue(setTopLevelValue(config, 'cli_auth_credentials_store', 'file'), 'sqlite_home', this.sqliteHome(identity));
    await fs.writeFile(path.join(next, 'config.toml'), config, { mode: 0o600 });
    await fs.chmod(path.join(next, 'config.toml'), 0o600);
    if (await exists(path.join(next, 'auth.json'))) await fs.chmod(path.join(next, 'auth.json'), 0o600);
    for (const n of ['sessions', 'archived_sessions']) await fs.symlink(path.join(this.home(identity), n), path.join(next, n), process.platform === 'win32' ? 'junction' : 'dir');
    await fs.writeFile(path.join(next, '.modelswitch-environment.json'), JSON.stringify({ version: 2, environmentId: this.environmentId, profileId: identity.id, storageRoot: path.resolve(this.root) }), { mode: 0o600 });
    await fs.rename(next, local);
  }
  /** Native thread/name/set appends portable name records here. Share that
   * file as well as rollouts so rebuilding an environment cache keeps names. */
  private async linkNames(tx: FileRecovery, identity: CodexIdentity, home: string): Promise<void> {
    const shared = path.join(this.home(identity), 'session_index.jsonl'), target = path.join(home, 'session_index.jsonl');
    if (await fs.realpath(target).catch(() => '') === await fs.realpath(shared).catch(() => '!')) return;
    const original = await textOrEmpty(shared), local = await textOrEmpty(target);
    const names = new Map<string, string>();
    for (const line of original.split('\n').filter(Boolean)) {
      const row = JSON.parse(line); if (typeof row.id === 'string' && typeof row.updated_at === 'string') names.set(row.id, row.updated_at > (names.get(row.id) ?? '') ? row.updated_at : names.get(row.id)!);
    }
    const additions: string[] = [];
    for (const line of local.split('\n').filter(Boolean)) {
      const row = JSON.parse(line);
      if (typeof row.id === 'string' && typeof row.thread_name === 'string' && typeof row.updated_at === 'string' && row.updated_at > (names.get(row.id) ?? '')) { additions.push(line); names.set(row.id, row.updated_at); }
    }
    if (!await exists(shared) || additions.length) await tx.write(shared, original + (original && !original.endsWith('\n') ? '\n' : '') + (additions.length ? additions.join('\n') + '\n' : ''), 0o660);
    const entry = await fs.lstat(target).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; });
    if (entry?.isFile()) {
      // Native releases can atomically replace this link with a plain file.
      // Retain that exact file before creating the shared entry. The enclosing
      // transaction restores it if link creation or native indexing fails.
      if (await textOrEmpty(target) !== local) throw new Error('会话名称记录正在更新，请结束当前任务后重新刷新历史。');
      await tx.moveFile(target, target + '.before-vscodemodelswitch-' + randomUUID());
    }
    await tx.link(target, shared, 'file');
  }
  private async seedHistory(identity: CodexIdentity, source: string): Promise<void> {
    if (!await exists(source)) return;
    const real = await fs.realpath(source);
    const config = await fs.readFile(path.join(real, 'config.toml'), 'utf8').catch(() => '');
    const override = getTopLevelStringValue(config, 'sqlite_home') ?? process.env.CODEX_SQLITE_HOME;
    for (const entry of await fs.readdir(real, { withFileTypes: true })) {
      if (!isHistory(entry.name) || !entry.isFile() && !entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const destination = /\.sqlite(?:-(?:wal|shm))?$/.test(entry.name) ? path.join(this.home(identity), 'sqlite', entry.name) : path.join(this.home(identity), entry.name);
      await fs.cp(path.join(real, entry.name), destination, { recursive: true, dereference: true, force: false, errorOnExist: entry.isFile() });
    }
    if (override && path.resolve(override) !== real) {
      for (const entry of await fs.readdir(path.resolve(override), { withFileTypes: true })) {
        if (entry.isFile() && /\.sqlite(?:-(?:wal|shm))?$/.test(entry.name)) await fs.copyFile(path.join(path.resolve(override), entry.name), path.join(this.home(identity), 'sqlite', entry.name), fs.constants.COPYFILE_EXCL);
      }
    }
    await shareHistory(path.join(this.root, 'profiles', identity.directory));
  }
  private async registry(): Promise<Registry> {
    const registry = JSON.parse(await fs.readFile(path.join(this.root, 'profiles.json'), 'utf8')) as Registry;
    if (registry.version !== 2 || !Array.isArray(registry.identities)) throw new Error('Invalid profile registry');
    validate(registry.identities); return registry;
  }
  private async binding(): Promise<Binding | undefined> {
    try { const b = JSON.parse(await fs.readFile(path.join(this.environmentDirectory, 'binding.json'), 'utf8')) as Binding; if (b.version !== 2 || typeof b.activeId !== 'string') throw new Error('Invalid environment binding'); return b; }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return; throw e; }
  }
  private async saveRegistry(registry: Registry, tx: FileRecovery): Promise<void> {
    await tx.write(path.join(this.root, 'profiles.json'), JSON.stringify(registry, null, 2) + '\n', 0o660);
  }
  private async lock<T>(action: (tx: FileRecovery) => Promise<T>): Promise<T> {
    await sharedDirectory(path.join(this.root, '.registry-recovery'));
    return FileRecovery.run(path.join(this.root, '.registry-recovery', 'current'), action);
  }

}
function validate(identities: CodexIdentity[]): void {
  const ids = new Set<string>(), directories = new Set<string>();
  for (const p of identities) {
    if (!/^[a-z0-9-]+$/.test(p.id) || ids.has(p.id) || directories.has(p.directory) || !p.name || !['official', 'api'].includes(p.kind) || !/^home-[a-z0-9-]+$/.test(p.directory)) throw new Error('Invalid identity entry'); ids.add(p.id); directories.add(p.directory);
  }
  if (identities.filter(p => p.kind === 'api').length > 1) throw new Error('Only one API history library is supported');
}
function isHistory(name: string): boolean { return ['sessions', 'archived_sessions', 'history.jsonl', 'session_index.jsonl'].includes(name) || /\.sqlite(?:-(?:wal|shm))?$/.test(name); }
async function textOrEmpty(file: string): Promise<string> { return fs.readFile(file, 'utf8').catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; return ''; }); }
export async function exists(file: string): Promise<boolean> { return Boolean(await fs.lstat(file).catch(() => undefined)); }
const storageReadme = `历史多选：在AgentDeck按帐号/API→环境→项目增量添加独立续聊副本；已添加灰显，只在管理中移除。来源只读，新聊天位置不变。profile/history-imports.json保存来源/显示状态，history-imports/保留隐藏续聊；当前history-only备份不含隐藏副本库。\n\n# Codex 本地数据目录\n\nprofiles/：按官方账号（本地稳定档案 ID）或 API 档案保存共享历史。旧 SQLite 仅作为历史保留，不再作为两端运行索引。所有 API Providers 共用 API 档案。新聊天通过目录链接直接写入这里，不需要事后同步。账号别名不是登录验证。\n\nenvironments/：各环境的账号 home、config.toml、auth.json、当前绑定、操作日志 logs/ 和临时恢复点。indexes/<档案ID> 为本环境可重建 SQLite 索引，包含本环境路径，不与其他环境共用。日志不含认证或聊天正文。新环境需要自己登录；不会复用其他环境缓存。环境标识在扩展运行端保存，重连复用，重建默认新建。\n\nproviders/：可选的公共 Provider JSON 导出（不含密钥）；日常定义仍使用 VS Code 存储。backups/：用户主动创建的历史备份，不含认证和客户端配置。\n\n绑定：在 ModelSwitch 选择数据文件夹（名称自定，也可直接选择 codex 子目录），选择同一个官方账号档案并绑定，重新加载 Codex，然后在官方 Chats 中查看。宿主机与容器的路径可以不同，但必须挂载同一物理目录。\n\nCODEX_HOME 是当前环境入口。Linux 已存在的普通目录（包括挂载点）保持原位，只将 sessions/archived_sessions 链接到共享历史，sqlite_home 指向本环境 indexes/<档案ID>；入口本来为链接或尚不存在时，使用本环境账号 home 链接。auth/config 按环境和档案私有；固定入口下在显式切换时保存当前文件、再加载目标缓存，新环境自行登录。新聊天不是第二份副本。不要在 Codex 写入时移动/解除链接。Windows 与 Linux 的绝对项目/rollout 路径兼容性需原生验收；列表可见不保证项目仍在相同位置。旧连接请点击“修复/刷新原生历史”后重载；原共享索引不删除。\n\n更换或解除绑定前结束当前扩展和 CLI 的任务。ModelSwitch 不检测任务忙闲；影响运行的变更前会请求一次确认，用户需先等待扩展和 CLI 的任务结束。失败时回滚本次配置和链接，不回退聊天。临时恢复目录 .recovery/ 成功后清理；冲突时保留并提示。首次迁入保留的 .before-vscodemodelswitch-* 原历史目录与 environments/<环境ID>/original-home-* 初始配置认证副本在验收后由用户决定是否清理；不是每次应用都生成。已有档案（包括失败后已准备的档案）只连接，不自动覆盖或合并当前历史。独立挂载的历史子目录若无法替换，会明确报错并回滚；不会改动挂载设置。\n\nLinux 共享目录：两端使用同一个可信属组。公共目录 2770、注册表和历史 0660，共享历史目录默认 ACL 使后续普通原生文件保留组读写（需要 setfacl/getfacl 和支持 POSIX ACL 的挂载）。各环境认证/配置缓存仍私有；不要递归放宽 environments 下的权限。旧目录在创建它的环境按 AgentDeck 存储管理说明做一次权限修复，不需要删除历史或先切官方模式。\n\n本目录含登录缓存与可能包含密钥的配置，不要提交 Git 或公开共享。只导出经过脱敏的 Provider 定义。不要手动删除 SQLite 的 -wal/-shm 文件。\n`;
