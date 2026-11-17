'use strict';
// Only synthetic settings/history/auth markers. Never logs in or reads a real user home.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const original = Module._load;
async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdeck-claude-profiles-'));
  const origin = path.join(root, 'native', '.claude'), storage = path.join(root, 'data');
  await fs.mkdir(path.join(origin, 'projects', '-work'), { recursive: true }); await fs.mkdir(storage);
  await fs.writeFile(path.join(origin, 'projects', '-work', 'session.jsonl'), '{"type":"user","message":"synthetic"}\n');
  await fs.writeFile(path.join(origin, 'settings.json'), JSON.stringify({ permissions: { allow:['Read'] }, env: { KEEP:'yes' } }));
  const credential = path.join(origin, '.credentials.json');
  await fs.writeFile(credential, '{"syntheticRefresh":"v1"}');
  const secretStat = await fs.stat(credential);
  const values = { vscodemodelswitch:{ configTarget:'sandbox',testHome:path.dirname(origin) }, claudeCode:{ environmentVariables:[{name:'KEEP',value:'custom'}] }, http:{proxy:'http://shared.invalid:8000'} };
  let selection, failure, answer = true;
  const calls = [], terminalValues = new Map();
  const vscode = { env:{}, ConfigurationTarget:{Global:1}, window:{ showWarningMessage:async()=>({title:answer?'确认执行':'取消'}), showInputBox:async()=> '第二账号', showOpenDialog:async()=>[{fsPath:storage}], showQuickPick:async items=>items.find(i=>i.identity?.id===selection)||items[0] }, commands:{executeCommand:async name=>calls.push(name)}, workspace:{getConfiguration(section){ return {get:(key, fallback)=>values[section]?.[key]??fallback, inspect:key=>({globalValue:values[section]?.[key]}), async update(key,value){if(failure===section+'.'+key){failure=undefined;throw Error('synthetic setting failure');} values[section]??={};if(value===undefined)delete values[section][key];else values[section][key]=structuredClone(value);}};}}};
  Module._load = function(name,...args){return name==='vscode'?vscode:original.call(this,name,...args);};
  const { ClaudeSessionController } = require('../out/clients/claude/sessionController');
  const { ClaudeAdapter } = require('../out/clients/claude/adapter');
  const { NetworkProxyManager } = require('../out/network/manager');
  const { historyBackups } = require('../out/storage/historyBackups');
  const { ClaudeProfiles } = require('../out/clients/claude/profiles');
  const state = new Map(), secrets = new Map();
  const environment = {id:'env-a',label:'synthetic A',ready:Promise.resolve(),get:(k,d)=>state.has(k)?state.get(k):d,key:k=>'fixture.'+k,async update(k,v){if(v===undefined)state.delete(k);else state.set(k,structuredClone(v));}};
  const context = {globalStorageUri:{fsPath:path.join(root,'extension')},environmentVariableCollection:{replace:(k,v)=>terminalValues.set(k,v)},secrets:{get:async k=>secrets.get(k),store:async(k,v)=>secrets.set(k,v),delete:async k=>secrets.delete(k)}};
  let sessions, network;
  network = new NetworkProxyManager(context,environment,()=>sessions.networkHomes());
  sessions = new ClaudeSessionController(context,environment,home=>network.prepareClaudeHome(home));
  const reload = async()=>{sessions=new ClaudeSessionController(context,environment,home=>network.prepareClaudeHome(home));await sessions.ready;};
  const proxy = {url:'http://127.0.0.1:15002',noProxy:'localhost,127.0.0.1,::1',claude:true,codex:false};
  let count=0;const test=async(name,fn)=>{await fn();count++;console.log('PASS '+name);};
  await sessions.ready;await network.ready;
  await test('failed first enrollment keeps original history and credentials in place and is retryable',async()=>{
    failure='claudeCode.disableLoginPrompt';await assert.rejects(sessions.action('configure',undefined,'official'));
    assert.ok(!(await fs.lstat(path.join(origin,'projects'))).isSymbolicLink());assert.equal((await fs.stat(credential)).ino,secretStat.ino);assert.equal((await sessions.state()).root,undefined);
  });
  await test('first connection adopts the original config path, preserving native credential inode and auth bytes',async()=>{
    await sessions.action('configure',undefined,'official');const s=await sessions.state();assert.equal(s.runtimeHome,origin);assert.equal(s.attached,true);assert.equal(s.restartRequired,true);assert.equal((await fs.stat(credential)).ino,secretStat.ino);assert.equal(await fs.readFile(credential,'utf8'),'{"syntheticRefresh":"v1"}');
    assert.equal(await fs.realpath(path.join(origin,'projects')),path.join(s.root,'profiles',s.identities[0].directory,'history','projects'));assert.equal(terminalValues.get('CLAUDE_CONFIG_DIR'),'');assert.ok(!values.claudeCode.disableLoginPrompt);await reload();
  });
  const official=(await sessions.state()).activeId;
  await test('network settings preserve unrelated native settings and shared VS Code proxy',async()=>{await network.apply(proxy,'claude');const cfg=JSON.parse(await fs.readFile(path.join(origin,'settings.json')));assert.deepEqual(cfg.permissions,{allow:['Read']});assert.equal(cfg.env.KEEP,'yes');assert.equal(cfg.env.HTTPS_PROXY,proxy.url);assert.equal(values.http.proxy,'http://shared.invalid:8000');});
  let apiHome, apiId;
  await test('official to API uses another stable native home without copying OAuth or changing the proxy',async()=>{await sessions.prepareMode('api','official');let s=await sessions.state();apiHome=s.runtimeHome;apiId=s.activeId;assert.notEqual(apiHome,origin);await assert.rejects(fs.access(path.join(apiHome,'.credentials.json')));assert.equal(JSON.parse(await fs.readFile(path.join(apiHome,'settings.json'))).env.HTTPS_PROXY,proxy.url);assert.equal(values.claudeCode.disableLoginPrompt,true);await reload();});
  await test('API Apply preserves native hooks/permissions and route while never writing the official home',async()=>{
    const file=path.join(apiHome,'settings.json'), cfg=JSON.parse(await fs.readFile(file));cfg.hooks={Stop:[]};await fs.writeFile(file,JSON.stringify(cfg));
    await new ClaudeAdapter().apply({missingSecrets:[],degraded:[],claude:{providerId:'api-a',providerName:'synthetic',baseUrl:'https://api.invalid',key:'synthetic-api-key',configText:JSON.stringify({env:{ANTHROPIC_BASE_URL:'https://api.invalid'},model:'fixture-model'})}});
    const after=JSON.parse(await fs.readFile(file));assert.deepEqual(after.hooks,{Stop:[]});assert.equal(after.env.HTTPS_PROXY,proxy.url);assert.equal(after.env.ANTHROPIC_AUTH_TOKEN,'synthetic-api-key');assert.equal((await new ClaudeAdapter().readActiveConfig()).mode,'api');assert.equal(await fs.readFile(credential,'utf8'),'{"syntheticRefresh":"v1"}');
  });
  await test('API to the same official account reuses the latest native refresh instead of restoring an old snapshot',async()=>{
    await fs.writeFile(credential,'{"syntheticRefresh":"v2"}');await sessions.prepareMode('official','api');const s=await sessions.state();assert.equal(s.runtimeHome,origin);assert.equal(s.activeId,official);assert.equal(await fs.readFile(credential,'utf8'),'{"syntheticRefresh":"v2"}');assert.equal((await new ClaudeAdapter().readActiveConfig()).mode,'official');assert.equal(values.claudeCode.disableLoginPrompt,false);assert.equal(JSON.parse(await fs.readFile(path.join(origin,'settings.json'))).env.HTTPS_PROXY,proxy.url);await reload();
  });
  await test('an explicit native logout is never undone by switching away and back',async()=>{await fs.unlink(credential);await sessions.prepareMode('api','official');await reload();await sessions.prepareMode('official','api');await assert.rejects(fs.access(credential));await reload();});
  await test('adding a second account creates its own history and credentials stay in their owning home',async()=>{await sessions.action('add');const s=await sessions.state(), second=s.identities.find(i=>i.kind==='official'&&i.id!==official);await sessions.action('switch',second.id);const home=(await sessions.state()).runtimeHome;assert.notEqual(home,origin);assert.equal((await fs.readdir(path.join(home,'projects'))).length,0);await fs.writeFile(path.join(home,'.credentials.json'),'synthetic-account-two');await reload();await sessions.action('switch',official);assert.equal((await sessions.state()).runtimeHome,origin);await reload();});
  await test('all API suppliers reuse one history home and existing provider configuration',async()=>{await sessions.prepareMode('api','official');assert.equal((await sessions.state()).runtimeHome,apiHome);assert.equal((await sessions.state()).identities.filter(i=>i.kind==='api').length,1);assert.equal((await new ClaudeAdapter().readActiveConfig()).key,'synthetic-api-key');await reload();});
  await test('inherited API overrides block official selection without erasing login or exposing values',async()=>{values.claudeCode.environmentVariables.push({name:'ANTHROPIC_API_KEY',value:'synthetic-external'});await assert.rejects(sessions.prepareMode('official','api'),e=>e.message.includes('ANTHROPIC_API_KEY')&&!e.message.includes('synthetic-external'));assert.equal((await sessions.state()).activeId,apiId);values.claudeCode.environmentVariables=values.claudeCode.environmentVariables.filter(e=>e.name!=='ANTHROPIC_API_KEY');});
  await test('failed extension setting update restores prior selection and configuration',async()=>{const before=structuredClone(values.claudeCode);failure='claudeCode.disableLoginPrompt';await assert.rejects(sessions.prepareMode('official','api'));assert.deepEqual(values.claudeCode,before);assert.equal((await sessions.state()).activeId,apiId);});
  await test('canceling a switch leaves the runtime directory and mode unchanged',async()=>{answer=false;const home=(await sessions.state()).runtimeHome;await assert.rejects(sessions.prepareMode('official','api'),/已取消/);assert.equal((await sessions.state()).runtimeHome,home);answer=true;});
  await test('history backup includes Claude projects and excludes settings and all account credentials',async()=>{await sessions.action('backup');const list=await historyBackups(path.join((await sessions.state()).root,'backups'),'claude');assert.equal(list.length,1);const m=JSON.parse(await fs.readFile(path.join(list[0].directory,'manifest.json')));assert.ok(m.files.every(f=>f.file.startsWith('projects/')));await assert.rejects(fs.access(path.join(list[0].directory,'settings.json')));});
  await test('interrupted pre-commit selection restores only the owned extension settings and active binding',async()=>{
    const r=(await sessions.state()).root, p=new ClaudeProfiles(r,'env-a'),before=structuredClone(values.claudeCode.environmentVariables),after=before.map(e=>e.name==='CLAUDE_CONFIG_DIR'?{...e,value:''}:e);
    await fs.writeFile(path.join(p.environmentDirectory,'selection.pending.json'),JSON.stringify({before,after,id:official,pid:99999999,previousRoot:r,beforeLogin:true,afterLogin:false}));
    values.claudeCode.environmentVariables=after;values.claudeCode.disableLoginPrompt=false;state.set('vscodemodelswitch.claudeIdentityStorage.pending',r);
    await reload();assert.equal((await sessions.state()).activeId,apiId);assert.deepEqual(values.claudeCode.environmentVariables,before);assert.equal(values.claudeCode.disableLoginPrompt,true);assert.equal((await sessions.state()).attached,true);
  });
  await test('committed selection survives a crash before discovery-pointer cleanup',async()=>{
    const r=(await sessions.state()).root,p=new ClaudeProfiles(r,'env-a'),after=structuredClone(values.claudeCode.environmentVariables);
    await fs.writeFile(path.join(p.environmentDirectory,'selection.pending.json'),JSON.stringify({before:[],after,id:apiId,pid:99999999,previousRoot:undefined,beforeLogin:false,afterLogin:true}));state.set('vscodemodelswitch.claudeIdentityStorage.pending',r);
    await reload();assert.equal((await sessions.state()).attached,true);assert.equal((await sessions.state()).activeId,apiId);assert.equal(state.has('vscodemodelswitch.claudeIdentityStorage.pending'),false);
  });
  await test('external edits during interrupted selection retain recovery evidence and block writes until resolved',async()=>{
    const r=(await sessions.state()).root,p=new ClaudeProfiles(r,'env-a'),before=structuredClone(values.claudeCode.environmentVariables),after=before.map(e=>e.name==='CLAUDE_CONFIG_DIR'?{...e,value:''}:e),pending=path.join(p.environmentDirectory,'selection.pending.json');
    await fs.writeFile(pending,JSON.stringify({before,after,id:official,pid:99999999,previousRoot:r,beforeLogin:true,afterLogin:false}));values.claudeCode.environmentVariables=[...after,{name:'EXTERNAL',value:'synthetic'}];state.set('vscodemodelswitch.claudeIdentityStorage.pending',r);
    await reload();assert.throws(()=>sessions.assertReady(),/外部更改/);await fs.access(pending);assert.equal((await sessions.state()).attached,false);
    values.claudeCode.environmentVariables=after;await reload();assert.equal((await sessions.state()).attached,true);assert.deepEqual(values.claudeCode.environmentVariables,before);
  });
  await test('switching refuses a target account with externally changed proxy fields and preserves the API binding',async()=>{
    const file=path.join(origin,'settings.json'),before=await fs.readFile(file,'utf8'),cfg=JSON.parse(before);cfg.env.HTTPS_PROXY='http://external.invalid:9999';await fs.writeFile(file,JSON.stringify(cfg));
    await assert.rejects(sessions.prepareMode('official','api'),/代理字段/);assert.equal((await sessions.state()).activeId,apiId);assert.equal(JSON.parse(await fs.readFile(file)).env.HTTPS_PROXY,'http://external.invalid:9999');await fs.writeFile(file,before);
  });
  await test('Claude operation events are stored separately from Codex operation logs',async()=>{
    const {OperationLog}=require('../out/storage/operationLog'),{VSModelSwitchApp}=require('../out/app');const app=Object.create(VSModelSwitchApp.prototype);app.logReady=Promise.resolve();app.operationLog=new OperationLog(path.join(root,'codex-logs'),'env-a','fixture');app.claudeOperationLog=new OperationLog(path.join(root,'claude-logs'),'env-a','fixture');
    await app.recordOperation({id:'synthetic',action:'network',status:'succeeded',target:'claude:network'});assert.match(await app.claudeOperationLog.text(),/claude:network/);assert.equal(await app.operationLog.text(),'');
  });
  await test('second environment shares official history but has its own empty native login cache',async()=>{
    const p=new ClaudeProfiles((await sessions.state()).root,'env-b'), i=(await p.read()).identities.find(i=>i.id===official), binding={activeId:i.id};const home=await p.prepare(i,binding);assert.notEqual(home,origin);await assert.rejects(fs.access(path.join(home,'.credentials.json')));assert.equal(await fs.realpath(path.join(home,'projects')),await fs.realpath(path.join(origin,'projects')));assert.deepEqual(JSON.parse(await fs.readFile(path.join(home,'settings.json'))),{});
  });
  await test('a later inherited config-dir override cannot silently change the default account credential namespace',async()=>{
    const previous=process.env.CLAUDE_CONFIG_DIR;process.env.CLAUDE_CONFIG_DIR=path.join(root,'unrelated-home');try{await assert.rejects(sessions.prepareMode('official','api'),/CLAUDE_CONFIG_DIR/);assert.equal((await sessions.state()).activeId,apiId);}finally{if(previous===undefined)delete process.env.CLAUDE_CONFIG_DIR;else process.env.CLAUDE_CONFIG_DIR=previous;}
  });
  await test('foreign environment markers block activation before native authentication configuration can be read',async()=>{
    const file=path.join(apiHome,'.agentdeck-profile.json'),before=await fs.readFile(file,'utf8');await fs.writeFile(file,JSON.stringify({environmentId:'foreign',profileId:apiId}));await reload();assert.equal(sessions.recoveryBlocked,true);assert.throws(()=>sessions.assertReady(),/另一个环境/);await fs.writeFile(file,before);await reload();assert.equal(sessions.recoveryBlocked,false);
  });
  await test('a corrupt migration copy is never linked over the original native history',async()=>{
    const native=path.join(root,'copy-original'),p=new ClaudeProfiles(path.join(root,'copy-rejected'),'env-copy');await fs.mkdir(path.join(native,'projects'),{recursive:true});await fs.writeFile(path.join(native,'projects','session.jsonl'),'original');await p.createLayout(native);const identity=await p.add('copy','official'),binding={activeId:identity.id,adopted:{id:identity.id,home:native,implicit:true}};
    const copy=fs.cp;fs.cp=async(...args)=>{await copy(...args);await fs.writeFile(path.join(args[1],'session.jsonl'),'corrupt');};try{await assert.rejects(p.prepare(identity,binding,true,true),/校验失败/);}finally{fs.cp=copy;}
    assert.equal(await fs.readFile(path.join(native,'projects','session.jsonl'),'utf8'),'original');assert.equal((await fs.lstat(path.join(native,'projects'))).isSymbolicLink(),false);assert.equal(await p.binding(),undefined);
  });
  await test('restoring network settings restores every prepared local profile and retains API auth configuration',async()=>{await network.restore('claude');assert.equal(JSON.parse(await fs.readFile(path.join(apiHome,'settings.json'))).env.HTTPS_PROXY,undefined);assert.equal(JSON.parse(await fs.readFile(path.join(apiHome,'settings.json'))).env.ANTHROPIC_AUTH_TOKEN,'synthetic-api-key');assert.equal(JSON.parse(await fs.readFile(path.join(origin,'settings.json'))).env.HTTPS_PROXY,undefined);assert.equal(values.http.proxy,'http://shared.invalid:8000');});
  await test('project selection is explicit, requires reload and changes neither profile IDs nor auth/network settings',async()=>{
    const workspace=path.join(root,'host-workspace'), source=path.join(root,'container-workspace');await fs.mkdir(workspace);await fs.mkdir(source);
    vscode.workspace.workspaceFolders=[{name:'host',uri:{scheme:'file',fsPath:workspace}}];
    const {claudeProjectSlug}=require('../out/clients/claude/projectHistory');const history=path.join((await sessions.state()).root,'profiles','home-'+apiId,'history','projects'), slug=claudeProjectSlug(source);await fs.mkdir(path.join(history,slug));await fs.writeFile(path.join(history,slug,'11111111-1111-4111-8111-111111111111.jsonl'),JSON.stringify({cwd:source,type:'user',message:'synthetic'})+'\n');
    const before=JSON.stringify(values), registry=await fs.readFile(path.join((await sessions.state()).root,'profiles.json'));
    answer=false;await assert.rejects(sessions.setHistoryProject(workspace,slug),/已取消/);await assert.rejects(fs.lstat(path.join(history,claudeProjectSlug(workspace))),{code:'ENOENT'});answer=true;
    await sessions.setHistoryProject(workspace,slug);assert.equal((await sessions.state()).restartRequired,true);assert.throws(()=>sessions.assertReady(),/重载/);assert.equal((await sessions.state()).nativeHistory.project,slug);
    assert.equal(JSON.stringify(values),before);assert.deepEqual(await fs.readFile(path.join((await sessions.state()).root,'profiles.json')),registry);await reload();assert.equal((await sessions.state()).nativeHistory.owned,true);
    await sessions.setHistoryProject(workspace);assert.equal((await sessions.state()).restartRequired,true);await reload();assert.equal((await sessions.state()).nativeHistory.project,undefined);assert.ok(await fs.stat(path.join(history,slug,'11111111-1111-4111-8111-111111111111.jsonl')));
  });
  await test('both clients dispatch native history and Codex project selection first upgrades a legacy index',async()=>{
    const {VSModelSwitchApp}=require('../out/app'),app=Object.create(VSModelSwitchApp.prototype),routed=[];
    const state={root:'/synthetic',activeId:'profile',attached:true,identities:[{id:'profile',directory:'home-profile'}],nativeHistory:{index:'ready'}};
    app.environment={get:()=>undefined};app.sessionController={assertReady(){},state:async()=>state};app.claudeSessions={assertReady(){},state:async()=>state};
    const execute=vscode.commands.executeCommand;vscode.commands.executeCommand=async name=>routed.push(name);vscode.commands.getCommands=async()=>['chatgpt.openSidebar','claude-vscode.sidebar.open'];
    try{await app.sessionActionFromSidebar('openNativeHistory',undefined,undefined,'codex');await app.sessionActionFromSidebar('openNativeHistory',undefined,undefined,'claude');assert.deepEqual(routed,['chatgpt.openSidebar','claude-vscode.sidebar.open']);vscode.commands.getCommands=async()=>[];await assert.rejects(app.sessionActionFromSidebar('openNativeHistory',undefined,undefined,'claude'),/官方扩展/);
    state.nativeHistory.index='legacy';app.sessionController.action=async a=>routed.push(a);app.reloadNotices={add:async()=>{}};app.refreshStatus=()=>{};await app.sessionActionFromSidebar('selectHistoryProject',undefined,undefined,'codex');assert.equal(routed.at(-1),'refreshHistory');}finally{vscode.commands.executeCommand=execute;delete vscode.commands.getCommands;}
  });
  assert.ok(calls.every(name=>name==='workbench.action.reloadWindow'));network.dispose();
  console.log('RESULT: '+count+' Claude profile/network/auth-lifecycle checks passed');console.log('RETAINED_SANDBOX: '+root);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
