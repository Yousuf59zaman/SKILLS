// Only newly-created, synthetic localhost tabs are touched on the shared browser.
// Existing target addresses stay in memory; no account/cookie content is printed.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parse } from 'jsonc-parser';
import { cdp, fixtureSite, connectMcp, textOf, root } from './support.mjs';
const configDir = join(homedir(), '.config/opencode');
const config = parse(await readFile(join(configDir,'opencode.jsonc'),'utf8'));
const plugin = await import(pathToFileURL(join(configDir,'plugins/browser-session-guard.js')));
const hook = (await plugin.BrowserSessionGuard())['tool.execute.before'];
const control = await cdp('http://127.0.0.1:9222');
const site = await fixtureSite();
const marker = 'audit-' + randomUUID();
const cookieName = 'opencode_audit_' + randomUUID().replaceAll('-','');
const baseline = new Map((await control.send('Target.getTargets')).targetInfos.filter(t=>t.type==='page').map(t=>[t.targetId,t.url]));
const testTargets = new Set(), clients=[];
let counts;
try {
  const a = await connectMcp(config.mcp.playwright.command.slice(1)); clients.push(a);
  const b = await connectMcp(config.mcp['chrome-devtools'].command.slice(1)); clients.push(b);
  const sessions = [{id:'live-P1',c:a,kind:'playwright'},{id:'live-P2',c:a,kind:'playwright'},{id:'live-D1',c:b,kind:'devtools'},{id:'live-D2',c:b,kind:'devtools'}];
  async function call(s,name,args={}) {
    const output={args:{...args}};
    await hook({tool:`${s.kind==='playwright'?'playwright':'chrome-devtools'}_${name}`,sessionID:marker+s.id},output);
    const r=await s.c.call(name,output.args); assert(!r.isError,textOf(r)); return textOf(r);
  }
  await Promise.all(sessions.map(s=>call(s,s.kind==='playwright'?'browser_navigate':'new_page',{url:`${site.url}/form?test=${marker}&owner=${s.id}`})));
  const targets=(await control.send('Target.getTargets')).targetInfos;
  for(const t of targets) if(t.url.startsWith(site.url)&&t.url.includes(marker)) testTargets.add(t.targetId);
  assert.equal(testTargets.size,4);
  for(const s of sessions) {
    const list=await call(s,s.kind==='playwright'?'browser_tabs':'list_pages',s.kind==='playwright'?{action:'list'}:{});
    assert(list.includes('owner='+s.id));
    for(const other of sessions.filter(x=>x!==s)) assert(!list.includes('owner='+other.id));
  }
  await call(sessions[0],'browser_evaluate',{function:`() => {document.cookie='${cookieName}=synthetic; Path=/; SameSite=Lax'; return true;}`});
  const shared=await call(sessions[1],'browser_evaluate',{function:`() => document.cookie.includes('${cookieName}=synthetic')`});
  assert(shared.includes('true'));
  await call(sessions[0],'browser_evaluate',{function:`() => {document.cookie='${cookieName}=; Path=/; Max-Age=0'; return true;}`});
  await call(sessions[0],'browser_close');
  assert((await fetch('http://127.0.0.1:9222/json/version')).ok);
  const current=new Map((await control.send('Target.getTargets')).targetInfos.filter(t=>t.type==='page').map(t=>[t.targetId,t.url]));
  const unchanged=[...baseline].filter(([id,url])=>current.get(id)===url).length;
  counts={sessions:4,backends:2,createdTestTabs:4,preExistingPages:baseline.size,unchangedPreExistingPages:unchanged,sharedSyntheticCookie:true,chromeSurvivesDisconnect:true};
  assert.equal(unchanged,baseline.size,'A pre-existing page changed during the test; investigate concurrent activity.');
  console.log('PASS: installed runtime, 4 live conversations, both MCP backends, shared test cookie, and pre-existing tabs unchanged.');
} finally {
  await Promise.allSettled(clients.map(c=>c.close()));
  const current=(await control.send('Target.getTargets')).targetInfos;
  for(const t of current) if(!baseline.has(t.targetId)&&t.url.startsWith(site.url)&&t.url.includes(marker)) testTargets.add(t.targetId);
  for(const id of testTargets) {
    const t=current.find(t=>t.targetId===id);
    if(t?.url.startsWith(site.url)&&t.url.includes(marker)) await control.send('Target.closeTarget',{targetId:id}).catch(()=>{});
  }
  const remaining=(await control.send('Target.getTargets')).targetInfos.filter(t=>t.url.startsWith(site.url)&&t.url.includes(marker)).length;
  control.close(); await site.close();
  if(counts) { counts.remainingTestTabs=remaining; await writeFile(join(root,'artifacts','live-result.json'),JSON.stringify(counts,null,2)); }
  assert.equal(remaining,0,'Synthetic test tabs were not cleaned up.');
}
