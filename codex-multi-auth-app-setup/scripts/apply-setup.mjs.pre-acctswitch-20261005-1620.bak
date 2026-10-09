#!/usr/bin/env node
// codex-multi-auth-app-setup — apply + verify
//
// 1) capture-back patch for codex-multi-auth 2.6.0 (persist-selected-account.js)
// 2) codex-app launcher (ps1 + cmd) on the user bin dir
// 3) ensure codex-multi-auth >= 2.6.0, optional @openai/codex upgrade
//
// Idempotent. Dry-run by default; --apply to write. Never prints tokens.
// Verify is isolated: it writes a fake rotated token to a temp auth.json and
// asserts the patched capture function moves it into a temp store. The real
// auth.json and store are never read or written by this script.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ""));
const SKILL_DIR = path.dirname(SCRIPT_DIR);

function hasFlag(name) { return args.includes(name); }
function readArg(name) {
  const i = args.indexOf(name);
  if (i !== -1) return args[i + 1];
  const eq = `${name}=`;
  for (const a of args) if (a.startsWith(eq)) return a.slice(eq.length);
  return undefined;
}
function info(m) { console.log(`cma-setup: ${m}`); }
function warn(m) { console.warn(`cma-setup: ${m}`); }
function fail(m) { console.error(`cma-setup: ${m}`); process.exit(1); }

const APPLY = hasFlag("--apply");
const CHECK = hasFlag("--check") || !APPLY;
const UPGRADE = hasFlag("--upgrade");
const UPGRADE_CODEX = hasFlag("--upgrade-codex");
const VERIFY_ONLY = hasFlag("--verify-only");

function pathExists(p) { try { fs.accessSync(p); return true; } catch { return false; } }

function normalizeJs(t) { return t.replace(/\r\n/g, "\n"); }

function timestamp() { return new Date().toISOString().replace(/[:.]/g, "-"); }

function backupBeforeEdit(file, backups) {
  if (!pathExists(file)) fail(`cannot patch missing file: ${file}`);
  const bak = `${file}.cma-setup-${timestamp()}.bak`;
  fs.copyFileSync(file, bak);
  backups.push(bak);
}

function replaceOnce(text, needle, replacement, label) {
  if (!text.includes(needle)) fail(`patch marker not found: ${label}`);
  return text.replace(needle, replacement);
}

function run(cmd, cargs, opts = {}) {
  return spawnSync(cmd, cargs, { encoding: "utf8", windowsHide: true, ...opts });
}

function npmCmd() { return process.platform === "win32" ? "npm.cmd" : "npm"; }

function locatePackageRoot() {
  const explicit = readArg("--package-root") || process.env.CODEX_MULTI_AUTH_PACKAGE_ROOT;
  if (explicit) return path.resolve(explicit);
  const npmRoot = run(npmCmd(), ["root", "-g"]);
  if (npmRoot.status === 0 && npmRoot.stdout.trim()) {
    const c = path.join(npmRoot.stdout.trim(), "codex-multi-auth");
    if (pathExists(path.join(c, "package.json"))) return c;
  }
  if (process.env.APPDATA) {
    const c = path.join(process.env.APPDATA, "npm", "node_modules", "codex-multi-auth");
    if (pathExists(path.join(c, "package.json"))) return c;
  }
  fail("could not locate global codex-multi-auth package; pass --package-root or run `npm i -g codex-multi-auth@latest`");
}

function resolveCodexHome() {
  return path.resolve(readArg("--codex-home") || process.env.CODEX_HOME || path.join(os.homedir(), ".codex"));
}

function resolveBinDir() {
  const explicit = readArg("--bin-dir");
  if (explicit) return path.resolve(explicit);
  // Default: %USERPROFILE%\bin (matches the dev laptop). Create only on --apply.
  return path.join(os.homedir(), "bin");
}

