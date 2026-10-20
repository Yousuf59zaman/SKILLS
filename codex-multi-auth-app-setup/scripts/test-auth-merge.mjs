import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const modern=fs.readFileSync(path.join(here,'apply-setup.mjs'),'utf8');
const legacy=fs.readFileSync(path.join(here,'apply-refresh-guard.mjs'),'utf8');
function literal(source,name){const start=source.indexOf('const '+name+' = `');assert.ok(start>=0);const end=source.indexOf('\n`;',start);assert.ok(end>start);const box={};vm.runInNewContext(source.slice(start,end+3)+'\nglobalThis.value='+name+';',box);return box.value;}
const capture=literal(modern,'CAPTURE_HELPER');
const helpers=['COMMON_HELPERS','MODULAR_PERSIST_HELPERS','MODULAR_AUTOSYNC_HELPERS'];
function fixture(code,entry){
 const snap={accountId:'synthetic-account',email:'fixture@example.invalid',refreshToken:'dummy-new-refresh',accessToken:'dummy-new-access',expiresAt:123456};
 const storage={accounts:[{accountId:'synthetic-account',email:'fixture@example.invalid',refreshToken:'dummy-old-refresh',accessToken:'dummy-old-access',expiresAt:1}],activeIndex:0};
 const state={accounts:[snap],activeAccountId:snap.accountId};let saves=0;
 const match=(accounts,candidate)=>{let found=accounts.map((a,i)=>({a,i})).filter(({a})=>(candidate.accountId&&a.accountId===candidate.accountId)||(candidate.email&&a.email===candidate.email)||(candidate.refreshToken&&a.refreshToken===candidate.refreshToken));return found.length===1?found[0].i:undefined;};
 const box={structuredClone,loadCodexCliState:async()=>state,findMatchingAccountIndex:match,sanitizeEmail:v=>typeof v==='string'?v.trim().toLowerCase():undefined,extractAccountId:()=>undefined,applyTokenAccountIdentity:(a,id)=>{if(id&&a.accountIdSource!=='org'&&a.accountId!==id){a.accountId=id;return true;}return false;},saveAccounts:async()=>{saves++;},saveAccountsWithRetry:async()=>{saves++;},withAccountStorageTransaction:async cb=>cb(storage,async()=>{saves++;})};
 vm.runInNewContext(code.replace('export async function','async function')+'\nglobalThis.execute='+entry+';',box);
 return {snap,state,storage,run:box.execute,saves:()=>saves};
}
test('modern capture updates rotated credentials on matched existing account',async()=>{const f=fixture(capture,'captureCodexCliAuthIntoStorage');assert.equal(await f.run(f.storage),true);assert.equal(f.storage.accounts[0].refreshToken,f.snap.refreshToken);assert.equal(f.storage.accounts[0].accessToken,f.snap.accessToken);assert.equal(f.storage.accounts[0].expiresAt,f.snap.expiresAt);});
test('modern capture is idempotent',async()=>{const f=fixture(capture,'captureCodexCliAuthIntoStorage');await f.run(f.storage);assert.equal(await f.run(f.storage),false);});
test('modern capture never creates unmatched accounts',async()=>{const f=fixture(capture,'captureCodexCliAuthIntoStorage');f.storage.accounts[0].accountId='other';f.storage.accounts[0].email='other@example.invalid';assert.equal(await f.run(f.storage),false);assert.equal(f.storage.accounts.length,1);});
test('modern empty snapshot cannot erase a stored refresh token',async()=>{const f=fixture(capture,'captureCodexCliAuthIntoStorage');f.snap.refreshToken='';await f.run(f.storage);assert.equal(f.storage.accounts[0].refreshToken,'dummy-old-refresh');});
test('modern organization identity is preserved',async()=>{const f=fixture(capture,'captureCodexCliAuthIntoStorage');f.storage.accounts[0].accountId='org-fixture';f.storage.accounts[0].accountIdSource='org';await f.run(f.storage);assert.equal(f.storage.accounts[0].accountId,'org-fixture');});
test('modern missing snapshot does not mutate storage',async()=>{const f=fixture(capture,'captureCodexCliAuthIntoStorage');f.state.accounts=[];const before=JSON.stringify(f.storage);assert.equal(await f.run(f.storage),false);assert.equal(JSON.stringify(f.storage),before);});
for(const name of helpers){
 test(name+' captures complete auth snapshot',async()=>{const f=fixture(literal(legacy,name),'importCurrentCodexAuthIntoStorage');const r=await f.run(f.storage,{persist:true});assert.equal(r.changed,true);assert.equal(f.storage.accounts[0].refreshToken,f.snap.refreshToken);assert.equal(f.storage.accounts[0].accessToken,f.snap.accessToken);if(name!=='MODULAR_PERSIST_HELPERS')assert.equal(f.saves(),1);});
 test(name+' refuses incomplete auth snapshot',async()=>{const f=fixture(literal(legacy,name),'importCurrentCodexAuthIntoStorage');f.snap.accessToken='';const before=JSON.stringify(f.storage);assert.equal((await f.run(f.storage)).changed,false);assert.equal(JSON.stringify(f.storage),before);});
 test(name+' does not create or overwrite unmatched account',async()=>{const f=fixture(literal(legacy,name),'importCurrentCodexAuthIntoStorage');f.storage.accounts[0].accountId='other';f.storage.accounts[0].email='other@example.invalid';const before=JSON.stringify(f.storage);assert.equal((await f.run(f.storage)).changed,false);assert.equal(JSON.stringify(f.storage),before);});
}
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cma-merge-fixture-'));
function packageFixture(version){const p=path.join(tmp,version);fs.mkdirSync(path.join(p,'dist','lib'),{recursive:true});fs.writeFileSync(path.join(p,'package.json'),JSON.stringify({version,type:'module'}));fs.writeFileSync(path.join(p,'dist','lib','codex-manager.js'),'// synthetic unpatched source\n');return p;}
const home=path.join(tmp,'synthetic-home');fs.mkdirSync(home);fs.writeFileSync(path.join(home,'auth.json'),'SYNTHETIC SENTINEL ONLY');
function runGuard(pkg,args=[]){return spawnSync(process.execPath,[path.join(here,'apply-refresh-guard.mjs'),'--package-root',pkg,'--codex-home',home,...args],{encoding:'utf8',env:{...process.env,CODEX_HOME:home,CODEX_CLI_AUTH_PATH:path.join(home,'auth.json'),CODEX_CLI_ACCOUNTS_PATH:path.join(home,'accounts.json')},timeout:10000});}
test('legacy default invocation is read-only',()=>{const pkg=packageFixture('2.3.0'),before=fs.readFileSync(path.join(pkg,'dist/lib/codex-manager.js'),'utf8');const r=runGuard(pkg);assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/changedFiles=0/);assert.equal(fs.readFileSync(path.join(pkg,'dist/lib/codex-manager.js'),'utf8'),before);assert.deepEqual(fs.readdirSync(home),['auth.json']);});
test('legacy guard refuses newer 2.19.1 even with apply',()=>{const r=runGuard(packageFixture('2.19.1'),['--apply']);assert.equal(r.status,1);assert.match(r.stderr,/Legacy guard refuses/);assert.deepEqual(fs.readdirSync(home),['auth.json']);});
test('legacy guard refuses unknown major versions',()=>{const r=runGuard(packageFixture('3.0.0'),['--apply']);assert.equal(r.status,1);assert.match(r.stderr,/Legacy guard refuses/);});
test('legacy copied-auth verifier requires explicit auth-read authorization',()=>{const r=runGuard(packageFixture('2.2.0'),['--verify-temp']);assert.equal(r.status,1);assert.match(r.stderr,/requires authorized/);assert.deepEqual(fs.readdirSync(home),['auth.json']);});
test('conflicting apply/check flags fail before changes',()=>{const r=runGuard(packageFixture('2.3.1'),['--apply','--check-only']);assert.equal(r.status,1);assert.match(r.stderr,/not both/);});
test('all three legacy integration points remain present',()=>{for(const marker of ['monolithic switch pre-import','monolithic app startup import','monolithic drift-sync import','modular persist pre-import','modular app startup import','modular menu drift-sync import'])assert.ok(legacy.includes(marker));});
test('modern switch and same-account capture branches remain present',()=>{assert.ok(modern.includes('storage.activeIndex !== targetIndex'));assert.ok(modern.includes('storage.activeIndex === targetIndex'));assert.ok(modern.includes('SHARED-CANONICAL-REVISION'));assert.ok(modern.includes('refusing to downgrade'));});
test('modern script directory uses safe file URL conversion',()=>assert.ok(modern.includes('path.dirname(fileURLToPath(import.meta.url))')));
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
