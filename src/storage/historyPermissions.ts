import * as fs from 'fs/promises';
import { constants } from 'fs';
import * as path from 'path';
import { ToolId } from '../types';

/** Native clients can explicitly create 0600 files, overriding default ACLs.
 * Only the writer's own shared history is maintained. No credential/config or
 * environment directory is entered and no foreign owner is chmod-ed. */
export async function maintainOwnedHistory(root: string, tool: ToolId): Promise<{ repaired: number; blocked: number }> {
  const result = { repaired: 0, blocked: 0 };
  if (process.platform === 'win32') return result;
  const group = (await fs.stat(root)).gid;
  async function visit(file: string): Promise<void> {
    const stat = await fs.lstat(file).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; });
    if (!stat || stat.isSymbolicLink() || !stat.isDirectory() && !stat.isFile()) return;
    const mode = stat.isDirectory() ? 0o2770 : 0o660;
    if ((stat.mode & 0o7777) !== mode || stat.gid !== group) {
      if (stat.uid !== process.getuid?.() || stat.gid !== group) result.blocked++;
      else {
        const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
        try { const current = await handle.stat(); if (current.dev !== stat.dev || current.ino !== stat.ino) throw new Error('共享历史在权限维护时被替换。'); await handle.chmod(mode); result.repaired++; }
        finally { await handle.close(); }
      }
    }
    if (stat.isDirectory()) {
      const entries = await fs.readdir(file).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'EACCES') throw e; result.blocked++; return []; });
      for (const name of entries) await visit(path.join(file, name));
    }
  }
  const profiles = await fs.readdir(path.join(root, 'profiles'), { withFileTypes: true });
  for (const profile of profiles) if (profile.isDirectory() && /^home-[a-f0-9-]{36}$/i.test(profile.name)) {
    const history = path.join(root, 'profiles', profile.name, 'history');
    // Only the canonical native-history entries; profile metadata/recovery is
    // handled by its explicit transaction and never traversed here.
    for (const entry of tool === 'claude' ? ['projects'] : ['sessions', 'archived_sessions', 'session_index.jsonl']) await visit(path.join(history, entry));
  }
  return result;
}
