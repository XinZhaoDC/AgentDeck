'use strict';
// Optional read-only native app-server smoke: entirely synthetic homes, no login
// and no model turn. The fixture provider points at an unused loopback port.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { CodexProfiles } = require('../out/clients/codex/history/codexProfiles');
const binary = process.env.VSCODEMODELSWITCH_NATIVE_CODEX;
async function main() {
 if (!binary) { console.log('SKIP native Codex binary not specified'); return; }
 const root = await fs.mkdtemp(path.join(process.env.VSCODEMODELSWITCH_TEST_HOME || os.tmpdir(), 'native-history-paths-')); console.log('RETAINED_FIXTURE: '+root); await fs.mkdir(path.join(root,'project'));
 const physical=path.join(root,'physical'), container=path.join(root,'container-mount'), host=path.join(root,'host-mount');
 await fs.mkdir(physical);await fs.symlink(physical,container);await fs.symlink(physical,host);
 const {rebuildNativeIndex}=require('../out/clients/codex/history/nativeIndex');
 const index=(home,sqlite)=>rebuildNativeIndex(binary,home,sqlite);
 const a=new CodexProfiles(path.join(container,'codex'),path.join(root,'a/home'),'env-a',undefined,index); await fs.mkdir(a.runtimeHome,{recursive:true});await a.initialize('official');
 const identity=(await a.read()).identities[0]; const b=new CodexProfiles(path.join(host,'codex'),path.join(root,'b/home'),'env-b',undefined,index);await b.attach(identity.id);
 const id=randomUUID(),now=new Date().toISOString(),folder=path.join(a.runtimeHome,'sessions',now.slice(0,4),now.slice(5,7),now.slice(8,10));await fs.mkdir(folder,{recursive:true});
 const rows=[{timestamp:now,type:'session_meta',payload:{id,timestamp:now,cwd:path.join(root,'project'),originator:'codex_vscode',cli_version:'0.166.0',source:'vscode',model_provider:'openai'}},{timestamp:now,type:'event_msg',payload:{type:'user_message',message:'Synthetic mount path history',images:[],local_images:[],text_elements:[]}},{timestamp:now,type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text:'Synthetic mount path history'}]}}];
 await fs.writeFile(path.join(folder,'rollout-'+now.slice(0,19).replace(/:/g,'-')+'-'+id+'.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
 await a.refreshIndex(); const first=await list(a,root,false,true);await fs.writeFile(path.join(root,'a-list.json'),JSON.stringify(first,null,2));
 await fs.rename(container,container+'.unavailable'); await fs.rename(a.runtimeHome,a.runtimeHome+'.stopped');
 const namesFile=path.join(b.runtimeHome,'session_index.jsonl'),namesText=await fs.readFile(namesFile,'utf8');await fs.writeFile(namesFile+'.native-replacement',namesText);await fs.rename(namesFile+'.native-replacement',namesFile);assert.ok((await fs.lstat(namesFile)).isFile());
 await b.refreshIndex(true);assert.ok((await fs.lstat(namesFile)).isSymbolicLink());const retained=(await fs.readdir(path.dirname(namesFile))).filter(n=>n.startsWith('session_index.jsonl.before-vscodemodelswitch-'));assert.equal(retained.length,1);assert.equal(await fs.readFile(path.join(path.dirname(namesFile),retained[0]),'utf8'),namesText);console.log('PASS native index upgrade retains an atomically replaced plain name file and restores the shared link'); const second=await list(b,root,false,true);
 assert.notEqual(a.sqliteHome(identity),b.sqliteHome(identity)); assert.ok(second.data.some(t=>t.id===id && t.fixtureRead==='ok')); console.log('PASS native GUI db-only query lists and opens history after old mount disappears, with private indexes');await fs.writeFile(path.join(root,'b-list.json'),JSON.stringify(second,null,2));
 assert.equal(second.data.find(t=>t.id===id).name, 'Synthetic portable title');
 assert.equal((await fs.lstat(path.join(a.runtimeHome+'.stopped','session_index.jsonl'))).isSymbolicLink(),true);
 console.log('PASS private indexes retain shared native custom titles and native rename keeps the name link');
 console.log('PASS private index directories differ across environments');
 await rebuildNativeIndex(binary,b.runtimeHome,b.sqliteHome(identity),{},id);console.log('PASS selected native thread is read before opening its IDE route');
 await assert.rejects(rebuildNativeIndex(binary,b.runtimeHome,b.sqliteHome(identity),{},randomUUID()));console.log('PASS missing selected native thread is rejected rather than opening an empty conversation');
 console.log(JSON.stringify({a:first.data.map(t=>({id:t.id,path:t.path,read:t.fixtureRead})),b:second.data.map(t=>({id:t.id,path:t.path,read:t.fixtureRead})),expected:id}));
}
async function list(profile, root, useDefaultProvider = false, dbOnly = false) {
  // Do not inherit account tokens, global auth settings or real user HOME.
  const child = spawn(binary, ['app-server'], { cwd: path.join(root, 'project'), env: {
    PATH: process.env.PATH, HOME: root, USERPROFILE: root, XDG_CONFIG_HOME: path.join(root, 'xdg'), CODEX_HOME: profile.runtimeHome,
    RUST_LOG: 'info', CODEX_DISABLE_ANALYTICS: '1'
  }, stdio: ['pipe', 'pipe', 'pipe'] });
  let seq = 0, buffer = '', errorText = ''; const pending = new Map();
  child.stderr.on('data', b => { errorText += b; });
  child.stdout.on('data', b => { buffer += b; let end; while ((end = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, end); buffer = buffer.slice(end + 1); try { const m = JSON.parse(line); const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); } } catch {} } });
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = ++seq; const timer = setTimeout(() => { pending.delete(id); reject(Error('Native timeout ' + method)); }, 8000);
    pending.set(id, { resolve: r => { clearTimeout(timer); resolve(r); }, reject: e => { clearTimeout(timer); reject(e); } });
    child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  });
  try {
    await send('initialize', { clientInfo: { name: 'modelswitch_fixture', version: '0.8.0' } });
    child.stdin.write('{"method":"initialized"}\n');
    let result;
    for (let n = 0; n < 10; n++) { result = await send('thread/list', { limit: 100, ...(useDefaultProvider ? {} : { modelProviders: [] }), useStateDbOnly: dbOnly }); if (result.data?.length) break; await new Promise(r => setTimeout(r, 250)); }
    if (profile.environmentId === 'env-a' && result.data?.length) { await send('thread/name/set', {threadId: result.data[0].id, name: 'Synthetic portable title'}); result = await send('thread/list', {limit:100,modelProviders:[],useStateDbOnly:true}); }
    if (result.data?.length) for (const thread of result.data.slice(0, 1)) { try { await send('thread/read', { threadId: thread.id, includeTurns: true }); thread.fixtureRead = 'ok'; } catch(e) { thread.fixtureRead = String(e); } }
    return result;
  } finally {
    child.stdin.end(); child.kill();
    await new Promise(resolve => { if (child.exitCode !== null) resolve(); else { child.once('exit', resolve); setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 1500).unref(); } });
    await fs.writeFile(path.join(root, 'native-' + profile.environmentId + '.stderr'), errorText);
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
