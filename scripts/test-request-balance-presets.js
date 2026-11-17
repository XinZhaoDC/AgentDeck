'use strict';
// All credentials and responses in this suite are synthetic; loopback only.
const assert=require('node:assert/strict'),http=require('node:http');
const {USAGE_PRESETS,resolveUsageUrl}=require('../out/models/usagePresets');
const {usagePreset,queryUsage}=require('../out/models/usageQuery');
const {proxyDefaults,normalizeProxyConfig,proxyAuthHeaders}=require('../out/proxy/config');
const {buildPayload}=require('../out/proxy/protocol');
const {buildResponsesPayload}=require('../out/proxy/responses');
const {ProxyServer}=require('../out/proxy/server');
const {disposeNetworkTransport}=require('../out/network/transport');
async function main(){
 let count=0,status=200,body={},pathFilter='',requests=[],failures=0;
 const server=http.createServer(async(req,res)=>{
  const chunks=[];for await(const part of req)chunks.push(part);
  requests.push({path:req.url,headers:req.headers,body:chunks.length?JSON.parse(Buffer.concat(chunks)):undefined});
  res.setHeader('content-type','application/json');
  if(pathFilter&&req.url!==pathFilter){res.writeHead(404);res.end('{}');return;}
  if(failures>0){failures--;res.writeHead(503);res.end('{}');return;}
  res.writeHead(status);res.end(JSON.stringify(body));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const proxy=new ProxyServer(),test=async(name,fn)=>{await fn();count++;console.log('PASS '+name);};
 const query=(id,tool='codex',token,userId)=>queryUsage(usagePreset(id,base+'/v1',{enabled:true,userId}),base+'/v1','synthetic-model-key',token,undefined,tool);
 const reset=(value,path='')=>{status=200;body=value;pathFilter=path;requests=[];failures=0;};
 try{
  await test('preset URLs preserve deployment prefixes and normalize version suffixes once',()=>{
   for(const suffix of ['', '/v1', '/v1/']){
    const url='https://fixture.invalid/relay'+suffix;
    assert.equal(usagePreset('sub2api',url).url,'https://fixture.invalid/relay/v1/usage');
    assert.equal(usagePreset('newapi-key',url).url,'https://fixture.invalid/relay/api/usage/token');
    assert.equal(usagePreset('deepseek',url).url,'https://fixture.invalid/relay/user/balance');
    assert.equal(usagePreset('siliconflow',url).url,'https://fixture.invalid/relay/v1/user/info');
   }
   assert.equal(usagePreset('openrouter-credits','https://openrouter.ai').url,'https://openrouter.ai/api/v1/credits');
   assert.equal(usagePreset('openrouter','https://openrouter.ai/api/v1').url,'https://openrouter.ai/api/v1/key');
   assert.equal(resolveUsageUrl('{{baseUrl}}/api/user/self','https://fixture.invalid/v1','newapi'),'https://fixture.invalid/api/user/self');
  });
  for(const tool of ['codex','claude']){
   await test(tool+' Sub2API reads monetary quota without a New API divisor or management credential',async()=>{
    reset({isValid:true,remaining:191.39530502,unit:'USD',quota:{used:8.60469498,limit:200}},'/v1/usage');
    const result=await query('sub2api',tool,'synthetic-unused-management');
    assert.equal(result.ok,true);assert.equal(result.remaining,191.39530502);assert.equal(result.total,200);assert.equal(result.used,8.60469498);
    assert.equal(requests[0].headers.authorization,'Bearer synthetic-model-key');assert.equal(requests[0].headers['new-api-user'],undefined);
   });
   await test(tool+' New API key quota uses the API key and converts quota points exactly once',async()=>{
    reset({code:true,data:{total_available:1500000,total_used:500000,total_granted:2000000,unlimited_quota:false}},'/api/usage/token');
    const result=await query('newapi-key',tool);assert.equal(result.ok,true);assert.equal(result.remaining,3);assert.equal(result.used,1);assert.equal(result.total,4);
    assert.equal(requests[0].headers.authorization,'Bearer synthetic-model-key');assert.equal(requests[0].headers['new-api-user'],undefined);
   });
   await test(tool+' automatic detection reaches a Sub2API relay in one request',async()=>{
    reset({isValid:true,remaining:2.5,unit:'USD'},'/v1/usage');const result=await query('auto',tool);
    assert.equal(result.ok,true);assert.equal(result.remaining,2.5);assert.equal(requests.length,1);assert.match(result.strategy,/Sub2API/);
   });
   await test(tool+' automatic New API detection cannot confuse quota points with dollars',async()=>{
    reset({code:true,data:{total_available:500000,total_used:500000,total_granted:1000000,unlimited_quota:false}},'/api/usage/token');
    const result=await query('auto',tool);assert.equal(result.ok,true);assert.equal(result.remaining,1);assert.equal(requests.length,2);
   });
  }
  await test('management presets reject missing credentials before any HTTP request',async()=>{
   reset({});assert.equal((await query('newapi')).ok,false);assert.equal((await query('newapi','codex','synthetic-management')).ok,false);
   assert.equal((await query('sub2api-account')).ok,false);assert.equal((await query('openrouter-credits')).ok,false);assert.equal(requests.length,0);
  });
  await test('New API account query uses only management token and user ID and computes its total',async()=>{
   reset({success:true,data:{quota:1000000,used_quota:500000}},'/api/user/self');const result=await query('newapi','codex','synthetic-management','123');
   assert.equal(result.remaining,2);assert.equal(result.total,3);assert.equal(requests[0].headers.authorization,'Bearer synthetic-management');assert.equal(requests[0].headers['new-api-user'],'123');
  });
  await test('Sub2API account query never adds New-Api-User or uses the model key',async()=>{
   reset({data:{balance:7.25}},'/api/v1/user/profile');const result=await query('sub2api-account','claude','synthetic-management','123');
   assert.equal(result.remaining,7.25);assert.equal(requests[0].headers.authorization,'Bearer synthetic-management');assert.equal(requests[0].headers['new-api-user'],undefined);
  });
  await test('adjusting a management preset divisor retains its management authentication',async()=>{
   reset({success:true,data:{quota:2000,used_quota:1000}},'/api/user/self');
   const config={...usagePreset('newapi',base,{enabled:true,userId:'123'}),divisor:1000,unit:'credits'};
   const result=await queryUsage(config,base,'synthetic-model-key','synthetic-management',undefined,'codex');
   assert.equal(result.remaining,2);assert.equal(result.unit,'credits');assert.equal(requests[0].headers.authorization,'Bearer synthetic-management');assert.equal(requests[0].headers['new-api-user'],'123');
  });
  await test('unlimited New API and OpenRouter keys and Sub2API sentinels do not become zero or negative wallets',async()=>{
   for(const [preset,value] of [['newapi-key',{data:{unlimited_quota:true,total_available:-5,total_used:500000}}],['openrouter',{data:{limit:null,limit_remaining:null,usage:3}}],['sub2api',{remaining:-1}]]){
    reset(value);const result=await query(preset);assert.equal(result.ok,true);assert.equal(result.unlimited,true);assert.equal(result.remaining,undefined);assert.equal(result.total,undefined);
   }
  });
  await test('zero balance remains a valid amount and a successful HTTP business error is not a balance',async()=>{
   reset({remaining:0,unit:'USD'});assert.equal((await query('sub2api')).remaining,0);
   reset({isValid:false,remaining:0});assert.equal((await query('sub2api')).ok,false);
   reset({success:false,data:{quota:1000000}});assert.equal((await query('newapi','codex','synthetic-management','123')).ok,false);
  });
  await test('DeepSeek selects a nonempty wallet and uses its actual currency',async()=>{
   reset({is_available:true,balance_infos:[{currency:'USD',total_balance:'0'},{currency:'CNY',total_balance:'8.5'}]});
   const result=await query('deepseek');assert.equal(result.remaining,8.5);assert.equal(result.unit,'CNY');
  });
  await test('SiliconFlow includes grant balance and OpenRouter distinguishes credits from key allowance',async()=>{
   reset({data:{balance:'1',totalBalance:'4'}});const sf=await query('siliconflow');assert.equal(sf.remaining,4);assert.equal(sf.total,undefined);
   reset({data:{total_credits:20,total_usage:3.25}});const or=await query('openrouter-credits','codex','synthetic-openrouter-management');assert.equal(or.remaining,16.75);assert.equal(or.used,3.25);assert.equal(requests[0].headers.authorization,'Bearer synthetic-openrouter-management');assert.equal(requests[0].headers['new-api-user'],undefined);
  });
  await test('credit grants and custom numeric strings retain caller-selected scale and unit',async()=>{
   reset({total_available:3.5,total_used:1,total_granted:4.5});assert.equal((await query('openai-credit')).remaining,3.5);
   reset({data:{left:'2500',spent:'500',total:'3000'}});const result=await queryUsage({enabled:true,preset:'custom',url:base+'/balance',remainingPath:'data.left',usedPath:'data.spent',totalPath:'data.total',unit:'credits',divisor:1000},base,'synthetic-model-key');assert.equal(result.remaining,2.5);assert.equal(result.unit,'credits');
  });
  await test('Moonshot StepFun and Novita presets retain their endpoint paths and monetary conversion',async()=>{
   reset({data:{available_balance:'9.75'}},'/v1/users/me/balance');assert.equal((await query('moonshot')).remaining,9.75);
   reset({balance:'2.5'},'/v1/accounts');assert.equal((await query('stepfun')).remaining,2.5);
   reset({availableBalance:'25000'},'/openapi/v1/billing/balance/detail');const result=await query('novita');assert.equal(result.remaining,2.5);assert.equal(result.unit,'USD');
  });
  await test('cancellation sends no balance request and authorization errors expose no response body or key',async()=>{
   reset({message:'synthetic-model-key'});const c=new AbortController();c.abort();const cfg=usagePreset('sub2api',base);const cancelled=await queryUsage(cfg,base,'synthetic-model-key',undefined,c.signal,'codex');assert.equal(cancelled.ok,false);assert.equal(requests.length,0);
   status=401;const result=await query('sub2api');assert.equal(result.httpStatus,401);assert.ok(!JSON.stringify(result).includes('synthetic-model-key'));
  });
  for(const preset of ['standard','compatible']){
   await test(preset+' preserves full context, tool outputs, descriptions and client output caps in both protocols',()=>{
    const long='x'.repeat(250000),description='description'.repeat(100),toolOutput='output'.repeat(7000);
    const anthropic={model:'fixture',max_tokens:24000,messages:[{role:'user',content:long},{role:'assistant',content:[{type:'tool_use',id:'tool1',name:'Read',input:{}}]},{role:'user',content:[{type:'tool_result',tool_use_id:'tool1',content:toolOutput}]}],tools:[{name:'Read',description,input_schema:{type:'object'}}]};
    const a=buildPayload(anthropic,proxyDefaults(preset,'anthropic'));assert.equal(a.dropped,0);assert.equal(a.payload.max_tokens,24000);assert.equal(a.payload.tools[0].name,'Read');assert.equal(a.payload.tools[0].description,description);assert.ok(JSON.stringify(a.payload.messages).includes(toolOutput));assert.ok(JSON.stringify(a.payload.messages).includes(long));
    const r=buildResponsesPayload({model:'fixture',max_output_tokens:24000,input:[{role:'user',content:long},{type:'function_call',call_id:'x',name:'Read',arguments:'{}'},{type:'function_call_output',call_id:'x',output:toolOutput}],tools:[{type:'function',name:'Read',description,parameters:{type:'object'}}]},proxyDefaults(preset,'responses'));assert.equal(r.dropped,0);assert.equal(r.payload.max_output_tokens,24000);assert.equal(r.payload.tools[0].description,description);assert.ok(JSON.stringify(r.payload.input).includes(toolOutput));
   });
  }
  await test('request preset authentication follows the upstream format and legacy justdowork keeps its explicit behavior',()=>{
   for(const preset of ['standard','compatible'])for(const tool of ['codex','claude']){
    const format=tool==='codex'?'responses':'anthropic',config=normalizeProxyConfig({mode:'proxy',preset,apiFormat:format},tool),headers=proxyAuthHeaders('synthetic-model-key',config,tool);
    assert.equal(headers[tool==='codex'?'Authorization':'x-api-key'],tool==='codex'?'Bearer synthetic-model-key':'synthetic-model-key');
   }
   assert.equal(proxyDefaults('justdowork').nativeToolMap.Read,'read');assert.equal(proxyDefaults('justdowork').webTools,true);assert.equal(proxyDefaults('justdowork').maxHistoryChars,220000);
  });
  for(const preset of ['standard','compatible']){
   await test(preset+' enforces its retry count on real loopback proxy requests without changing the upstream',async()=>{
    reset({id:'msg_fixture',type:'message',role:'assistant',model:'fixture',content:[{type:'text',text:'OK'}],stop_reason:'end_turn',usage:{input_tokens:1,output_tokens:1}});failures=1;
    const endpoint=await proxy.register(preset,base,'synthetic-model-key','fixture',{mode:'proxy',preset,apiFormat:'anthropic'},'claude');
    const result=await fetch(endpoint.baseUrl+'/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':endpoint.key},body:JSON.stringify({model:'fixture',max_tokens:24000,messages:[{role:'user',content:'fixture'}]})});
    assert.equal(result.ok,preset==='compatible');await result.text();assert.equal(requests.length,preset==='compatible'?2:1);assert.ok(requests.every(r=>r.path==='/v1/messages'));assert.equal(requests[0].body.max_tokens,24000);
   });
  }
  assert.equal(new Set(USAGE_PRESETS.map(p=>p.id)).size,USAGE_PRESETS.length);
  console.log('RESULT: '+count+' request/balance preset checks passed');
 }finally{proxy.dispose();disposeNetworkTransport();await new Promise(r=>server.close(r));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
