import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { launchFixtureBrowser, fixtureSite, connectMcp, textOf, cdp, root } from './support.mjs';
import { createGuard } from '../cdp-guard.mjs';
import { BrowserSessionGuard } from '../browser-session-guard.js';

let browser, site, control, pw, pw2, dt;
const clients = [], guards = [], pageIds = new Map();
const hook = (await BrowserSessionGuard())['tool.execute.before'];
const kindFor = id => id.startsWith('D') ? 'devtools' : 'playwright';
const clientFor = id => id.startsWith('D') ? dt : id === 'P4' ? pw2 : pw;
const ids = ['P1', 'P2', 'P3', 'P4', 'D1', 'D2', 'D3', 'D4'];
async function call(id, name, args = {}) {
  const output = { args: { ...args } };
  await hook({ tool: `${kindFor(id) === 'playwright' ? 'playwright' : 'chrome-devtools'}_${name}`, sessionID: id }, output);
  return clientFor(id).call(name, output.args);
}
async function okay(id, name, args) {
  const r = await call(id, name, args);
  assert(!r.isError, `${id} ${name}: ${textOf(r)}`);
  return textOf(r);
}
async function list(id) { return okay(id, kindFor(id) === 'playwright' ? 'browser_tabs' : 'list_pages', kindFor(id) === 'playwright' ? { action: 'list' } : {}); }
async function evaluate(id, fn) {
  return okay(id, kindFor(id) === 'playwright' ? 'browser_evaluate' : 'evaluate_script', kindFor(id) === 'playwright' ? { function: fn } : { function: fn, pageId: pageIds.get(id) });
}
before(async () => {
  browser = await launchFixtureBrowser(); site = await fixtureSite(); control = await cdp(browser.endpoint);
  const env = { OPENCODE_BROWSER_CDP_ENDPOINT: browser.endpoint };
  [pw, pw2, dt] = await Promise.all(['playwright', 'playwright', 'devtools'].map(async kind => {
    const c = await connectMcp([join(root, 'mcp-session-server.mjs'), kind], env); clients.push(c); return c;
  }));
});
after(async () => {
  await Promise.allSettled(clients.map(c => c.close()));
  await Promise.allSettled(guards.map(g => g.close()));
  control?.close(); await browser?.close(); await site?.close();
});

