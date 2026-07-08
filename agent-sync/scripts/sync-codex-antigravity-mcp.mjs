#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const HOME = os.homedir();
const APPDATA = process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming');
const DEFAULT_CODEX_CONFIG = path.join(HOME, '.codex', 'config.toml');
const DEFAULT_ANTIGRAVITY_MCP = path.join(APPDATA, 'Antigravity', 'User', 'mcp.json');
const DEFAULT_VSCODE_MCP = path.join(APPDATA, 'Code', 'User', 'mcp.json');

function usage(exitCode = 0) {
  console.log(`Usage: node scripts/sync-codex-antigravity-mcp.mjs [options]\n\nSynchronize the union of MCP servers across Codex, Antigravity, and VSCode.\nDefault mode is dry-run; use --apply to write changes.\n\nOptions:\n  --apply                         Write missing MCP servers to the other apps.\n  --json                          Print machine-readable summary.\n  --codex-config <path>            Override Codex config.toml path.\n  --antigravity-mcp <path>         Override Antigravity User/mcp.json path.\n  --vscode-mcp <path>              Override VSCode User/mcp.json path.\n  --startup-timeout <seconds>      Startup timeout for JSON->Codex stdio servers (default: 120).\n  --no-backup                      Do not create .bak-* files before writing.\n  --help                           Show help.\n\nDefaults:\n  Codex config:       ${DEFAULT_CODEX_CONFIG}\n  Antigravity MCP:    ${DEFAULT_ANTIGRAVITY_MCP}\n  VSCode MCP:         ${DEFAULT_VSCODE_MCP}\n`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const opts = {
    apply: false,
    json: false,
    backup: true,
    codexConfig: DEFAULT_CODEX_CONFIG,
    antigravityMcp: DEFAULT_ANTIGRAVITY_MCP,
    vscodeMcp: DEFAULT_VSCODE_MCP,
    startupTimeout: 120,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === '--help' || a === '-h') usage(0);
    else if (a === '--apply') opts.apply = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--no-backup') opts.backup = false;
    else if (a === '--codex-config') opts.codexConfig = next();
    else if (a === '--antigravity-mcp') opts.antigravityMcp = next();
    else if (a === '--vscode-mcp') opts.vscodeMcp = next();
    else if (a === '--startup-timeout') opts.startupTimeout = Number(next());
    else throw new Error(`Unknown option: ${a}`);
  }
  if (!Number.isFinite(opts.startupTimeout) || opts.startupTimeout <= 0) {
    throw new Error('--startup-timeout must be a positive number');
  }
  opts.codexConfig = path.resolve(expandPath(opts.codexConfig));
  opts.antigravityMcp = path.resolve(expandPath(opts.antigravityMcp));
  opts.vscodeMcp = path.resolve(expandPath(opts.vscodeMcp));
  return opts;
}

function expandPath(p) {
  if (!p) return p;
  if (p === '~') return HOME;
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(HOME, p.slice(2));
  return p.replace(/%USERPROFILE%/gi, HOME).replace(/\$env:USERPROFILE/gi, HOME).replace(/%APPDATA%/gi, APPDATA).replace(/\$env:APPDATA/gi, APPDATA);
}

function readTextIfExists(file) {
  try { return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''); }
  catch (err) {
    if (err.code === 'ENOENT') return '';
    throw err;
  }
}

