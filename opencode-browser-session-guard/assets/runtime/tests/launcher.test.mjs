import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir } from 'node:fs/promises';
import http from 'node:http';
import { once } from 'node:events';
import { join } from 'node:path';
import { root, cdp, launchFixtureBrowser } from './support.mjs';
const exec = promisify(execFile);
const script = join(root, 'browser-shared-chrome.ps1');
async function freePort() {
  const server = http.createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; await new Promise(r => server.close(r)); return port;
}
async function launch(profile, port) {
  return exec('powershell.exe', ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-ProfilePath',profile,'-Port',String(port),'-Headless'], { windowsHide: true, timeout: 45000 });
}
test('four simultaneous cold launches with spaces in profile path create one browser', async () => {
  await mkdir(join(root, 'artifacts'), { recursive: true });
  const profile = await mkdtemp(join(root, 'artifacts', 'launcher profile '));
  const port = await freePort();
  let control;
  try {
    const launches = await Promise.all([1,2,3,4].map(() => launch(profile, port)));
    assert.equal(launches.filter(r => r.stdout.includes('started and verified')).length, 1);
    assert.equal(launches.filter(r => r.stdout.includes('ready')).length, 3);
    control = await cdp(`http://127.0.0.1:${port}`);
    const before = (await control.send('Target.getTargets')).targetInfos.filter(t => t.type === 'page').length;
    await launch(profile, port);
    assert.equal((await control.send('Target.getTargets')).targetInfos.filter(t => t.type === 'page').length, before);
  } finally { if (control) { await control.send('Browser.close').catch(() => {}); control.close(); } }
});
test('a responding HTTP server cannot masquerade as the shared Chrome profile', async () => {
  const server = http.createServer((req,res) => { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ Browser:'fake',webSocketDebuggerUrl:'ws://127.0.0.1:9222/devtools/browser/fake' })); });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  try { await assert.rejects(launch(join(root,'artifacts','unused profile'),server.address().port), /different process\/profile/); }
  finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
});
test('a profile already open on another port is left intact and reports a clear error', async () => {
  const browser = await launchFixtureBrowser();
  try {
    await assert.rejects(launch(browser.profile, await freePort()), /already open\s+without a healthy debugging endpoint/);
    assert((await fetch(browser.endpoint + '/json/version')).ok);
  } finally { await browser.close(); }
});
