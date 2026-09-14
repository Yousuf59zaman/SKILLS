import { spawn } from 'node:child_process';
import { mkdtemp, readFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import WebSocket from 'ws';

export const root = fileURLToPath(new URL('..', import.meta.url));
export const pwCli = join(root, 'node_modules/@playwright/mcp/cli.js');
export const dtCli = join(root, 'node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js');
export const textOf = result => result.content?.filter(x => x.type === 'text').map(x => x.text).join('\n') ?? '';
export async function connectMcp(args, env = {}) {
  const client = new Client({ name: 'browser-session-audit', version: '1' }, { capabilities: {} });
  const transport = new StdioClientTransport({ command: process.execPath, args, env: { ...process.env, ...env }, stderr: 'pipe' });
  let errors = '';
  transport.stderr?.on('data', b => { errors = (errors + b).slice(-4000); });
  await client.connect(transport, { timeout: 30000 });
  return { client, transport, errors: () => errors, call: (name, args = {}) => client.callTool({ name, arguments: args }, undefined, { timeout: 45000 }), close: () => client.close() };
}
export async function cdp(endpoint) {
  const version = await fetch(`${endpoint}/json/version`).then(r => r.json());
  const socket = new WebSocket(version.webSocketDebuggerUrl);
  await once(socket, 'open');
  let next = 0;
  const pending = new Map();
  socket.on('message', b => {
    const m = JSON.parse(String(b));
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    clearTimeout(p.timer);
    m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
  });
  socket.on('close', () => {
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('CDP disconnected')); }
    pending.clear();
  });
  return {
    socket,
    send(method, params = {}, sessionId) {
      return new Promise((resolve, reject) => {
        const id = ++next;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    },
    close() { socket.close(); }
  };
}
export async function launchFixtureBrowser(options = {}) {
  await mkdir(join(root, 'artifacts'), { recursive: true });
  const profile = options.profile || await mkdtemp(join(root, 'artifacts', 'chrome-'));
  const executable = join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe');
  const proc = spawn(executable, [`--user-data-dir=${profile}`, `--remote-debugging-port=${options.port || 0}`, '--remote-debugging-address=127.0.0.1', '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let endpoint;
  for (let i = 0; i < 150; i++) {
    try { const port = options.port || (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; endpoint = `http://127.0.0.1:${port}`; if ((await fetch(`${endpoint}/json/version`)).ok) break; } catch {}
    await delay(100);
  }
  if (!endpoint) { proc.kill(); throw new Error('Fixture Chrome did not start'); }
  return { endpoint, proc, profile, async close() { try { const connection = await cdp(endpoint); await connection.send('Browser.close'); connection.close(); } catch {} if (proc.exitCode === null) await Promise.race([once(proc, 'exit'), delay(3000)]); if (proc.exitCode === null) proc.kill(); } };
}
export async function fixtureSite() {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/redirect')) { res.writeHead(302, { Location: '/form?redirected=1' }); res.end(); return; }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><title>Session test</title><h1>Browser session fixture</h1>
      <label>Draft <input aria-label="Draft" id="draft"></label><button id="save" onclick="sessionStorage.setItem('draft',draft.value)">Save draft</button>
      <button id="popup" onclick="window.open('/popup','_blank')">Open popup</button>
      <button id="named" onclick="window.open('/popup','shared-name')">Named popup</button>
      <button id="alert" onclick="alert('Test dialog')">Dialog</button><a href="/redirect">Redirect</a>
      <script>document.querySelector('#draft').value=sessionStorage.getItem('draft')||'';</script>`);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
