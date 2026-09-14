import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ListRootsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createGuard } from './cdp-guard.mjs';

const directory = fileURLToPath(new URL('.', import.meta.url));
const kind = process.argv[2];
if (!['playwright', 'devtools'].includes(kind)) throw new Error('Expected playwright or devtools');
const endpoint = process.env.OPENCODE_BROWSER_CDP_ENDPOINT || 'http://127.0.0.1:9222';
const sessions = new Map();
const server = new Server({ name: `opencode-session-${kind}`, version: '1.0.0' }, { capabilities: { tools: {} } });
let shuttingDown = false;
let ensurePromise;
const failure = text => ({ isError: true, content: [{ type: 'text', text }] });
async function ensureBrowser() {
  if (!ensurePromise) ensurePromise = (async () => {
    if (!process.env.OPENCODE_BROWSER_CDP_ENDPOINT) {
      await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(directory, '..', 'browser-shared-chrome.ps1')], { windowsHide: true, timeout: 35000, maxBuffer: 8192 });
    }
    const r = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok || !(await r.json()).webSocketDebuggerUrl) throw new Error('Shared Chrome CDP unavailable.');
  })().finally(() => { ensurePromise = undefined; });
  return ensurePromise;
}
async function probeBrowser() {
  const r = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(2000) });
  if (!r.ok || !(await r.json()).webSocketDebuggerUrl) throw new Error('Shared Chrome CDP unavailable.');
}
async function connectBackend(guard) {
  const client = new Client({ name: 'opencode-session-guard', version: '1.0.0' }, { capabilities: { roots: {} } });
  client.setRequestHandler(ListRootsRequestSchema, async () => {
    if (server.getClientCapabilities()?.roots) return server.listRoots();
    return { roots: [{ name: 'workspace', uri: pathToFileURL(process.cwd()).href }] };
  });
  const args = kind === 'playwright'
    ? [join(directory, 'node_modules/@playwright/mcp/cli.js'), '--cdp-endpoint', guard.endpoint]
    : [join(directory, 'node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'), `--browserUrl=${guard.endpoint}`, '--no-usage-statistics'];
  const transport = new StdioClientTransport({ command: process.execPath, args, env: { ...process.env }, stderr: 'pipe' });
  // Upstream errors can include private page text or URLs. Never persist them.
  transport.stderr?.on('data', () => {});
  const connection = { client, dead: false };
  client.onclose = () => { connection.dead = true; };
  await client.connect(transport, { timeout: 30000 });
  return connection;
}
let definitions;
server.setRequestHandler(ListToolsRequestSchema, async () => {
  if (!definitions) definitions = (async () => {
    const guard = await createGuard(endpoint);
    let upstream;
    try {
      upstream = await connectBackend(guard);
      const list = await upstream.client.listTools();
      return { tools: list.tools.map(t => ({ ...t,
        description: `${t.description || ''}\nOnly this OpenCode conversation's tabs are accessible. Browser-wide changes are restricted because login is shared.`,
        inputSchema: { ...t.inputSchema, properties: { ...t.inputSchema.properties, __opencodeSessionId: { type: 'string', description: 'Set automatically by the OpenCode session plugin. Do not set this field.' } } }
      })) };
    } finally { await upstream?.client.close(); await guard.close(); }
  })().catch(error => { definitions = undefined; throw error; });
  return definitions;
});
function sessionFor(id) {
  if (!sessions.has(id)) sessions.set(id, { guard: undefined, upstream: undefined, tail: Promise.resolve(), active: 0, touched: Date.now() });
  return sessions.get(id);
}
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const args = { ...request.params.arguments };
  const id = args.__opencodeSessionId;
  delete args.__opencodeSessionId;
  if (typeof id !== 'string' || id.length < 1 || id.length > 240) return failure('Session isolation is not active. Restart OpenCode so browser-session-guard.js can attach the real conversation ID. Do not invent an ID or connect directly to shared CDP.');
  const s = sessionFor(id);
  s.active++; s.touched = Date.now();
  const run = s.tail.catch(() => {}).then(async () => {
    if (extra.signal.aborted) return failure('Browser action was cancelled before execution.');
    if (!s.upstream || s.upstream.dead) {
      await ensureBrowser();
      s.guard ||= await createGuard(endpoint);
      s.upstream = await connectBackend(s.guard);
    } else {
      // Recover a closed/crashed shared Chrome before starting a new operation.
      // Already-sent actions are never replayed.
      await probeBrowser().catch(() => ensureBrowser());
    }
    if (extra.signal.aborted) return failure('Browser action was cancelled before execution.');
    // Once dispatched, cancelling the host request cannot undo a page action.
    // Retain the per-conversation queue until the backend actually settles,
    // otherwise a follow-up could race a still-running cancelled operation.
    return s.upstream.client.callTool({ name: request.params.name, arguments: args }, undefined, { timeout: 120000 });
  });
  s.tail = run;
  try { return await run; }
  catch (error) {
    // Do not retry mutations: a disconnected response may follow a successful click.
    return failure(`Browser operation failed: ${error.message}. Check this session's tabs before retrying; the operation was not replayed.`);
  } finally { s.active--; s.touched = Date.now(); }
});
const idleCleanup = setInterval(() => {
  for (const s of sessions.values()) if (!s.active && s.upstream && Date.now() - s.touched > 20 * 60 * 1000) {
    const upstream = s.upstream; s.upstream = undefined;
    void upstream.client.close(); // Keep ownership and page state for reconnect.
  }
}, 60000);
idleCleanup.unref();
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true; clearInterval(idleCleanup);
  await Promise.allSettled([...sessions.values()].map(async s => { await s.upstream?.client.close(); await s.guard?.close(); }));
  await server.close();
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
process.stdin.on('end', () => void shutdown());
await server.connect(new StdioServerTransport());
