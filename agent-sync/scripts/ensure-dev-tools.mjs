#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const HOME = os.homedir();
const APPDATA = process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming');
const LOCALAPPDATA = process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local');
const CODEX_CONFIG = path.join(HOME, '.codex', 'config.toml');
const VSCODE_MCP = path.join(APPDATA, 'Code', 'User', 'mcp.json');
const TOOLBOX_DIR = path.join(HOME, '.codex', 'mcp-toolbox');
const TOOLBOX_SQLITE = path.join(TOOLBOX_DIR, 'dev.sqlite');
const USER_BIN = path.join(HOME, '.local', 'bin');
const ANTIGRAVITY_IDE_BIN = path.join(LOCALAPPDATA, 'Programs', 'Antigravity IDE', 'bin');
const ANTIGRAVITY_APP_EXE = path.join(LOCALAPPDATA, 'Programs', 'antigravity', 'Antigravity.exe');

const TOP_DEV_TOOLS = [
  { id: 'codex-cli', title: 'Codex CLI', type: 'cli', commands: ['codex'], installer: { type: 'npm', packages: ['@openai/codex'] } },
  { id: 'gemini-cli', title: 'Gemini CLI', type: 'cli', commands: ['gemini'], installer: { type: 'npm', packages: ['@google/gemini-cli'] } },
  { id: 'claude-cli', title: 'Claude CLI', type: 'cli', commands: ['claude'], installer: { type: 'npm', packages: ['@anthropic-ai/claude-code'] } },
  { id: 'antigravity-cli', title: 'Antigravity CLI/App Launcher', type: 'cli', commands: ['antigravity'] },
  { id: 'git', title: 'Git', type: 'cli', commands: ['git'], installer: { type: 'winget', id: 'Git.Git' } },
  { id: 'github-mcp', title: 'GitHub MCP', type: 'mcp', mcpName: 'github', prerequisiteCommands: ['docker'] },
  { id: 'github-cli', title: 'GitHub CLI', type: 'cli', commands: ['gh'], installer: { type: 'winget', id: 'GitHub.cli' } },
  { id: 'playwright-mcp', title: 'Playwright MCP', type: 'mcp', mcpName: 'playwright', npmPackage: '@playwright/mcp' },
  { id: 'chrome-devtools-mcp', title: 'Chrome DevTools MCP', type: 'mcp', mcpName: 'chrome_devtools', npmPackage: 'chrome-devtools-mcp' },
  { id: 'context7-mcp', title: 'Context7 MCP', type: 'mcp', mcpName: 'context7', npmPackage: '@upstash/context7-mcp' },
  { id: 'firecrawl-mcp', title: 'Firecrawl MCP', type: 'mcp', mcpName: 'firecrawl', npmPackage: 'firecrawl-mcp' },
  { id: 'sentry-mcp', title: 'Sentry MCP', type: 'mcp', mcpName: 'sentry', npmPackage: '@sentry/mcp-server' },
  { id: 'mcp-toolbox', title: 'MCP Toolbox for Databases', type: 'mcp', mcpName: 'mcp_toolbox', commands: ['toolbox'] },
  { id: 'docker', title: 'Docker CLI', type: 'cli', commands: ['docker'], installer: { type: 'winget', id: 'Docker.DockerDesktop' } },
  { id: 'kubectl', title: 'kubectl', type: 'cli', commands: ['kubectl'], installer: { type: 'winget', id: 'Kubernetes.kubectl' } },
  { id: 'helm', title: 'Helm', type: 'cli', commands: ['helm'], installer: { type: 'winget', id: 'Helm.Helm' } },
  { id: 'terraform', title: 'Terraform CLI', type: 'cli', commands: ['terraform'], installer: { type: 'winget', id: 'Hashicorp.Terraform' } },
  { id: 'supabase', title: 'Supabase CLI', type: 'cli', commands: ['supabase'], installer: { type: 'npm', packages: ['supabase'] } },
  { id: 'vercel', title: 'Vercel CLI', type: 'cli', commands: ['vercel'], installer: { type: 'npm', packages: ['vercel'] } },
  { id: 'postman-cli', title: 'Postman CLI', type: 'cli', commands: ['postman', 'postman-cli'], installer: { type: 'npm', packages: ['postman-cli'] } },
  { id: 'pnpm', title: 'pnpm', type: 'cli', commands: ['pnpm'], installer: { type: 'winget', id: 'pnpm.pnpm' } },
  { id: 'uv', title: 'uv', type: 'cli', commands: ['uv'], installer: { type: 'winget', id: 'astral-sh.uv' } },
  { id: 'ripgrep', title: 'ripgrep', type: 'cli', commands: ['rg'], installer: { type: 'winget', id: 'BurntSushi.ripgrep.MSVC' } },
  { id: 'jq', title: 'jq', type: 'cli', commands: ['jq'], installer: { type: 'winget', id: 'jqlang.jq' } },
];

