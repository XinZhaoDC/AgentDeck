'use strict';
const assert = require('node:assert/strict');
const Module = require('node:module');
const original = Module._load;
const vscode = { window: { showWarningMessage: async () => undefined }, env: { language: 'zh-CN' } };
Module._load = function(name, ...args) { return name === 'vscode' ? vscode : original.call(this, name, ...args); };
const { VSModelSwitchApp } = require('../out/app');
const { ProviderOrganizationStore, groupUsageSettings, organizationKey } = require('../out/shared/providers/organization');
const { importOrganization } = require('../out/shared/providers/importOrganization');
const { normalizeProxyConfig } = require('../out/proxy/config');
const storage = map => ({ get: (key, fallback) => structuredClone(map.get(key) ?? fallback), update: async (key, value) => { map.set(key, structuredClone(value)); } });
const shared = new Map(), local = new Map(), providers = [], secrets = new Map();
const organization = new ProviderOrganizationStore('codex', storage(shared), storage(local), () => providers);
const proxy = { mode: 'proxy', preset: 'custom', apiFormat: 'responses', overrides: { timeoutMs: 12345 } };
const usage = { enabled: true, preset: 'newapi', url: '{{baseUrl}}/api/user/self', remainingPath: 'data.quota', usedPath: 'data.used_quota', unit: 'USD', divisor: 500000 };
const app = Object.create(VSModelSwitchApp.prototype);
app.ensureToolEnabled = () => {};
app.refreshStatus = () => {};
app.codexOrganization = organization;
app.store = { getProviders: () => providers, upsertProvider: async provider => providers.push(provider), deleteProvider: async id => providers.splice(providers.findIndex(p => p.id === id), 1) };
app.secretStore = { get: async ref => secrets.get(ref), store: async (ref, value) => secrets.set(ref, value), delete: async ref => secrets.delete(ref) };
const input = (name, groupId) => ({ tool: 'codex', name, baseUrl: 'https://' + name + '.invalid/v1', key: 'synthetic-' + name, model: '', applyNow: false, groupId });
(async () => {
  let count = 0;
  const test = async (name, fn) => { await fn(); count++; console.log('PASS ' + name); };
  const group = await organization.createGroup('Configured'), empty = await organization.createGroup('No defaults');
  await organization.saveGroupDefaults(group, { baseUrl: 'https://group.invalid/v1', proxy, usageQuery: usage });
  await test('creation copies configured group request and balance rules once without requiring a model or applying client settings', async () => {
    await app.createProvider(input('configured', group));
    const provider = providers.at(-1);
    assert.equal(provider.baseUrl, 'https://configured.invalid/v1'); // The form owns its visible URL.
    assert.equal(provider.modelPolicy.type, 'toolDefault');
    assert.deepEqual(provider.proxy, proxy);
    assert.deepEqual(provider.usageQuery, groupUsageSettings(usage));
    assert.equal(organization.groupOf(provider.id), group);
    assert.equal(secrets.get(provider.secretRef), 'synthetic-configured');
    await organization.saveGroupDefaults(group, { proxy: { mode: 'direct', preset:'custom' }, usageQuery: { ...usage, divisor: 2 } });
    assert.equal(provider.proxy.overrides.timeoutMs, 12345);
    assert.equal(provider.usageQuery.divisor, 500000);
  });
  await test('independent and unconfigured groups use defaults and ignore hidden add-form connection settings', async () => {
    await organization.saveGroupDefaults('independent', { proxy, usageQuery: usage });
    for (const [name, id] of [['independent', 'independent'], ['empty', empty]]) {
      await app.createProvider({ ...input(name, id), proxy });
      assert.deepEqual(providers.at(-1).proxy, normalizeProxyConfig(undefined, 'codex'));
      assert.equal(providers.at(-1).usageQuery, undefined);
      assert.equal(organization.groupOf(providers.at(-1).id), id);
    }
  });
  await test('new API still requires its original name, address and key fields', async () => {
    const before = providers.length;
    await assert.rejects(app.createProvider({ ...input('', empty) }), /名称/);
    await assert.rejects(app.createProvider({ ...input('missing-url', empty), baseUrl: '' }), /地址|base_url/);
    await assert.rejects(app.createProvider({ ...input('missing-key', empty), key: '' }), /密钥/);
    assert.equal(providers.length, before);
  });
  await test('group and template allowlists remove account credentials while preserving reusable balance parameters through export and import', async () => {
    const injected = { ...usage, userId: 'synthetic-user', accessToken: 'synthetic-management-token', secretRef: 'synthetic-ref', apiKey: 'synthetic-key' };
    const id = await organization.saveTemplate('Public rules', proxy, undefined, injected);
    await organization.saveGroupDefaults(group, { proxy, usageQuery: injected });
    const exported = JSON.parse(JSON.stringify(organization.read()));
    assert.ok(!JSON.stringify(exported).includes('synthetic-'));
    const imported = importOrganization(organization.read(), exported, 'replace', providers.map(p => p.id), providers.map(p => p.id), 'codex');
    assert.equal(imported.templates.find(t => t.id === id).usageQuery.divisor, 500000);
    assert.equal(imported.groups.find(g => g.id === group).defaults.usageQuery.url, '{{baseUrl}}/api/user/self');
    await organization.deleteTemplate(id);
    assert.equal(organization.requireGroup(group).defaults.usageQuery.divisor, 500000);
  });
  await test('legacy request-only templates load with balance querying disabled without rewriting storage on read', async () => {
    const stored = structuredClone(shared.get(organizationKey('codex')));
    stored.templates.push({ id: 'legacy', name: 'Old request template', proxy });
    shared.set(organizationKey('codex'), stored);
    assert.equal(organization.read().templates.find(t => t.id === 'legacy').usageQuery.enabled, false);
    assert.equal(shared.get(organizationKey('codex')).templates.at(-1).usageQuery, undefined);
  });
  await test('credential-bearing balance URLs cannot be stored in shared group settings', async () => {
    for (const url of ['https://user:password@query.invalid/balance', 'https://query.invalid/balance?access_token=synthetic', 'file:///tmp/balance']) {
      await assert.rejects(organization.saveTemplate('Unsafe URL', proxy, undefined, { ...usage, url }));
    }
  });
  await test('loading group settings copies address and balance rules into an editor while keeping provider credentials, model and management identity', async () => {
    await organization.saveGroupDefaults(group, { baseUrl: 'https://loaded.invalid', proxy, usageQuery: usage });
    app.sessionController = { state: async () => ({ activeId: 'api', identities: [{ id: 'api', kind: 'api' }] }) };
    const existing = { providerId: providers[0].id, tool: 'codex', text: 'model = "keep-model"\n[model_providers.OpenAI]\nbase_url = "https://old.invalid"\n', hasKey: true, usageHasToken: true, usageQuery: { ...usage, userId: 'keep-user' }, proxy: { mode: 'direct', preset:'custom' } };
    app.getProviderConfigFromSidebar = async () => structuredClone(existing);
    const { editor } = await app.organizationActionFromSidebar({ action: 'providerTemplate', providerId: providers[0].id });
    assert.equal(editor.groupSettingsLoaded, true);
    assert.match(editor.text, /loaded.invalid/);
    assert.match(editor.text, /keep-model/);
    assert.equal(editor.hasKey, true);
    assert.equal(editor.usageHasToken, true);
    assert.equal(editor.usageQuery.userId, 'keep-user');
    assert.equal(editor.usageQuery.divisor, 500000);
    assert.equal(providers[0].baseUrl, 'https://configured.invalid/v1');
    assert.equal(secrets.get(providers[0].secretRef), 'synthetic-configured');
  });
  await test('Claude creation uses its own group defaults once and preserves manually supplied address and credentials', async () => {
    const before=organization.read();const claude=new ProviderOrganizationStore('claude',storage(shared),storage(local),()=>providers);app.claudeOrganization=claude;
    const g=await claude.createGroup('Configured'),empty=await claude.createGroup('Empty');
    const request={...proxy,apiFormat:'anthropic'};await claude.saveGroupDefaults(g,{baseUrl:'https://default.invalid',proxy:request,usageQuery:usage});
    for(const [name,groupId] of [['configured',g],['independent','independent'],['empty',empty]]) {
      await app.createProvider({...input('claude-'+name,groupId),tool:'claude',proxy:request});const p=providers.at(-1);
      assert.equal(p.baseUrl,'https://claude-'+name+'.invalid/v1');assert.equal(p.modelPolicy.type,'toolDefault');assert.equal(secrets.get(p.secretRef),'synthetic-claude-'+name);
      assert.deepEqual(p.proxy,name==='configured'?request:normalizeProxyConfig(undefined,'claude'));assert.equal(p.usageQuery?.divisor,name==='configured'?500000:undefined);assert.equal(claude.groupOf(p.id),groupId);
    }
    assert.deepEqual(organization.read(),before);
  });
  await test('Claude group loading edits native JSON and keeps per-provider model, auth and management identity',async()=>{
    const claude=app.claudeOrganization,p=providers.find(p=>p.tool==='claude');const g=claude.groupOf(p.id);await claude.saveGroupDefaults(g,{baseUrl:'https://loaded-claude.invalid',proxy:{...proxy,apiFormat:'anthropic'},usageQuery:usage});
    app.claudeSessions={state:async()=>({activeId:'api',identities:[{id:'api',kind:'api'}]})};
    app.getProviderConfigFromSidebar=async()=>({providerId:p.id,tool:'claude',text:JSON.stringify({model:'keep-model',env:{ANTHROPIC_BASE_URL:p.baseUrl,ANTHROPIC_AUTH_TOKEN:'synthetic-inline'},permissions:{allow:['Read']}}),usageQuery:{...usage,userId:'keep-user'},usageHasToken:true});
    const {editor}=await app.organizationActionFromSidebar({action:'providerTemplate',providerId:p.id},'claude');const cfg=JSON.parse(editor.text);
    assert.equal(cfg.env.ANTHROPIC_BASE_URL,'https://loaded-claude.invalid');assert.equal(cfg.env.ANTHROPIC_AUTH_TOKEN,'synthetic-inline');assert.equal(cfg.model,'keep-model');assert.deepEqual(cfg.permissions,{allow:['Read']});assert.equal(editor.usageQuery.userId,'keep-user');assert.equal(editor.usageHasToken,true);
    await assert.rejects(app.organizationActionFromSidebar({action:'providerTemplate',providerId:providers[0].id},'claude'),/不属于/);
  });
  await test('both clients reject normalized duplicate API names across groups before provider or secret writes', async () => {
    await app.createProvider({...input('configured','independent'),tool:'claude',baseUrl:'https://same-name-other-client.invalid',key:'synthetic-other-client-key'});
    const before=JSON.stringify(providers), keys=JSON.stringify([...secrets]);
    for(const tool of ['codex','claude']) for(const name of [' CONFIGURED ','ｃｏｎｆｉｇｕｒｅｄ']) {
      await assert.rejects(app.createProvider({...input(name,'independent'),tool,baseUrl:'https://duplicate.invalid',key:'synthetic-new-duplicate-key'}),/同名供应商/);
      assert.equal(JSON.stringify(providers),before);assert.equal(JSON.stringify([...secrets]),keys);
    }
    assert.equal(providers.filter(p=>p.name==='configured').length,2); // Same name remains valid across clients.
  });
  await test('group creation and renaming use independent client-wide normalized names including the default group', async () => {
    for(const store of [organization,app.claudeOrganization]) {
      const extra=await store.createGroup('Distinct');const before=store.read();
      await assert.rejects(store.createGroup(' Ｃｏｎｆｉｇｕｒｅｄ '),/同名/);
      await assert.rejects(store.renameGroup(extra,' configured '),/同名/);
      await assert.rejects(store.createGroup(' 独立供应商 '),/同名/);
      assert.deepEqual(store.read(),before);
    }
  });
  console.log('RESULT: ' + count + ' group settings checks passed');
})().finally(() => { Module._load = original; }).catch(error => { console.error(error); process.exitCode = 1; });
