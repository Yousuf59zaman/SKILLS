import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_WORKSPACE,
  activeRouteForMemoryFile,
  attachmentHashes,
  ensureParent,
  isMain,
  normalizeAttachments,
  normalizeText,
  nowDhaka,
  printJson,
  readInput,
  readJsonLines,
} from './lib.mjs';
import { logMetadata } from './log-metadata.mjs';
import { prepareFbPost } from './post-to-fb-group.mjs';
import { bundleMatchesManifest, equivalentBundle, makeBundleManifest, validateDeliveryReceipt } from './bundle.mjs';

const QUEUE_RELATIVE_ROOT = path.join('.queue', 'fb-second-brain');
const LOCK_TTL_MS = 80 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 5;
const SEQUENCE_LOCK_STALE_MS = 30 * 1000;
const SEQUENCE_LOCK_WAIT_MS = 30 * 1000;
const IDENTITY_LOCK_STALE_MS = 5 * 60 * 1000;
const IDENTITY_LOCK_WAIT_MS = 30 * 1000;

export async function enqueueMediaJob(input = {}) {
  const memoryRoute = activeRouteForMemoryFile(input.memory_file);
  if (memoryRoute) {
    input = {
      ...input,
      category: memoryRoute.category,
      fb_group: memoryRoute.fb_group,
      log_metadata_input: input.log_metadata_input
        ? {
          ...input.log_metadata_input,
          category: memoryRoute.category,
          memory_file: normalizeText(input.memory_file),
          fb_group: memoryRoute.fb_group,
        }
        : input.log_metadata_input,
    };
  }
  const preflight = await prepareFbPost(input);
  if (!preflight.ready) return { queued: false, skipped: preflight.blocked, reason: preflight.reason, post_manifest: preflight };
  const hashes = await attachmentHashes(input);
  const bundle = makeBundleManifest(input, hashes);
  if (input.bundle && !bundleMatchesManifest(input.bundle, bundle)) throw new Error('bundle_changed_before_enqueue');
  input = { ...input, bundle, post_text: preflight.browser_handoff.message_text, attachment_hashes: hashes, canonical_urls: bundle.canonical_urls, content_fingerprint: bundle.fingerprint };
  const locations = await ensureQueue(input);
  await ensureQueueNumbers(locations);
  const identityKey = queueIdentityKey(input);
  return withIdentityLock(locations, identityKey, () => enqueueMediaJobLocked(input, locations));
}