function ensureParent(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function backupFile(file) {
  if (!fs.existsSync(file)) return null;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const backup = `${file}.bak-${stamp}`;
  fs.copyFileSync(file, backup);
  return backup;
}

function splitTomlPath(header) {
  const out = [];
  let cur = '';
  let quote = null;
  let esc = false;
  for (const ch of header.trim()) {
    if (quote) {
      cur += ch;
      if (quote === '"' && esc) { esc = false; continue; }
      if (quote === '"' && ch === '\\') { esc = true; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '.') { out.push(unquoteTomlKey(cur.trim())); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(unquoteTomlKey(cur.trim()));
  return out;
}

function unquoteTomlKey(key) {
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    return parseTomlString(key);
  }
  return key;
}

function parseTomlString(raw) {
  const v = raw.trim();
  if (v.startsWith('"')) return JSON.parse(v);
  if (v.startsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  return v;
}

function parseStringArray(raw) {
  const v = raw.trim();
  if (!v.startsWith('[')) return [];
  try {
    const arr = JSON.parse(v.replace(/,\s*\]/g, ']'));
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    const out = [];
    let cur = '';
    let quote = null;
    let esc = false;
    for (let i = 1; i < v.length; i++) {
      const ch = v[i];
      if (!quote && ch === ']') break;
      if (quote) {
        cur += ch;
        if (quote === '"' && esc) { esc = false; continue; }
        if (quote === '"' && ch === '\\') { esc = true; continue; }
        if (ch === quote) {
          out.push(parseTomlString(cur));
          cur = '';
          quote = null;
        }
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; cur = ch; }
    }
    return out;
  }
}

function parseTomlValue(raw) {
  const v = raw.trim().replace(/\s+#.*$/, '');
  if (v.startsWith('[')) return parseStringArray(v);
  if (v.startsWith('"') || v.startsWith("'")) return parseTomlString(v);
  if (/^(true|false)$/i.test(v)) return /^true$/i.test(v);
  if (/^[+-]?\d+(?:\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function parseCodexMcp(file) {
  const text = readTextIfExists(file);
  const servers = new Map();
  let current = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const header = rawLine.match(/^\s*\[([^\]]+)]\s*$/);
    if (header) {
      const parts = splitTomlPath(header[1]);
      if (parts[0] === 'mcp_servers' && parts[1]) {
        const name = parts[1];
        if (!servers.has(name)) servers.set(name, { name, env: {}, headers: {} });
        current = { name, section: parts[2] || 'main' };
      } else {
        current = null;
      }
      continue;
    }
    if (!current) continue;
    const kv = rawLine.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*(.+?)\s*$/);
    if (!kv) continue;
    const [, key, rawValue] = kv;
    const server = servers.get(current.name);
    const value = parseTomlValue(rawValue);
    if (current.section === 'env') server.env[key] = String(value);
    else if (current.section === 'headers') server.headers[key] = String(value);
    else if (key === 'args' || key === 'env_vars') server[key] = Array.isArray(value) ? value.map(String) : [];
    else server[key] = value;
  }
  return { text, servers };
}

function readJsonMcp(file) {
  const text = readTextIfExists(file);
  if (!text.trim()) return { raw: { servers: {}, inputs: [] }, servers: new Map() };
  const raw = JSON.parse(text);
  if (!raw.servers || typeof raw.servers !== 'object') raw.servers = {};
  if (!Array.isArray(raw.inputs)) raw.inputs = [];
  return { raw, servers: new Map(Object.entries(raw.servers)) };
}

function cleanObject(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (!Array.isArray(v) && typeof v === 'object' && Object.keys(v).length === 0) continue;
    out[k] = v;
  }
  return out;
}

function codexToAntigravity(server) {
  const out = {};
  if (server.command) {
    out.command = String(server.command);
    out.args = Array.isArray(server.args) ? server.args.map(String) : [];
    const env = { ...(server.env || {}) };
    for (const key of server.env_vars || []) {
      if (!env[key]) env[key] = `\${env:${key}}`;
    }
    if (Object.keys(env).length) out.env = env;
    out.type = server.type ? String(server.type) : 'stdio';
  }
  if (server.url) out.url = String(server.url);
  if (server.headers && Object.keys(server.headers).length) out.headers = { ...server.headers };
  return cleanObject(out);
}

function comparableServer(server) {
  const out = {};
  if (server.command) {
    out.command = String(server.command);
    out.args = Array.isArray(server.args) ? server.args.map(String) : [];
    if (server.env && Object.keys(server.env).length) out.env = { ...server.env };
    out.type = server.type ? String(server.type) : 'stdio';
  }
  if (server.url) out.url = String(server.url);
  if (server.headers && Object.keys(server.headers).length) out.headers = { ...server.headers };
  return sortKeys(cleanObject(out));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(k => [k, sortKeys(value[k])]));
}

function stable(value) {
  return JSON.stringify(sortKeys(value));
}

function tomlKey(key) {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : tomlString(key);
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function tomlArray(values) {
  return `[${values.map(tomlString).join(', ')}]`;
}

function blockFromAntigravity(name, server, startupTimeout) {
  const table = `mcp_servers.${tomlKey(name)}`;
  const lines = ['', `[${table}]`];
  if (server.command) {
    lines.push(`command = ${tomlString(server.command)}`);
    lines.push(`args = ${tomlArray(Array.isArray(server.args) ? server.args : [])}`);
    const env = server.env && typeof server.env === 'object' ? server.env : {};
    const envVars = [];
    const inlineEnv = {};
    for (const [key, value] of Object.entries(env)) {
      const m = String(value).match(/^\$\{env:([A-Za-z_][A-Za-z0-9_]*)}$/);
      if (m && m[1] === key) envVars.push(key);
      else inlineEnv[key] = value;
    }
    if (envVars.length) lines.push(`env_vars = ${tomlArray(envVars.sort())}`);
    if (server.type && server.type !== 'stdio') lines.push(`type = ${tomlString(server.type)}`);
    lines.push(`startup_timeout_sec = ${Number(startupTimeout).toFixed(1)}`);
    if (Object.keys(inlineEnv).length) {
      lines.push('', `[${table}.env]`);
      for (const [key, value] of Object.entries(inlineEnv).sort()) lines.push(`${tomlKey(key)} = ${tomlString(value)}`);
    }
  }
  if (server.url) lines.push(`url = ${tomlString(server.url)}`);
  if (server.headers && typeof server.headers === 'object' && Object.keys(server.headers).length) {
    lines.push('', `[${table}.headers]`);
    for (const [key, value] of Object.entries(server.headers).sort()) lines.push(`${tomlKey(key)} = ${tomlString(value)}`);
  }
  return `${lines.join('\n')}\n`;
}

function serverLine(name, server) {
  const bits = [];
  if (server.command) bits.push(`cmd=${server.command}`);
  if (server.url) bits.push(`url=${server.url}`);
  const envKeys = Object.keys(server.env || {}).sort();
  if (envKeys.length) bits.push(`env=${envKeys.join(',')}`);
  return `${name}: ${bits.join('; ') || 'empty'}`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const codex = parseCodexMcp(opts.codexConfig);
  const ag = readJsonMcp(opts.antigravityMcp);
  const vscode = readJsonMcp(opts.vscodeMcp);

  const targets = [
    { name: 'codex', kind: 'toml', path: opts.codexConfig, servers: codex.servers, text: codex.text, raw: null, exists: fs.existsSync(opts.codexConfig) },
    { name: 'antigravity', kind: 'json', path: opts.antigravityMcp, servers: ag.servers, text: null, raw: ag.raw, exists: fs.existsSync(opts.antigravityMcp) },
    { name: 'vscode', kind: 'json', path: opts.vscodeMcp, servers: vscode.servers, text: null, raw: vscode.raw, exists: fs.existsSync(opts.vscodeMcp) },
  ];

  const allNames = new Set();
  for (const t of targets) for (const name of t.servers.keys()) allNames.add(name);

  const sourcePriority = ['codex', 'antigravity', 'vscode'];
  function findSource(name) {
    for (const srcName of sourcePriority) {
      const src = targets.find(t => t.name === srcName);
      if (src && src.servers.has(name)) return src;
    }
    return null;
  }

  function serverToJson(name, source) {
    const server = source.servers.get(name);
    return source.kind === 'toml' ? codexToAntigravity(server) : comparableServer(server);
  }

  const missingByTarget = {};
  for (const t of targets) missingByTarget[t.name] = [];
  const conflicts = [];

  for (const name of [...allNames].sort()) {
    const presentTargets = targets.filter(t => t.servers.has(name));
    const missingTargets = targets.filter(t => !t.servers.has(name));
    if (presentTargets.length > 1) {
      const norms = presentTargets.map(t => stable(serverToJson(name, t)));
      if (new Set(norms).size > 1) conflicts.push(name);
    }
    for (const t of missingTargets) missingByTarget[t.name].push(name);
  }

  const totalMissing = Object.values(missingByTarget).reduce((s, v) => s + v.length, 0);

  const result = {
    mode: opts.apply ? 'apply' : 'dry-run',
    paths: { codexConfig: opts.codexConfig, antigravityMcp: opts.antigravityMcp, vscodeMcp: opts.vscodeMcp },
    counts: { codex: codex.servers.size, antigravity: ag.servers.size, vscode: vscode.servers.size, union: allNames.size, conflicts: conflicts.length, totalMissing },
    missingByTarget,
    conflicts,
    backups: {},
    changed: false,
  };

  if (opts.apply && totalMissing > 0) {
    for (const t of targets) {
      const missing = missingByTarget[t.name];
      if (!missing.length) continue;
      if (opts.backup && t.exists) result.backups[t.name] = backupFile(t.path);
      if (t.kind === 'json') {
        for (const name of missing) {
          const source = findSource(name);
          if (source) t.raw.servers[name] = serverToJson(name, source);
        }
        ensureParent(t.path);
        fs.writeFileSync(t.path, `${JSON.stringify(t.raw, null, 2)}\n`, 'utf8');
        result.changed = true;
      } else {
        let text = t.text;
        if (text && !text.endsWith('\n')) text += '\n';
        for (const name of missing) {
          const source = findSource(name);
          if (source) text += blockFromAntigravity(name, serverToJson(name, source), opts.startupTimeout);
        }
        ensureParent(t.path);
        fs.writeFileSync(t.path, text, 'utf8');
        result.changed = true;
      }
    }
  }

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Codex MCP servers: ${codex.servers.size}`);
  console.log(`Antigravity MCP servers: ${ag.servers.size}`);
  console.log(`VSCode MCP servers: ${vscode.servers.size}`);
  console.log(`Union MCP servers: ${allNames.size}`);
  if (totalMissing === 0) console.log('Union already synced: no missing MCP servers.');
  for (const t of targets) {
    const missing = missingByTarget[t.name];
    if (!missing.length) continue;
    console.log(`\nMissing from ${t.name} (${missing.length}):`);
    for (const name of missing) {
      const source = findSource(name);
      const jsonServer = source ? serverToJson(name, source) : null;
      console.log(`  - ${name} (from ${source ? source.name : '?'})${jsonServer ? `: ${serverLine(name, jsonServer)}` : ''}`);
    }
  }
  if (conflicts.length) {
    console.log(`\nSame-name differences not overwritten (${conflicts.length}): ${conflicts.join(', ')}`);
    console.log('Review these manually if you want one side to replace the other.');
  }
  if (!opts.apply && totalMissing > 0) console.log('\nDry-run only. Re-run with --apply to write changes.');
  if (opts.apply) {
    console.log(result.changed ? '\nApplied MCP union sync.' : '\nNo changes needed.');
    for (const [label, backup] of Object.entries(result.backups)) if (backup) console.log(`Backup ${label}: ${backup}`);
  }
}

try { main(); }
catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
