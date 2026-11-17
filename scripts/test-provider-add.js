'use strict';
const assert=require('node:assert/strict'),Module=require('node:module');
const original=Module._load;Module._load=function(name,...args){return name==='vscode'?{env:{language:'zh-CN'}}:original.call(this,name,...args);};
const {SidebarViewProvider}=require('../out/ui/sidebarView'),{sidebarFixture}=require('./sidebar-fixture');
const {CodexClientController}=require('../out/clients/codex/controller'),{ClaudeClientController}=require('../out/clients/claude/controller');
const sessions={root:'/synthetic/data',runtimeHome:'/synthetic/runtime',environmentId:'fixture',activeId:'api',attached:true,identities:[{id:'api',kind:'api',name:'API'}]};
const state={providers:[],currentProviderIds:{},apiStatuses:[],codexMode:'api',claudeMode:'api',sessions,claudeSessions:sessions,toolEnabled:{codex:true,claude:true},storageSizes:{},configPaths:{},globalCliSync:true};
const html=new SidebarViewProvider({},{}).getHtml();
const setup=(saved={})=>{
 const ui=sidebarFixture(html,saved),e=id=>ui.elements.get(id);
 const finish=(next=state)=>{ui.fire({type:'state',state:next});ui.fire({type:'busy',busy:false});};finish();
 const page=tool=>{e(tool+'PageTab').listeners.click();finish();};
 const fill=(name,key)=>{e('providerName').value=name;e('apiKey').value=key;e('baseUrl').value='https://fixture.invalid/v1';e('modelSelect').value='fixture-model';};
 const submit=()=>{e('providerForm').listeners.submit({preventDefault(){}});return ui.messages.at(-1);};
 const names=()=>e('providerNameSuggestions').children.map(n=>n.value);
 return{ui,e,finish,page,fill,submit,names};
};
async function main(){
 let count=0;const test=async(name,fn)=>{await fn();count++;console.log('PASS '+name);};
 for(const tool of ['codex','claude']){
  await test(tool+' clears name/key only after successful creation and remembers the name without credentials',async()=>{
   const {ui,e,finish,page,fill,submit,names}=setup();page(tool);fill('启源星','synthetic-secret-'+tool);const request=submit();
   assert.equal(e('providerName').value,'启源星');assert.equal(e('apiKey').value,'synthetic-secret-'+tool);
   const replies=[],Controller=tool==='codex'?CodexClientController:ClaudeClientController;
   const controller=new Controller({createProviderFromSidebar:async p=>{assert.equal(p.tool,tool);}},async m=>replies.push(m));await controller.handle(request);
   assert.deepEqual(replies,[{type:'providerCreated',tool,name:'启源星'}]);ui.fire(replies[0]);finish();
   assert.equal(e('providerName').value,'');assert.equal(e('apiKey').value,'');assert.equal(e('baseUrl').value,'https://fixture.invalid/v1');assert.equal(e('modelSelect').value,'fixture-model');assert.ok(names().includes('启源星'));
   e('providerName').value='启';assert.equal(e('providerName').list,'providerNameSuggestions');assert.equal(e('providerName').autocomplete,'on');assert.ok(names().filter(n=>n.startsWith(e('providerName').value)).includes('启源星'));
   assert.deepEqual(Array.from(ui.viewState.providerNameHistoryByTool[tool]),['启源星']);assert.ok(!JSON.stringify(ui.viewState).includes('synthetic-secret'));
   e('providerName').value='';page(tool==='codex'?'claude':'codex');page(tool);assert.equal(e('providerName').value,'');assert.equal(e('apiKey').value,'');
  });
  await test(tool+' creation failure preserves fields and produces no history or successful acknowledgment',async()=>{
   const {ui,e,finish,page,fill,submit,names}=setup();page(tool);fill('未保存名字','synthetic-retained');const request=submit(),replies=[];
   const Controller=tool==='codex'?CodexClientController:ClaudeClientController;const controller=new Controller({createProviderFromSidebar:async()=>{throw Error('injected save failure');}},async m=>replies.push(m));
   await assert.rejects(controller.handle(request),/injected/);assert.equal(replies.length,0);ui.fire({type:'error',action:'createProvider',message:'injected save failure'});finish();
   assert.equal(e('providerName').value,'未保存名字');assert.equal(e('apiKey').value,'synthetic-retained');assert.ok(!names().includes('未保存名字'));assert.equal(ui.viewState.providerNameHistoryByTool,undefined);
  });
  await test(tool+' complete-config creation clears inline credentials and cached drafts without persisting text',()=>{
   const {ui,e,finish,page,fill,submit}=setup();page(tool);fill('完整配置','');e('addMode').value='text';e('addMode').listeners.change();
   const config=tool==='codex'?'model = "fixture"\n[model_providers.OpenAI]\nbase_url = "https://fixture.invalid"\nexperimental_bearer_token = "synthetic-inline-key"':JSON.stringify({env:{ANTHROPIC_BASE_URL:'https://fixture.invalid',ANTHROPIC_AUTH_TOKEN:'synthetic-inline-key'}});
   e('addConfigText').value=config;submit();ui.fire({type:'providerCreated',tool,name:'完整配置'});finish();
   assert.equal(e('providerName').value,'');assert.ok(!e('addConfigText').value.includes('synthetic-inline-key'));page(tool==='codex'?'claude':'codex');page(tool);
   assert.ok(!e('addConfigText').value.includes('synthetic-inline-key'));assert.ok(!JSON.stringify(ui.viewState).includes('synthetic-inline-key'));
  });
 }
 await test('persisted suggestions survive webview restoration and remain separate for each client',()=>{
  const first=setup();first.ui.fire({type:'providerCreated',tool:'codex',name:'启源星'});first.ui.fire({type:'providerCreated',tool:'claude',name:'云端'});
  const restored=setup(first.ui.viewState);restored.page('codex');assert.deepEqual(restored.names(),['启源星']);restored.page('claude');assert.deepEqual(restored.names(),['云端']);
 });
 await test('a completion for the other client clears only that cached draft and preserves the visible form',()=>{
  const {ui,e,finish,page,fill,names}=setup();page('codex');fill('启源星','synthetic-codex');page('claude');fill('Claude草稿','synthetic-claude');
  ui.fire({type:'providerCreated',tool:'codex',name:'启源星'});finish();assert.equal(e('providerName').value,'Claude草稿');assert.equal(e('apiKey').value,'synthetic-claude');assert.ok(!names().includes('启源星'));
  page('codex');assert.equal(e('providerName').value,'');assert.equal(e('apiKey').value,'');assert.ok(names().includes('启源星'));page('claude');assert.equal(e('apiKey').value,'synthetic-claude');
 });
 await test('existing API names seed suggestions and normalized history names are deduplicated',()=>{
  const {ui,names,finish}=setup();finish({...state,providers:[{id:'one',tool:'codex',name:'已有名称',codexMode:'api',hasKey:true,modelPolicy:{type:'toolDefault'},proxy:{mode:'direct',preset:'standard'}},{id:'other',tool:'claude',name:'另一客户端',hasKey:true,modelPolicy:{type:'toolDefault'},proxy:{mode:'direct',preset:'standard'}}]});assert.ok(names().includes('已有名称'));assert.ok(!names().includes('另一客户端'));
  for(const name of ['Service',' service ','Ｓｅｒｖｉｃｅ'])ui.fire({type:'providerCreated',tool:'codex',name});
  assert.equal(ui.viewState.providerNameHistoryByTool.codex.length,1);
 });
 console.log('RESULT: '+count+' provider creation/autocomplete checks passed');
}
main().finally(()=>{Module._load=original;}).catch(error=>{console.error(error);process.exitCode=1;});
