import * as vscode from 'vscode';
import { randomBytes } from 'crypto';

export interface HistoryTreeRow { accountId?: string; environmentId?: string; projectId?: string; key: string; account: string; environment: string; project: string; title: string; updated: number; disabled: boolean; reason?: string }
/** A metadata-only selection tree. Transcripts are opened by native extensions.
 * Add and remove are separate modes; disabled rows never enter the result. */
export async function pickHistoryTree(tool: string, rows: HistoryTreeRow[], mode: 'add' | 'remove', problems: string[] = []): Promise<string[] | undefined> {
  const panel = vscode.window.createWebviewPanel('agentdeck.historySelection', tool + ' · ' + (mode === 'add' ? '选择历史项目' : '管理已显示历史'), vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
  const allowed = new Set(rows.filter(r => !r.disabled).map(r => r.key));
  panel.webview.html = historyTreeHtml(rows, mode, problems);
  return new Promise(resolve => {
    let settled = false;
    const done = (value?: string[]) => { if (!settled) { settled = true; resolve(value); } };
    panel.onDidDispose(() => done());
    panel.webview.onDidReceiveMessage(m => {
      if (m?.type === 'cancel') { done(); panel.dispose(); }
      if (m?.type === 'submit' && Array.isArray(m.keys) && m.keys.every((k: unknown) => typeof k === 'string' && allowed.has(k))) { done([...new Set<string>(m.keys)]); panel.dispose(); }
    });
  });
}
export function historyTreeHtml(rows: HistoryTreeRow[], mode: 'add' | 'remove', problems: string[]): string {
  const nonce = randomBytes(18).toString('hex');
  const html = historyTreeMarkup(rows);
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'"><style nonce="${nonce}">
  [hidden]{display:none!important}body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:20px}h1{font-size:1.4em}.intro{border-left:4px solid var(--vscode-focusBorder);padding:10px;background:var(--vscode-textBlockQuote-background)}details{margin:10px 0;border:1px solid var(--vscode-panel-border);border-left:4px solid var(--vscode-focusBorder);border-radius:5px}.level1{background:var(--vscode-sideBar-background)}.level2{border-left-color:var(--vscode-descriptionForeground);background:var(--vscode-editor-background)}.level3{border-left-color:var(--vscode-textBlockQuote-border);background:var(--vscode-input-background)}summary{padding:10px;cursor:pointer;font-weight:600;overflow-wrap:anywhere}input{margin-right:9px;accent-color:var(--vscode-focusBorder)}.children{padding:0 12px 8px 22px}.chat{display:flex;gap:8px;align-items:center;padding:9px;border-bottom:1px solid var(--vscode-panel-border)}.chat span{flex:1;overflow-wrap:anywhere}.chat small{color:var(--vscode-descriptionForeground)}.unavailable{color:var(--vscode-disabledForeground)}input:disabled{opacity:.45}footer{position:sticky;bottom:0;padding:14px;background:var(--vscode-editor-background);border-top:1px solid var(--vscode-panel-border)}button{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:0;padding:8px 16px;margin-right:12px;cursor:pointer}button:disabled{opacity:.5;cursor:default}.problems{color:var(--vscode-editorWarning-foreground);white-space:pre-wrap}#filter{width:95%;padding:8px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border)}
  </style></head><body><h1>${mode === 'add' ? '选择历史项目' : '管理已显示历史'}</h1><p class="intro">${mode === 'add' ? '按帐号／API 模式 → 环境 → 项目浏览，可勾选整组或单条聊天。这里只增量添加；灰色项已经显示，只能从“管理已显示历史”移除。添加独立副本，续聊不改来源；新聊天保存位置不变。' : '勾选需要隐藏的已添加历史。移除后重载原生扩展；来源聊天和副本中的续聊内容均保留。原生默认已有的聊天不在此删除。'}</p><input id="filter" aria-label="搜索帐号、环境、项目或聊天" placeholder="搜索帐号、环境、项目或聊天"><p class="problems">${esc(problems.length ? '部分历史暂不可用，其余可继续选择：\n' + problems.join('\n') : '')}</p><main>${html || '<p>没有可选择的历史。</p>'}</main><footer><button id="submit" disabled>${mode === 'add' ? '添加所选历史' : '移除所选展示'}</button><button id="cancel">取消</button><span id="count">已选择 0 条</span></footer><script nonce="${nonce}">
  const vscode=acquireVsCodeApi();
  const leaves=()=>[...document.querySelectorAll('.leaf:not(:disabled)')];
  function update(){const selected=new Set(leaves().filter(e=>e.checked).map(e=>e.dataset.key));document.getElementById('count').textContent='已选择 '+selected.size+' 条';document.getElementById('submit').disabled=!selected.size;for(const g of document.querySelectorAll('.group')){const all=[...g.closest('details').querySelectorAll('.leaf:not(:disabled)')];g.checked=all.length>0&&all.every(e=>e.checked);g.indeterminate=all.some(e=>e.checked)&&!g.checked;}}
  document.addEventListener('change',e=>{if(e.target.matches('.group')){for(const leaf of e.target.closest('details').querySelectorAll('.leaf:not(:disabled)')){for(const same of leaves().filter(x=>x.dataset.key===leaf.dataset.key))same.checked=e.target.checked;}}if(e.target.matches('input[type=checkbox]')){for(const leaf of leaves().filter(x=>x.dataset.key===e.target.dataset.key))leaf.checked=e.target.checked;update();}});
  document.addEventListener('click',e=>{if(e.target.matches('summary input'))e.stopPropagation();});
  document.getElementById('filter').addEventListener('input',e=>{const q=e.target.value.toLocaleLowerCase();for(const item of document.querySelectorAll('.chat')){let text=item.textContent;for(let d=item.closest('details');d;d=d.parentElement.closest('details'))text+=' '+d.querySelector('summary').textContent;item.hidden=!text.toLocaleLowerCase().includes(q);}for(const d of [...document.querySelectorAll('details')].reverse()){d.hidden=![...d.querySelectorAll('.chat')].some(r=>!r.hidden);if(q&&!d.hidden)d.open=true;}});
  document.getElementById('submit').addEventListener('click',()=>vscode.postMessage({type:'submit',keys:[...new Set(leaves().filter(e=>e.checked).map(e=>e.dataset.key))]}));document.getElementById('cancel').addEventListener('click',()=>vscode.postMessage({type:'cancel'}));update();
  </script></body></html>`;
}
export function historyTreeMarkup(rows: HistoryTreeRow[]): string {
  const tree = new Map<string, Map<string, Map<string, HistoryTreeRow[]>>>();
  for (const r of rows) { const row = { ...r, account: JSON.stringify([r.accountId ?? r.account, r.account]), environment: JSON.stringify([r.environmentId ?? r.environment, r.environment]), project: JSON.stringify([r.projectId ?? r.project, r.project]) }; if (!tree.has(row.account)) tree.set(row.account, new Map()); const envs = tree.get(row.account)!; if (!envs.has(row.environment)) envs.set(row.environment, new Map()); const projects = envs.get(row.environment)!; if (!projects.has(row.project)) projects.set(row.project, []); projects.get(row.project)!.push(row); }
  const group = (label: string, content: string, disabled: boolean, level: number) => '<details class="level' + level + '" ' + (level < 3 ? 'open' : '') + '><summary><input type="checkbox" class="group" aria-label="选择 ' + esc(JSON.parse(label)[1]) + '" ' + (disabled ? 'disabled' : '') + '><span>' + esc(JSON.parse(label)[1]) + '</span></summary><div class="children">' + content + '</div></details>';
  const html = [...tree].map(([account, envs]) => group(account, [...envs].map(([env, projects]) => group(env, [...projects].map(([project, chats]) => group(project, chats.map(r => '<label class="chat ' + (r.disabled ? 'unavailable' : '') + '"><input type="checkbox" class="leaf" data-key="' + esc(r.key) + '" ' + (r.disabled ? 'disabled checked' : '') + '><span>' + esc(r.title) + '</span><small>' + esc(r.reason || new Date(r.updated).toLocaleString()) + '</small></label>').join(''), chats.every(r => r.disabled), 3)).join(''), [...projects.values()].flat().every(r => r.disabled), 2)).join(''), [...envs.values()].flatMap(m => [...m.values()].flat()).every(r => r.disabled), 1)).join('');
  return html;
}
function esc(s: string): string { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)); }
