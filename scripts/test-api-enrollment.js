'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const original = Module._load;
let home, folder, choice, accept=true, options, preparations=0;
const vscode = { window: {
  showOpenDialog: async()=>[{fsPath:folder}], showQuickPick:async items=>{options=items;return choice(items);},
  showWarningMessage:async(_text,_opts,...items)=>accept?items[0]:items.at(-1)
}, workspace:{getConfiguration:()=>({get:(_key,fallback)=>fallback})} };
Module._load=function(name,...args){if(name==='vscode')return vscode;if(name==='../../../utils/paths')return{getToolHome:()=>home};return original.call(this,name,...args);};
const {CodexProfiles}=require('../out/clients/codex/history/codexProfiles');
const {SessionController}=require('../out/clients/codex/history/controller');
(async()=>{
  const temp=await fs.mkdtemp(path.join(process.env.VSCODEMODELSWITCH_TEST_HOME||os.tmpdir(),'api-enrollment-'));
  folder=path.join(temp,'shared');await fs.mkdir(folder);const root=path.join(folder,'codex');
  const officialHome=path.join(temp,'official-home');await fs.mkdir(officialHome);await fs.writeFile(path.join(officialHome,'auth.json'),'synthetic-official-auth');
  const official=new CodexProfiles(root,officialHome,'official-env');await official.initialize('official');const officialId=(await official.read()).activeId;
  home=path.join(temp,'api-home');await fs.mkdir(path.join(home,'sessions'),{recursive:true});
  await fs.writeFile(path.join(home,'config.toml'),'model_provider = "OpenAI"\nmodel = "keep-api-model"\n');
  await fs.writeFile(path.join(home,'auth.json'),'synthetic-api-auth');await fs.writeFile(path.join(home,'sessions/api-old.jsonl'),'synthetic-api-history');
  const globalState={get:(_k,fallback)=>fallback}, env=()=>{const values=new Map();return {id:'api-env',label:'synthetic',ready:Promise.resolve(),get:(k,fallback)=>values.has(k)?values.get(k):fallback,update:async(k,v)=>{if(v===undefined)values.delete(k);else values.set(k,v);}};};
  let count=0;const test=async(name,fn)=>{await fn();count++;console.log('PASS '+name);};
  choice=items=>items.find(i=>i.createApi);let environment=env(), controller=new SessionController({globalState},environment,async selected=>{preparations++;await fs.mkdir(path.join(selected,'environments/api-env/logs'),{recursive:true,mode:0o700});return async()=>{};});
  await test('API setup with only official profiles can be cancelled without creating a profile or moving logs',async()=>{
    accept=false;await assert.rejects(controller.action('configure',undefined,undefined,'api'),/已取消/);assert.equal(preparations,0);assert.equal((await official.read()).identities.length,1);assert.equal(options.length,1);assert.ok(options[0].createApi);accept=true;
  });
  await test('API setup offers explicit API enrollment, preserves official profiles and keeps the current API configuration',async()=>{
    await controller.action('configure',undefined,undefined,'api');assert.equal(preparations,1);const state=await controller.state();assert.ok(state.attached);assert.ok(state.restartRequired);
    assert.equal(state.identities.length,2);assert.equal(state.identities.find(i=>i.id===state.activeId).kind,'api');assert.equal((await official.read()).activeId,officialId);
    assert.equal(await fs.readFile(path.join(home,'auth.json'),'utf8'),'synthetic-api-auth');assert.match(await fs.readFile(path.join(home,'config.toml'),'utf8'),/keep-api-model/);
    assert.equal(await fs.readFile(path.join(home,'sessions/api-old.jsonl'),'utf8'),'synthetic-api-history');assert.equal(await fs.readFile(path.join(officialHome,'auth.json'),'utf8'),'synthetic-official-auth');
  });
  const apiId=(await controller.state()).activeId;
  await test('reconnecting from API mode lists the singleton API profile without offering official bindings or merging local chats',async()=>{
    home=path.join(temp,'another-api-home');await fs.mkdir(path.join(home,'sessions'),{recursive:true});await fs.writeFile(path.join(home,'sessions/not-merged.jsonl'),'synthetic-local-only');
    environment=env();environment.id='another-api-env';choice=items=>items[0];controller=new SessionController({globalState},environment);
    await controller.action('configure',undefined,undefined,'api');assert.equal(options.length,1);assert.equal(options[0].identity.kind,'api');assert.equal((await controller.state()).activeId,apiId);
    await assert.rejects(fs.stat(path.join(home,'sessions/not-merged.jsonl')),{code:'ENOENT'});assert.equal((await official.read()).identities.length,2);
  });
  await test('a competing API enrollment cannot seed or overwrite the existing shared API library',async()=>{
    const p=new CodexProfiles(root,path.join(temp,'unused-api-home'),'new-env');await assert.rejects(p.initialize('api',true),/已有账号档案/);await assert.rejects(p.add('racing API','api',true),/API 档案已存在/);
    assert.equal((await official.read()).identities.length,2);const api=(await official.read()).identities.find(i=>i.kind==='api');assert.equal(await fs.readFile(path.join(official.home(api),'sessions/api-old.jsonl'),'utf8'),'synthetic-api-history');
  });
  console.log('RESULT: '+count+' API enrollment checks passed');console.log('RETAINED_FIXTURE: '+temp);
})().finally(()=>{Module._load=original;}).catch(e=>{console.error(e);process.exitCode=1;});
