import { ProviderClientController, ProviderClientHost } from '../../shared/clients/providerController';
import type { IncomingMessage, SidebarController } from '../../ui/sidebarView';
import { claudePageScript, claudeProvidersHtml } from './view';
type ClaudeHost = ProviderClientHost & Pick<SidebarController, 'deleteBackupsFromSidebar' | 'openClaudeTerminalFromSidebar' | 'sessionActionFromSidebar' | 'applyClaudeModeFromSidebar' | 'organizationActionFromSidebar'>;
export class ClaudeClientController extends ProviderClientController<ClaudeHost> {
  readonly id = 'claude' as const;
  readonly label = 'Claude Code';
  readonly browser = { controller: 'ClaudePage', script: claudePageScript(), markup: claudeProvidersHtml(), sharedFrame: true };
  readonly capabilities = ['providers', 'network', 'accounts', 'sharedHistory', 'groups', 'groupSettingsTemplates'] as const;
  protected async dispatch(message: IncomingMessage): Promise<void> {
    switch (message.type) {
        case 'sessionAction': await this.host.sessionActionFromSidebar(message.action, message.identityId, message.file, 'claude'); break;
        case 'applyClaudeMode': await this.host.applyClaudeModeFromSidebar(message.mode); break;
        case 'organizationAction': {
          const result = await this.host.organizationActionFromSidebar(message.input, 'claude');
          if (result.editor) await this.reply({ type: 'configEditor', ...result.editor as object });
          await this.reply({ type: 'organizationResult', tool: 'claude', inputAction: message.input.action, sourceGroupId: message.input.groupId, ...result }); break;
        }
        case 'deleteBackups': await this.host.deleteBackupsFromSidebar(message.tool); break;
        case 'openClaudeTerminal': await this.host.openClaudeTerminalFromSidebar(); break;
      default: await super.dispatch(message);
    }
  }
}
