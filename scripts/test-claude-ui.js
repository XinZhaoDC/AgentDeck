'use strict';
const assert=require('node:assert/strict'),Module=require('node:module');
const original=Module._load;Module._load=function(name,...args){return name==='vscode'?{env:{language:'en'}}:original.call(this,name,...args);};
const {SidebarViewProvider}=require('../out/ui/sidebarView'),{sidebarFixture}=require('./sidebar-fixture');
const org=(name,format)=>({version:1,groups:[{id:'independent',name:'独立供应商'},{id:'site',name,defaults:{baseUrl:'https://'+format+'.invalid',proxy:{mode:'direct',preset:'custom',apiFormat:format}}}],templates:[{id:'t',name,proxy:{mode:'proxy',preset:'custom',apiFormat:format},usageQuery:{enabled:true,preset:'newapi',url:'{{baseUrl}}/api/user/self',remainingPath:'data.quota',unit:'USD',divisor:500000}}],memberships:{},providerOrder:[],disabledGroups:[],disabledProviders:[]});
const api=(tool,id)=>({id,name:tool+'-'+id,tool,codexMode:tool==='codex'?'api':undefined,groupId:'site',hasKey:true,baseUrl:'https://'+tool+'.invalid',modelPolicy:{type:'fixed',model:'fixture-'+tool},usageEnabled:false,proxy:{mode:'direct',preset:'custom',apiFormat:tool==='claude'?'anthropic':'responses'}});
const sessions=(tool)=>({root:'/synthetic/'+tool,runtimeHome:'/synthetic/'+tool+'/runtime',runtimeConfigDir:tool==='claude'?'/synthetic/claude/runtime':undefined,environmentId:'env',environment:'Synthetic',activeId:tool+'-api',attached:true,identities:[{id:tool+'-api',name:'API',kind:'api'},{id:tool+'-official',name:tool+' official',kind:'official'}]});
const base={providers:[api('claude','a'),api('claude','b'),api('codex','x')],claudeMode:'api',codexMode:'api',claudeSessions:sessions('claude'),sessions:sessions('codex'),claudeOrganization:org('Claude group','anthropic'),codexOrganization:org('Codex group','responses'),currentProviderIds:{claude:'a',codex:'x'},toolEnabled:{claude:true,codex:true},configPaths:{claude:'/synthetic/claude/settings.json',codex:'/synthetic/codex/config.toml'},globalCliSync:true,apiStatuses:[{tool:'claude',mode:'api',status:'ready'},{tool:'codex',mode:'api',status:'ready'}],storageSizes:{},logDirectory:'/codex/log',logDirectories:{codex:'/codex/log',claude:'/claude/log'},networkProxy:{tools:{claude:{managed:true,config:{url:'http://127.0.0.1:15002',noProxy:'localhost'}},codex:{managed:true,config:{url:'http://127.0.0.1:15001',noProxy:'localhost'}}}}};
async function main(){
 const html=new SidebarViewProvider({},{}).getHtml(),ui=sidebarFixture(html,{activeTool:'claude'}),e=id=>ui.elements.get(id);
 let current=base,count=0;const finish=(changes={})=>{current={...base,...changes};ui.fire({type:'state',state:current});ui.fire({type:'busy',busy:false});};
 const card=id=>e('codexProviders').querySelectorAll('[data-provider-id]').find(n=>n.dataset.providerId===id),group=id=>e('codexProviders').querySelectorAll('[data-group-id]').find(n=>n.dataset.groupId===id),button=(node,text)=>node.querySelectorAll('button').find(n=>n.textContent===text),click=(node,text)=>{const b=button(node,text);assert.ok(b&&!b.disabled,text);b.listeners.click();};
 const test=async(name,fn)=>{await fn();count++;console.log('PASS '+name);};finish();
 await test('Claude opens the same four modules with its own current route, config path and log directory',()=>{assert.equal(e('overviewTitle').hidden,false);assert.equal(e('codexDataSection').hidden,false);assert.equal(e('sessionPanel').hidden,false);assert.match(e('codexOverviewFacts').textContent,/15002/);assert.doesNotMatch(e('codexOverviewFacts').textContent,/15001|config.toml/);assert.equal(e('operationLogPath').textContent,'当前日志目录：/claude/log');assert.equal(e('tool').value,'claude');assert.equal(e('codexExperimentalNetworkNote').hidden,true);});
 await test('Claude provider groups, status badges, controls and nested diagnostics match the Codex layout',()=>{assert.ok(group('site'));assert.equal(card('a').parentElement,group('site').children[1]);assert.match(card('a').className,/active/);assert.ok(button(card('a'),'✓ 当前使用').disabled);assert.equal(button(card('b'),'应用').className,'');assert.ok(button(card('b'),'ON'));assert.ok(button(card('b'),'↑'));assert.match(card('a').textContent,/供应商诊断/);});
 await test('adding a Claude provider sends the correct client and group without displaying request controls',()=>{e('providerName').value='new';e('apiKey').value='synthetic-claude';e('baseUrl').value='https://new.invalid';e('codexProviderGroup').value='site';e('codexProviderGroup').listeners.change();e('providerForm').listeners.submit({preventDefault(){}});const m=ui.messages.at(-1);assert.equal(m.page,'claude');assert.equal(m.payload.tool,'claude');assert.equal(m.payload.groupId,'site');assert.equal(e('addProxy').hidden,true);finish();});
 await test('Claude group selection fills the native JSON URL and preserves API key/model draft',()=>{e('baseUrl').value='';e('codexProviderGroup').value='independent';e('codexProviderGroup').listeners.change();e('addMode').value='text';e('addMode').listeners.change();e('addConfigText').value=JSON.stringify({model:'keep-model',env:{ANTHROPIC_AUTH_TOKEN:'synthetic-inline'}});e('codexProviderGroup').value='site';e('codexProviderGroup').listeners.change();const cfg=JSON.parse(e('addConfigText').value);assert.equal(cfg.env.ANTHROPIC_BASE_URL,'https://anthropic.invalid');assert.equal(cfg.env.ANTHROPIC_AUTH_TOKEN,'synthetic-inline');assert.equal(cfg.model,'keep-model');});
 await test('group settings save Anthropic request handling and balance rules under the Claude route',()=>{click(group('site'),'群组设置');e('codexGroupRequestTemplate').value='t';e('codexGroupLoadTemplate').listeners.click();assert.equal(e('groupProxyApiFormat').value,'anthropic');assert.equal(e('groupProxyApiFormatField').hidden,true);e('codexSaveGroup').listeners.click();const m=ui.messages.at(-1);assert.equal(m.page,'claude');assert.equal(m.input.defaults.proxy.apiFormat,'anthropic');assert.equal(m.input.defaults.usageQuery.preset,'newapi');finish();});
 await test('provider editor is nested in its own Claude card and raw drafts survive refresh and page round trips',()=>{ui.fire({type:'configEditor',providerId:'b',tool:'claude',text:'{"env":{}}',proxy:{mode:'direct',preset:'custom',apiFormat:'anthropic'},usageQuery:{enabled:false,preset:'auto'}});assert.equal(e('configEditor').parentElement,card('b'));e('configText').value='unfinished {';e('configKey').value='synthetic-editor';e('closeConfigButton').listeners.click();ui.fire({type:'configEditor',providerId:'b',tool:'claude',text:'{"env":{}}',proxy:{mode:'direct',preset:'custom',apiFormat:'anthropic'},usageQuery:{enabled:false,preset:'auto'}});assert.equal(e('configText').value,'unfinished {');e('codexPageTab').listeners.click();assert.equal(e('tool').value,'codex');assert.ok(!card('a'));e('claudePageTab').listeners.click();assert.equal(e('tool').value,'claude');assert.ok(card('a'));assert.equal(e('apiKey').value,'synthetic-claude');assert.ok(!JSON.stringify(ui.viewState).includes('synthetic-editor'));});
 await test('group and template drafts stay with their client even when IDs are equal',()=>{e('codexGroupBaseUrl').value='https://claude-draft.invalid';e('codexGroupTemplatesButton').listeners.click();e('codexTemplateName').value='Claude template draft';e('codexPageTab').listeners.click();click(group('site'),'群组设置');e('codexGroupBaseUrl').value='https://codex-draft.invalid';assert.equal(e('codexTemplateName').value,'');e('claudePageTab').listeners.click();assert.equal(e('codexGroupBaseUrl').value,'https://claude-draft.invalid');assert.equal(e('codexTemplateName').value,'Claude template draft');assert.match(e('codexGroupEditorName').textContent,/Claude group/);});
 await test('Claude ON/OFF, arrows and group deletion emit only Claude organization actions',()=>{click(card('b'),'ON');assert.equal(ui.messages.at(-1).page,'claude');assert.equal(ui.messages.at(-1).input.action,'toggleProvider');finish();click(group('site'),'删除群组');assert.equal(ui.messages.at(-1).input.action,'deleteGroup');assert.equal(ui.messages.at(-1).page,'claude');finish();});
 await test('Claude local feedback is placed at its provider, not in a global popup',()=>{ui.fire({type:'operationFeedback',page:'claude',target:'claude:provider:b',status:'failed',message:'synthetic failure'});const notice=ui.document.querySelectorAll('[data-operation-feedback]').find(n=>n.dataset.operationFeedback==='claude:provider:b');assert.ok(notice);assert.equal(notice.parentElement,card('b').parentElement);assert.doesNotMatch(e('notice').className,/visible/);});
 await test('official mode is highlighted and API fields become read-only without hiding their groups',()=>{finish({claudeMode:'official',claudeSessions:{...base.claudeSessions,activeId:'claude-official'},apiStatuses:[{tool:'claude',mode:'official',status:'nativeAuth'}]});assert.match(e('codexCurrentMode').textContent,/官方账号/);assert.match(e('officialAccountsList').textContent,/当前使用/);assert.ok(e('saveButton').disabled);assert.equal(e('claudeOfficialGuide').hidden,false);assert.equal(e('officialDiagnostics').hidden,true);assert.ok(group('site'));assert.ok(button(card('b'),'应用').disabled);e('codexApiMode').listeners.click();assert.equal(ui.messages.at(-1).type,'applyClaudeMode');assert.equal(ui.messages.at(-1).mode,'api');finish();});
 await test('pending Claude account selection is not marked current and keeps the restart action',()=>{finish({claudeMode:'official',claudeSessions:{...base.claudeSessions,activeId:'claude-official',restartRequired:true}});assert.doesNotMatch(e('officialAccountsList').textContent,/✓ 当前使用/);assert.equal(e('reloadIdentityButton').hidden,false);assert.ok(e('openCodexButton').disabled);finish();});
 await test('native history controls route by client, show legacy cleanup and additive multi-selection, and lock until reload',()=>{
   assert.ok(!html.includes('claudeHistoryList')&&!html.includes('只读查看'));
   for(const tool of ['claude','codex']){
     e(tool+'PageTab').listeners.click();finish();assert.equal(e('selectHistoryProjectButton').hidden,false);assert.equal(e('clearHistoryProjectButton').hidden,false);assert.equal(e('labelHistoryProjectButton'),undefined);assert.equal(e('manageHistoryLabelsButton').textContent,'历史标签管理…');assert.equal(e('historyLabelsSection').parentElement,e('identityStatus').parentElement);e('manageHistoryLabelsButton').listeners.click();assert.equal(ui.messages.at(-1).action,'labelHistoryProject');finish();
     e('openNativeHistoryButton').listeners.click();assert.equal(ui.messages.at(-1).action,'openNativeHistory');assert.equal(ui.messages.at(-1).page,tool);finish();
     { e('selectHistoryProjectButton').listeners.click();assert.equal(ui.messages.at(-1).action,'selectHistoryProject');assert.equal(ui.messages.at(-1).page,tool);assert.match(e('nativeHistoryGuide').textContent,/新聊天/);finish(); }
   }
   e('claudePageTab').listeners.click();finish({claudeSessions:{...base.claudeSessions,nativeHistory:{workspace:'/host/project',project:'-container-project',owned:true,selection:{project:'-container-project',cwd:'-container-project',environment:'开发容器'}}}});
   assert.match(e('nativeHistoryScope').textContent,/旧版浏览入口/);assert.match(e('clearHistoryProjectButton').textContent,/管理已显示历史/);assert.equal(e('clearHistoryProjectButton').disabled,false);e('clearHistoryProjectButton').listeners.click();assert.equal(ui.messages.at(-1).action,'clearHistoryProject');
   finish({claudeSessions:{...base.claudeSessions,restartRequired:true}});assert.ok(e('selectHistoryProjectButton').disabled&&e('openNativeHistoryButton').disabled&&e('clearHistoryProjectButton').disabled);finish();
 });
 await test('fold choices and network drafts remain independent for both clients in the same environment',()=>{ui.toggle(e('networkProxyPanel'),true);e('networkProxyUrl').value='http://127.0.0.1:16666';e('networkProxyUrl').listeners.input();e('codexPageTab').listeners.click();assert.equal(e('networkProxyUrl').value,'http://127.0.0.1:15001');ui.toggle(e('networkProxyPanel'),false);e('claudePageTab').listeners.click();assert.equal(e('networkProxyUrl').value,'http://127.0.0.1:16666');assert.equal(e('networkProxyPanel').open,true);assert.equal(ui.viewState.foldsByEnvironment['claude:env'].network,true);assert.equal(ui.viewState.foldsByEnvironment.env.network,false);});
 await test('both clients show only their applied route, bypass list and remark while drafts change independently',()=>{
   const networkProxy={tools:{codex:{managed:true,config:{url:'http://127.0.0.1:15001',noProxy:'localhost,codex.internal',note:'Codex 线路'}},claude:{managed:true,config:{url:'http://127.0.0.1:15002',noProxy:'localhost,claude.internal',note:'  '}}}};
   finish({networkProxy});
   for(const tool of ['codex','claude']) {
     e(tool+'PageTab').listeners.click();
     const expected=networkProxy.tools[tool].config;
     assert.equal(e('networkAppliedSettings').hidden,false);
     assert.equal(e('networkAppliedUrl').textContent,expected.url);
     assert.equal(e('networkAppliedBypass').textContent,expected.noProxy);
     assert.equal(e('networkAppliedNote').textContent,expected.note.trim()||'临时设置');
     e('networkProxyUrl').value='http://127.0.0.1:19999';e('networkProxyUrl').listeners.input();
     e('networkProxyBypass').value='draft.invalid';e('networkProxyBypass').listeners.input();
     e('networkNote').value='未应用草稿';e('networkNote').listeners.input();
     assert.equal(e('networkAppliedUrl').textContent,expected.url);assert.equal(e('networkAppliedBypass').textContent,expected.noProxy);
     assert.equal(e('networkAppliedNote').textContent,expected.note.trim()||'临时设置');
   }
   finish({networkProxy:{tools:{claude:{managed:true,config:{...networkProxy.tools.claude.config,note:'未保存为预设的备注'}}}}});
   assert.equal(e('networkAppliedNote').textContent,'未保存为预设的备注');
   for(const status of [{},{managed:false,config:networkProxy.tools.claude.config},{managed:true,error:true,config:networkProxy.tools.claude.config}]) {
     finish({networkProxy:{tools:{claude:status}}});assert.equal(e('networkAppliedSettings').hidden,true);assert.equal(e('networkAppliedUrl').textContent,'');
   }
   finish();
 });
 await test('every group has an explicit collapse button and persists independently across clients and refreshes',()=>{
   const fold=(id,open)=>{
     const node=group(id),toggle=node.querySelector('.groupCollapse'),before=ui.messages.length;
     assert.ok(toggle&&!toggle.disabled);assert.equal(node.open,!open);
     toggle.listeners.click({preventDefault(){},stopPropagation(){}});
     assert.equal(node.open,open);assert.equal(toggle['aria-expanded'],String(open));assert.equal(toggle.textContent,open?'▾':'▸');assert.match(toggle['aria-label'],open?/收起/:/展开/);
     assert.equal(ui.messages.length,before); // Deliver the browser's native details toggle event.
     ui.toggle(node,open);
   };
   for(const tool of ['claude','codex']) {
     e(tool+'PageTab').listeners.click();
     for(const id of ['site','independent']) { assert.ok(group(id).querySelector('.groupCollapse'));fold(id,false); }
     const key=tool==='codex'?'env':'claude:env';assert.equal(ui.viewState.foldsByEnvironment[key]['group:site'],false);
     finish();assert.equal(group('site').open,false);fold('site',true);
   }
   e('claudePageTab').listeners.click();assert.equal(group('site').open,true);assert.equal(group('independent').open,false);
   finish({claudeOrganization:{...base.claudeOrganization,disabledGroups:['site']}});
   fold('site',false);assert.match(group('site').querySelector('.groupCollapse')['aria-label'],/Claude group/);
   finish();click(group('site'),'群组设置');assert.equal(group('site').open,true);assert.equal(group('site').querySelector('.groupCollapse')['aria-expanded'],'true');assert.equal(e('codexGroupEditor').hidden,false);
 });
 await test('all three balance editors use the same preset catalogue and both pages submit the selected key query',()=>{
   for(const tool of ['claude','codex']){
     e(tool+'PageTab').listeners.click();finish();
     ui.fire({type:'configEditor',providerId:tool==='claude'?'b':'x',tool,text:tool==='claude'?'{}':'model = "fixture"',proxy:{mode:'direct',preset:'standard',apiFormat:tool==='claude'?'anthropic':'responses'},usageQuery:{enabled:false,preset:'auto'}});
     const ids=e('usagePreset').options.map(o=>o.value);assert.ok(ids.includes('sub2api')&&ids.includes('newapi-key')&&ids.includes('openrouter-credits'));
     assert.deepEqual(e('groupUsagePreset').options.map(o=>o.value),ids);assert.deepEqual(e('templateUsagePreset').options.map(o=>o.value),ids);
     e('usageEnabled').checked=true;e('usagePreset').value='newapi-key';e('usagePreset').listeners.change();assert.equal(e('newApiFields').hidden,true);assert.equal(e('usageDivisor').value,'500000');assert.match(e('usagePresetHint').textContent,/不需要管理令牌/);
     e('usagePreset').value='sub2api-account';e('usagePreset').listeners.change();assert.equal(e('newApiFields').hidden,false);assert.equal(e('usageUserId').hidden,true);
     e('usagePreset').value='openrouter-credits';e('usagePreset').listeners.change();assert.equal(e('newApiFields').hidden,false);assert.equal(e('usageUserId').hidden,true);assert.match(e('usagePresetHint').textContent,/Management Key/);
     e('usagePreset').value='newapi';e('usagePreset').listeners.change();assert.equal(e('usageUserId').hidden,false);
     e('usagePreset').value='sub2api';e('usagePreset').listeners.change();assert.equal(e('usageUrl').value,'{{rootUrl}}/v1/usage');assert.equal(e('usageDivisor').value,'1');
     e('testUsageButton').listeners.click();const message=ui.messages.at(-1);assert.equal(message.page,tool);assert.equal(message.type,'testUsageQuery');assert.equal(message.usageQuery.preset,'sub2api');finish();
     click(group('site'),'群组设置');e('groupUsageEnabled').checked=true;e('groupUsagePreset').value='newapi-key';e('groupUsagePreset').listeners.change();e('codexSaveGroup').listeners.click();
     assert.equal(ui.messages.at(-1).input.defaults.usageQuery.url,'{{rootUrl}}/api/usage/token');assert.equal(ui.messages.at(-1).input.defaults.usageQuery.divisor,500000);assert.equal(ui.messages.at(-1).page,tool);finish();
   }
 });
 await test('standard and repair request presets reset visible advanced values for each client without touching credentials',()=>{
   for(const tool of ['claude','codex']){
     e(tool+'PageTab').listeners.click();finish();
     const key=e('apiKey').value;
     click(group('site'),'群组设置');e('groupProxyMode').value='proxy';e('groupProxyMode').listeners.change();
     for(const preset of ['standard','compatible']){
       e('groupProxyPreset').value=preset;e('groupProxyPreset').listeners.change();
       assert.equal(e('groupProxymaxHistoryChars').value,'0');assert.equal(e('groupProxymaxOutputTokens').value,'0');assert.equal(e('groupProxymaxAttempts').value,preset==='compatible'?'2':'1');assert.equal(e('groupProxyrepairToolJson').checked,preset==='compatible');
       assert.equal(e('groupProxyApiFormat').value,tool==='codex'?'responses':'anthropic');assert.match(e('groupProxyPresetHint').textContent,preset==='compatible'?/JSON 修复/:/完整历史/);assert.equal(e('apiKey').value,key);
     }
   }
 });
 await test('unlimited keys are explicitly described without an invented zero balance in either page',()=>{
   for(const tool of ['claude','codex']){
     e(tool+'PageTab').listeners.click();const id=tool==='claude'?'a':'x';finish({providers:base.providers.map(p=>p.id===id?{...p,usageEnabled:true,usageResult:{ok:true,unlimited:true,used:1,unit:'USD',checkedAt:'2026-01-01T00:00:00Z'}}:p)});
     assert.match(card(id).textContent,/Key 未设额度上限/);assert.doesNotMatch(card(id).textContent,/剩余 undefined|额度：undefined|剩余 0 USD/);
   }
   finish();
 });
 await test('editable preset parameters preserve management authentication and group query fields on both pages',()=>{
   for(const tool of ['claude','codex']){
     e(tool+'PageTab').listeners.click();finish();
     ui.fire({type:'configEditor',providerId:tool==='claude'?'b':'x',tool,text:tool==='claude'?'{}':'model = "fixture"',proxy:{mode:'direct',preset:'standard'},usageQuery:{enabled:true,preset:'auto'}});
     e('usagePreset').value='newapi';e('usagePreset').listeners.change();assert.equal(e('usageAdvancedFields').tagName,'DETAILS');assert.equal(e('usageAdvancedFields').hidden,false);
     e('usageAdvancedFields').open=true;e('usageDivisor').value='1000';e('usageUnit').value='credits';e('usageUserId').value='123';e('usageAccessToken').value='synthetic-management';e('testUsageButton').listeners.click();
     const message=ui.messages.at(-1);assert.equal(message.usageQuery.preset,'newapi');assert.equal(message.usageQuery.divisor,1000);assert.equal(message.usageQuery.userId,'123');assert.equal(message.usageAccessToken,'synthetic-management');finish();
     click(group('site'),'群组设置');e('groupUsagePreset').value='newapi-key';e('groupUsagePreset').listeners.change();assert.equal(e('groupUsageCustom').tagName,'DETAILS');assert.equal(e('groupUsageCustom').hidden,false);e('groupUsageDivisor').value='1000';e('codexSaveGroup').listeners.click();assert.equal(ui.messages.at(-1).input.defaults.usageQuery.divisor,1000);assert.equal(ui.messages.at(-1).input.defaults.usageQuery.userId,undefined);finish();
   }
 });
 console.log('RESULT: '+count+' Claude UI/isolation checks passed');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