function readPackageVersion(packageRoot) {
  try { return JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8")).version; }
  catch { return undefined; }
}

function ensurePackageVersion(packageRoot, backups) {
  const v = readPackageVersion(packageRoot);
  if (!v) fail(`could not read codex-multi-auth version at ${packageRoot}`);
  const [major, minor] = v.split(".").map((n) => Number.parseInt(n, 10));
  const ok = (major ?? 0) > 2 || (major === 2 && (minor ?? 0) >= 6);
  if (ok) { info(`codex-multi-auth ${v} (${major >= 2 ? "≥2.6 layout" : ""})`); return v; }
  if (!APPLY) { info(`codex-multi-auth ${v} is < 2.6.0; run with --apply --upgrade to install latest`); return v; }
  if (!UPGRADE) fail(`codex-multi-auth ${v} is < 2.6.0; the patch targets 2.6.0. Re-run with --upgrade.`);
  info(`upgrading codex-multi-auth ${v} -> latest ...`);
  const r = run(npmCmd(), ["install", "-g", "codex-multi-auth@latest"], { stdio: "inherit" });
  if (r.status !== 0) fail("npm install codex-multi-auth@latest failed");
  const nv = readPackageVersion(packageRoot);
  info(`codex-multi-auth now ${nv}`);
  return nv;
}

function maybeUpgradeCodex() {
  if (!APPLY || !UPGRADE_CODEX) return;
  info("upgrading @openai/codex -> latest ...");
  const r = run(npmCmd(), ["install", "-g", "@openai/codex@latest"], { stdio: "inherit" });
  if (r.status !== 0) warn("npm install @openai/codex@latest failed (non-fatal; the app is MSIX anyway)");
}

// --- The capture-back helper, carried verbatim from the verified live patch. ---
const CAPTURE_HELPER = `/**
 * Capture the live Codex CLI auth (the ~/.codex/auth.json the ChatGPT desktop
 * app actually used most recently) back into the canonical multi-auth store for
 * the currently-active account, BEFORE an account switch overwrites that file.
 *
 * ChatGPT OAuth rotates the refresh token every use; if the desktop app
 * refreshed the active account, the store holds a now-dead token. Without this
 * capture that rotation is lost the moment we switch. One-way capture only
 * (CLI -> store): updates an existing matched account's tokens, never creates
 * accounts, never wipes a stored token, swallows all errors. Persisted by the
 * caller's subsequent saveAccountsWithRetry.
 */
export async function captureCodexCliAuthIntoStorage(storage) {
    if (!storage || !Array.isArray(storage.accounts) || storage.accounts.length === 0) {
        return false;
    }
    try {
        const state = await loadCodexCliState({ forceRefresh: true });
        if (!state || !Array.isArray(state.accounts) || state.accounts.length === 0) {
            return false;
        }
        const activeId = typeof state.activeAccountId === "string" ? state.activeAccountId.trim() : "";
        let snapshot;
        if (activeId) {
            snapshot = state.accounts.find((entry) => entry && entry.accountId === activeId);
        }
        if (!snapshot) {
            snapshot = state.accounts.find((entry) => entry && entry.isActive) ?? state.accounts[0];
        }
        if (!snapshot) {
            return false;
        }
        const candidate = {
            accountId: snapshot.accountId,
            email: snapshot.email,
            refreshToken: snapshot.refreshToken,
        };
        const targetIndex = findMatchingAccountIndex(storage.accounts, candidate, {
            allowUniqueAccountIdFallbackWithoutEmail: true,
        });
        if (typeof targetIndex !== "number" ||
            targetIndex < 0 ||
            targetIndex >= storage.accounts.length) {
            return false;
        }
        const account = storage.accounts[targetIndex];
        if (!account) {
            return false;
        }
        let changed = false;
        if (typeof snapshot.refreshToken === "string" &&
            snapshot.refreshToken.length > 0 &&
            snapshot.refreshToken !== account.refreshToken) {
            account.refreshToken = snapshot.refreshToken;
            changed = true;
        }
        if (typeof snapshot.accessToken === "string" &&
            snapshot.accessToken.length > 0 &&
            snapshot.accessToken !== account.accessToken) {
            account.accessToken = snapshot.accessToken;
            changed = true;
        }
        if (typeof snapshot.expiresAt === "number" &&
            Number.isFinite(snapshot.expiresAt) &&
            snapshot.expiresAt !== account.expiresAt) {
            account.expiresAt = snapshot.expiresAt;
            changed = true;
        }
        if (typeof snapshot.accountId === "string" &&
            snapshot.accountId.length > 0 &&
            snapshot.accountId !== account.accountId &&
            account.accountIdSource !== "org") {
            account.accountId = snapshot.accountId;
            changed = true;
        }
        return changed;
    }
    catch {
        return false;
    }
}
`;

const CAPTURE_CALL = `    // Capture the outgoing (currently-active) account's live auth.json tokens
    // back into the store before overwriting auth.json with the target account.
    // The desktop app may have rotated its refresh token; without this capture
    // that rotation is lost on switch.
    if (typeof storage.activeIndex === "number" &&
        storage.activeIndex >= 0 &&
        storage.activeIndex < storage.accounts.length &&
        storage.activeIndex !== targetIndex) {
        await captureCodexCliAuthIntoStorage(storage);
    }
    else if (storage.activeIndex === targetIndex) {
        await captureCodexCliAuthIntoStorage(storage);
    }
`;

function patchPersist(packageRoot, changedFiles, backups) {
  const file = path.join(packageRoot, "dist", "lib", "codex-manager", "persist-selected-account.js");
  if (!pathExists(file)) fail(`expected 2.6.0 modular file not found: ${file}`);
  let text = normalizeJs(fs.readFileSync(file, "utf8"));

  const MARKER = "captureCodexCliAuthIntoStorage";
  if (text.includes(MARKER)) {
    info(`capture-back patch already present (marker '${MARKER}' found) — skipping`);
    return { file, changed: false, alreadyPatched: true };
  }

  text = replaceOnce(
    text,
    `import { setCodexCliActiveSelection } from "../codex-cli/writer.js";\n`,
    `import { setCodexCliActiveSelection } from "../codex-cli/writer.js";
import { loadCodexCliState } from "../codex-cli/state.js";
`,
    "persist writer import",
  );
  text = replaceOnce(
    text,
    `import { getStoragePath, readAffinityGenerationFromDisk, saveAccounts, } from "../storage.js";`,
    `import { findMatchingAccountIndex, getStoragePath, readAffinityGenerationFromDisk, saveAccounts, } from "../storage.js";`,
    "persist storage import",
  );
  text = replaceOnce(
    text,
    `/**
 * Persist an explicit account selection and sync it to the Codex CLI state.`,
    `${CAPTURE_HELPER}/**
 * Persist an explicit account selection and sync it to the Codex CLI state.`,
    "persist helper insertion",
  );
  text = replaceOnce(
    text,
    `    const account = storage.accounts[targetIndex];
    if (!account) {
        throw new Error(\`Account \${parsed} not found.\`);
    }
`,
    `    const account = storage.accounts[targetIndex];
    if (!account) {
        throw new Error(\`Account \${parsed} not found.\`);
    }
${CAPTURE_CALL}`,
    "persist capture-back call",
  );

  // write
  const current = normalizeJs(fs.readFileSync(file, "utf8"));
  if (current === text) return { file, changed: false, alreadyPatched: true };
  if (APPLY) {
    backupBeforeEdit(file, backups);
    fs.writeFileSync(file, text, "utf8");
    changedFiles.push(file);
    info(`patched ${file}`);
  } else {
    info(`[dry-run] would patch ${file}`);
  }
  return { file, changed: APPLY, alreadyPatched: false };
}

function installLauncher(binDir, changedFiles, backups) {
  const ps1Src = path.join(SKILL_DIR, "scripts", "codex-app.ps1");
  const cmdSrc = path.join(SKILL_DIR, "scripts", "codex-app.cmd");
  if (!pathExists(ps1Src) || !pathExists(cmdSrc)) fail("launcher assets missing in skill scripts/");
  const ps1Dst = path.join(binDir, "codex-app.ps1");
  const cmdDst = path.join(binDir, "codex-app.cmd");
  const ps1Changed = !pathExists(ps1Dst) || normalizeJs(fs.readFileSync(ps1Dst, "utf8")) !== normalizeJs(fs.readFileSync(ps1Src, "utf8"));
  const cmdChanged = !pathExists(cmdDst) || normalizeJs(fs.readFileSync(cmdDst, "utf8")) !== normalizeJs(fs.readFileSync(cmdSrc, "utf8"));
  if (!ps1Changed && !cmdChanged) { info(`codex-app launcher already up-to-date in ${binDir}`); return; }
  if (!APPLY) { info(`[dry-run] would install codex-app.ps1 + codex-app.cmd to ${binDir}`); return; }
  if (!pathExists(binDir)) { fs.mkdirSync(binDir, { recursive: true }); info(`created ${binDir}`); }
  for (const [src, dst] of [[ps1Src, ps1Dst], [cmdSrc, cmdDst]]) {
    if (pathExists(dst)) { const b = `${dst}.cma-setup-${timestamp()}.bak`; fs.copyFileSync(dst, b); backups.push(b); }
    fs.copyFileSync(src, dst);
    changedFiles.push(dst);
  }
  info(`installed codex-app.ps1 + codex-app.cmd to ${binDir}`);
  // Best-effort PATH hint
  const pathHasBin = (process.env.Path || process.env.PATH || "")
    .split(path.delimiter).some((p) => path.resolve(p) === path.resolve(binDir));
  if (!pathHasBin) warn(`${binDir} is not on PATH. Add it, or launch via full path.`);
}

function checkSyntax(files) {
  for (const f of files) {
    const r = run(process.execPath, ["--check", f]);
    if (r.status !== 0) fail(`node --check failed for ${f}\n${r.stderr || r.stdout}`);
  }
}

function importTest(packageRoot) {
  // Confirm the patched module still imports and exports the capture function.
  const target = pathToFileURLSafe(path.join(packageRoot, "dist", "lib", "codex-manager", "persist-selected-account.js"));
  const r = run(process.execPath, ["--input-type=module", "-e",
    `import(${JSON.stringify(target)}).then(m=>{if(typeof m.captureCodexCliAuthIntoStorage!=="function")process.exit(2);process.exit(0);}).catch(e=>{console.error(String(e&&e.message||e));process.exit(1);});`,
  ]);
  if (r.status !== 0) fail(`import test failed (exit ${r.status})\n${r.stderr || r.stdout}`);
  info("import test OK (captureCodexCliAuthIntoStorage exported)");
}

function pathToFileURLSafe(p) {
  let s = p.replace(/\\/g, "/");
  if (!s.startsWith("/")) s = "/" + s;
  return "file://" + encodeURI(s);
}

function verifyCaptureBack(packageRoot) {
  const verify = path.join(SKILL_DIR, "scripts", "verify-capture-back.mjs");
  if (!pathExists(verify)) fail(`verify script missing: ${verify}`);
  const pkgArg = `--package-root=${packageRoot}`;
  const r = run(process.execPath, [verify, pkgArg], { stdio: "inherit" });
  if (r.status !== 0) fail(`isolated capture-back test FAILED (exit ${r.status})`);
  info("isolated capture-back test PASSED");
}

function resolveChatGptAumid() {
  if (process.platform !== "win32") return null;
  const ps = `try { $p = Get-AppxPackage -Name 'OpenAI.Codex' -ErrorAction SilentlyContinue; if ($p) { "$($p.PackageFamilyName)!App" } } catch { }`;
  const r = run("powershell.exe", ["-NoProfile", "-Command", ps]);
  if (r.status === 0 && r.stdout && r.stdout.trim()) return r.stdout.trim();
  return null;
}

// --- main ---
const backups = [];
const changedFiles = [];
const packageRoot = locatePackageRoot();
const codexHome = resolveCodexHome();
const binDir = resolveBinDir();

info(`package root: ${packageRoot}`);
info(`codex home:   ${codexHome}`);
info(`bin dir:      ${binDir}`);
info(`mode:         ${APPLY ? "APPLY" : "DRY-RUN (--check)"}`);

const version = ensurePackageVersion(packageRoot, backups);
maybeUpgradeCodex();

const patchResult = patchPersist(packageRoot, changedFiles, backups);

if (VERIFY_ONLY) {
  if (patchResult.changed || patchResult.alreadyPatched) {
    checkSyntax([path.join(packageRoot, "dist", "lib", "codex-manager", "persist-selected-account.js")]);
    importTest(packageRoot);
    verifyCaptureBack(packageRoot);
  } else {
    fail("patch not applied; nothing to verify. Run with --apply first.");
  }
  info("verify-only complete");
  process.exit(0);
}

if (APPLY) {
  installLauncher(binDir, changedFiles, backups);
  if (patchResult.changed || patchResult.alreadyPatched) {
    checkSyntax([path.join(packageRoot, "dist", "lib", "codex-manager", "persist-selected-account.js")]);
    importTest(packageRoot);
    verifyCaptureBack(packageRoot);
  }
} else {
  // dry-run still verifies the *current* on-disk module if already patched
  if (patchResult.alreadyPatched) {
    info("dry-run: module already patched — running verify-only checks");
    importTest(packageRoot);
    verifyCaptureBack(packageRoot);
  } else {
    info("dry-run: module not yet patched — skipping verification (run --apply)");
  }
}

const aumid = resolveChatGptAumid();
info(aumid ? `new ChatGPT desktop app AUMID: ${aumid}` : "new ChatGPT desktop app (OpenAI.Codex) not found — install from Microsoft Store");

info(`--- summary ---`);
info(`codex-multi-auth: ${version}`);
info(`capture-back patch: ${patchResult.alreadyPatched ? "present" : patchResult.changed ? "applied" : "pending (--apply)"}`);
info(`launcher: ${APPLY ? "installed/verified" : "pending (--apply)"}`);
info(`AUMID: ${aumid || "not found"}`);
info(`files changed: ${changedFiles.length}; backups: ${backups.length}`);
if (backups.length) backups.forEach((b) => info(`  backup: ${b}`));
info(APPLY ? "done." : "dry-run complete; re-run with --apply to make changes.");