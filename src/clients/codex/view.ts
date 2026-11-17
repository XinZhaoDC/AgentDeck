import { managedProvidersHtml } from '../../shared/ui/providerPage';
export const codexProvidersHtml = managedProvidersHtml;
export function codexPageScript(): string { return `class CodexPage extends ProviderPage { constructor() { super('codex'); } }`; }
