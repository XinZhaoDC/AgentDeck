'use strict';
const assert = require('node:assert/strict');
const Module = require('node:module');
const { sidebarFixture } = require('./sidebar-fixture');
const original = Module._load;
let popups = 0, testLanguage = 'en';
Module._load = function(name, ...args) { return name === 'vscode' ? { env: { get language() { return testLanguage; } }, window: { showErrorMessage() { popups++; } } } : original.call(this, name, ...args); };
const { SidebarViewProvider, diagnosticFailure } = require('../out/ui/sidebarView');
const provider = id => ({ id, name: id, tool: 'codex', codexMode: 'api', baseUrl: 'https://fixture.invalid', modelPolicy: { type: 'fixed', model: 'fixture' }, hasKey: true });
const initial = {
  providers: [provider('api-a'), provider('api-b')], currentProviderIds: { codex: 'api-a' }, apiStatuses: [], codexMode: 'api',
  toolEnabled: { codex: true, claude: true }, storageSizes: {}, configPaths: {}, status: { kind: 'ready' }, globalCliSync: true,
  logDirectory: '/synthetic/default-logs',
  sessions: { root: '/synthetic/data', attached: true, environmentId: 'env-a', environment: 'fixture container', activeId: 'api', identities: [{ id: 'api', kind: 'api', name: 'API history' }, { id: 'official', kind: 'official', name: 'Official A / 账号 A' }] }
};
(async () => {
  let count = 0; const test = async (name, fn) => { await fn(); count++; console.log('PASS ' + name); };
  const sidebar = new SidebarViewProvider({}, {}), html = sidebar.getHtml();
  const ui = sidebarFixture(html); const e = id => ui.elements.get(id);
  const finish = state => { ui.fire({ type: 'state', state }); ui.fire({ type: 'busy', busy: false }); };
  finish(initial);
  const notice = key => ui.document.querySelectorAll('[data-operation-feedback]').find(n => n.dataset.operationFeedback === 'codex:' + key);
  const result = (key, status = 'failed', message = 'synthetic failure') => ui.fire({ type: 'operationFeedback', target: 'codex:' + key, page: 'codex', status, message });
  const before = (node, anchor) => { assert.equal(node.parentElement, anchor.parentElement); assert.equal(node.parentElement.children.indexOf(node) + 1, node.parentElement.children.indexOf(anchor)); };
  await test('native history repair targets Codex storage and is unavailable while reload is pending', () => {
    finish(initial);
    const controls=e('codexHistoryIndexControls'), repair=e('refreshNativeHistoryButton');
    assert.equal(controls.parentElement,e('manageHistoryLabelsButton').parentElement);
    assert.equal(repair.parentElement,controls);assert.match(controls.className,/historySettingsAction/);
    assert.doesNotMatch(controls.className,/usageNote|workflowHint/);
    assert.equal(controls.children[0],repair);before(e('manageHistoryLabelsButton'),e('historyLabelsHelp'));before(repair,e('nativeHistoryIndexHelp'));
    assert.match(e('nativeHistoryIndexHelp').textContent,/不改变已选历史/);
    assert.equal(controls.querySelectorAll('button').length,1);
    assert.equal(e('nativeHistoryIndexStatus').parentElement,controls);assert.doesNotMatch(e('nativeHistoryIndexStatus').className,/usageNote|workflowHint/);
    const sourceHelp=e('historyLabelsSection').querySelectorAll('[data-fold]').find(n=>n.dataset.fold==='history-api-source-help');
    assert.equal(sourceHelp.open,false);assert.match(sourceHelp.textContent,/\/hooks/);assert.doesNotMatch(e('historyLabelsHelp').textContent,/\/hooks/);
    finish({...initial,sessions:{...initial.sessions,nativeHistory:{index:'legacy'}}});
    assert.equal(e('nativeHistoryIndexStatus').hidden,false);assert.equal(e('nativeHistoryIndexStatus').textContent,'当前索引需要升级；完成后请重载窗口。');
    finish(initial);assert.equal(e('nativeHistoryIndexStatus').hidden,true);
    assert.equal(controls.hidden,false);assert.equal(repair.hidden,false);assert.equal(repair.disabled,false);
    e('refreshNativeHistoryButton').listeners.click();assert.equal(ui.messages.at(-1).type,'sessionAction');assert.equal(ui.messages.at(-1).action,'refreshHistory');
    finish({...initial,sessions:{...initial.sessions,restartRequired:true}});assert.equal(e('refreshNativeHistoryButton').disabled,true);
    finish(initial);e('claudePageTab').listeners.click();assert.equal(e('refreshNativeHistoryButton').hidden,true);assert.equal(e('codexHistoryIndexControls').hidden,true);e('codexPageTab').listeners.click();finish(initial);
    assert.match(e('identityStatus').textContent,/目录链接有效/);
  });
  await test('Codex module order places data directly below overview', () => {
    const nodes = e('overviewSection').parentElement.children.map(n => n.id);
    const order = ['overviewSection', 'codexDataSection', 'networkSection', 'codexAccountsSection'];
    for (let i = 1; i < order.length; i++) assert.ok(nodes.indexOf(order[i - 1]) < nodes.indexOf(order[i]));
  });
  await test('all primary modules have framed details with heading inside the summary', () => {
    for (const id of ['overviewDetails', 'networkProxyPanel']) { const d = e(id); assert.match(d.className, /module/); assert.equal(d.children[0].tagName, 'SUMMARY'); assert.equal(d.children[0].children[0].tagName, 'H2'); }
    assert.equal(e('sessionPanel').parentElement, e('codexAccountsBody')); assert.equal(e('officialAccountsSection').parentElement, e('codexAccountsBody')); assert.equal(e('codexSection').parentElement, e('codexAccountsBody'));
    assert.match(e('codexProvidersDetails').className, /submodule/);
    const networkChildren = e('networkProxyActions').parentElement.children;
    assert.equal(networkChildren.indexOf(e('networkProxyBadge').parentElement) + 1, networkChildren.indexOf(e('networkProxyActions')));
    assert.ok(networkChildren.indexOf(e('networkProxyActions')) < networkChildren.indexOf(e('networkPresetEditor')));
    assert.deepEqual(e('networkProxyActions').children.map(n => n.id), ['testNetworkProxyButton', 'applyNetworkProxyButton', 'restoreNetworkProxyButton']);
    assert.match(e('codexAddProviderDetails').className, /submodule/); assert.equal(e('providerForm').parentElement, e('codexAddProviderBody'));
  });
  await test('Add Provider belongs to API Providers and retains a usable Codex-only Tool field', () => {
    assert.equal(e('addProviderSection').parentElement, e('codexToolPanel'));
    assert.equal(e('codexPath'), undefined); assert.match(ui.document.querySelector('h1').textContent, /AgentDeck/);
    assert.deepEqual(e('tool').options.map(o => o.value), ['codex']); assert.equal(e('tool').value, 'codex'); assert.equal(e('tool').disabled, false);
  });
  await test('configuration transfer and logs live under data with deletion retained', () => {
    assert.equal(e('exportButton').parentElement, e('codexPublicConfigActions')); assert.equal(e('clearLogButton').parentElement, e('codexLogActions'));
    assert.match(e('operationLogPath').textContent, /default-logs/); assert.equal(e('configurationSection').hidden, true);
  });
  await test('network failure appears immediately above network without any scroll', () => { result('network'); before(notice('network'), e('networkSection')); assert.match(notice('network').className, /error/); assert.equal(ui.scrollCalls, 0); });
  await test('Provider speed failure stays above its own card after state refresh', () => {
    result('provider:api-b', 'failed', 'speed failed'); finish(initial);
    const card = [...e('codexProviders').querySelectorAll('[data-provider-id]')].find(n => n.dataset.providerId === 'api-b'); before(notice('provider:api-b'), card); assert.match(notice('provider:api-b').textContent, /speed failed/); assert.equal(ui.scrollCalls, 0);
  });
  await test('Add failure remains above the collapsed Add subsection', () => { e('codexAddProviderDetails').open = false; result('add'); before(notice('add'), e('codexAddProviderDetails')); assert.equal(e('codexAddProviderDetails').open, false); });
  await test('collapsed parent modules show an inline failure indicator without opening themselves', () => {
    ui.toggle(e('codexProvidersDetails'), false); result('provider:api-b');
    assert.equal(e('codexProvidersDetails').open, false);
    assert.match(e('codexProvidersDetails').children[0].textContent, /操作失败/);
    ui.toggle(e('codexProvidersDetails'), true);
  });
  await test('success is green, failure red, cancellation neutral, and feedback can be dismissed', () => {
    result('logs', 'succeeded', 'done'); assert.match(notice('logs').className, /success/);
    result('storage', 'cancelled', 'cancelled'); assert.match(notice('storage').className, /cancelled/); assert.doesNotMatch(notice('storage').className, /success|error/);
    notice('logs').children[1].listeners.click(); assert.equal(notice('logs'), undefined);
  });
  await test('fold choices survive refresh and remain scoped to the environment', () => {
    ui.toggle(e('networkProxyPanel'), true); ui.toggle(e('codexProvidersDetails'), false); finish(initial);
    assert.equal(e('codexProvidersDetails').open, false); assert.equal(ui.viewState.foldsByEnvironment['env-a'].providers, false);
    finish({ ...initial, sessions: { ...initial.sessions, environmentId: 'env-b' } }); assert.equal(e('codexProvidersDetails').open, true);
    finish(initial); assert.equal(e('codexProvidersDetails').open, false);
  });
  await test('Codex does not show unknown task checks or force/retry controls', () => { assert.doesNotMatch(html, /codexActivityStatus|任务检查：|强制更改|重试检测|scrollIntoView/); });
  await test('mode read-only disables edits but preserves expansion controls', () => {
    finish({ ...initial, codexMode: 'official', sessions: { ...initial.sessions, activeId: 'official' } });
    assert.equal(e('saveButton').disabled, true); ui.toggle(e('codexProvidersDetails'), true); assert.equal(e('codexProvidersDetails').open, true);
    finish(initial);
  });
  await test('form errors are local and submit captures the originating page and target', () => {
    e('providerName').value = ''; e('providerForm').listeners.submit({ preventDefault() {} }); assert.match(notice('add').textContent, /请填写名称/);
    e('providerName').value = 'new'; e('baseUrl').value = 'https://fixture.invalid'; e('apiKey').value = 'synthetic'; e('modelSelect').value = 'fixture';
    e('providerForm').listeners.submit({ preventDefault() {} });
    assert.equal(ui.messages.at(-1).target, 'codex:add'); assert.equal(ui.messages.at(-1).payload.tool, 'codex'); assert.equal(e('saveButton').disabled, true); finish(initial);
  });
  await test('Claude shares the module hierarchy while using its own account and provider state', () => {
    e('claudePageTab').listeners.click();
    assert.equal(e('sessionPanel').hidden, false); assert.equal(e('codexDataSection').hidden, false); assert.equal(e('officialAccountsSection').hidden, false);
    assert.equal(e('providerForm').parentElement, e('codexAddProviderBody')); assert.equal(e('exportButton').parentElement, e('codexPublicConfigActions')); assert.equal(e('clearLogButton').className, 'danger');
    assert.equal(e('overviewTitle').hidden, false); assert.equal(e('networkProxyPanel').className, 'module');
    assert.equal(e('claudeNetworkRouteHelp').hidden, false); assert.match(e('openCodexButton').textContent, /Claude Code/);
    e('codexPageTab').listeners.click();
  });
  await test('saved speed failure/cancellation is not classified as success', () => {
    const report = { summary: { succeeded: 0, failed: 1, cancelled: 0 }, rounds: [{ error: 'fixture failure' }] };
    assert.match(diagnosticFailure({ type: 'speedTest', providerId: 'api-a', runs: 1 }, { ...initial, providers: [{ ...provider('api-a'), speedResult: report }] }), /fixture failure/);
    report.summary.cancelled = 1; assert.match(diagnosticFailure({ type: 'speedTest', runs: 1 }, { ...initial, officialSpeedResult: report }), /已取消/);
  });
  await test('resolved network/verification/usage/proxy failures are reported as failures', () => {
    const p = { ...provider('api-a'), networkTest: { ok: false, error: 'transport error' }, compatibility: { ok: false, error: 'invalid model' }, usageResult: { ok: false, error: 'quota unavailable' } };
    for (const type of ['testProviderNetwork', 'verifyProviderModel', 'testUsageQuery']) assert.ok(diagnosticFailure({ type, providerId: 'api-a' }, { ...initial, providers: [p] }));
    assert.ok(diagnosticFailure({ type: 'testNetworkProxy', tool: 'codex' }, { ...initial, networkProxy: { tools: { codex: { test: { results: [{ target: 'fixture', reachable: false, error: 'proxy down' }] } } } } }));
  });
  await test('host records refresh start/end with one operation id and returns scoped success', async () => {
    const events = [], replies = [];
    const host = new SidebarViewProvider({}, { recordOperation: async e => events.push(e), reloadStateFromSidebar: async () => {}, getSidebarState: async () => initial });
    host.view = { webview: { postMessage: async m => replies.push(m) } };
    await host.handleMessage({ type: 'ready', target: 'codex:overview', page: 'codex' });
    assert.deepEqual(events.map(e => e.status), ['started', 'succeeded']); assert.equal(events[0].id, events[1].id);
    assert.ok(replies.some(r => r.type === 'operationFeedback' && r.target === 'codex:overview' && r.status === 'succeeded'));
  });
  await test('host does not produce a green frame or popup for a failed Provider speed report', async () => {
    const replies = [], events = [];
    const host = new SidebarViewProvider({}, { recordOperation: async e => events.push(e), speedTestFromSidebar: async () => {}, getSidebarState: async () => ({ ...initial, providers: [{ ...provider('api-b'), speedResult: { summary: { failed: 1, succeeded: 0 }, rounds: [{ error: 'fixture' }] } }] }) });
    host.view = { webview: { postMessage: async m => replies.push(m) } };
    await host.handleMessage({ type: 'speedTest', providerId: 'api-b', runs: 1, page: 'codex', target: 'codex:provider:api-b' });
    assert.equal(events.at(-1).status, 'failed'); assert.equal(replies.filter(r => r.type === 'operationFeedback').at(-1).target, 'codex:provider:api-b');
    assert.ok(!replies.some(r => r.status === 'succeeded')); assert.equal(popups, 0);
  });
  await test('cancellation remains neutral and errors are Chinese while diagnostic classifications stay unchanged', async () => {
    const replies = [], events = []; let failure = '已取消：配置未更改';
    const host = new SidebarViewProvider({}, { recordOperation: async e => events.push(e), applyCodexModeFromSidebar: async () => { throw Error(failure); }, getSidebarState: async () => initial });
    host.view = { webview: { postMessage: async m => replies.push(m) } };
    await host.handleMessage({ type: 'applyCodexMode', mode: 'official', page: 'codex' });
    assert.equal(events.at(-1).status, 'cancelled'); assert.ok(!replies.some(r => r.status === 'succeeded'));
    failure = 'Invalid proxy connection mode'; await host.handleMessage({ type: 'applyCodexMode', mode: 'official', page: 'codex' });
    assert.equal(events.at(-1).status, 'failed'); assert.match(replies.filter(r => r.type === 'operationFeedback').at(-1).message, /API 请求处理方式无效/); assert.equal(events.at(-1).reason, 'connection_failed');
    failure = 'Upstream fixture HTTP 503'; await host.handleMessage({ type: 'applyCodexMode', mode: 'official', page: 'codex' });
    assert.match(replies.filter(r => r.type === 'operationFeedback').at(-1).message, /操作未完成.*错误详情（原文）：Upstream fixture HTTP 503/s);
    assert.equal(events.at(-1).reason, 'operation_failed');
  });
  await test('feedback expires independently after ten seconds and an old timer cannot remove a newer result', () => {
    result('logs', 'succeeded', 'old'); ui.advance(6000); result('logs', 'succeeded', 'new'); result('network', 'failed', 'other');
    ui.advance(4001); assert.match(notice('logs').textContent, /new/); assert.ok(notice('network'));
    ui.advance(5999); assert.equal(notice('logs'), undefined); assert.equal(notice('network'), undefined);
  });
  await test('required reload is persistent while API-provider advisory expires and can be dismissed', () => {
    const at = ui.context.Date.now();
    finish({ ...initial, reloadNotices: [{ tool: 'codex', section: 'network', reason: 'network changed', required: true, at }, { tool: 'codex', section: 'providers', reason: 'provider changed', required: false, at }] });
    assert.match(e('networkSection').className, /reloadRequired/); assert.match(e('codexSection').className, /reloadAdvisory/);
    const boxes = () => ui.document.querySelectorAll('[data-reload-notice]');
    boxes().find(b => /provider changed/.test(b.textContent)).children[1].listeners.click(); assert.doesNotMatch(e('codexSection').className, /reloadAdvisory/);
    ui.advance(61000); assert.match(e('networkSection').className, /reloadRequired/); assert.equal(boxes().length, 1);
    finish(initial); assert.doesNotMatch(e('networkSection').className, /reloadRequired/);
  });
  await test('restoring-as-profile is absent; history browsing/deletion and red log deletion remain', () => {
    assert.equal(e('restoreSessionsButton'), undefined); assert.match(e('deleteHistoryBackupsButton').className, /danger/); assert.match(e('clearLogButton').className, /danger/);
    assert.equal(e('quickOfficialSpeedButton').hidden, true); assert.equal(e('refreshCodexModelsButton').hidden, true);
  });
  await test('one-provider result refresh preserves other provider card objects and form values', () => {
    finish(initial); const b = [...e('codexProviders').querySelectorAll('[data-provider-id]')].find(n => n.dataset.providerId === 'api-b'); e('providerName').value = 'unsaved draft';
    finish({ ...initial, providers: [{ ...provider('api-a'), networkTest: { ok: true, reachable: true, modelsApi: 'available', checkedAt: new Date().toISOString() } }, provider('api-b')] });
    assert.equal([...e('codexProviders').querySelectorAll('[data-provider-id]')].find(n => n.dataset.providerId === 'api-b'), b); assert.equal(e('providerName').value, 'unsaved draft');
  });
  await test('copy and paste network settings use explicit clipboard actions without applying', () => {
    finish(initial); e('copyNetworkSettingsButton').listeners.click(); assert.equal(ui.messages.at(-1).type, 'networkClipboard'); assert.equal(ui.messages.at(-1).action, 'copy'); finish(initial);
    e('pasteNetworkSettingsButton').listeners.click(); assert.equal(ui.messages.at(-1).action, 'paste');
    ui.fire({ type: 'networkDraft', tool: 'codex', config: { url: 'http://127.0.0.1:9999', noProxy: 'localhost', note: 'draft' } });
    assert.equal(e('networkProxyUrl').value, 'http://127.0.0.1:9999'); assert.notEqual(ui.messages.at(-1).type, 'applyNetworkProxy'); finish(initial);
  });
  await test('Chinese Codex controls use single-language labels while preserving supplied names and model IDs', () => {
    testLanguage = 'zh-CN'; const zh = sidebarFixture(sidebar.getHtml());
    zh.fire({ type: 'state', state: { ...initial, providers: [{ ...provider('api-a'), name: 'My Provider', modelPolicy: { type: 'fixed', model: 'Model' } }] } }); zh.fire({ type: 'busy', busy: false });
    for (const id of ['exportButton', 'importButton', 'copyNetworkSettingsButton', 'openCodexButton', 'viewCodexConfigButton']) assert.doesNotMatch(zh.elements.get(id).textContent, / \/ /);
    assert.match(zh.elements.get('exportButton').textContent, /另存为供应商配置/);
    const card = [...zh.elements.get('codexProviders').querySelectorAll('[data-provider-id]')].find(n => n.dataset.providerId === 'api-a'); assert.match(card.textContent, /My Provider/); assert.match(card.textContent, /Model/);
    testLanguage = 'en';
  });
  await test('account aliases survive localization including slash-separated names', () => {
    finish({ ...initial, codexMode: 'official', sessions: { ...initial.sessions, activeId: 'official' } });
    assert.match(e('officialAccountsList').textContent, /Official A \/ 账号 A/); finish(initial);
  });
  await test('Chinese is the default even with English VS Code; raw diagnostic model IDs remain intact', () => {
    finish({ ...initial, configPaths: { codex: '/synthetic/.codex/config.toml' }, officialInfo: { models: ['Model-原始ID'], windows: [{ usedPercent: 25, minutes: 60 }], unavailable: [] } });
    for (const id of ['exportButton', 'copyNetworkSettingsButton', 'testNetworkProxyButton', 'applyNetworkProxyButton']) assert.doesNotMatch(e(id).textContent, /Save|Copy|Test|Enable/);
    assert.match(e('exportButton').textContent, /另存为供应商配置/);
    assert.match(e('codexOverviewFacts').textContent, /配置位置.*synthetic/);
    const route = { config: { url: 'http://127.0.0.1:12000' }, managed: false };
    finish({ ...initial, networkProxy: { tools: { codex: route } } }); assert.match(e('codexOverviewFacts').textContent, /旧网络配置，待重新应用/);
    finish({ ...initial, networkProxy: { tools: { codex: { ...route, managed: true } } } }); assert.match(e('codexOverviewFacts').textContent, /独立路由配置/);
    finish({ ...initial, networkProxy: { tools: { codex: { ...route, managed: true, error: true } } } }); assert.match(e('codexOverviewFacts').textContent, /配置核查异常/);
    finish({ ...initial, officialInfo: { models: ['Model-原始ID'], windows: [{ usedPercent: 25, minutes: 60 }], unavailable: [] } });
    assert.match(e('officialInfoResult').textContent, /可用模型：Model-原始ID/);
    assert.match(e('officialInfoResult').textContent, /已用 25% \/ 60 分钟/);
  });
  await test('proxy badge distinguishes applied, unapplied, legacy and abnormal configurations while draft edits do not change the applied state', () => {
    finish(initial);assert.match(e('networkProxyBadge').textContent,/未应用代理/);
    const config={url:'http://127.0.0.1:12000',noProxy:'localhost,127.0.0.1,::1',codex:true,claude:false};
    finish({...initial,networkProxy:{tools:{codex:{config,managed:true}}}});
    assert.match(e('networkProxyBadge').textContent,/已应用代理/);assert.ok(e('networkProxyBadge').classList.contains('enabled'));
    e('networkProxyBypass').value='localhost,.internal.test';e('networkProxyBypass').listeners.input();
    assert.match(e('networkProxyBadge').textContent,/已应用代理/);assert.match(e('networkProxyStatus').textContent,/草稿有更改待应用/);
    finish({...initial,networkProxy:{tools:{codex:{config,managed:false}}}});assert.match(e('networkProxyBadge').textContent,/未应用代理/);assert.match(e('networkProxyStatus').textContent,/旧代理设置/);
    finish({...initial,networkProxy:{tools:{codex:{config,managed:true,error:true}}}});assert.match(e('networkProxyBadge').textContent,/状态异常/);assert.ok(!e('networkProxyBadge').classList.contains('enabled'));assert.equal(e('applyNetworkProxyButton').disabled,false);
  });
  await test('unapplied API uses an ordinary Apply button and the applied provider gets a matching current badge and button', () => {
    finish(initial);
    const card=id=>e('codexProviders').querySelectorAll('[data-provider-id]').find(n=>n.dataset.providerId===id);
    const apply=id=>card(id).querySelector('.rowActions').children[0];
    assert.equal(apply('api-b').textContent,'应用');assert.equal(apply('api-b').className,'');assert.ok(!card('api-b').classList.contains('active'));
    assert.ok(card('api-a').classList.contains('active'));assert.match(card('api-a').querySelector('.badge').textContent,/当前使用/);assert.equal(apply('api-a').className,'currentUse');assert.equal(apply('api-a').disabled,true);
    apply('api-b').listeners.click();assert.equal(ui.messages.at(-1).type,'applyProvider');assert.equal(ui.messages.at(-1).providerId,'api-b');
    const next={...initial,currentProviderIds:{codex:'api-b'}};finish(next);
    assert.equal(apply('api-a').className,'');assert.equal(apply('api-b').className,'currentUse');assert.ok(!card('api-a').classList.contains('active'));
    finish({...next,providers:[provider('api-a'),{...provider('api-b'),needsApply:true}]});
    assert.ok(card('api-b').classList.contains('active'));assert.equal(apply('api-b').textContent,'应用更改');assert.equal(apply('api-b').disabled,false);
    apply('api-b').listeners.click();assert.equal(ui.messages.at(-1).providerId,'api-b');
    finish({...next,codexMode:'official',sessions:{...initial.sessions,activeId:'official'}});assert.ok(!card('api-b').classList.contains('active'));assert.equal(card('api-b').querySelector('.badge'),null);
  });
  await test('current official account has the same emphasized status as API and a pending binding is not labeled in use', () => {
    const official={...initial,codexMode:'official',sessions:{...initial.sessions,activeId:'official'}};finish(official);
    const row=()=>e('officialAccountsList').children.find(n=>n.dataset.identityId==='official');
    assert.ok(row().classList.contains('active'));assert.match(row().querySelector('.badge').textContent,/当前使用/);assert.equal(row().querySelector('button').className,'currentUse');assert.equal(row().querySelector('button').disabled,true);assert.match(row().textContent,/Official A \/ 账号 A/);
    finish({...official,sessions:{...official.sessions,restartRequired:true}});assert.ok(!row().classList.contains('active'));assert.equal(row().querySelector('.badge'),null);assert.equal(row().querySelector('button').textContent,'待重载');
    finish(initial);assert.ok(!row().classList.contains('active'));
  });
  console.log('RESULT: ' + count + ' Codex UI/feedback checks passed, 0 failed');
})().catch(error => { console.error(error); process.exitCode = 1; });
