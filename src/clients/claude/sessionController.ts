import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { basename, dirname, join, resolve } from 'path';
import { EnvironmentState } from '../../storage/environmentState';
import { HistoryImports } from '../../storage/historyImports';
import { FileRecovery } from '../../config/recovery';
import { getToolHome } from '../../utils/paths';
import { confirmClientChange } from '../../shared/runtimeGuard';
import { SessionAction, SessionState } from '../codex/history/controller';
import { backupHistory } from '../codex/history/codexHistory';
import { ClaudeBinding, ClaudeIdentity, ClaudeProfiles, json } from './profiles';
import { ClaudeProjectHistory } from './projectHistory';
import { ClaudeHistoryScope } from './historyScope';

const ROOT = 'vscodemodelswitch.claudeIdentityStorage';
type Entry = { name: string; value: string };
type Pending = { before: Entry[]; after: Entry[]; id: string; pid: number; previousRoot?: string; beforeLogin?: boolean; afterLogin: boolean; owned?: { entries?: Entry[] } };
export const CLAUDE_API_ENV = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY'];

/** Profile selection uses the native config-dir interface; no logout, login,
 * token refresh or credential snapshot is performed by the manager. */
export class ClaudeSessionController {
  private restartRequired = false;
  private message?: string;
  private recoveryError?: string;
  readonly ready: Promise<void>;
  constructor(private readonly context: vscode.ExtensionContext, private readonly environment: EnvironmentState,
    private readonly prepareNetwork: (home: string) => Promise<void>, private readonly prepareStorage?: (root: string) => Promise<() => Promise<void>>) { this.ready = this.initialize(); }
  private profiles(root = this.environment.get<string>(ROOT)): ClaudeProfiles | undefined { return root ? new ClaudeProfiles(root, this.environment.id) : undefined; }
  private async initialize(): Promise<void> {
    await this.environment.ready;
    this.recoveryError = undefined;
    const root = this.environment.get<string>(ROOT + '.pending') ?? this.environment.get<string>(ROOT);
    const p = this.profiles(root);
    try {
      if (p && this.entries().find(e => e.name === 'CLAUDE_CONFIG_DIR')?.value === '' && process.env.CLAUDE_CONFIG_DIR) throw new Error('当前档案需要原生默认目录，但 VS Code 启动环境仍设置了 CLAUDE_CONFIG_DIR。请移除该外部覆盖后完整重启 VS Code，保留原登录命名空间。');
      const marker = await json<{ environmentId?: string }>(join(getToolHome('claude'), '.agentdeck-profile.json'), {});
      if (marker.environmentId && marker.environmentId !== this.environment.id) throw new Error('Claude 配置目录属于另一个环境，不会读取或复用其认证。');
      if (!p) return;
      await FileRecovery.recover(p.recoveryDirectory);
      const pending = await json<Pending | undefined>(join(p.environmentDirectory, 'selection.pending.json'), undefined);
      if (pending) {
        if (pending.pid !== process.pid) { try { process.kill(pending.pid, 0); throw new Error('另一个窗口仍在切换 Claude 账号。'); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e; } }
        const committed = (await p.binding())?.activeId === pending.id && same(this.entries(), pending.after) && vscode.workspace.getConfiguration('claudeCode').get('disableLoginPrompt', false) === pending.afterLogin;
        if (!committed) {
          if (!same(this.entries(), pending.before) && !same(this.entries(), pending.after)) throw new Error('Claude 启动设置被外部更改，请保留恢复记录。');
          await this.updateEntries(pending.owned ? pending.owned.entries : pending.before);
          await vscode.workspace.getConfiguration('claudeCode').update('disableLoginPrompt', pending.beforeLogin, vscode.ConfigurationTarget.Global);
        }
        await this.environment.update(ROOT, committed ? root : pending.previousRoot);
        await fs.unlink(join(p.environmentDirectory, 'selection.pending.json'));
        await this.environment.update(ROOT + '.pending', undefined);
      }
      const binding = await p.binding(), current = (await p.read()).identities.find(i => i.id === binding?.activeId);
      if (current) { await new ClaudeProjectHistory(p.home(current), this.environment.id, this.environment.label).recover(); await new ClaudeHistoryScope(p.home(current), this.environment.id).recover(); await new HistoryImports(p.root, 'claude', current, this.environment.id, '').recover(); }
      const state = await this.readState();
      if (state.root && !state.attached) throw new Error('Claude 启动目录与账号历史绑定不一致，请检查挂载和 CLAUDE_CONFIG_DIR 后刷新。');
      if (state.attached) this.terminalHome(state.runtimeConfigDir ?? '');
    } catch (e) { this.recoveryError = this.message = e instanceof Error ? e.message : String(e); }
  }
  private entries(): Entry[] { return vscode.workspace.getConfiguration('claudeCode').get<Entry[]>('environmentVariables', []); }
  private async updateEntries(entries: Entry[] | undefined): Promise<void> {
    await vscode.workspace.getConfiguration('claudeCode').update('environmentVariables', entries, vscode.ConfigurationTarget.Global);
    if (!same(this.entries(), entries ?? [])) throw new Error('工作区或策略覆盖了 Claude 配置目录。');
  }
  private terminalHome(home: string): void { this.context.environmentVariableCollection.replace('CLAUDE_CONFIG_DIR', home); }
  async refresh(): Promise<void> { await this.ready; await this.initialize(); }
  async state(): Promise<SessionState> { await this.ready; return this.readState(); }
  private async readState(): Promise<SessionState> {
    const p = this.profiles(), base: SessionState = { runtimeHome: getToolHome('claude'), runtimeConfigDir: this.entries().find(e => e.name === 'CLAUDE_CONFIG_DIR')?.value ?? process.env.CLAUDE_CONFIG_DIR ?? '', identities: [], sessions: [], attached: false, environment: this.environment.label, environmentId: this.environment.id, restartRequired: this.restartRequired, message: this.message };
    if (!p) return base;
    try {
      const registry = await p.read(), binding = await p.binding(), identity = registry.identities.find(i => i.id === binding?.activeId);
      let nativeHistory: SessionState['nativeHistory'];
      const folders = vscode.workspace.workspaceFolders;
      if (identity && folders?.length === 1 && folders[0].uri.scheme === 'file') {
        const workspace = folders[0].uri.fsPath;
        try { const legacy = await new ClaudeProjectHistory(p.home(identity), this.environment.id, this.environment.label).current(workspace); nativeHistory = { workspace, ...await new ClaudeHistoryScope(p.home(identity), this.environment.id).current(workspace), legacyMapping: Boolean(legacy.project) }; }
        catch { nativeHistory = { workspace, error: '项目映射状态异常，请检查链接与映射归属记录。' }; }
      }
      return { ...base, root: p.root, identities: registry.identities, activeId: binding?.activeId, attached: !this.recoveryError && await p.attached(base.runtimeHome, binding), nativeHistory };
    }
    catch { return { ...base, root: p.root, message: this.recoveryError ?? 'Claude 数据目录不可用，请检查挂载。' }; }
  }
  get recoveryBlocked(): boolean { return Boolean(this.recoveryError); }
  assertReady(): void {
    if (this.recoveryError) throw new Error(this.recoveryError);
    if (this.restartRequired) throw new Error('Claude 账号或目录已改变，请先重载窗口并重启已有 CLI。');
  }
  async ensureMode(kind: ClaudeIdentity['kind']): Promise<void> {
    this.assertReady(); const state = await this.state();
    if (state.root && (!state.attached || state.identities.find(i => i.id === state.activeId)?.kind !== kind)) throw new Error('请先切换到对应 Claude 官方账号或 API 模式并重载。');
  }
  async prepareMode(kind: ClaudeIdentity['kind'], initialKind: ClaudeIdentity['kind']): Promise<void> {
    this.assertReady(); const p = this.profiles();
    if (!p) { await this.configure(initialKind); return; }
    const registry = await p.read(), choices = registry.identities.filter(i => i.kind === kind);
    let identity = choices.length === 1 ? choices[0] : choices.length ? (await vscode.window.showQuickPick(choices.map(identity => ({ label: identity.name, identity })), { title: '选择 Claude 官方账号档案' }))?.identity : undefined;
    if (choices.length && !identity) throw new Error('已取消：未切换模式。');
    if (!await confirmClientChange('Claude Code', '切换登录方式（保留已有登录状态）')) throw new Error('已取消：未切换模式。');
    if (!identity) {
      const name = kind === 'api' ? 'API 共享历史' : await vscode.window.showInputBox({ title: 'Claude 官方账号名称（本地别名）' });
      if (!name) throw new Error('已取消：未切换模式。');
      identity = await p.add(name, kind);
    }
    await this.activate(p, identity);
  }
  async networkHomes(): Promise<string[]> {
    const p = this.profiles(); if (!p) return [getToolHome('claude')];
    const binding = await p.binding();
    const homes = (await p.read()).identities.map(i => p.localHome(i, binding));
    // Do not materialize another account just to apply a proxy.
    return [getToolHome('claude'), ...await Promise.all(homes.map(async home => await fs.stat(home).catch(() => undefined) ? home : undefined))].filter((x): x is string => Boolean(x));
  }
  async action(action: SessionAction, id?: string, kind: ClaudeIdentity['kind'] = 'official'): Promise<void> {
    await this.ready;
    if (action === 'reload') { await vscode.commands.executeCommand('workbench.action.reloadWindow'); return; }
    if (action === 'refresh') return;
    if (action === 'configure') { await this.configure(kind); return; }
    const p = this.profiles(); if (!p) throw new Error('请先连接 Claude 数据目录。');
    if (action === 'add') {
      const name = await vscode.window.showInputBox({ title: '添加 Claude 官方账号', prompt: '首次使用此档案需要登录一次；之后保留本环境的原生登录状态。' });
      if (!name) throw new Error('已取消：未添加账号。'); await p.add(name, 'official'); return;
    }
    const selectedId = id ?? (await p.binding())?.activeId;
    const current = (await p.read()).identities.find(i => i.id === selectedId);
    if (!current) throw new Error('账号档案不存在。');
    if (action === 'rename') { const name = await vscode.window.showInputBox({ title: '重命名 Claude 账号档案', value: current.name }); if (!name) throw new Error('已取消：名称未更改。'); await p.rename(current.id, name); return; }
    if (action === 'backup') { this.message = '历史备份已保存：' + await backupHistory(this.historyBackupHome(p, current), join(p.root, 'backups'), current.kind, current.name, 'claude'); return; }
    if (action === 'switch') {
      this.assertReady();
      if ((await p.binding())?.activeId === current.id && (await this.state()).attached) return;
      if (!await confirmClientChange('Claude Code', '切换到 ' + current.name)) throw new Error('已取消：未切换账号。');
      await this.activate(p, current); return;
    }
    throw new Error('当前 Claude 操作未提供此入口。');
  }
  private historyBackupHome(p: ClaudeProfiles, identity: ClaudeIdentity): string { return p.home(identity); }
  async setHistoryProject(workspace: string, project?: string): Promise<boolean> {
    await this.ready; this.assertReady();
    const p = this.profiles(), state = await this.state(), current = state.identities.find(i => i.id === state.activeId);
    if (!p || !current || !state.attached) throw new Error('请先连接并切换到需要读取历史的档案。');
    const legacy = new ClaudeProjectHistory(p.home(current), this.environment.id, this.environment.label);
    const old = await legacy.current(workspace);
    if (old.project) {
      if (!old.owned) throw new Error('旧目录映射属于其他环境，请在原环境解除。');
      if (!await confirmClientChange('Claude Code', '先撤销旧目录映射，恢复新聊天原保存位置；旧聊天保留。重载后再选择浏览项目')) throw new Error('已取消：旧映射保留。');
      await legacy.clear(workspace); this.restartRequired = true; this.message = '旧目录映射已解除。请重载后再选择历史浏览范围，新聊天恢复原保存位置。'; return false;
    }
    if (!await confirmClientChange('Claude Code', project ? '载入所选项目的旧会话浏览入口；新聊天继续保存在当前项目，已有聊天保留' : '恢复默认历史范围；只移除本环境的浏览入口，原聊天和新聊天保存位置不变')) throw new Error('已取消：历史浏览范围未更改。');
    const scope = new ClaudeHistoryScope(p.home(current), this.environment.id);
    if (project) await scope.apply(workspace, project);
    else { const retained = await scope.clear(workspace); if (retained) this.message = retained + ' 个文件已被原生客户端替换，保留为当前项目实际会话。'; }
    this.restartRequired = true;
    this.message = (this.message || '') + '历史浏览范围已更新；重载窗口并重启旧CLI后生效。新聊天保存位置不变。';
    return true;
  }
  private async configure(kind: ClaudeIdentity['kind']): Promise<void> {
    this.assertReady();
    const folder = (await vscode.window.showOpenDialog({ title: '选择数据目录（使用 claude 子目录）', openLabel: '选择目录', canSelectFolders: true, canSelectFiles: false, canSelectMany: false }))?.[0]?.fsPath;
    if (!folder) throw new Error('已取消：数据目录未更改。');
    let check = await fs.realpath(folder);
    for (;;) { if (await fs.lstat(join(check, '.git')).catch(() => undefined)) throw new Error('请选择 Git 仓库之外的数据目录。'); const parent = dirname(check); if (parent === check) break; check = parent; }
    const root = basename(folder).toLowerCase() === 'claude' ? folder : join(folder, 'claude');
    const p = new ClaudeProfiles(root, this.environment.id), registry = await p.read();
    let identity: ClaudeIdentity | undefined;
    if (registry.identities.length) {
      const choices = registry.identities.filter(i => i.kind === kind);
      const selected = await vscode.window.showQuickPick([...choices.map(identity => ({ label: identity.name, identity, create: false })), ...(kind === 'api' && !choices.length ? [{ label: '新建 API 共享历史', identity: undefined, create: true }] : [])], { title: '连接已有 Claude 档案（不自动合并当前历史）' });
      if (!selected) throw new Error('已取消：数据目录未更改。'); identity = selected.identity;
    }
    if (!await confirmClientChange('Claude Code', '连接数据目录；原历史和登录缓存保留')) throw new Error('已取消：数据目录未更改。');
    const original = getToolHome('claude');
    await p.createLayout(original);
    const adopt = registry.identities.length === 0 && !await p.binding();
    const undoLogs = await this.prepareStorage?.(root);
    try {
      identity ??= await p.add(kind === 'api' ? 'API 共享历史' : '官方账号 1', kind);
      await this.activate(p, identity, adopt ? original : undefined);
    } catch (e) { await undoLogs?.(); throw e; }
  }
  private async activate(p: ClaudeProfiles, identity: ClaudeIdentity, adopt?: string): Promise<void> {
    const inspected = vscode.workspace.getConfiguration('claudeCode').inspect('environmentVariables');
    if (inspected?.workspaceValue !== undefined || inspected?.workspaceFolderValue !== undefined) throw new Error('工作区覆盖了 Claude 启动环境，请先移除该覆盖，再切换账号。');
    if (identity.kind === 'official') {
      const conflicts = CLAUDE_API_ENV.filter(name => Boolean(process.env[name]) || this.entries().some(e => e.name === name && Boolean(e.value)));
      if (conflicts.length) throw new Error('Claude 官方模式存在外部认证/供应商覆盖：' + conflicts.join('、') + '。请在其来源移除后重启；不会清除或退出已有登录。');
    }
    const binding: ClaudeBinding = { ...await json<ClaudeBinding | undefined>(join(p.environmentDirectory, 'prepared.json'), undefined), ...await p.binding(), activeId: identity.id };
    if (binding.adopted?.id === identity.id && binding.adopted.implicit && process.env.CLAUDE_CONFIG_DIR) throw new Error('原默认档案不能被外部 CLAUDE_CONFIG_DIR 覆盖。请移除该启动环境变量后完整重启 VS Code。');
    if (adopt) binding.adopted = { id: identity.id, home: resolve(adopt), implicit: !this.entries().find(e => e.name === 'CLAUDE_CONFIG_DIR')?.value && !process.env.CLAUDE_CONFIG_DIR };
    const home = await p.prepare(identity, binding, Boolean(adopt), binding.adopted?.id === identity.id);
    await this.prepareNetwork(home);
    const section = vscode.workspace.getConfiguration('claudeCode');
    const owned = { entries: ownValue(section, 'environmentVariables') as Entry[] | undefined };
    const beforeLogin = ownValue(section, 'disableLoginPrompt') as boolean | undefined, afterLogin = identity.kind === 'api';
    const configDir = binding.adopted?.id === identity.id && binding.adopted.implicit ? '' : home;
    const before = this.entries(), after = [...before.filter(e => e.name !== 'CLAUDE_CONFIG_DIR'), { name: 'CLAUDE_CONFIG_DIR', value: configDir }];
    const pendingPath = join(p.environmentDirectory, 'selection.pending.json');
    if (await fs.stat(pendingPath).catch(() => undefined)) throw new Error('存在未完成的 Claude 账号切换，请重载后检查恢复记录。');
    await this.environment.update(ROOT + '.pending', p.root);
    await fs.writeFile(pendingPath, JSON.stringify({ before, after, beforeLogin, afterLogin, owned, id: identity.id, pid: process.pid, previousRoot: this.environment.get(ROOT) } satisfies Pending), { flag: 'wx', mode: 0o600 });
    try {
      await FileRecovery.run(p.recoveryDirectory, async tx => {
        await this.updateEntries(after);
        await vscode.workspace.getConfiguration('claudeCode').update('disableLoginPrompt', afterLogin, vscode.ConfigurationTarget.Global);
        if (vscode.workspace.getConfiguration('claudeCode').get('disableLoginPrompt', false) !== afterLogin) throw new Error('Claude 登录提示设置被策略覆盖。');
        await p.linkHistory(tx, identity, home);
        await tx.write(p.bindingPath, JSON.stringify(binding));
        await this.environment.update(ROOT, p.root);
      });
    } catch (e) {
      try { if (!same(this.entries(), before) && !same(this.entries(), after)) throw Error('外部修改'); await this.updateEntries(owned.entries); await vscode.workspace.getConfiguration('claudeCode').update('disableLoginPrompt', beforeLogin, vscode.ConfigurationTarget.Global); const pending = await json<Pending>(pendingPath, {} as Pending); await this.environment.update(ROOT, pending.previousRoot); await fs.unlink(pendingPath); await this.environment.update(ROOT + '.pending', undefined); }
      catch { this.recoveryError = 'Claude 账号切换恢复未完成，请保留记录并重载检查。'; throw new Error(this.recoveryError); }
      throw e;
    }
    this.terminalHome(configDir); this.restartRequired = true;
    this.message = '已选择「' + identity.name + '」。重载扩展、重启已有 CLI 后复用本环境登录状态；首次使用的新账号或环境仍需原生登录。';
    await fs.unlink(join(p.environmentDirectory, 'prepared.json')).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') this.message += ' 初次准备记录保留，后续可核对。'; });
    await fs.unlink(pendingPath).catch(() => {}); await this.environment.update(ROOT + '.pending', undefined).catch(() => {});
  }
}
function same(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }

function ownValue(section: vscode.WorkspaceConfiguration, key: string): unknown {
  const value = section.inspect(key) as { globalValue?: unknown; globalLocalValue?: unknown; globalRemoteValue?: unknown } | undefined;
  if (vscode.env?.remoteName) return value?.globalRemoteValue;
  return value && 'globalLocalValue' in value ? value.globalLocalValue : value?.globalValue;
}
