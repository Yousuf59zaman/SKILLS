import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareDrop } from './prepare-drop.mjs';
import { beginRun, claimNext, endRun } from './queue-worker.mjs';
import { WORKSPACE_ROOT } from './browser-runtime.mjs';

const runtime = path.join(process.env.APPDATA, 'npm/node_modules/openclaw/dist/telegram-ingress-spool-Dd3cDhXe.js');
const source = await fs.readFile(runtime, 'utf8');
const start = source.indexOf('\tconst processMediaGroup = async (entry) => {');
const end = source.indexOf('\tconst flushTextFragments = ', start);
assert.ok(start > 0 && end > start, 'Album runtime changed; inspect before applying the guard');
const albumFunction = source.slice(start, end);
assert.ok(albumFunction.includes('OPENCLAW_COMPLETE_MEDIA_BUNDLE_V1'));
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fb-album-intake-sqa-'));
const failures = [];
let total = 0;
async function test(name, run) { total++; try { await run(); } catch (error) { failures.push({ name, error: error.message.split('\n')[0] }); } }
function handler(failAt = -1) {
  const dispatched = [], notifications = [], settled = [];
  const deps = {
    releaseDispatchDedupeKeys: () => {}, settleSpooledReplayParticipants: (participants, result) => settled.push(result),
    shouldSkipMediaDownloadForUnaddressedMentionGroup: async () => false,
    resolveMedia: async ({ctx}) => { if (ctx.fixtureIndex === failAt) throw new Error('fixture_download_failure'); return { path: ctx.fixturePath, contentType: 'image/jpeg' }; },
    mediaMaxBytes: 25 * 1024 * 1024, mediaRuntimeWithAbort: {}, isRecoverableMediaGroupError: () => true,
    runtime: { log: () => {}, error: () => {} }, warn: (value) => value, danger: (value) => value,
    withTelegramApiErrorLogging: async ({fn}) => fn(), bot: { api: { sendMessage: async (...args) => notifications.push(args) } },
    buildSyntheticTextMessage: ({base, text}) => ({ ...base, text, caption: undefined, caption_entities: undefined, entities: undefined }),
    buildSyntheticContext: (ctx, message) => ({ ...ctx, message }),
    processMessageWithReplyChain: async (args) => { dispatched.push(args); return { kind: 'completed' }; },
    promptContextBoundaryOptions: () => ({}), spooledReplayOptions: () => ({}), buildFailedProcessingResult: () => ({ kind: 'failed-retryable' }),
  };
  const run = Function(...Object.keys(deps), `${albumFunction}\nreturn processMediaGroup;`)(...Object.values(deps));
  return { run, dispatched, notifications, settled };
}
async function entry(count) {
  const messages = [];
  for (let n = 0; n < count; n++) {
    const fixturePath = path.join(root, `image-${n}.jpg`);
    await fs.writeFile(fixturePath, `image-fixture-${n}`);
    const msg = { message_id: n + 1, media_group_id: 'synthetic-album', chat: { id: 42, type: 'private' }, caption: `Caption ${n + 1}: বাংলা স্মৃতি\nhttps://example.org/item-${n + 1}\n#${n + 1} Note: literal list item` };
    messages.push({ msg, ctx: { message: msg, fixtureIndex: n, fixturePath } });
  }
  return { messages: messages.reverse(), dispatchDedupeKeys: [], spooledReplayParticipants: [] };
}
try {
  for (const count of [4, 6, 10]) {
    await test(`real Telegram album handler preserves ${count} ordered files and every caption/link`, async () => {
      const input = await entry(count), h = handler();
      await h.run(input);
      assert.equal(h.dispatched.length, 1);
      const result = h.dispatched[0];
      assert.equal(result.allMedia.length, count);
      assert.deepEqual(result.allMedia.map((item) => item.sourceMessageId), Array.from({ length: count }, (_, n) => String(n + 1)));
      for (let n = 1; n <= count; n++) assert.ok(result.msg.text.includes(`Caption ${n}: বাংলা স্মৃতি\nhttps://example.org/item-${n}`));
      assert.equal(result.ctx.message.text, result.msg.text);
    });
    await test(`failed attachment in ${count}-item album prevents ANY partial dispatch`, async () => {
      const input = await entry(count), h = handler(2);
      await h.run(input);
      assert.equal(h.dispatched.length, 0);
      assert.equal(h.settled.at(-1).kind, 'failed-retryable');
      assert.equal(h.notifications.length, 1);
    });
  }
  const pluginSource = await fs.readFile(path.join(WORKSPACE_ROOT, 'plugins/tool-result-verifier/index.js'), 'utf8');
  const { default: plugin } = await import(`data:text/javascript,${encodeURIComponent(pluginSource.replace('import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";', 'const definePluginEntry = (entry) => entry;'))}`);
  for (const count of [4, 6, 10]) {
    await test(`${count}-item real ingress to enforcer to durable producer integration`, async () => {
      const input = await entry(count), h = handler();
      await h.run(input);
      const album = h.dispatched[0];
      const workspace = path.join(root, `integration-${count}`);
      await fs.mkdir(path.join(workspace, 'memory'), { recursive: true });
      const hooks = new Map();
      plugin.register({ config: { workspace: { dir: workspace } }, logger: { info: () => {}, warn: () => {} }, on: (name, fn) => hooks.set(name, fn) });
      const paths = album.allMedia.map((item) => item.path);
      const context = { agentId: 'moltbot_agent', channelId: 'telegram', runId: `album-sqa-${count}`, sessionKey: `agent:moltbot_agent:telegram:album-sqa-${count}` };
      const prompt = `${album.msg.text}\nsave this album`;
      await hooks.get('inbound_claim')({ content: prompt, metadata: { mediaPaths: paths, mediaTypes: paths.map(() => 'image/jpeg') } }, context);
      await hooks.get('before_agent_run')({ prompt, messages: [] }, context);
      await hooks.get('before_prompt_build')({ prompt: prompt.replace(/\[OpenClaw inbound album:[^\]]+\]\n/, ''), messages: [] }, context);
      const given = path.join(workspace, 'agent-input.json');
      await fs.writeFile(given, JSON.stringify({ category: 'funny', memory_file: 'memory/funny-posts.md', attachment_paths: [paths.at(-1)], text: 'AI accidentally summarized the album', post_text: 'Only the first caption', summary: 'AI-generated extra https://example.org/not-provided' }));
      const result = await hooks.get('before_tool_call')({ toolName: 'exec', toolCallId: `sqa-${count}`, params: { command: `node "${path.join(workspace, 'skills/fb-second-brain/scripts/prepare-drop.mjs')}" --input "${given}"` } }, context);
      assert.notEqual(result?.block, true);
      const enforcedPath = result.params.command.match(/--input\s+"([^"]+)"/)[1];
      const enforced = JSON.parse(await fs.readFile(enforcedPath, 'utf8'));
      assert.deepEqual(enforced.attachment_paths, paths, 'trusted album order overrides an incomplete agent selection');
      assert.equal(enforced.expected_attachment_count, count);
      const prepared = await prepareDrop(enforced);
      assert.equal(prepared.status, 'queued');
      assert.equal(prepared.post_manifest.browser_handoff.attachment_paths.length, count);
      for (let n = 1; n <= count; n++) assert.ok(prepared.post_manifest.browser_handoff.message_text.includes(`Caption ${n}: বাংলা স্মৃতি`));
      for (let n = 1; n <= count; n++) assert.ok(prepared.post_manifest.browser_handoff.message_text.includes(`#${n} Note: literal list item`));
      assert.equal(prepared.dedupe.bundle.canonical_urls.length, count);
      assert.equal(prepared.post_manifest.browser_handoff.message_text.includes('not-provided'), false);
      const run = await beginRun({ workspace, owner: 'album-intake-sqa' });
      assert.equal(run.acquired, true);
      const worker = { workspace, lock_token: run.lock_token, browser_profile: 'openclaw' };
      try {
        const claimed = await claimNext(worker);
        assert.equal(claimed.claimed, true);
        assert.equal(claimed.post_manifest.ready, true);
        const handoff = claimed.post_manifest.browser_handoff;
        assert.equal(handoff.attachment_paths.length, count);
        assert.equal(handoff.bundle.fingerprint, prepared.dedupe.bundle.fingerprint);
        assert.equal(handoff.bundle.canonical_urls.length, count);
        assert.equal(handoff.message_text.includes('not-provided'), false);
        for (let n = 1; n <= count; n++) assert.ok(handoff.message_text.includes(`Caption ${n}: বাংলা স্মৃতি`));
      } finally {
        await endRun(worker);
      }
      await hooks.get('agent_end')({}, context);
    });
  }
  await test('two active turns in one session keep their bundles isolated', async () => {
    const workspace=path.join(root,'parallel-turns');await fs.mkdir(path.join(workspace,'memory'),{recursive:true});
    const hooks=new Map();plugin.register({config:{workspace:{dir:workspace}},logger:{info:()=>{},warn:()=>{}},on:(name,fn)=>hooks.set(name,fn)});
    const all=(await entry(10)).messages.reverse().map((item)=>item.ctx.fixturePath);
    const session={agentId:'moltbot_agent',channelId:'telegram',sessionKey:'agent:moltbot_agent:telegram:parallel-intake'};
    const a={...session,runId:'parallel-album-a'},b={...session,runId:'parallel-album-b'};
    const start=async(paths,ctx)=>{await hooks.get('inbound_claim')({content:'save all these images',metadata:{mediaPaths:paths}},session);await hooks.get('before_agent_run')({prompt:'save all these images',messages:[]},ctx);};
    await start(all.slice(0,4),a);await start(all.slice(4),b);
    for(const [ctx,expected] of [[a,all.slice(0,4)],[b,all.slice(4)]]){
      const inputFile=path.join(workspace,ctx.runId+'.json');await fs.writeFile(inputFile,JSON.stringify({category:'funny',memory_file:'memory/funny-posts.md'}));
      const result=await hooks.get('before_tool_call')({toolName:'exec',toolCallId:ctx.runId,params:{command:`node "${path.join(workspace,'skills/fb-second-brain/scripts/prepare-drop.mjs')}" --input "${inputFile}"`}},ctx);
      const enforced=JSON.parse(await fs.readFile(result.params.command.match(/--input\s+"([^"]+)"/)[1],'utf8'));
      assert.deepEqual(enforced.attachment_paths,expected);
      await hooks.get('agent_end')({},ctx);
    }
  });
} finally {
  assert.ok(root.startsWith(path.join(os.tmpdir(), 'fb-album-intake-sqa-')));
  await fs.rm(root, { recursive: true, force: true });
}
console.log(JSON.stringify({ ok: !failures.length, total, passed: total - failures.length, failed: failures.length, failures }));
if (failures.length) process.exitCode = 1;
