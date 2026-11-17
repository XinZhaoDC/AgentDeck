import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import { join } from 'path';
import { StringDecoder } from 'string_decoder';

/** Native cache scan plus explicitly selected copy name/delete operations.
 * No SQL/schema manipulation, account RPC, login or model turn is performed. */
export async function rebuildNativeIndex(executable: string, home: string, sqlite: string, proxy: Record<string, string> = {}, threadId?: string, changes?: { remove?: string[]; names?: Record<string, string> }): Promise<void> {
  const script = /\.[cm]?js$/i.test(executable);
  const env: NodeJS.ProcessEnv = { ...process.env, ...proxy, CODEX_HOME: home, CODEX_SQLITE_HOME: sqlite };
  if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1';
  const child = spawn(script ? process.execPath : executable, [...(script ? [executable] : []), 'app-server', '--listen', 'stdio://'], { cwd: home, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stderr.resume(); // Native diagnostics can contain user paths/content.
  const pending = new Map<number, { resolve: (value: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  let seq = 0, buffer = '', closed = false;
  const decoder = new StringDecoder('utf8');
  const fail = () => { closed = true; for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('Codex 原生历史索引刷新失败，请检查客户端版本、目录权限和启动环境。')); } pending.clear(); };
  child.on('error', fail); child.on('close', fail); child.stdin.on('error', fail);
  child.stdout.on('data', bytes => {
    buffer += decoder.write(bytes);
    if (buffer.length > 16 * 1024 * 1024) { fail(); child.kill(); return; }
    for (;;) {
      const end = buffer.indexOf('\n'); if (end < 0) break;
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      try {
        const m = JSON.parse(line), p = pending.get(m.id);
        if (p) { clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(new Error('Codex 原生历史索引操作失败，请核对会话、读取权限和客户端版本。')) : p.resolve(m.result); }
      } catch { /* Never expose raw native output. */ }
    }
  });
  const call = (method: string, params: unknown) => new Promise<any>((resolve, reject) => {
    if (closed) { reject(new Error('Codex 历史查询进程已退出。')); return; }
    const id = ++seq, timer = setTimeout(() => { pending.delete(id); reject(new Error('Codex 历史索引刷新超时，请保留原历史后重试。')); }, 30_000);
    pending.set(id, { resolve, reject, timer }); child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  });
  try {
    await call('initialize', { clientInfo: { name: 'agentdeck_history_index', version: '0.12.8' } });
    child.stdin.write('{"method":"initialized"}\n');
    let found = 0; const foundIds = new Set<string>();
    for (const archived of [false, true]) {
      let cursor: string | null = null; const seen = new Set<string>();
      do {
        const result = await call('thread/list', { archived, limit: 100, cursor, modelProviders: [], sourceKinds: [], useStateDbOnly: false });
        if (!Array.isArray(result?.data)) throw new Error('Codex 历史索引返回格式异常。');
        found += result.data.length; for (const thread of result.data) foundIds.add(thread.id);
        cursor = result.nextCursor ?? null;
        if (cursor !== null && (typeof cursor !== 'string' || seen.has(cursor))) throw new Error('Codex 历史索引分页异常。');
        if (cursor !== null) seen.add(cursor);
      } while (cursor !== null);
    }
    if (!found) {
      for (const name of ['sessions', 'archived_sessions']) {
        const files = await fs.readdir(join(home, name), { recursive: true }).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; return []; });
        if (files.some(f => f.endsWith('.jsonl'))) throw new Error('历史文件存在，但原生扫描返回零会话；索引未验证成功，请检查读取权限与客户端版本。');
      }
    }
    for (const [id, name] of Object.entries(changes?.names ?? {})) await call('thread/name/set', { threadId: id, name });
    for (const id of changes?.remove ?? []) if (foundIds.has(id)) await call('thread/delete', { threadId: id });
    if (changes?.remove?.length) for (const archived of [false, true]) {
      let cursor: string | null = null;
      do {
        const result = await call('thread/list', { archived, limit: 100, cursor, modelProviders: [], sourceKinds: [], useStateDbOnly: true });
        if (!Array.isArray(result?.data) || result.data.some((t: any) => changes.remove!.includes(t.id))) throw new Error('所选副本仍在原生索引中，请保留恢复材料后重试。');
        const next: string | null = result.nextCursor ?? null;
        if (next !== null && (typeof next !== 'string' || next === cursor)) throw new Error('原生索引分页异常。');
        cursor = next;
      } while (cursor !== null);
    }
    if (threadId) {
      const result = await call('thread/read', { threadId, includeTurns: false });
      if (result?.thread?.id !== threadId) throw new Error('原生索引未能读取所选会话，未打开空白聊天；请检查历史目录和客户端版本。');
    }
  } finally {
    fail(); child.stdin.destroy(); child.kill();
    if (child.exitCode === null && child.signalCode === null) await new Promise<void>(resolve => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 1500);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  }
}
