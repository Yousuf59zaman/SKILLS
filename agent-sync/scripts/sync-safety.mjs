import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const ownAliases=fileURLToPath(new URL('../../skill-manager/references/skill-aliases.json',import.meta.url));
export function readAliases(file){
 const aliases=JSON.parse(fs.readFileSync(file,'utf8'));
 if(!aliases||Array.isArray(aliases)||typeof aliases!=='object')throw Error('Invalid skill alias map');
 const id=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
 for(const [old,current]of Object.entries(aliases))if(!id.test(old)||typeof current!=='string'||!id.test(current)||old===current||Object.hasOwn(aliases,current))throw Error('Invalid or chained skill alias');
 return aliases;
}
export function assertSafeSkillApply(opts){
 if(!opts.apply)return;
 const roots=[...new Set([...Object.values(opts.roots||{}),opts.githubWorktree].filter(Boolean).map(p=>path.resolve(p)))];
 const maps=[opts.aliasMapPath,ownAliases,...roots.map(r=>path.join(r,'skill-manager/references/skill-aliases.json'))].filter(p=>p&&fs.existsSync(p));
 if(!maps.length)throw Error('Skill alias map missing; inspect consolidation before applying sync.');
 const aliases={};
 for(const file of maps)for(const [old,current]of Object.entries(readAliases(file))){if(aliases[old]&&aliases[old]!==current)throw Error('Conflicting skill aliases; manual review required.');aliases[old]=current;}
 const retired=[];
 for(const root of roots)for(const old of Object.keys(aliases))if(['SKILL.md','skill.md'].some(f=>fs.existsSync(path.join(root,old,f))))retired.push(path.join(root,old));
 if(retired.length)throw Error(`Retired skill entrypoints detected (${retired.length}); refusing ALL sync writes. Back up and reconcile aliases before retrying. No automatic deletion or reimport.`);
 for(const root of roots)if(fs.existsSync(root))assertSafeGitHooks(root,['pull']);
}
export function assertSafeGitHooks(root,args){
 if(!['pull','checkout','switch','commit','merge','rebase','worktree'].includes(args[0]))return;
 const run=a=>spawnSync('git',['-C',root,...a],{encoding:'utf8',windowsHide:true,timeout:10000});
 const common=run(['rev-parse','--path-format=absolute','--git-common-dir']);
 if(common.status!==0){if(fs.existsSync(path.join(root,'.git')))throw Error('Cannot inspect Git hook ownership; refusing mutation.');return;}
 const config=run(['config','--get','core.hooksPath']);
 if(config.status!==0&&config.status!==1)throw Error('Cannot inspect Git hook configuration; refusing mutation.');
 const top=run(['rev-parse','--show-toplevel']);
 if(top.status!==0)throw Error('Cannot resolve worktree for hook inspection.');
 const configured=(config.stdout||'').trim();
 const hooks=configured?path.resolve(top.stdout.trim(),configured):path.join(common.stdout.trim(),'hooks');
 for(const name of ['post-checkout','post-merge','post-commit']){
  const file=path.join(hooks,name);if(!fs.existsSync(file))continue;
  if(/Auto-sync Claude\/Gemini skills|sync-skills\.(?:ps1|cmd|vbs)/i.test(fs.readFileSync(file,'utf8')))throw Error('Legacy automatic skill-sync hook detected: '+name+'. Back it up and disable only that automation before continuing.');
 }
}
