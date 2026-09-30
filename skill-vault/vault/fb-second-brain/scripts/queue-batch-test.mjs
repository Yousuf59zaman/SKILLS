import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareDrop } from './prepare-drop.mjs';
import { drainQueueBatch, verificationDiagnostic } from './queue-batch.mjs';
import { beginRun, endRun, queueStatus } from './queue-worker.mjs';
import { buildQueueSummary } from './drain-messenger-queue.mjs';
import { digest } from './bundle.mjs';
import { findReviewCandidate } from './review-uncertain-messenger-job.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fb-batch-sqa-'));
const failures = [];
let total = 0;
async function test(name, run) { total++; try { await run(); } catch (e) { failures.push({ name, error: e.message.split('\n')[0] }); } }
async function fixture(name) {
  const workspace = path.join(root, name);
  await fs.mkdir(path.join(workspace, 'memory'), { recursive: true });
  const jobs = [];
  for (let i = 0; i < 5; i++) {
    const attachment = path.join(workspace, `synthetic-${i}.png`);
    await fs.writeFile(attachment, `test-only-${i}`);
    jobs.push(await prepareDrop({ workspace, category: 'funny', memory_file: 'memory/funny-posts.md', type: 'image', text: `Synthetic batch ${i}`, attachment_paths: [attachment], source: 'Telegram' }));
  }
  const lease = await beginRun({ workspace, owner: 'isolated-batch-test' });
  return { workspace, jobs, lockToken: lease.lock_token };
}
const receipt = (h) => ({ verified: true, note: 'Synthetic complete bundle.', delivery_receipt: {
  version: 1, bundle_fingerprint: h.bundle.fingerprint, target_group: h.target_group,
  attachment_count: h.attachment_paths.length, message_text_sha256: digest(h.message_text),
  link_count: h.bundle.canonical_urls.length, all_parts_verified: true, composer_empty: true,
} });
try {
  for (const mode of ['success', 'uncertain-clean', 'uncertain-dirty', 'recovery-throws', 'three-failures', 'retry-once', 'missing-attachment', 'bad-receipt']) {
    await test(`real isolated queue batch: ${mode}`, async () => {
      const f = await fixture(mode);
      const sent = [], marked = [];
      let recoveries = 0, caught, result;
      if (mode === 'missing-attachment') {
        const job = JSON.parse(await fs.readFile(path.join(f.workspace, f.jobs[0].queue.queue_file), 'utf8'));
        await fs.unlink(job.attachment_paths[0]);
      }
      try {
        result = await drainQueueBatch({ ...f,
          errorClass: () => 'synthetic_pre_submit_failure',
          send: async (h, mark) => {
            const i = f.jobs.findIndex(j => j.post_manifest.browser_handoff.bundle.fingerprint === h.bundle.fingerprint);
            sent.push(i);
            if ((mode === 'retry-once' && i === 0) || mode === 'three-failures') throw new Error('synthetic_pre_submit_failure');
            await mark(); marked.push(i);
            if (i === 0 && ['uncertain-clean', 'uncertain-dirty', 'recovery-throws'].includes(mode)) {
              const error = new Error('delivery_verification_ambiguous'); error.sendAttempted = true; throw error;
            }
            if (mode === 'bad-receipt') return { note: 'not evidence' };
            return receipt(h);
          },
          recoverCleanContext: async () => {
            recoveries++;
            if (mode === 'recovery-throws') throw new Error('synthetic_reload_failure');
            if (mode === 'retry-once') {
              // Expire backoff deliberately: even then, never replay this job
              // within the same drain. Production timestamps are never edited.
              const file = path.join(f.workspace, f.jobs[0].queue.queue_file);
              const job = JSON.parse(await fs.readFile(file, 'utf8'));
              job.available_at = new Date(0).toISOString(); await fs.writeFile(file, JSON.stringify(job));
            }
            return mode !== 'uncertain-dirty';
          },
        });
      } catch (e) { caught = e; }
      const status = await queueStatus({ workspace: f.workspace });
      assert.equal(new Set(sent).size, sent.length, 'no same-job replay');
      assert.deepEqual(sent, [...sent].sort((a,b) => a-b), 'strict FIFO');
      if (mode === 'bad-receipt') {
        assert.ok(caught); assert.equal(status.processing, 1); assert.equal(status.pending, 4); assert.equal(status.failed, 0); assert.deepEqual(marked, [0]);
      } else {
        assert.equal(caught, undefined);
        if (['uncertain-dirty', 'recovery-throws'].includes(mode)) { assert.equal(result.stopReason, 'clean_context_unverified'); assert.equal(status.pending, 4); assert.equal(result.manualReviewRequired, 1); assert.deepEqual(marked, [0]); }
        else if (mode === 'three-failures') { assert.equal(result.stopReason, 'repeated_failures'); assert.equal(result.retryScheduled, 3); assert.equal(status.pending, 5); assert.equal(sent.length, 3); assert.equal(recoveries, 2); }
        else if (mode === 'success') { assert.equal(result.sent, 5); assert.equal(status.pending, 0); assert.equal(recoveries, 0); }
        else { assert.equal(result.sent, 4); assert.equal(result.stopReason, null); assert.equal(recoveries, 1);
          if (mode === 'uncertain-clean') { assert.equal(status.pending, 0); assert.equal(status.manual_review_required, 1); assert.equal(result.manualReviewRequired, 1); }
          else { assert.equal(status.pending, 1); assert.equal(result.retryScheduled, 1); }
        }
      }
      await endRun({ workspace: f.workspace, lock_token: f.lockToken });
      assert.equal((await queueStatus({ workspace: f.workspace })).lock, null);
    });
  }
  await test('pending backlog and pause cause are never hidden by NO_REPLY', async () => {
    assert.match(buildQueueSummary({ pendingRemaining: 4, manualReviewTotal: 2, stopReason: 'clean_context_unverified' }), /4 pending remaining.*2 total awaiting manual review.*Paused/);
    assert.match(buildQueueSummary({ pendingRemaining: 1 }), /1 pending remaining/);
    assert.equal(buildQueueSummary({ pendingRemaining: 0 }), 'NO_REPLY');
  });
  await test('independent reconciliation requires unique, complete, timed outgoing evidence', async () => {
    const row = { key: 'caption', outgoing: true, pending: false, textMatched: true, attachmentCount: 0, sentTimeMinutes: 1111 };
    const photo = { ...row, key: 'photos', textMatched: false, attachmentCount: 2 };
    const evidence = { messengerConversation: true, composerPresent: true, composerEmpty: true, rows: [row, photo] };
    const expected = { attachmentCount: 2, textExpected: true, submitMinute: 1111 };
    assert.deepEqual(findReviewCandidate(evidence, expected)?.candidateRowKeys, ['caption', 'photos']);
    for (const rows of [[row], [photo], [{ ...row, outgoing: false }, photo], [row, { ...photo, pending: true }], [row, { ...photo, sentTimeMinutes: null }], [row, { ...photo, attachmentCount: 1 }], [row, photo, { ...row, key: 'second-caption' }, { ...photo, key: 'second-album' }]]) {
      assert.equal(findReviewCandidate({ ...evidence, rows }, expected), null);
    }
    assert.equal(findReviewCandidate({ ...evidence, composerEmpty: false }, expected), null);
    assert.equal(findReviewCandidate(evidence, { ...expected, submitMinute: 1112 }), null);
  });
  await test('verification diagnostics cannot echo content, URLs, IDs or secrets', async () => {
    const result = verificationDiagnostic({ reason: 'https://private.invalid/token', beforeRows: 'private text', afterRows: 3, actualAttachments: -1, textVerified: true, rawPrompt: 'SECRET', account: 'private@example.invalid' });
    assert.equal(result, ' Evidence: {"afterRows":3,"textVerified":true}');
    assert.equal(verificationDiagnostic('secret'), '');
  });
} finally {
  assert.ok(path.resolve(root).startsWith(path.join(os.tmpdir(), 'fb-batch-sqa-')));
  await fs.rm(root, { recursive: true, force: true });
}
console.log(JSON.stringify({ ok: !failures.length, total, passed: total - failures.length, failures, externalMessagesSent: 0 }));
if (failures.length) process.exitCode = 1;
