#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);

function hasFlag(name) {
  return args.includes(name);
}

function readArg(name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function fail(message) {
  console.error(`refresh-guard: ${message}`);
  process.exit(1);
}

function info(message) {
  console.log(`refresh-guard: ${message}`);
}

function normalizeJs(text) {
  return text.replace(/\r\n/g, "\n");
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value ?? "")).digest("hex");
}

function pathExists(file) {
  try {
    fs.accessSync(file);
    return true;
  } catch {
    return false;
  }
}

function copyIfExists(source, suffix) {
  if (!pathExists(source)) return null;
  const backup = `${source}.${suffix}`;
  fs.copyFileSync(source, backup);
  return backup;
}

function backupBeforeEdit(file, backups) {
  if (!pathExists(file)) fail(`cannot patch missing file: ${file}`);
  const backup = copyIfExists(file, `refresh-guard-${timestamp()}.bak`);
  if (backup) backups.push(backup);
}

function replaceOnce(text, needle, replacement, label) {
  if (!text.includes(needle)) {
    fail(`patch marker not found: ${label}`);
  }
  return text.replace(needle, replacement);
}

function replaceRegexOnce(text, regex, replacement, label) {
  if (!regex.test(text)) {
    fail(`patch marker not found: ${label}`);
  }
  return text.replace(regex, replacement);
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
  return result;
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function locatePackageRoot() {
  const explicit = readArg("--package-root") || process.env.CODEX_MULTI_AUTH_PACKAGE_ROOT;
  if (explicit) return path.resolve(explicit);

  const npmRoot = run(npmCommand(), ["root", "-g"]);
  if (npmRoot.status === 0 && npmRoot.stdout.trim()) {
    const candidate = path.join(npmRoot.stdout.trim(), "codex-multi-auth");
    if (pathExists(path.join(candidate, "package.json"))) return candidate;
  }

  if (process.env.APPDATA) {
    const candidate = path.join(process.env.APPDATA, "npm", "node_modules", "codex-multi-auth");
    if (pathExists(path.join(candidate, "package.json"))) return candidate;
  }

  fail("could not locate global codex-multi-auth package; pass --package-root");
}

function resolveCodexHome() {
  return path.resolve(readArg("--codex-home") || process.env.CODEX_HOME || path.join(os.homedir(), ".codex"));
}

function readPackageJson(packageRoot) {
  const file = path.join(packageRoot, "package.json");
  if (!pathExists(file)) fail(`missing package.json: ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writePatched(file, text, changedFiles, backups) {
  const current = normalizeJs(fs.readFileSync(file, "utf8"));
  if (current === text) return false;
  backupBeforeEdit(file, backups);
  fs.writeFileSync(file, text, "utf8");
  changedFiles.push(file);
  return true;
}

function checkSyntax(files) {
  for (const file of files) {
    const result = run(process.execPath, ["--check", file]);
    if (result.status !== 0) {
      fail(`node --check failed for ${file}\n${result.stderr || result.stdout}`);
    }
  }
}

function backupCodexData(codexHome, backups) {
  const suffix = `refresh-guard-${timestamp()}.bak`;
  for (const file of [
    path.join(codexHome, "auth.json"),
    path.join(codexHome, "multi-auth", "openai-codex-accounts.json"),
  ]) {
    const backup = copyIfExists(file, suffix);
    if (backup) backups.push(backup);
  }
}

const COMMON_HELPERS = `
function resolveCurrentCodexAuthAccount(state) {
    if (!state || !Array.isArray(state.accounts) || state.accounts.length === 0) {
        return null;
    }
    const usable = state.accounts.filter((account) => typeof account?.accessToken === "string" &&
        account.accessToken.trim().length > 0 &&
        typeof account.refreshToken === "string" &&
        account.refreshToken.trim().length > 0);
    if (usable.length === 0) {
        return null;
    }
    const activeAccountId = state.activeAccountId?.trim();
    if (activeAccountId) {
        const byAccountId = usable.find((account) => account.accountId?.trim() === activeAccountId);
        if (byAccountId) {
            return byAccountId;
        }
    }
    const activeEmail = sanitizeEmail(state.activeEmail);
    if (activeEmail) {
        const byEmail = usable.find((account) => sanitizeEmail(account.email) === activeEmail);
        if (byEmail) {
            return byEmail;
        }
    }
    const active = usable.find((account) => account.isActive);
    return active ?? (usable.length === 1 ? usable[0] : null);
}
function applyCodexAuthSnapshotToStoredAccount(account, snapshot) {
    const accessToken = snapshot.accessToken?.trim();
    const refreshToken = snapshot.refreshToken?.trim();
    if (!accessToken || !refreshToken) {
        return false;
    }
    let changed = false;
    if (account.accessToken !== accessToken) {
        account.accessToken = accessToken;
        changed = true;
    }
    if (account.refreshToken !== refreshToken) {
        account.refreshToken = refreshToken;
        changed = true;
    }
    if (typeof snapshot.expiresAt === "number" &&
        Number.isFinite(snapshot.expiresAt) &&
        account.expiresAt !== snapshot.expiresAt) {
        account.expiresAt = snapshot.expiresAt;
        changed = true;
    }
    const email = sanitizeEmail(snapshot.email);
    if (email && email !== sanitizeEmail(account.email)) {
        account.email = email;
        changed = true;
    }
    const tokenAccountId = snapshot.accountId?.trim() ||
        extractAccountId(accessToken)?.trim() ||
        undefined;
    if (applyTokenAccountIdentity(account, tokenAccountId)) {
        changed = true;
    }
    return changed;
}
async function importCurrentCodexAuthIntoStorage(storage, options = {}) {
    if (!storage || !Array.isArray(storage.accounts) || storage.accounts.length === 0) {
        return { changed: false };
    }
    try {
        const state = await loadCodexCliState({ forceRefresh: true });
        const snapshot = resolveCurrentCodexAuthAccount(state);
        if (!snapshot) {
            return { changed: false };
        }
        const targetIndex = findMatchingAccountIndex(storage.accounts, {
            accountId: snapshot.accountId,
            email: snapshot.email,
            refreshToken: snapshot.refreshToken,
        }, {
            allowUniqueAccountIdFallbackWithoutEmail: true,
        });
        if (targetIndex === undefined) {
            return { changed: false };
        }
        const account = storage.accounts[targetIndex];
        if (!account) {
            return { changed: false };
        }
        const changed = applyCodexAuthSnapshotToStoredAccount(account, snapshot);
        if (changed && options.persist === true) {
            await saveAccountsWithRetry(storage, saveAccounts);
        }
        return { changed, targetIndex, snapshot };
    }
    catch {
        return { changed: false };
    }
}
`;

const MODULAR_PERSIST_HELPERS = `
function resolveCurrentCodexAuthAccount(state) {
    if (!state || !Array.isArray(state.accounts) || state.accounts.length === 0) {
        return null;
    }
    const usable = state.accounts.filter((account) => typeof account?.accessToken === "string" &&
        account.accessToken.trim().length > 0 &&
        typeof account.refreshToken === "string" &&
        account.refreshToken.trim().length > 0);
    if (usable.length === 0) {
        return null;
    }
    const activeAccountId = state.activeAccountId?.trim();
    if (activeAccountId) {
        const byAccountId = usable.find((account) => account.accountId?.trim() === activeAccountId);
        if (byAccountId) {
            return byAccountId;
        }
    }
    const activeEmail = sanitizeEmail(state.activeEmail);
    if (activeEmail) {
        const byEmail = usable.find((account) => sanitizeEmail(account.email) === activeEmail);
        if (byEmail) {
            return byEmail;
        }
    }
    const active = usable.find((account) => account.isActive);
    return active ?? (usable.length === 1 ? usable[0] : null);
}
function applyCodexAuthSnapshotToStoredAccount(account, snapshot) {
    const accessToken = snapshot.accessToken?.trim();
    const refreshToken = snapshot.refreshToken?.trim();
    if (!accessToken || !refreshToken) {
        return false;
    }
    let changed = false;
    if (account.accessToken !== accessToken) {
        account.accessToken = accessToken;
        changed = true;
    }
    if (account.refreshToken !== refreshToken) {
        account.refreshToken = refreshToken;
        changed = true;
    }
    if (typeof snapshot.expiresAt === "number" &&
        Number.isFinite(snapshot.expiresAt) &&
        account.expiresAt !== snapshot.expiresAt) {
        account.expiresAt = snapshot.expiresAt;
        changed = true;
    }
    const email = sanitizeEmail(snapshot.email);
    if (email && email !== sanitizeEmail(account.email)) {
        account.email = email;
        changed = true;
    }
    const tokenAccountId = snapshot.accountId?.trim() ||
        extractAccountId(accessToken)?.trim() ||
        undefined;
    if (applyTokenAccountIdentity(account, tokenAccountId)) {
        changed = true;
    }
    return changed;
}
async function importCurrentCodexAuthIntoStorage(storage) {
    if (!storage || !Array.isArray(storage.accounts) || storage.accounts.length === 0) {
        return { changed: false };
    }
    try {
        const state = await loadCodexCliState({ forceRefresh: true });
        const snapshot = resolveCurrentCodexAuthAccount(state);
        if (!snapshot) {
            return { changed: false };
        }
        const targetIndex = findMatchingAccountIndex(storage.accounts, {
            accountId: snapshot.accountId,
            email: snapshot.email,
            refreshToken: snapshot.refreshToken,
        }, {
            allowUniqueAccountIdFallbackWithoutEmail: true,
        });
        if (targetIndex === undefined) {
            return { changed: false };
        }
        const account = storage.accounts[targetIndex];
        if (!account) {
            return { changed: false };
        }
        const changed = applyCodexAuthSnapshotToStoredAccount(account, snapshot);
        return { changed, targetIndex, snapshot };
    }
    catch {
        return { changed: false };
    }
}
`;

const MODULAR_AUTOSYNC_HELPERS = `
function resolveCurrentCodexAuthAccount(state) {
    if (!state || !Array.isArray(state.accounts) || state.accounts.length === 0) {
        return null;
    }
    const usable = state.accounts.filter((account) => typeof account?.accessToken === "string" &&
        account.accessToken.trim().length > 0 &&
        typeof account.refreshToken === "string" &&
        account.refreshToken.trim().length > 0);
    if (usable.length === 0) {
        return null;
    }
    const activeAccountId = state.activeAccountId?.trim();
    if (activeAccountId) {
        const byAccountId = usable.find((account) => account.accountId?.trim() === activeAccountId);
        if (byAccountId) {
            return byAccountId;
        }
    }
    const activeEmail = sanitizeEmail(state.activeEmail);
    if (activeEmail) {
        const byEmail = usable.find((account) => sanitizeEmail(account.email) === activeEmail);
        if (byEmail) {
            return byEmail;
        }
    }
    const active = usable.find((account) => account.isActive);
    return active ?? (usable.length === 1 ? usable[0] : null);
}
function applyCodexAuthSnapshotToStoredAccount(account, snapshot) {
    const accessToken = snapshot.accessToken?.trim();
    const refreshToken = snapshot.refreshToken?.trim();
    if (!accessToken || !refreshToken) {
        return false;
    }
    let changed = false;
    if (account.accessToken !== accessToken) {
        account.accessToken = accessToken;
        changed = true;
    }
    if (account.refreshToken !== refreshToken) {
        account.refreshToken = refreshToken;
        changed = true;
    }
    if (typeof snapshot.expiresAt === "number" &&
        Number.isFinite(snapshot.expiresAt) &&
        account.expiresAt !== snapshot.expiresAt) {
        account.expiresAt = snapshot.expiresAt;
        changed = true;
    }
    const email = sanitizeEmail(snapshot.email);
    if (email && email !== sanitizeEmail(account.email)) {
        account.email = email;
        changed = true;
    }
    const tokenAccountId = snapshot.accountId?.trim() ||
        extractAccountId(accessToken)?.trim() ||
        undefined;
    if (applyTokenAccountIdentity(account, tokenAccountId)) {
        changed = true;
    }
    return changed;
}
async function importCurrentCodexAuthIntoStorage(storage, options = {}) {
    if (!storage || !Array.isArray(storage.accounts) || storage.accounts.length === 0) {
        return { changed: false };
    }
    try {
        const state = await loadCodexCliState({ forceRefresh: true });
        const snapshot = resolveCurrentCodexAuthAccount(state);
        if (!snapshot) {
            return { changed: false };
        }
        const targetIndex = findMatchingAccountIndex(storage.accounts, {
            accountId: snapshot.accountId,
            email: snapshot.email,
            refreshToken: snapshot.refreshToken,
        }, {
            allowUniqueAccountIdFallbackWithoutEmail: true,
        });
        if (targetIndex === undefined) {
            return { changed: false };
        }
        const account = storage.accounts[targetIndex];
        if (!account) {
            return { changed: false };
        }
        const changed = applyCodexAuthSnapshotToStoredAccount(account, snapshot);
        if (changed && options.persist === true) {
            let persisted = false;
            await withAccountStorageTransaction(async (loadedStorage, persist) => {
                if (!loadedStorage) {
                    return;
                }
                const nextStorage = structuredClone(loadedStorage);
                const nextIndex = findMatchingAccountIndex(nextStorage.accounts, {
                    accountId: snapshot.accountId,
                    email: snapshot.email,
                    refreshToken: snapshot.refreshToken,
                }, {
                    allowUniqueAccountIdFallbackWithoutEmail: true,
                });
                if (nextIndex === undefined || !nextStorage.accounts[nextIndex]) {
                    return;
                }
                applyCodexAuthSnapshotToStoredAccount(nextStorage.accounts[nextIndex], snapshot);
                await persist(nextStorage);
                persisted = true;
            });
            if (!persisted) {
                return { changed: false };
            }
        }
        return { changed, targetIndex, snapshot };
    }
    catch {
        return { changed: false };
    }
}
`;

function patchMonolithic(packageRoot, changedFiles, backups) {
  const file = path.join(packageRoot, "dist", "lib", "codex-manager.js");
  let text = normalizeJs(fs.readFileSync(file, "utf8"));
  if (text.includes("function resolveCurrentCodexAuthAccount(state)") &&
      text.includes("await importCurrentCodexAuthIntoStorage(storage, { persist: true });") &&
      text.includes("const importedAuth = await importCurrentCodexAuthIntoStorage(storage);")) {
    return { file, changed: false, alreadyPatched: true };
  }

  text = replaceOnce(
    text,
    "async function syncCodexCliActiveSelectionIfDrifted(storage) {",
    `${COMMON_HELPERS}\nasync function syncCodexCliActiveSelectionIfDrifted(storage) {`,
    "monolithic helper insertion",
  );
  text = replaceOnce(
    text,
    `    if (activeIndex < 0 || activeIndex >= storage.accounts.length) {
        return false;
    }
    const account = storage.accounts[activeIndex];`,
    `    if (activeIndex < 0 || activeIndex >= storage.accounts.length) {
        return false;
    }
    await importCurrentCodexAuthIntoStorage(storage, { persist: true });
    const account = storage.accounts[activeIndex];`,
    "monolithic drift-sync import",
  );
  text = replaceRegexOnce(
    text,
    /(async function persistAndSyncSelectedAccount\(\{ storage, targetIndex, parsed, switchReason, initialSyncIdToken, preserveActiveIndexByFamily = false, setPin = false, clearPin = false, bumpAffinityGeneration = false, \}\) \{\n)    const account = storage\.accounts\[targetIndex\];/,
    `$1    if (targetIndex < 0 || targetIndex >= storage.accounts.length) {
        throw new Error(\`Account \${parsed} not found.\`);
    }
    const importedAuth = await importCurrentCodexAuthIntoStorage(storage);
    const account = storage.accounts[targetIndex];`,
    "monolithic switch pre-import",
  );
  text = replaceOnce(
    text,
    "    let syncIdToken = initialSyncIdToken;\n",
    `    let syncIdToken = initialSyncIdToken ??
        (importedAuth.targetIndex === targetIndex
            ? importedAuth.snapshot?.idToken
            : undefined);
`,
    "monolithic id token fallback",
  );
  text = replaceOnce(
    text,
    `    if (!storage || storage.accounts.length === 0) {
        return false;
    }
    const activeIndex = resolveActiveIndex(storage, "codex");`,
    `    if (!storage || storage.accounts.length === 0) {
        return false;
    }
    await importCurrentCodexAuthIntoStorage(storage, { persist: true });
    const activeIndex = resolveActiveIndex(storage, "codex");`,
    "monolithic app startup import",
  );

  const changed = writePatched(file, text, changedFiles, backups);
  return { file, changed, alreadyPatched: false };
}

function patchModularPersist(packageRoot, changedFiles, backups) {
  const file = path.join(packageRoot, "dist", "lib", "codex-manager", "persist-selected-account.js");
  let text = normalizeJs(fs.readFileSync(file, "utf8"));
  if (text.includes("function resolveCurrentCodexAuthAccount(state)") &&
      text.includes("const importedAuth = await importCurrentCodexAuthIntoStorage(storage);")) {
    return { file, changed: false, alreadyPatched: true };
  }

  text = replaceOnce(
    text,
    `import { setCodexCliActiveSelection } from "../codex-cli/writer.js";\n`,
    `import { setCodexCliActiveSelection } from "../codex-cli/writer.js";
import { loadCodexCliState } from "../codex-cli/state.js";
`,
    "modular persist state import",
  );
  text = replaceRegexOnce(
    text,
    /import \{ getStoragePath, readAffinityGenerationFromDisk, saveAccounts, \} from "\.\.\/storage\.js";/,
    `import { findMatchingAccountIndex, getStoragePath, readAffinityGenerationFromDisk, saveAccounts, } from "../storage.js";`,
    "modular persist storage import",
  );
  text = replaceOnce(
    text,
    `/**
 * Persist an explicit account selection and sync it to the Codex CLI state.`,
    `${MODULAR_PERSIST_HELPERS}
/**
 * Persist an explicit account selection and sync it to the Codex CLI state.`,
    "modular persist helper insertion",
  );
  text = replaceOnce(
    text,
    `    const account = storage.accounts[targetIndex];
    if (!account) {`,
    `    if (targetIndex < 0 || targetIndex >= storage.accounts.length) {
        throw new Error(\`Account \${parsed} not found.\`);
    }
    const importedAuth = await importCurrentCodexAuthIntoStorage(storage);
    const account = storage.accounts[targetIndex];
    if (!account) {`,
    "modular persist pre-import",
  );
  text = replaceOnce(
    text,
    "    let syncIdToken = initialSyncIdToken;\n",
    `    let syncIdToken = initialSyncIdToken ??
        (importedAuth.targetIndex === targetIndex
            ? importedAuth.snapshot?.idToken
            : undefined);
`,
    "modular persist id token fallback",
  );

  const changed = writePatched(file, text, changedFiles, backups);
  return { file, changed, alreadyPatched: false };
}

function patchModularLoginMenu(packageRoot, changedFiles, backups) {
  const file = path.join(packageRoot, "dist", "lib", "codex-manager", "login-menu-data.js");
  let text = normalizeJs(fs.readFileSync(file, "utf8"));
  if (text.includes("function resolveCurrentCodexAuthAccount(state)") &&
      text.includes("await importCurrentCodexAuthIntoStorage(storage, { persist: true });")) {
    return { file, changed: false, alreadyPatched: true };
  }

  text = replaceOnce(
    text,
    `import { extractAccountId, sanitizeEmail } from "../accounts.js";`,
    `import { extractAccountEmail, extractAccountId, sanitizeEmail } from "../accounts.js";`,
    "modular menu account import",
  );
  text = replaceOnce(
    text,
    `import { resolveActiveIndex } from "../runtime/account-status.js";`,
    `import { resolveActiveIndex } from "../runtime/account-status.js";
import { findMatchingAccountIndex, saveAccounts } from "../storage.js";`,
    "modular menu storage import",
  );
  text = replaceOnce(
    text,
    `import { hasUsableAccessToken } from "./account-credentials.js";`,
    `import { applyTokenAccountIdentity, hasUsableAccessToken } from "./account-credentials.js";`,
    "modular menu credentials import",
  );
  text = replaceOnce(
    text,
    `import { formatAccountQuotaSummary, formatRateLimitEntry, } from "./formatters/index.js";`,
    `import { formatAccountQuotaSummary, formatRateLimitEntry, } from "./formatters/index.js";
import { saveAccountsWithRetry } from "./forecast-report-shared.js";`,
    "modular menu save retry import",
  );
  text = replaceOnce(
    text,
    "export async function syncCodexCliActiveSelectionIfDrifted(storage) {",
    `${COMMON_HELPERS}
export async function syncCodexCliActiveSelectionIfDrifted(storage) {`,
    "modular menu helper insertion",
  );
  text = replaceOnce(
    text,
    `    if (activeIndex < 0 || activeIndex >= storage.accounts.length) {
        return false;
    }
    const account = storage.accounts[activeIndex];`,
    `    if (activeIndex < 0 || activeIndex >= storage.accounts.length) {
        return false;
    }
    await importCurrentCodexAuthIntoStorage(storage, { persist: true });
    const account = storage.accounts[activeIndex];`,
    "modular menu drift-sync import",
  );

  const changed = writePatched(file, text, changedFiles, backups);
  return { file, changed, alreadyPatched: false };
}

function patchModularAutoSync(packageRoot, changedFiles, backups) {
  const file = path.join(packageRoot, "dist", "lib", "codex-manager.js");
  let text = normalizeJs(fs.readFileSync(file, "utf8"));
  if (text.includes("function resolveCurrentCodexAuthAccount(state)") &&
      text.includes("await importCurrentCodexAuthIntoStorage(storage, { persist: true });")) {
    return { file, changed: false, alreadyPatched: true };
  }

  text = replaceOnce(
    text,
    "export async function autoSyncActiveAccountToCodex() {",
    `${MODULAR_AUTOSYNC_HELPERS}
export async function autoSyncActiveAccountToCodex() {`,
    "modular autosync helper insertion",
  );
  text = replaceOnce(
    text,
    `    if (!storage || storage.accounts.length === 0) {
        return false;
    }
    const activeIndex = resolveActiveIndex(storage, "codex");`,
    `    if (!storage || storage.accounts.length === 0) {
        return false;
    }
    await importCurrentCodexAuthIntoStorage(storage, { persist: true });
    const activeIndex = resolveActiveIndex(storage, "codex");`,
    "modular app startup import",
  );

  const changed = writePatched(file, text, changedFiles, backups);
  return { file, changed, alreadyPatched: false };
}

function patchPackage(packageRoot, checkOnly) {
  const modularPersist = path.join(packageRoot, "dist", "lib", "codex-manager", "persist-selected-account.js");
  const monolithic = path.join(packageRoot, "dist", "lib", "codex-manager.js");
  const backups = [];
  const changedFiles = [];

  if (!pathExists(monolithic)) fail(`missing codex-manager.js under ${packageRoot}`);

  const packageJson = readPackageJson(packageRoot);
  const isModular = pathExists(modularPersist);
  const status = [];

  if (checkOnly) {
    const files = isModular
      ? [
          modularPersist,
          path.join(packageRoot, "dist", "lib", "codex-manager", "login-menu-data.js"),
          monolithic,
        ]
      : [monolithic];
    const patched = files.every((file) => normalizeJs(fs.readFileSync(file, "utf8")).includes("function resolveCurrentCodexAuthAccount(state)"));
    return { version: packageJson.version, isModular, patched, changedFiles, backups, status };
  }

  if (isModular) {
    status.push(patchModularPersist(packageRoot, changedFiles, backups));
    status.push(patchModularLoginMenu(packageRoot, changedFiles, backups));
    status.push(patchModularAutoSync(packageRoot, changedFiles, backups));
  } else {
    status.push(patchMonolithic(packageRoot, changedFiles, backups));
  }

  const syntaxFiles = isModular
    ? [
        modularPersist,
        path.join(packageRoot, "dist", "lib", "codex-manager", "login-menu-data.js"),
        monolithic,
      ]
    : [monolithic];
  checkSyntax(syntaxFiles);

  return {
    version: packageJson.version,
    isModular,
    patched: true,
    changedFiles,
    backups,
    status,
  };
}

async function loadCodexStateFrom(packageRoot, codexHome) {
  process.env.CODEX_HOME = codexHome;
  const stateFile = path.join(packageRoot, "dist", "lib", "codex-cli", "state.js");
  const stateModule = await import(pathToFileURL(stateFile).href + `?t=${Date.now()}`);
  return stateModule.loadCodexCliState({ forceRefresh: true });
}

function matchingAccountIndex(storage, active) {
  const sanitize = (value) => (typeof value === "string" && value.trim() ? value.trim().toLowerCase() : undefined);
  return storage.accounts.findIndex((account) =>
    (active.accountId && account.accountId === active.accountId) ||
    (sanitize(active.email) && sanitize(account.email) === sanitize(active.email)) ||
    (active.refreshToken && account.refreshToken === active.refreshToken)
  );
}

async function verifyTemp(packageRoot, codexHome) {
  const authFile = path.join(codexHome, "auth.json");
  const accountFile = path.join(codexHome, "multi-auth", "openai-codex-accounts.json");
  if (!pathExists(authFile) || !pathExists(accountFile)) {
    return { skipped: true, reason: "missing auth.json or openai-codex-accounts.json" };
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-multi-auth-refresh-guard-"));
  const tempCodexHome = path.join(tempRoot, "codex");
  const tempMultiAuth = path.join(tempCodexHome, "multi-auth");
  fs.mkdirSync(tempMultiAuth, { recursive: true });
  fs.copyFileSync(authFile, path.join(tempCodexHome, "auth.json"));
  if (pathExists(path.join(codexHome, "config.toml"))) {
    fs.copyFileSync(path.join(codexHome, "config.toml"), path.join(tempCodexHome, "config.toml"));
  }
  fs.copyFileSync(accountFile, path.join(tempMultiAuth, "openai-codex-accounts.json"));

  const previousCodexHome = process.env.CODEX_HOME;
  try {
    const beforeState = await loadCodexStateFrom(packageRoot, tempCodexHome);
    const active = beforeState?.accounts?.[0];
    if (!active?.accessToken || !active?.refreshToken) {
      return { skipped: true, reason: "no complete active auth snapshot in copied auth.json" };
    }

    const copiedStoragePath = path.join(tempMultiAuth, "openai-codex-accounts.json");
    const storage = JSON.parse(fs.readFileSync(copiedStoragePath, "utf8"));
    const index = matchingAccountIndex(storage, active);
    if (index < 0) {
      return { skipped: true, reason: "copied account pool has no match for copied active auth" };
    }

    const pre = {
      access: sha256(active.accessToken),
      refresh: sha256(active.refreshToken),
    };
    storage.accounts[index].accessToken = "stale-access-token-for-refresh-guard-simulation";
    storage.accounts[index].refreshToken = "stale-refresh-token-for-refresh-guard-simulation";
    storage.accounts[index].expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    fs.writeFileSync(copiedStoragePath, JSON.stringify(storage, null, 2), "utf8");

    const script = path.join(packageRoot, "scripts", "codex-multi-auth.js");
    const switchResult = run(process.execPath, [script, "switch", String(index + 1)], {
      env: { ...process.env, CODEX_HOME: tempCodexHome },
    });
    if (switchResult.status !== 0) {
      return {
        skipped: false,
        passed: false,
        reason: "temp switch command failed",
        stderr: (switchResult.stderr || switchResult.stdout || "").slice(0, 1000),
      };
    }

    const afterState = await loadCodexStateFrom(packageRoot, tempCodexHome);
    const afterActive = afterState?.accounts?.[0];
    const afterStorage = JSON.parse(fs.readFileSync(copiedStoragePath, "utf8"));
    const afterAccount = afterStorage.accounts[index];
    const result = {
      skipped: false,
      targetOneBased: index + 1,
      storageRefreshMatchesPreSwitchAuth: sha256(afterAccount.refreshToken) === pre.refresh,
      storageAccessMatchesPreSwitchAuth: sha256(afterAccount.accessToken) === pre.access,
      authRefreshMatchesPreSwitchAuth: sha256(afterActive?.refreshToken) === pre.refresh,
      authAccessMatchesPreSwitchAuth: sha256(afterActive?.accessToken) === pre.access,
      staleRefreshStillStored: afterAccount.refreshToken === "stale-refresh-token-for-refresh-guard-simulation",
      staleAccessStillStored: afterAccount.accessToken === "stale-access-token-for-refresh-guard-simulation",
      staleRefreshWrittenToAuth: afterActive?.refreshToken === "stale-refresh-token-for-refresh-guard-simulation",
      staleAccessWrittenToAuth: afterActive?.accessToken === "stale-access-token-for-refresh-guard-simulation",
    };
    result.passed =
      result.storageRefreshMatchesPreSwitchAuth &&
      result.storageAccessMatchesPreSwitchAuth &&
      result.authRefreshMatchesPreSwitchAuth &&
      result.authAccessMatchesPreSwitchAuth &&
      !result.staleRefreshStillStored &&
      !result.staleAccessStillStored &&
      !result.staleRefreshWrittenToAuth &&
      !result.staleAccessWrittenToAuth;
    return result;
  } finally {
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = previousCodexHome;
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function main() {
  const packageRoot = locatePackageRoot();
  const codexHome = resolveCodexHome();
  const checkOnly = hasFlag("--check-only");
  const verify = hasFlag("--verify-temp");
  const backups = [];

  if (!checkOnly) {
    backupCodexData(codexHome, backups);
  }

  const patchResult = patchPackage(packageRoot, checkOnly);
  backups.push(...patchResult.backups);

  info(`packageRoot=${packageRoot}`);
  info(`codexHome=${codexHome}`);
  info(`version=${patchResult.version}`);
  info(`layout=${patchResult.isModular ? "modular" : "monolithic"}`);
  info(`patched=${patchResult.patched}`);
  info(`changedFiles=${patchResult.changedFiles.length}`);
  for (const file of patchResult.changedFiles) info(`changed=${file}`);
  info(`backups=${backups.length}`);
  for (const backup of backups) info(`backup=${backup}`);

  if (verify) {
    const verification = await verifyTemp(packageRoot, codexHome);
    info(`verification=${JSON.stringify(verification)}`);
    if (!verification.skipped && !verification.passed) {
      process.exitCode = 1;
    }
  }
}

main().catch((error) => fail(error?.stack || String(error)));
