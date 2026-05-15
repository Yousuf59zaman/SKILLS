#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const HOME = os.homedir();
const WORKSPACE = path.join(HOME, '.openclaw', 'workspace');
const DEFAULT_ROOTS = {
  codex: path.join(HOME, '.codex', 'skills'),
  claude: path.join(HOME, '.claude', 'skills'),
  antigravity: path.join(HOME, '.gemini', 'antigravity', 'skills'),
};
const IGNORE_DISCOVERY_DIRS = new Set([
  '.git', '.github', '.system', '.tmp', 'tmp', 'node_modules', 'vendor_imports',
  'backups', 'dist', '__pycache__', '.venv', 'venv'
]);
const NEVER_COPY_DIRS = new Set(['.git', 'node_modules', '__pycache__']);

function usage(exitCode = 0) {
  console.log(`Usage: node scripts/sync-agent-skills.mjs [options]\n\nOptions:\n  --apply                       Copy missing skills and replace outdated differing skills. Default is dry-run.\n  --create-missing-roots        Create missing root directories during --apply.\n  --json                        Print full JSON result.\n  --max-depth <n>               Recursive discovery depth under each root (default: 4).\n  --codex-root <path>           Override Codex skills root.\n  --claude-root <path>          Override Claude skills root.\n  --antigravity-root <path>     Override Antigravity skills root.\n  --root <name=path>            Add/override a root. Example: --root antigravity=C:\\path\\skills\n  --include-dot                 Include dot/system folders during discovery (off by default).\n  --no-content-sync             Only copy missing skills; do not replace differing existing skills.\n  --push-github                 After successful local apply, copy final source root skills to GitHub and push.\n  --github-repo <owner/repo>    GitHub repo to push to (default: Yousuf59zaman/SKILLS).\n  --github-worktree <path>      Local clone/worktree path (default: <codex-root>/.github/Yousuf59zaman-SKILLS).\n  --github-source <root-name>   Root to publish after sync (default: codex).\n  --help                        Show help.\n\nDefault roots:\n  codex       ${DEFAULT_ROOTS.codex}\n  claude      ${DEFAULT_ROOTS.claude}\n  antigravity ${DEFAULT_ROOTS.antigravity}\n`);
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
    pushGithub: false,
    githubRepo: 'Yousuf59zaman/SKILLS',
    githubWorktree: null,
    githubSource: 'codex',
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
    else if (a === '--push-github') opts.pushGithub = true;
    else if (a === '--github-repo') opts.githubRepo = next();
    else if (a === '--github-worktree') opts.githubWorktree = next();
    else if (a === '--github-source') opts.githubSource = next();
    else if (a === '--max-depth') opts.maxDepth = Number(next());
    else if (a === '--codex-root') opts.roots.codex = next();
    else if (a === '--claude-root') opts.roots.claude = next();
    else if (a === '--antigravity-root') opts.roots.antigravity = next();
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

  function walk(current, rel = '') {
    let st;
    try { st = fs.lstatSync(current); } catch { return; }
    latestMtimeMs = Math.max(latestMtimeMs, st.mtimeMs || 0);
    if (st.isSymbolicLink()) { skippedSymlinks++; return; }
    if (st.isDirectory()) {
      const base = path.basename(current);
      if (rel && NEVER_COPY_DIRS.has(base)) return;
      let entries = [];
      try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { return; }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const ent of entries) walk(path.join(current, ent.name), path.join(rel, ent.name));
    } else if (st.isFile()) {
      const data = fs.readFileSync(current);
      bytes += data.length;
      files.push({ rel: rel.replace(/\\/g, '/'), data });
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
  let backupRoot = null;

  const ensureBackupRoot = () => {
    if (!backupRoot) backupRoot = makeBackupRoot();
    return backupRoot;
  };

  for (const id of [...allIds].sort()) {
    const present = allRoots
      .filter(r => maps[r.name].has(id))
      .map(r => ({ root: r.name, rootPath: r.root, rootKind: r.kind, ...maps[r.name].get(id) }));
    if (!present.length) continue;
    const latest = pickLatest(present);

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
    throw new Error(`GitHub merge blocked/failed for ${blocked.length} operation(s): ${blocked.slice(0, 3).map(b => `${b.id} ${b.source}->${b.target}: ${b.reason || b.error}`).join('; ')}`);
  }

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
      message: 'GitHub repo and local roots already matched after pull/merge; nothing to commit.',
    };
  }

  const msg = `Sync agent skills union ${new Date().toISOString().slice(0, 10)}`;
  git(worktree, ['commit', '-m', msg]);

  try {
    git(worktree, ['push']);
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
    const latest = opts.contentSync ? pickLatest(presentEntries) : pickCanonical(presentEntries);
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
  const applied = { copiedMissing: 0, replacedOutdated: 0, createdRoots: [], failed: [], backupRoot: null };
  let githubSync = { enabled: opts.pushGithub, skipped: !opts.pushGithub };
  if (opts.apply) {
    const writableOps = operations.filter(op => op.action === 'pending-copy-missing' || op.action === 'pending-replace-outdated');
    if (writableOps.length) {
      backupRoot = makeBackupRoot();
      applied.backupRoot = backupRoot;
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

  if (opts.apply && opts.pushGithub && applied.failed.length === 0) {
    try { githubSync = syncGithubFromSource(opts); }
    catch (e) { githubSync = { enabled: true, failed: true, error: e.message, repo: opts.githubRepo, worktree: opts.githubWorktree, source: opts.githubSource }; }
  }

  const result = {
    apply: opts.apply,
    contentSync: opts.contentSync,
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

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Agent Skills Union Sync (${opts.apply ? 'APPLY' : 'DRY RUN'})`);
  console.log(`Rule: identical common means same skill id AND same folder content; if content differs, latest mtime wins.`);
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
  if (opts.apply) {
    console.log(`Copied missing: ${applied.copiedMissing}`);
    console.log(`Replaced outdated: ${applied.replacedOutdated}`);
    if (applied.backupRoot) console.log(`Backup root: ${applied.backupRoot}`);
    if (opts.pushGithub) {
      if (githubSync.failed) console.log(`GitHub sync failed: ${githubSync.error}`);
      else if (githubSync.pushed) console.log(`GitHub pushed: ${githubSync.repo} @ ${githubSync.commit}`);
      else if (githubSync.enabled) console.log(`GitHub sync: ${githubSync.message}`);
    }
  } else {
    console.log(`Would copy missing: ${operations.filter(o => o.action === 'would-copy-missing').length}`);
    console.log(`Would replace outdated: ${operations.filter(o => o.action === 'would-replace-outdated').length}`);
    if (opts.pushGithub) console.log(`Would push GitHub repo after apply: ${opts.githubRepo} from ${opts.githubSource} root`);
  }
  const blocked = operations.filter(o => o.action.startsWith('blocked') || o.action === 'failed');
  if (blocked.length) {
    console.log(`Blocked/failed: ${blocked.length}`);
    for (const b of blocked.slice(0, 20)) console.log(`  - ${b.id}: ${b.source} -> ${b.target}: ${b.reason || b.error}`);
    if (blocked.length > 20) console.log(`  ... ${blocked.length - 20} more`);
  }
  console.log(result.note);
}

try { main(); }
catch (e) { console.error(`ERROR: ${e.message}`); process.exit(1); }
