#!/usr/bin/env node
// Isolated capture-back verification.
//
// Writes a FAKE rotated refresh token to a temp auth.json, points the patched
// `captureCodexCliAuthIntoStorage` at it via CODEX_CLI_AUTH_PATH
// (and CODEX_CLI_ACCOUNTS_PATH to a non-existent temp path), and asserts the
// function copies the rotated token into a temp in-memory store.
//
// The real ~/.codex/auth.json and the real store are NEVER read or written.
// No tokens are printed; only PASS/FAIL and counters.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);

function readArg(name) {
  const i = args.indexOf(name);
  if (i !== -1) return args[i + 1];
  for (const a of args) if (a.startsWith(name + "=")) return a.slice(name.length + 1);
  return undefined;
}

function pass(m) { console.log(`cma-verify: PASS — ${m}`); }
function fail(m) { console.error(`cma-verify: FAIL — ${m}`); process.exit(1); }
function info(m) { console.log(`cma-verify: ${m}`); }

function pathToFileURLSafe(p) {
  let s = p.replace(/\\/g, "/");
  if (!s.startsWith("/")) s = "/" + s;
  return "file://" + encodeURI(s);
}

function locatePackageRoot() {
  const explicit = readArg("--package-root") || process.env.CODEX_MULTI_AUTH_PACKAGE_ROOT;
  if (explicit) return path.resolve(explicit);
  if (process.env.APPDATA) {
    const c = path.join(process.env.APPDATA, "npm", "node_modules", "codex-multi-auth");
    if (fs.existsSync(path.join(c, "package.json"))) return c;
  }
  fail("could not locate codex-multi-auth package; pass --package-root=<path>");
}

async function main() {
  const packageRoot = locatePackageRoot();
  const file = path.join(packageRoot, "dist", "lib", "codex-manager", "persist-selected-account.js");
  if (!fs.existsSync(file)) fail(`patched module not found: ${file}`);

  // Fresh temp sandbox so loadCodexCliState reads ONLY our fake auth.json.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cma-verify-"));
  try {
    const fakeAccountId = "org-CMA-VERIFY-TEST";
    const oldRefresh = "rt.1.OLD_DUMMY_VERIFIER_TOKEN";
    const rotatedRefresh = "rt.1.FAKE_ROTATED_VERIFIER_TOKEN";
    const fakeAuthPath = path.join(tmp, "auth.json");
    const fakeAccountsPath = path.join(tmp, "accounts.json"); // deliberately absent
    // Minimal auth.json that parseCodexCliAuthState accepts: tokens.refresh_token + account_id.
    // No access_token -> accessToken="" (parse requires access OR refresh; refresh present).
    // id_token omitted -> email falls back to parsed.email.
    fs.writeFileSync(fakeAuthPath, JSON.stringify({
      auth_mode: "chatgpt",
      tokens: {
        refresh_token: rotatedRefresh,
        account_id: fakeAccountId,
      },
      email: "cma-verify@example.com",
      last_refresh: null,
    }, null, 2));

    // Temp in-memory store matching the fake auth identity. accountIdSource !="org"
    // so the capture's account_id adoption guard doesn't skip, though we only
    // test refresh-token capture here (id already matches).
    const tempStorage = {
      version: 3,
      accounts: [{
        accountId: fakeAccountId,
        accountIdSource: "token",
        email: "cma-verify@example.com",
        refreshToken: oldRefresh,
        accessToken: "",
        expiresAt: 0,
        enabled: true,
      }],
      activeIndex: 0,
      activeIndexByFamily: {},
    };

    // Redirect ALL Codex-CLI state path resolution into the temp sandbox.
    process.env.CODEX_CLI_AUTH_PATH = fakeAuthPath;
    process.env.CODEX_CLI_ACCOUNTS_PATH = fakeAccountsPath;
    // Ensure sync is enabled (default true) and not disabled by host env:
    delete process.env.CODEX_MULTI_AUTH_SYNC_CODEX_CLI;
    delete process.env.CODEX_AUTH_SYNC_CODEX_CLI;

    const modUrl = pathToFileURLSafe(file);
    const mod = await import(modUrl);
    if (typeof mod.captureCodexCliAuthIntoStorage !== "function") {
      fail("captureCodexCliAuthIntoStorage is not exported — patch not applied to this install");
    }

    const changed = await mod.captureCodexCliAuthIntoStorage(tempStorage);
    if (changed !== true) fail(`expected capture to return true (changed), got ${changed}`);
    const got = tempStorage.accounts[0].refreshToken;
    if (got !== rotatedRefresh) {
      fail(`store refresh token not updated. expected ${rotatedRefresh.slice(0, 12)}…, still has ${String(got).slice(0, 12)}… — capture-back did NOT move the rotated token into the store`);
    }
    if (tempStorage.accounts[0].accessToken && tempStorage.accounts[0].accessToken !== "") {
      // fine but not asserted
    }
    pass("rotated refresh token captured into temp store (capture-back works)");
    info(`  account id: ${tempStorage.accounts[0].accountId}`);
    info(`  old token tail: ${oldRefresh.slice(-10)} -> new token tail: ${got.slice(-10)}`);
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

main().catch((e) => fail(String(e && e.stack || e)));