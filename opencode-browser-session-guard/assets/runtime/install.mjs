import { readFile, writeFile, mkdir, copyFile, rename, access, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parse, modify, applyEdits } from 'jsonc-parser';

const source = fileURLToPath(new URL('.', import.meta.url));
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const configIndex = args.indexOf('--config-dir');
if (configIndex >= 0 && !args[configIndex + 1]) throw new Error('--config-dir needs a path.');
if (args.some((a, i) => a !== '--check' && a !== '--config-dir' && (configIndex < 0 || i !== configIndex + 1))) throw new Error('Supported arguments: --check, --config-dir <path>.');
const configDir = resolve(configIndex >= 0 ? args[configIndex + 1] : join(homedir(), '.config', 'opencode'));
const configPath = join(configDir, 'opencode.jsonc');
const original = await readFile(configPath, 'utf8');
const errors = [];
const parsed = parse(original, errors, { allowTrailingComma: true });
if (errors.length) throw new Error('OpenCode config has parse errors; no changes made.');
const names = ['playwright', 'chrome-devtools', 'chrome_devtools'];
for (const name of names) if (!parsed.mcp?.[name]) throw new Error(`Expected ${name} entry is missing; inspect the config before installing.`);
const previousCommand = JSON.stringify(Object.fromEntries(names.map(name => [name, parsed.mcp[name]])));
const profile = previousCommand.match(/browser-profile-[a-zA-Z0-9_-]+/)?.[0];
// The profile name also remains in the existing launcher after CDP migration.
let previousLauncher = '';
try { previousLauncher = await readFile(join(configDir, 'browser-shared-chrome.bat'), 'utf8'); } catch(e) { if(e.code !== 'ENOENT') throw e; }
const profileName = profile || previousLauncher.match(/browser-profile-[a-zA-Z0-9_-]+/)?.[0];
let profilePath;
if (profileName) profilePath = join(configDir, profileName);
else profilePath = JSON.parse(await readFile(join(configDir, 'browser-shared-chrome.settings.json'), 'utf8')).profilePath;
await access(profilePath);
const runtime = join(configDir, 'browser-session-guard');
const backup = join(configDir, 'backups', 'browser-session-guard-' + new Date().toISOString().replace(/[:.]/g,'-'));
const loginHelpers = (await readdir(configDir)).filter(name => /^browser-login(?:-[\w-]+)?\.bat$/.test(name));
if (checkOnly) {
  console.log('PASS: browser MCP entries, JSONC syntax and existing profile verified. No configuration, profile, startup or runtime changes made.');
  process.exit(0);
}
await mkdir(backup, { recursive: true });
await writeFile(join(backup,'browser-mcp-before.json'), JSON.stringify({ mcp:Object.fromEntries(names.map(n => [n,parsed.mcp[n]])), instructions:parsed.instructions }, null, 2));
for (const name of ['browser-shared-chrome.bat','browser-shared-chrome.ps1','browser-shared-chrome.vbs','browser-shared-chrome.settings.json','browser-profile-rule.md',...loginHelpers]) {
  try { await copyFile(join(configDir,name),join(backup,name)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}
try { await copyFile(join(configDir,'plugins','browser-session-guard.js'),join(backup,'browser-session-guard.js')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
await mkdir(runtime, { recursive:true });
for (const name of ['package.json','package-lock.json','cdp-guard.mjs','mcp-session-server.mjs']) await copyFile(join(source,name),join(runtime,name));
const npmCandidates = [process.env.npm_execpath, join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), join(homedir(),'AppData/Roaming/npm/node_modules/npm/bin/npm-cli.js')].filter(Boolean);
let npmCli;
for (const candidate of npmCandidates) { try { await access(candidate); npmCli = candidate; break; } catch {} }
if (!npmCli) throw new Error('Could not locate npm-cli.js beside Node or in the user npm directory. Locate npm before installing.');
await promisify(execFile)(process.execPath,[npmCli,'ci','--ignore-scripts','--no-audit','--no-fund'],{cwd:runtime,windowsHide:true,timeout:180000,maxBuffer:4096});
await mkdir(join(configDir,'plugins'),{recursive:true});
for (const name of ['browser-shared-chrome.bat','browser-shared-chrome.ps1','browser-shared-chrome.vbs','browser-profile-rule.md']) await copyFile(join(source,name),join(configDir,name));
for (const name of loginHelpers) await copyFile(join(source,'browser-login.bat'),join(configDir,name));
await copyFile(join(source,'browser-session-guard.js'),join(configDir,'plugins','browser-session-guard.js'));
await writeFile(join(configDir,'browser-shared-chrome.settings.json'),JSON.stringify({profilePath},null,2)+'\n');
let updated = original;
for (const name of names) {
  const value = { ...parsed.mcp[name], command:[process.execPath,join(runtime,'mcp-session-server.mjs'),name === 'playwright' ? 'playwright' : 'devtools'],enabled:name !== 'chrome_devtools',timeout:60000 };
  updated = applyEdits(updated,modify(updated,['mcp',name],value,{formattingOptions:{insertSpaces:true,tabSize:2,eol:'\n'}}));
}
const rulePath = join(configDir,'browser-profile-rule.md');
if (!parsed.instructions?.some(p => p.replaceAll('\\','/').toLowerCase() === rulePath.replaceAll('\\','/').toLowerCase())) {
  updated = applyEdits(updated,modify(updated,['instructions'],[...(parsed.instructions||[]),rulePath],{formattingOptions:{insertSpaces:true,tabSize:2,eol:'\n'}}));
}
const final = parse(updated);
const strip = c => { const clone=structuredClone(c); for(const n of names) delete clone.mcp[n]; delete clone.instructions; return clone; };
if (JSON.stringify(strip(final)) !== JSON.stringify(strip(parsed))) throw new Error('An unrelated config entry changed; refusing to save.');
if (await readFile(configPath,'utf8') !== original) throw new Error('Config changed concurrently; re-run the installer after inspection.');
await writeFile(configPath + '.guard-tmp',updated);
await rename(configPath + '.guard-tmp',configPath);
await mkdir(join(source,'artifacts'),{recursive:true});
await writeFile(join(source,'artifacts','installation.json'),JSON.stringify({runtime,backup,configPath,installedAt:new Date().toISOString()},null,2));
console.log('Installed the pinned browser runtime, OpenCode plugin, launcher and scoped MCP configuration. Unrelated settings preserved.');
console.log('Rollback files are in the OpenCode config directory under backups.');
