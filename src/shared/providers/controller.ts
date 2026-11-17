import * as vscode from 'vscode';
import { GroupDefaults, ProviderOrganizationStore } from './organization';
import { ProxyConfig, UsageQueryConfig } from '../../types';

export interface OrganizationAction {
  action: 'createGroup' | 'renameGroup' | 'deleteGroup' | 'toggleGroup' | 'toggleProvider' | 'moveGroup' | 'moveProvider' | 'saveGroup' | 'saveTemplate' | 'deleteTemplate' | 'providerTemplate';
  groupId?: string; beforeGroupId?: string; providerId?: string; beforeProviderId?: string;
  enabled?: boolean; name?: string; defaults?: GroupDefaults; proxy?: ProxyConfig; usageQuery?: UsageQueryConfig; templateId?: string;
}
export class ProviderOrganizationController {
  constructor(readonly store: ProviderOrganizationStore, private readonly currentProvider: () => string | undefined) {}
  private get label(): string { return this.store.tool === 'codex' ? 'Codex' : 'Claude Code'; }
  async execute(input: OrganizationAction): Promise<{ createdGroupId?: string; savedTemplateId?: string }> {
    const id = input.groupId;
    switch (input.action) {
      case 'createGroup': {
        const name = input.name ?? await vscode.window.showInputBox({ title: '新建 ' + this.label + ' API 供应商群组', prompt: '允许空群组；名称在当前客户端内唯一。', ignoreFocusOut: true });
        if (!name) throw new Error('已取消：未创建群组。'); return { createdGroupId: await this.store.createGroup(name) };
      }
      case 'renameGroup': {
        const group = this.enabledGroup(id);
        const name = input.name ?? await vscode.window.showInputBox({ title: '重命名群组', value: group.name, ignoreFocusOut: true });
        if (!name) throw new Error('已取消：名称未更改。'); await this.store.renameGroup(group.id, name); break;
      }
      case 'toggleGroup': {
        const group = this.store.requireGroup(id!);
        if (!input.enabled && this.currentProvider() && this.store.groupOf(this.currentProvider()!) === group.id) {
          const result = await vscode.window.showWarningMessage('该群组包含当前正在使用的供应商。禁用后本群组的配置、测试和应用操作将不可用；当前客户端仍使用已应用配置，不会自动切换或停止任务。是否继续？', { modal: true }, { title: '确认禁用群组' }, { title: '取消', isCloseAffordance: true });
          if (result?.title !== '确认禁用群组') throw new Error('已取消：群组未禁用。');
        }
        await this.store.setGroupEnabled(group.id, input.enabled === true); break;
      }
      case 'toggleProvider':
        if (!input.enabled && input.providerId === this.currentProvider()) throw new Error('当前正在使用此供应商，不能禁用。请先切换到其他供应商或官方账号。');
        await this.store.setProviderEnabled(input.providerId!, input.enabled === true); break;
      case 'moveGroup': await this.store.moveGroup(id!, input.beforeGroupId); break;
      case 'moveProvider': {
        const provider = this.store.requireProvider(input.providerId!);
        let target = id;
        if (!target) {
          this.store.assertEnabled(provider.id);
          const local = this.store.localState();
          target = (await vscode.window.showQuickPick(this.store.read().groups.map(g => ({ label: g.name, description: local.disabledGroups.includes(g.id) ? '已禁用 · 可以接收供应商' : '已启用', id: g.id })), { title: '移动到群组（保留供应商现有配置）' }))?.id;
          if (!target) throw new Error('已取消：供应商未移动。');
        }
        if (provider.id === this.currentProvider() && this.store.localState().disabledGroups.includes(target) && this.store.groupOf(provider.id) !== target) {
          const answer = await vscode.window.showWarningMessage('目标群组已禁用。移动后将不能操作此供应商，但当前客户端仍使用已应用配置。是否继续？', { modal: true }, { title: '确认移动' }, { title: '取消', isCloseAffordance: true });
          if (answer?.title !== '确认移动') throw new Error('已取消：供应商未移动。');
        }
        await this.store.moveProvider(provider.id, target, input.beforeProviderId); break;
      }
      case 'deleteGroup': {
        const group = this.store.requireGroup(id!);
        if (group.id === 'independent') throw new Error('不能删除独立供应商群组。');
        const answer = await vscode.window.showWarningMessage('删除群组「' + group.name + '」？成员会移回独立供应商，保留各自配置、启用标记及顺序；不会改变当前客户端配置。', { modal: true }, { title: '删除群组' }, { title: '取消', isCloseAffordance: true });
        if (answer?.title !== '删除群组') throw new Error('已取消：群组未删除。');
        await this.store.deleteGroup(group.id); break;
      }
      case 'saveGroup': this.enabledGroup(id); await this.store.saveGroupDefaults(id!, input.defaults ?? {}); break;
      case 'saveTemplate':
        if (input.groupId) this.enabledGroup(input.groupId);
        return { savedTemplateId: await this.store.saveTemplate(input.name!, input.proxy!, input.templateId, input.usageQuery) };
      case 'deleteTemplate': {
        const answer = await vscode.window.showWarningMessage('删除所选群组设置模板？群组和供应商已载入的配置副本保留。', { modal: true }, { title: '删除模板' }, { title: '取消', isCloseAffordance: true });
        if (answer?.title !== '删除模板') throw new Error('已取消：模板未删除。'); await this.store.deleteTemplate(input.templateId!); break;
      }
      default: throw new Error('不支持的群组操作。');
    }
    return {};
  }
  private enabledGroup(id?: string) {
    const group = this.store.requireGroup(id!);
    if (this.store.localState().disabledGroups.includes(group.id)) throw new Error('群组已禁用，请先恢复后操作。');
    return group;
  }
}
