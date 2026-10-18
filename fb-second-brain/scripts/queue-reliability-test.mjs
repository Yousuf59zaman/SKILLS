import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as worker from './queue-worker.mjs';
import * as drain from './drain-messenger-queue.mjs';
import { ACTIVE_MEMORY_FILE_ROUTES } from './lib.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fb-reliability-sqa-'));
const failures = [];
let total = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const queueRoot = (w) => path.join(w, '.queue', 'fb-second-brain');
async function json(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }
async function writeJson(file, data) { await fs.writeFile(file, JSON.stringify(data) + '\n'); }
async function events(w) {
  return (await fs.readFile(path.join(queueRoot(w), 'events.jsonl'), 'utf8'))
    .split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}
async function fixture() {
  const w = path.join(root, String(total));
  await fs.mkdir(path.join(w, 'memory'), { recursive: true });
  const rows = Object.entries(ACTIVE_MEMORY_FILE_ROUTES).map(([file, route]) =>
    '| `' + route.fb_group + '` | `' + file + '` |');
  await fs.writeFile(path.join(w, 'memory', 'fb-messenger-groups.md'), rows.join('\n'));
  await worker.queueStatus({ workspace: w });
  return w;
}
const input = (workspace) => ({
  workspace, type: 'link', category: 'others', memory_file: 'memory/others-boi.md',
  source: 'https://example.org/isolated-reliability-fixture',
  canonical_urls: ['https://example.org/isolated-reliability-fixture'],
  title: 'Synthetic reliability fixture', post_text: 'https://example.org/isolated-reliability-fixture',
});
const receipt = (job) => ({
  version: 1, bundle_fingerprint: job.bundle.fingerprint, target_group: job.fb_group,
  attachment_count: job.bundle.attachment_count, message_text_sha256: job.bundle.message_text_sha256,
  link_count: job.bundle.canonical_urls.length, all_parts_verified: true, composer_empty: true,
});
async function check(name, action) {
  total += 1;
  try { await action(await fixture()); }
  catch (error) { failures.push({ name, error: String(error.message).split('\n')[0] }); }
}
async function appendFault(w, eventName, action) {
  const original = fs.appendFile;
  fs.appendFile = async function (file, data, ...rest) {
    if (String(file) === path.join(queueRoot(w), 'events.jsonl') && JSON.parse(String(data)).event === eventName) {
      throw Object.assign(new Error('simulated_audit_disk_full'), { code: 'ENOSPC' });
    }
    return original.call(fs, file, data, ...rest);
  };
  try { return await action(); } finally { fs.appendFile = original; }
}
function audit(w) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./audit-production.mjs', import.meta.url)), w],
    { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(result.error, undefined);
  return { exit: result.status, ...JSON.parse(result.stdout) };
}

