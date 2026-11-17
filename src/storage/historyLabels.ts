import { apiSourceId, readApiHistorySource } from './historySources';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import { FileRecovery } from '../config/recovery';
import { sharedDirectory } from '../clients/codex/history/sharedPermissions';
import type { CodexIdentity } from '../clients/codex/history/codexProfiles';
import type { HistoryCandidate, HistoryImport } from './historyImports';
import type { HistoryTreeRow } from '../ui/historyPicker';
import { HistoryCatalog } from './historyCatalog';

export interface HistoryPlacement { apiSource?: string; environment?: string; origin?: 'manual'; updatedAt?: string }
export interface HistoryLabelData {
  version: 1;
  sourceLabels: Record<string, string>; environmentLabels: Record<string, string>;
  projectLabels: Record<string, string>; projectLinks: Record<string, string>;
  apiSources: Record<string, { name: string }>;
  placements: Record<string, HistoryPlacement>;
}
export interface LabelSource { id: string; name: string; kind: 'official' | 'api' }
export interface LabelProject { id: string; environment: string; original: string }
export interface LabelSession {
  key: string; profileId: string; profileName: string; kind: 'official' | 'api';
  project: string; original: string; environments: string[]; title: string; updated: number;
  present: boolean; native: boolean; recordedSource?: string;
}
export interface HistoryLabelModel {
  revision: string; data: HistoryLabelData; sources: LabelSource[];
  environments: Array<{ id: string; name: string }>;
  projects: LabelProject[]; sessions: LabelSession[]; providers: string[]; problems: string[];
}
const empty = (): HistoryLabelData => ({ version: 1, sourceLabels: {}, environmentLabels: {}, projectLabels: {}, projectLinks: {}, apiSources: {}, placements: {} });
export const projectLabelKey = (environment: string, original: string): string => createHash('sha256').update(environment + '\0' + original).digest('hex');
export const labelText = (label: string | undefined, original: string): string => label?.trim() && label.trim() !== original ? label.trim() + ' / ' + original : original;
const revision = (data: HistoryLabelData): string => createHash('sha256').update(JSON.stringify(data)).digest('hex');

/** Shared presentation metadata only. No profile name, native file, login,
 * provider setting or project path is rewritten. API provenance is explicit
 * manual classification or a native new-session receipt, never inferred from
 * the provider currently applied while browsing history. */