const SUPPORT_TOOLS = [
  { id: 'firecrawl-cli', title: 'Firecrawl CLI', type: 'cli', commands: ['firecrawl'], installer: { type: 'npm', packages: ['firecrawl-cli'] }, support: true },
];

function usage(exitCode = 0) {
  console.log(`Usage: node scripts/ensure-dev-tools.mjs [options]\n\nCheck and optionally install/configure the top ${TOP_DEV_TOOLS.length} developer MCP/CLI tools.\nDefault mode is dry-run; use --apply to install missing CLI packages and add safe MCP config blocks.\n\nOptions:\n  --apply            Install/configure missing tools. Existing tools are left unchanged.\n  --json             Print machine-readable summary.\n  --no-install       Do not run package installers even with --apply.\n  --no-mcp-config    Do not add Codex MCP config blocks even with --apply.\n  --no-backup        Do not create config backup before writing MCP blocks.\n  --help             Show help.\n`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const opts = { apply: false, json: false, install: true, mcpConfig: true, backup: true };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') usage(0);
    else if (arg === '--apply') opts.apply = true;
    else if (arg === '--json') opts.json = true;
    else if (arg === '--no-install') opts.install = false;
    else if (arg === '--no-mcp-config') opts.mcpConfig = false;
    else if (arg === '--no-backup') opts.backup = false;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return opts;
}

function run(command, args, options = {}) {
  const needsCmd = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
  const spawnOptions = { encoding: 'utf8', shell: false, ...options };
  const res = needsCmd
    ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', command, ...args], spawnOptions)
    : spawnSync(command, args, spawnOptions);
  return {
    ok: res.status === 0,
    status: res.status,
    stdout: (res.stdout || '').trim(),
    stderr: (res.stderr || '').trim(),
    error: res.error?.message || null,
  };
}

function commandExtensions(command) {
  const lower = command.toLowerCase();
  const exts = ['.exe', '.cmd', '.ps1', '.bat', ''];
  return exts.map(ext => lower.endsWith(ext) ? command : `${command}${ext}`);
}

function pathEntries() {
  const raw = [
    process.env.Path || process.env.PATH || '',
    path.join(APPDATA, 'npm'),
    path.join(HOME, 'bin'),
    path.join(LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links'),
    USER_BIN,
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'cmd'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'GitHub CLI'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Docker', 'Docker', 'resources', 'bin'),
    ANTIGRAVITY_IDE_BIN,
    path.dirname(ANTIGRAVITY_APP_EXE),
  ].join(';');
  const seen = new Set();
  const out = [];
  for (const entry of raw.split(';').map(s => s.trim()).filter(Boolean)) {
    const key = entry.replace(/[\\/]+$/, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

function findCommand(command) {
  const where = run('where.exe', [command]);
  if (where.ok && where.stdout) return where.stdout.split(/\r?\n/)[0].trim();
  for (const dir of pathEntries()) {
    for (const candidate of commandExtensions(command)) {
      const p = path.join(dir, candidate);
      if (fs.existsSync(p)) return p;
    }
  }
  const winGetPackages = path.join(LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages');
  if (fs.existsSync(winGetPackages)) {
    const hit = findUnder(winGetPackages, commandExtensions(command), 4);
    if (hit) return hit;
  }
  return null;
}

function findUnder(root, basenames, maxDepth) {
  const wanted = new Set(basenames.map(s => s.toLowerCase()));
  function walk(dir, depth) {
    if (depth > maxDepth) return null;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
    for (const ent of entries) {
      const p = path.join(dir, ent.name);
      if (ent.isFile() && wanted.has(ent.name.toLowerCase())) return p;
    }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const found = walk(path.join(dir, ent.name), depth + 1);
      if (found) return found;
    }
    return null;
  }
  return walk(root, 0);
}

function npmRoot() {
  const res = run(npmCommand(), ['root', '-g']);
  return res.ok ? res.stdout.trim() : path.join(APPDATA, 'npm', 'node_modules');
}

function npmCommand() {
  if (process.platform === 'win32') return findCommand('npm.cmd') || findCommand('npm') || 'npm.cmd';
  return findCommand('npm') || findCommand('npm.cmd') || 'npm.cmd';
}

function npmPackagePath(pkg) {
  const root = npmRoot();
  if (pkg.startsWith('@')) {
    const [scope, name] = pkg.split('/');
    return path.join(root, scope, name || '');
  }
  return path.join(root, pkg);
}

function npmPackageInstalled(pkg) {
  return fs.existsSync(path.join(npmPackagePath(pkg), 'package.json'));
}

function codexConfigText() {
  try { return fs.readFileSync(CODEX_CONFIG, 'utf8'); } catch { return ''; }
}

function hasMcpServer(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\s*\\[mcp_servers\\.(?:${escaped}|["']${escaped}["'])]\\s*$`, 'm').test(text);
}

function tomlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function tomlArray(values) {
  return `[${values.map(tomlString).join(', ')}]`;
}

function mcpBlock(name) {
  if (name === 'github') {
    return [
      '',
      '[mcp_servers.github]',
      `command = ${tomlString('docker')}`,
      `args = ${tomlArray(['run', '-i', '--rm', '-e', 'GITHUB_PERSONAL_ACCESS_TOKEN', '-e', 'GITHUB_READ_ONLY=1', 'ghcr.io/github/github-mcp-server'])}`,
      `env_vars = ${tomlArray(['GITHUB_PERSONAL_ACCESS_TOKEN'])}`,
      'startup_timeout_sec = 120',
      '',
    ].join('\n');
  }
  if (name === 'playwright') {
    return [
      '',
      '[mcp_servers.playwright]',
      `command = ${tomlString('npx')}`,
      `args = ${tomlArray(['-y', '@playwright/mcp@latest'])}`,
      'startup_timeout_sec = 120',
      '',
    ].join('\n');
  }
  if (name === 'chrome_devtools') {
    return [
      '',
      '[mcp_servers.chrome_devtools]',
      `command = ${tomlString('npx')}`,
      `args = ${tomlArray(['-y', 'chrome-devtools-mcp@latest'])}`,
      'startup_timeout_sec = 120',
      '',
    ].join('\n');
  }
  if (name === 'context7') {
    return [
      '',
      '[mcp_servers.context7]',
      `command = ${tomlString('npx')}`,
      `args = ${tomlArray(['-y', '@upstash/context7-mcp@latest'])}`,
      'startup_timeout_sec = 120',
      '',
    ].join('\n');
  }
  if (name === 'firecrawl') {
    return [
      '',
      '[mcp_servers.firecrawl]',
      `command = ${tomlString('npx')}`,
      `args = ${tomlArray(['-y', 'firecrawl-mcp@latest'])}`,
      'startup_timeout_sec = 120',
      '',
    ].join('\n');
  }
  if (name === 'sentry') {
    return [
      '',
      '[mcp_servers.sentry]',
      `command = ${tomlString('npx')}`,
      `args = ${tomlArray(['-y', '@sentry/mcp-server@latest', '--agent'])}`,
      'startup_timeout_sec = 120',
      '',
    ].join('\n');
  }
  if (name === 'mcp_toolbox') {
    return [
      '',
      '[mcp_servers.mcp_toolbox]',
      `command = ${tomlString(path.join(USER_BIN, 'toolbox.exe'))}`,
      `args = ${tomlArray(['--stdio', '--prebuilt', 'sqlite', '--log-level', 'ERROR'])}`,
      'startup_timeout_sec = 120',
      '',
      '[mcp_servers.mcp_toolbox.env]',
      `SQLITE_DATABASE = ${tomlString(TOOLBOX_SQLITE)}`,
      '',
    ].join('\n');
  }
  throw new Error(`No MCP block template for ${name}`);
}

function backupConfig() {
  if (!fs.existsSync(CODEX_CONFIG)) return null;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const backup = `${CODEX_CONFIG}.bak-${stamp}`;
  fs.copyFileSync(CODEX_CONFIG, backup);
  return backup;
}

function appendMcpBlocks(names, backup = true) {
  if (!names.length) return { changed: false, backup: null };
  fs.mkdirSync(path.dirname(CODEX_CONFIG), { recursive: true });
  fs.mkdirSync(TOOLBOX_DIR, { recursive: true });
  let text = codexConfigText();
  if (text && !text.endsWith('\n')) text += '\n';
  const backupPath = backup ? backupConfig() : null;
  for (const name of names) text += mcpBlock(name);
  fs.writeFileSync(CODEX_CONFIG, text, 'utf8');
  return { changed: true, backup: backupPath };
}

function mcpJsonServer(name) {
  if (name === 'github') {
    return {
      command: 'docker',
      args: ['run', '-i', '--rm', '-e', 'GITHUB_PERSONAL_ACCESS_TOKEN', '-e', 'GITHUB_READ_ONLY=1', 'ghcr.io/github/github-mcp-server'],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: '${env:GITHUB_PERSONAL_ACCESS_TOKEN}' },
      type: 'stdio',
    };
  }
  if (name === 'playwright') {
    return { command: 'npx', args: ['-y', '@playwright/mcp@latest'], type: 'stdio' };
  }
  if (name === 'chrome_devtools') {
    return { command: 'npx', args: ['-y', 'chrome-devtools-mcp@latest'], type: 'stdio' };
  }
  if (name === 'context7') {
    return { command: 'npx', args: ['-y', '@upstash/context7-mcp@latest'], type: 'stdio' };
  }
  if (name === 'firecrawl') {
    return { command: 'npx', args: ['-y', 'firecrawl-mcp@latest'], type: 'stdio' };
  }
  if (name === 'sentry') {
    return { command: 'npx', args: ['-y', '@sentry/mcp-server@latest', '--agent'], type: 'stdio' };
  }
  if (name === 'mcp_toolbox') {
    return {
      command: path.join(USER_BIN, 'toolbox.exe'),
      args: ['--stdio', '--prebuilt', 'sqlite', '--log-level', 'ERROR'],
      env: { SQLITE_DATABASE: TOOLBOX_SQLITE },
      type: 'stdio',
    };
  }
  throw new Error(`No JSON MCP server template for ${name}`);
}

function readVscodeMcp() {
  try {
    const text = fs.readFileSync(VSCODE_MCP, 'utf8').replace(/^\uFEFF/, '');
    if (!text.trim()) return { servers: {}, inputs: [] };
    const raw = JSON.parse(text);
    if (!raw.servers || typeof raw.servers !== 'object') raw.servers = {};
    if (!Array.isArray(raw.inputs)) raw.inputs = [];
    return raw;
  } catch (err) {
    if (err.code === 'ENOENT') return { servers: {}, inputs: [] };
    throw err;
  }
}

function hasVscodeMcpServer(raw, name) {
  return Object.prototype.hasOwnProperty.call(raw.servers, name);
}

function backupVscodeMcp() {
  if (!fs.existsSync(VSCODE_MCP)) return null;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const backup = `${VSCODE_MCP}.bak-${stamp}`;
  fs.copyFileSync(VSCODE_MCP, backup);
  return backup;
}

function appendVscodeMcpServers(names, backup = true) {
  if (!names.length) return { changed: false, backup: null };
  const raw = readVscodeMcp();
  for (const name of names) raw.servers[name] = mcpJsonServer(name);
  fs.mkdirSync(path.dirname(VSCODE_MCP), { recursive: true });
  const backupPath = backup ? backupVscodeMcp() : null;
  fs.writeFileSync(VSCODE_MCP, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
  return { changed: true, backup: backupPath };
}

function addUserPath(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const current = String(process.env.Path || process.env.PATH || '');
  if (!current.split(';').some(p => p.replace(/[\\/]+$/, '').toLowerCase() === dir.replace(/[\\/]+$/, '').toLowerCase())) {
    process.env.Path = `${current};${dir}`;
  }
  const userPath = String(process.env.Path ? (process.env.Path && process.env.Path) : '');
  const existingUser = String(process.env.Path || '');
  void userPath;
  void existingUser;
}

function ensureToolboxBinary() {
  const toolbox = findCommand('toolbox') || path.join(USER_BIN, 'toolbox.exe');
  if (!fs.existsSync(toolbox)) return { ok: false, path: toolbox, error: 'toolbox command not found; download/install MCP Toolbox binary first' };
  fs.mkdirSync(TOOLBOX_DIR, { recursive: true });
  return { ok: true, path: toolbox };
}

function ensureAntigravityShim() {
  const shim = path.join(USER_BIN, 'antigravity.cmd');
  const ideCmd = path.join(ANTIGRAVITY_IDE_BIN, 'antigravity-ide.cmd');
  const hasIdeCli = fs.existsSync(ideCmd);
  const hasApp = fs.existsSync(ANTIGRAVITY_APP_EXE);
  if (!hasIdeCli && !hasApp) {
    return { ok: false, path: shim, error: 'Antigravity IDE/app target not found; install Google.AntigravityIDE or Google.Antigravity first' };
  }
  fs.mkdirSync(USER_BIN, { recursive: true });
  const body = [
    '@echo off',
    'setlocal',
    `set "AG_IDE=${ideCmd}"`,
    `set "AG_APP=${ANTIGRAVITY_APP_EXE}"`,
    'if exist "%AG_IDE%" (',
    '  call "%AG_IDE%" %*',
    '  exit /b %ERRORLEVEL%',
    ')',
    'if exist "%AG_APP%" (',
    '  start "" "%AG_APP%" %*',
    '  exit /b 0',
    ')',
    'echo Antigravity is not installed or its command target was not found. 1>&2',
    'exit /b 1',
    '',
  ].join('\r\n');
  let changed = true;
  try { changed = fs.readFileSync(shim, 'utf8') !== body; } catch {}
  if (changed) fs.writeFileSync(shim, body, 'utf8');
  return { ok: true, path: shim, changed, target: hasIdeCli ? ideCmd : ANTIGRAVITY_APP_EXE };
}

function installTool(tool) {
  if (!tool.installer) return { skipped: true, reason: 'no installer' };
  if (tool.installer.type === 'winget') {
    return run('winget', ['install', '--exact', '--id', tool.installer.id, '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity']);
  }
  if (tool.installer.type === 'npm') {
    return run(npmCommand(), ['install', '-g', ...tool.installer.packages]);
  }
  return { skipped: true, reason: `unsupported installer ${tool.installer.type}` };
}

function inspectTool(tool, configText, vscodeMcpRaw) {
  const commandHits = {};
  for (const command of tool.commands || []) {
    const hit = findCommand(command);
    if (hit) commandHits[command] = hit;
  }
  const npmInstalled = tool.npmPackage ? npmPackageInstalled(tool.npmPackage) : null;
  const mcpConfigured = tool.mcpName ? hasMcpServer(configText, tool.mcpName) : null;
  const vscodeMcpConfigured = tool.mcpName && vscodeMcpRaw ? hasVscodeMcpServer(vscodeMcpRaw, tool.mcpName) : null;
  const prerequisites = {};
  for (const command of tool.prerequisiteCommands || []) prerequisites[command] = findCommand(command);
  let installed = false;
  if (tool.type === 'cli') installed = Object.keys(commandHits).length > 0;
  else if (tool.id === 'github-mcp') installed = Boolean(prerequisites.docker) && Boolean(mcpConfigured);
  else if (tool.id === 'mcp-toolbox') installed = Object.keys(commandHits).length > 0 && Boolean(mcpConfigured);
  else installed = Boolean(npmInstalled) && Boolean(mcpConfigured);
  return { id: tool.id, title: tool.title, type: tool.type, installed, commands: commandHits, npmPackage: tool.npmPackage || null, npmInstalled, mcpName: tool.mcpName || null, mcpConfigured, vscodeMcpConfigured, prerequisites };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  addUserPath(USER_BIN);
  const allTools = [...TOP_DEV_TOOLS, ...SUPPORT_TOOLS];
  let configText = codexConfigText();
  let vscodeMcpRaw = readVscodeMcp();
  const before = allTools.map(tool => inspectTool(tool, configText, vscodeMcpRaw));
  const installResults = [];
  const mcpToAdd = [];
  const vscodeMcpToAdd = [];

  if (opts.apply) {
    for (const tool of allTools) {
      const status = before.find(item => item.id === tool.id);
      if (tool.id === 'antigravity-cli' && opts.install) {
        const result = ensureAntigravityShim();
        if (!status.installed || result.changed) installResults.push({ id: tool.id, installer: tool.installer || null, result });
      }
      if (opts.mcpConfig && tool.type === 'mcp' && tool.mcpName && !hasVscodeMcpServer(vscodeMcpRaw, tool.mcpName)) {
        vscodeMcpToAdd.push(tool.mcpName);
        vscodeMcpRaw.servers[tool.mcpName] = {};
      }
      if (status.installed) continue;
      if (tool.type === 'cli' && opts.install) {
        const result = tool.id === 'antigravity-cli' ? ensureAntigravityShim() : installTool(tool);
        installResults.push({ id: tool.id, installer: tool.installer || null, result });
      }
      if (tool.type === 'mcp') {
        if (tool.npmPackage && opts.install && !npmPackageInstalled(tool.npmPackage)) {
          const result = run(npmCommand(), ['install', '-g', tool.npmPackage]);
          installResults.push({ id: tool.id, installer: { type: 'npm', packages: [tool.npmPackage] }, result });
        }
        if (tool.id === 'mcp-toolbox') ensureToolboxBinary();
        configText = codexConfigText();
        if (opts.mcpConfig && tool.mcpName && !hasMcpServer(configText, tool.mcpName)) mcpToAdd.push(tool.mcpName);
      }
    }
    if (mcpToAdd.length) appendMcpBlocks(mcpToAdd, opts.backup);
    if (vscodeMcpToAdd.length) appendVscodeMcpServers(vscodeMcpToAdd, opts.backup);
  }

  configText = codexConfigText();
  vscodeMcpRaw = readVscodeMcp();
  const after = allTools.map(tool => inspectTool(tool, configText, vscodeMcpRaw));
  const topAfter = after.filter(item => !SUPPORT_TOOLS.some(tool => tool.id === item.id));
  const result = {
    mode: opts.apply ? 'apply' : 'dry-run',
    topToolCount: TOP_DEV_TOOLS.length,
    installedTopToolCount: topAfter.filter(item => item.installed).length,
    missingTopTools: topAfter.filter(item => !item.installed).map(item => item.id),
    supportTools: after.filter(item => SUPPORT_TOOLS.some(tool => tool.id === item.id)),
    tools: topAfter,
    plannedMcpConfigAdds: opts.apply ? [] : before.filter(item => item.type === 'mcp' && !item.mcpConfigured).map(item => item.mcpName).filter(Boolean),
    plannedVscodeMcpConfigAdds: opts.apply ? [] : before.filter(item => item.type === 'mcp' && !item.vscodeMcpConfigured).map(item => item.mcpName).filter(Boolean),
    installResults,
  };

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Top dev tools installed/configured: ${result.installedTopToolCount}/${result.topToolCount}`);
  for (const item of result.tools) {
    const mark = item.installed ? 'ok' : 'missing';
    const details = item.type === 'cli'
      ? Object.entries(item.commands).map(([name, p]) => `${name}=${p}`).join(', ')
      : `mcp=${item.mcpConfigured ? 'configured' : 'missing'}, vscode=${item.vscodeMcpConfigured ? 'configured' : 'missing'}${item.npmPackage ? `, npm=${item.npmInstalled ? 'installed' : 'missing'}` : ''}`;
    console.log(`- ${mark}: ${item.title} (${item.id})${details ? ` — ${details}` : ''}`);
  }
  if (result.supportTools.length) {
    console.log('\nSupport tools:');
    for (const item of result.supportTools) console.log(`- ${item.installed ? 'ok' : 'missing'}: ${item.title} (${item.id})`);
  }
  if (!opts.apply) {
    if (result.missingTopTools.length) console.log(`\nDry-run only. Re-run with --apply to install/configure missing: ${result.missingTopTools.join(', ')}`);
    else console.log('\nNo top tool setup changes needed.');
  } else {
    if (installResults.length) console.log(`\nInstaller actions run: ${installResults.length}`);
    console.log(result.missingTopTools.length ? `Still missing: ${result.missingTopTools.join(', ')}` : '\nAll top dev tools are installed/configured.');
  }
}

try { main(); }
catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
