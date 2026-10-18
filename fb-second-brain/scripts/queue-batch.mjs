import { claimNext, completeJob, failJob, markSubmitStarted } from './queue-worker.mjs';

export function verificationDiagnostic(value) {
  if (!value || typeof value !== 'object') return '';
  const result = {};
  if (['bundle_evidence_incomplete', 'history_boundary_unverified', 'history_order_unverified', 'reload_persistence_incomplete'].includes(value.reason)) result.reason = value.reason;
  for (const key of ['beforeRows', 'afterRows', 'actualAttachments', 'expectedAttachments', 'messageArticles', 'messageToolbars']) {
    if (Number.isSafeInteger(value[key]) && value[key] >= 0 && value[key] < 10000) result[key] = value[key];
  }
  for (const key of ['textVerified', 'mediaVerified', 'composerCleared', 'cueInLog']) if (typeof value[key] === 'boolean') result[key] = value[key];
  return Object.keys(result).length ? ` Evidence: ${JSON.stringify(result)}` : '';
}

// One lease, FIFO, one attempt per job per run. No failed/uncertain job is
// replayed. Continuing to a DIFFERENT job requires a clean reload proof.
export async function drainQueueBatch({ workspace, lockToken, profile = 'openclaw', send, recoverCleanContext, errorClass, onProgress = () => {} }) {
  const counts = { sent: 0, retryScheduled: 0, manualReviewRequired: 0, permanentlyFailed: 0, stopReason: null };
  const attempted = new Set();
  let consecutiveFailures = 0;
  while (true) {
    const claim = await claimNext({ workspace, lock_token: lockToken, browser_profile: profile, exclude_job_ids: [...attempted] });
    if (!claim.claimed) return counts;
    const jobId = claim.job.id;
    attempted.add(jobId);
    const params = { workspace, lock_token: lockToken, job_id: jobId };
    let result;
    try {
      if (claim.post_manifest?.ready !== true) throw new Error('queue_manifest_invalid');
      result = await send(claim.post_manifest.browser_handoff, () => markSubmitStarted(params));
    } catch (error) {
      const ambiguous = error?.sendAttempted === true || /delivery_verification_ambiguous/iu.test(String(error?.message || ''));
      const failure = await failJob({ ...params,
        error: ambiguous ? 'Send may have occurred but could not be verified; retained for manual review to prevent duplicate posting.' + verificationDiagnostic(error.verification) : errorClass(error),
        retryable: !ambiguous, send_attempted: ambiguous,
      });
      if (failure.retry_scheduled) counts.retryScheduled++;
      else if (failure.delivery_uncertain) counts.manualReviewRequired++;
      else counts.permanentlyFailed++;
      onProgress({ ...counts });
      if (++consecutiveFailures >= 3) { counts.stopReason = 'repeated_failures'; return counts; }
      let clean = false;
      try { clean = await recoverCleanContext(claim.post_manifest?.browser_handoff?.target_group || claim.job.fb_group); } catch {}
      if (clean !== true) { counts.stopReason = 'clean_context_unverified'; return counts; }
      continue;
    }
    // Persistence failures after verified Send must retain the processing job
    // for receipt-aware recovery, not misclassify it as a browser failure.
    await completeJob({ ...params, verified: true, verification_note: result.note, delivery_receipt: result.delivery_receipt });
    counts.sent++;
    onProgress({ ...counts });
    consecutiveFailures = 0;
  }
}
