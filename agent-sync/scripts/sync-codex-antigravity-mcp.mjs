#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const HOME = os.homedir();
const APPDATA = process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming');
const DEFAULT_CODEX_CONFIG = path.join(HOME, '.codex', 'config.toml');
const DEFAULT_ANTIGRAVITY_MCP = path.join(APPDATA, 'Antigravity', 'User', 'mcp.json');

function usage(exitCode = 0) {
  console.log(`Usage: node scripts/sync-codex-antigravity-mcp.mjs [options]\n\nSynchronize the union of MCP servers between Codex and Antigravity.\nDefault mode is dry-run; use --apply to write changes.\n\nOptions:\n  --apply                         Write missing MCP servers to the other app.\n  --json                          Print machine-readable summary.\n  --codex-config <path>            Override Codex config.toml path.\n  --antigravity-mcp <path>         Override Antigravity User/mcp.json path.\n  --startup-timeout <seconds>      Startup timeout for Antigravity->Codex stdio servers (default: 120).\n  --no-backup                      Do not create .bak-* files before writing.\n  --help                           Show help.\n\nDefaults:\n  Codex config:       ${DEFAULT_CODEX_CONFIG}\n  Antigravity MCP:    ${DEFAULT_ANTIGRAVITY_MCP}\n`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const opts = {
    apply: false,
    json: false,
    backup: true,
    codexConfig: DEFAULT_CODEX_CONFIG,
    antigravityMcp: DEFAULT_ANTIGRAVITY_MCP,
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
    else if (a === '--startup-timeout') opts.startupTimeout = Number(next());
    else throw new Error(`Unknown option: ${a}`);
  }
  if (!Number.isFinite(opts.startupTimeout) || opts.startupTimeout <= 0) {
    throw new Error('--startup-timeout must be a positive number');
  }
  opts.codexConfig = path.resolve(expandPath(opts.codexConfig));
  opts.antigravityMcp = path.resolve(expandPath(opts.antigravityMcp));
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

function readAntigravityMcp(file) {
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
  const ag = readAntigravityMcp(opts.antigravityMcp);

  const codexNames = new Set(codex.servers.keys());
  const agNames = new Set(ag.servers.keys());
  const codexOnly = [...codexNames].filter(n => !agNames.has(n)).sort();
  const antigravityOnly = [...agNames].filter(n => !codexNames.has(n)).sort();
  const common = [...codexNames].filter(n => agNames.has(n)).sort();
  const conflicts = common.filter(name => stable(comparableServer(codexToAntigravity(codex.servers.get(name)))) !== stable(comparableServer(ag.servers.get(name))));

  const result = {
    mode: opts.apply ? 'apply' : 'dry-run',
    paths: { codexConfig: opts.codexConfig, antigravityMcp: opts.antigravityMcp },
    counts: { codex: codexNames.size, antigravity: agNames.size, codexOnly: codexOnly.length, antigravityOnly: antigravityOnly.length, common: common.length, conflicts: conflicts.length },
    codexOnly,
    antigravityOnly,
    conflicts,
    backups: {},
    changed: false,
  };

  if (opts.apply && (codexOnly.length || antigravityOnly.length)) {
    if (opts.backup) {
      if (codexOnly.length) result.backups.antigravityMcp = backupFile(opts.antigravityMcp);
      if (antigravityOnly.length) result.backups.codexConfig = backupFile(opts.codexConfig);
    }
    if (codexOnly.length) {
      for (const name of codexOnly) ag.raw.servers[name] = codexToAntigravity(codex.servers.get(name));
      ensureParent(opts.antigravityMcp);
      fs.writeFileSync(opts.antigravityMcp, `${JSON.stringify(ag.raw, null, 2)}\n`, 'utf8');
      result.changed = true;
    }
    if (antigravityOnly.length) {
      ensureParent(opts.codexConfig);
      let text = codex.text;
      if (text && !text.endsWith('\n')) text += '\n';
      for (const name of antigravityOnly) text += blockFromAntigravity(name, comparableServer(ag.servers.get(name)), opts.startupTimeout);
      fs.writeFileSync(opts.codexConfig, text, 'utf8');
      result.changed = true;
    }
  }

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Codex MCP servers: ${codexNames.size}`);
  console.log(`Antigravity MCP servers: ${agNames.size}`);
  if (!codexOnly.length && !antigravityOnly.length) console.log('Union already synced: no missing MCP servers.');
  if (codexOnly.length) {
    console.log(`\nCodex-only -> Antigravity (${codexOnly.length}):`);
    for (const name of codexOnly) console.log(`  - ${serverLine(name, codexToAntigravity(codex.servers.get(name)))}`);
  }
  if (antigravityOnly.length) {
    console.log(`\nAntigravity-only -> Codex (${antigravityOnly.length}):`);
    for (const name of antigravityOnly) console.log(`  - ${serverLine(name, comparableServer(ag.servers.get(name)))}`);
  }
  if (conflicts.length) {
    console.log(`\nSame-name differences not overwritten (${conflicts.length}): ${conflicts.join(', ')}`);
    console.log('Review these manually if you want one side to replace the other.');
  }
  if (!opts.apply && (codexOnly.length || antigravityOnly.length)) console.log('\nDry-run only. Re-run with --apply to write changes.');
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
