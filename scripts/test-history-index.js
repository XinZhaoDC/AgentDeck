'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { CodexProfiles } = require('../out/clients/codex/history/codexProfiles');
const { rebuildNativeIndex } = require('../out/clients/codex/history/nativeIndex');
const { setTopLevelValue } = require('../out/config/tomlEdit');
async function main() {
  const root = await fs.mkdtemp(path.join(process.env.VSCODEMODELSWITCH_TEST_HOME || os.tmpdir(), 'history-index-'));
  console.log('RETAINED_FIXTURE: ' + root);
  let count = 0; const test = async (name, fn) => { await fn(); count++; console.log('PASS ' + name); };
  const home = path.join(root, 'home'), sqlite = path.join(root, 'index'), ledger = path.join(home, 'calls.jsonl');
  await fs.mkdir(home); const mock = path.join(root, 'native.js');
  await fs.writeFile(mock, `
const fs=require('node:fs'); const path=require('node:path'); const rl=require('node:readline').createInterface({input:process.stdin});
rl.on('line',line=>{const m=JSON.parse(line); if(!m.id)return;
fs.appendFileSync(path.join(process.env.CODEX_HOME,'calls.jsonl'),JSON.stringify({method:m.method,params:m.params,sqlite:process.env.CODEX_SQLITE_HOME,proxy:process.env.HTTPS_PROXY})+'\\n');
if(process.env.HISTORY_FIXTURE_FAILURE==='yes'){console.log(JSON.stringify({id:m.id,error:{message:'synthetic-private-marker'}}));return;}
const result=m.method==='initialize'?{}:process.env.HISTORY_FIXTURE_EMPTY==='yes'?{data:[],nextCursor:null}:{data:[{id:'synthetic'}],nextCursor:m.params.cursor===null?'next':null};
console.log(JSON.stringify({id:m.id,result}));});`);
  await test('native index scans all pages and archived histories without account or generation RPC', async () => {
    const before = process.env.HTTPS_PROXY;
    await rebuildNativeIndex(mock, home, sqlite, { HTTPS_PROXY: 'http://fixture.invalid:3128' });
    assert.equal(process.env.HTTPS_PROXY, before);
    const calls = (await fs.readFile(ledger, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.deepEqual(calls.map(c => c.method), ['initialize', 'thread/list', 'thread/list', 'thread/list', 'thread/list']);
    assert.deepEqual(calls.slice(1).map(c => [c.params.archived,c.params.cursor]), [[false,null],[false,'next'],[true,null],[true,'next']]);
    for (const c of calls.slice(1)) { assert.equal(c.params.useStateDbOnly, false); assert.deepEqual(c.params.modelProviders, []); assert.deepEqual(c.params.sourceKinds, []); assert.equal(c.sqlite,sqlite); }
  });
  await test('native rejection hides raw subprocess output and closes the process', async () => {
    await assert.rejects(rebuildNativeIndex(mock,home,sqlite,{HISTORY_FIXTURE_FAILURE:'yes'}), e => !e.message.includes('synthetic-private-marker') && e.message.includes('索引'));
  });
  await test('empty native results are accepted only for an empty history directory',async()=>{
    await rebuildNativeIndex(mock,home,sqlite,{HISTORY_FIXTURE_EMPTY:'yes'});
    await fs.mkdir(path.join(home,'sessions'),{recursive:true});await fs.writeFile(path.join(home,'sessions','synthetic.jsonl'),'synthetic history');
    await assert.rejects(rebuildNativeIndex(mock,home,sqlite,{HISTORY_FIXTURE_EMPTY:'yes'}),/零会话/);
  });
  const runtime = path.join(root,'runtime'), storage=path.join(root,'storage','codex');
  await fs.mkdir(runtime); await fs.mkdir(path.dirname(storage));
  await fs.writeFile(path.join(runtime,'auth.json'),'synthetic-auth-retained');
  await fs.writeFile(path.join(runtime,'config.toml'),'model="fixture-model"\n');
  const a = new CodexProfiles(storage,runtime,'env-a'); await a.initialize('official');
  const identity=(await a.read()).identities[0], auth=await fs.readFile(path.join(runtime,'auth.json')), inode=(await fs.stat(path.join(runtime,'auth.json'))).ino;
  const old=path.join(a.home(identity),'sqlite'), config=path.join(runtime,'config.toml'); await fs.writeFile(path.join(old,'original.sqlite'),'retained-index');
  const makeLegacy=async()=>{await fs.writeFile(config,setTopLevelValue(await fs.readFile(config,'utf8'),'sqlite_home',old));};
  let fail=false, scans=0;
  const managed=new CodexProfiles(storage,runtime,'env-a',undefined,async(h,s)=>{assert.equal(h,runtime);assert.equal(s,a.sqliteHome(identity));scans++;if(fail)throw Error('synthetic scan failure');});
  await test('private SQLite cache differs across environments while rollout history stays shared', async () => {
    const b=new CodexProfiles(storage,path.join(root,'runtime-b'),'env-b');await b.attach(identity.id);
    assert.notEqual(a.sqliteHome(identity),b.sqliteHome(identity));
    assert.equal(await fs.realpath(path.join(runtime,'sessions')),await fs.realpath(path.join(b.runtimeHome,'sessions')));
    assert.equal((await fs.stat(a.sqliteHome(identity))).mode&0o777,0o700);
  });
  await test('legacy shared index is detected without implicit migration',async()=>{
    await makeLegacy();await managed.assertAttached();assert.equal(await managed.localIndexActive(),false);
    const before=await fs.readFile(config,'utf8');await assert.rejects(managed.refreshIndex(),/旧共享索引/);assert.equal(await fs.readFile(config,'utf8'),before);
  });
  await test('explicit index upgrade preserves auth inode, original index and unrelated settings',async()=>{
    await managed.refreshIndex(true);assert.equal(await managed.localIndexActive(),true);assert.equal(scans,1);
    assert.deepEqual(await fs.readFile(path.join(runtime,'auth.json')),auth);assert.equal((await fs.stat(path.join(runtime,'auth.json'))).ino,inode);
    assert.equal(await fs.readFile(path.join(old,'original.sqlite'),'utf8'),'retained-index');assert.match(await fs.readFile(config,'utf8'),/fixture-model/);
  });
  await test('failed native scan rolls back the upgrade without deleting history or credentials',async()=>{
    await makeLegacy();const before=await fs.readFile(config,'utf8');fail=true;
    await assert.rejects(managed.refreshIndex(true),/synthetic scan failure/);fail=false;
    assert.equal(await fs.readFile(config,'utf8'),before);assert.deepEqual(await fs.readFile(path.join(runtime,'auth.json')),auth);await managed.assertAttached();
  });
  await test('plain runtime/cache name indexes are retained and merged before linking, including repeated upgrades',async()=>{
    const shared=path.join(a.home(identity),'session_index.jsonl');
    const files=[path.join(runtime,'session_index.jsonl'),path.join(a.localHome(identity),'session_index.jsonl')];
    const rows=[{id:'runtime-name',thread_name:'Runtime newer title',updated_at:'2026-11-17T08:00:00Z'},{id:'cache-name',thread_name:'Cache title',updated_at:'2026-11-17T09:00:00Z'}];
    const texts=rows.map(row=>JSON.stringify(row)+'\n');
    for(const [i,file] of files.entries()){await fs.unlink(file);await fs.writeFile(file,texts[i],{mode:0o600});}
    await fs.writeFile(shared,JSON.stringify({id:'runtime-name',thread_name:'Old shared title',updated_at:'2026-11-16T08:00:00Z'})+'\n');
    const inodes=await Promise.all(files.map(async f=>(await fs.stat(f)).ino));
    await managed.refreshIndex(true);
    for(const [i,file] of files.entries()){
      assert.ok((await fs.lstat(file)).isSymbolicLink());assert.equal(await fs.realpath(file),await fs.realpath(shared));
      const backups=(await fs.readdir(path.dirname(file))).filter(n=>n.startsWith('session_index.jsonl.before-vscodemodelswitch-'));
      assert.equal(backups.length,1);const backup=path.join(path.dirname(file),backups[0]);assert.equal(await fs.readFile(backup,'utf8'),texts[i]);assert.equal((await fs.stat(backup)).ino,inodes[i]);assert.equal((await fs.stat(backup)).mode&0o777,0o600);
    }
    const names=(await fs.readFile(shared,'utf8')).trim().split('\n').map(JSON.parse);assert.ok(names.some(r=>r.id==='runtime-name'&&r.thread_name==='Runtime newer title'));assert.ok(names.some(r=>r.id==='cache-name'));
    const before=await fs.readFile(shared);await managed.refreshIndex(true);assert.deepEqual(await fs.readFile(shared),before);
  });
  await test('native failure restores both plain name files, their inodes/modes and the shared names',async()=>{
    const files=[path.join(runtime,'session_index.jsonl'),path.join(a.localHome(identity),'session_index.jsonl')];
    const text=JSON.stringify({id:'rollback-name',thread_name:'Keep on failure',updated_at:'2026-11-18T08:00:00Z'})+'\n';
    for(const file of files){await fs.unlink(file);await fs.writeFile(file,text,{mode:0o600});}
    const inodes=await Promise.all(files.map(async f=>(await fs.stat(f)).ino)),shared=path.join(a.home(identity),'session_index.jsonl'),before=await fs.readFile(shared);
    fail=true;try{await assert.rejects(managed.refreshIndex(true),/synthetic scan failure/);}finally{fail=false;}
    for(const [i,file] of files.entries()){assert.ok((await fs.lstat(file)).isFile());assert.equal(await fs.readFile(file,'utf8'),text);assert.equal((await fs.stat(file)).ino,inodes[i]);assert.equal((await fs.stat(file)).mode&0o777,0o600);}
    assert.deepEqual(await fs.readFile(shared),before);assert.deepEqual(await fs.readFile(path.join(runtime,'auth.json')),auth);
  });
  await test('inherited SQLite override cannot silently index a different directory',async()=>{
    const before=process.env.CODEX_SQLITE_HOME;process.env.CODEX_SQLITE_HOME=path.join(root,'external');
    try {await assert.rejects(managed.refreshIndex(true),/CODEX_SQLITE_HOME/);}finally{if(before===undefined)delete process.env.CODEX_SQLITE_HOME;else process.env.CODEX_SQLITE_HOME=before;}
  });
  console.log('RESULT: '+count+' history index checks passed');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
