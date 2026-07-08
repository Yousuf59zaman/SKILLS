#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const HOME = os.homedir();
const WORKSPACE = path.join(HOME, '.openclaw', 'workspace');
const DEFAULT_GITHUB_BRANCH_PREFIX = 'agent-sync';
const GITHUB_DECISIONS = new Set([
  'local-only',
  'pull-merge',
  'merge-and-push-branch',
  'direct-push',
  'manual-conflict-review',
]);
const DEFAULT_ROOTS = {
  codex: path.join(HOME, '.codex', 'skills'),
  claude: path.join(HOME, '.claude', 'skills'),
  antigravity: path.join(HOME, '.gemini', 'antigravity', 'skills'),
  vscode: path.join(HOME, '.vscode', 'skills'),
};
const DEFAULT_MTIME_TOLERANCE_MS = 2000;
const IGNORE_DISCOVERY_DIRS = new Set([
  '.git', '.github', '.system', '.tmp', 'tmp', 'node_modules', 'vendor_imports',
  'backups', 'dist', '__pycache__', '.venv', 'venv'
]);
const NEVER_COPY_DIRS = new Set(['.git', 'node_modules', '__pycache__']);
const PUBLISH_BLOCKED_BASENAMES = new Set([
  '.env',
  '.env.local',
  '.env.production',
  '.npmrc',
  'auth.json',
  'credentials.json',
  'secrets.json',
  'token.json',
]);

