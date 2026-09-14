import assert from 'node:assert/strict';
import { createGuard } from '../cdp-guard.mjs';
import { launchFixtureBrowser, fixtureSite, connectMcp, pwCli, dtCli, textOf } from './support.mjs';
const browser = await launchFixtureBrowser();
const site = await fixtureSite();
const guards = [], clients = [];
try {
  for (const kind of ['playwright', 'devtools']) {
    const guard = await createGuard(browser.endpoint); guards.push(guard);
    const c = await connectMcp(kind === 'playwright' ? [pwCli, '--cdp-endpoint', guard.endpoint] : [dtCli, `--browserUrl=${guard.endpoint}`, '--no-usage-statistics']); clients.push(c);
    console.log(kind, 'connected');
    const r = await c.call(kind === 'playwright' ? 'browser_navigate' : 'new_page', { url: site.url + '/form?owner=' + kind });
    console.log(kind, 'navigate', r.isError ? textOf(r) : 'PASS', JSON.stringify(guard.stats));
    assert(!r.isError, textOf(r));
    const list = await c.call(kind === 'playwright' ? 'browser_tabs' : 'list_pages', kind === 'playwright' ? { action: 'list' } : {});
    console.log(kind, 'list', textOf(list));
  }
} finally {
  await Promise.allSettled(clients.map(c => c.close()));
  await Promise.allSettled(guards.map(g => g.close()));
  await browser.close(); await site.close();
}