test('host plugin overrides a model-supplied identity and ignores unrelated tools', async () => {
  for (const prefix of ['playwright_', 'chrome-devtools_', 'chrome_devtools_']) {
    const output = { args: { __opencodeSessionId: 'wrong' } };
    await hook({ tool: prefix + 'list_pages', sessionID: 'trusted' }, output);
    assert.equal(output.args.__opencodeSessionId, 'trusted');
  }
  const output = { args: { value: 1 } }; await hook({ tool: 'other_tool', sessionID: 'trusted' }, output);
  assert.deepEqual(output.args, { value: 1 });
});
test('missing conversation identity fails without opening or selecting a tab', async () => {
  const before = (await control.send('Target.getTargets')).targetInfos.length;
  const result = await pw.call('browser_navigate', { url: site.url + '/form?wrong=1' });
  assert(result.isError); assert(textOf(result).includes('Restart OpenCode'));
  assert.equal((await control.send('Target.getTargets')).targetInfos.length, before);
});
test('eight parallel conversations across both MCP backends and multiple processes', async () => {
  await Promise.all(ids.map(async id => {
    const url = site.url + '/form?owner=' + id;
    const result = await okay(id, kindFor(id) === 'playwright' ? 'browser_navigate' : 'new_page', { url });
    if (kindFor(id) === 'devtools') {
      const match = result.match(new RegExp('(\\d+):[^\\n]*owner=' + id)); assert(match, result); pageIds.set(id, Number(match[1]));
    }
  }));
  for (const id of ids) {
    const result = await list(id);
    assert(result.includes('owner=' + id), result);
    for (const other of ids.filter(x => x !== id)) assert(!result.includes('owner=' + other), `${id} saw ${other}`);
  }
});
test('same-site form edits remain independent during simultaneous typing', async () => {
  await Promise.all(ids.map(id => evaluate(id, `() => { document.querySelector('#draft').value = '${id}-draft'; document.querySelector('#save').click(); return document.querySelector('#draft').value; }`)));
  for (const id of ids) assert((await evaluate(id, '() => document.querySelector("#draft").value')).includes(`${id}-draft`));
});
test('one shared login cookie and localStorage remain shared, sessionStorage remains per tab', async () => {
  await evaluate('P1', '() => { document.cookie="audit_shared=synthetic; Path=/; SameSite=Lax"; localStorage.setItem("audit-shared", "synthetic"); return true; }');
  for (const id of ['P2', 'P4', 'D1', 'D4']) {
    const result = await evaluate(id, '() => ({cookie:document.cookie.includes("audit_shared=synthetic"),shared:localStorage.getItem("audit-shared"),draft:sessionStorage.getItem("draft")})');
    assert(result.includes('true') && result.includes('synthetic') && result.includes(id + '-draft'), result);
  }
});
test('popup ownership follows its opener without appearing in other sessions', async () => {
  await evaluate('P1', `() => { window.open('${site.url}/popup?owner=P1-popup', '_blank'); return true; }`);
  await evaluate('D1', `() => { window.open('${site.url}/popup?owner=D1-popup', '_blank'); return true; }`);
  await delay(300);
  assert((await list('P1')).includes('owner=P1-popup'));
  assert((await list('D1')).includes('owner=D1-popup'));
  for (const id of ['P2', 'D2']) { const result = await list(id); assert(!result.includes('-popup'), result); }
});
test('named popups opened by independent conversations do not reuse each other', async () => {
  await evaluate('P2', `() => { window.open('${site.url}/popup?owner=P2-named', 'same-window-name'); return true; }`);
  await evaluate('D2', `() => { window.open('${site.url}/popup?owner=D2-named', 'same-window-name'); return true; }`);
  await delay(300);
  assert((await list('P2')).includes('owner=P2-named'));
  assert((await list('D2')).includes('owner=D2-named'));
  assert(!(await list('P2')).includes('owner=D2-named'));
});
test('stale and foreign page IDs cannot close a different conversation', async () => {
  const before = await list('D3');
  const failure = await call('D1', 'close_page', { pageId: 999999 });
  assert(failure.isError);
  assert.equal(await list('D3'), before);
  const beforePw = await list('P3');
  assert((await call('P1', 'browser_tabs', { action: 'close', index: 99999 })).isError);
  assert.equal(await list('P3'), beforePw);
});
test('closing an owned tab does not shift another conversation tab indices', async () => {
  const before = await list('P3');
  await okay('P1', 'browser_tabs', { action: 'close', index: 1 });
  assert.equal(await list('P3'), before);
  assert((await evaluate('P3', '() => document.querySelector("#draft").value')).includes('P3-draft'));
});
test('disconnect and reconnect preserves other sessions and login', async () => {
  await okay('P1', 'browser_close');
  assert((await fetch(browser.endpoint + '/json/version')).ok);
  assert((await evaluate('D4', '() => document.querySelector("#draft").value')).includes('D4-draft'));
  const tabs = await list('P1'); assert(tabs.includes('owner=P1') && !tabs.includes('owner=P3'));
});
test('external closure of the selected tab never falls back to a foreign tab', async () => {
  const target = (await control.send('Target.getTargets')).targetInfos.find(x => x.url.endsWith('owner=P3'));
  assert(target); await control.send('Target.closeTarget', { targetId: target.targetId });
  const attempt = await call('P3', 'browser_navigate', { url: site.url + '/form?owner=P3-recovered' });
  // Chrome can report the closure between liveness checking and navigation.
  // Fail safely; do not replay unknown mutations or choose another session's tab.
  if (attempt.isError) {
    // CDP may surface closed, detached-frame or ERR_ABORTED depending on event
    // timing. The contract is safe failure and recovery in owned tabs.
    assert(!(await list('P3')).includes('owner=P4'));
    await okay('P3', 'browser_navigate', { url: site.url + '/form?owner=P3-recovered' });
  }
  assert((await list('P3')).includes('owner=P3-recovered'));
  assert((await evaluate('P4', '() => document.querySelector("#draft").value')).includes('P4-draft'));
});
test('redirects keep target ownership', async () => {
  await okay('P3', 'browser_navigate', { url: site.url + '/redirect' });
  assert((await list('P3')).includes('redirected=1'));
  assert(!(await list('P4')).includes('redirected=1'));
});
test('one slow conversation does not serialize the other conversations', async () => {
  const slow = evaluate('P3', 'async () => { await new Promise(r=>setTimeout(r,2000)); return "slow-finished"; }');
  const result = await evaluate('D4', '() => "independent-finished"');
  assert(result.includes('independent-finished'));
  assert((await slow).includes('slow-finished'));
});
test('same-conversation operations are serialized safely', async () => {
  await evaluate('P3', '() => { window.auditCounter = 0; return true; }');
  const [first, second] = await Promise.all([
    evaluate('P3', 'async () => { const old = window.auditCounter; await new Promise(r=>setTimeout(r,500)); window.auditCounter=old+1; return window.auditCounter; }'),
    evaluate('P3', '() => { window.auditCounter++; return window.auditCounter; }')
  ]);
  assert(first.includes('1')); assert(second.includes('2'));
});
test('cancelling a dispatched call keeps later actions serialized until it settles', async () => {
  await evaluate('P3', '() => { window.cancelCounter=0; window.cancelStarted=false; return true; }');
  const target = (await control.send('Target.getTargets')).targetInfos.find(t => t.url.startsWith(site.url) && t.url.includes('redirected=1'));
  const { sessionId } = await control.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  const abort = new AbortController();
  const operation = pw.client.callTool({ name:'browser_evaluate', arguments:{ __opencodeSessionId:'P3', function:'async () => { window.cancelStarted=true; const old=window.cancelCounter; await new Promise(r=>setTimeout(r,1500)); window.cancelCounter=old+1; return window.cancelCounter; }' } }, undefined, { signal:abort.signal, timeout:10000 }).then(()=>false,()=>true);
  try {
    for(let i=0;i<100;i++) {
      const state=await control.send('Runtime.evaluate',{expression:'window.cancelStarted',returnByValue:true},sessionId);
      if(state.result.value) break;
      await delay(20);
    }
    abort.abort(); assert(await operation);
    const next=await evaluate('P3','() => { window.cancelCounter++; return window.cancelCounter; }');
    assert(next.includes('2'),next);
  } finally { await control.send('Target.detachFromTarget',{sessionId}).catch(()=>{}); }
});
test('a cancelled queued action never executes', async () => {
  await evaluate('P3','() => { window.queuedCancelled=false; window.queueBlockStarted=false; return true; }');
  const target=(await control.send('Target.getTargets')).targetInfos.find(t=>t.url.startsWith(site.url)&&t.url.includes('redirected=1'));
  const {sessionId}=await control.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
  const blocker=evaluate('P3','async () => { window.queueBlockStarted=true; await new Promise(r=>setTimeout(r,1500)); return true; }');
  try {
    let started=false;
    for(let i=0;i<100;i++) {
      const state=await control.send('Runtime.evaluate',{expression:'window.queueBlockStarted',returnByValue:true},sessionId);
      if(state.result.value) { started=true; break; }
      await delay(20);
    }
    assert(started,'Queue blocker did not start');
    const abort=new AbortController();
    const cancelled=pw.client.callTool({name:'browser_evaluate',arguments:{__opencodeSessionId:'P3',function:'() => {window.queuedCancelled=true; return true;}'}},undefined,{signal:abort.signal,timeout:10000}).catch(()=>null);
    await delay(50); abort.abort(); await cancelled; await blocker;
    assert((await evaluate('P3','() => window.queuedCancelled')).includes('false'));
  } finally { await control.send('Target.detachFromTarget',{sessionId}).catch(()=>{}); }
});
test('native snapshots and form tools operate on each conversation own page', async () => {
  const pwSnapshot = await okay('P4', 'browser_snapshot');
  const pwRef = pwSnapshot.match(/textbox "Draft"[^\n]*\[ref=([^\]]+)\]/);
  assert(pwRef, pwSnapshot);
  await okay('P4', 'browser_type', { target: pwRef[1], text: 'native-pw-value' });
  const dtSnapshot = await okay('D4', 'take_snapshot', { pageId: pageIds.get('D4') });
  const dtRef = dtSnapshot.match(/uid=(\S+)[^\n]*textbox "Draft"/);
  assert(dtRef, dtSnapshot);
  await okay('D4', 'fill', { pageId: pageIds.get('D4'), uid: dtRef[1], value: 'native-dt-value' });
  assert((await evaluate('P4', '() => document.querySelector("#draft").value')).includes('native-pw-value'));
  assert((await evaluate('D4', '() => document.querySelector("#draft").value')).includes('native-dt-value'));
});
test('a modal dialog in one conversation does not block another', async () => {
  await okay('P3', 'browser_evaluate', { function: '() => { setTimeout(()=>alert("fixture-dialog"),50); return true; }' });
  await delay(100);
  try { assert((await evaluate('D4', '() => "dialog-independent"')).includes('dialog-independent')); }
  finally { await okay('P3', 'browser_handle_dialog', { accept: true }); }
});
test('screenshot image responses survive MCP forwarding', async () => {
  const result = await call('P4', 'browser_take_screenshot', { type: 'png' });
  assert(!result.isError, textOf(result));
  assert(result.content.some(c => c.type === 'image' && c.data.length > 0), 'No screenshot image returned');
});
test('CDP ownership rejects foreign navigation handles, browser shutdown, cookies and profile clearing', async () => {
  const guard = await createGuard(browser.endpoint); guards.push(guard);
  const guarded = await cdp(guard.endpoint);
  try {
    const targets = await guarded.send('Target.getTargets'); assert.equal(targets.targetInfos.length, 0);
    const foreign = (await control.send('Target.getTargets')).targetInfos.find(x => x.url.includes('owner=P4'));
    for (const [method, params] of [
      ['Target.closeTarget', { targetId: foreign.targetId }], ['Target.attachToTarget', { targetId: foreign.targetId, flatten: true }],
      ['Browser.close', {}], ['Storage.clearCookies', {}], ['Network.clearBrowserCookies', {}], ['Browser.setWindowBounds', { windowId: 1, bounds: { width: 800 } }]
    ]) await assert.rejects(guarded.send(method, params), /Session guard/);
    assert((await evaluate('P4', '() => document.cookie.includes("audit_shared=synthetic")')).includes('true'));
  } finally { guarded.close(); }
});
test('upstream browser restart recovers both backends without restoring stale ownership', async () => {
  const oldProfile = browser.profile, port = new URL(browser.endpoint).port;
  await browser.close(); control.close();
  browser = await launchFixtureBrowser({ profile: oldProfile, port }); control = await cdp(browser.endpoint);
  // Fresh manual sentinel belongs to no guarded conversation.
  await control.send('Target.createTarget', { url: site.url + '/form?owner=manual-sentinel' });
  await delay(500);
  for (const id of ['P3', 'D3']) {
    let result = await call(id, kindFor(id) === 'playwright' ? 'browser_navigate' : 'new_page', { url: site.url + '/form?owner=' + id + '-restarted' });
    // A disconnect may surface once; explicit retry only after observing the failure.
    if (result.isError) result = await call(id, kindFor(id) === 'playwright' ? 'browser_navigate' : 'new_page', { url: site.url + '/form?owner=' + id + '-restarted' });
    assert(!result.isError, textOf(result));
    const tabs = await list(id); assert(tabs.includes(id + '-restarted') && !tabs.includes('manual-sentinel'), tabs);
  }
});
