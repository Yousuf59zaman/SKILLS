// A local scripted model drives the REAL installed OpenCode. No AI account is used.
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { launchFixtureBrowser, fixtureSite, root } from './support.mjs';
const browser = await launchFixtureBrowser(), site = await fixtureSite();
const fixture = await mkdtemp(join(root, 'artifacts', 'opencode-'));
const configs = join(fixture, 'config', 'opencode');
await mkdir(join(configs, 'plugins'), { recursive: true });
await mkdir(join(fixture, 'project'), { recursive: true });
await copyFile(join(root, 'browser-session-guard.js'), join(configs, 'plugins', 'browser-session-guard.js'));
const seen = new Map();
const model = http.createServer(async (req, res) => {
  try {
    let body = ''; for await (const chunk of req) body += chunk;
    const input = JSON.parse(body);
    const text = JSON.stringify(input.messages);
    const marker = text.match(/AUDIT_[ABCD]/)?.[0] || 'title';
    const tools = input.messages.filter(m => m.role === 'tool');
    const lastUser = input.messages.findLastIndex(m => m.role === 'user');
    const currentTools = input.messages.slice(lastUser + 1).filter(m => m.role === 'tool');
    if (tools.length) seen.set(marker, tools.map(t => typeof t.content === 'string' ? t.content : JSON.stringify(t.content)));
    const devtools = marker === 'AUDIT_C' || marker === 'AUDIT_D';
    const name = currentTools.length === 0 ? (devtools ? 'chrome-devtools_new_page' : 'playwright_browser_navigate') : (devtools ? 'chrome-devtools_list_pages' : 'playwright_browser_tabs');
    const available = input.tools?.some(t => t.function?.name === name);
    const shouldCall = marker !== 'title' && currentTools.length < 2 && available;
    const args = currentTools.length === 0 ? { url: `${site.url}/form?owner=${marker}`, __opencodeSessionId: 'model-forged-value' } : { ...(devtools ? {} : { action: 'list' }), __opencodeSessionId: 'model-forged-value' };
    const delta = shouldCall ? { tool_calls: [{ index: 0, id: `call_${marker}_${currentTools.length}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } : { content: 'Synthetic browser integration complete.' };
    const chunk = { id: 'synthetic', object: 'chat.completion.chunk', created: 1, model: 'fixture', choices: [{ index: 0, delta, finish_reason: null }] };
    if (input.stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      res.write(`data: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: {}, finish_reason: shouldCall ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`);
      res.end('data: [DONE]\n\n');
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ...chunk, object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', ...delta }, finish_reason: shouldCall ? 'tool_calls' : 'stop' }] }));
    }
  } catch { res.writeHead(500); res.end('Fixture model error'); }
});
model.listen(0, '127.0.0.1'); await once(model, 'listening');
const config = {
  $schema: 'https://opencode.ai/config.json', model: 'audit/fixture', small_model: 'audit/fixture',
  enabled_providers: ['audit'], autoupdate: false,
  provider: { audit: { npm: '@ai-sdk/openai-compatible', name: 'Local fixture', options: { baseURL: `http://127.0.0.1:${model.address().port}/v1`, apiKey: 'synthetic-only' }, models: { fixture: { name: 'Fixture', limit: { context: 64000, output: 4000 } } } } },
  permission: { '*': 'deny', 'playwright_*': 'allow', 'chrome-devtools_*': 'allow' },
  mcp: Object.fromEntries([['playwright', 'playwright'], ['chrome-devtools', 'devtools']].map(([name,kind]) => [name, { type: 'local', command: [process.execPath, join(root,'mcp-session-server.mjs'),kind], environment: { OPENCODE_BROWSER_CDP_ENDPOINT: browser.endpoint }, enabled: true, timeout: 60000 }]))
};
await writeFile(join(configs, 'opencode.json'), JSON.stringify(config));
const executable = join(process.env.APPDATA, 'npm/node_modules/opencode-ai/bin/opencode.exe');
const env = { ...process.env, XDG_CONFIG_HOME: join(fixture,'config'), XDG_DATA_HOME: join(fixture,'data'), XDG_CACHE_HOME: join(fixture,'cache'), XDG_STATE_HOME: join(fixture,'state'), OPENCODE_CONFIG_DIR: configs, OPENCODE_DISABLE_PROJECT_CONFIG: 'true', OPENCODE_DISABLE_CLAUDE_CODE: 'true', OPENCODE_DISABLE_EXTERNAL_SKILLS: 'true', OPENCODE_EXPERIMENTAL_CODE_MODE: 'false', OPENCODE_SERVER_PASSWORD: 'fixture-only', OPENCODE_SERVER_USERNAME: 'fixture', OPENCODE_BROWSER_CDP_ENDPOINT: browser.endpoint };
delete env.OPENCODE_CONFIG; delete env.OPENCODE_CONFIG_CONTENT;
const app = spawn(executable, ['serve','--hostname','127.0.0.1','--port','0'], { cwd: join(fixture,'project'), env, windowsHide:true, stdio:['ignore','pipe','pipe'] });
let address, errors = '';
app.stdout.on('data', b => { address ||= String(b).match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]; });
app.stderr.on('data', b => { errors = (errors + b).slice(-3000); });
const auth = 'Basic ' + Buffer.from('fixture:fixture-only').toString('base64');
async function request(path, body) {
  const r = await fetch(address + path, { method: body === undefined ? 'GET' : 'POST', headers:{ authorization:auth,'content-type':'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(90000) });
  if (!r.ok) throw new Error(`OpenCode ${path.split('/')[1]} returned ${r.status}: ${(await r.text()).slice(0,500)}`);
  return r.json();
}
try {
  for (let i=0;i<150&&!address;i++) { if (app.exitCode !== null) throw new Error(`OpenCode exited: ${errors}`); await delay(100); }
  assert(address, 'OpenCode server failed to start');
  console.log('Real OpenCode server started with isolated config and a local scripted model.');
  const sessions = await Promise.all(['A','B','C','D'].map(async letter => {
    const session = await request('/session', { title: 'Synthetic browser ' + letter });
    return { letter, id: session.id };
  }));
  await Promise.all(sessions.map(s => request(`/session/${s.id}/message`, { model: { providerID:'audit',modelID:'fixture' }, parts:[{type:'text',text:'AUDIT_' + s.letter}] })));
  for (const s of sessions) {
    const marker = 'AUDIT_' + s.letter;
    const results = seen.get(marker);
    assert(results?.length >= 2, `No complete browser tool sequence for ${marker}; observed ${JSON.stringify([...seen].map(([m,r])=>[m,r.length]))}`);
    const last = results.at(-1);
    assert(last.includes('owner=' + marker), `Own tab missing: ${last.slice(0,800)}`);
    for (const other of sessions.filter(x => x !== s)) assert(!last.includes('owner=AUDIT_' + other.letter), 'Conversation takeover in actual OpenCode');
  }
  console.log('PASS: 4 real OpenCode conversations, 2 backends, 8 browser tool calls; trusted session IDs override model-supplied IDs.');
} finally {
  if (address) await request('/instance/dispose', {}).catch(() => {});
  app.kill(); await Promise.race([once(app,'exit'),delay(3000)]);
  model.closeAllConnections(); await new Promise(r=>model.close(r));
  await browser.close(); await site.close();
}
