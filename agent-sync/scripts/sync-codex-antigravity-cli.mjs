#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const HOME = os.homedir();
const APPDATA = process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming');
const LOCALAPPDATA = process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local');
const DEFAULT_CODEX_CONFIG = path.join(HOME, '.codex', 'config.toml');
const DEFAULT_AG_SETTINGS = path.join(APPDATA, 'Antigravity', 'User', 'settings.json');
const DEFAULT_CLI_NAMES = [
  'codex', 'claude', 'gemini', 'postman-cli', 'supabase', 'vercel',
  'firecrawl', 'higgsfield', 'designlang', 'designmd', 'antigravity', 'code'
];
const DEFAULT_DIRS = [
  path.join(APPDATA, 'npm'),
  path.join(LOCALAPPDATA, 'Programs', 'Antigravity', 'bin'),
  path.join(LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'bin'),
  path.join(LOCALAPPDATA, 'Programs', 'PowerShell', '7'),
];
const PATH_MACRO = '${env:Path}';

function usage(exitCode = 0) {
  console.log(`Usage: node scripts/sync-codex-antigravity-cli.mjs [options]\n\nSynchronize CLI PATH access between Codex and Antigravity terminals.\nDefault mode is dry-run; use --apply to write changes.\n\nOptions:\n  --apply                         Update Codex config + Antigravity settings.\n  --json                          Print machine-readable summary.\n  --codex-config <path>            Override Codex config.toml path.\n  --antigravity-settings <path>    Override Antigravity User/settings.json path.\n  --cli <name[,name...]>           Add CLI names to verify/discover. Can repeat.\n  --path <dir>                     Add an explicit directory to sync. Can repeat.\n  --no-backup                      Do not create .bak-* files before writing.\n  --help                           Show help.\n\nDefaults:\n  Codex config:          ${DEFAULT_CODEX_CONFIG}\n  Antigravity settings:  ${DEFAULT_AG_SETTINGS}\n`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const opts = {
    apply: false,
    json: false,
    backup: true,
    codexConfig: DEFAULT_CODEX_CONFIG,
    antigravitySettings: DEFAULT_AG_SETTINGS,
    cliNames: [...DEFAULT_CLI_NAMES],
    explicitPaths: [],
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
    else if (a === '--antigravity-settings') opts.antigravitySettings = next();
    else if (a === '--cli') opts.cliNames.push(...next().split(',').map(s => s.trim()).filter(Boolean));
    else if (a === '--path') opts.explicitPaths.push(next());
    else throw new Error(`Unknown option: ${a}`);
  }
  opts.codexConfig = path.resolve(expandPath(opts.codexConfig));
  opts.antigravitySettings = path.resolve(expandPath(opts.antigravitySettings));
  opts.explicitPaths = opts.explicitPaths.map(p => path.resolve(expandPath(p)));
  opts.cliNames = [...new Set(opts.cliNames.map(s => s.trim()).filter(Boolean))];
  return opts;
}

function expandPath(p) {
  if (!p) return p;
  if (p === '~') return HOME;
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(HOME, p.slice(2));
  return p
    .replace(/%USERPROFILE%/gi, HOME)
    .replace(/\$env:USERPROFILE/gi, HOME)
    .replace(/%APPDATA%/gi, APPDATA)
    .replace(/\$env:APPDATA/gi, APPDATA)
    .replace(/%LOCALAPPDATA%/gi, LOCALAPPDATA)
    .replace(/\$env:LOCALAPPDATA/gi, LOCALAPPDATA);
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

function splitPathValue(value) {
  return String(value || '').split(';').map(s => s.trim()).filter(Boolean);
}

function normalizeForCompare(entry) {
  return String(entry || '').trim().replace(/[\\/]+$/, '').toLowerCase();
}

function isPathMacro(entry) {
  return /^(\$\{env:path\}|%path%)$/i.test(String(entry || '').trim());
}

function uniqueEntries(entries) {
  const seen = new Set();
  const out = [];
  for (const raw of entries) {
    const entry = String(raw || '').trim();
    if (!entry) continue;
    const key = isPathMacro(entry) ? '__path_macro__' : normalizeForCompare(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

function mergePathEntries(baseEntries, syncDirs, { appendMacro = false } = {}) {
  const dirs = uniqueEntries([...syncDirs, ...baseEntries]);
  const withoutMacro = dirs.filter(e => !isPathMacro(e));
  const hadMacro = appendMacro || dirs.some(isPathMacro);
  return hadMacro ? [...withoutMacro, PATH_MACRO] : withoutMacro;
}

function jsonStringLiteral(value) {
  return JSON.stringify(String(value));
}

function tomlSingleQuoted(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function parseCodexPath(file) {
  const text = readTextIfExists(file);
  const re = /PATH\s*=\s*('([^']*(?:''[^']*)*)'|"((?:\\.|[^"\\])*)")/;
  const m = text.match(re);
  if (!m) return { text, pathValue: '', entries: [], hasPath: false, quote: "'" };
  let pathValue;
  let quote;
  if (m[1].startsWith("'")) {
    quote = "'";
    pathValue = m[2].replace(/''/g, "'");
  } else {
    quote = '"';
    pathValue = JSON.parse(`"${m[3]}"`);
  }
  return { text, pathValue, entries: splitPathValue(pathValue), hasPath: true, quote, match: m };
}

function updateCodexPath(parsed, file, newValue) {
  let text = parsed.text;
  const replacement = parsed.quote === '"' ? `PATH = ${jsonStringLiteral(newValue)}` : `PATH = ${tomlSingleQuoted(newValue)}`;
  if (parsed.hasPath) {
    text = text.replace(/PATH\s*=\s*('([^']*(?:''[^']*)*)'|"((?:\\.|[^"\\])*)")/, replacement);
  } else if (/^\s*\[shell_environment_policy]\s*$/m.test(text)) {
    text = text.replace(/^\s*\[shell_environment_policy]\s*$/m, `[shell_environment_policy]\nset = { PATH = ${tomlSingleQuoted(newValue)} }`);
  } else {
    if (text && !text.endsWith('\n')) text += '\n';
    text += `\n[shell_environment_policy]\nset = { PATH = ${tomlSingleQuoted(newValue)} }\n`;
  }
  ensureParent(file);
  fs.writeFileSync(file, text, 'utf8');
}

function unescapeJsonStringContent(content) {
  return JSON.parse(`"${content}"`);
}

function extractAntigravityPath(text) {
  const objectRe = /"terminal\.integrated\.env\.windows"\s*:\s*\{[\s\S]*?\n\s*\}/m;
  const objectMatch = text.match(objectRe);
  if (!objectMatch) return { hasObject: false, hasPath: false, pathValue: '', entries: [] };
  const pathRe = /"Path"\s*:\s*"((?:\\.|[^"\\])*)"/m;
  const pathMatch = objectMatch[0].match(pathRe);
  if (!pathMatch) return { hasObject: true, hasPath: false, pathValue: '', entries: [], objectMatch };
  const pathValue = unescapeJsonStringContent(pathMatch[1]);
  return { hasObject: true, hasPath: true, pathValue, entries: splitPathValue(pathValue), objectMatch, pathMatch };
}

function updateAntigravityPath(text, newValue) {
  const escaped = jsonStringLiteral(newValue);
  const info = extractAntigravityPath(text);
  if (!text.trim()) text = '{\n}\n';
  if (info.hasObject && info.hasPath) {
    return text.replace(/("terminal\.integrated\.env\.windows"\s*:\s*\{[\s\S]*?"Path"\s*:\s*)"(?:\\.|[^"\\])*"/m, `$1${escaped}`);
  }
  if (info.hasObject && !info.hasPath) {
    return text.replace(/("terminal\.integrated\.env\.windows"\s*:\s*\{)/m, `$1\n        "Path": ${escaped}`);
  }
  const insertion = `,\n    "terminal.integrated.env.windows": {\n        "Path": ${escaped}\n    }`;
  return text.replace(/\n\s*}\s*$/m, `${insertion}\n}`);
}

function pathExistsDir(entry) {
  if (isPathMacro(entry)) return false;
  try { return fs.statSync(expandPath(entry)).isDirectory(); }
  catch { return false; }
}

function commandCandidates(name) {
  const exts = ['.cmd', '.ps1', '.exe', '.bat', ''];
  return exts.map(ext => name.toLowerCase().endsWith(ext) ? name : `${name}${ext}`);
}

function discoverCommands(cliNames, searchEntries) {
  const searchDirs = uniqueEntries(searchEntries.filter(e => !isPathMacro(e)).map(expandPath));
  const found = {};
  const missing = [];
  for (const cli of cliNames) {
    let hit = null;
    for (const dir of searchDirs) {
      for (const candidate of commandCandidates(cli)) {
        const p = path.join(dir, candidate);
        if (fs.existsSync(p)) { hit = p; break; }
      }
      if (hit) break;
    }
    if (hit) found[cli] = hit;
    else missing.push(cli);
  }
  return { found, missing };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const codex = parseCodexPath(opts.codexConfig);
  const agText = readTextIfExists(opts.antigravitySettings);
  const ag = extractAntigravityPath(agText);

  const processPathEntries = splitPathValue(process.env.Path || process.env.PATH || '');
  const candidateSearchDirs = uniqueEntries([
    ...opts.explicitPaths,
    ...DEFAULT_DIRS,
    ...codex.entries,
    ...ag.entries,
    ...processPathEntries,
  ]);
  const discovered = discoverCommands(opts.cliNames, candidateSearchDirs);
  const discoveredDirs = Object.values(discovered.found).map(p => path.dirname(p));
  const configuredDirs = uniqueEntries([
    ...opts.explicitPaths,
    ...DEFAULT_DIRS.filter(pathExistsDir),
    ...discoveredDirs,
  ]);

  const targetCodexEntries = mergePathEntries(codex.entries, configuredDirs);
  const targetAgEntries = mergePathEntries(ag.entries, configuredDirs, { appendMacro: true });
  const targetCodexPath = targetCodexEntries.join(';');
  const targetAgPath = targetAgEntries.join(';');

  const codexChanged = targetCodexPath !== codex.pathValue;
  const agChanged = targetAgPath !== ag.pathValue;
  const result = {
    mode: opts.apply ? 'apply' : 'dry-run',
    paths: { codexConfig: opts.codexConfig, antigravitySettings: opts.antigravitySettings },
    counts: {
      codexPathEntries: codex.entries.length,
      antigravityPathEntries: ag.entries.length,
      syncDirs: configuredDirs.length,
      foundCli: Object.keys(discovered.found).length,
      missingCli: discovered.missing.length,
    },
    changes: { codexPath: codexChanged, antigravityPath: agChanged },
    syncDirs: configuredDirs,
    foundCli: discovered.found,
    missingCli: discovered.missing,
    backups: {},
  };

  if (opts.apply && (codexChanged || agChanged)) {
    if (opts.backup) {
      if (codexChanged) result.backups.codexConfig = backupFile(opts.codexConfig);
      if (agChanged) result.backups.antigravitySettings = backupFile(opts.antigravitySettings);
    }
    if (codexChanged) updateCodexPath(codex, opts.codexConfig, targetCodexPath);
    if (agChanged) {
      ensureParent(opts.antigravitySettings);
      fs.writeFileSync(opts.antigravitySettings, updateAntigravityPath(agText, targetAgPath), 'utf8');
    }
  }

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Codex PATH entries: ${codex.entries.length}`);
  console.log(`Antigravity terminal PATH entries: ${ag.entries.length}`);
  console.log(`Syncable CLI directories: ${configuredDirs.length}`);
  if (configuredDirs.length) {
    console.log('\nDirectories synced/kept:');
    for (const dir of configuredDirs) console.log(`  - ${dir}`);
  }
  console.log(`\nFound CLI commands: ${Object.keys(discovered.found).length}/${opts.cliNames.length}`);
  for (const [name, p] of Object.entries(discovered.found).sort()) console.log(`  - ${name}: ${p}`);
  if (discovered.missing.length) {
    console.log(`\nMissing CLI commands (not installed or not discoverable): ${discovered.missing.join(', ')}`);
  }
  if (!codexChanged && !agChanged) console.log('\nCLI PATH union already synced.');
  else {
    if (codexChanged) console.log('\nCodex PATH would be updated.');
    if (agChanged) console.log('Antigravity terminal PATH would be updated.');
    if (!opts.apply) console.log('Dry-run only. Re-run with --apply to write changes.');
  }
  if (opts.apply) {
    console.log(codexChanged || agChanged ? '\nApplied CLI PATH sync.' : '\nNo changes needed.');
    for (const [label, backup] of Object.entries(result.backups)) if (backup) console.log(`Backup ${label}: ${backup}`);
  }
}

try { main(); }
catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
