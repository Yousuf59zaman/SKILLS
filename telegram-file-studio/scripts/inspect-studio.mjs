#!/usr/bin/env node
// Read-only project inspection. Never print credentials, file contents or logs.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
const API_ROOT = 'http://127.0.0.1:8081';
const REQUIRED = ['bot.js','runtime.mjs','supervisor.js','setup.ps1','bootstrap.mjs',
  'docker-compose.yml','start-hidden.vbs','studio-v2/main.mjs','studio-v2/services.mjs',
  'studio-v2/toolbox/worker.py','studio-v2/toolbox/Dockerfile','bin/yt-dlp.exe','bin/ffmpeg.exe'];
function readEnv(file) {
  const values = Object.create(null), duplicates = [];
  let present = false;
  try {
    const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''); present = true;
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim() || line.trimStart().startsWith('#')) continue;
      const m = line.match(/^([A-Z_]+)=(.*)$/); if (!m) continue;
      if (Object.hasOwn(values,m[1])) duplicates.push(m[1]);
      values[m[1]] = m[2].trim();
    }
  } catch {}
  return {values, duplicates, present};
}
function load(project) {
  const a = readEnv(path.join(project,'.env')), b = readEnv(path.join(project,'.telegram-api.env'));
  const c = {...a.values,...b.values};
  const checks = {
    botToken: /^\d+:[A-Za-z0-9_-]+$/.test(c.BOT_TOKEN || ''),
    ownerId: /^\d+$/.test(c.OWNER_ID || ''),
    apiId: /^\d+$/.test(c.TELEGRAM_API_ID || ''),
    apiHash: /^[a-f\d]{32}$/i.test(c.TELEGRAM_API_HASH || ''),
    loopbackApi: c.BOT_API_ROOT === API_ROOT,
    uniqueKeys: a.duplicates.length === 0 && b.duplicates.length === 0
  };
  return {c, checks, present:{main:a.present,telegramApi:b.present}};
}
export function inspectProject(input) {
  const project = path.resolve(input), {checks,present} = load(project);
  const exists = fs.existsSync(project) && fs.statSync(project).isDirectory();
  const report = {readOnly:true,checkedAt:new Date().toISOString(),project,projectExists:exists,
    missingFiles:REQUIRED.filter(f=>!fs.existsSync(path.join(project,f))),
    config:{filesPresent:present,checks,valid:Object.values(checks).every(Boolean)},
    processes:{},recordedRelease:null,sourceHashes:[]};
  for (const name of ['supervisor','bot']) {
    let pid,alive=false;
    try { pid=Number(fs.readFileSync(path.join(project,'state',name+'.pid'),'utf8').trim());
      if (process.platform==='win32' && Number.isSafeInteger(pid) && pid>0) {process.kill(pid,0);alive=true;}
    } catch {}
    report.processes[name]={pidRecorded:Number.isSafeInteger(pid)&&pid>0,pidAlive:alive,
      identityVerified:false,note:'Verify executable/command line before acting on a recorded PID.'};
  }
  try {
    const release = JSON.parse(fs.readFileSync(path.join(project,'studio-v2','release.json'),'utf8'));
    report.recordedRelease={version:release.version,deployedAt:release.deployedAt,
      totalAutomatedChecks:release.totalAutomatedChecks,recordedLiveResize:release.liveTest?.resize===true,
      recordedLiveUpload:release.liveTest?.telegramUpload===true,liveTestAt:release.liveTest?.checkedAt};
    for (const [name,expected] of Object.entries(release.sourceSha256 || {})) {
      const target=path.resolve(project,name);
      if (!target.startsWith(project+path.sep) || !/^[a-f\d]{64}$/i.test(String(expected))) continue;
      let matches=false;
      try { matches=createHash('sha256').update(fs.readFileSync(target)).digest('hex')===expected; } catch {}
      report.sourceHashes.push({file:name,matchesRecordedRelease:matches});
    }
  } catch {}
  return report;
}
async function run(project,args) {
  try { const r=await exec('docker',args,{cwd:project,windowsHide:true,timeout:20000,maxBuffer:1024*1024});
    return {ok:true,stdout:r.stdout};
  } catch { return {ok:false,stdout:''}; }
}
export async function probeLive(project,report) {
  if (process.platform!=='win32') throw new Error('Live checks must run on the authorized Windows PC.');
  const c=load(project).c;
  const engine=await run(project,['info','--format','{{.ServerVersion}}']);
  const live={dockerResponsive:engine.ok,converterImagePresent:false,localMode:false,telegramResponsive:false};
  if (engine.ok) {
    live.converterImagePresent=(await run(project,['image','inspect','telegram-video-studio:2','--format','{{.Id}}'])).ok;
    if (report.config.valid) {
      const service=await run(project,['compose','--env-file','.telegram-api.env','ps','-q','telegram-api']);
      const id=service.stdout.trim().split(/\r?\n/)[0];
      if (/^[a-f\d]{12,64}$/.test(id)) {
        const proc=await run(project,['exec',id,'cat','/proc/1/cmdline']);
        live.localMode=/(?:^|\s)--local(?:\s|$)/.test(proc.stdout.replaceAll('\0',' '));
      }
    }
  }
  // No redirect following: never forward a bot credential away from the loopback API.
  if (report.config.valid && c.BOT_API_ROOT===API_ROOT) {
    try {
      const response=await fetch(API_ROOT+'/bot'+c.BOT_TOKEN+'/getMe',{
        method:'POST',headers:{'content-type':'application/json'},body:'{}',redirect:'error',
        signal:AbortSignal.timeout(12000)});
      const value=await response.json();
      live.telegramResponsive=value.ok===true && value.result?.is_bot===true;
      if(live.telegramResponsive) live.botUsername=value.result.username;
    } catch { live.telegramIssue='Local Telegram identity check failed; no secrets or response body displayed.'; }
  }
  return {...report,live};
}
async function main() {
  let project=process.platform==='win32'?'G:\\TelegramVideoBot':null,live=false;
  const argv=process.argv.slice(2);
  for(let i=0;i<argv.length;i++) {
    if(argv[i]==='--project'&&argv[i+1]) project=argv[++i];
    else if(argv[i]==='--live') live=true;
    else if(argv[i]==='--help') {console.log('Usage: node inspect-studio.mjs --project <project-dir> [--live]');return;}
    else throw new Error('Unknown or incomplete option. Use --help.');
  }
  if(!project) throw new Error('Specify --project; live Windows project paths are not container paths.');
  let report=inspectProject(project);
  if(live) report=await probeLive(path.resolve(project),report);
  console.log(JSON.stringify(report,null,2));
  if(!report.projectExists||!report.config.valid||report.missingFiles.length) process.exitCode=1;
  if(live&&(!report.live.dockerResponsive||!report.live.converterImagePresent||!report.live.localMode||!report.live.telegramResponsive)) process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(()=>{console.error('Inspection could not complete. Check --help and authorized project access. No secrets displayed.');process.exitCode=1;});
}
