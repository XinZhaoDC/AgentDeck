'use strict';
// Actual bundled Claude 2.1.323 readers, exported in memory without activation.
// All projects/messages are synthetic. No native login or generation is run.
const assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),Module=require('node:module'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const file=process.env.VSCODEMODELSWITCH_NATIVE_CLAUDE;
if(!file){console.log('SKIP: set VSCODEMODELSWITCH_NATIVE_CLAUDE to the installed extension.js');process.exit(0);}
async function reader(){
 const noop=()=>({dispose(){}}),stub=new Proxy(function(){return stub;},{get(_t,p){if(p==='then')return undefined;if(p==='prototype')return {};return stub;},construct(){return stub;}});
 const vscode=new Proxy({env:{},workspace:{getConfiguration:()=>({get:(_k,d)=>d}),workspaceFolders:[],onDidChangeConfiguration:noop},window:{},commands:{}},{get:(t,p)=>t[p]??stub});
 for(const k of ['NotebookCellOutputItem','NotebookCellData','NotebookData','Disposable','EventEmitter','CancellationTokenSource','Uri','Range','Position','Selection','WorkspaceEdit','Diagnostic','DiagnosticSeverity','FileType','ExtensionMode','UIKind','MarkdownString','SnippetString','RelativePattern','EndOfLine','TextEdit','ThemeIcon','ThemeColor','StatusBarAlignment','LogLevel'])vscode[k]=stub;
 const load=Module._load;Module._load=function(n,...a){return n==='vscode'?vscode:load.call(this,n,...a);};
 for(const name of ['node:http','node:https']){require(name).request=()=>{throw Error('Network forbidden');};require(name).get=()=>{throw Error('Network forbidden');};}global.fetch=()=>{throw Error('Network forbidden');};
 for(const name of ['spawn','exec','execFile','fork','spawnSync','execSync','execFileSync'])require('node:child_process')[name]=()=>{throw Error('Native child process forbidden');};
 const source=fs.readFileSync(file,'utf8'),mod=new Module(file,module);mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file));
 mod._compile(source+'\nmodule.exports.__historyFixture={list:q3e,info:V3e,store:Hn,slug:lS,messages:s0e};\n',file);
 const sdk=mod.exports.__historyFixture,[cwd,id,expected]=process.argv.slice(3),projects=path.join(process.env.CLAUDE_CONFIG_DIR,'projects');
 const {claudeProjectSlug}=require('../out/clients/claude/projectHistory');for(const p of [cwd,'/'+('项目α'.repeat(90))])assert.equal(claudeProjectSlug(p),sdk.slug(p));
 const list=await sdk.list({dir:cwd,includeWorktrees:false,includeProgrammatic:true},undefined,projects);
 if(expected==='absent'){assert.ok(!list.some(s=>s.sessionId===id));return;}
 assert.ok(list.some(s=>s.sessionId===id));const info=await sdk.info(id,{dir:cwd});assert.equal(info.sessionId,id);
 const store=await sdk.store.load(cwd,{log(){},warn(){},error(){}});assert.equal(await store.ensureSessionLoaded(id),true);assert.equal(store.messages.size,2);const frames=await store.readSessionForHost(id,(session,opts)=>sdk.messages(session,opts,undefined,projects));assert.ok(frames.length>0);
}
async function main(){
 const {claudeProjectSlug}=require('../out/clients/claude/projectHistory');const {ClaudeHistoryScope}=require('../out/clients/claude/historyScope');
 const root=await fsp.mkdtemp(path.join(process.env.VSCODEMODELSWITCH_TEST_HOME||os.tmpdir(),'native-claude-project-'));
 console.log('RETAINED_FIXTURE: '+root);console.log('NATIVE_READER_SHA256: '+crypto.createHash('sha256').update(await fsp.readFile(file)).digest('hex'));
 const home=path.join(root,'isolated-home');await fsp.mkdir(home);
 let count=0;const test=async(name,fn)=>{await fn();count++;console.log('PASS '+name);};
 const run=(history,cwd,id,expected)=>execFileSync(process.execPath,[__filename,'--reader',cwd,id,expected],{env:{PATH:process.env.PATH,LANG:'C.UTF-8',HOME:home,USERPROFILE:home,XDG_CONFIG_HOME:home,CLAUDE_CONFIG_DIR:history,VSCODEMODELSWITCH_NATIVE_CLAUDE:file},timeout:45000,stdio:'pipe'});
 for(const kind of ['official','api']){
   const history=path.join(root,'data',kind,'profiles','home-fixture','history'),projects=path.join(history,'projects'),source=path.join(root,kind+'-container-project'),host=path.join(root,kind+'-host-project');
   for(const dir of [projects,source,host])await fsp.mkdir(dir,{recursive:true});const slug=claudeProjectSlug(source),folder=path.join(projects,slug),id=crypto.randomUUID();await fsp.mkdir(folder);
   const user=crypto.randomUUID(),rows=[{parentUuid:null,isSidechain:false,type:'user',uuid:user,sessionId:id,cwd:source,timestamp:new Date().toISOString(),message:{role:'user',content:'Synthetic history'}},{parentUuid:user,isSidechain:false,type:'assistant',uuid:crypto.randomUUID(),sessionId:id,cwd:source,timestamp:new Date().toISOString(),message:{role:'assistant',content:[{type:'text',text:'Synthetic reply'}]}}];await fsp.writeFile(path.join(folder,id+'.jsonl'),rows.map(JSON.stringify).join('\n')+'\n');
   const manager=new ClaudeHistoryScope(history,'env-host');
   await test(kind+' native reader defaults to current project and does not list another project',()=>run(history,host,id,'absent'));
   await test(kind+' browse scope makes the actual native SDK list, locate and parse both messages',async()=>{await manager.apply(host,slug);run(history,host,id,'present');});
   await test(kind+' hard-link browse entries work from another mount after the original data path becomes unavailable',async()=>{
     const copy=path.join(root,kind+'-second-mount');await fsp.cp(history,copy,{recursive:true,verbatimSymlinks:true});await fsp.rename(history,history+'.offline');try{run(copy,host,id,'present');}finally{await fsp.rename(history+'.offline',history);}
   });
   await test(kind+' browsing keeps new conversations in the native current-project directory',async()=>{const target=path.join(projects,claudeProjectSlug(host));assert.ok((await fsp.lstat(target)).isDirectory());const fresh=crypto.randomUUID()+'.jsonl';await fsp.writeFile(path.join(target,fresh),'synthetic new chat');await assert.rejects(fsp.stat(path.join(folder,fresh)),{code:'ENOENT'});});
   await test(kind+' removal restores native default scope without removing the source conversation',async()=>{await manager.clear(host);run(history,host,id,'absent');run(history,source,id,'present');});
 }
 console.log(count+' actual Claude native reader checks passed');
}
(process.argv[2]==='--reader'?reader():main()).catch(e=>{console.error(e.stack);if(e.stderr)console.error(String(e.stderr));process.exitCode=1;});
