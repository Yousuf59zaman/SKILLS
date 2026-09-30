import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ACTIVE_MEMORY_FILE_ROUTES } from './lib.mjs';

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'fb-audit-sqa-'));
const auditScript = fileURLToPath(new URL('./audit-production.mjs', import.meta.url));
const failures = [];
let total = 0;

async function snapshot(directory) {
  const files = [];
  async function visit(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(fullPath);
      else if (entry.isFile()) {
        const stat = await fs.stat(fullPath);
        files.push([path.relative(directory, fullPath), stat.mtimeMs, (await fs.readFile(fullPath)).toString('base64')]);
      } else throw new Error('Unexpected non-file fixture entry');
    }
  }
  await visit(directory);
  return files.sort((left, right) => left[0].localeCompare(right[0]));
}

async function check(name, { events = [], state = null, expectedOk = true } = {}) {
  total += 1;
  const workspace = path.join(temporaryRoot, String(total));
  try {
    const memory = path.join(workspace, 'memory');
    const queue = path.join(workspace, '.queue', 'fb-second-brain');
    await fs.mkdir(memory, { recursive: true });
    await fs.mkdir(queue, { recursive: true });
    const rows = Object.entries(ACTIVE_MEMORY_FILE_ROUTES).map(([memoryFile, route]) =>
      '| `' + route.fb_group + '` | `' + memoryFile + '` |');
    await fs.writeFile(path.join(memory, 'fb-messenger-groups.md'), rows.join('\n') + '\n');
    await fs.writeFile(path.join(queue, 'events.jsonl'), events.map((event) => JSON.stringify(event)).join('\n') + '\n');
    if (state) {
      assert.ok(['pending', 'processing', 'failed'].includes(state));
      await fs.mkdir(path.join(queue, state));
      const job = {
        id: 'fixture-current', queue_number: 1, schema_version: 3,
        memory_file: 'memory/funny-posts.md', fb_group: 'meme boi',
        attachment_paths: [],
        post_manifest: { target_group: 'meme boi', browser_handoff: {
          target_group: 'meme boi', profile: 'openclaw',
          steps: ['messenger-pin-helper.ps1; never expose or ask Yousuf for the PIN'],
        } },
      };
      await fs.writeFile(path.join(queue, state, 'fixture-current.json'), JSON.stringify(job));
    }
    const before = await snapshot(workspace);
    const run = spawnSync(process.execPath, [auditScript, workspace], {
      encoding: 'utf8', windowsHide: true, timeout: 30000,
    });
    assert.equal(run.error, undefined, 'Audit process must finish');
    const result = JSON.parse(run.stdout);
    assert.equal(run.status, expectedOk ? 0 : 1);
    assert.equal(result.ok, expectedOk);
    if (!expectedOk) assert.ok(result.issues.some((issue) => issue.includes('unresolved schema-3 enqueue')));
    assert.deepEqual(await snapshot(workspace), before, 'Audit must not change any fixture bytes or timestamps');
  } catch (error) {
    failures.push({ name, error: String(error.message).split('\n')[0] });
  }
}

const enqueue = { event: 'enqueued', job_id: 'fixture-current', queue_number: 1, schema_version: 3 };
const terminal = (event, jobId = enqueue.job_id) => ({ event, job_id: jobId, queue_number: 1 });
try {
  await check('Empty queue is valid');
  for (const state of ['pending', 'processing', 'failed']) {
    await check('A durable ' + state + ' job covers its enqueue', { events: [enqueue], state });
  }
  await check('Missing durable job fails audit', { events: [enqueue], expectedOk: false });
  await check('A claim without a durable job does not cover its enqueue', {
    events: [enqueue, terminal('claimed')], expectedOk: false,
  });
  await check('Another job completion does not hide an orphan', {
    events: [enqueue, terminal('completed', 'fixture-other')], expectedOk: false,
  });
  await check('Permanent-failure event still requires retained durable job', {
    events: [enqueue, terminal('failed_permanently')], expectedOk: false,
  });
  for (const event of ['completed', 'reconciled_failed_as_sent', 'orphaned_enqueue_invalidated']) {
    await check(event + ' closes the matching enqueue', { events: [enqueue, terminal(event)] });
  }
  await check('Future schema versions retain the durable-job requirement', {
    events: [{ ...enqueue, schema_version: 4 }], expectedOk: false,
  });
  const { schema_version: _schema, ...legacyEnqueue } = enqueue;
  await check('Legacy unversioned history is not retroactively reclassified', { events: [legacyEnqueue] });
} finally {
  const resolvedRoot = path.resolve(temporaryRoot);
  assert.equal(path.dirname(resolvedRoot), path.resolve(os.tmpdir()));
  assert.ok(path.basename(resolvedRoot).startsWith('fb-audit-sqa-'));
  await fs.rm(resolvedRoot, { recursive: true, force: true });
}
console.log(JSON.stringify({ ok: failures.length === 0, total, passed: total - failures.length, failed: failures.length, failures, externalMessagesSent: 0 }));
if (failures.length) process.exitCode = 1;

