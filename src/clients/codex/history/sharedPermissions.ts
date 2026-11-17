import * as fs from 'fs/promises';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const run = promisify(execFile);
export interface SharedPermissionChange { path: string; before: number; after: number; uid: number; gid: number; defaultAclBefore?: string }

async function inheritSharedGroup(directory: string): Promise<void> {
  // Default ACLs apply to new native rollout/SQLite files despite a restrictive
  // process umask. They belong only on public history/export/backup trees.
  try { await run('setfacl', ['-d', '-m', 'u::rwx,g::rwx,o::---', '--', directory]); }
  catch { throw new Error('共享历史目录需要支持 POSIX 默认 ACL，并提供 setfacl/getfacl；请在创建目录的环境检查：' + directory); }
}

/** Shared history is accessible to the directory's trusted POSIX group.
 * Environment homes, credentials and recovery journals are never traversed. */
export async function sharedDirectory(directory: string, inheritGroup = false): Promise<void> {
  await fs.mkdir(directory, { recursive: true, mode: 0o2770 });
  if (process.platform === 'win32') return;
  const stat = await fs.stat(directory);
  if (!stat.isDirectory()) throw new Error('共享数据路径必须是普通目录：' + directory);
  if (stat.uid === process.getuid?.()) {
    await fs.chmod(directory, 0o2770);
    if (inheritGroup && process.platform === 'linux') await inheritSharedGroup(directory);
  }
  await fs.access(directory, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);
}

export async function shareHistory(directory: string): Promise<void> {
  for (const change of await sharedPermissionPlan(directory, true)) await applySharedPermission(change);
}

export async function applySharedPermission(change: SharedPermissionChange): Promise<void> {
  await fs.chmod(change.path, change.after);
  if (change.defaultAclBefore !== undefined) await inheritSharedGroup(change.path);
}

/** Metadata-only repair plan. Symlinks are skipped, including links outside
 * shared history. Callers save this plan before explicitly applying it. */
export async function sharedPermissionPlan(root: string, historyOnly = false): Promise<SharedPermissionChange[]> {
  if (process.platform === 'win32') return [];
  if ((await fs.lstat(root)).isSymbolicLink()) throw new Error('权限修复目标必须是实际共享目录，不能是符号链接。');
  const changes: SharedPermissionChange[] = [];
  async function visit(file: string, recursive: boolean, inheritGroup = false): Promise<void> {
    const stat = await fs.lstat(file).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; });
    if (!stat || stat.isSymbolicLink() || !stat.isDirectory() && !stat.isFile()) return;
    const after = stat.isDirectory() ? 0o2770 : 0o660;
    let defaultAclBefore: string | undefined;
    if (inheritGroup && stat.isDirectory() && process.platform === 'linux') {
      const { stdout } = await run('getfacl', ['-c', '-p', '-d', '--', file]);
      if (!/^(?:default:)?group::rwx$/m.test(stdout) || !/^(?:default:)?other::---$/m.test(stdout) || /^(?:default:)?mask::(?!rwx)/m.test(stdout)) defaultAclBefore = stdout;
    }
    if ((stat.mode & 0o7777) !== after || defaultAclBefore !== undefined) changes.push({ path: file, before: stat.mode & 0o7777, after, uid: stat.uid, gid: stat.gid, defaultAclBefore });
    if (recursive && stat.isDirectory()) for (const name of await fs.readdir(file)) await visit(path.join(file, name), true, inheritGroup);
  }
  await visit(root, historyOnly, historyOnly);
  if (!historyOnly) {
    for (const name of ['profiles', 'providers', 'backups']) await visit(path.join(root, name), true, true);
    for (const name of ['environments', '.registry-recovery', 'profiles.json', 'readme.md']) await visit(path.join(root, name), false);
  }
  return changes;
}
