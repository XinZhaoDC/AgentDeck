import { renderProxyFields } from './proxyFields';
import { renderGroupUsageFields } from './usageFields';

export function managedProvidersHtml(): string { return `    <section id="codexSection" class="section moduleWrap">
      <details id="codexProvidersDetails" class="submodule" data-fold="providers" open>
        <summary><h3>API 供应商 / API providers</h3></summary>
        <div id="codexToolPanel" class="panel moduleBody">
          <div id="codexApiReadOnly" class="small"></div>
          <div class="actions"><button id="codexCreateGroup">新建群组</button><button id="codexGroupTemplatesButton">群组设置模板</button></div><p class="usageNote">ⓘ 注：按住群组标题或供应商卡片约 350 毫秒后拖动，或用 ↑ / ↓ 单步排序；禁用项目自动下沉，禁用状态只影响当前环境。移动只改变归属，不套用模板。</p><div id="codexProviders" class="providerList"></div>
          <div class="actions"><button id="refreshCodexModelsButton" hidden>Refresh Codex Models</button><button id="testCodexNetworkButton">批量诊断供应商 / Diagnose providers</button></div>
          ${organizationEditorsHtml()}
        </div>
      </details>
    </section>`; }
function organizationEditorsHtml(): string { return `
  <section id="codexGroupEditor" class="nestedEditor groupEditor" hidden>
    <div class="editorHeading"><h4 id="codexGroupEditorName">群组设置</h4><button id="codexCloseGroup">关闭</button></div>
    <div class="settingsBody">
      <p class="usageNote">ⓘ 注：保存只改变本群组的默认设置。已有供应商需明确载入并保存；修改模板不追溯覆盖群组或供应商。</p>
      <label for="codexGroupRequestTemplate">从群组设置模板载入</label><div class="actions"><select id="codexGroupRequestTemplate"></select><button id="codexGroupLoadTemplate">载入模板到草稿</button></div>
      <label for="codexGroupBaseUrl">默认 API 地址（可留空）</label><input id="codexGroupBaseUrl" type="text" placeholder="例如：https://api.example.com/v1">
      <details class="settingsSection"><summary><h4>API 请求处理设置</h4></summary><div class="settingsBody">${renderProxyFields('group')}</div></details>
      ${renderGroupUsageFields('group')}
      <button id="codexSaveGroup" class="primary">保存群组设置</button>
    </div>
  </section>
  <section id="codexGroupTemplates" class="nestedEditor templateManager" hidden>
    <div class="editorHeading"><h3>群组设置模板</h3><button id="codexCloseTemplates">关闭</button></div>
    <div class="settingsBody">
      <p class="usageNote">ⓘ 注：模板包含请求处理与余额查询规则，不包含 API 地址或凭据。删除模板保留已经载入的群组和供应商配置。</p>
      <label for="codexTemplateSelect">管理已有模板</label><select id="codexTemplateSelect"></select><div class="actions"><button id="codexLoadTemplate">载入所选模板</button><button id="codexNewTemplate">新建模板</button><button id="codexDeleteTemplate" class="danger">删除所选模板</button></div>
      <label for="codexTemplateName">模板名称</label><input id="codexTemplateName" type="text" placeholder="例如：某供应商请求与余额规则">
      <details class="settingsSection"><summary><h4>API 请求处理设置</h4></summary><div class="settingsBody">${renderProxyFields('template')}</div></details>
      ${renderGroupUsageFields('template')}
      <button id="codexSaveTemplate" class="primary">保存群组设置模板</button>
    </div>
  </section>`; }