try {
  for (const state of ['pending', 'processing', 'failed']) {
    await check('Malformed ' + state + ' job cannot be silently skipped', async (w) => {
      const file = path.join(queueRoot(w), state, 'broken.json');
      await fs.writeFile(file, '{"incomplete":');
      await assert.rejects(worker.queueStatus({ workspace: w }), /queue_job_unreadable/);
      assert.equal(await fs.readFile(file, 'utf8'), '{"incomplete":');
    });
  }
  await check('Unreadable prior job blocks another enqueue instead of risking a duplicate', async (w) => {
    await fs.writeFile(path.join(queueRoot(w), 'failed', 'broken.json'), '{');
    await assert.rejects(worker.enqueueMediaJob(input(w)), /queue_job_unreadable/);
    assert.equal((await fs.readdir(path.join(queueRoot(w), 'pending'))).length, 0);
  });
  await check('Malformed lock is retained and reported, not stolen', async (w) => {
    const file = path.join(queueRoot(w), 'worker-lock.json');
    await fs.writeFile(file, '{');
    await assert.rejects(worker.beginRun({ workspace: w }), /queue_lock_unreadable/);
    assert.equal(await fs.readFile(file, 'utf8'), '{');
  });
  await check('Invalid lock expiry never authorizes a claim', async (w) => {
    await writeJson(path.join(queueRoot(w), 'worker-lock.json'), {
      token: 'synthetic-token', owner: 'fixture', acquired_at: new Date().toISOString(), expires_at: 'invalid-date',
    });
    await assert.rejects(worker.claimNext({ workspace: w, lock_token: 'synthetic-token' }), /queue_lock_unreadable/);
  });
  await check('A lock that is still being written cannot be stolen by a second worker', async (w) => {
    const originalOpen = fs.open;
    let signal;
    const entered = new Promise((resolve) => { signal = resolve; });
    let intercepted = false;
    fs.open = async function (file, flags, ...rest) {
      const handle = await originalOpen.call(fs, file, flags, ...rest);
      if (!intercepted && String(file) === path.join(queueRoot(w), 'worker-lock.json') && flags === 'wx') {
        intercepted = true;
        const write = handle.writeFile.bind(handle);
        handle.writeFile = async (...args) => { signal(); await sleep(100); return write(...args); };
      }
      return handle;
    };
    let results;
    try {
      const first = worker.beginRun({ workspace: w, owner: 'fixture-one' });
      await entered;
      results = await Promise.allSettled([first, worker.beginRun({ workspace: w, owner: 'fixture-two' })]);
    } finally { fs.open = originalOpen; }
    const acquired = results.filter((r) => r.status === 'fulfilled' && r.value.acquired);
    for (const run of acquired) await worker.endRun({ workspace: w, lock_token: run.value.lock_token }).catch(() => {});
    assert.equal(results.filter((r) => r.status === 'rejected').length, 0);
    assert.equal(acquired.length, 1);
  });
  await check('Twenty concurrent stale-lock contenders produce exactly one owner', async (w) => {
    await writeJson(path.join(queueRoot(w), 'worker-lock.json'), {
      token: 'expired-fixture-token', owner: 'fixture-old',
      acquired_at: '2000-01-01T00:00:00Z', expires_at: '2000-01-01T00:01:00Z',
    });
    const results = await Promise.allSettled(Array.from({ length: 20 }, (_, index) =>
      worker.beginRun({ workspace: w, owner: 'fixture-' + index })));
    const acquired = results.filter((r) => r.status === 'fulfilled' && r.value.acquired);
    for (const run of acquired) await worker.endRun({ workspace: w, lock_token: run.value.lock_token }).catch(() => {});
    assert.equal(results.filter((r) => r.status === 'rejected').length, 0);
    assert.equal(acquired.length, 1);
  });
  await check('Failed processing recovery does not strand an 80-minute lock', async (w) => {
    await fs.writeFile(path.join(queueRoot(w), 'processing', 'broken.json'), '{');
    await assert.rejects(worker.beginRun({ workspace: w }), /queue_job_unreadable/);
    await assert.rejects(fs.access(path.join(queueRoot(w), 'worker-lock.json')), { code: 'ENOENT' });
  });
  await check('Run-start audit disk failure releases only its own lock', async (w) => {
    await appendFault(w, 'run_started', () => assert.rejects(worker.beginRun({ workspace: w }), /simulated_audit_disk_full/));
    await assert.rejects(fs.access(path.join(queueRoot(w), 'worker-lock.json')), { code: 'ENOENT' });
  });
  await check('Verified completion recovers its audit record without a second send', async (w) => {
    await worker.enqueueMediaJob(input(w));
    let run = await worker.beginRun({ workspace: w });
    const claimed = await worker.claimNext({ workspace: w, lock_token: run.lock_token });
    await worker.markSubmitStarted({ workspace: w, lock_token: run.lock_token, job_id: claimed.job.id });
    await appendFault(w, 'completed', () => assert.rejects(worker.completeJob({
      workspace: w, lock_token: run.lock_token, job_id: claimed.job.id,
      verified: true, verification_note: 'Synthetic no-browser receipt', delivery_receipt: receipt(claimed.job),
    }), /simulated_audit_disk_full/));
    await worker.endRun({ workspace: w, lock_token: run.lock_token });
    run = await worker.beginRun({ workspace: w });
    assert.equal(run.recovered.finalized_verified, 1);
    await worker.endRun({ workspace: w, lock_token: run.lock_token });
    assert.equal((await events(w)).filter((e) => e.event === 'completed').length, 1);
    assert.equal(audit(w).ok, true);
    const lines = (await fs.readFile(path.join(w, 'memory', 'fb_second_brain_log.jsonl'), 'utf8')).trim().split(/\r?\n/);
    assert.equal(lines.map(JSON.parse).filter((e) => e.post_status === 'sent').length, 1);
  });
  await check('Recovery audit failure retains verified evidence for a later clean recovery', async (w) => {
    await worker.enqueueMediaJob(input(w));
    let run = await worker.beginRun({ workspace: w });
    const claimed = await worker.claimNext({ workspace: w, lock_token: run.lock_token });
    const file = path.join(queueRoot(w), 'processing', claimed.job.id + '.json');
    await writeJson(file, { ...claimed.job, verified_sent: true, submit_started_at: new Date().toISOString(),
      delivery_receipt: receipt(claimed.job), verification_note: 'Synthetic fixture' });
    await worker.endRun({ workspace: w, lock_token: run.lock_token });
    await appendFault(w, 'completed', () => assert.rejects(worker.beginRun({ workspace: w }), /simulated_audit_disk_full/));
    assert.equal((await json(file)).verified_sent, true);
    run = await worker.beginRun({ workspace: w });
    assert.equal(run.recovered.finalized_verified, 1);
    await worker.endRun({ workspace: w, lock_token: run.lock_token });
    assert.equal(audit(w).ok, true);
  });
  await check('A recovered uncertain send is reported for review instead of NO_REPLY', async (w) => {
    await worker.enqueueMediaJob(input(w));
    let run = await worker.beginRun({ workspace: w });
    const claimed = await worker.claimNext({ workspace: w, lock_token: run.lock_token });
    await worker.markSubmitStarted({ workspace: w, lock_token: run.lock_token, job_id: claimed.job.id });
    await worker.endRun({ workspace: w, lock_token: run.lock_token });
    run = await worker.beginRun({ workspace: w });
    assert.equal(run.recovered.retained_uncertain, 1);
    assert.equal((await worker.claimNext({ workspace: w, lock_token: run.lock_token })).claimed, false);
    assert.equal(typeof drain.queueRecoveryCounts, 'function');
    const counts = drain.queueRecoveryCounts(run.recovered);
    assert.equal(counts.manualReviewRequired, 1);
    assert.match(drain.buildQueueSummary(counts), /1 manual review required/);
    await worker.endRun({ workspace: w, lock_token: run.lock_token });
  });
  await check('A pre-submit network failure retains the job with backoff', async (w) => {
    await worker.enqueueMediaJob(input(w));
    const run = await worker.beginRun({ workspace: w });
    const claimed = await worker.claimNext({ workspace: w, lock_token: run.lock_token });
    const result = await worker.failJob({ workspace: w, lock_token: run.lock_token, job_id: claimed.job.id, error: 'synthetic_network_failure' });
    assert.equal(result.retry_scheduled, true);
    assert.equal(result.delivery_uncertain, false);
    assert.ok(Date.parse(result.available_at) > Date.now());
    assert.equal((await worker.claimNext({ workspace: w, lock_token: run.lock_token })).deferred, true);
    await worker.endRun({ workspace: w, lock_token: run.lock_token });
  });
  await check('A post-submit failure cannot opt back into automatic retry', async (w) => {
    await worker.enqueueMediaJob(input(w));
    const run = await worker.beginRun({ workspace: w });
    const claimed = await worker.claimNext({ workspace: w, lock_token: run.lock_token });
    await worker.markSubmitStarted({ workspace: w, lock_token: run.lock_token, job_id: claimed.job.id });
    const result = await worker.failJob({ workspace: w, lock_token: run.lock_token, job_id: claimed.job.id,
      error: 'synthetic_disconnect_after_send', retryable: true });
    assert.equal(result.retry_scheduled, false);
    assert.equal(result.delivery_uncertain, true);
    assert.equal((await worker.claimNext({ workspace: w, lock_token: run.lock_token })).claimed, false);
    await worker.endRun({ workspace: w, lock_token: run.lock_token });
  });
  await check('Separate Windows processes still share exactly one lease', async (w) => {
    const workerUrl = new URL('./queue-worker.mjs', import.meta.url).href;
    const code = 'const {beginRun}=await import(' + JSON.stringify(workerUrl) + ');process.stdout.write(JSON.stringify(await beginRun({workspace:process.argv[1],owner:"process-fixture"})));';
    const results = await Promise.all(Array.from({ length: 16 }, () => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', code, w], {
        windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.resume();
      const timer = setTimeout(() => { child.kill(); reject(new Error('fixture_child_timeout')); }, 30000);
      child.on('error', () => { clearTimeout(timer); reject(new Error('fixture_child_start_failed')); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) return reject(new Error('fixture_child_failed'));
        try { resolve(JSON.parse(stdout)); } catch { reject(new Error('fixture_child_output_invalid')); }
      });
    })));
    const acquired = results.filter((result) => result.acquired);
    for (const run of acquired) await worker.endRun({ workspace: w, lock_token: run.lock_token }).catch(() => {});
    assert.equal(acquired.length, 1);
    assert.equal(results.filter((result) => result.busy).length, 15);
  });
  await check('Sequence-lock disk failure closes its handle and removes its own partial lock', async (w) => {
    const original = fs.open;
    let held;
    const lockFile = path.join(queueRoot(w), 'queue-sequence.lock');
    fs.open = async function (file, flags, ...rest) {
      const handle = await original.call(fs, file, flags, ...rest);
      if (String(file) === lockFile && flags === 'wx') {
        held = handle;
        handle.writeFile = async () => { throw Object.assign(new Error('synthetic_sequence_disk_full'), { code: 'ENOSPC' }); };
      }
      return handle;
    };
    try {
      await assert.rejects(worker.queueStatus({ workspace: w }), /synthetic_sequence_disk_full/);
      assert.equal(held?.fd, -1);
      await assert.rejects(fs.access(lockFile), { code: 'ENOENT' });
    } finally { fs.open = original; await held?.close().catch(() => {}); }
  });
  await check('Run-end audit failure does not strand an owned lease', async (w) => {
    const run = await worker.beginRun({ workspace: w });
    await appendFault(w, 'run_ended', () => assert.rejects(worker.endRun({ workspace: w, lock_token: run.lock_token }), /simulated_audit_disk_full/));
    await assert.rejects(fs.access(path.join(queueRoot(w), 'worker-lock.json')), { code: 'ENOENT' });
  });
  await check('An expired owner cannot remove its replacement lease', async (w) => {
    const first = await worker.beginRun({ workspace: w, lock_ttl_ms: 50 });
    await sleep(80);
    const second = await worker.beginRun({ workspace: w });
    await assert.rejects(worker.endRun({ workspace: w, lock_token: first.lock_token }), /owned by another worker/);
    assert.equal((await json(path.join(queueRoot(w), 'worker-lock.json'))).token, second.lock_token);
    await worker.endRun({ workspace: w, lock_token: second.lock_token });
  });
  await check('Cleanup failure after a completion event recovers without duplicate audit or send log', async (w) => {
    await worker.enqueueMediaJob(input(w));
    let run = await worker.beginRun({ workspace: w });
    const claim = await worker.claimNext({ workspace: w, lock_token: run.lock_token });
    await worker.markSubmitStarted({ workspace: w, lock_token: run.lock_token, job_id: claim.job.id });
    const file = path.join(queueRoot(w), 'processing', claim.job.id + '.json');
    const original = fs.rm;
    fs.rm = async function (target, ...args) {
      if (String(target) === file) throw Object.assign(new Error('synthetic_cleanup_io_failure'), { code: 'EIO' });
      return original.call(fs, target, ...args);
    };
    try {
      await assert.rejects(worker.completeJob({ workspace: w, lock_token: run.lock_token, job_id: claim.job.id,
        verified: true, verification_note: 'Synthetic no-browser receipt', delivery_receipt: receipt(claim.job) }), /synthetic_cleanup_io_failure/);
    } finally { fs.rm = original; }
    await worker.endRun({ workspace: w, lock_token: run.lock_token });
    run = await worker.beginRun({ workspace: w });
    assert.equal(run.recovered.finalized_verified, 1);
    await worker.endRun({ workspace: w, lock_token: run.lock_token });
    assert.equal((await events(w)).filter((event) => event.event === 'completed').length, 1);
    assert.equal(audit(w).ok, true);
    const logs = (await fs.readFile(path.join(w, 'memory', 'fb_second_brain_log.jsonl'), 'utf8')).trim().split(/\r?\n/).map(JSON.parse);
    assert.equal(logs.filter((entry) => entry.post_status === 'sent').length, 1);
  });
  await check('JSON-null audit entries cannot yield an all-clear audit', async (w) => {
    await fs.writeFile(path.join(queueRoot(w), 'events.jsonl'), 'null\n');
    assert.equal(audit(w).ok, false);
  });
  await check('Malformed audit history cannot yield an all-clear audit', async (w) => {
    await fs.writeFile(path.join(queueRoot(w), 'events.jsonl'), '{"broken":\n');
    const result = audit(w);
    assert.equal(result.ok, false);
    assert.equal(result.exit, 1);
    assert.ok(result.issues.some((issue) => /unreadable.*JSONL/i.test(issue)));
  });
} finally {
  const target = path.resolve(root);
  assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
  assert.ok(path.basename(target).startsWith('fb-reliability-sqa-'));
  await fs.rm(target, { recursive: true, force: true });
}
console.log(JSON.stringify({ ok: failures.length === 0, total, passed: total - failures.length,
  failed: failures.length, failures, externalMessagesSent: 0 }));
if (failures.length) process.exitCode = 1;
