import fs from 'node:fs/promises';
import path from 'node:path';
import { WORKSPACE_ROOT, ensureBrowser, connectBrowser, runOpenClaw, parseJsonOutput, parseArgs } from './browser-runtime.mjs';
import { findPageByTargetId, openExactConversation } from './drain-messenger-queue.mjs';
import { captureConversationEvidence, deliveryPersistenceSatisfied } from './messenger-evidence.mjs';
import { beginRun, endRun, queueStatus, reconcileFailedJob } from './queue-worker.mjs';
import { digest } from './bundle.mjs';
import { isMain } from './lib.mjs';

// Independent operator recovery only. Never called by cron or by the sender.
// A unique full outgoing bundle, matching the recorded submit minute and
// surviving a fresh reload, may be recorded as ALREADY sent. No Send/attach/fill.
export function findReviewCandidate(evidence, { attachmentCount, textExpected, submitMinute }) {
  if (!evidence?.messengerConversation || !evidence.composerPresent || !evidence.composerEmpty) return null;
  const candidates = [];
  const rows = evidence.rows || [];
  for (let start = 0; start < rows.length; start++) {
    let count = 0, text = !textExpected;
    for (let end = start; end < rows.length; end++) {
      const row = rows[end];
      if (!row.outgoing || row.pending || (!row.attachmentCount && !row.textMatched)
        || row.sentTimeMinutes !== submitMinute) break;
      count += row.attachmentCount;
      text ||= row.textMatched;
      if (count > attachmentCount) break;
      if (count === attachmentCount && text) {
        candidates.push({ structurallyComplete: true, candidateRowKeys: rows.slice(start, end + 1).map(r => r.key) });
        break;
      }
    }
  }
  return candidates.length === 1 ? candidates[0] : null;
}

export async function reviewUncertainJob({ queueNumber, reconcile = false }) {
  if (!Number.isSafeInteger(queueNumber) || queueNumber < 1) throw new Error('explicit_queue_number_required');
  const status = await queueStatus({ workspace: WORKSPACE_ROOT });
  if (status.lock || status.processing) throw new Error('active_queue_worker_blocks_review');
  const failed = path.join(WORKSPACE_ROOT, '.queue/fb-second-brain/failed');
  const matches = [];
  for (const file of await fs.readdir(failed)) {
    if (!file.endsWith('.json')) continue;
    const job = JSON.parse(await fs.readFile(path.join(failed, file), 'utf8'));
    if (job.queue_number === queueNumber) matches.push({ job, file });
  }
  if (matches.length !== 1) throw new Error('one_uncertain_job_required');
  const { job, file } = matches[0], handoff = job.post_manifest?.browser_handoff;
  if (!job.submit_started_at || job.delivery_uncertain !== true || !handoff?.bundle
    || handoff.bundle.fingerprint !== job.bundle?.fingerprint || digest(handoff.message_text) !== job.bundle.message_text_sha256) throw new Error('sealed_uncertain_submit_required');
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(job.submit_started_at)).split(':').map(Number);
  const expected = { attachmentCount: job.bundle.attachments.length, textExpected: Boolean(handoff.message_text.trim()), submitMinute: parts[0] * 60 + parts[1] };
  let browser, page, targetId, lockToken;
  try {
    const browserStatus = await ensureBrowser('openclaw', { start: false });
    targetId = parseJsonOutput(runOpenClaw(['browser', '--json', '--browser-profile', 'openclaw', 'open', 'https://www.facebook.com/messages/']).stdout).targetId;
    if (!/^[a-f0-9]{16,64}$/iu.test(String(targetId))) throw new Error('owned_review_tab_required');
    const connection = await connectBrowser(browserStatus.cdpUrl); browser = connection.browser;
    page = await findPageByTargetId(connection.context, targetId);
    if (!page) throw new Error('owned_review_tab_missing');
    await openExactConversation(page, job.fb_group); await page.waitForTimeout(3000);
    const observed = await captureConversationEvidence(page, handoff.message_text);
    const candidate = findReviewCandidate(observed, expected);
    if (!candidate) return { queueNumber, verified: false, reason: 'unique_complete_outgoing_bundle_not_found', externalMessagesSent: 0 };
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await openExactConversation(page, job.fb_group);
    let persisted, verified = false;
    for (let sample = 0; sample < 20; sample++) {
      await page.waitForTimeout(750);
      persisted = await captureConversationEvidence(page, handoff.message_text);
      const currentCandidate = findReviewCandidate(persisted, expected);
      if (currentCandidate && deliveryPersistenceSatisfied(observed, persisted, candidate).confirmed) { verified = true; break; }
    }
    const result = { queueNumber, verified, completeCaptionVerified: verified && expected.textExpected, attachmentsVerified: verified ? expected.attachmentCount : 0,
      persistenceVerified: verified, externalMessagesSent: 0, reconciled: false };
    if (!verified || !reconcile) return result;
    const lease = await beginRun({ workspace: WORKSPACE_ROOT, owner: 'operator-readonly-reconciliation' });
    if (!lease.acquired) throw new Error('queue_busy_after_review');
    lockToken = lease.lock_token;
    const freshJob = JSON.parse(await fs.readFile(path.join(failed, file), 'utf8'));
    if (freshJob.submit_started_at !== job.submit_started_at || freshJob.bundle?.fingerprint !== job.bundle.fingerprint
      || freshJob.delivery_uncertain !== true) throw new Error('job_changed_during_independent_review');
    const recorded = await reconcileFailedJob({ workspace: WORKSPACE_ROOT, lock_token: lockToken, queue_number: queueNumber,
      verified: true, persistence_verified: true, reconciliation_method: 'server_reload_persistence',
      verification_note: 'Independent exact-group inspection: unique full caption and complete outgoing attachments at recorded submit minute persisted after full reload; empty composer. No resend.',
      delivery_receipt: { version: 1, bundle_fingerprint: job.bundle.fingerprint, target_group: job.fb_group, attachment_count: expected.attachmentCount,
        message_text_sha256: digest(handoff.message_text), link_count: job.bundle.canonical_urls.length, all_parts_verified: true, composer_empty: true },
    });
    return { ...result, reconciled: recorded.reconciled === true };
  } finally {
    try { if (lockToken) await endRun({ workspace: WORKSPACE_ROOT, lock_token: lockToken }); }
    finally {
      try {
        if (page) await page.close().catch(() => {});
        else if (targetId) runOpenClaw(['browser', '--browser-profile', 'openclaw', 'close', String(targetId)], { allowFailure: true });
      } finally { if (browser) await browser.close().catch(() => {}); }
    }
  }
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  try { console.log(JSON.stringify(await reviewUncertainJob({ queueNumber: Number(args['queue-number']), reconcile: args.reconcile === true }))); }
  catch (e) { console.log(JSON.stringify({ verified: false, error: /^[a-z_]{3,80}$/u.test(e.message) ? e.message : 'independent_review_failed', externalMessagesSent: 0 })); process.exitCode = 1; }
}
