// Restores only the browser settings captured by this installer.
// Run --check first to validate the selected local backup without changes.
import { readFile, writeFile, rename, copyFile, readdir, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { parse, modify, applyEdits } from 'jsonc-parser';
const check = process.argv.includes('--check');
const configDir = resolve(homedir(),'.config','opencode');
const argument = process.argv.slice(2).find(x=>!x.startsWith('--'));
if(!argument) throw new Error('Provide one backup folder from the OpenCode config backups directory.');
const backup = resolve(argument), backupRoot = join(configDir,'backups');
const rel = relative(backupRoot,backup);
if(!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Backup must be a child of the OpenCode config backups directory.');
const before = JSON.parse(await readFile(join(backup,'browser-mcp-before.json'),'utf8'));
const configPath = join(configDir,'opencode.jsonc');
const original = await readFile(configPath,'utf8'), errors=[];
parse(original,errors,{allowTrailingComma:true});
if(errors.length) throw new Error('Current config has syntax errors; restore stopped.');
let updated=original;
for(const name of ['playwright','chrome-devtools','chrome_devtools']) {
  if(!before.mcp?.[name]) throw new Error(`Backup is missing ${name}.`);
  updated=applyEdits(updated,modify(updated,['mcp',name],before.mcp[name],{formattingOptions:{insertSpaces:true,tabSize:2,eol:'\n'}}));
}
const files=(await readdir(backup)).filter(n=>n==='browser-profile-rule.md'||/^browser-(?:shared-chrome|login(?:-[\w-]+)?)\.(?:bat|ps1|vbs)$/.test(n)||n==='browser-shared-chrome.settings.json');
if(!files.includes('browser-profile-rule.md')||!files.includes('browser-shared-chrome.bat')) throw new Error('Backup is incomplete.');
if(check) {
  console.log('Backup validated; browser MCP entries and original launcher/rules can be restored without altering other settings. No changes made.');
} else {
  if(await readFile(configPath,'utf8')!==original) throw new Error('Config changed concurrently; restore stopped.');
  await writeFile(configPath+'.restore-tmp',updated); await rename(configPath+'.restore-tmp',configPath);
  for(const name of files) await copyFile(join(backup,name),join(configDir,name));
  const plugin=join(configDir,'plugins','browser-session-guard.js');
  if((await readdir(backup)).includes('browser-session-guard.js')) await copyFile(join(backup,'browser-session-guard.js'),plugin);
  else { try { await access(plugin); await rename(plugin,plugin+'.disabled-'+Date.now()); } catch(e) { if(e.code!=='ENOENT') throw e; } }
  if((await readdir(backup)).includes('OpenCode-Shared-Chrome.lnk')) await copyFile(join(backup,'OpenCode-Shared-Chrome.lnk'),join(process.env.APPDATA,'Microsoft/Windows/Start Menu/Programs/Startup/OpenCode-Shared-Chrome.lnk'));
  console.log('Original browser configuration restored. Shared Chrome was left running. Restart OpenCode to load the restored settings.');
}
