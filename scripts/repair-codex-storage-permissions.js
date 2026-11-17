'use strict';
// Explicit, metadata-only maintenance for old POSIX shared storage. No sudo,
// chown, credential reads, symlink traversal or environment-cache traversal.
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { sharedPermissionPlan, applySharedPermission } = require('../out/clients/codex/history/sharedPermissions');
(async () => {
  const [rootArg, snapshotArg, apply] = process.argv.slice(2);
  if (!rootArg || !snapshotArg || !['--apply', '--rollback'].includes(apply)) throw Error('用法：node scripts/repair-codex-storage-permissions.js <codex目录> <权限快照.json> --apply 或 --rollback');
  const root = path.resolve(rootArg), snapshot = path.resolve(snapshotArg);
  if (apply === '--rollback') {
    const saved = JSON.parse(await fs.readFile(snapshot, 'utf8'));
    if (saved.root !== root) throw Error('权限快照与目标目录不一致。');
    for (const change of [...saved.changes].reverse()) {
      const relative = path.relative(root, change.path), stat = await fs.lstat(change.path);
      if (relative.startsWith('..') || path.isAbsolute(relative) || stat.isSymbolicLink() || stat.uid !== change.uid || stat.gid !== change.gid) throw Error('目录或属主已变化，停止恢复权限。');
      await fs.chmod(change.path, change.before);
      if (change.defaultAclBefore !== undefined) {
        const result = change.defaultAclBefore.trim() ? spawnSync('setfacl',['-d','--set-file=-','--',change.path],{input:change.defaultAclBefore,encoding:'utf8'}) : spawnSync('setfacl',['-k','--',change.path],{encoding:'utf8'});
        if (result.status !== 0) throw Error('默认 ACL 恢复失败，请保留权限快照。');
      }
    }
    console.log(JSON.stringify({ restored: saved.changes.length })); return;
  }
  const changes = await sharedPermissionPlan(root);
  await fs.writeFile(snapshot, JSON.stringify({ root, changes }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  for (const change of changes) await applySharedPermission(change);
  console.log(JSON.stringify({ changed: changes.length, snapshot, privateEnvironments: 'untouched' }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
