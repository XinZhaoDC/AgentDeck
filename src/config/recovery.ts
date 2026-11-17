import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash, randomUUID } from 'crypto';

type Snapshot = { kind: 'absent' } | { kind: 'file'; hash: string; mode: number } | { kind: 'link'; target: string } | { kind: 'directory' };
interface Change { move?: boolean; target: string; before: Snapshot; after: Snapshot; backup?: string; retained?: string; temporary?: string; hard?: { source: string; dev: number; ino: number; remove: boolean } }
interface Journal { version: 1; pid: number; phase: 'applying' | 'committed'; changes: Change[] }

/** A bounded, on-disk undo log. Only the operation's own unchanged output is
 * rolled back. Conversation data is never snapshotted or rewound here. */
export class FileRecovery {
  private journal: Journal = { version: 1, pid: process.pid, phase: 'applying', changes: [] };
  private constructor(readonly directory: string) {}
  static async run<T>(directory: string, action: (tx: FileRecovery) => Promise<T>, scope?: string): Promise<T> {
    await FileRecovery.recover(directory, scope);
    await fs.mkdir(path.dirname(directory), { recursive: true, mode: 0o700 });
    try { await fs.mkdir(directory, { mode: 0o700 }); }
    catch { throw new Error('另一个配置操作正在进行，或仍有未解决的恢复记录：' + directory); }
    const tx = new FileRecovery(directory);
    try {
      await tx.save();
      const result = await action(tx);
      tx.journal.phase = 'committed'; await tx.save();
      // A committed operation must not be reported as reverted if cleanup fails.
      await tx.cleanup().catch(() => {});
      return result;
    } catch (error) {
      try { await tx.rollback(); }
      catch { throw new Error('操作失败，回滚未完成（文件可能被其他进程修改）。恢复材料已保留：' + directory); }
      throw new Error('操作失败，已恢复到本次操作前的状态。' + (error instanceof Error ? ' ' + error.message : ''));
    }
  }
  static async recover(directory: string, scope?: string): Promise<string | undefined> {
    let journal: Journal;
    try { journal = JSON.parse(await fs.readFile(path.join(directory, 'journal.json'), 'utf8')); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        if (await fs.lstat(directory).catch(() => undefined)) throw new Error('恢复记录不完整，请保留现场并检查：' + directory);
        return;
      }
      throw new Error('无法读取恢复记录，请保留现场：' + directory);
    }
    if (journal.version !== 1 || !Array.isArray(journal.changes) || !['applying', 'committed'].includes(journal.phase)) throw new Error('恢复记录无效：' + directory);
    if (scope && journal.changes.some(c => !within(scope, c.target) || c.retained && !within(scope, c.retained) || c.temporary && !within(scope, c.temporary) || c.backup && !within(directory, c.backup) || c.hard && !within(scope, c.hard.source))) throw new Error('恢复记录来自另一挂载路径或超出当前档案，请在原环境恢复；不会操作其他路径：' + directory);
    // Never roll back another live extension host's transaction.
    if (journal.phase !== 'committed' && alive(journal.pid)) throw new Error('配置操作尚未结束：' + directory);
    const tx = new FileRecovery(directory); tx.journal = journal;
    if (journal.phase === 'committed') { await tx.cleanup(); return '已清理上次成功操作的临时恢复数据。'; }
    try { await tx.rollback(); return '检测到上次操作意外退出，已恢复到操作前状态。'; }
    catch { throw new Error('上次操作的自动恢复未完成，检测到文件冲突。恢复材料：' + directory); }
  }
  async write(target: string, content: string, mode = 0o600): Promise<void> {
    target = path.resolve(target);
    const before = await snapshot(target);
    if (before.kind !== 'file' && before.kind !== 'absent') throw new Error('配置文件必须是普通文件：' + target);
    const change: Change = { target, before, after: { kind: 'file', hash: hash(Buffer.from(content)), mode }, temporary: target + '.modelswitch-' + randomUUID() };
    if (before.kind === 'file') {
      change.backup = path.join(this.directory, String(this.journal.changes.length) + '.before');
      await fs.copyFile(target, change.backup); await fs.chmod(change.backup, 0o600); await syncFile(change.backup);
    }
    this.journal.changes.push(change); await this.save();
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await fs.writeFile(change.temporary!, content, { mode, flag: 'wx' });
    await fs.chmod(change.temporary!, mode); await syncFile(change.temporary!);
    if (!same(await snapshot(target), before)) throw new Error('写入前配置被其他程序修改：' + target);
    await fs.rename(change.temporary!, target);
    if (!same(await snapshot(target), change.after)) throw new Error('配置写入校验失败：' + target);
  }
  async link(target: string, destination: string, kind: 'dir' | 'file' = 'dir', options: { relative?: boolean; expectedTarget?: string | null } = {}): Promise<void> {
    target = path.resolve(target); destination = path.resolve(destination);
    const before = await snapshot(target);
    if ('expectedTarget' in options && !same(before, options.expectedTarget === null ? { kind: 'absent' } : { kind: 'link', target: path.resolve(options.expectedTarget!) })) throw new Error('目录入口已变化，不会覆盖：' + target);
    if (before.kind === 'file') throw new Error('目录入口被普通文件占用：' + target);
    const change: Change = { target, before, after: { kind: 'link', target: destination }, temporary: target + '.modelswitch-' + randomUUID() };
    if (before.kind !== 'absent') change.retained = target + (before.kind === 'directory' ? '.before-vscodemodelswitch-' : '.previous-link-') + randomUUID();
    this.journal.changes.push(change); await this.save();
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    if (options.relative && process.platform === 'win32') throw new Error('当前平台尚未验证可移植的相对目录链接。');
    await fs.symlink(options.relative ? path.relative(path.dirname(target), destination) : destination, change.temporary!, process.platform === 'win32' && kind === 'dir' ? 'junction' : kind);
    if (!same(await snapshot(target), before)) throw new Error('切换前目录入口被其他程序修改：' + target);
    if (change.retained) {
      try { await fs.rename(target, change.retained); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'EBUSY') throw new Error('该目录自身是挂载点或被系统锁定，不能替换。请检查这个子目录的挂载：' + target); throw error; }
    }
    await fs.rename(change.temporary!, target);
  }
  async removeLink(target: string, destination: string): Promise<void> {
    target = path.resolve(target);
    const before = await snapshot(target);
    if (!same(before, { kind: 'link', target: path.resolve(destination) })) throw new Error('目录链接已变化，不会删除：' + target);
    const change: Change = { target, before, after: { kind: 'absent' }, retained: target + '.previous-link-' + randomUUID() };
    this.journal.changes.push(change); await this.save();
    if (!same(await snapshot(target), before)) throw new Error('删除前目录链接被其他程序修改：' + target);
    await fs.rename(target, change.retained!);
  }
  async hardLink(target: string, source: string): Promise<void> {
    target = path.resolve(target); source = path.resolve(source);
    const stat = await fs.lstat(source);
    if (!stat.isFile() || await exists(target)) throw new Error('历史浏览入口已存在或源文件不是普通文件，不会覆盖。');
    const change: Change = { target, before: { kind: 'absent' }, after: { kind: 'absent' }, hard: { source, dev: stat.dev, ino: stat.ino, remove: false } };
    this.journal.changes.push(change); await this.save();
    await fs.link(source, target);
    if (!await sameInode(target, change.hard!)) throw new Error('历史浏览链接在创建期间变化。');
  }
  async removeHardLink(target: string, source: string): Promise<void> {
    target = path.resolve(target); source = path.resolve(source);
    const stat = await fs.lstat(source), hard = { source, dev: stat.dev, ino: stat.ino, remove: true };
    if (!stat.isFile() || !await sameInode(target, hard)) throw new Error('历史浏览文件已被原生客户端替换，将保留该文件。');
    const change: Change = { target, before: { kind: 'absent' }, after: { kind: 'absent' }, retained: target + '.previous-link-' + randomUUID(), hard };
    this.journal.changes.push(change); await this.save();
    await fs.rename(target, change.retained!);
    if (!await sameInode(change.retained!, hard)) throw new Error('历史浏览入口在解除期间变化。');
  }
  /** Retain a managed transcript outside native scan paths; never delete it. */
  async moveFile(target: string, retained: string): Promise<void> {
    target = path.resolve(target); retained = path.resolve(retained);
    const before = await snapshot(target);
    if (before.kind !== 'file' || await exists(retained)) throw new Error('历史副本移动目标已存在或文件已变化。');
    const change: Change = { target, retained, before, after: { kind: 'absent' }, move: true };
    this.journal.changes.push(change); await this.save();
    if (!same(await snapshot(target), before)) throw new Error('历史副本正在被写入，请结束会话后重试。');
    await fs.rename(target, retained);
    if (!same(await snapshot(retained), before)) throw new Error('历史副本在移除期间变化。');
  }
  private async rollback(): Promise<void> {
    for (const change of [...this.journal.changes].reverse()) {
      if (change.move) {
        if (same(await snapshot(change.target), change.before) && !await exists(change.retained!)) continue;
        if (await exists(change.target) || !same(await snapshot(change.retained!), change.before)) throw new Error('Retained transcript changed');
        await fs.rename(change.retained!, change.target); continue;
      }
      if (change.hard) {
        if (change.hard.remove) {
          if (!await exists(change.retained!)) { if (await sameInode(change.target, change.hard)) continue; throw new Error('History link changed'); }
          if (await exists(change.target) || !await sameInode(change.retained!, change.hard)) throw new Error('History link changed');
          await fs.rename(change.retained!, change.target);
        } else if (await exists(change.target)) {
          if (!await sameInode(change.target, change.hard)) throw new Error('History link changed');
          await fs.unlink(change.target);
        }
        continue;
      }
      const current = await snapshot(change.target);
      if (same(current, change.before) && !(change.retained && await exists(change.retained))) continue;
      if (!same(current, change.after) && !(current.kind === 'absent' && change.retained && await exists(change.retained))) throw new Error('External modification');
      if (change.before.kind === 'file') {
        const bytes = await fs.readFile(change.backup!);
        if (hash(bytes) !== change.before.hash) throw new Error('Invalid recovery copy');
        const temp = change.target + '.restore-' + randomUUID();
        await fs.writeFile(temp, bytes, { mode: change.before.mode, flag: 'wx' }); await syncFile(temp);
        await fs.rename(temp, change.target);
      } else {
        if (current.kind !== 'absent') await fs.unlink(change.target);
        if (change.retained) await fs.rename(change.retained, change.target);
      }
    }
    await this.cleanup();
  }
  private async save(): Promise<void> {
    const temp = path.join(this.directory, 'journal.next');
    await fs.writeFile(temp, JSON.stringify(this.journal), { mode: 0o600 }); await syncFile(temp);
    await fs.rename(temp, path.join(this.directory, 'journal.json'));
  }
  private async cleanup(): Promise<void> {
    for (const change of this.journal.changes) {
      if (change.hard?.remove && await exists(change.retained!)) {
        if (!await sameInode(change.retained!, change.hard)) throw new Error('Retained history link changed');
        await fs.unlink(change.retained!);
      }
      if (change.temporary) await fs.unlink(change.temporary).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; });
      if (change.retained && change.before.kind === 'link') await fs.unlink(change.retained).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; });
      // The original directory retained at first enrollment is user data.
    }
    await fs.rm(this.directory, { recursive: true });
  }
}
async function snapshot(file: string): Promise<Snapshot> {
  const stat = await fs.lstat(file).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; });
  if (!stat) return { kind: 'absent' };
  if (stat.isSymbolicLink()) return { kind: 'link', target: path.resolve(path.dirname(file), await fs.readlink(file)) };
  if (stat.isDirectory()) return { kind: 'directory' };
  if (!stat.isFile()) throw new Error('Unsupported file: ' + file);
  return { kind: 'file', hash: hash(await fs.readFile(file)), mode: stat.mode & 0o777 };
}
function same(a: Snapshot, b: Snapshot): boolean { return a.kind === b.kind && (a.kind === 'file' ? b.kind === 'file' && a.hash === b.hash : a.kind === 'link' ? b.kind === 'link' && equalLink(a.target, b.target) : true); }
function hash(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }
async function exists(file: string): Promise<boolean> { return Boolean(await fs.lstat(file).catch(() => undefined)); }
async function syncFile(file: string): Promise<void> { const handle = await fs.open(file, 'r+'); try { await handle.sync(); } finally { await handle.close(); } }
function alive(pid: number): boolean { if (!Number.isSafeInteger(pid) || pid <= 0) return true; try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code !== 'ESRCH'; } }

function equalLink(a: string, b: string): boolean {
  if (process.platform !== 'win32') return a === b;
  // Node may report a junction using the Windows namespace prefix.
  const prefix = String.fromCharCode(92, 92, 63, 92);
  const normalize = (value: string) => (value.startsWith(prefix) ? value.slice(4) : value).toLowerCase();
  return normalize(a) === normalize(b);
}
function within(root: string, file: string): boolean {
  if (typeof file !== 'string') return false;
  const relative = path.relative(path.resolve(root), path.resolve(file));
  return Boolean(relative) && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
async function sameInode(file: string, identity: { dev: number; ino: number }): Promise<boolean> {
  const stat = await fs.lstat(file).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; });
  return Boolean(stat?.isFile() && stat.dev === identity.dev && stat.ino === identity.ino);
}
