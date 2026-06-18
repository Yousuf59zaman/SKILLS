#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const home = process.env.USERPROFILE || process.env.HOME;
if (!home) throw new Error("Could not resolve USERPROFILE/HOME");

const workspaceScript = join(home, ".openclaw", "workspace", "skills", "openclaw-auth-profile", "scripts", "recover-auth-state-and-smoke-test.mjs");
if (!existsSync(workspaceScript)) {
  console.error(JSON.stringify({
    blocked: true,
    reason: "missing_workspace_auth_state_recovery_script",
    workspaceScript,
    authProfilesWritten: false
  }, null, 2));
  process.exit(2);
}

console.error("profile_sync_disabled: running auth-state recovery replacement; auth-profiles.json will not be copied or changed");
const result = spawnSync(process.execPath, [workspaceScript, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(result.status ?? 1);