function usage(exitCode = 0) {
  console.log(`Usage: node scripts/sync-agent-skills.mjs [options]\n\nOptions:\n  --apply                       Copy missing skills and replace outdated differing skills. Default is dry-run.\n  --create-missing-roots        Create missing root directories during --apply.\n  --json                        Print full JSON result.\n  --max-depth <n>               Recursive discovery depth under each root (default: 4).\n  --codex-root <path>           Override Codex skills root.\n  --claude-root <path>          Override Claude skills root.\n  --antigravity-root <path>     Override Antigravity skills root.\n  --vscode-root <path>          Override VSCode skills root.\n  --root <name=path>            Add/override a root. Example: --root antigravity=C:\\path\\skills\n  --include-dot                 Include dot/system folders during discovery (off by default).\n  --no-content-sync             Only copy missing skills; do not replace differing existing skills.\n  --mtime-tolerance-ms <n>      Block latest-wins replacement when different versions are this close in mtime (default: ${DEFAULT_MTIME_TOLERANCE_MS}).\n  --allow-ambiguous-latest      Allow latest-wins even when different versions have near-tied mtimes.\n  --no-github-check             Disable the mandatory GitHub compare report. Use only for explicit local-only runs.\n  --github-decision <choice>    Explicit GitHub decision: local-only, pull-merge, merge-and-push-branch, direct-push, manual-conflict-review.\n  --push-github                 After successful local apply, copy final source root skills to GitHub and push.\n  --github-repo <owner/repo>    GitHub repo to push to (default: Yousuf59zaman/SKILLS).\n  --github-worktree <path>      Local clone/worktree path (default: <codex-root>/.github/Yousuf59zaman-SKILLS).\n  --github-source <root-name>   Root to publish after sync (default: codex).\n  --github-branch <name>        Branch to push for GitHub publishing (default: generated agent-sync/<timestamp> branch).\n  --github-branch-prefix <name> Prefix for generated GitHub publish branch (default: ${DEFAULT_GITHUB_BRANCH_PREFIX}).\n  --github-direct-push         Push directly to the current GitHub worktree branch. Safer default is a new branch.\n  --help                        Show help.\n\nDefault roots:\n  codex       ${DEFAULT_ROOTS.codex}\n  claude      ${DEFAULT_ROOTS.claude}\n  antigravity ${DEFAULT_ROOTS.antigravity}\n`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const opts = {
    apply: false,
    json: false,
    createMissingRoots: false,
    maxDepth: 4,
    includeDot: false,
    contentSync: true,
    allowAmbiguousLatest: false,
    mtimeToleranceMs: DEFAULT_MTIME_TOLERANCE_MS,
    githubCheck: true,
    githubDecision: null,
    pushGithub: false,
    githubRepo: 'Yousuf59zaman/SKILLS',
    githubWorktree: null,
    githubSource: 'codex',
    githubBranch: null,
    githubBranchPrefix: DEFAULT_GITHUB_BRANCH_PREFIX,
    githubDirectPush: false,
    roots: { ...DEFAULT_ROOTS },
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
    else if (a === '--create-missing-roots') opts.createMissingRoots = true;
    else if (a === '--include-dot') opts.includeDot = true;
    else if (a === '--no-content-sync') opts.contentSync = false;
    else if (a === '--allow-ambiguous-latest') opts.allowAmbiguousLatest = true;
    else if (a === '--no-github-check') opts.githubCheck = false;
    else if (a === '--github-decision') opts.githubDecision = next();
    else if (a === '--push-github') opts.pushGithub = true;
    else if (a === '--github-direct-push') opts.githubDirectPush = true;
    else if (a === '--github-repo') opts.githubRepo = next();
    else if (a === '--github-worktree') opts.githubWorktree = next();
    else if (a === '--github-source') opts.githubSource = next();
    else if (a === '--github-branch') opts.githubBranch = next();
    else if (a === '--github-branch-prefix') opts.githubBranchPrefix = next();
    else if (a === '--max-depth') opts.maxDepth = Number(next());
    else if (a === '--mtime-tolerance-ms') opts.mtimeToleranceMs = Number(next());
    else if (a === '--codex-root') opts.roots.codex = next();
    else if (a === '--claude-root') opts.roots.claude = next();
    else if (a === '--antigravity-root') opts.roots.antigravity = next();
    else if (a === '--vscode-root') opts.roots.vscode = next();
    else if (a === '--root') {
      const v = next();
      const eq = v.indexOf('=');
      if (eq <= 0) throw new Error('--root value must be name=path');
      opts.roots[v.slice(0, eq)] = v.slice(eq + 1);
    } else {
      throw new Error(`Unknown option: ${a}`);
    }
  }
  if (!Number.isFinite(opts.maxDepth) || opts.maxDepth < 1) throw new Error('--max-depth must be a positive number');
  if (!Number.isFinite(opts.mtimeToleranceMs) || opts.mtimeToleranceMs < 0) throw new Error('--mtime-tolerance-ms must be a non-negative number');
  if (opts.githubDecision && !GITHUB_DECISIONS.has(opts.githubDecision)) throw new Error(`--github-decision must be one of: ${[...GITHUB_DECISIONS].join(', ')}`);
  if (!opts.githubCheck && opts.pushGithub) throw new Error('--push-github cannot be used with --no-github-check');
  if (opts.githubDecision === 'direct-push' && !opts.githubDirectPush) throw new Error('--github-decision direct-push requires --github-direct-push');
  if (opts.githubDirectPush && opts.githubDecision && opts.githubDecision !== 'direct-push') throw new Error('--github-direct-push requires --github-decision direct-push when a decision is provided');
  if (opts.githubDirectPush && opts.githubBranch) throw new Error('--github-direct-push and --github-branch cannot be used together');
  opts.roots = Object.fromEntries(Object.entries(opts.roots).map(([k, v]) => [k, path.resolve(expandHome(v))]));
  if (!opts.githubWorktree) opts.githubWorktree = path.join(opts.roots.codex || DEFAULT_ROOTS.codex, '.github', 'Yousuf59zaman-SKILLS');
  opts.githubWorktree = path.resolve(expandHome(opts.githubWorktree));
  return opts;
}

function expandHome(p) {
  if (!p) return p;
  if (p === '~') return HOME;
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(HOME, p.slice(2));
  return p.replace(/%USERPROFILE%/gi, HOME).replace(/\$env:USERPROFILE/gi, HOME);
}

function readTextSafe(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
}

function parseFrontmatterName(skillMd) {
  const text = readTextSafe(skillMd);
  const m = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const line = m[1].split(/\r?\n/).find(l => /^\s*name\s*:/.test(l));
  if (!line) return null;
  return line.replace(/^\s*name\s*:\s*/, '').trim().replace(/^['"]|['"]$/g, '') || null;
}

function normalizeId(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function shouldIgnoreDiscoveryDir(name, includeDot) {
  if (!includeDot && name.startsWith('.')) return true;
  if (IGNORE_DISCOVERY_DIRS.has(name)) return true;
  return false;
}

function scanSkillContent(dir) {
  const files = [];
  let bytes = 0;
  let latestMtimeMs = 0;
  let skippedSymlinks = 0;

  function hashableData(rel, data) {
    if (data.includes(0)) return data;
    const textExts = new Set([
      '.bat', '.cmd', '.css', '.csv', '.html', '.js', '.json', '.jsx', '.md',
      '.mjs', '.ps1', '.py', '.toml', '.ts', '.tsx', '.txt', '.vbs', '.vue',
      '.yaml', '.yml'
    ]);
    if (!textExts.has(path.extname(rel).toLowerCase())) return data;
    return Buffer.from(data.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
  }

  function walk(current, rel = '') {
    let st;
    try { st = fs.lstatSync(current); } catch { return; }
    if (st.isSymbolicLink()) { skippedSymlinks++; return; }
    if (st.isDirectory()) {
      const base = path.basename(current);
      if (rel && NEVER_COPY_DIRS.has(base)) return;
      latestMtimeMs = Math.max(latestMtimeMs, st.mtimeMs || 0);
      let entries = [];
      try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { return; }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const ent of entries) walk(path.join(current, ent.name), path.join(rel, ent.name));
    } else if (st.isFile()) {
      const data = fs.readFileSync(current);
      latestMtimeMs = Math.max(latestMtimeMs, st.mtimeMs || 0);
      bytes += data.length;
      const relText = rel.replace(/\\/g, '/');
      files.push({ rel: relText, data: hashableData(relText, data) });
    }
  }

  walk(dir);
  const h = crypto.createHash('sha256');
  for (const f of files) {
    h.update(f.rel);
    h.update('\0');
    h.update(f.data);
    h.update('\0');
  }
  return {
    hash: h.digest('hex'),
    latestMtimeMs,
    latestMtime: latestMtimeMs ? new Date(latestMtimeMs).toISOString() : null,
    fileCount: files.length,
    bytes,
    skippedSymlinks,
  };
}

function discoverSkills(root, opts) {
  const result = { root, exists: fs.existsSync(root), skills: [], duplicates: [], errors: [] };
  if (!result.exists) return result;
  const seenReal = new Set();
  const byId = new Map();
  function walk(dir, depth) {
    let stat;
    try { stat = fs.lstatSync(dir); } catch (e) { result.errors.push({ path: dir, error: e.message }); return; }
    if (stat.isSymbolicLink()) return;
    if (!stat.isDirectory()) return;
    let real;
    try { real = fs.realpathSync(dir); } catch { real = dir; }
    if (seenReal.has(real)) return;
    seenReal.add(real);

    const skillMd = path.join(dir, 'SKILL.md');
    if (fs.existsSync(skillMd)) {
      const fmName = parseFrontmatterName(skillMd);
      const folderName = path.basename(dir);
      const id = normalizeId(fmName || folderName);
      if (!id) return;
      const content = scanSkillContent(dir);
      const entry = { id, name: fmName || folderName, folderName, path: dir, relativePath: path.relative(root, dir) || '.', skillMd, ...content };
      result.skills.push(entry);
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id).push(entry);
      return; // a skill folder owns its descendants
    }
    if (depth >= opts.maxDepth) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { result.errors.push({ path: dir, error: e.message }); return; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      if (shouldIgnoreDiscoveryDir(ent.name, opts.includeDot)) continue;
      walk(path.join(dir, ent.name), depth + 1);
    }
  }
  walk(root, 0);
  result.skills.sort((a, b) => a.id.localeCompare(b.id) || a.relativePath.localeCompare(b.relativePath));
  for (const [id, entries] of byId.entries()) {
    if (entries.length > 1) result.duplicates.push({ id, entries: entries.map(e => e.relativePath) });
  }
  return result;
}

function pickCanonical(entries) {
  return [...entries].sort((a, b) => a.relativePath.length - b.relativePath.length || a.latestMtimeMs - b.latestMtimeMs || a.relativePath.localeCompare(b.relativePath))[0];
}

function pickLatest(entries) {
  return [...entries].sort((a, b) => (b.latestMtimeMs || 0) - (a.latestMtimeMs || 0) || b.hash.localeCompare(a.hash) || a.path.localeCompare(b.path))[0];
}

function selectLatest(entries, opts) {
  const latest = pickLatest(entries);
  if (opts.allowAmbiguousLatest) return { latest, ambiguous: [] };
  const latestMtime = Number(latest.latestMtimeMs) || 0;
  const ambiguous = entries
    .filter(entry => entry.hash !== latest.hash)
    .filter(entry => Math.abs((Number(entry.latestMtimeMs) || 0) - latestMtime) <= opts.mtimeToleranceMs)
    .sort((a, b) => (b.latestMtimeMs || 0) - (a.latestMtimeMs || 0) || a.root.localeCompare(b.root));
  return { latest, ambiguous };
}

function ambiguitySummary(latest, ambiguous, opts) {
  const candidates = [latest, ...ambiguous].map(entry => ({
    root: entry.root,
    path: entry.path,
    latestMtime: entry.latestMtime,
    hash: entry.hash,
  }));
  return {
    candidates,
    reason: `Different same-name skill versions have mtimes within ${opts.mtimeToleranceMs}ms; refusing to pick a newest version automatically. Rerun after manually inspecting, touch the intended source skill to make it clearly newest, or pass --allow-ambiguous-latest.`,
  };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyDirSafe(src, dest, copied = { files: 0, dirs: 0, skippedSymlinks: 0 }) {
  const st = fs.lstatSync(src);
  if (st.isSymbolicLink()) { copied.skippedSymlinks++; return copied; }
  if (st.isDirectory()) {
    const base = path.basename(src);
    if (src !== dest && NEVER_COPY_DIRS.has(base)) return copied;
    if (!fs.existsSync(dest)) { fs.mkdirSync(dest, { recursive: true }); copied.dirs++; }
    const entries = fs.readdirSync(src, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const ent of entries) copyDirSafe(path.join(src, ent.name), path.join(dest, ent.name), copied);
  } else if (st.isFile()) {
    fs.copyFileSync(src, dest);
    try { fs.chmodSync(dest, st.mode); } catch {}
    copied.files++;
  }
  return copied;
}

function safePart(s) {
  return String(s).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'item';
}

function makeBackupRoot() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const root = path.join(WORKSPACE, 'backups', `agent-skills-union-sync-${stamp}`);
  ensureDir(root);
  return root;
}

function backupDir(src, backupRoot, label) {
  const dest = path.join(backupRoot, safePart(label));
  copyDirSafe(src, dest);
  return dest;
}

function preserveAmbiguousConflict(id, candidates, backupRoot) {
  const conflictRoot = path.join(backupRoot, 'conflicts', safePart(id));
  ensureDir(conflictRoot);
  const manifest = {
    id,
    preservedAt: new Date().toISOString(),
    note: 'Ambiguous same-name skill versions were preserved without changing active skill roots.',
    candidates: [],
  };
  for (const candidate of candidates) {
    const label = `${safePart(candidate.root)}-${String(candidate.hash || '').slice(0, 12) || 'nohash'}`;
    const dest = path.join(conflictRoot, label);
    if (!fs.existsSync(dest)) copyDirSafe(candidate.path, dest);
    manifest.candidates.push({
      root: candidate.root,
      sourcePath: candidate.path,
      preservedPath: dest,
      latestMtime: candidate.latestMtime,
      hash: candidate.hash,
    });
  }
  fs.writeFileSync(path.join(conflictRoot, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return conflictRoot;
}

function generatedGithubBranch(prefix) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, 'Z');
  const safePrefix = String(prefix || DEFAULT_GITHUB_BRANCH_PREFIX)
    .replace(/\\/g, '/')
    .replace(/[^a-zA-Z0-9._/-]+/g, '-')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/+/g, '/')
    || DEFAULT_GITHUB_BRANCH_PREFIX;
  return `${safePrefix}/${stamp}`;
}

function currentGitBranch(worktree) {
  return git(worktree, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
}

function prepareGithubPublishBranch(worktree, opts) {
  const current = currentGitBranch(worktree);
  if (opts.githubDirectPush) return { mode: 'direct', branch: current };
  const branch = opts.githubBranch || generatedGithubBranch(opts.githubBranchPrefix);
  git(worktree, ['checkout', '-B', branch]);
  return { mode: 'branch', branch, baseBranch: current };
}

function scanPublishSafety(worktree) {
  const blocked = [];
  function walk(current, rel = '') {
    let st;
    try { st = fs.lstatSync(current); } catch { return; }
    if (st.isSymbolicLink()) return;
    const base = path.basename(current);
    if (st.isDirectory()) {
      if (rel && NEVER_COPY_DIRS.has(base)) return;
      let entries = [];
      try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { return; }
      for (const ent of entries) walk(path.join(current, ent.name), path.join(rel, ent.name));
      return;
    }
    if (!st.isFile()) return;
    const lower = base.toLowerCase();
    const relText = rel.replace(/\\/g, '/');
    if (PUBLISH_BLOCKED_BASENAMES.has(lower) || lower.endsWith('.pem') || lower.endsWith('.key') || lower.endsWith('.p12')) {
      blocked.push({ path: relText, reason: 'blocked credential-like filename' });
      return;
    }
    if (st.size > 1024 * 1024) return;
    const text = readTextSafe(current);
    if (/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/.test(text)) {
      blocked.push({ path: relText, reason: 'private key block detected' });
    }
    if (/\b(?:refresh_token|client_secret|access_token)\b\s*[:=]\s*["'][^"']{12,}["']/i.test(text)) {
      blocked.push({ path: relText, reason: 'credential-looking token assignment detected' });
    }
  }
  walk(worktree);
  return blocked;
}


function run(command, args, options = {}) {
  const res = spawnSync(command, args, { encoding: 'utf8', shell: false, ...options });
  if (res.status !== 0) {
    const err = (res.stderr || res.stdout || '').trim();
    throw new Error(`${command} ${args.join(' ')} failed${err ? `: ${err.slice(0, 2000)}` : ''}`);
  }
  return { stdout: (res.stdout || '').trim(), stderr: (res.stderr || '').trim() };
}

function git(worktree, args) {
  return run('git', ['-C', worktree, ...args]);
}

function discoverGithubSkills(worktree, opts) {
  const inv = discoverSkills(worktree, { ...opts, includeDot: false });
  for (const skill of inv.skills) {
    try {
      const seconds = git(worktree, ['log', '-1', '--format=%ct', '--', skill.relativePath]).stdout.trim();
      const gitMtimeMs = Number(seconds) * 1000;
      if (Number.isFinite(gitMtimeMs) && gitMtimeMs > 0) {
        skill.latestMtimeMs = gitMtimeMs;
        skill.latestMtime = new Date(gitMtimeMs).toISOString();
        skill.mtimeSource = 'git-log';
      }
    } catch {
      skill.mtimeSource = 'filesystem';
    }
  }
  return inv;
}

function buildCanonicalMap(inv) {
  const grouped = new Map();
  for (const skill of inv.skills) {
    if (!grouped.has(skill.id)) grouped.set(skill.id, []);
    grouped.get(skill.id).push(skill);
  }
  const map = new Map();
  for (const [id, entries] of grouped.entries()) map.set(id, pickCanonical(entries));
  return map;
}

function tryGit(worktree, args) {
  try {
    return { ok: true, ...git(worktree, args) };
  } catch (e) {
    return { ok: false, stdout: '', stderr: '', error: e.message };
  }
}

function gitAheadBehind(worktree) {
  const upstream = tryGit(worktree, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  if (!upstream.ok) return { upstream: null, ahead: null, behind: null, error: upstream.error };
  const counts = tryGit(worktree, ['rev-list', '--left-right', '--count', 'HEAD...@{u}']);
  if (!counts.ok) return { upstream: upstream.stdout.trim(), ahead: null, behind: null, error: counts.error };
  const [ahead, behind] = counts.stdout.trim().split(/\s+/).map(n => Number(n));
  return {
    upstream: upstream.stdout.trim(),
    ahead: Number.isFinite(ahead) ? ahead : null,
    behind: Number.isFinite(behind) ? behind : null,
  };
}

function skillSummary(entry) {
  if (!entry) return null;
  return {
    root: entry.root || null,
    id: entry.id,
    name: entry.name,
    folderName: entry.folderName,
    path: entry.path,
    latestMtime: entry.latestMtime,
    mtimeSource: entry.mtimeSource || 'filesystem',
    hash: entry.hash,
  };
}

function inspectGithubDecision(opts) {
  const sourceRoot = opts.roots[opts.githubSource];
  const result = {
    mandatory: true,
    enabled: opts.githubCheck,
    repo: opts.githubRepo,
    worktree: opts.githubWorktree,
    source: opts.githubSource,
    sourceRoot: sourceRoot || null,
    status: 'not-checked',
    requiresUserDecision: false,
    recommendedActions: [],
    choices: [
      'local-only: do not touch GitHub this run',
      'pull-merge: pull GitHub-only/newer skills into local roots first',
      'merge-and-push-branch: merge newest both ways and push a new branch',
      'direct-push: push to the checked-out GitHub branch only when explicitly requested',
      'manual-conflict-review: keep conflicting newest versions preserved for inspection',
    ],
  };

  if (!opts.githubCheck) {
    return {
      ...result,
      mandatory: false,
      enabled: false,
      skipped: true,
      status: 'disabled',
      message: 'GitHub compare was disabled with --no-github-check.',
    };
  }
  if (!sourceRoot || !fs.existsSync(sourceRoot)) {
    return {
      ...result,
      status: 'blocked',
      requiresUserDecision: true,
      recommendedActions: ['Fix the missing GitHub source root, or explicitly choose local-only.'],
      message: `GitHub compare needs an existing --github-source root. Missing: ${sourceRoot || opts.githubSource}`,
    };
  }
  if (!fs.existsSync(opts.githubWorktree)) {
    return {
      ...result,
      status: 'missing-worktree',
      requiresUserDecision: true,
      recommendedActions: [
        `Clone ${opts.githubRepo} to ${opts.githubWorktree} before GitHub compare/write.`,
        'Choose local-only if this run must not touch GitHub.',
      ],
      message: 'GitHub compare cannot run because the local GitHub worktree is missing.',
    };
  }

  const probe = tryGit(opts.githubWorktree, ['rev-parse', '--is-inside-work-tree']);
  if (!probe.ok || probe.stdout.trim() !== 'true') {
    return {
      ...result,
      status: 'invalid-worktree',
      requiresUserDecision: true,
      recommendedActions: [
        'Move or fix the existing GitHub worktree path before GitHub sync.',
        'Choose local-only if this run must not touch GitHub.',
      ],
      message: `GitHub compare path exists but is not a Git worktree: ${opts.githubWorktree}`,
    };
  }

  const remote = tryGit(opts.githubWorktree, ['remote', 'get-url', 'origin']);
  const branch = tryGit(opts.githubWorktree, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const fetch = tryGit(opts.githubWorktree, ['fetch', '--prune']);
  const status = tryGit(opts.githubWorktree, ['status', '--porcelain']);
  const statusBranch = tryGit(opts.githubWorktree, ['status', '--short', '--branch']);
  const aheadBehind = gitAheadBehind(opts.githubWorktree);
  const dirty = status.ok && Boolean(status.stdout.trim());

  const localRoots = Object.entries(opts.roots).map(([name, root]) => ({ name, root }));
  const localInventories = Object.fromEntries(localRoots.map(r => [r.name, discoverSkills(r.root, opts)]));
  const localMaps = Object.fromEntries(localRoots.map(r => [r.name, buildCanonicalMap(localInventories[r.name])]));
  const githubInventory = discoverGithubSkills(opts.githubWorktree, opts);
  const githubMap = buildCanonicalMap(githubInventory);

  const localPresentById = new Map();
  for (const root of localRoots) {
    for (const [id, entry] of localMaps[root.name].entries()) {
      if (!localPresentById.has(id)) localPresentById.set(id, []);
      localPresentById.get(id).push({ root: root.name, rootKind: 'local', ...entry });
    }
  }

  const localUnionMap = new Map();
  const localAmbiguous = [];
  for (const [id, entries] of localPresentById.entries()) {
    const selected = selectLatest(entries, opts);
    localUnionMap.set(id, selected.latest);
    if (selected.ambiguous.length) {
      const summary = ambiguitySummary(selected.latest, selected.ambiguous, opts);
      localAmbiguous.push({ id, latest: skillSummary(selected.latest), candidates: summary.candidates, reason: summary.reason });
    }
  }

  const localIds = new Set(localUnionMap.keys());
  const githubIds = new Set(githubMap.keys());
  const allIds = new Set([...localIds, ...githubIds]);
  const onlyLocal = [];
  const onlyGithub = [];
  const differing = [];
  const ambiguous = [...localAmbiguous];

  for (const id of [...allIds].sort()) {
    const localEntry = localUnionMap.get(id);
    const githubEntry = githubMap.get(id) ? { root: 'github', rootKind: 'github', ...githubMap.get(id) } : null;
    if (localEntry && !githubEntry) {
      onlyLocal.push(skillSummary(localEntry));
      continue;
    }
    if (!localEntry && githubEntry) {
      onlyGithub.push(skillSummary(githubEntry));
      continue;
    }
    if (!localEntry || !githubEntry || localEntry.hash === githubEntry.hash) continue;

    const present = [...(localPresentById.get(id) || []), githubEntry];
    const selected = selectLatest(present, opts);
    const item = {
      id,
      localLatest: skillSummary(localEntry),
      github: skillSummary(githubEntry),
      winner: selected.ambiguous.length ? 'ambiguous' : selected.latest.root,
      winnerEntry: selected.ambiguous.length ? null : skillSummary(selected.latest),
      reason: 'same skill exists locally and in GitHub with different folder content',
    };
    differing.push(item);
    if (selected.ambiguous.length) {
      const summary = ambiguitySummary(selected.latest, selected.ambiguous, opts);
      ambiguous.push({ id, latest: skillSummary(selected.latest), candidates: summary.candidates, reason: summary.reason });
    }
  }

  const diffCount = onlyLocal.length + onlyGithub.length + differing.length;
  const upstreamAhead = Number(aheadBehind.ahead || 0);
  const upstreamBehind = Number(aheadBehind.behind || 0);
  const requiresUserDecision = Boolean(
    dirty ||
    !fetch.ok ||
    localAmbiguous.length ||
    ambiguous.length ||
    diffCount ||
    upstreamAhead ||
    upstreamBehind
  );
  const recommendedActions = [];
  if (dirty) recommendedActions.push('GitHub worktree has uncommitted changes; commit/stash/clean it before any GitHub merge or push.');
  if (!fetch.ok) recommendedActions.push('GitHub fetch failed; fix auth/network or explicitly choose local-only/cached-state behavior.');
  if (upstreamBehind) recommendedActions.push('Remote has newer commits; pull fast-forward before publish, then re-run compare.');
  if (upstreamAhead) recommendedActions.push('Local GitHub worktree has commits not on remote; ask whether to push branch, direct push, or inspect manually.');
  if (onlyGithub.length) recommendedActions.push('GitHub contains skills missing locally; ask whether to pull/merge them into Codex, Claude, Antigravity, and VSCode.');
  if (onlyLocal.length) recommendedActions.push('Local roots contain skills missing in GitHub; ask whether to publish them to a new GitHub branch.');
  if (differing.length) recommendedActions.push('Same-name skill content differs between local roots and GitHub; ask whether newest-wins merge is acceptable.');
  if (ambiguous.length) recommendedActions.push('Ambiguous newest conflicts exist; preserve both versions and ask for manual review.');
  if (!recommendedActions.length) recommendedActions.push('No GitHub differences detected; no GitHub action is needed unless Yousuf asks to publish anyway.');

  return {
    ...result,
    status: fetch.ok ? 'checked' : 'checked-with-fetch-error',
    remote: remote.ok ? remote.stdout.trim() : null,
    remoteError: remote.ok ? null : remote.error,
    branch: branch.ok ? branch.stdout.trim() : null,
    fetch: fetch.ok ? { ok: true } : { ok: false, error: fetch.error },
    dirty,
    statusBranch: statusBranch.ok ? statusBranch.stdout : null,
    ahead: aheadBehind.ahead,
    behind: aheadBehind.behind,
    upstream: aheadBehind.upstream,
    upstreamError: aheadBehind.error || null,
    localUnionSkillCount: localUnionMap.size,
    githubSkillCount: githubMap.size,
    onlyLocalCount: onlyLocal.length,
    onlyGithubCount: onlyGithub.length,
    differingCount: differing.length,
    ambiguousCount: ambiguous.length,
    onlyLocalSkills: onlyLocal,
    onlyGithubSkills: onlyGithub,
    differingSkills: differing,
    ambiguousSkills: ambiguous,
    requiresUserDecision,
    recommendedActions,
    prompt: requiresUserDecision
      ? 'GitHub compare is mandatory. Ask Yousuf to choose local-only, pull-merge, merge-and-push-branch, direct-push, or manual-conflict-review before any GitHub write.'
      : 'GitHub compare is clean. No GitHub write is needed unless Yousuf explicitly asks.',
  };
}

function printGithubDecision(githubSync) {
  if (!githubSync) return;
  const decision = githubSync.preflight || githubSync;
  if (decision.skipped || decision.enabled === false) {
    console.log(`GitHub compare: ${decision.status || 'skipped'}${decision.message ? ` - ${decision.message}` : ''}`);
    return;
  }
  console.log(`GitHub compare: ${decision.status} (${decision.repo})`);
  if (decision.worktree) console.log(`  worktree: ${decision.worktree}`);
  if (decision.branch || decision.upstream) {
    const aheadBehind = Number.isFinite(decision.ahead) && Number.isFinite(decision.behind)
      ? `, ahead ${decision.ahead}, behind ${decision.behind}`
      : '';
    console.log(`  branch: ${decision.branch || 'unknown'}${decision.upstream ? ` -> ${decision.upstream}` : ''}${aheadBehind}`);
  }
  if (decision.dirty) console.log('  dirty: yes');
  if (decision.fetch && decision.fetch.ok === false) console.log(`  fetch error: ${decision.fetch.error}`);
  if (Number.isFinite(decision.githubSkillCount)) {
    console.log(`  local union: ${decision.localUnionSkillCount}, github: ${decision.githubSkillCount}`);
    console.log(`  only local: ${decision.onlyLocalCount}, only github: ${decision.onlyGithubCount}, differing: ${decision.differingCount}, ambiguous: ${decision.ambiguousCount}`);
  }
  console.log(`  decision required: ${decision.requiresUserDecision ? 'yes' : 'no'}`);
  for (const action of (decision.recommendedActions || []).slice(0, 8)) console.log(`  - ${action}`);
  if (decision.requiresUserDecision && decision.choices?.length) {
    console.log(`  choices: ${decision.choices.join(' | ')}`);
  }
  if (decision.prompt) console.log(`  prompt: ${decision.prompt}`);
}

function githubWriteDecisionError(opts, decision) {
  if (!opts.pushGithub) return null;
  if (!opts.githubDecision) {
    return `--push-github requires --github-decision because GitHub compare is mandatory. Choose one of: ${[...GITHUB_DECISIONS].join(', ')}`;
  }
  if (opts.githubDecision === 'local-only') return '--github-decision local-only refuses GitHub push by design.';
  if (opts.githubDecision === 'pull-merge') return '--github-decision pull-merge is for pulling/merging GitHub into local roots, not pushing. Rerun without --push-github or choose merge-and-push-branch.';
  if (opts.githubDecision === 'manual-conflict-review') return '--github-decision manual-conflict-review refuses GitHub push until conflicts are inspected.';
  if (opts.githubDecision === 'direct-push' && !opts.githubDirectPush) return '--github-decision direct-push requires --github-direct-push.';
  if (opts.githubDecision === 'merge-and-push-branch' && opts.githubDirectPush) return 'merge-and-push-branch cannot be combined with --github-direct-push.';
  if (decision?.dirty) return 'GitHub worktree has uncommitted changes; refusing to push until it is clean.';
  if (decision?.fetch && decision.fetch.ok === false) return `GitHub fetch failed; refusing to push. ${decision.fetch.error}`;
  if (decision?.ambiguousCount > 0) return 'Ambiguous GitHub/local skill conflicts exist; choose manual-conflict-review first.';
  if (Number(decision?.behind || 0) > 0) return 'GitHub worktree is behind upstream; pull fast-forward and rerun compare before pushing.';
  return null;
}

function syncGithubFromSource(opts) {
  const sourceRoot = opts.roots[opts.githubSource];
  if (!sourceRoot) throw new Error(`Unknown --github-source root: ${opts.githubSource}`);
  if (!fs.existsSync(sourceRoot)) throw new Error(`GitHub source root missing: ${sourceRoot}`);

  const worktree = opts.githubWorktree;
  const parent = path.dirname(worktree);
  ensureDir(parent);

  let cloned = false;
  if (!fs.existsSync(path.join(worktree, '.git'))) {
    if (fs.existsSync(worktree) && fs.readdirSync(worktree).length > 0) {
      throw new Error(`GitHub worktree exists but is not a git clone and is not empty: ${worktree}`);
    }
    run('gh', ['repo', 'clone', opts.githubRepo, worktree]);
    cloned = true;
  }

  let remote = '';
  try { remote = git(worktree, ['remote', 'get-url', 'origin']).stdout; } catch {}
  const beforeStatus = git(worktree, ['status', '--porcelain']).stdout;
  if (beforeStatus.trim()) {
    throw new Error(`GitHub worktree has pre-existing uncommitted changes; refusing to mix changes. Path: ${worktree}`);
  }

  // Pull first. Keep this fast-forward only so the script never creates messy Git conflict files.
  git(worktree, ['pull', '--ff-only']);

  // Treat GitHub as another skill root after pull. If the same skill differs, the newest
  // version wins. GitHub skill mtimes use last commit time, not checkout mtime, so a fresh
  // clone/pull does not accidentally make stale remote files look newest.
  const localRoots = Object.entries(opts.roots).map(([name, root]) => ({ name, root, kind: 'local' }));
  const allRoots = [...localRoots, { name: 'github', root: worktree, kind: 'github' }];
  const inventories = Object.fromEntries(allRoots.map(r => [
    r.name,
    r.kind === 'github' ? discoverGithubSkills(r.root, opts) : discoverSkills(r.root, opts)
  ]));
  const maps = Object.fromEntries(allRoots.map(r => [r.name, buildCanonicalMap(inventories[r.name])]));
  const allIds = new Set();
  for (const map of Object.values(maps)) for (const id of map.keys()) allIds.add(id);

  const planned = [];
  const blocked = [];
  const changedSkillIds = new Set();
  let copiedMissing = 0;
  let replacedOutdated = 0;
  let githubUpdated = 0;
  let localUpdated = 0;
  let preservedAmbiguous = 0;
  const conflictBundles = [];
  let backupRoot = null;

  const ensureBackupRoot = () => {
    if (!backupRoot) backupRoot = makeBackupRoot();
    return backupRoot;
  };

  const selections = new Map();
  for (const id of [...allIds].sort()) {
    const present = allRoots
      .filter(r => maps[r.name].has(id))
      .map(r => ({ root: r.name, rootPath: r.root, rootKind: r.kind, ...maps[r.name].get(id) }));
    if (!present.length) continue;
    const selected = selectLatest(present, opts);
    selections.set(id, { present, selected });
    const latest = selected.latest;
    if (selected.ambiguous.length) {
      const summary = ambiguitySummary(latest, selected.ambiguous, opts);
      const op = {
        id,
        source: latest.root,
        sourcePath: latest.path,
        sourceLatestMtime: latest.latestMtime,
        target: '*',
        action: 'blocked-ambiguous-latest',
        reason: summary.reason,
        candidates: summary.candidates,
      };
      if (opts.apply) {
        op.conflictBundlePath = preserveAmbiguousConflict(id, summary.candidates, ensureBackupRoot());
        conflictBundles.push(op.conflictBundlePath);
        preservedAmbiguous++;
      }
      blocked.push(op);
      planned.push(op);
      continue;
    }
  }

  if (blocked.length) {
    throw new Error(`GitHub merge blocked/failed for ${blocked.length} operation(s): ${blocked.slice(0, 3).map(b => `${b.id} ${b.source}->${b.target}: ${b.reason || b.error}${b.conflictBundlePath ? ` preserved at ${b.conflictBundlePath}` : ''}`).join('; ')}`);
  }

  for (const id of [...allIds].sort()) {
    const selection = selections.get(id);
    if (!selection || selection.selected.ambiguous.length) continue;
    const latest = selection.selected.latest;

    for (const target of allRoots) {
      const existing = maps[target.name].get(id);
      if (existing && existing.hash === latest.hash) continue;

      const isMissing = !existing;
      const dest = existing ? existing.path : path.join(target.root, latest.folderName);
      const op = {
        id,
        source: latest.root,
        sourcePath: latest.path,
        sourceLatestMtime: latest.latestMtime,
        sourceMtimeSource: latest.mtimeSource || 'filesystem',
        target: target.name,
        targetKind: target.kind,
        destPath: dest,
        reason: isMissing ? 'missing-skill' : 'content-diff-latest-wins',
      };

      if (!fs.existsSync(target.root)) {
        if (opts.createMissingRoots) ensureDir(target.root);
        else {
          op.action = 'blocked-missing-root';
          op.reason = 'Target root does not exist.';
          blocked.push(op);
          planned.push(op);
          continue;
        }
      }
      if (isMissing && fs.existsSync(dest)) {
        op.action = 'blocked-existing-path';
        op.reason = 'Destination exists but is not detected as this skill; refusing to overwrite.';
        blocked.push(op);
        planned.push(op);
        continue;
      }

      try {
        if (!isMissing) {
          op.backupPath = backupDir(dest, ensureBackupRoot(), `github-merge-${target.name}-${id}`);
          fs.rmSync(dest, { recursive: true, force: true });
        }
        ensureDir(path.dirname(dest));
        const counts = copyDirSafe(latest.path, dest);
        op.action = isMissing ? 'copied-missing' : 'replaced-outdated';
        op.files = counts.files;
        op.dirs = counts.dirs;
        op.skippedSymlinks = counts.skippedSymlinks;
        if (isMissing) copiedMissing++; else replacedOutdated++;
        if (target.kind === 'github') githubUpdated++; else localUpdated++;
        changedSkillIds.add(id);
      } catch (e) {
        op.action = 'failed';
        op.error = e.message;
        blocked.push(op);
      }
      planned.push(op);
    }
  }

  if (blocked.length) {
    throw new Error(`GitHub merge blocked/failed for ${blocked.length} operation(s): ${blocked.slice(0, 3).map(b => `${b.id} ${b.source}->${b.target}: ${b.reason || b.error}${b.conflictBundlePath ? ` preserved at ${b.conflictBundlePath}` : ''}`).join('; ')}`);
  }

  const publishSafety = scanPublishSafety(worktree);
  if (publishSafety.length) {
    throw new Error(`GitHub publish safety scan blocked ${publishSafety.length} file(s): ${publishSafety.slice(0, 5).map(item => `${item.path} (${item.reason})`).join('; ')}`);
  }

  const branchInfo = prepareGithubPublishBranch(worktree, opts);
  git(worktree, ['add', '-A']);
  const postMergeStatus = git(worktree, ['status', '--porcelain']).stdout;
  if (!postMergeStatus.trim()) {
    return {
      enabled: true,
      repo: opts.githubRepo,
      worktree,
      sourceRoot,
      cloned,
      remote,
      copiedSkills: maps.github.size,
      changed: false,
      committed: false,
      pushed: false,
      mergedFromGithubToLocal: localUpdated,
      mergedFromLocalToGithub: githubUpdated,
      copiedMissing,
      replacedOutdated,
      changedSkillIds: [...changedSkillIds].sort(),
      backupRoot,
      preservedAmbiguous,
      conflictBundles,
      branchMode: branchInfo.mode,
      branch: branchInfo.branch,
      baseBranch: branchInfo.baseBranch || null,
      message: 'GitHub repo and local roots already matched after pull/merge; nothing to commit.',
    };
  }

  const msg = `Sync agent skills union ${new Date().toISOString().slice(0, 10)}`;
  git(worktree, ['commit', '-m', msg]);

  try {
    if (opts.githubDirectPush) git(worktree, ['push']);
    else git(worktree, ['push', '-u', 'origin', branchInfo.branch]);
  } catch (pushError) {
    // A remote race can happen if another machine pushed after our pull. Keep the worktree safe
    // and ask for another run rather than force-pushing or creating conflict markers.
    throw new Error(`GitHub push failed after local merge; rerun the skill so it can pull the new remote first. ${pushError.message}`);
  }

  const sha = git(worktree, ['rev-parse', '--short', 'HEAD']).stdout;
  const finalStatus = git(worktree, ['status', '--porcelain']).stdout;
  return {
    enabled: true,
    repo: opts.githubRepo,
    worktree,
    sourceRoot,
    cloned,
    remote,
    copiedSkills: buildCanonicalMap(discoverGithubSkills(worktree, opts)).size,
    changed: true,
    committed: true,
    pushed: true,
    commit: sha,
    clean: !finalStatus.trim(),
    mergedFromGithubToLocal: localUpdated,
    mergedFromLocalToGithub: githubUpdated,
    copiedMissing,
    replacedOutdated,
    changedSkillIds: [...changedSkillIds].sort(),
    backupRoot,
    preservedAmbiguous,
    conflictBundles,
    branchMode: branchInfo.mode,
    branch: branchInfo.branch,
    baseBranch: branchInfo.baseBranch || null,
  };
}

function rootInfoFromInventory(rootName, inv, canonicalMap) {
  return {
    path: inv.root,
    exists: fs.existsSync(inv.root),
    skillCount: inv.skills.length,
    uniqueIdCount: canonicalMap.size,
    duplicates: inv.duplicates,
    errors: inv.errors,
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const roots = Object.entries(opts.roots).map(([name, root]) => ({ name, root }));
  const inventories = Object.fromEntries(roots.map(r => [r.name, discoverSkills(r.root, opts)]));

  const canonicalByRoot = {};
  const allIds = new Set();
  const byIdAllEntries = new Map();
  for (const { name } of roots) {
    canonicalByRoot[name] = new Map();
    const grouped = new Map();
    for (const skill of inventories[name].skills) {
      if (!grouped.has(skill.id)) grouped.set(skill.id, []);
      grouped.get(skill.id).push(skill);
    }
    for (const [id, entries] of grouped.entries()) {
      const canonical = pickCanonical(entries);
      canonicalByRoot[name].set(id, canonical);
      allIds.add(id);
      if (!byIdAllEntries.has(id)) byIdAllEntries.set(id, []);
      byIdAllEntries.get(id).push({ root: name, ...canonical });
    }
  }

  const presentInAll = [...allIds].filter(id => roots.every(r => canonicalByRoot[r.name].has(id))).sort();
  const identicalCommon = presentInAll.filter(id => new Set(roots.map(r => canonicalByRoot[r.name].get(id).hash)).size === 1).sort();
  const differingCommon = presentInAll.filter(id => new Set(roots.map(r => canonicalByRoot[r.name].get(id).hash)).size > 1).sort();
  const contentDifferent = [...allIds].filter(id => {
    const hashes = new Set(roots.filter(r => canonicalByRoot[r.name].has(id)).map(r => canonicalByRoot[r.name].get(id).hash));
    return hashes.size > 1;
  }).sort();
  const uniqueByRoot = Object.fromEntries(roots.map(r => [r.name, [...canonicalByRoot[r.name].keys()].filter(id => roots.filter(rr => canonicalByRoot[rr.name].has(id)).length === 1).sort()]));

  const operations = [];
  const conflicts = [];
  for (const id of [...allIds].sort()) {
    const presentRoots = roots.filter(r => canonicalByRoot[r.name].has(id));
    const presentEntries = presentRoots.map(r => ({ root: r.name, ...canonicalByRoot[r.name].get(id) }));
    const selected = opts.contentSync ? selectLatest(presentEntries, opts) : { latest: pickCanonical(presentEntries), ambiguous: [] };
    const latest = selected.latest;
    if (opts.contentSync && selected.ambiguous.length) {
      const summary = ambiguitySummary(latest, selected.ambiguous, opts);
      operations.push({
        id,
        source: latest.root,
        sourcePath: latest.path,
        sourceLatestMtime: latest.latestMtime,
        sourceHash: latest.hash,
        target: '*',
        targetRoot: '*',
        targetRootExists: true,
        targetExistingPath: null,
        targetExistingHash: null,
        destPath: null,
        reason: summary.reason,
        action: 'blocked-ambiguous-latest',
        candidates: summary.candidates,
      });
      continue;
    }
    const latestHash = latest.hash;
    for (const target of roots) {
      const existing = canonicalByRoot[target.name].get(id);
      if (existing && existing.hash === latestHash) continue;

      const targetRootExists = fs.existsSync(target.root);
      const isMissing = !existing;
      const dest = existing ? existing.path : path.join(target.root, latest.folderName);
      const dryAction = isMissing ? 'would-copy-missing' : 'would-replace-outdated';
      const pendingAction = isMissing ? 'pending-copy-missing' : 'pending-replace-outdated';
      const op = {
        id,
        source: latest.root,
        sourcePath: latest.path,
        sourceLatestMtime: latest.latestMtime,
        sourceHash: latest.hash,
        target: target.name,
        targetRoot: target.root,
        targetRootExists,
        targetExistingPath: existing?.path || null,
        targetExistingHash: existing?.hash || null,
        destPath: dest,
        reason: isMissing ? 'missing-skill' : 'content-diff-latest-wins',
        action: opts.apply ? pendingAction : dryAction,
      };

      if (!isMissing && !opts.contentSync) continue;
      if (!targetRootExists && !(opts.apply && opts.createMissingRoots)) {
        op.action = 'blocked-missing-root';
        op.reason = 'Target root does not exist; rerun with --create-missing-roots or pass the correct --<name>-root path.';
      } else if (isMissing && fs.existsSync(dest)) {
        op.action = 'blocked-existing-path';
        op.reason = 'Destination folder already exists but the skill was not detected there; refusing to overwrite.';
        conflicts.push(op);
      }
      operations.push(op);
    }
  }

  let backupRoot = null;
  const applied = {
    copiedMissing: 0,
    replacedOutdated: 0,
    preservedAmbiguous: 0,
    conflictBundles: [],
    createdRoots: [],
    failed: [],
    backupRoot: null,
  };
  let githubSync = null;
  if (opts.apply) {
    const writableOps = operations.filter(op => op.action === 'pending-copy-missing' || op.action === 'pending-replace-outdated');
    const ambiguousOps = operations.filter(op => op.action === 'blocked-ambiguous-latest');
    if (writableOps.length || ambiguousOps.length) {
      backupRoot = makeBackupRoot();
      applied.backupRoot = backupRoot;
    }
    for (const op of ambiguousOps) {
      try {
        op.conflictBundlePath = preserveAmbiguousConflict(op.id, op.candidates, backupRoot);
        applied.conflictBundles.push(op.conflictBundlePath);
        applied.preservedAmbiguous++;
      } catch (e) {
        op.action = 'failed';
        op.error = `Failed to preserve ambiguous candidates: ${e.message}`;
        applied.failed.push(op);
      }
    }
    for (const op of operations) {
      if (op.action !== 'pending-copy-missing' && op.action !== 'pending-replace-outdated') continue;
      try {
        if (!fs.existsSync(op.targetRoot)) {
          ensureDir(op.targetRoot);
          applied.createdRoots.push(op.targetRoot);
        }
        if (op.action === 'pending-replace-outdated') {
          op.backupPath = backupDir(op.destPath, backupRoot, `${op.target}-${op.id}`);
          fs.rmSync(op.destPath, { recursive: true, force: true });
          const counts = copyDirSafe(op.sourcePath, op.destPath);
          op.action = 'replaced-outdated';
          op.files = counts.files;
          op.dirs = counts.dirs;
          op.skippedSymlinks = counts.skippedSymlinks;
          applied.replacedOutdated++;
        } else {
          const counts = copyDirSafe(op.sourcePath, op.destPath);
          op.action = 'copied-missing';
          op.files = counts.files;
          op.dirs = counts.dirs;
          op.skippedSymlinks = counts.skippedSymlinks;
          applied.copiedMissing++;
        }
      } catch (e) {
        op.action = 'failed';
        op.error = e.message;
        applied.failed.push(op);
      }
    }
  }

  githubSync = inspectGithubDecision(opts);
  if (opts.apply && opts.pushGithub && applied.failed.length === 0) {
    const preflight = githubSync;
    const decisionError = githubWriteDecisionError(opts, preflight);
    if (decisionError) {
      githubSync = {
        enabled: true,
        blocked: true,
        failed: true,
        error: decisionError,
        repo: opts.githubRepo,
        worktree: opts.githubWorktree,
        source: opts.githubSource,
        decision: opts.githubDecision,
        preflight,
      };
    } else {
      try { githubSync = { ...syncGithubFromSource(opts), decision: opts.githubDecision, preflight }; }
      catch (e) { githubSync = { enabled: true, failed: true, error: e.message, repo: opts.githubRepo, worktree: opts.githubWorktree, source: opts.githubSource, decision: opts.githubDecision, preflight }; }
    }
  }

  const result = {
    apply: opts.apply,
    contentSync: opts.contentSync,
    allowAmbiguousLatest: opts.allowAmbiguousLatest,
    mtimeToleranceMs: opts.mtimeToleranceMs,
    githubCheck: opts.githubCheck,
    githubDecision: opts.githubDecision,
    githubDirectPush: opts.githubDirectPush,
    githubBranch: opts.githubBranch,
    githubBranchPrefix: opts.githubBranchPrefix,
    startedAt,
    roots: Object.fromEntries(roots.map(r => [r.name, rootInfoFromInventory(r.name, inventories[r.name], canonicalByRoot[r.name])])),
    unionSkillCount: allIds.size,
    presentInAllCount: presentInAll.length,
    identicalCommonCount: identicalCommon.length,
    identicalCommonSkills: identicalCommon,
    differingCommonCount: differingCommon.length,
    differingCommonSkills: differingCommon,
    contentDifferentCount: contentDifferent.length,
    contentDifferentSkills: contentDifferent,
    uniqueByRoot,
    plannedOperationCount: operations.length,
    operations,
    conflicts,
    applied,
    githubSync,
    note: opts.apply ? 'apply complete; missing skills copied and outdated differing skills replaced from latest version with backups' : 'dry-run only; pass --apply to copy missing skills and replace outdated differing skills',
  };
  if (githubSync?.failed) process.exitCode = 1;

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Agent Skills Union Sync (${opts.apply ? 'APPLY' : 'DRY RUN'})`);
  console.log(`Rule: identical common means same skill id AND same folder content; if content differs, latest clear mtime wins, but ambiguous near-ties are blocked.`);
  for (const [name, info] of Object.entries(result.roots)) {
    console.log(`- ${name}: ${info.exists ? info.uniqueIdCount : 0} skills (${info.exists ? info.path : `missing: ${info.path}`})`);
    if (info.duplicates?.length) console.log(`  duplicates: ${info.duplicates.map(d => `${d.id}(${d.entries.length})`).join(', ')}`);
    if (info.errors?.length) console.log(`  read errors: ${info.errors.length}`);
  }
  console.log(`Identical common in all roots: ${result.identicalCommonCount}`);
  console.log(`Present in all but content differs: ${result.differingCommonCount}${result.differingCommonCount ? ` (${result.differingCommonSkills.join(', ')})` : ''}`);
  console.log(`Union total: ${result.unionSkillCount}`);
  for (const [name, ids] of Object.entries(uniqueByRoot)) {
    console.log(`Unique only in ${name}: ${ids.length}${ids.length ? ` (${ids.join(', ')})` : ''}`);
  }
  printGithubDecision(githubSync);
  if (opts.apply) {
    console.log(`Copied missing: ${applied.copiedMissing}`);
    console.log(`Replaced outdated: ${applied.replacedOutdated}`);
    console.log(`Ambiguous latest blocked: ${operations.filter(o => o.action === 'blocked-ambiguous-latest').length}`);
    console.log(`Preserved ambiguous conflicts: ${applied.preservedAmbiguous}`);
    if (applied.backupRoot) console.log(`Backup root: ${applied.backupRoot}`);
    for (const bundle of applied.conflictBundles.slice(0, 10)) console.log(`  conflict bundle: ${bundle}`);
    if (applied.conflictBundles.length > 10) console.log(`  ... ${applied.conflictBundles.length - 10} more conflict bundles`);
    if (opts.pushGithub) {
      if (githubSync.failed) {
        console.log(`GitHub sync failed: ${githubSync.error}`);
      } else if (githubSync.enabled) {
        if (githubSync.pushed) console.log(`GitHub pushed: ${githubSync.repo} @ ${githubSync.commit} (${githubSync.branchMode}: ${githubSync.branch})`);
        else console.log(`GitHub sync: ${githubSync.message}`);
        console.log(`GitHub merge: remote->local ${githubSync.mergedFromGithubToLocal || 0}, local->remote ${githubSync.mergedFromLocalToGithub || 0}`);
      }
    }
  } else {
    console.log(`Would copy missing: ${operations.filter(o => o.action === 'would-copy-missing').length}`);
    console.log(`Would replace outdated: ${operations.filter(o => o.action === 'would-replace-outdated').length}`);
    console.log(`Ambiguous latest blocked: ${operations.filter(o => o.action === 'blocked-ambiguous-latest').length}`);
    if (opts.pushGithub) console.log(`Would push GitHub repo after apply: ${opts.githubRepo} from ${opts.githubSource} root`);
  }
  const blocked = operations.filter(o => o.action.startsWith('blocked') || o.action === 'failed');
  if (blocked.length) {
    console.log(`Blocked/failed: ${blocked.length}`);
    for (const b of blocked.slice(0, 20)) console.log(`  - ${b.id}: ${b.source} -> ${b.target}: ${b.reason || b.error}${b.conflictBundlePath ? ` (preserved at ${b.conflictBundlePath})` : ''}`);
    if (blocked.length > 20) console.log(`  ... ${blocked.length - 20} more`);
  }
  console.log(result.note);
}

try { main(); }
catch (e) { console.error(`ERROR: ${e.message}`); process.exit(1); }
