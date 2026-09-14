import assert from 'node:assert/strict';
import { launchFixtureBrowser, fixtureSite, connectMcp, pwCli, textOf, cdp } from './support.mjs';
const browser = await launchFixtureBrowser();
const site = await fixtureSite();
const clients = [];
try {
  const control = await cdp(browser.endpoint);
  const a = await connectMcp([pwCli, '--cdp-endpoint', browser.endpoint]); clients.push(a);
  const b = await connectMcp([pwCli, '--cdp-endpoint', browser.endpoint]); clients.push(b);
  await a.call('browser_navigate', { url: site.url + '/form?owner=A' });
  await b.call('browser_navigate', { url: site.url + '/form?owner=B' });
  const aUrl = textOf(await a.call('browser_evaluate', { function: '() => location.href' }));
  assert(aUrl.includes('owner=B'));
  console.log('REPRODUCED: a second MCP connection silently navigates the first session tab.');
  await a.call('browser_tabs', { action: 'new', url: site.url + '/form?owner=A2' });
  const bList = textOf(await b.call('browser_tabs', { action: 'list' }));
  assert(bList.includes('owner=A2'));
  console.log('REPRODUCED: session B sees and can select session A tabs.');
  await b.call('browser_tabs', { action: 'new', url: site.url + '/form?owner=B2' });
  const before = (await control.send('Target.getTargets')).targetInfos.filter(x => x.type === 'page').length;
  await b.call('browser_tabs', { action: 'close', index: 1 });
  const after = (await control.send('Target.getTargets')).targetInfos.filter(x => x.type === 'page').length;
  assert.equal(after, before - 1);
  console.log('REPRODUCED: B closes A-owned tab by shared index.');
  await a.call('browser_close');
  assert((await fetch(browser.endpoint + '/json/version')).ok);
  console.log('PASS: installed Playwright browser_close disconnects without killing shared Chrome.');
  control.close();
} finally {
  await Promise.allSettled(clients.map(c => c.close()));
  await browser.close();
  await site.close();
}