async function enqueueMediaJobLocked(input, locations) {
  const activeMatch = input.existing_queue_match;
  if (activeMatch?.job_id || Number.isInteger(activeMatch?.queue_number)) {
    const existing = await findByIdentity(locations, activeMatch);
    if (existing && equivalentBundle(existing.job, input, { allowPerceptual: normalizedRoute(existing.job.memory_file) === normalizedRoute(input.memory_file) })) {
      return reuseExistingJob(
        locations,
        existing,
        input,
        normalizeText(activeMatch.matched_by) || 'dedupe_check',
      );
    }
  }
  const fingerprint = normalizeText(input.content_fingerprint);
  if (fingerprint) {
    const existing = await findByFingerprint(locations, fingerprint);
    if (existing && equivalentBundle(existing.job, input)) {
      return reuseExistingJob(locations, existing, input, 'content_fingerprint');
    }
  }
  const equivalent = await findEquivalentJob(locations, input);
  if (equivalent) {
    return reuseExistingJob(locations, equivalent, input, equivalent.matched_by);
  }

  const jobId = makeJobId();
  const stagingPayload = path.join(locations.staging, jobId);
  const finalPayload = path.join(locations.payloads, jobId);
  const originalAttachments = normalizeAttachments(input);
  const queuedAttachments = [];
  let queueCommitted = false;

  try {
    if (originalAttachments.length) {
      await fs.mkdir(stagingPayload, { recursive: true });
      for (const [index, source] of originalAttachments.entries()) {
        const sourcePath = path.resolve(source);
        const stat = await fs.stat(sourcePath);
        if (!stat.isFile()) throw new Error(`Attachment is not a file: ${sourcePath}`);
        const filename = `${String(index + 1).padStart(2, '0')}-${safeFilename(path.basename(sourcePath))}`;
        const destination = path.join(stagingPayload, filename);
        await fs.copyFile(sourcePath, destination);
        queuedAttachments.push(destination.replace(stagingPayload, finalPayload));
      }
      await fs.rename(stagingPayload, finalPayload);
    }

    const postInput = {
      ...input,
      attachment_paths: queuedAttachments,
      browser_profile: normalizeText(input.browser_profile) || 'openclaw',
    };
    const copiedBundle = makeBundleManifest(postInput, await attachmentHashes(postInput));
    if (!bundleMatchesManifest(input.bundle, copiedBundle)) throw new Error('bundle_payload_copy_integrity_failed');
    const postManifest = await prepareFbPost(postInput);
    if (!postManifest.ready) {
      if (queuedAttachments.length) await fs.rm(finalPayload, { recursive: true, force: true });
      return {
        queued: false,
        skipped: postManifest.blocked,
        reason: postManifest.reason,
        post_manifest: postManifest,
      };
    }

    const queueNumber = await allocateQueueNumber(locations);
    const createdAt = nowDhaka();
    const job = {
      schema_version: 3,
      bundle: copiedBundle,
      expected_attachment_count: copiedBundle.attachment_count,
      id: jobId,
      queue_number: queueNumber,
      state: 'pending',
      created_at: createdAt,
      available_at: createdAt,
      attempts: 0,
      max_attempts: positiveInteger(input.max_attempts, DEFAULT_MAX_ATTEMPTS),
      content_fingerprint: fingerprint || null,
      type: normalizeText(input.type ?? input.content_type),
      title: normalizeText(input.title),
      text: normalizeText(input.text),
      source: normalizeText(input.source),
      summary: normalizeText(input.summary),
      tags: normalizeStringArray(input.tags),
      category: normalizeText(input.category),
      memory_file: normalizeText(input.memory_file),
      fb_group: normalizeText(input.fb_group),
      post_text: postManifest.browser_handoff.message_text,
      privacy_reviewed: Boolean(input.privacy_reviewed),
      original_attachment_paths: originalAttachments,
      attachment_paths: queuedAttachments,
      payload_dir: queuedAttachments.length ? finalPayload : null,
      canonical_urls: normalizeStringArray(input.canonical_urls),
      authoritative_urls: Array.isArray(input.authoritative_urls) ? input.authoritative_urls : undefined,
      attachment_hashes: Array.isArray(input.attachment_hashes) ? input.attachment_hashes : [],
      post_manifest: postManifest,
      log_metadata_input: input.log_metadata_input ?? {
        workspace: locations.workspace,
        type: normalizeText(input.type ?? input.content_type),
        title: normalizeText(input.title),
        text: normalizeText(input.text),
        source: normalizeText(input.source) || 'Telegram',
        summary: normalizeText(input.summary),
        category: normalizeText(input.category),
        memory_file: normalizeText(input.memory_file),
        fb_group: normalizeText(input.fb_group),
        date_saved: createdAt,
        tags: normalizeStringArray(input.tags),
        attachment_paths: originalAttachments,
        attachment_hashes: Array.isArray(input.attachment_hashes) ? input.attachment_hashes : [],
        canonical_urls: normalizeStringArray(input.canonical_urls),
        content_fingerprint: fingerprint || null,
        duplicate: false,
      },
    };
    job.log_metadata_input = { ...job.log_metadata_input, bundle: copiedBundle, content_fingerprint: copiedBundle.fingerprint };

    const pendingPath = path.join(locations.pending, `${jobId}.json`);
    await writeJsonAtomic(pendingPath, job);
    queueCommitted = true;
    await appendEvent(locations, {
      event: 'enqueued',
      job_id: jobId,
      queue_number: queueNumber,
      schema_version: job.schema_version,
      fingerprint: job.content_fingerprint,
    });
    return {
      queued: true,
      job_id: jobId,
      queue_number: queueNumber,
      target_group: job.fb_group,
      queue_file: toWorkspaceRelative(locations.workspace, pendingPath),
      payload_paths: queuedAttachments.map((item) => toWorkspaceRelative(locations.workspace, item)),
      bundle: { attachment_count: copiedBundle.attachment_count, link_count: copiedBundle.canonical_urls.length, has_text: copiedBundle.message_text_length > 0 },
      post_manifest: postManifest,
    };
  } catch (error) {
    await fs.rm(stagingPayload, { recursive: true, force: true }).catch(() => {});
    if (!queueCommitted) await fs.rm(finalPayload, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export async function beginRun(input = {}) {
  const locations = await ensureQueue(input);
  // Lease creation, expiry takeover and release share the existing short
  // metadata mutex. A second worker must never observe a half-written lease
  // and mistake it for a dead owner.
  const acquisition = await withSequenceLock(locations, async () => {
    const current = await readWorkerLock(locations);
    if (current && Date.parse(current.expires_at) > Date.now()) {
      return { acquired: false, busy: true, lock: publicLock(current) };
    }
    if (current) {
      const stalePath = `${locations.lock}.stale-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      await fs.rename(locations.lock, stalePath);
      await fs.rm(stalePath, { force: true });
    }
    const acquiredAt = new Date();
    const lock = {
      token: crypto.randomUUID(),
      owner: normalizeText(input.owner) || 'main-cron',
      acquired_at: nowDhaka(acquiredAt),
      expires_at: nowDhaka(new Date(acquiredAt.getTime() + positiveInteger(input.lock_ttl_ms, LOCK_TTL_MS))),
    };
    let handle;
    try {
      handle = await fs.open(locations.lock, 'wx');
      await handle.writeFile(`${JSON.stringify(lock, null, 2)}\n`, 'utf8');
      await handle.sync();
    } catch (error) {
      if (handle) {
        await handle.close().catch(() => {});
        handle = null;
        await fs.rm(locations.lock, { force: true }).catch(() => {});
      }
      throw error;
    } finally {
      if (handle) await handle.close();
    }
    return { acquired: true, lock_token: lock.token, expires_at: lock.expires_at };
  });
  if (!acquisition.acquired) return acquisition;

  try {
    const recovered = await recoverProcessing(locations);
    await appendEvent(locations, { event: 'run_started', lock_token: acquisition.lock_token, recovered });
    return { ...acquisition, recovered };
  } catch (error) {
    // The caller has not received its token yet. Do not strand the lease when
    // recovery or its audit write fails; never remove a replacement owner's.
    await withSequenceLock(locations, async () => {
      const current = await readWorkerLock(locations);
      if (current?.token === acquisition.lock_token) await fs.rm(locations.lock, { force: true });
    }).catch(() => {});
    throw error;
  }
}

export async function claimNext(input = {}) {
  const locations = await ensureQueue(input);
  const token = await requireLock(locations, input.lock_token);
  const candidates = await listJobs(locations.pending);
  const now = Date.now();
  const excluded = new Set(Array.isArray(input.exclude_job_ids) ? input.exclude_job_ids : []);

  for (const candidate of candidates) {
    if (excluded.has(candidate.job.id)) continue;
    const availableAt = Date.parse(candidate.job.available_at || candidate.job.created_at || 0);
    if (Number.isFinite(availableAt) && availableAt > now) continue;

    // Stored manifests are caches, never authorities. Rebuild from the durable
    // job payload at claim time so an old route update or copied manifest cannot
    // reference files that no longer belong to this queue item.
    const refreshed = await refreshJobPostManifest(candidate.job, input.browser_profile);
    const processingPath = path.join(locations.processing, path.basename(candidate.file));
    try {
      await fs.rename(candidate.file, processingPath);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }

    const job = {
      ...refreshed.job,
      state: 'processing',
      claimed_at: nowDhaka(),
      claim_token: token,
    };
    await writeJsonAtomic(processingPath, job);
    if (refreshed.changed) {
      await appendEvent(locations, {
        event: 'manifest_refreshed',
        job_id: job.id,
        queue_number: job.queue_number,
      });
    }
    await appendEvent(locations, {
      event: 'claimed',
      job_id: job.id,
      queue_number: job.queue_number,
      lock_token: token,
    });
    return { claimed: true, job, post_manifest: job.post_manifest };
  }

  return { claimed: false, empty: candidates.length === 0, deferred: candidates.length > 0 };
}

export async function retryFailedJob(input = {}) {
  const locations = await ensureQueue(input);
  const activeLock = await readWorkerLock(locations);
  if (activeLock && Date.parse(activeLock.expires_at) > Date.now()) {
    throw new Error('Cannot retry a failed job while the queue worker lock is active');
  }

  const requestedJobId = normalizeText(input.job_id);
  const requestedQueueNumber = Number(input.queue_number);
  const failedJobs = await listJobs(locations.failed);
  const candidate = failedJobs.find(({ job }) => (
    (requestedJobId && job.id === requestedJobId)
    || (Number.isInteger(requestedQueueNumber) && requestedQueueNumber > 0 && Number(job.queue_number) === requestedQueueNumber)
  ));
  if (!candidate) throw new Error('Failed queue job was not found');
  if (candidate.job.verified_sent) throw new Error('Verified-sent jobs cannot be retried');
  if ((candidate.job.submit_started_at || candidate.job.delivery_uncertain) && (input.confirmed_not_sent !== true || !normalizeText(input.reason))) {
    throw new Error('Uncertain delivery requires explicit confirmed_not_sent=true and a review reason; automatic replay is forbidden');
  }

  const refreshed = await refreshJobPostManifest(candidate.job, input.browser_profile);
  if (!refreshed.job.post_manifest?.ready) {
    throw new Error(`Failed queue job is not repairable: ${normalizeText(refreshed.job.post_manifest?.blocked) || 'manifest_invalid'}`);
  }

  const requeuedAt = nowDhaka();
  const updated = {
    ...refreshed.job,
    state: 'pending',
    attempts: 0,
    available_at: requeuedAt,
    claim_token: null,
    claimed_at: null,
    submit_started_at: null,
    delivery_uncertain: false,
    previous_failure: {
      attempts: Number(candidate.job.attempts || 0),
      error: normalizeText(candidate.job.last_error).slice(0, 500),
      failed_at: candidate.job.last_failed_at ?? null,
    },
    last_error: null,
    repair_note: normalizeText(input.reason).slice(0, 200) || 'Revalidated durable payload and rebuilt the Messenger handoff.',
    repaired_at: requeuedAt,
  };
  const destination = path.join(locations.pending, path.basename(candidate.file));
  await fs.access(destination).then(
    () => { throw new Error('Pending destination already exists for failed queue job'); },
    (error) => { if (error?.code !== 'ENOENT') throw error; },
  );
  await writeJsonAtomic(candidate.file, updated);
  await fs.rename(candidate.file, destination);
  await appendEvent(locations, {
    event: 'failed_job_requeued',
    job_id: updated.id,
    queue_number: updated.queue_number,
    previous_attempts: updated.previous_failure.attempts,
  });
  return {
    requeued: true,
    job_id: updated.id,
    queue_number: updated.queue_number,
    target_group: updated.fb_group,
    attempts: updated.attempts,
    manifest_refreshed: refreshed.changed,
  };
}

export async function completeJob(input = {}) {
  const locations = await ensureQueue(input);
  const token = await requireLock(locations, input.lock_token);
  const jobId = requireJobId(input.job_id);
  if (input.verified !== true) throw new Error('complete requires verified=true after a fresh Messenger snapshot');
  const verificationNote = normalizeText(input.verification_note);
  if (!verificationNote) throw new Error('complete requires a concise verification_note');

  const jobPath = path.join(locations.processing, `${jobId}.json`);
  const job = await readJsonFile(jobPath);
  if (job.claim_token !== token) throw new Error('Job is not claimed by this queue lock');
  const receipt = validateDeliveryReceipt(job, input.delivery_receipt);
  if (!job.submit_started_at) throw new Error('complete_requires_durable_submit_marker');

  const completed = {
    ...job,
    state: 'sent',
    verified_sent: true,
    verified_at: nowDhaka(),
    verification_note: verificationNote.slice(0, 500),
    delivery_receipt: receipt,
  };
  await writeJsonAtomic(jobPath, completed);
  const logResult = await logSentJob(locations, completed);
  await appendEvent(locations, {
    event: 'completed',
    job_id: jobId,
    queue_number: completed.queue_number,
    verification_note: completed.verification_note,
  });
  await fs.rm(jobPath, { force: true });
  await removePayload(locations, completed.payload_dir);
  return { completed: true, job_id: jobId, logged: logResult.logged || logResult.skipped === 'event_already_logged' };
}

// Resolve an uncertain post-Send failure only after an independent browser
// check proves the exact complete bundle survived a full Messenger reload.
// This never sends or requeues the job; it only records an already-committed
// delivery and then performs the normal verified payload cleanup.
export async function reconcileFailedJob(input = {}) {
  const locations = await ensureQueue(input);
  await requireLock(locations, input.lock_token);
  const requestedJobId = normalizeText(input.job_id);
  const requestedQueueNumber = Number(input.queue_number);
  const failedJobs = await listJobs(locations.failed);
  const candidate = failedJobs.find(({ job }) => (
    (requestedJobId && job.id === requireJobId(requestedJobId))
    || (Number.isInteger(requestedQueueNumber) && requestedQueueNumber > 0 && Number(job.queue_number) === requestedQueueNumber)
  ));
  if (!candidate) throw new Error('Failed queue job was not found');
  const job = candidate.job;
  if (!job.submit_started_at || job.delivery_uncertain !== true) throw new Error('reconcile_requires_uncertain_submit_marker');
  if (input.verified !== true || input.persistence_verified !== true || input.reconciliation_method !== 'server_reload_persistence') {
    throw new Error('reconcile_requires_server_reload_persistence');
  }
  const verificationNote = normalizeText(input.verification_note);
  if (!verificationNote) throw new Error('reconcile requires a concise verification_note');
  const receipt = validateDeliveryReceipt(job, input.delivery_receipt);
  const completed = {
    ...job,
    state: 'sent',
    verified_sent: true,
    verified_at: nowDhaka(),
    reconciled_at: nowDhaka(),
    reconciliation_method: 'server_reload_persistence',
    verification_note: verificationNote.slice(0, 500),
    delivery_receipt: receipt,
  };
  await writeJsonAtomic(candidate.file, completed);
  const logResult = await logSentJob(locations, completed);
  await appendEvent(locations, {
    event: 'reconciled_failed_as_sent',
    job_id: completed.id,
    queue_number: completed.queue_number,
    reconciliation_method: completed.reconciliation_method,
  });
  await fs.rm(candidate.file, { force: true });
  await removePayload(locations, completed.payload_dir);
  return {
    completed: true,
    reconciled: true,
    job_id: completed.id,
    queue_number: completed.queue_number,
    logged: logResult.logged || logResult.skipped === 'event_already_logged',
  };
}

// Close an audit-only enqueue that a post-success model tool deleted before it
// was ever claimed. This is deliberately narrower than repair/requeue: a job
// with a remaining file/payload or any worker lifecycle event needs inspection.
export async function invalidateOrphanedEnqueue(input = {}) {
  const locations = await ensureQueue(input);
  await requireLock(locations, input.lock_token);
  const jobId = requireJobId(input.job_id);
  const queueNumber = Number(input.queue_number);
  if (!validQueueNumber(queueNumber)) throw new Error('A valid queue_number is required');
  if (input.reason_code !== 'stale_cross_turn_media_attribution' || input.operator_verified_no_external_action !== true) {
    throw new Error('orphan_invalidation_requires_verified_stale_cross_turn_proof');
  }
  if (await findByIdentity(locations, { job_id: jobId, queue_number: queueNumber })) {
    throw new Error('orphan_invalidation_refuses_existing_job');
  }
  const payloadPath = path.join(locations.payloads, jobId);
  if (await fs.stat(payloadPath).then(() => true).catch(() => false)) {
    throw new Error('orphan_invalidation_refuses_existing_payload');
  }
  const events = (await readJsonLines(locations.events)).filter((event) => event?.job_id === jobId);
  const enqueued = events.filter((event) => event.event === 'enqueued' && Number(event.queue_number) === queueNumber);
  if (enqueued.length !== 1) throw new Error('orphan_invalidation_requires_one_matching_enqueue');
  if (events.some((event) => event.event === 'orphaned_enqueue_invalidated')) {
    return { invalidated: false, skipped: 'already_invalidated', job_id: jobId, queue_number: queueNumber };
  }
  const unsafeLifecycle = events.filter((event) => event.event !== 'enqueued');
  if (unsafeLifecycle.length) throw new Error('orphan_invalidation_refuses_worker_lifecycle');
  await appendEvent(locations, {
    event: 'orphaned_enqueue_invalidated',
    job_id: jobId,
    queue_number: queueNumber,
    reason_code: 'stale_cross_turn_media_attribution',
    external_action: false,
  });
  return { invalidated: true, job_id: jobId, queue_number: queueNumber, external_action: false };
}

// Persist before the one Send click. If the process dies anywhere after this
// point, recovery retains the whole payload for review instead of replaying it.
export async function markSubmitStarted(input = {}) {
  const locations = await ensureQueue(input);
  const jobId = requireJobId(input.job_id);
  return withIdentityLock(locations, 'submit-' + jobId, async () => {
    const token = await requireLock(locations, input.lock_token);
    const jobPath = path.join(locations.processing, `${jobId}.json`);
    const job = await readJsonFile(jobPath);
    if (job.claim_token !== token || !job.post_manifest?.ready) throw new Error('submit_requires_valid_claimed_bundle');
    if (job.submit_started_at || job.verified_sent || job.delivery_uncertain) throw new Error('bundle_submit_already_attempted');
    const refreshed = await refreshJobPostManifest(job, 'openclaw');
    if (!refreshed.job.post_manifest?.ready) throw new Error('bundle_integrity_changed_before_send');
    await writeJsonAtomic(jobPath, { ...job, submit_started_at: nowDhaka() });
    await appendEvent(locations, { event: 'submit_started', job_id: job.id, queue_number: job.queue_number, attachment_count: job.bundle.attachment_count });
    return { marked: true };
  });
}

export async function failJob(input = {}) {
  const locations = await ensureQueue(input);
  const token = await requireLock(locations, input.lock_token);
  const jobId = requireJobId(input.job_id);
  const jobPath = path.join(locations.processing, `${jobId}.json`);
  const job = await readJsonFile(jobPath);
  if (job.claim_token !== token) throw new Error('Job is not claimed by this queue lock');
  if (job.verified_sent) throw new Error('Verified-sent jobs must be completed, never failed or reposted');

  const attempts = Number(job.attempts || 0) + 1;
  const maxAttempts = positiveInteger(job.max_attempts, DEFAULT_MAX_ATTEMPTS);
  const uncertain = Boolean(job.submit_started_at || job.delivery_uncertain || input.send_attempted);
  const retryable = !uncertain && input.retryable !== false && attempts < maxAttempts;
  const errorMessage = normalizeText(input.error ?? input.post_error) || 'Messenger post failed without details';
  const updated = {
    ...job,
    state: retryable ? 'pending' : 'failed',
    attempts,
    last_error: errorMessage.slice(0, 500),
    last_failed_at: nowDhaka(),
    delivery_uncertain: uncertain,
    available_at: retryable
      ? nowDhaka(new Date(Date.now() + retryDelayMs(attempts)))
      : null,
    claim_token: null,
    claimed_at: null,
  };
  const destination = path.join(retryable ? locations.pending : locations.failed, `${jobId}.json`);
  await writeJsonAtomic(jobPath, updated);
  await fs.rename(jobPath, destination);
  await appendEvent(locations, {
    event: retryable ? 'retry_scheduled' : 'failed_permanently',
    job_id: jobId,
    queue_number: job.queue_number,
    attempts,
    error: updated.last_error,
  });

  if (!retryable) {
    await logMetadata({
      ...jobLogInput(updated),
      workspace: locations.workspace,
      event_id: `queue:${jobId}:failed`,
      post_status: 'failed',
      post_error: updated.last_error,
    });
  }

  return {
    failed: true,
    job_id: jobId,
    retry_scheduled: retryable,
    attempts,
    max_attempts: maxAttempts,
    delivery_uncertain: uncertain,
    available_at: updated.available_at,
  };
}

export async function endRun(input = {}) {
  const locations = await ensureQueue(input);
  return withSequenceLock(locations, async () => {
    const token = await requireLock(locations, input.lock_token);
    try {
      await appendEvent(locations, { event: 'run_ended', lock_token: token });
    } finally {
      // An audit failure remains visible, but cannot strand our completed run.
      // The metadata mutex prevents this unlink from touching a newer owner.
      await fs.rm(locations.lock, { force: true });
    }
    return { released: true, lock_token: token };
  });
}

export async function queueStatus(input = {}) {
  const locations = await ensureQueue(input);
  const numbering = await ensureQueueNumbers(locations);
  const [pending, processing, failed, lock] = await Promise.all([
    listJobs(locations.pending),
    listJobs(locations.processing),
    listJobs(locations.failed),
    withSequenceLock(locations, () => readWorkerLock(locations)),
  ]);
  return {
    queue_root: toWorkspaceRelative(locations.workspace, locations.root),
    pending: pending.length,
    processing: processing.length,
    failed: failed.length,
    manual_review_required: failed.filter(({ job }) => job.delivery_uncertain === true).length,
    next_available_at: pending[0]?.job?.available_at ?? null,
    last_queue_number: numbering.last_assigned,
    next_queue_number: numbering.next_queue_number,
    lock: lock ? publicLock(lock) : null,
  };
}

export async function assignMissingQueueNumbers(input = {}) {
  return ensureQueueNumbers(await ensureQueue(input));
}

async function ensureQueue(input = {}) {
  const workspace = path.resolve(input.workspace || DEFAULT_WORKSPACE);
  const requested = normalizeText(input.queue_root);
  const root = requested
    ? path.resolve(path.isAbsolute(requested) ? requested : path.join(workspace, requested))
    : path.join(workspace, QUEUE_RELATIVE_ROOT);
  const relative = path.relative(workspace, root);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('queue_root must be a child directory inside the OpenClaw workspace');
  }
  const locations = {
    workspace,
    root,
    pending: path.join(root, 'pending'),
    processing: path.join(root, 'processing'),
    failed: path.join(root, 'failed'),
    payloads: path.join(root, 'payloads'),
    staging: path.join(root, 'staging'),
    events: path.join(root, 'events.jsonl'),
    lock: path.join(root, 'worker-lock.json'),
    sequence: path.join(root, 'queue-sequence.json'),
    sequenceLock: path.join(root, 'queue-sequence.lock'),
  };
  await Promise.all([
    locations.pending,
    locations.processing,
    locations.failed,
    locations.payloads,
    locations.staging,
  ].map((directory) => fs.mkdir(directory, { recursive: true })));
  return locations;
}

async function recoverProcessing(locations) {
  const processing = await listJobs(locations.processing);
  let requeued = 0;
  let finalized = 0;
  let uncertain = 0;
  for (const candidate of processing) {
    const job = candidate.job;
    if (job.verified_sent) {
      try {
        validateDeliveryReceipt(job, job.delivery_receipt);
        if (!job.submit_started_at) throw new Error('missing_submit_marker');
      } catch {
        job.verified_sent = false;
        job.delivery_uncertain = true;
      }
    }
    if (job.verified_sent) {
      await logSentJob(locations, job);
      const history = await readJsonLines(locations.events);
      if (!history.some((event) => event?.event === 'completed' && event.job_id === job.id && event.queue_number === job.queue_number)) {
        await appendEvent(locations, {
          event: 'completed', job_id: job.id, queue_number: job.queue_number,
          recovered_verified: true,
        });
      }
      await fs.rm(candidate.file, { force: true });
      await removePayload(locations, job.payload_dir);
      finalized += 1;
      continue;
    }
    const ambiguous = Boolean(job.submit_started_at || job.delivery_uncertain);
    const recovered = {
      ...job,
      state: ambiguous ? 'failed' : 'pending',
      delivery_uncertain: ambiguous,
      claim_token: null,
      claimed_at: null,
      available_at: nowDhaka(),
      recovery_note: ambiguous ? 'Send may have committed. Retained complete bundle; inspect before any manual retry.' : 'Recovered before Send after the previous worker ended unexpectedly.',
    };
    await writeJsonAtomic(candidate.file, recovered);
    await fs.rename(candidate.file, path.join(ambiguous ? locations.failed : locations.pending, path.basename(candidate.file)));
    if (ambiguous) uncertain += 1; else requeued += 1;
  }
  return { requeued, finalized_verified: finalized, retained_uncertain: uncertain };
}

async function logSentJob(locations, job) {
  return logMetadata({
    ...jobLogInput(job),
    workspace: locations.workspace,
    event_id: `queue:${job.id}:sent`,
    post_status: 'sent',
    bundle: job.bundle,
    delivery_receipt: job.delivery_receipt,
  });
}

function jobLogInput(job) {
  return job.log_metadata_input ?? {
    type: job.type,
    title: job.title,
    text: job.text,
    source: job.source || 'Telegram',
    summary: job.summary,
    category: job.category,
    memory_file: job.memory_file,
    fb_group: job.fb_group,
    date_saved: job.created_at,
    tags: job.tags,
    attachment_paths: job.original_attachment_paths,
    attachment_hashes: job.attachment_hashes,
    canonical_urls: job.canonical_urls,
    content_fingerprint: job.content_fingerprint,
    duplicate: false,
  };
}

async function readWorkerLock(locations) {
  let lock;
  try {
    lock = await readJsonFile(locations.lock);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw new Error('queue_lock_unreadable');
  }
  if (!lock || typeof lock !== 'object' || Array.isArray(lock)
    || typeof lock.token !== 'string' || !lock.token.trim()
    || !Number.isFinite(Date.parse(lock.acquired_at))
    || !Number.isFinite(Date.parse(lock.expires_at))) {
    throw new Error('queue_lock_unreadable');
  }
  return lock;
}

async function requireLock(locations, rawToken) {
  const token = normalizeText(rawToken);
  if (!token) throw new Error('lock_token is required');
  const lock = await readWorkerLock(locations);
  if (!lock || lock.token !== token) throw new Error('Queue lock is missing or owned by another worker');
  if (Date.parse(lock.expires_at) <= Date.now()) throw new Error('Queue lock expired');
  return token;
}

async function refreshJobPostManifest(job, browserProfile = 'openclaw') {
  const input = {
    ...job,
    attachment_paths: normalizeStringArray(job.attachment_paths),
    browser_profile: normalizeText(browserProfile) || 'openclaw',
  };
  if (Number(job.schema_version) < 3 && !normalizeText(job.post_text)) delete input.post_text;
  let actualBundle;
  let integrityError = null;
  try {
    if (Number(job.schema_version) >= 3 && !job.bundle) throw new Error('bundle_seal_missing');
    input.expected_attachment_count = job.bundle?.attachment_count ?? job.original_attachment_paths?.length ?? input.attachment_paths.length;
    actualBundle = makeBundleManifest(input, await attachmentHashes(input));
    if (job.bundle && !bundleMatchesManifest(job.bundle, actualBundle)) throw new Error('bundle_payload_integrity_changed');
  } catch (error) { integrityError = error.message; }
  const postManifest = integrityError
    ? { ready: false, blocked: 'bundle_integrity_failed', reason: integrityError, target_group: job.fb_group }
    : await prepareFbPost({ ...input, bundle: actualBundle });
  const refreshedJob = {
    ...job,
    ...(actualBundle && !integrityError ? { schema_version: 3, bundle: actualBundle, expected_attachment_count: actualBundle.attachment_count, post_text: postManifest.browser_handoff?.message_text ?? input.post_text } : {}),
    fb_group: normalizeText(postManifest.target_group) || normalizeText(job.fb_group),
    post_manifest: postManifest,
  };
  return {
    job: refreshedJob,
    changed: stableJson(job.post_manifest ?? null) !== stableJson(postManifest),
  };
}

function stableJson(value) {
  // prepareFbPost builds properties in a deterministic order.  A replacer made
  // only from the top-level keys silently removed nested manifest fields, so it
  // could miss a stale browser handoff.  Preserve the complete manifest when
  // comparing the durable payload with its cached projection.
  return JSON.stringify(value);
}

async function findByFingerprint(locations, fingerprint) {
  for (const [state, directory] of [
    ['pending', locations.pending],
    ['processing', locations.processing],
    ['failed', locations.failed],
  ]) {
    for (const candidate of await listJobs(directory)) {
      if (candidate.job.content_fingerprint === fingerprint) return { state, ...candidate };
    }
  }
  return null;
}

async function findByIdentity(locations, identity) {
  for (const [state, directory] of [
    ['pending', locations.pending],
    ['processing', locations.processing],
    ['failed', locations.failed],
  ]) {
    for (const candidate of await listJobs(directory)) {
      if (identity.job_id && candidate.job.id === identity.job_id) return { state, ...candidate };
      if (Number.isInteger(identity.queue_number) && candidate.job.queue_number === identity.queue_number) {
        return { state, ...candidate };
      }
    }
  }
  return null;
}

async function findEquivalentJob(locations, input) {
  for (const [state, directory] of [
    ['pending', locations.pending],
    ['processing', locations.processing],
    ['failed', locations.failed],
  ]) {
    for (const candidate of await listJobs(directory)) {
      const matchedBy = equivalentJobMatch(candidate.job, input);
      if (matchedBy) return { state, ...candidate, matched_by: matchedBy };
    }
  }
  return null;
}

async function reuseExistingJob(locations, existing, input, matchedBy) {
  const previousGroup = normalizeText(existing.job.fb_group);
  const desiredGroup = normalizeText(input.fb_group);
  const desiredMemory = normalizeText(input.memory_file);
  const desiredCategory = normalizeText(input.category);
  const mappedRoute = activeRouteForMemoryFile(desiredMemory);
  const existingMappedRoute = activeRouteForMemoryFile(existing.job.memory_file);
  const mapCorrectionRequired = Boolean(
    mappedRoute
    && normalizedRoute(existing.job.memory_file) === normalizedRoute(desiredMemory)
    && previousGroup !== desiredGroup,
  );
  const specificityUpgrade = Boolean(
    mappedRoute
    && !['favorite', 'others'].includes(mappedRoute.category)
    && (!existingMappedRoute || ['favorite', 'others'].includes(existingMappedRoute.category)),
  );
  const routeChanged = (input.route_override === true || mapCorrectionRequired || specificityUpgrade)
    && existing.state !== 'processing'
    && desiredGroup
    && (
      previousGroup !== desiredGroup
      || normalizedRoute(existing.job.memory_file) !== normalizedRoute(desiredMemory)
      || normalizeText(existing.job.category) !== desiredCategory
    );
  let job = existing.job;
  let routeUpdated = false;

  if (routeChanged) {
    const postManifest = await prepareFbPost({
      ...existing.job,
      ...input,
      attachment_paths: normalizeStringArray(existing.job.attachment_paths),
      browser_profile: normalizeText(input.browser_profile) || 'openclaw',
    });
    if (postManifest.ready) {
      const incomingTags = normalizeStringArray(input.tags);
      const incomingUrls = normalizeStringArray(input.canonical_urls);
      job = {
        ...existing.job,
        type: normalizeText(input.type ?? input.content_type) || normalizeText(existing.job.type),
        title: normalizeText(input.title) || normalizeText(existing.job.title),
        text: normalizeText(input.text) || normalizeText(existing.job.text),
        source: normalizeText(input.source) || normalizeText(existing.job.source),
        summary: normalizeText(input.summary) || normalizeText(existing.job.summary),
        tags: incomingTags.length ? incomingTags : normalizeStringArray(existing.job.tags),
        category: desiredCategory,
        memory_file: desiredMemory,
        fb_group: desiredGroup,
        post_text: normalizeText(input.post_text ?? input.accompanying_text),
        privacy_reviewed: Boolean(input.privacy_reviewed),
        canonical_urls: incomingUrls.length ? incomingUrls : normalizeStringArray(existing.job.canonical_urls),
        post_manifest: postManifest,
        log_metadata_input: {
          ...(existing.job.log_metadata_input ?? {}),
          ...(input.log_metadata_input ?? {}),
          category: desiredCategory,
          memory_file: desiredMemory,
          fb_group: desiredGroup,
          attachment_paths: normalizeStringArray(existing.job.original_attachment_paths),
          attachment_hashes: existing.job.attachment_hashes ?? [],
          content_fingerprint: existing.job.content_fingerprint ?? null,
        },
        route_updated_at: nowDhaka(),
      };
      await writeJsonAtomic(existing.file, job);
      await appendEvent(locations, {
        event: 'route_updated',
        job_id: job.id,
        queue_number: job.queue_number,
        from_group: previousGroup,
        to_group: desiredGroup,
        from_memory_file: normalizeText(existing.job.memory_file),
        to_memory_file: desiredMemory,
        from_category: normalizeText(existing.job.category),
        to_category: desiredCategory,
        matched_by: matchedBy,
      });
      routeUpdated = true;
    }
  }

  return {
    queued: false,
    skipped: 'already_queued',
    matched_by: matchedBy,
    job_id: job.id,
    queue_number: job.queue_number,
    queue_state: existing.state,
    review_required: existing.state === 'failed',
    delivery_uncertain: Boolean(job.delivery_uncertain),
    bundle: job.bundle ? { attachment_count: job.bundle.attachment_count, link_count: job.bundle.canonical_urls.length, has_text: job.bundle.message_text_length > 0 } : null,
    queue_root: toWorkspaceRelative(locations.workspace, locations.root),
    target_group: normalizeText(job.fb_group),
    route_updated: routeUpdated,
    previous_target_group: routeUpdated ? previousGroup : null,
    post_manifest: job.post_manifest ?? null,
  };
}

function equivalentJobMatch(job, input) {
  return equivalentBundle(job, input, { allowPerceptual: normalizedRoute(job.memory_file) === normalizedRoute(input.memory_file) });
}

function normalizedHashSet(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return new Set(values.map((item) => normalizeText(
    typeof item === 'string' ? item : item?.sha256 ?? item?.hash,
  )).filter(Boolean));
}

function normalizedRoute(value) {
  return normalizeText(value).toLocaleLowerCase('en-US').replace(/\\/g, '/');
}

async function ensureQueueNumbers(locations) {
  return withSequenceLock(locations, async () => {
    const candidates = [
      ...(await listJobs(locations.pending)),
      ...(await listJobs(locations.processing)),
      ...(await listJobs(locations.failed)),
    ].sort(compareJobCandidates);
    let lastAssigned = await highestKnownQueueNumber(locations, candidates);
    const assigned = [];

    for (const candidate of candidates) {
      if (validQueueNumber(candidate.job.queue_number)) continue;
      lastAssigned += 1;
      const numbered = {
        ...candidate.job,
        schema_version: Math.max(2, Number(candidate.job.schema_version) || 1),
        queue_number: lastAssigned,
      };
      await writeJsonAtomic(candidate.file, numbered);
      await appendEvent(locations, {
        event: 'queue_number_assigned',
        job_id: numbered.id,
        queue_number: numbered.queue_number,
      });
      assigned.push({ job_id: numbered.id, queue_number: numbered.queue_number });
    }

    await writeSequence(locations, lastAssigned);
    return {
      assigned,
      last_assigned: lastAssigned,
      next_queue_number: lastAssigned + 1,
    };
  });
}

async function allocateQueueNumber(locations) {
  return withSequenceLock(locations, async () => {
    const lastAssigned = await highestKnownQueueNumber(locations);
    const queueNumber = lastAssigned + 1;
    await writeSequence(locations, queueNumber);
    return queueNumber;
  });
}

async function highestKnownQueueNumber(locations, candidates = null) {
  const sequence = await readJsonFile(locations.sequence).catch(() => null);
  const jobs = candidates ?? [
    ...(await listJobs(locations.pending)),
    ...(await listJobs(locations.processing)),
    ...(await listJobs(locations.failed)),
  ];
  const events = await readJsonLines(locations.events);
  return Math.max(
    0,
    validQueueNumber(sequence?.last_assigned) ? Number(sequence.last_assigned) : 0,
    ...jobs.map((candidate) => validQueueNumber(candidate.job.queue_number) ? Number(candidate.job.queue_number) : 0),
    ...events.map((event) => validQueueNumber(event?.queue_number) ? Number(event.queue_number) : 0),
  );
}

async function writeSequence(locations, lastAssigned) {
  await writeJsonAtomic(locations.sequence, {
    schema_version: 1,
    last_assigned: lastAssigned,
    next_queue_number: lastAssigned + 1,
    updated_at: nowDhaka(),
  });
}

function queueIdentityKey(input) {
  if (!input.bundle?.fingerprint) throw new Error('complete_bundle_identity_required');
  return input.bundle.fingerprint;
}

async function withIdentityLock(locations, identityKey, run) {
  const lockPath = path.join(locations.staging, `.identity-${identityKey}.lock`);
  const deadline = Date.now() + IDENTITY_LOCK_WAIT_MS;
  let handle = null;

  while (Date.now() < deadline) {
    try {
      handle = await fs.open(lockPath, 'wx');
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, created_at: nowDhaka() })}\n`, 'utf8');
      break;
    } catch (error) {
      await handle?.close().catch(() => {});
      handle = null;
      if (!isTransientLockError(error)) throw error;
      const stat = await fs.stat(lockPath).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs > IDENTITY_LOCK_STALE_MS) {
        await fs.rm(lockPath, { force: true }).catch((removeError) => {
          if (!isTransientLockError(removeError) && removeError?.code !== 'ENOENT') throw removeError;
        });
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  if (!handle) throw new Error('Timed out waiting for the queue content-identity lock');

  try {
    return await run();
  } finally {
    await handle.close().catch(() => {});
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        await fs.rm(lockPath, { force: true });
        break;
      } catch (error) {
        if (!isTransientLockError(error)) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
  }
}

function isTransientLockError(error) {
  return ['EEXIST', 'EPERM', 'EACCES', 'EBUSY'].includes(error?.code);
}

async function withSequenceLock(locations, run) {
  const handle = await acquireSequenceLock(locations);
  try {
    return await run();
  } finally {
    await handle.close().catch(() => {});
    await fs.rm(locations.sequenceLock, { force: true }).catch(() => {});
  }
}

async function acquireSequenceLock(locations) {
  const deadline = Date.now() + SEQUENCE_LOCK_WAIT_MS;
  while (Date.now() < deadline) {
    let handle = null;
    try {
      handle = await fs.open(locations.sequenceLock, 'wx');
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, created_at: nowDhaka() })}\n`, 'utf8');
      return handle;
    } catch (error) {
      if (handle) {
        await handle.close().catch(() => {});
        await fs.rm(locations.sequenceLock, { force: true }).catch(() => {});
      }
      // Windows can surface a contested create-new lock as EPERM/EACCES/EBUSY
      // instead of EEXIST while another process still owns the file handle.
      // They are safe to treat as bounded contention here; genuinely unusable
      // paths still fail with the explicit timeout below.
      if (!isTransientLockError(error)) throw error;
      const stat = await fs.stat(locations.sequenceLock).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs > SEQUENCE_LOCK_STALE_MS) {
        await fs.rm(locations.sequenceLock, { force: true }).catch((removeError) => {
          if (!isTransientLockError(removeError) && removeError?.code !== 'ENOENT') throw removeError;
        });
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw new Error('Timed out waiting for the queue sequence lock');
}

function compareJobCandidates(left, right) {
  const leftTime = Date.parse(left.job.created_at || left.job.available_at || 0) || 0;
  const rightTime = Date.parse(right.job.created_at || right.job.available_at || 0) || 0;
  return leftTime - rightTime || left.job.id.localeCompare(right.job.id);
}

function validQueueNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0;
}

async function listJobs(directory) {
  const names = (await fs.readdir(directory).catch((error) => {
    if (error?.code === 'ENOENT') return [];
    throw error;
  })).filter((name) => name.endsWith('.json'));
  const jobs = [];
  for (const name of names) {
    const file = path.join(directory, name);
    try {
      const job = await readJsonFile(file);
      if (!job || typeof job !== 'object' || Array.isArray(job) || typeof job.id !== 'string' || !job.id.trim()) {
        throw new Error('queue_job_unreadable');
      }
      jobs.push({ file, job });
    } catch (error) {
      // A normal claim/completion can move a file after readdir. Other I/O or
      // JSON failures are not an empty queue or permission to enqueue again.
      if (error?.code === 'ENOENT') continue;
      throw new Error('queue_job_unreadable');
    }
  }
  return jobs.sort((left, right) => {
    const leftTime = Date.parse(left.job.available_at || left.job.created_at || 0) || 0;
    const rightTime = Date.parse(right.job.available_at || right.job.created_at || 0) || 0;
    return leftTime - rightTime || left.job.id.localeCompare(right.job.id);
  });
}

async function readJsonFile(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function writeJsonAtomic(filePath, value) {
  await ensureParent(filePath);
  const temporary = `${filePath}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  let handle;
  try {
    handle = await fs.open(temporary, 'wx');
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(temporary, filePath);
  } finally {
    if (handle) await handle.close().catch(() => {});
    await fs.unlink(temporary).catch((error) => { if (error?.code !== 'ENOENT') throw error; });
  }
}

async function appendEvent(locations, entry) {
  await fs.appendFile(locations.events, `${JSON.stringify({ at: nowDhaka(), ...entry })}\n`, 'utf8');
}

async function removePayload(locations, payloadDir) {
  if (!payloadDir) return;
  const resolved = path.resolve(payloadDir);
  const relative = path.relative(locations.payloads, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Refusing to remove a payload directory outside this queue');
  }
  await fs.rm(resolved, { recursive: true, force: true });
}

function makeJobId() {
  return `${new Date().toISOString().replace(/[-:.TZ]/g, '')}-${crypto.randomBytes(6).toString('hex')}`;
}

function safeFilename(value) {
  const safe = normalizeText(value).replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').slice(0, 120);
  return safe || 'attachment.bin';
}

function requireJobId(value) {
  const jobId = normalizeText(value);
  if (!/^[a-zA-Z0-9_-]+$/.test(jobId)) throw new Error('A valid job_id is required');
  return jobId;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function retryDelayMs(attempt) {
  return Math.min(6 * 60 * 60 * 1000, 5 * 60 * 1000 * (2 ** Math.max(0, attempt - 1)));
}

function normalizeStringArray(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(list.map(normalizeText).filter(Boolean))];
}

function publicLock(lock) {
  return { owner: lock.owner, acquired_at: lock.acquired_at, expires_at: lock.expires_at };
}

function toWorkspaceRelative(workspace, filePath) {
  return path.relative(workspace, filePath).replace(/\\/g, '/');
}

async function runCli() {
  const action = normalizeText(process.argv[2]) || 'status';
  const input = await readInput(process.argv.slice(3));
  const actions = {
    enqueue: enqueueMediaJob,
    'assign-numbers': assignMissingQueueNumbers,
    'begin-run': beginRun,
    'claim-next': claimNext,
    'mark-submit-started': markSubmitStarted,
    'retry-failed': retryFailedJob,
    'reconcile-failed': reconcileFailedJob,
    'invalidate-orphaned-enqueue': invalidateOrphanedEnqueue,
    complete: completeJob,
    fail: failJob,
    'end-run': endRun,
    status: queueStatus,
  };
  const handler = actions[action];
  if (!handler) throw new Error(`Unknown queue action: ${action}`);
  printJson(await handler(input));
}

if (isMain(import.meta.url)) {
  try {
    await runCli();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
