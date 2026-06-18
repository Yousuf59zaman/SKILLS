#!/usr/bin/env node
/**
 * Sync OpenClaw auth state + OpenClaw openai-codex auth profiles into
 * codex-multi-auth storage while deliberately NOT copying real refresh tokens.
 *
 * What this script does:
 * 1. Reconciles OpenClaw auth order for each configured agent so every order
 *    entry exists in that agent's auth-profiles.json, stale/duplicate entries
 *    are dropped, and newly-added profiles are appended to the matching
 *    provider order.
 * 2. Copies OpenClaw openai-codex access tokens/expires/account metadata into
 *    codex-multi-auth's account file, replacing real refresh tokens with
 *    deterministic inert placeholders.
 *
 * OpenClaw stays the source of truth for real refresh tokens. codex-multi-auth
 * currently requires a non-empty `refreshToken` field, so this script writes a
 * deterministic inert placeholder instead of deleting the field.
 *
 * Default paths:
 *   OpenClaw root: %USERPROFILE%/.openclaw
 *   agents: main,openclaw
 *   source: %USERPROFILE%/.openclaw/agents/main/agent/auth-profiles.json
 *   target: %USERPROFILE%/.codex/multi-auth/openai-codex-accounts.json
 *
 * Usage:
 *   node sync-openclaw-to-codex-multiauth-access-only.mjs          # dry run
 *   node sync-openclaw-to-codex-multiauth-access-only.mjs --apply  # write files
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const home = process.env.USERPROFILE || process.env.HOME;
if (!home) throw new Error('Could not resolve home directory from USERPROFILE/HOME');

function readArg(name, fallback) {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const idx = args.indexOf(name);
  if (idx >= 0 && args[idx + 1] && !args[idx + 1].startsWith('--')) return args[idx + 1];
  return fallback;
}

const apply = args.includes('--apply');
const openclawRoot = path.resolve(readArg('--openclaw-root', path.join(home, '.openclaw')));
const agentNames = readArg('--agents', 'main,openclaw')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);
const sourcePath = path.resolve(readArg('--source', path.join(openclawRoot, 'agents', 'main', 'agent', 'auth-profiles.json')));
const targetPath = path.resolve(readArg('--target', path.join(home, '.codex', 'multi-auth', 'openai-codex-accounts.json')));
const backupBase = path.resolve(readArg('--backup-base', path.join(openclawRoot, 'workspace', 'backups')));

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJsonAtomic(file, value) {
  const tmp = `${file}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, file);
}

function safeFileStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function backupFile(file, backupRoot, relRoot = openclawRoot) {
  if (!fs.existsSync(file)) return null;
  fs.mkdirSync(backupRoot, { recursive: true });
  const absolute = path.resolve(file);
  const relative = path.relative(relRoot, absolute);
  const safeName = relative && !relative.startsWith('..')
    ? relative.replace(/[\\/:]+/g, '__')
    : path.basename(absolute);
  const dest = path.join(backupRoot, safeName);
  fs.copyFileSync(file, dest);
  return dest;
}

function normalizeEmail(email) {
  return typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : undefined;
}

function decodeJwtPayload(token) {
  if (typeof token !== 'string') return undefined;
  const parts = token.split('.');
  if (parts.length < 2) return undefined;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return undefined;
  }
}

function extractAccountId(accessToken) {
  const payload = decodeJwtPayload(accessToken);
  const auth = payload?.['https://api.openai.com/auth'];
  const candidates = [auth?.chatgpt_account_id, payload?.chatgpt_account_id, payload?.account_id, payload?.sub];
  return candidates.find((v) => typeof v === 'string' && v.trim())?.trim();
}

function inertRefreshPlaceholder(profile) {
  const email = normalizeEmail(profile.email) || 'unknown';
  const id = profile.accountId || extractAccountId(profile.access) || profile.profileId || email;
  const digest = crypto.createHash('sha256').update(`${email}|${id}`).digest('hex');
  // Must be non-empty because codex-multi-auth's schema requires refreshToken.
  // This is intentionally NOT a real OAuth refresh token.
  return `access_only_placeholder_${digest}`;
}

function providerFor(profileId, profile) {
  if (profile && typeof profile.provider === 'string' && profile.provider.trim()) return profile.provider.trim();
  const idx = profileId.indexOf(':');
  return idx >= 0 ? profileId.slice(0, idx) : undefined;
}

function syncAuthOrders(backupRoot) {
  const results = [];
  for (const agentName of agentNames) {
    const profilesPath = path.join(openclawRoot, 'agents', agentName, 'agent', 'auth-profiles.json');
    const statePath = path.join(openclawRoot, 'agents', agentName, 'agent', 'auth-state.json');
    if (!fs.existsSync(profilesPath) || !fs.existsSync(statePath)) {
      results.push({ agent: agentName, skipped: true, reason: 'missing auth-profiles.json or auth-state.json' });
      continue;
    }

    const profilesJson = readJson(profilesPath);
    const state = readJson(statePath);
    const profiles = profilesJson.profiles || {};
    const profileIds = Object.keys(profiles);
    const profileIdSet = new Set(profileIds);
    const byProvider = new Map();
    for (const id of profileIds) {
      const provider = providerFor(id, profiles[id]);
      if (!provider) continue;
      if (!byProvider.has(provider)) byProvider.set(provider, []);
      byProvider.get(provider).push(id);
    }

    const originalState = JSON.stringify({ order: state.order || {}, lastGood: state.lastGood || {} });
    if (!state.order || typeof state.order !== 'object') state.order = {};
    const added = {};
    const removed = {};

    for (const [provider, ids] of byProvider.entries()) {
      const currentRaw = Array.isArray(state.order[provider]) ? state.order[provider] : [];
      const next = [];
      const seen = new Set();
      const dropped = [];
      for (const id of currentRaw) {
        if (!profileIdSet.has(id) || providerFor(id, profiles[id]) !== provider || seen.has(id)) {
          dropped.push(id);
          continue;
        }
        seen.add(id);
        next.push(id);
      }
      const appended = [];
      for (const id of ids) {
        if (!seen.has(id)) {
          seen.add(id);
          next.push(id);
          appended.push(id);
        }
      }
      state.order[provider] = next;
      if (appended.length) added[provider] = appended;
      if (dropped.length) removed[provider] = dropped;
    }

    for (const provider of Object.keys(state.order)) {
      if (byProvider.has(provider)) continue;
      const stale = Array.isArray(state.order[provider]) ? state.order[provider] : [];
      if (stale.length) removed[provider] = [...(removed[provider] || []), ...stale];
      delete state.order[provider];
    }

    if (state.lastGood && typeof state.lastGood === 'object') {
      for (const [provider, id] of Object.entries(state.lastGood)) {
        if (typeof id === 'string' && (!profileIdSet.has(id) || providerFor(id, profiles[id]) !== provider)) {
          const replacement = Array.isArray(state.order[provider]) ? state.order[provider][0] : undefined;
          if (replacement) state.lastGood[provider] = replacement;
          else delete state.lastGood[provider];
        }
      }
    }

    const changed = JSON.stringify({ order: state.order || {}, lastGood: state.lastGood || {} }) !== originalState;
    let backupPath = null;
    if (apply && changed) {
      backupPath = backupFile(statePath, backupRoot, openclawRoot);
      writeJsonAtomic(statePath, state);
    }

    results.push({
      agent: agentName,
      changed,
      backupPath,
      profileCount: profileIds.length,
      added,
      removed,
      order: state.order,
    });
  }
  return results;
}

function accountKey(account) {
  const email = normalizeEmail(account?.email);
  if (email) return `email:${email}`;
  if (typeof account?.accountId === 'string' && account.accountId.trim()) return `id:${account.accountId.trim()}`;
  return undefined;
}

function profileKey(profile) {
  const email = normalizeEmail(profile.email);
  if (email) return `email:${email}`;
  const id = profile.accountId || extractAccountId(profile.access);
  if (id) return `id:${id}`;
  return undefined;
}

function oldIndexForProfile(existingAccounts, profile) {
  const key = profileKey(profile);
  if (!key) return Number.MAX_SAFE_INTEGER;
  const idx = existingAccounts.findIndex((account) => accountKey(account) === key);
  return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER;
}

function resolveNewIndexFromOldIndex(existingAccounts, nextAccounts, oldIndex) {
  const oldAccount = existingAccounts[oldIndex];
  const oldKey = accountKey(oldAccount);
  if (oldKey) {
    const idx = nextAccounts.findIndex((account) => accountKey(account) === oldKey);
    if (idx >= 0) return idx;
  }
  return Math.min(Math.max(0, oldIndex || 0), Math.max(0, nextAccounts.length - 1));
}

if (!fs.existsSync(sourcePath)) {
  throw new Error(`OpenClaw auth profiles file not found: ${sourcePath}`);
}

const backupRoot = path.join(backupBase, `openclaw-codex-sync-${safeFileStamp()}`);
const authOrderResults = syncAuthOrders(backupRoot);

const source = readJson(sourcePath);
const existing = fs.existsSync(targetPath) ? readJson(targetPath) : { version: 3, accounts: [], activeIndex: 0 };
const profilesObj = source.profiles || {};
const sourceProfiles = Object.entries(profilesObj)
  .filter(([, profile]) => profile && profile.provider === 'openai-codex' && profile.type === 'oauth')
  .filter(([, profile]) => typeof profile.access === 'string' && profile.access.trim())
  .map(([profileId, profile], sourceOrder) => ({ profileId, sourceOrder, ...profile }));

const existingAccounts = Array.isArray(existing.accounts) ? existing.accounts : [];
const existingByKey = new Map();
for (const account of existingAccounts) {
  const key = accountKey(account);
  if (key) existingByKey.set(key, account);
}

sourceProfiles.sort((a, b) => {
  const ai = oldIndexForProfile(existingAccounts, a);
  const bi = oldIndexForProfile(existingAccounts, b);
  if (ai !== bi) return ai - bi;
  return a.sourceOrder - b.sourceOrder;
});

const now = Date.now();
const nextAccounts = sourceProfiles.map((profile) => {
  const key = profileKey(profile);
  const prior = key ? existingByKey.get(key) : undefined;
  const accessToken = profile.access.trim();
  const email = normalizeEmail(profile.email) || normalizeEmail(prior?.email);
  const accountId = profile.accountId || extractAccountId(accessToken) || prior?.accountId;
  return {
    ...(prior ? { ...prior } : {}),
    accountId,
    accountIdSource: accountId ? (prior?.accountIdSource || (profile.accountId ? 'manual' : 'token')) : prior?.accountIdSource,
    accountLabel: prior?.accountLabel,
    email,
    refreshToken: inertRefreshPlaceholder(profile),
    accessToken,
    expiresAt: typeof profile.expires === 'number' ? profile.expires : prior?.expiresAt,
    enabled: prior?.enabled === false ? false : true,
    addedAt: typeof prior?.addedAt === 'number' ? prior.addedAt : now,
    lastUsed: typeof prior?.lastUsed === 'number' ? prior.lastUsed : 0,
    lastSwitchReason: prior?.lastSwitchReason,
    rateLimitResetTimes: prior?.rateLimitResetTimes,
    coolingDownUntil: prior?.coolingDownUntil,
    cooldownReason: prior?.cooldownReason,
  };
});

const next = {
  ...existing,
  version: 3,
  accounts: nextAccounts,
  activeIndex: nextAccounts.length ? resolveNewIndexFromOldIndex(existingAccounts, nextAccounts, existing.activeIndex || 0) : 0,
};

if (existing.activeIndexByFamily && typeof existing.activeIndexByFamily === 'object') {
  next.activeIndexByFamily = Object.fromEntries(
    Object.entries(existing.activeIndexByFamily).map(([family, idx]) => [
      family,
      resolveNewIndexFromOldIndex(existingAccounts, nextAccounts, typeof idx === 'number' ? idx : existing.activeIndex || 0),
    ]),
  );
}

function countRealRefresh(accounts) {
  return accounts.filter((account) => typeof account.refreshToken === 'string' && !account.refreshToken.startsWith('access_only_placeholder_')).length;
}

const codexMultiAuthSummary = {
  sourcePath,
  targetPath,
  sourceCodexProfiles: sourceProfiles.length,
  previousAccounts: existingAccounts.length,
  nextAccounts: next.accounts.length,
  inertPlaceholders: next.accounts.filter((account) => String(account.refreshToken || '').startsWith('access_only_placeholder_')).length,
  realRefreshLikeCount: countRealRefresh(next.accounts),
  accessTokens: next.accounts.filter((account) => typeof account.accessToken === 'string' && account.accessToken.trim()).length,
  activeIndex: next.activeIndex,
  activeEmail: next.accounts[next.activeIndex]?.email,
};

const summary = {
  apply,
  openclawRoot,
  agents: agentNames,
  backupRoot: apply ? backupRoot : null,
  authOrder: authOrderResults,
  codexMultiAuth: codexMultiAuthSummary,
};

if (!apply) {
  console.log(JSON.stringify({ ...summary, note: 'dry-run only; pass --apply to write' }, null, 2));
  process.exit(0);
}

const codexMultiAuthBackupPath = backupFile(targetPath, backupRoot, home);
writeJsonAtomic(targetPath, next);

const verify = readJson(targetPath);
const verifyAccounts = Array.isArray(verify.accounts) ? verify.accounts : [];
console.log(JSON.stringify({
  ...summary,
  codexMultiAuthBackupPath,
  verifiedCodexMultiAuth: {
    accounts: verifyAccounts.length,
    inertPlaceholders: verifyAccounts.filter((account) => String(account.refreshToken || '').startsWith('access_only_placeholder_')).length,
    realRefreshLikeCount: countRealRefresh(verifyAccounts),
    accessTokens: verifyAccounts.filter((account) => typeof account.accessToken === 'string' && account.accessToken.trim()).length,
    activeIndex: verify.activeIndex,
    activeEmail: verifyAccounts[verify.activeIndex]?.email,
  },
}, null, 2));
