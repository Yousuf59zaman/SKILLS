import assert from 'node:assert/strict';
import { join } from 'node:path';
import { launchFixtureBrowser, fixtureSite, connectMcp, textOf, root } from './support.mjs';
import { BrowserSessionGuard } from '../browser-session-guard.js';
const browser = await launchFixtureBrowser();
const site = await fixtureSite();
const clients = [];
const hook = (await BrowserSessionGuard())['tool.execute.before'];
try {
  for (const kind of ['playwright', 'devtools']) {
    const c = await connectMcp([join(root, 'mcp-session-server.mjs'), kind], { OPENCODE_BROWSER_CDP_ENDPOINT: browser.endpoint }); clients.push(c);
    const list = await c.client.listTools();
    assert(list.tools.length > 10);
    console.log(kind, 'schema', list.tools.length, 'tools');
    const call = async (id, name, args) => {
      const output = { args: { ...args } };
      await hook({ tool: `${kind === 'playwright' ? 'playwright' : 'chrome-devtools'}_${name}`, sessionID: id }, output);
      return c.call(name, output.args);
    };
    const results = await Promise.all(['A', 'B'].map(id => call(id, kind === 'playwright' ? 'browser_navigate' : 'new_page', { url: site.url + '/form?owner=' + id })));
    for (const r of results) assert(!r.isError, textOf(r));
    for (const id of ['A', 'B']) {
      const result = textOf(await call(id, kind === 'playwright' ? 'browser_tabs' : 'list_pages', kind === 'playwright' ? { action: 'list' } : {}));
      assert(result.includes('owner=' + id), result);
      assert(!result.includes('owner=' + (id === 'A' ? 'B' : 'A')), result);
    }
    console.log(kind, 'two conversations in one MCP process: PASS');
  }
} finally {
  await Promise.allSettled(clients.map(c => c.close()));
  await browser.close(); await site.close();
}