export function managedPageScript(): string { return `
  function codexSwitch(on, label, disabled, action) {
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'clientToggle';
    toggle.textContent = on ? 'ON' : 'OFF'; toggle.dataset.rawValue = 'true';
    toggle.setAttribute('role', 'switch'); toggle.setAttribute('aria-checked', String(on));
    toggle.setAttribute('aria-label', label); toggle.title = label + (on ? '：已启用，点击禁用' : '：已禁用，点击恢复');
    toggle.disabled = disabled;
    toggle.addEventListener('click', event => { event?.preventDefault?.(); event?.stopPropagation?.(); if (!toggle.disabled) action(); });
    return toggle;
  }
  // Holding the primary mouse button arms native drag without making ordinary
  // clicks, text selection or nested controls reorder a group/provider.
  function codexHoldDrag(node, type, id, allowed) {
    let timer, armed = false, dragged = false;
    const reset = () => { window.clearTimeout(timer); armed = false; node.classList.remove('dragReady'); };
    node.draggable = true; node.title = '按住鼠标左键约 350 毫秒后拖动排序';
    node.addEventListener('pointerdown', event => {
      reset(); if (event.button !== 0 || !allowed()) return;
      for (let target = event.target; target && target !== node; target = target.parentElement) if (['BUTTON','INPUT','SELECT','TEXTAREA','A'].includes(target.tagName)) return;
      timer = window.setTimeout(() => { if (allowed()) { armed = true; node.classList.add('dragReady'); } }, 350);
    });
    node.addEventListener('pointerup', reset); node.addEventListener('pointercancel', reset); node.addEventListener('mouseleave', () => { if (!dragged) reset(); });
    node.addEventListener('dragstart', event => {
      event.stopPropagation?.();
      if (!armed || !allowed()) { event.preventDefault(); return; }
      dragged = true; event.dataTransfer.setData(type, id); event.dataTransfer.effectAllowed = 'move';
    });
    node.addEventListener('dragend', () => { reset(); window.setTimeout(() => { dragged = false; }, 0); });
    node.addEventListener('click', event => { if (dragged) { event?.preventDefault?.(); event?.stopPropagation?.(); dragged = false; } });
  }
  function codexDropAfter(event, node) {
    const rect = node.getBoundingClientRect?.();
    return rect && Number.isFinite(event.clientY) && event.clientY > rect.top + rect.height / 2;
  }
  function balancePresetValues(preset) {
    const definition = usagePresets.find(item => item.id === preset);
    return definition ? Object.fromEntries(['Url','RemainingPath','UsedPath','TotalPath','Unit','Divisor'].map(key => [key,definition[key[0].toLowerCase() + key.slice(1)]])) : undefined;
  }
  function balancePresetHint(preset) {
    const definition = usagePresets.find(item => item.id === preset);
    return definition ? definition.description + (definition.url ? ' 接口：' + definition.url : '') : '';
  }
  function groupUsageVisibility(prefix) {
    document.getElementById(prefix + 'UsageFields').hidden = !document.getElementById(prefix + 'UsageEnabled').checked;
    const preset = document.getElementById(prefix + 'UsagePreset').value;
    document.getElementById(prefix + 'UsageCustom').hidden = preset === 'auto';
    if (preset === 'custom') document.getElementById(prefix + 'UsageCustom').open = true;
    document.getElementById(prefix + 'UsagePresetHint').textContent = balancePresetHint(document.getElementById(prefix + 'UsagePreset').value);
  }
  function setGroupUsage(prefix, config) {
    config ||= { enabled:false, preset:'auto' };
    document.getElementById(prefix + 'UsageEnabled').checked = Boolean(config.enabled);
    document.getElementById(prefix + 'UsagePreset').value = config.preset || 'auto';
    const defaults = balancePresetValues(config.preset || 'auto') || {};
    for (const name of ['Url','RemainingPath','UsedPath','TotalPath','Unit','Divisor']) document.getElementById(prefix + 'Usage' + name).value = config[name[0].toLowerCase() + name.slice(1)] ?? defaults[name] ?? '';
    groupUsageVisibility(prefix);
  }
  function getGroupUsage(prefix) {
    const result = { enabled:document.getElementById(prefix + 'UsageEnabled').checked, preset:document.getElementById(prefix + 'UsagePreset').value };
    for (const name of ['Url','RemainingPath','UsedPath','TotalPath','Unit']) result[name[0].toLowerCase() + name.slice(1)] = document.getElementById(prefix + 'Usage' + name).value.trim();
    result.divisor = Number(document.getElementById(prefix + 'UsageDivisor').value) || 1;
    return result;
  }
  function captureProviderDraft() {
    return { fields: [...el.form.querySelectorAll('input, select, textarea')].map(n => ({ id: n.id, value: n.value, checked: n.checked })), models: fetchedModels };
  }
  function restoreProviderDraft(draft) {
    if (!draft) {
      for (const id of ['providerName', 'baseUrl', 'apiKey', 'modelSelect', 'addConfigText']) document.getElementById(id).value = '';
      el.applyNow.checked = false; el.addMode.value = 'fields'; updateAddMode(); return;
    }
    for (const field of draft.fields) { const node = document.getElementById(field.id); if (node) { node.value = field.value; node.checked = field.checked; } }
    fetchedModels = draft.models || []; renderModelOptions(); updateProxyVisibility('add', activeTool); updateAddMode();
  }
  class ProviderPage {
    constructor(tool = 'codex') {
      this.id = tool; this.groupNodes = new Map(); this.editGroupId = ''; this.templateId = ''; this.templateSource = ''; this.pendingGroup = '';
      this.remembered = vscode.getState()?.lastGroupsByEnvironment || {};
      this.nameHistory = vscode.getState()?.providerNameHistoryByTool?.[tool] || [];
      if (ProviderPage.bound) return;
      ProviderPage.bound = true; // Shared controls dispatch to the selected page; drafts remain per client.
      const node = id => document.getElementById(id);
      const bind = (id, fn) => node(id).addEventListener('click', () => { try { fn(); } catch (error) { showLocalFeedback(id.includes('Group') && !['codexCreateGroup','codexGroupTemplatesButton'].includes(id) ? 'group-editor' : 'templates', error.message, true); } });
      bind('codexCreateGroup', () => clientPages[activeTool].send({ action: 'createGroup' }));
      el.codexToolPanel.insertBefore(node('codexGroupTemplates'), el.codexProviders);
      bind('codexGroupTemplatesButton', () => { node('codexGroupTemplates').hidden = !node('codexGroupTemplates').hidden; });
      bind('codexCloseTemplates', () => { node('codexGroupTemplates').hidden = true; });
      node('codexProviderGroup').addEventListener('change', () => {
        clientPages[activeTool].remembered[clientPages[activeTool].environmentKey()] = node('codexProviderGroup').value;
        vscode.setState?.({ ...(vscode.getState?.() || {}), lastGroupsByEnvironment: { ...(vscode.getState()?.lastGroupsByEnvironment || {}), ...clientPages[activeTool].remembered } }); clientPages[activeTool].fillGroupAddress(); updateAddMode();
      });
      bind('codexSaveGroup', () => clientPages[activeTool].send({ action: 'saveGroup', groupId: clientPages[activeTool].editGroupId, defaults: { baseUrl: node('codexGroupBaseUrl').value, proxy: getProxyConfig('group'), usageQuery: getGroupUsage('group'), templateName: clientPages[activeTool].templateSource } }));
      bind('codexCloseGroup', () => { clientPages[activeTool].groupOpen = false; node('codexGroupEditor').hidden = true; });
      bind('codexGroupLoadTemplate', () => { const t = clientPages[activeTool].organization().templates.find(t => t.id === node('codexGroupRequestTemplate').value); if (!t) throw Error('请先选择模板。'); setProxyConfig('group', t.proxy); setGroupUsage('group', t.usageQuery); clientPages[activeTool].templateSource = t.name; showLocalFeedback('group-editor', '请求处理与余额查询已载入群组草稿；保存后更新群组设置。', false); });
      bind('codexLoadTemplate', () => { const t = clientPages[activeTool].organization().templates.find(t => t.id === node('codexTemplateSelect').value); if (!t) throw Error('请先选择模板。'); clientPages[activeTool].templateId = t.id; node('codexTemplateName').value = t.name; setProxyConfig('template', t.proxy); setGroupUsage('template', t.usageQuery); });
      bind('codexNewTemplate', () => { clientPages[activeTool].templateId = ''; node('codexTemplateName').value = ''; node('codexTemplateSelect').value = ''; setProxyConfig('template'); setGroupUsage('template'); });
      bind('codexSaveTemplate', () => clientPages[activeTool].send({ action: 'saveTemplate', templateId: clientPages[activeTool].templateId || undefined, name: node('codexTemplateName').value, proxy: getProxyConfig('template'), usageQuery: getGroupUsage('template') }));
      node('codexTemplateSelect').addEventListener('change', () => { node('codexDeleteTemplate').disabled = busy || !codexApiEditable() || !node('codexTemplateSelect').value; });
      bind('codexDeleteTemplate', () => clientPages[activeTool].send({ action: 'deleteTemplate', templateId: node('codexTemplateSelect').value }));
      for (const prefix of ['group', 'template']) {
        node(prefix + 'UsageEnabled').addEventListener('change', () => groupUsageVisibility(prefix));
        node(prefix + 'UsagePreset').addEventListener('change', () => { const values = balancePresetValues(node(prefix + 'UsagePreset').value); if (values) for (const [name,value] of Object.entries(values)) node(prefix + 'Usage' + name).value = value; groupUsageVisibility(prefix); });
        setGroupUsage(prefix);
      }
    }
    environmentKey() { const env = clientSessions()?.environmentId || 'local'; return this.id === 'codex' ? env : this.id + ':' + env; }
    fillGroupAddress() {
      const id = document.getElementById('codexProviderGroup').value;
      const address = id === 'independent' ? '' : this.organization().groups.find(g => g.id === id)?.defaults?.baseUrl || '';
      if (this.addressGroup === id) return;
      this.addressGroup = id;
      const old = el.baseUrl.value, mayFill = !old || old === this.autoAddress;
      if (mayFill) { el.baseUrl.value = address; this.autoAddress = address; }
      if (el.addMode.value === 'text' && el.addConfigText.value && address && mayFill) {
        if (this.id === 'claude') {
          try { const config = JSON.parse(el.addConfigText.value); config.env = { ...config.env, ANTHROPIC_BASE_URL: address }; el.addConfigText.value = JSON.stringify(config, null, 2); } catch { /* Preserve unfinished JSON drafts. */ }
          return;
        }
        const lines = el.addConfigText.value.split(String.fromCharCode(10)), header = lines.findIndex(line => line.trim() === '[model_providers.OpenAI]');
        if (header >= 0) {
          let index = header + 1; while (index < lines.length && !lines[index].trim().startsWith('[') && lines[index].split('=')[0].trim() !== 'base_url') index++;
          if (index < lines.length && lines[index].split('=')[0].trim() === 'base_url') lines[index] = 'base_url = ' + JSON.stringify(address); else lines.splice(header + 1, 0, 'base_url = ' + JSON.stringify(address));
          el.addConfigText.value = lines.join(String.fromCharCode(10));
        }
      }
    }

    organization() { return state[this.id + 'Organization'] || { groups: [{ id: 'independent', name: '独立供应商' }], templates: [], memberships: {}, providerOrder: [], disabledGroups: [], disabledProviders: [] }; }
    renderNameSuggestions() {
      if (activeTool !== this.id) return;
      const list = document.getElementById('providerNameSuggestions'), seen = new Set(); list.textContent = '';
      for (const name of [...this.nameHistory, ...state.providers.filter(p => p.tool === this.id && p.codexMode !== 'official').map(p => p.name)]) {
        const normalized = name.trim().normalize('NFKC').toLowerCase(); if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized); const option = document.createElement('option'); option.value = name; list.appendChild(option);
      }
    }
    providerCreated(name) {
      const normalized = name.trim().normalize('NFKC').toLowerCase();
      this.nameHistory = [name.trim(), ...this.nameHistory.filter(value => value.trim().normalize('NFKC').toLowerCase() !== normalized)].slice(0, 100);
      vscode.setState({ ...(vscode.getState() || {}), providerNameHistoryByTool: { ...(vscode.getState()?.providerNameHistoryByTool || {}), [this.id]: this.nameHistory } });
      if (activeTool === this.id) {
        el.providerName.value = ''; el.apiKey.value = ''; el.addConfigText.value = ''; el.applyNow.checked = false;
        updateAddMode(); this.draft = captureProviderDraft(); this.renderNameSuggestions();
      } else if (this.draft) {
        for (const field of this.draft.fields) {
          if (['providerName','apiKey','addConfigText'].includes(field.id)) field.value = '';
          if (field.id === 'applyNow') field.checked = false;
        }
      }
    }
    leave() {
      this.draft = captureProviderDraft();
      this.settingsDraft = [...document.getElementById('codexGroupTemplates').querySelectorAll('input, select, textarea'), ...document.getElementById('codexGroupEditor').querySelectorAll('input, select, textarea')].map(n => ({ id:n.id, value:n.value, checked:n.checked }));
      this.templatesOpen = !document.getElementById('codexGroupTemplates').hidden;
      this.groupOpen = !document.getElementById('codexGroupEditor').hidden;
    }
    enter() {
      restoreProviderDraft(this.draft);
      this.renderNameSuggestions();
      document.getElementById('codexGroupTemplates').hidden = !this.templatesOpen;
      for (const field of this.settingsDraft || []) { const n = document.getElementById(field.id); n.value = field.value; n.checked = field.checked; }
      if (!this.draft) document.getElementById('codexProviderGroup').value = 'independent';
      if (!this.settingsDraft) { document.getElementById('codexTemplateName').value = ''; document.getElementById('codexTemplateSelect').value = ''; document.getElementById('codexGroupRequestTemplate').value = ''; document.getElementById('codexGroupBaseUrl').value = ''; setProxyConfig('group'); setProxyConfig('template'); setGroupUsage('group'); setGroupUsage('template'); }
      this.addressGroup = undefined;
    }
    send(input) { post({ type: 'organizationAction', input }); }
    orderedProviders(groupId) {
      const org = this.organization(), rank = id => { const i = org.providerOrder.indexOf(id); return i < 0 ? org.providerOrder.length + state.providers.findIndex(p => p.id === id) : i; };
      return state.providers.filter(p => p.tool === this.id && p.codexMode !== 'official' && (p.groupId || org.memberships[p.id] || 'independent') === groupId)
        .sort((a,b) => Number(org.disabledProviders.includes(a.id)) - Number(org.disabledProviders.includes(b.id)) || rank(a.id) - rank(b.id));
    }
    providerPeers(provider) {
      const org = this.organization();
      return this.orderedProviders(provider.groupId || org.memberships[provider.id] || 'independent').filter(p => org.disabledProviders.includes(p.id) === org.disabledProviders.includes(provider.id));
    }
    stepProvider(id, direction) {
      const provider = state.providers.find(p => p.id === id); if (!provider) return;
      const peers = this.providerPeers(provider), index = peers.findIndex(p => p.id === id);
      if (index + direction < 0 || index + direction >= peers.length) return;
      this.send({ action: 'moveProvider', providerId: id, groupId: provider.groupId || this.organization().memberships[id] || 'independent', beforeProviderId: peers[index + (direction < 0 ? -1 : 2)]?.id });
    }
    receive(message) {
      if (message.createdGroupId) this.pendingGroup = message.createdGroupId;
      if (message.inputAction === 'deleteTemplate') { this.templateId = ''; document.getElementById('codexTemplateName').value = ''; setProxyConfig('template'); setGroupUsage('template'); }
      if (message.savedTemplateId && !message.sourceGroupId) { this.templateId = message.savedTemplateId; document.getElementById('codexTemplateSelect').value = message.savedTemplateId; }
    }
    options(id, entries, placeholder) {
      const select = document.getElementById(id), old = select.value; select.textContent = '';
      if (placeholder !== undefined) { const o = document.createElement('option'); o.value = ''; o.textContent = placeholder; select.appendChild(o); }
      for (const entry of entries) { const o = document.createElement('option'); o.value = entry.id; o.textContent = entry.name; select.appendChild(o); }
      select.value = old;
    }
    openGroup(group) {
      const owner = this.groupNodes.get(group.id); if (owner) { owner.node.open = true; owner.syncCollapse(); }
      if (this.editGroupId === group.id) { this.groupOpen = true; document.getElementById('codexGroupEditor').hidden = false; return; }
      this.groupOpen = true; this.editGroupId = group.id; this.templateSource = group.defaults?.templateName || '';
      const panel = document.getElementById('codexGroupEditor'); panel.hidden = false;
      document.getElementById('codexGroupEditorName').textContent = '群组设置 · ' + group.name;
      document.getElementById('codexGroupBaseUrl').value = group.defaults?.baseUrl || '';
      setGroupUsage('group', group.defaults?.usageQuery);
      setProxyConfig('group', group.defaults?.proxy);
      if (owner) { if (owner.body.children.length) owner.body.insertBefore(panel, owner.body.children[0]); else owner.body.appendChild(panel); }
    }
    layout() {
      el.codexSection.hidden = false;
      el.configEditor.hidden = el.configEditor.hidden || !codexApiEditable();
      const details = document.getElementById('codexConfigEditorDetails'), body = document.getElementById('configEditorBody');
      details.hidden = false; document.getElementById('configEditorHeading').hidden = true;
      body.className = 'moduleBody'; if (body.parentElement !== details) details.appendChild(body);
      document.querySelector('.shell').classList.add('managedPage'); document.getElementById('overviewTitle').hidden = false;
      document.getElementById('networkProxyPanel').className = 'module'; document.querySelector('.networkBody').className = 'networkBody moduleBody';
      document.getElementById('addProxy').hidden = true;
      setToolChoices([[this.id, labelTool(this.id)]]);
      el.tool.value = this.id; el.tool.disabled = busy;
      const add = document.getElementById('addProviderSection'); document.getElementById('codexAddProviderDetails').hidden = false;
      document.getElementById('addProviderHeading').hidden = true;
      const formHost = document.getElementById('codexAddProviderBody'); if (el.form.parentElement !== formHost) formHost.appendChild(el.form);
      document.getElementById('configurationSection').hidden = true;
      if (el.codexSection.parentElement !== document.getElementById('codexAccountsBody')) document.getElementById('codexAccountsBody').appendChild(el.codexSection);
      if (add.parentElement !== el.codexToolPanel) el.codexToolPanel.appendChild(add);
      for (const button of [el.exportButton, el.importButton]) document.getElementById('codexPublicConfigActions').appendChild(button);
      document.getElementById('codexLogActions').appendChild(el.clearLogButton);
      el.exportButton.textContent = '另存为供应商配置'; el.importButton.textContent = '导入供应商配置'; el.clearLogButton.textContent = '删除日志'; el.clearLogButton.className = 'danger';
      document.getElementById('codexProviderGroupField').hidden = false;
      document.getElementById('codexRequestDetails').hidden = false; document.getElementById('codexUsageDetails').hidden = false;
      const request = document.getElementById('codexRequestBody'), usage = document.getElementById('codexUsageBody');
      if (document.getElementById('editProxy').parentElement !== request) request.appendChild(document.getElementById('editProxy'));
      for (const node of [document.getElementById('usageEnabledLabel'), el.usageFields]) if (node.parentElement !== usage) usage.appendChild(node);
    }
    render() {
      this.renderNameSuggestions();
      const org = this.organization(), usable = !busy && state.toolEnabled[this.id] && codexApiEditable();
      this.options('codexProviderGroup', org.groups.map(g => ({ ...g, name: g.name + (org.disabledGroups.includes(g.id) ? '（已禁用，可添加）' : '') })));
      const select = document.getElementById('codexProviderGroup');
      const environment = this.environmentKey();
      const preferred = this.pendingGroup || (this.selectedEnvironment !== environment ? this.remembered[environment] : select.value);
      if (preferred && org.groups.some(g => g.id === preferred)) { select.value = preferred; if (this.pendingGroup) { this.remembered[environment] = preferred; vscode.setState?.({ ...(vscode.getState?.() || {}), lastGroupsByEnvironment: { ...(vscode.getState()?.lastGroupsByEnvironment || {}), ...this.remembered } }); } this.pendingGroup = ''; }
      this.selectedEnvironment = environment;
      this.options('codexTemplateSelect', org.templates, '选择已保存模板');
      this.options('codexGroupRequestTemplate', org.templates, '选择模板');
      this.fillGroupAddress();
      for (const id of ['codexCreateGroup', 'codexGroupTemplatesButton']) document.getElementById(id).disabled = !usable;
      for (const panelId of ['codexGroupTemplates', 'codexGroupEditor']) {
        const panel = document.getElementById(panelId), locked = !usable || panelId === 'codexGroupEditor' && org.disabledGroups.includes(this.editGroupId);
        for (const control of panel.querySelectorAll('input, select, textarea, button')) control.disabled = locked;
      }
      document.getElementById('codexDeleteTemplate').disabled = !usable || !document.getElementById('codexTemplateSelect').value;
      if (el.codexProviders.dataset.tool !== this.id) {
        document.getElementById('codexGroupEditor').hidden = true; el.codexToolPanel.appendChild(document.getElementById('codexGroupEditor'));
        for (const node of [...el.codexProviders.children]) node.remove();
        el.codexProviders.dataset.tool = this.id;
      }
      renderProviderList(this.id, el.codexProviders, state.toolEnabled[this.id]);
      const groups = [...org.groups.filter(g => !org.disabledGroups.includes(g.id)), ...org.groups.filter(g => org.disabledGroups.includes(g.id))];
      for (const [id, cached] of this.groupNodes) if (!groups.some(g => g.id === id)) {
        if (this.editGroupId === id) { const editor = document.getElementById('codexGroupEditor'); editor.hidden = true; el.codexToolPanel.appendChild(editor); this.editGroupId = ''; }
        cached.node.remove(); this.groupNodes.delete(id);
      }
      for (const group of groups) {
        let cached = this.groupNodes.get(group.id);
        if (!cached) {
          const details = document.createElement('details'); details.className = 'submodule providerGroup'; details.dataset.groupId = group.id; details.dataset.fold = 'group:' + group.id;
          details.open = foldsByEnvironment[foldKey()]?.[details.dataset.fold] !== false;
          const summary = document.createElement('summary'), heading = document.createElement('span'), title = document.createElement('span'), collapse = document.createElement('button'), controls = document.createElement('div'), body = document.createElement('div');
          summary.className = 'organizationHeading'; heading.className = 'organizationName groupTitle'; collapse.className = 'groupCollapse'; collapse.type = 'button'; controls.className = 'groupActions'; body.className = 'moduleBody groupProviders'; heading.append(collapse, title); summary.append(heading, controls); details.append(summary, body);
          const syncCollapse = () => {
            collapse.textContent = details.open ? '▾' : '▸';
            collapse.setAttribute('aria-expanded', String(details.open));
            collapse.title = (details.open ? '收起群组：' : '展开群组：') + details.dataset.groupName;
            collapse.setAttribute('aria-label', collapse.title);
          };
          collapse.addEventListener('click', event => { event?.preventDefault?.(); event?.stopPropagation?.(); details.open = !details.open; syncCollapse(); });
          details.addEventListener('toggle', syncCollapse);
          codexHoldDrag(summary, 'application/agentdeck-group', group.id, () => !busy && state.toolEnabled[this.id] && codexApiEditable());
          details.addEventListener('dragover', event => event.preventDefault());
          details.addEventListener('drop', event => {
            event.preventDefault(); event.stopPropagation?.(); if (busy || !state.toolEnabled[this.id] || !codexApiEditable()) return;
            const providerId = event.dataTransfer.getData('application/agentdeck-provider'), sourceGroup = event.dataTransfer.getData('application/agentdeck-group');
            if (providerId) this.send({ action: 'moveProvider', providerId, groupId: group.id });
            else if (sourceGroup && sourceGroup !== group.id) {
              const org = this.organization(), peers = org.groups.filter(g => org.disabledGroups.includes(g.id) === org.disabledGroups.includes(group.id));
              const index = peers.findIndex(g => g.id === group.id);
              this.send({ action: 'moveGroup', groupId: sourceGroup, beforeGroupId: codexDropAfter(event, summary) ? peers[index + 1]?.id : group.id });
            }
          });
          cached = { node: details, title, controls, body, syncCollapse }; this.groupNodes.set(group.id, cached);
        }
        const disabled = org.disabledGroups.includes(group.id), providers = state.providers.filter(p => p.tool === this.id && p.codexMode !== 'official' && (p.groupId || org.memberships[p.id] || 'independent') === group.id);
        const current = clientMode() === 'api' && providers.some(p => p.id === state.currentProviderIds[this.id]);
        cached.title.textContent = group.name + ' · ' + providers.length + ' 个供应商' + (disabled ? ' · 已禁用' : '') + (disabled && current ? ' · 当前配置仍在使用' : '');
        cached.node.dataset.groupName = group.name; cached.syncCollapse();
        cached.node.classList.toggle('organizationDisabled', disabled); cached.controls.textContent = '';
        const button = (label, action, allowed = true) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.disabled = !usable || !allowed; b.addEventListener('click', event => { event?.preventDefault?.(); event?.stopPropagation?.(); action(); }); cached.controls.appendChild(b); return b; };
        cached.controls.appendChild(codexSwitch(!disabled, group.name + '群组', !usable, () => this.send({ action: 'toggleGroup', groupId: group.id, enabled: disabled })));
        const peers = groups.filter(g => org.disabledGroups.includes(g.id) === disabled), index = peers.findIndex(g => g.id === group.id);
        for (const direction of [-1, 1]) {
          const arrow = button(direction < 0 ? '↑' : '↓', () => this.send({ action: 'moveGroup', groupId: group.id, beforeGroupId: peers[index + (direction < 0 ? -1 : 2)]?.id }), index + direction >= 0 && index + direction < peers.length);
          arrow.title = direction < 0 ? '群组上移一位' : '群组下移一位'; arrow.setAttribute('aria-label', arrow.title);
        }
        button('群组设置', () => this.openGroup(group), !disabled);
        button('重命名', () => this.send({ action: 'renameGroup', groupId: group.id }), !disabled && group.id !== 'independent');
        const remove = button('删除群组', () => this.send({ action: 'deleteGroup', groupId: group.id }), group.id !== 'independent'); remove.className = 'danger';
        if (disabled) for (const b of [...cached.controls.children].slice(3)) if (b !== remove) b.remove();
        for (const provider of this.orderedProviders(group.id)) {
          const card = providerNodes.get(this.id + ':' + provider.id)?.node; if (!card) continue;
          const peers = this.providerPeers(provider), index = peers.findIndex(p => p.id === provider.id);
          for (const arrow of card.querySelectorAll('[data-order-step]')) {
            const allowed = usable && index + Number(arrow.dataset.orderStep) >= 0 && index + Number(arrow.dataset.orderStep) < peers.length;
            arrow.disabled = !allowed; arrow.dataset.disabledIdle = String(!allowed);
          }
          cached.body.appendChild(card);
        }
        for (const empty of cached.body.querySelectorAll('.groupEmpty')) empty.remove();
        if (!providers.length) { const empty = document.createElement('div'); empty.className = 'small groupEmpty'; empty.textContent = '空群组：可拖入供应商，或在添加供应商时选择本群组。'; cached.body.appendChild(empty); }
        el.codexProviders.appendChild(cached.node);
      }
      if (this.groupOpen && this.editGroupId && !org.disabledGroups.includes(this.editGroupId)) { const owner = this.groupNodes.get(this.editGroupId); if (owner) { const editor = document.getElementById('codexGroupEditor'); document.getElementById('codexGroupEditorName').textContent = '群组设置 · ' + (org.groups.find(g => g.id === this.editGroupId)?.name || ''); owner.body.appendChild(editor); editor.hidden = false; } }
      if (!el.configEditor.hidden && configEditorTool === this.id) { const card = providerNodes.get(this.id + ':' + configEditorProviderId)?.node; if (card) card.appendChild(el.configEditor); }
    }
  }
`; }
