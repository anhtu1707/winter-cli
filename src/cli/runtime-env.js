import { execFileSync } from 'child_process';

let cachedDefaultProfile = null;
let cachedParentProcessName = null;

export function getHostOs(platform = process.platform) {
  if (platform === 'win32') return 'Windows';
  if (platform === 'darwin') return 'macOS';
  if (platform === 'linux') return 'Linux';
  return platform;
}

export function detectTerminalApp(env = process.env, platform = process.platform) {
  if (env.WT_SESSION) return 'Windows Terminal';
  if (env.TERM_PROGRAM) return env.TERM_PROGRAM;
  if (env.VSCODE_PID || env.TERM_PROGRAM === 'vscode') return 'VS Code integrated terminal';
  if (env.ConEmuANSI || env.ConEmuBuild) return 'ConEmu/Cmder';
  if (env.TERMINUS_SUBLIME || env.TERMINUS_SESSION) return 'Terminus';
  if (env.TERM) return env.TERM;
  if (platform === 'win32') return 'Windows console host';
  return 'unknown';
}

export function detectCurrentShell(env = process.env, platform = process.platform) {
  if (platform !== 'win32') {
    return {
      name: env.SHELL ? env.SHELL.split(/[\\/]/).pop() : 'sh',
      kind: env.SHELL ? env.SHELL.split(/[\\/]/).pop() : 'sh',
      source: 'SHELL',
      path: env.SHELL || '',
    };
  }

  const shellPath = env.SHELL || '';
  const lowerShell = shellPath.toLowerCase();
  const parentName = detectParentProcessName(env, platform).toLowerCase();
  const parentProcess = [
    env.WINTER_PARENT_PROCESS,
    env.npm_config_script_shell,
    parentName,
  ].filter(Boolean).join(' ').toLowerCase();

  if (lowerShell.includes('pwsh') || parentProcess.includes('pwsh')) {
    return { name: 'pwsh', kind: 'powershell', source: 'env', path: shellPath };
  }
  if (lowerShell.includes('powershell') || parentProcess.includes('powershell')) {
    return { name: 'powershell.exe', kind: 'powershell', source: 'env', path: shellPath };
  }
  if (lowerShell.includes('cmd.exe') || parentProcess.includes('cmd.exe')) {
    return { name: 'cmd.exe', kind: 'cmd', source: 'parent/env', path: shellPath || env.ComSpec || '' };
  }
  return {
    name: parentName || 'unknown Windows shell',
    kind: 'unknown',
    source: parentName ? 'parent' : 'unknown',
    path: shellPath || env.ComSpec || '',
  };
}

export function detectParentProcessName(env = process.env, platform = process.platform) {
  if (env.WINTER_PARENT_PROCESS) return env.WINTER_PARENT_PROCESS;
  if (platform !== 'win32') return '';
  if (env === process.env && cachedParentProcessName !== null) return cachedParentProcessName;

  try {
    const script = `$p=(Get-CimInstance Win32_Process -Filter "ProcessId=${process.ppid}" -ErrorAction SilentlyContinue); if($p){$p.Name}`;
    const parentName = execFileSync('powershell.exe', ['-NoProfile', '-Command', script], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 1500,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (env === process.env) cachedParentProcessName = parentName;
    return parentName;
  } catch {
    if (env === process.env) cachedParentProcessName = '';
    return '';
  }
}

export function getRuntimeEnvironment(env = process.env, platform = process.platform) {
  if (env === process.env && platform === process.platform && cachedDefaultProfile) {
    return cachedDefaultProfile;
  }

  const shell = detectCurrentShell(env, platform);
  const terminalApp = detectTerminalApp(env, platform);
  const defaultExecutionShell = platform === 'win32'
    ? (shell.kind === 'cmd' ? 'cmd' : 'powershell')
    : (env.SHELL || 'sh');

  const profile = {
    hostOs: getHostOs(platform),
    platform,
    arch: process.arch,
    terminalApp,
    shell,
    defaultExecutionShell,
    isWindows: platform === 'win32',
  };

  if (env === process.env && platform === process.platform) {
    cachedDefaultProfile = profile;
  }

  return profile;
}

export function formatRuntimeEnvironmentSummary(profile = getRuntimeEnvironment()) {
  const shellPath = profile.shell?.path ? ` (${profile.shell.path})` : '';
  const shellRule = profile.isWindows
    ? [
        'Bash tool shell rules:',
        '- default/auto executes PowerShell unless the command clearly uses cmd.exe syntax.',
        '- use shell:"powershell" for PowerShell cmdlets, pipes, Get-ChildItem, Select-String, npm/node commands.',
        '- use shell:"cmd" for cmd builtins such as type, copy, del, dir /b, echo foo>file, && chains.',
        '- do not mix PowerShell-only syntax with shell:"cmd" or cmd-only redirection with shell:"powershell".',
      ].join('\n')
    : 'Bash tool shell rule: use the native POSIX shell; leave shell unspecified unless a specific shell is required.';

  const now = new Date();
  const timeFormatter = new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
  });

  return [
    `Current Local Time: ${timeFormatter.format(now)}`,
    `Host OS: ${profile.hostOs}`,
    `Node platform: ${profile.platform}`,
    `CPU arch: ${profile.arch}`,
    `Terminal app: ${profile.terminalApp}`,
    `Detected current shell: ${profile.shell?.name || 'unknown'} [${profile.shell?.kind || 'unknown'}]${shellPath}`,
    `Bash default execution shell: ${profile.defaultExecutionShell}`,
    shellRule,
  ].join('\n');
}
