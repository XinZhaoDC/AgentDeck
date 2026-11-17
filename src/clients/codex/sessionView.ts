export function sessionPanelHtml(): string {
  return `
  <section class="section moduleWrap" id="codexAccountsSection"><details class="module" data-fold="accounts-api" open><summary><h2>账号与 API / Accounts &amp; API</h2></summary><div id="codexAccountsBody" class="moduleBody">
    <p class="moduleIntro">选择登录方式，再管理对应账号或供应商。另一种方式的配置保留并以只读显示。</p>
    <section id="sessionPanel"><details class="submodule" data-fold="mode" open><summary><h3 id="sessionPanelTitle">登录方式 / Sign-in mode</h3></summary><div id="codexSessionControls" class="moduleBody">
      <div id="codexCurrentMode" class="modeBadge" role="status" aria-live="polite">读取当前模式…</div><div id="codexModeDetail" class="small"></div>
      <div class="modeActions"><button id="codexOfficialMode" type="button">官方账号 / Official account</button><button id="codexApiMode" type="button">API 模式 / API</button></div>
      <div id="codexModeNext" class="workflowHint"></div><button id="reloadIdentityButton" class="primary" hidden>重新加载窗口 / Reload window</button>
    </div></details></section>
    <section id="officialAccountsSection"><details class="submodule" data-fold="accounts" open><summary><h3>官方账号 / Official accounts</h3></summary><div class="moduleBody">
      <p class="moduleIntro">为每个官方账号保存独立历史档案。请先连接数据目录；登录缓存仅在当前环境复用。</p>
      <div id="officialReadOnly" class="small"></div><div id="officialAccountsList" class="providerList"></div><button id="addIdentityButton">添加官方账号 / Add account</button>
      <details id="officialDiagnostics" class="submodule" data-fold="official-diagnostics"><summary><h4>当前账号诊断 / Current account diagnostics</h4></summary><div class="moduleBody">
        <div class="actions"><button id="standardOfficialSpeedButton">测试生成与速度 / Test generation and speed</button><button id="quickOfficialSpeedButton" hidden>Quick Speed Test</button><button id="officialInfoButton">模型与额度 / Models and limits</button></div>
        <p class="usageNote">ⓘ 注：生成测试执行三次短请求，消耗当前账号额度；报告首轮结果及三轮中位数。模型与额度读取不切换账号。</p>
        <div id="officialInfoResult" class="small"></div><div id="officialSpeedResult" class="diagnosticResults"></div>
      </div></details>
      <div id="claudeOfficialGuide" class="usageNote" hidden>ⓘ 注：此处管理 claude.ai 订阅账号；登录、刷新与退出由原生 Claude 管理；请在 Claude 中用 /status、/usage 确认账号和额度。官方 → API → 同一官方档案会保留登录状态，不调用退出登录。首次使用新档案/环境或认证失效时仍需登录。</div><p class="usageNote">ⓘ 注：账号名称是本地档案别名，请在原生客户端确认对应账号。浏览器授权页面需自行确认其网络出口。</p>
    </div></details></section>
  </div></details></section>`;
}
export function storagePanelHtml(): string {
  return `<section class="section moduleWrap" id="codexDataSection"><details class="module" data-fold="storage" open><summary><h2>数据与存储 / Data &amp; storage</h2></summary><div class="moduleBody">
    <p id="storageIntro" class="moduleIntro">连接数据目录，按账号共享原生历史；认证与客户端配置按环境保存。</p>
    <div id="sessionStorage" class="small"></div><div id="identityStatus" class="small"></div>
    <div class="actions"><button id="sessionStorageButton">连接数据目录 / Connect storage</button><button id="openDataFolderButton">浏览数据文件 / Browse data</button></div>
    <details class="submodule" data-fold="history-labels" id="historyLabelsSection"><summary><h3>历史标签设置 / History labels</h3></summary><div class="moduleBody">
      <button id="manageHistoryLabelsButton" aria-describedby="historyLabelsHelp">历史标签管理…</button>
      <p id="historyLabelsHelp" class="usageNote">ⓘ 注：管理官方帐号/API来源、环境与项目标签，保留原名与路径；支持共用标签、手动归类和结构树预览。</p>
      <div id="codexHistoryIndexControls" class="historySettingsAction" hidden>
        <button id="refreshNativeHistoryButton" aria-describedby="nativeHistoryIndexHelp nativeHistoryIndexStatus">升级/刷新原生历史索引</button>
        <p id="nativeHistoryIndexHelp" class="usageNote">ⓘ Codex 专用：更新聊天文件在本环境的路径索引，不改变已选历史。添加／移除历史会自动更新；手动操作前请结束任务，完成后重载。Claude Code 直接扫描项目历史，无需此步骤。</p>
        <div id="nativeHistoryIndexStatus" class="small historyIndexStatus" role="status"></div>
      </div>
      <details class="submodule" data-fold="history-api-source-help"><summary><h4>API 来源记录说明</h4></summary><div class="moduleBody"><p class="usageNote">ⓘ 注：新 API 聊天按创建时名称分组，旧来源不追溯；升级后重新应用当前 API 并重载。Codex 首次需在原生 /hooks 信任来源记录命令；禁用 hooks 时无法自动记录。</p></div></details>
    </div></details>
    <details class="submodule" data-fold="native-history"><summary><h3>原生历史 / Native history</h3></summary><div class="moduleBody">
      <p id="nativeHistoryGuide" class="usageNote"></p><div id="nativeHistoryScope" class="small" data-raw-value="true"></div>
      <div class="actions"><button id="openNativeHistoryButton">打开原生扩展</button><button id="selectHistoryProjectButton">选择历史项目…</button><button id="clearHistoryProjectButton">管理已显示历史…</button></div>
    </div></details>
    <details id="codexBackupSection" class="submodule" data-fold="backup"><summary><h3>历史备份 / History backups</h3></summary><div class="moduleBody">
      <p class="usageNote">ⓘ 注：每次创建独立完整快照，旧备份保留；包含共享聊天、名称记录及已有旧索引，不含登录凭据、客户端配置或项目源码；本环境运行索引可重建。备份时请暂停写入聊天。</p>
      <div id="historyBackupPath" class="small"></div>
      <div class="actions"><button id="backupSessionsButton">备份当前历史 / Back up history</button><button id="manageBackupsButton">浏览历史备份 / Browse backups</button></div>
      <button id="deleteHistoryBackupsButton" class="danger">删除历史备份… / Delete backups…</button>
    </div></details>
    <details id="codexConfigTransferSection" class="submodule" data-fold="config-transfer"><summary><h3>供应商配置 / Provider configuration</h3></summary><div class="moduleBody">
      <p class="usageNote">ⓘ 注：保存当前客户端 API 供应商的地址、模型和配置选项，不保存聊天或已存储的密钥。两个保存按钮内容相同，仅位置不同；导入不自动应用。</p>
      <div id="providerExportPath" class="small"></div><div id="codexPublicConfigActions" class="actions"></div><button id="exportProvidersButton">保存到数据目录 / Save to data folder</button>
    </div></details>
    <details id="codexLogSection" class="submodule" data-fold="logs"><summary><h3>操作日志 / Operation logs</h3></summary><div class="moduleBody">
      <p class="usageNote">ⓘ 注：未连接数据目录时使用插件默认日志路径；连接目录时搬迁已有日志。日志按环境保存，不记录认证或聊天正文。</p>
      <div id="operationLogPath" class="small"></div><div id="codexLogActions" class="actions"><button id="viewOperationLogButton">查看当前日志 / View current log</button><button id="openOperationLogButton">浏览日志 / Browse logs</button><button id="exportOperationLogButton">导出诊断日志 / Export logs</button></div>
    </div></details>
    <details class="submodule" data-fold="storage-help"><summary><h3>目录说明 / Folder guide</h3></summary><div class="moduleBody">
      <p id="clientFolderGuide" class="usageNote"></p>
      <div id="storageReadmePath" class="small"></div><button id="storageHelpButton">打开目录说明 / Open folder guide</button>
    </div></details><div id="sessionMessage" class="small"></div>
  </div></details></section>`;
}
export function sessionPanelScript(): string {
  return `
    const sessionsEl = Object.fromEntries(['sessionPanelTitle', 'codexSessionControls', 'officialAccountsSection', 'officialAccountsList', 'officialReadOnly', 'codexDataSection', 'sessionStorage', 'identityStatus', 'sessionMessage', 'sessionStorageButton', 'addIdentityButton', 'openDataFolderButton', 'backupSessionsButton', 'manageBackupsButton', 'deleteHistoryBackupsButton', 'storageHelpButton', 'exportProvidersButton', 'reloadIdentityButton', 'codexModeNext'].map(id => [id, document.getElementById(id)]));
    function sessionAction(action, identityId) {
      if (busy) return;
      post({ type: 'sessionAction', action, identityId });
    }
    for (const [id, action] of [['sessionStorageButton', 'configure'], ['addIdentityButton', 'add'], ['openDataFolderButton', 'openFolder'], ['backupSessionsButton', 'backup'], ['manageBackupsButton', 'manageBackups'], ['deleteHistoryBackupsButton', 'deleteHistoryBackups'], ['storageHelpButton', 'help'], ['exportProvidersButton', 'exportProviders'], ['reloadIdentityButton', 'reload']]) sessionsEl[id].addEventListener('click', () => { if (!sessionsEl[id].disabled) sessionAction(action); });
    document.getElementById('refreshNativeHistoryButton').addEventListener('click', () => { if (!document.getElementById('refreshNativeHistoryButton').disabled) sessionAction('refreshHistory'); });
    for (const [id, action] of [['openNativeHistoryButton', 'openNativeHistory'], ['selectHistoryProjectButton', 'selectHistoryProject'], ['clearHistoryProjectButton', 'clearHistoryProject'], ['manageHistoryLabelsButton', 'labelHistoryProject']]) document.getElementById(id).addEventListener('click', () => { if (!document.getElementById(id).disabled) sessionAction(action); });
    function clientSessions(tool = activeTool) { return tool === 'claude' ? state.claudeSessions : state.sessions; }
    function clientMode(tool = activeTool) { return tool === 'claude' ? state.claudeMode || 'unknown' : state.codexMode; }
    function activeCodexIdentity() { const s = clientSessions(); return s?.identities?.find(identity => identity.id === s.activeId); }
    function codexIdentityReady(kind) {
      const s = clientSessions();
      return !s?.restartRequired && !s?.legacy && (!s?.root || s.attached && activeCodexIdentity()?.kind === kind);
    }
    function codexApiEditable() { return codexIdentityReady('api') && (activeCodexIdentity()?.kind === 'api' || clientMode() === 'api'); }
    function renderSessions() {
      const s = clientSessions() || { identities: [], attached: false };
      const active = activeCodexIdentity();
      const pending = Boolean(s.restartRequired);
      const kind = active?.kind || clientMode();
      const official = kind === 'official'; const api = kind === 'api';
      const apiSetup = active?.kind === 'api' && clientMode() !== 'api';
      const locked = busy || !state.toolEnabled[activeTool] || pending;
      const status = state.apiStatuses?.find(row => row.tool === activeTool);
      document.getElementById('codexAccountsSection').hidden = false;
      document.getElementById('sessionPanel').hidden = false;
      sessionsEl.codexSessionControls.hidden = false;
      sessionsEl.officialAccountsSection.hidden = false;
      sessionsEl.codexDataSection.hidden = false;
      el.codexCurrentMode.textContent = pending ? '◷ 绑定已更改 · 待重载' : apiSetup ? '◷ API 共享历史已启用 · 待应用供应商' : official ? '● 官方账号 / Official account' : api ? '● API 模式 / API' : '○ 模式待确认';
      el.codexCurrentMode.className = 'modeBadge ' + (pending || apiSetup ? 'warning' : official ? 'official' : api ? 'api' : 'warning');
      el.codexModeDetail.dataset.rawValue = 'true';
      el.codexModeDetail.textContent = pending ? '重载窗口让 ' + labelTool(activeTool) + ' 读取新的配置与目录。'
        : apiSetup ? ui('下一步：在 API 供应商中选择并应用。官方认证未带入此 API 档案。', 'Next: apply a provider below. Official credentials are not reused in this API profile.')
        : official ? ui('当前档案：', 'Current profile: ') + (active?.name || ui('尚未管理', 'Unmanaged')) + (status?.status === 'signedIn' ? ui('；本环境已登录。', '; signed in here.') : '；请在原生 ' + labelTool(activeTool) + ' 中确认登录。')
        : api ? ui('当前档案：API 共享历史。所有 API 供应商共用；应用只更改当前环境的配置。', 'All API providers share one API history; applying changes only this environment.') : ui('点击全局刷新状态重新读取。', 'Refresh status to read the current configuration.');
      el.codexOfficialMode.textContent = official ? '✓ 官方账号 / Official' : '切换到官方账号 / Official';
      el.codexApiMode.textContent = api ? '✓ API 模式 / API' : '切换到 API / API';
      el.codexOfficialMode.className = official ? 'modeCurrent official' : 'primary';
      el.codexApiMode.className = api ? 'modeCurrent api' : 'primary';
      el.codexOfficialMode.disabled = locked || s.legacy || official;
      el.codexApiMode.disabled = locked || s.legacy || api;
      sessionsEl.codexModeNext.textContent = pending ? '下一步：重载窗口，并重启已有 CLI，再打开 ' + labelTool(activeTool) + '。'
        : !s.root ? '先在“数据与存储”连接目录；切换到 API 时自动建立或使用唯一的 API 共享历史，官方账号历史分别保留。'
        : s.legacy ? '旧版目录仍保留，请通过“连接/迁入目录”升级存储结构。'
        : !s.attached ? '目录绑定异常，请检查挂载并重新连接。'
        : api ? '在下方选择 API 供应商并应用；历史在原生客户端查看。' : '选择下方账号切换；历史在原生客户端查看。';
      sessionsEl.officialReadOnly.textContent = !s.root ? '先在数据与存储连接目录，才能添加多个官方账号。' : api ? '当前为 API 模式，此区域只读。通过上方模式按钮切回官方账号。' : '';
      sessionsEl.officialAccountsSection.classList.toggle('toolDisabled', api);
      sessionsEl.officialAccountsList.textContent = '';
      const accounts = (s.identities || []).filter(i => i.kind === 'official');
      if (!accounts.length) { const empty = document.createElement('div'); empty.className = 'small'; empty.textContent = '尚未添加官方账号档案。'; sessionsEl.officialAccountsList.appendChild(empty); }
      for (const identity of accounts) {
        const selected = identity.id === s.activeId;
        const current = selected && official && clientMode() === 'official' && !pending && s.attached;
        const row = document.createElement('div'); row.dataset.identityId = identity.id; row.className = 'provider' + (current ? ' active' : '');
        const title = document.createElement('div'); title.className = 'providerName'; title.dataset.rawValue = 'true'; title.textContent = identity.name; row.appendChild(title);
        if (current) { const badge = document.createElement('span'); badge.className = 'badge currentUse'; badge.textContent = '✓ 当前使用'; row.appendChild(badge); }
        const actions = document.createElement('div'); actions.className = 'actions';
        for (const [label, action] of [[current ? '✓ 当前使用' : selected && pending ? '待重载' : '使用 / Use', 'switch'], ['重命名 / Rename', 'rename']]) {
          const button = document.createElement('button'); button.textContent = label; button.disabled = locked || api || s.legacy || action === 'switch' && identity.id === s.activeId && s.attached;
          if (current && action === 'switch') button.className = 'currentUse';
          button.addEventListener('click', () => sessionAction(action, identity.id)); actions.appendChild(button);
        }
        row.appendChild(actions); sessionsEl.officialAccountsList.appendChild(row);
      }
      sessionsEl.addIdentityButton.disabled = locked || api || !s.root || s.legacy;
      document.getElementById('operationLogPath').textContent = '当前日志目录：' + (state.logDirectories?.[activeTool] || state.logDirectory || '读取中');
      sessionsEl.sessionStorage.textContent = '统一数据目录：' + (s.root || '未设置') + (activeTool === 'claude' ? ' · CLAUDE_CONFIG_DIR：' : ' · CODEX_HOME：') + (s.runtimeHome || '未知');
      for (const [id, child] of [['historyBackupPath','backups'],['providerExportPath','providers'],['storageReadmePath','readme.md']]) document.getElementById(id).textContent = s.root ? s.root + '/' + child : '连接数据目录后显示位置';
      sessionsEl.identityStatus.textContent = s.legacy ? '旧版结构，等待显式迁入。' : s.attached ? '历史目录链接有效；原生列表仍受索引及项目筛选影响。配置及认证按环境隔离。' : '尚未连接账号历史。';
      document.getElementById('codexHistoryIndexControls').hidden = activeTool !== 'codex';
      document.getElementById('refreshNativeHistoryButton').hidden = activeTool !== 'codex';
      document.getElementById('refreshNativeHistoryButton').disabled = locked || !s.root || s.legacy || !s.attached;
      const claude = activeTool === 'claude', importedCount = s.nativeHistory?.importedCount || 0;
      document.getElementById('nativeHistoryGuide').textContent = 'ⓘ 注：按“官方帐号／API 模式 → 环境 → 项目”多选历史，支持单条聊天。选择入口只增量添加，已添加项置灰；移除请到“管理已显示历史”。载入独立续聊副本，来源记录与新聊天保存位置不变；改动后请重载原生扩展。';
      document.getElementById('nativeHistoryScope').textContent = s.nativeHistory?.error || ('当前原生范围已添加 ' + importedCount + ' 条历史；原生默认已有的聊天不由此入口隐藏。') + (s.nativeHistory?.legacyMapping || s.nativeHistory?.owned ? '；检测到旧版浏览入口，请先在管理中解除并重载。' : '');
      document.getElementById('nativeHistoryIndexStatus').hidden = claude || s.nativeHistory?.index !== 'legacy';
      document.getElementById('nativeHistoryIndexStatus').textContent = '当前索引需要升级；完成后请重载窗口。';
      document.getElementById('refreshNativeHistoryButton').textContent = '升级/刷新原生历史索引';
      document.getElementById('openNativeHistoryButton').textContent = importedCount ? '查看已添加会话…' : '打开原生扩展';
      document.getElementById('openNativeHistoryButton').disabled = locked || !s.attached;
      document.getElementById('selectHistoryProjectButton').hidden = false;
      document.getElementById('clearHistoryProjectButton').hidden = false;
      document.getElementById('selectHistoryProjectButton').disabled = locked || !s.attached || Boolean(s.nativeHistory?.error);
      document.getElementById('clearHistoryProjectButton').disabled = locked || !s.attached || !(importedCount || s.nativeHistory?.owned || s.nativeHistory?.legacyMapping);
      document.getElementById('manageHistoryLabelsButton').disabled = locked || !s.attached;
      sessionsEl.sessionMessage.textContent = (s.message || '') + (activeTool === 'claude' ? (s.runtimeConfigDir ? ' 外部终端请将 CLAUDE_CONFIG_DIR 设为 ' + s.runtimeConfigDir + ' 后启动 claude。' : ' 此档案沿用原生默认目录；外部终端请保持 CLAUDE_CONFIG_DIR 未设置或为空。') + ' 已运行的 CLI 需重启。' : '');
      document.getElementById('clientFolderGuide').textContent = 'ⓘ 注：使用所选目录的 ' + activeTool + ' 子目录；profiles 保存按账号共享的历史，environments 保存本环境绑定与配置，backups 保存手动快照，providers 保存公共供应商导出。';
      sessionsEl.sessionStorageButton.disabled = locked;
      sessionsEl.openDataFolderButton.disabled = busy || !s.root;
      for (const id of ['backupSessionsButton', 'manageBackupsButton', 'deleteHistoryBackupsButton', 'storageHelpButton', 'exportProvidersButton']) sessionsEl[id].disabled = busy || pending || !s.root || s.legacy || !s.attached;
      sessionsEl.reloadIdentityButton.hidden = !pending; sessionsEl.reloadIdentityButton.disabled = busy;
    }
  `;
}
