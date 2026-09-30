import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Runtime copy lives in the OpenClaw workspace. The mirrored skill assets may
// be tested from the skill vault; both use the SAME audited managed-browser
// helper, never a separately launched browser or alternate profile.
const adjacent = new URL('../../../scripts/automation-browser-lib.mjs', import.meta.url);
const deployed = pathToFileURL(path.join(process.env.USERPROFILE || process.env.HOME || '', '.openclaw/workspace/scripts/automation-browser-lib.mjs'));
const runtime = await import(fs.existsSync(fileURLToPath(adjacent)) ? adjacent.href : deployed.href);
export const { WORKSPACE_ROOT, connectBrowser, ensureBrowser, parseArgs, parseJsonOutput, safeError, sleep, runOpenClaw } = runtime;
