import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

export function getEffectiveHome(): string {
  const configuration = vscode.workspace.getConfiguration('vscodemodelswitch');
  const target = configuration.get<string>('configTarget', 'real');
  if (target === 'real') {
    return os.homedir();
  }

  const configured = configuration
    .get<string>('testHome', '')
    .trim();
  return configured || defaultSandboxHome();
}

export function resolveHomePath(...segments: string[]): string {
  return path.join(getEffectiveHome(), ...segments);
}

export function getToolHome(tool: 'codex' | 'claude'): string {
  const sandbox = vscode.workspace.getConfiguration('vscodemodelswitch').get<string>('configTarget', 'real') !== 'real';
  if (tool === 'claude') {
    const configured = vscode.workspace.getConfiguration('claudeCode').get<Array<{ name: string; value: string }>>('environmentVariables', []).find(e => e.name === 'CLAUDE_CONFIG_DIR');
    // The native extension ignores an empty config-dir setting; an inherited
    // process override still wins. The session controller reports that conflict.
    if (configured && path.isAbsolute(configured.value)) return path.resolve(configured.value);
  }
  const override = process.env[tool === 'codex' ? 'CODEX_HOME' : 'CLAUDE_CONFIG_DIR'];
  return !sandbox && override ? path.resolve(override) : resolveHomePath('.' + tool);
}

function defaultSandboxHome(): string {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceFolder) {
    return path.join(workspaceFolder, '.vscodemodelswitch-home');
  }
  return path.join(os.homedir(), '.vscodemodelswitch-home');
}