export class HistoryLabels {
  private readonly file: string;
  private readonly recovery: string;
  constructor(readonly root: string) { this.file = path.join(root, 'history-labels.json'); this.recovery = path.join(root, '.history-label-recovery', 'current'); }
  async read(): Promise<HistoryLabelData> {
    const data = await fs.readFile(this.file, 'utf8').then(JSON.parse).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; return empty(); });
    if (data.version !== 1) throw new Error('历史标签版本无效。');
    for (const key of Object.keys(empty()).filter(k => k !== 'version')) if (!data[key] || typeof data[key] !== 'object' || Array.isArray(data[key])) throw new Error('历史标签记录无效。');
    for (const key of ['sourceLabels', 'environmentLabels', 'projectLabels', 'projectLinks']) if (Object.values(data[key]).some(v => typeof v !== 'string')) throw new Error('历史标签值无效。');
    for (const [id, source] of Object.entries(data.apiSources) as Array<[string, any]>) if (!/^api:[a-f0-9-]{36}$/i.test(id) || typeof source?.name !== 'string') throw new Error('API来源记录无效。');
    for (const value of Object.values(data.placements) as any[]) if (!value || typeof value !== 'object' || value.apiSource !== undefined && typeof value.apiSource !== 'string' || value.environment !== undefined && typeof value.environment !== 'string') throw new Error('历史归属记录无效。');
    return data;
  }
  async model(profiles: CodexIdentity[], candidates: HistoryCandidate[], providers: string[] = [], problems: string[] = []): Promise<HistoryLabelModel> {
    const saved = await this.read(), data = structuredClone(saved), catalog = await new HistoryCatalog(this.root).read();
    const sessions: LabelSession[] = candidates.map(s => ({ key: s.key, profileId: s.profileId, profileName: s.profileName, kind: s.kind, project: s.project, original: s.cwd || s.project, environments: s.environments.map(e => e.id), title: s.title, updated: s.updated, present: s.present, native: s.native }));
    const environments = Object.entries(catalog.environments).map(([id, name]) => ({ id, name }));
    for (const s of candidates) for (const e of s.environments) if (!environments.some(v => v.id === e.id)) environments.push({ id: e.id, name: e.label });
    for (let i = 0; i < candidates.length; i++) if (candidates[i].kind === 'api') {
      try {
        const receipt = await readApiHistorySource(this.root, candidates[i].profileId, candidates[i].id);
        if (!receipt) continue;
        const id = Object.entries(data.apiSources).find(([, s]) => s.name.trim().normalize('NFKC').toLowerCase() === receipt.providerName.trim().normalize('NFKC').toLowerCase())?.[0] ?? apiSourceId(receipt.providerName); data.apiSources[id] ??= { name: receipt.providerName };
        sessions[i].recordedSource = id; sessions[i].environments = [receipt.environmentId];
        if (!environments.some(e => e.id === receipt.environmentId)) environments.push({ id: receipt.environmentId, name: receipt.environment });
      } catch { problems = [...problems, candidates[i].title + '：API来源记录读取失败，暂不自动归类。']; }
    }
    // Include all known environment/path pairs so changing an association in
    // the draft can immediately preview its shared project label.
    const projects = [...new Set(sessions.map(s => s.original))].flatMap(original => [{ id: '', name: '环境未标注' }, ...environments].map(e => ({ id: projectLabelKey(e.id, original), environment: e.id, original })));
    const sources: LabelSource[] = profiles.filter(p => p.kind === 'official').map(p => ({ id: 'official:' + p.id, name: p.name, kind: 'official' }));
    sources.push({ id: 'api:unknown', name: '来源未记录', kind: 'api' }, ...Object.entries(data.apiSources).map(([id, s]) => ({ id, name: s.name, kind: 'api' as const })));
    return { revision: revision(saved), data, sources, environments, projects, sessions, providers, problems };
  }
  async save(expected: string, proposed: HistoryLabelData, model: HistoryLabelModel): Promise<void> {
    await sharedDirectory(path.dirname(this.recovery), true);
    await FileRecovery.run(this.recovery, async tx => {
      const current = await this.read();
      if (revision(current) !== expected) throw new Error('历史标签已在其他窗口或环境更新，请重新打开管理页后编辑。');
      const next = validateLabelDraft(proposed, current, model);
      await tx.write(this.file, JSON.stringify(next, null, 2) + '\n', 0o660);
    }, this.root);
  }
  async candidateRows(profiles: CodexIdentity[], candidates: HistoryCandidate[]): Promise<HistoryTreeRow[]> { return labelRows(await this.model(profiles, candidates)); }
  async importedRows(profiles: CodexIdentity[], entries: HistoryImport[], candidates: HistoryCandidate[]): Promise<HistoryTreeRow[]> {
    const catalog = new HistoryCatalog(this.root), registry = await catalog.read();
    const byKey = new Map(candidates.map(c => [c.key, c]));
    const sessions = entries.map(e => byKey.get(e.key) ?? ({ key: e.key, profileId: e.profileId, profileName: e.profileName, kind: e.kind, project: e.project, cwd: e.cwd, id: e.sourceId, file: e.sourceFile, title: e.title, updated: e.updated, archived: false, present: false, native: false, environments: catalog.environments(registry, e.profileId, e.project).map(id => ({ id, label: registry.environments[id] || id })) }));
    return labelRows(await this.model(profiles, sessions)).map(row => ({ ...row, disabled: false, reason: undefined }));
  }
}
export function labelRows(model: HistoryLabelModel, data = model.data): HistoryTreeRow[] {
  const result: HistoryTreeRow[] = [];
  for (const session of model.sessions) {
    const placement = data.placements[session.key];
    const sourceId = session.kind === 'official' ? 'official:' + session.profileId : (placement?.apiSource ?? session.recordedSource) || 'api:unknown';
    const originalSource = session.kind === 'official' ? model.sources.find(s => s.id === sourceId)?.name || session.profileName : data.apiSources[sourceId]?.name || '来源未记录';
    const environments = placement?.environment !== undefined ? [placement.environment] : session.environments.length ? session.environments : [''];
    for (const id of environments) {
      const originalEnv = model.environments.find(e => e.id === id)?.name || (id ? id : '环境未标注');
      const node = model.projects.find(p => p.environment === id && p.original === session.original)?.id || projectLabelKey(id, session.original), group = data.projectLinks[node] || node;
      result.push({ key: session.key, accountId: sourceId, environmentId: id, projectId: node, account: (session.kind === 'official' ? '官方帐号 · ' : 'API 来源 · ') + labelText(data.sourceLabels[sourceId], originalSource), environment: labelText(data.environmentLabels[id], originalEnv), project: labelText(data.projectLabels[group], session.original), title: session.title, updated: session.updated, disabled: session.present, reason: session.native ? '原生默认已有' : session.present ? '已添加' : undefined });
    }
  }
  return result;
}
function validateLabelDraft(proposed: HistoryLabelData, current: HistoryLabelData, model: HistoryLabelModel): HistoryLabelData {
  if (!proposed || proposed.version !== 1) throw new Error('标签草稿无效。');
  for (const key of Object.keys(empty()).filter(k => k !== 'version')) if (!(proposed as any)[key] || typeof (proposed as any)[key] !== 'object' || Array.isArray((proposed as any)[key])) throw new Error('标签草稿无效。');
  const next = JSON.parse(JSON.stringify(proposed)) as HistoryLabelData;
  const names = new Set<string>();
  for (const [id, source] of Object.entries(next.apiSources)) {
    if (!/^api:[a-f0-9-]{36}$/i.test(id) || typeof source?.name !== 'string' || !source.name.trim() || source.name.length > 100) throw new Error('API来源名称须为1至100个字符。');
    if (current.apiSources[id] && current.apiSources[id].name !== source.name) throw new Error('原有来源名称保留，请修改显示标签。');
    const name = source.name.trim().normalize('NFKC').toLowerCase(); if (names.has(name)) throw new Error('API来源名称重复。'); names.add(name); source.name = source.name.trim();
  }
  for (const id of Object.keys(current.apiSources)) if (!next.apiSources[id]) throw new Error('已有API来源不可随标签保存删除。');
  const sources = new Set([...model.sources.map(s => s.id), ...Object.keys(next.apiSources)]), environments = new Set(model.environments.map(e => e.id));
  const projectNodes = new Set(model.projects.map(p => p.id)), groups = new Set([...projectNodes, ...Object.keys(current.projectLabels), ...Object.values(current.projectLinks)]);
  for (const [kind, allowed] of [['sourceLabels', sources], ['environmentLabels', environments], ['projectLabels', groups]] as const) {
    for (const [key, value] of Object.entries(next[kind])) {
      if ((!allowed.has(key) && !(key in current[kind])) || typeof value !== 'string' || value.length > 100) throw new Error('标签须为不超过100个字符的显示名称。');
      if (value.trim()) next[kind][key] = value.trim(); else delete next[kind][key];
    }
  }
  for (const [node, group] of Object.entries(next.projectLinks)) if ((!projectNodes.has(node) && !(node in current.projectLinks)) || !groups.has(group)) throw new Error('复用项目标签的关联无效。');
  const sessions = new Map(model.sessions.map(s => [s.key, s]));
  for (const [key, value] of Object.entries(next.placements)) {
    const session = sessions.get(key);
    if (!session) { if (JSON.stringify(value) !== JSON.stringify(current.placements[key])) throw new Error('会话列表已变化，请重新打开标签管理。'); continue; }
    if (!value || typeof value !== 'object' || value.apiSource !== undefined && typeof value.apiSource !== 'string' || value.environment !== undefined && typeof value.environment !== 'string' || value.apiSource !== undefined && (session.kind !== 'api' || value.apiSource && !next.apiSources[value.apiSource]) || value.environment !== undefined && value.environment !== '' && !environments.has(value.environment)) throw new Error('会话来源或环境归类无效。');
    if (JSON.stringify(value) !== JSON.stringify(current.placements[key])) next.placements[key] = { ...(value.apiSource !== undefined ? { apiSource: value.apiSource } : {}), ...(value.environment !== undefined ? { environment: value.environment } : {}), origin: 'manual', updatedAt: new Date().toISOString() };
  }
  return next;
}
