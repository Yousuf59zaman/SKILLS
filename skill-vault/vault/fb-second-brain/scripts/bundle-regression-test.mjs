import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareFbPost } from './post-to-fb-group.mjs';
import { prepareDrop } from './prepare-drop.mjs';
import { buildQueueSummary, deliveryEvidenceSatisfied } from './drain-messenger-queue.mjs';
import { deliveryPersistenceSatisfied } from './messenger-evidence.mjs';
import { deliverBundle, waitForStableHistory } from './bundle-sender.mjs';
import { beginRun, claimNext, completeJob, endRun, failJob, invalidateOrphanedEnqueue, markSubmitStarted, reconcileFailedJob, retryFailedJob } from './queue-worker.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fb-bundle-sqa-'));
const files = [];
const failures = [];
let total = 0;
async function test(name, run) {
  total++;
  try { await run(); } catch (error) { failures.push({ name, error: error.message.split('\n')[0] }); }
}
async function workspace(name) {
  const result = path.join(root, name);
  await fs.mkdir(path.join(result, 'memory'), { recursive: true });
  return result;
}
const caption = 'একসাথে রাখো: পাহাড়, নদী এবং বৃষ্টির স্মৃতি।\nSecond line, unchanged.';
const links = ['https://example.org/place-one', 'https://example.org/place-two'];
const base = { type: 'image', category: 'funny', memory_file: 'memory/funny-posts.md', fb_group: 'meme boi', title: 'Bundle canary', source: 'Telegram' };
function fakeBrowser(handoff, fault = '') {
  let time = 0;
  let attached = [];
  let typed = '';
  const counters = { sends: 0, marks: 0, attaches: 0, clears: 0 };
  const baseline = { version: 2, host: 'www.facebook.com', path: '/messages/t/fixture', messengerConversation: true, composerPresent: true, composerEmpty: true, rows: [] };
  const io = {
    now: () => time,
    sleep: async (ms) => { time += ms; },
    open: async () => {},
    draft: async () => ({ composerPresent: true, textEmpty: fault === 'existing-draft' ? false : !typed, textMatches: fault !== 'missing-caption' && typed === handoff.message_text,
      attachmentCount: fault === 'partial-upload' ? Math.min(1, attached.length) : attached.length,
      files: attached.map((file, index) => ({ name: fault === 'wrong-name' ? 'wrong.jpg' : path.basename(file), size: handoff.attachment_sizes[index] + (fault === 'wrong-size' ? 1 : 0) })), uploadBusy: fault === 'upload-busy', uploadFailed: fault === 'upload-failed' }),
    attach: async (paths) => { counters.attaches++; attached = [...paths]; },
    fill: async (text) => { typed = text; },
    sendReady: async () => fault !== 'disabled-send',
    send: async () => { assert.equal(counters.marks, 1); counters.sends++; if (fault === 'click-error') throw new Error('simulated_click_delivery_unknown'); },
    clearOwnedDraft: async () => { counters.clears++; attached = []; typed = ''; },
    history: async () => {
      if (!counters.sends || fault === 'unchanged') return baseline;
      const row = { key: 'new-bundle', outgoing: true, attachmentCount: fault === 'partial-delivery' ? 1 : handoff.attachment_paths.length, textMatched: fault !== 'caption-not-delivered', delivered: !['sending-only', 'persisted-no-status', 'optimistic-disappears'].includes(fault) };
      const rows = [row];
      if (fault === 'interleaved') rows.push({ key: 'incoming', outgoing: false, attachmentCount: 0, textMatched: false, delivered: true });
      if (fault === 'extra-media') row.attachmentCount++;
      return { ...baseline, rows, path: fault === 'wrong-conversation' ? '/messages/t/other' : baseline.path, composerEmpty: fault !== 'uncleared-composer' };
    },
  };
  if (fault === 'persisted-no-status') io.reloadHistory = async () => io.history();
  if (fault === 'optimistic-disappears') io.reloadHistory = async () => baseline;
  return { io, counters };
}
try {
  for (let n = 0; n < 12; n++) {
    const file = path.join(root, `fixture-${n}.jpg`);
    // Deliberately not real user media. Queue and integrity tests need bytes,
    // not a browser upload; sender UI coverage uses a separate local fixture.
    await fs.writeFile(file, Buffer.from(`isolated-bundle-fixture-${n}`));
    files.push(file);
  }
  for (const count of [4, 6, 10]) {
    await test(`${count} attachments preserve multiline text and every link`, async () => {
      const result = await prepareFbPost({ ...base, attachment_paths: files.slice(0, count), text: `${caption}\n${links.join('\n')}` });
      assert.equal(result.ready, true);
      assert.deepEqual(result.browser_handoff.attachment_paths, files.slice(0, count));
      assert.equal(result.browser_handoff.message_text, `${caption}\n${links.join('\n')}`);
    });
  }
  await test('explicit caption does not discard separately supplied links', async () => {
    const result = await prepareFbPost({ ...base, attachment_paths: files.slice(0, 4), post_text: caption, canonical_urls: links });
    assert.equal(result.browser_handoff.message_text, `${caption}\n\n${links.join('\n')}`);
  });
  await test('link-only bundle includes every URL', async () => {
    const result = await prepareFbPost({ ...base, type: 'link', canonical_urls: links });
    assert.equal(result.browser_handoff.message_text, links.join('\n'));
  });
  await test('one overlapping attachment never discards the rest of a new bundle', async () => {
    const w = await workspace('partial-overlap');
    const first = await prepareDrop({ ...base, workspace: w, attachment_paths: files.slice(0, 1) });
    const second = await prepareDrop({ ...base, workspace: w, attachment_paths: files.slice(0, 6), text: caption });
    assert.equal(first.status, 'queued');
    assert.equal(second.status, 'queued');
    assert.notEqual(second.queue_number, first.queue_number);
    assert.equal(second.post_manifest.browser_handoff.attachment_paths.length, 6);
    assert.equal(second.memory.saved, true);
  });
  await test('shared link cannot collapse two different media bundles', async () => {
    const w = await workspace('shared-link');
    const first = await prepareDrop({ ...base, workspace: w, attachment_paths: files.slice(0, 4), canonical_urls: links });
    const second = await prepareDrop({ ...base, workspace: w, attachment_paths: files.slice(4, 10), canonical_urls: links });
    assert.equal(second.status, 'queued');
    assert.notEqual(second.queue_number, first.queue_number);
  });
  await test('identical full bundle reuses exactly one queue item', async () => {
    const w = await workspace('exact-duplicate');
    const input = { ...base, workspace: w, attachment_paths: files.slice(0, 10), text: caption, canonical_urls: links };
    const first = await prepareDrop(input);
    const second = await prepareDrop(input);
    assert.equal(second.status, 'already_queued');
    assert.equal(second.queue_number, first.queue_number);
  });
  await test('repeated attachment paths preserve intended album multiplicity', async () => {
    const w = await workspace('repeated-image');
    const result = await prepareDrop({ ...base, workspace: w, attachment_paths: [files[0], files[0], files[1]], expected_attachment_count: 3, text: caption });
    assert.equal(result.status, 'queued');
    assert.equal(result.post_manifest.browser_handoff.attachment_paths.length, 3);
    assert.equal(new Set(result.post_manifest.browser_handoff.attachment_paths).size, 3);
  });
  await test('privacy-reviewed caption never reintroduces removed private links', async () => {
    const result = await prepareFbPost({ ...base, memory_file: 'memory/office-funny-prompts.md', attachment_paths: files.slice(0, 4), text: 'Confidential context https://private.example.org/private-link', source: 'https://private.example.org/private-link', post_text: 'Public sanitized caption', privacy_reviewed: true });
    assert.equal(result.ready, true);
    assert.equal(result.browser_handoff.message_text, 'Public sanitized caption');
    assert.deepEqual(result.browser_handoff.canonical_urls, []);
  });
  await test('expected album count mismatch creates no partial queue job', async () => {
    const w = await workspace('expected-count');
    const result = await prepareDrop({ ...base, workspace: w, attachment_paths: files.slice(0, 4), expected_attachment_count: 6, text: caption });
    assert.equal(result.status, 'memory_saved_queue_failed');
    assert.equal(result.queue, null);
    assert.equal(result.post_manifest.ready, false);
  });
  await test('concurrent identical bundles allocate one complete payload and serial', async () => {
    const w = await workspace('bundle-concurrent');
    const input = { ...base, workspace: w, attachment_paths: files.slice(0, 6), text: caption, canonical_urls: links };
    const { enqueueMediaJob } = await import('./queue-worker.mjs');
    const results = await Promise.all(Array.from({ length: 16 }, () => enqueueMediaJob(input)));
    assert.equal(results.filter((result)=>result.queued).length, 1);
    assert.equal(new Set(results.map((result)=>result.queue_number)).size, 1);
    assert.ok(results.every((result)=>result.post_manifest.browser_handoff.attachment_paths.length===6));
  });
  await test('file type mix stays in original order with text and all links', async () => {
    const w = await workspace('mixed-media');
    const video = path.join(root, 'fixture-video.mp4'), audio = path.join(root, 'fixture-audio.opus');
    await fs.writeFile(video, 'synthetic-video-bytes'); await fs.writeFile(audio, 'synthetic-audio-bytes');
    const result = await prepareDrop({ ...base, workspace: w, attachment_paths: [files[0], video, audio, files[1]], text: caption, canonical_urls: [...links].reverse() });
    assert.equal(result.status, 'queued');
    assert.deepEqual(result.post_manifest.browser_handoff.attachment_paths.map((p)=>path.extname(p)), ['.jpg','.mp4','.opus','.jpg']);
    const expectedText = `${caption}\n\n${[...links].reverse().join('\n')}`;
    assert.equal(result.post_manifest.browser_handoff.message_text, expectedText);
    const run=await beginRun({workspace:w});const claimed=await claimNext({workspace:w,lock_token:run.lock_token});
    assert.equal(claimed.post_manifest.ready,true);
    assert.equal(claimed.post_manifest.browser_handoff.message_text, expectedText);
    assert.equal(claimed.post_manifest.browser_handoff.bundle.fingerprint, result.dedupe.bundle.fingerprint);
    await endRun({workspace:w,lock_token:run.lock_token});
  });
  const before = { messengerConversation: true, path: '/messages/t/fixture', logSignature: 'old', deliverySignature: 'old', mediaSignature: 'old', rowCount: 4, mediaCount: 0, rightMediaCount: 0, textCueCount: 0, composerPresent: true, composerContainsCue: false };
  const after = { ...before, logSignature: 'new', deliverySignature: 'sent', mediaSignature: 'new', rowCount: 5, mediaCount: 1, rightMediaCount: 1 };
  await test('one new image cannot verify a ten-image bundle', async () => {
    assert.equal(deliveryEvidenceSatisfied(before, after, { attachmentCount: 10 }).confirmed, false);
  });
  await test('images without the requested caption cannot verify a mixed bundle', async () => {
    assert.equal(deliveryEvidenceSatisfied(before, { ...after, mediaCount: 10, rightMediaCount: 10 }, { attachmentCount: 10, messageText: caption }).confirmed, false);
  });
  await test('layout movement alone is never attachment evidence', async () => {
    assert.equal(deliveryEvidenceSatisfied(before, { ...before, logSignature: 'shifted', mediaSignature: 'shifted', deliverySignature: 'changed' }, { attachmentCount: 4 }).confirmed, false);
  });
  await test('server-persisted complete row can replace a missing terminal status label', async () => {
    const w = await workspace('persisted-no-status');
    const handoff = (await prepareDrop({ ...base, workspace: w, attachment_paths: files.slice(0, 2), text: '' })).post_manifest.browser_handoff;
    const browser = fakeBrowser(handoff, 'persisted-no-status');
    const result = await deliverBundle(handoff, browser.io, async () => { browser.counters.marks++; });
    assert.equal(result.verified, true);
    assert.equal(result.delivery_receipt.attachment_count, 2);
    assert.match(result.note, /server-persisted/);
    assert.equal(browser.counters.sends, 1);
  });
  await test('optimistic row disappearing on reload is never delivery proof', async () => {
    const w = await workspace('optimistic-disappears');
    const handoff = (await prepareDrop({ ...base, workspace: w, attachment_paths: files.slice(0, 2), text: '' })).post_manifest.browser_handoff;
    const browser = fakeBrowser(handoff, 'optimistic-disappears');
    await assert.rejects(deliverBundle(handoff, browser.io, async () => { browser.counters.marks++; }), /delivery_verification_ambiguous/);
    assert.equal(browser.counters.sends, 1);
  });
  await test('persistence proof rejects a missing, pending, or wrong-conversation row', async () => {
    const observed = { version: 2, host: 'www.facebook.com', path: '/messages/t/fixture', messengerConversation: true, composerPresent: true, composerEmpty: true, rows: [{ key: 'candidate', outgoing: true, pending: false }] };
    const candidate = { structurallyComplete: true, candidateRowKeys: ['candidate'] };
    assert.equal(deliveryPersistenceSatisfied(observed, observed, candidate).confirmed, true);
    assert.equal(deliveryPersistenceSatisfied(observed, { ...observed, rows: [] }, candidate).confirmed, false);
    assert.equal(deliveryPersistenceSatisfied(observed, { ...observed, rows: [{ key: 'candidate', outgoing: true, pending: true }] }, candidate).confirmed, false);
    assert.equal(deliveryPersistenceSatisfied(observed, { ...observed, path: '/messages/t/other' }, candidate).confirmed, false);
  });
  await test('uncertain delivery is reported as manual review, not permanent failure', async () => {
    assert.equal(buildQueueSummary({ manualReviewRequired: 1 }), 'Messenger queue: 0 sent, 0 retry scheduled, 1 manual review required, 0 permanently failed.');
    assert.equal(buildQueueSummary({}), 'NO_REPLY');
  });
  await test('late rendering above the pre-Send history boundary cannot contaminate a new bundle', async () => {
    const base = { version: 2, host: 'www.facebook.com', path: '/messages/t/synthetic', messengerConversation: true, composerPresent: true, composerEmpty: true };
    const old = { key: 'old-preview-before-hydration', outgoing: false, attachmentCount: 0, textMatched: false, pending: false };
    const boundary = { ...old, key: 'last-existing-album', outgoing: true, attachmentCount: 2 };
    const message = { ...old, key: 'new-link-only', outgoing: true, textMatched: true, delivered: true };
    const before = { ...base, rows: [old, boundary] };
    const after = { ...base, rows: [{ ...old, key: 'old-preview-after-hydration' }, boundary, message] };
    assert.equal(deliveryEvidenceSatisfied(before, after, { messageText: 'Synthetic caption', attachmentCount: 0 }).confirmed, true);
    assert.equal(deliveryEvidenceSatisfied(before, { ...after, rows: [message] }, { messageText: 'Synthetic caption', attachmentCount: 0 }).confirmed, false, 'a missing boundary is uncertain');
    assert.equal(deliveryEvidenceSatisfied(before, { ...after, rows: [boundary, { ...old, key: 'interleaved-incoming' }, message] }, { messageText: 'Synthetic caption', attachmentCount: 0 }).confirmed, false, 'incoming after boundary remains unsafe');
  });
  await test('pre-Send baseline waits for real Messenger history hydration, not composer visibility', async () => {
    let now = 0;
    const base = { version: 2, host: 'www.facebook.com', path: '/messages/t/synthetic', messengerConversation: true, composerPresent: true };
    const io = { now: () => now, sleep: async ms => { now += ms; }, history: async () => ({ ...base, rows: [{ key: now < 500 ? 'skeleton' : now < 2000 ? 'hydrating' : 'real-history' }] }) };
    const result = await waitForStableHistory(io, base);
    assert.equal(result.rows[0].key, 'real-history'); assert.ok(now >= 5000);
    now = 0; io.history = async () => ({ ...base, rows: [{ key: String(now) }] });
    await assert.rejects(waitForStableHistory(io, base), /history_not_stable_no_send/);
    now = 0; io.history = async () => ({ ...base, path: '/messages/t/wrong', rows: [] });
    await assert.rejects(waitForStableHistory(io, base), /conversation_changed_before_submit/);
  });
  await test('link article appearing only after reload requires a second persistence reload and one Send', async () => {
    const w = await workspace('link-hydrates-after-reload');
    const h = (await prepareDrop({ ...base, workspace: w, type: 'link', canonical_urls: links, text: 'Synthetic public link test' })).post_manifest.browser_handoff;
    const browser = fakeBrowser(h, 'persisted-no-status');
    const history = browser.io.history;
    const baseline = await history();
    let reloaded = false, reloads = 0;
    browser.io.history = async () => reloaded ? history() : baseline;
    browser.io.reloadHistory = async () => { reloaded = true; reloads++; return history(); };
    const result = await deliverBundle(h, browser.io, async () => { browser.counters.marks++; });
    assert.equal(result.verified, true); assert.equal(reloads, 2); assert.equal(browser.counters.sends, 1);
  });
  for (const count of [4, 6, 10]) {
    await test(`${count}-file full producer/claim/one-Send/receipt/cleanup lifecycle`, async () => {
      const w = await workspace(`lifecycle-${count}`);
      const prepared = await prepareDrop({ ...base, workspace: w, attachment_paths: files.slice(0, count), text: caption, canonical_urls: links });
      const run = await beginRun({ workspace: w, owner: 'offline-sqa' });
      const params = { workspace: w, lock_token: run.lock_token, job_id: prepared.queue.job_id };
      const claim = await claimNext(params);
      const browser = fakeBrowser(claim.post_manifest.browser_handoff);
      const result = await deliverBundle(claim.post_manifest.browser_handoff, browser.io, async () => { await markSubmitStarted(params); browser.counters.marks++; });
      assert.equal(browser.counters.sends, 1);
      assert.equal(browser.counters.attaches, 1);
      assert.equal(result.delivery_receipt.attachment_count, count);
      assert.equal((await completeJob({ ...params, verified: true, verification_note: result.note, delivery_receipt: result.delivery_receipt })).completed, true);
      await assert.rejects(fs.access(claim.job.payload_dir));
      await endRun(params);
      const duplicate = await prepareDrop({ ...base, workspace: w, attachment_paths: files.slice(0, count), text: caption, canonical_urls: links });
      assert.equal(duplicate.status, 'duplicate_skipped');
    });
  }
  for (const fault of ['existing-draft', 'partial-upload', 'wrong-name', 'wrong-size', 'upload-busy', 'upload-failed', 'missing-caption', 'disabled-send', 'click-error', 'partial-delivery', 'caption-not-delivered', 'unchanged', 'sending-only', 'interleaved', 'extra-media', 'wrong-conversation', 'uncleared-composer']) {
    await test(`safe sender fault: ${fault}`, async () => {
      const w = await workspace(`sender-${fault}`);
      const job = await prepareDrop({ ...base, workspace: w, attachment_paths: files.slice(0, 10), text: caption, canonical_urls: links });
      const browser = fakeBrowser(job.post_manifest.browser_handoff, fault);
      const beforeSendFault = ['existing-draft', 'partial-upload', 'wrong-name', 'wrong-size', 'upload-busy', 'upload-failed', 'missing-caption', 'disabled-send'].includes(fault);
      let caught;
      try { await deliverBundle(job.post_manifest.browser_handoff, browser.io, async () => { browser.counters.marks++; }); } catch (error) { caught = error; }
      assert.ok(caught);
      assert.equal(browser.counters.sends, beforeSendFault ? 0 : 1);
      assert.equal(Boolean(caught.sendAttempted), !beforeSendFault);
      if (fault === 'existing-draft') assert.equal(browser.counters.clears, 0);
    });
  }
  await test('crash after durable Send marker retains bundle and prohibits replay', async () => {
    const w = await workspace('crash-after-send');
    const job = await prepareDrop({ ...base, workspace: w, attachment_paths: files.slice(0, 6), text: caption });
    let run = await beginRun({ workspace: w, owner: 'offline-sqa' });
    let params = { workspace: w, lock_token: run.lock_token, job_id: job.queue.job_id };
    await claimNext(params);
    await markSubmitStarted(params);
    await assert.rejects(markSubmitStarted(params), /already_attempted/);
    await endRun(params); // Simulate process death before result/fail was saved.
    run = await beginRun({ workspace: w, owner: 'recovery-sqa' });
    params.lock_token = run.lock_token;
    assert.equal((await claimNext(params)).claimed, false);
    await endRun(params);
    await assert.rejects(retryFailedJob({ workspace: w, job_id: job.queue.job_id }), /confirmed_not_sent/);
    const retained = JSON.parse(await fs.readFile(path.join(w, '.queue/fb-second-brain/failed', job.queue.job_id + '.json'), 'utf8'));
    assert.equal(retained.delivery_uncertain, true);
    assert.equal(retained.attachment_paths.length, 6);
  });
  await test('independent server-persistence reconciliation completes without another Send', async () => {
    const w = await workspace('server-persistence-reconcile');
    const input = { ...base, workspace: w, attachment_paths: files.slice(0, 2), text: '' };
    const prepared = await prepareDrop(input);
    let run = await beginRun({ workspace: w, owner: 'offline-sqa' });
    let params = { workspace: w, lock_token: run.lock_token, job_id: prepared.queue.job_id };
    const claimed = await claimNext(params);
    await markSubmitStarted(params);
    await failJob({ ...params, retryable: false, send_attempted: true, error: 'simulated missing status label' });
    await endRun(params);
    run = await beginRun({ workspace: w, owner: 'reconciliation-sqa' });
    params = { workspace: w, lock_token: run.lock_token, job_id: prepared.queue.job_id };
    const bundle = claimed.job.bundle;
    const receipt = { version: 1, bundle_fingerprint: bundle.fingerprint, target_group: claimed.job.fb_group, attachment_count: bundle.attachment_count, message_text_sha256: bundle.message_text_sha256, link_count: bundle.canonical_urls.length, all_parts_verified: true, composer_empty: true };
    await assert.rejects(reconcileFailedJob({ ...params, verified: true, delivery_receipt: receipt }), /server_reload_persistence/);
    const reconciled = await reconcileFailedJob({ ...params, verified: true, persistence_verified: true, reconciliation_method: 'server_reload_persistence', verification_note: 'Synthetic row persisted after reload.', delivery_receipt: receipt });
    assert.equal(reconciled.reconciled, true);
    await endRun(params);
    await assert.rejects(fs.access(claimed.job.payload_dir));
    const duplicate = await prepareDrop(input);
    assert.equal(duplicate.status, 'duplicate_skipped');
  });
  await test('a deleted pre-claim stale-cross-turn enqueue can only be audit-invalidated with exact proof', async () => {
    const w = await workspace('orphaned-enqueue-invalidation');
    const prepared = await prepareDrop({ ...base, workspace: w, attachment_paths: files.slice(0, 2), text: caption });
    const stored = JSON.parse(await fs.readFile(path.join(w, prepared.queue.queue_file), 'utf8'));
    await fs.rm(path.join(w, prepared.queue.queue_file), { force: true });
    await fs.rm(stored.payload_dir, { recursive: true, force: true });
    const run = await beginRun({ workspace: w, owner: 'orphan-invalidation-sqa' });
    const params = { workspace: w, lock_token: run.lock_token, job_id: prepared.queue.job_id, queue_number: prepared.queue.queue_number };
    await assert.rejects(invalidateOrphanedEnqueue(params), /verified_stale_cross_turn_proof/);
    const invalidated = await invalidateOrphanedEnqueue({ ...params, reason_code: 'stale_cross_turn_media_attribution', operator_verified_no_external_action: true });
    assert.equal(invalidated.invalidated, true);
    assert.equal(invalidated.external_action, false);
    const repeated = await invalidateOrphanedEnqueue({ ...params, reason_code: 'stale_cross_turn_media_attribution', operator_verified_no_external_action: true });
    assert.equal(repeated.skipped, 'already_invalidated');
    await endRun(params);
  });
  for (const mutation of ['missing-file', 'changed-bytes', 'missing-path', 'changed-caption', 'missing-seal']) {
    await test(`sealed bundle rejects ${mutation} before Send`, async () => {
      const w = await workspace(`integrity-${mutation}`);
      const job = await prepareDrop({ ...base, workspace: w, attachment_paths: files.slice(0, 6), text: caption });
      const jobFile = path.join(w, job.queue.queue_file);
      const stored = JSON.parse(await fs.readFile(jobFile, 'utf8'));
      if (mutation === 'missing-file') await fs.unlink(stored.attachment_paths[0]);
      if (mutation === 'changed-bytes') await fs.writeFile(stored.attachment_paths[0], 'different canary bytes');
      if (mutation === 'missing-path') stored.attachment_paths.pop();
      if (mutation === 'changed-caption') stored.post_text = 'Incomplete';
      if (mutation === 'missing-seal') delete stored.bundle;
      await fs.writeFile(jobFile, JSON.stringify(stored));
      const run = await beginRun({ workspace: w, owner: 'offline-sqa' });
      const params = { workspace: w, lock_token: run.lock_token, job_id: job.queue.job_id };
      const claim = await claimNext(params);
      assert.equal(claim.post_manifest.ready, false);
      await assert.rejects(markSubmitStarted(params));
      await endRun(params);
    });
  }
  await test('boolean verified without complete receipt can never delete a bundle', async () => {
    const w = await workspace('false-positive-complete');
    const job = await prepareDrop({ ...base, workspace: w, attachment_paths: files.slice(0, 10), text: caption });
    const run = await beginRun({ workspace: w, owner: 'offline-sqa' });
    const params = { workspace: w, lock_token: run.lock_token, job_id: job.queue.job_id };
    const claim = await claimNext(params);
    await markSubmitStarted(params);
    await assert.rejects(completeJob({ ...params, verified: true, verification_note: 'One image appeared' }), /full_bundle_receipt/);
    assert.equal((await fs.readdir(claim.job.payload_dir)).length, 10);
    const failure = await failJob({ ...params, retryable: true, error: 'simulated renderer crash' });
    assert.equal(failure.retry_scheduled, false);
    assert.equal(failure.delivery_uncertain, true);
    await endRun(params);
  });
} finally {
  if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep + 'fb-bundle-sqa-')) throw new Error('Unsafe test cleanup target');
  await fs.rm(root, { recursive: true, force: true });
}
console.log(JSON.stringify({ ok: failures.length === 0, total, passed: total - failures.length, failed: failures.length, failures }));
if (failures.length) process.exitCode = 1;
