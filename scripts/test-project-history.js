'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { ClaudeProjectHistory, claudeProjectSlug } = require('../out/clients/claude/projectHistory');
const { FileRecovery } = require('../out/config/recovery');
async function main() {
  const root = await fs.mkdtemp(path.join(process.env.VSCODEMODELSWITCH_TEST_HOME || os.tmpdir(),'project-history-'));
  console.log('RETAINED_FIXTURE: '+root);
  const history=path.join(root,'data','profiles','home-fixture','history'), projects=path.join(history,'projects');
  const source=path.join(root,'container-project'), host=path.join(root,'host-project'), other=path.join(root,'other-project');
  for(const dir of [projects,source,host,other]) await fs.mkdir(dir,{recursive:true});
  const slug=claudeProjectSlug(source), second=claudeProjectSlug(other), id=randomUUID();
  for(const dir of [slug,second]) { await fs.mkdir(path.join(projects,dir));await fs.writeFile(path.join(projects,dir,id+'.jsonl'),JSON.stringify({type:'user',cwd:dir===slug?source:other,message:'synthetic-only'})+'\n'); }
  const manager=new ClaudeProjectHistory(history,'env-host','Host'), foreign=new ClaudeProjectHistory(history,'env-other','Other');
  const before=await fs.readFile(path.join(projects,slug,id+'.jsonl'));
  let count=0;const test=async(name,fn)=>{await fn();count++;console.log('PASS '+name);};
  await test('lists canonical projects by metadata, skips subagents and links, and marks unknown environments honestly',async()=>{
    await fs.mkdir(path.join(projects,slug,'subagents'));await fs.writeFile(path.join(projects,slug,'subagents','agent.jsonl'),'{}');
    await fs.symlink(slug,path.join(projects,'unowned-alias'));
    const list=await manager.list();assert.equal(list.length,2);assert.ok(list.every(p=>p.sessions===1&&!p.environments.length));assert.equal(list.find(p=>p.id===slug).directory,source);
  });
  await test('explicit mapping uses a relative directory link and owns only this environment workspace',async()=>{
    assert.equal(await manager.apply(host,slug),true);const target=path.join(projects,claudeProjectSlug(host));
    assert.equal(await fs.readlink(target),slug);assert.equal(await fs.realpath(target),path.join(projects,slug));
    assert.deepEqual(await manager.current(host),{project:slug,owned:true});assert.equal((await foreign.current(host)).owned,false);
    assert.deepEqual((await manager.list()).find(p=>p.id===slug).environments,['Host']);
  });
  await test('native writes through the mapping remain in the selected canonical project',async()=>{
    await fs.writeFile(path.join(projects,claudeProjectSlug(host),'native-new.jsonl'),'synthetic native write');assert.equal(await fs.readFile(path.join(projects,slug,'native-new.jsonl'),'utf8'),'synthetic native write');assert.deepEqual(await fs.readFile(path.join(projects,slug,id+'.jsonl')),before);
  });
  await test('a copied mount keeps the relative alias usable without its original absolute data root',async()=>{
    const copy=path.join(root,'second-mount');await fs.cp(path.join(root,'data'),copy,{recursive:true,verbatimSymlinks:true});
    const copied=path.join(copy,'profiles','home-fixture','history','projects',claudeProjectSlug(host));assert.equal(await fs.readlink(copied),slug);assert.equal(await fs.realpath(copied),path.join(path.dirname(copied),slug));
  });
  await test('other environments cannot retarget or clear an owned alias',async()=>{
    await assert.rejects(foreign.apply(host,second),/不会|保留|原内容/);await assert.rejects(foreign.clear(host),/本环境/);assert.equal((await manager.current(host)).project,slug);
  });
  await test('retargeting an owned alias preserves both original project trees',async()=>{
    await manager.apply(host,second);assert.equal((await manager.current(host)).project,second);assert.deepEqual(await fs.readFile(path.join(projects,slug,id+'.jsonl')),before);await manager.apply(host,slug);
  });
  await test('a registry write failure rolls back an alias retarget and its ownership record',async()=>{
    const write=fs.writeFile,registry=path.join(path.dirname(history),'project-mappings.json');fs.writeFile=async(file,...args)=>{if(String(file).startsWith(registry+'.modelswitch-'))throw Error('injected registry failure');return write(file,...args);};
    try { await assert.rejects(manager.apply(host,second),/已恢复/); } finally {fs.writeFile=write;}
    assert.equal((await manager.current(host)).project,slug);assert.equal(await fs.readlink(path.join(projects,claudeProjectSlug(host))),slug);
  });
  await test('existing current-project histories and foreign aliases are never overwritten or merged',async()=>{
    const current=path.join(projects,claudeProjectSlug(other));const inode=(await fs.stat(current)).ino;
    await assert.rejects(manager.apply(other,slug),/原内容保留/);assert.equal((await fs.stat(current)).ino,inode);
    await assert.rejects(manager.apply(host,'unowned-alias'),/原始历史项目/);await assert.rejects(manager.apply(host,'../escape'),/无效/);
  });
  await test('an external link change blocks cleanup and preserves the foreign target',async()=>{
    const target=path.join(projects,claudeProjectSlug(host));await fs.unlink(target);await fs.symlink(second,target);
    await assert.rejects(manager.clear(host),/变化/);await assert.rejects(manager.current(host),/不一致/);assert.equal(await fs.readlink(target),second);await fs.unlink(target);await fs.symlink(slug,target);
  });
  await test('failure after removing a link restores it and relative-link rollback preserves all chat files',async()=>{
    const target=path.join(projects,claudeProjectSlug(host)), recovery=path.join(root,'rollback');
    await assert.rejects(FileRecovery.run(recovery,async tx=>{await tx.removeLink(target,path.join(projects,slug));throw Error('injected failure');}),/已恢复/);
    assert.equal(await fs.readlink(target),slug);assert.deepEqual(await fs.readFile(path.join(target,id+'.jsonl')),before);
    const absent=path.join(projects,'new-alias');await assert.rejects(FileRecovery.run(recovery,async tx=>{await tx.link(absent,path.join(projects,slug),'dir',{relative:true,expectedTarget:null});throw Error('injected failure');}),/已恢复/);await assert.rejects(fs.lstat(absent),{code:'ENOENT'});
  });
  await test('clearing a mapping only removes its alias and record, preserving source and API/official profile layout',async()=>{
    await manager.clear(host);assert.deepEqual(await manager.current(host),{owned:false});await assert.rejects(fs.lstat(path.join(projects,claudeProjectSlug(host))),{code:'ENOENT'});assert.deepEqual(await fs.readFile(path.join(projects,slug,id+'.jsonl')),before);
    assert.equal(await manager.apply(source,slug),false);
  });
  await test('recovery from another mount stops before touching paths from the original environment',async()=>{
    const journal=path.join(root,'foreign-recovery'),canary=path.join(root,'foreign-canary');await fs.mkdir(journal);await fs.writeFile(canary,'retained');
    await fs.writeFile(path.join(journal,'journal.json'),JSON.stringify({version:1,pid:2147483647,phase:'committed',changes:[{target:canary,before:{kind:'link',target:'foreign'},after:{kind:'absent'},retained:canary}]}));
    let entered=false;await assert.rejects(FileRecovery.run(journal,async()=>{entered=true;},path.dirname(history)),/另一挂载路径/);assert.equal(entered,false);assert.equal(await fs.readFile(canary,'utf8'),'retained');assert.ok(await fs.stat(path.join(journal,'journal.json')));
  });
  await test('long Unicode project slugs follow the native 200-character plus signed hash convention',()=>{
    const p='/'+('项目α'.repeat(90));let hash=0;for(let i=0;i<p.length;i++)hash=(hash*31+p.charCodeAt(i))|0;
    assert.equal(claudeProjectSlug(p),p.replace(/[^a-zA-Z0-9]/g,'-').slice(0,200)+'-'+Math.abs(hash).toString(36));
  });
  console.log(count+' project mapping checks passed');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
