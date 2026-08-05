import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_WORKSPACE,
  activeRouteForMemoryFile,
  ensureParent,
  isMain,
  mediaTitleSimilarity,
  normalizeAttachments,
  normalizeText,
  nowDhaka,
  printJson,
  readInput,
  readJsonLines,
} from './lib.mjs';
import { logMetadata } from './log-metadata.mjs';
import { prepareFbPost } from './post-to-fb-group.mjs';

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
  const locations = await ensureQueue(input);
  await ensureQueueNumbers(locations);
  const identityKey = queueIdentityKey(input);
  return withIdentityLock(locations, identityKey, () => enqueueMediaJobLocked(input, locations));
}

async function enqueueMediaJobLocked(input, locations) {
  const activeMatch = input.existing_queue_match;
  if (activeMatch?.job_id || Number.isInteger(activeMatch?.queue_number)) {
    const existing = await findByIdentity(locations, activeMatch);
    if (existing) {
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
    if (existing) {
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
      schema_version: 2,
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
      post_text: normalizeText(input.post_text ?? input.accompanying_text),
      privacy_reviewed: Boolean(input.privacy_reviewed),
      original_attachment_paths: originalAttachments,
      attachment_paths: queuedAttachments,
      payload_dir: queuedAttachments.length ? finalPayload : null,
      canonical_urls: normalizeStringArray(input.canonical_urls),
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

    const pendingPath = path.join(locations.pending, `${jobId}.json`);
    await writeJsonAtomic(pendingPath, job);
    queueCommitted = true;
    await appendEvent(locations, {
      event: 'enqueued',
      job_id: jobId,
      queue_number: queueNumber,
      fingerprint: job.content_fingerprint,
    });
    return {
      queued: true,
      job_id: jobId,
      queue_number: queueNumber,
      target_group: job.fb_group,
      queue_file: toWorkspaceRelative(locations.workspace, pendingPath),
      payload_paths: queuedAttachments.map((item) => toWorkspaceRelative(locations.workspace, item)),
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
  const token = crypto.randomUUID();
  const acquiredAt = new Date();
  const lock = {
    token,
    owner: normalizeText(input.owner) || 'main-cron',
    acquired_at: nowDhaka(acquiredAt),
    expires_at: nowDhaka(new Date(acquiredAt.getTime() + positiveInteger(input.lock_ttl_ms, LOCK_TTL_MS))),
  };

  try {
    const handle = await fs.open(locations.lock, 'wx');
    await handle.writeFile(`${JSON.stringify(lock, null, 2)}\n`, 'utf8');
    await handle.close();
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const current = await readJsonFile(locations.lock).catch(() => null);
    if (current && Date.parse(current.expires_at) > Date.now()) {
      return { acquired: false, busy: true, lock: publicLock(current) };
    }

    const stalePath = `${locations.lock}.stale-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    try {
      await fs.rename(locations.lock, stalePath);
    } catch (renameError) {
      if (renameError?.code === 'ENOENT') return beginRun(input);
      throw renameError;
    }
    await fs.rm(stalePath, { force: true });
    return beginRun(input);
  }

  const recovered = await recoverProcessing(locations);
  await appendEvent(locations, { event: 'run_started', lock_token: token, recovered });
  return { acquired: true, lock_token: token, expires_at: lock.expires_at, recovered };
}

export async function claimNext(input = {}) {
  const locations = await ensureQueue(input);
  const token = await requireLock(locations, input.lock_token);
  const candidates = await listJobs(locations.pending);
  const now = Date.now();

  for (const candidate of candidates) {
    const availableAt = Date.parse(candidate.job.available_at || candidate.job.created_at || 0);
    if (Number.isFinite(availableAt) && availableAt > now) continue;

    const processingPath = path.join(locations.processing, path.basename(candidate.file));
    try {
      await fs.rename(candidate.file, processingPath);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }

    const job = {
      ...candidate.job,
      state: 'processing',
      claimed_at: nowDhaka(),
      claim_token: token,
    };
    await writeJsonAtomic(processingPath, job);
    await appendEvent(locations, { event: 'claimed', job_id: job.id, lock_token: token });
    return { claimed: true, job, post_manifest: job.post_manifest };
  }

  return { claimed: false, empty: candidates.length === 0, deferred: candidates.length > 0 };
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

  const completed = {
    ...job,
    state: 'sent',
    verified_sent: true,
    verified_at: nowDhaka(),
    verification_note: verificationNote.slice(0, 500),
  };
  await writeJsonAtomic(jobPath, completed);
  const logResult = await logSentJob(locations, completed);
  await appendEvent(locations, { event: 'completed', job_id: jobId, verification_note: completed.verification_note });
  await fs.rm(jobPath, { force: true });
  await removePayload(locations, completed.payload_dir);
  return { completed: true, job_id: jobId, logged: logResult.logged || logResult.skipped === 'event_already_logged' };
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
  const retryable = input.retryable !== false && attempts < maxAttempts;
  const errorMessage = normalizeText(input.error ?? input.post_error) || 'Messenger post failed without details';
  const updated = {
    ...job,
    state: retryable ? 'pending' : 'failed',
    attempts,
    last_error: errorMessage.slice(0, 500),
    last_failed_at: nowDhaka(),
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
    available_at: updated.available_at,
  };
}

export async function endRun(input = {}) {
  const locations = await ensureQueue(input);
  const token = await requireLock(locations, input.lock_token);
  await appendEvent(locations, { event: 'run_ended', lock_token: token });
  await fs.rm(locations.lock, { force: true });
  return { released: true, lock_token: token };
}

export async function queueStatus(input = {}) {
  const locations = await ensureQueue(input);
  const numbering = await ensureQueueNumbers(locations);
  const [pending, processing, failed, lock] = await Promise.all([
    listJobs(locations.pending),
    listJobs(locations.processing),
    listJobs(locations.failed),
    readJsonFile(locations.lock).catch(() => null),
  ]);
  return {
    queue_root: toWorkspaceRelative(locations.workspace, locations.root),
    pending: pending.length,
    processing: processing.length,
    failed: failed.length,
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
  for (const candidate of processing) {
    const job = candidate.job;
    if (job.verified_sent) {
      await logSentJob(locations, job);
      await fs.rm(candidate.file, { force: true });
      await removePayload(locations, job.payload_dir);
      finalized += 1;
      continue;
    }
    const recovered = {
      ...job,
      state: 'pending',
      claim_token: null,
      claimed_at: null,
      available_at: nowDhaka(),
      recovery_note: 'Recovered after the previous worker lock expired or ended unexpectedly.',
    };
    await writeJsonAtomic(candidate.file, recovered);
    await fs.rename(candidate.file, path.join(locations.pending, path.basename(candidate.file)));
    requeued += 1;
  }
  return { requeued, finalized_verified: finalized };
}

async function logSentJob(locations, job) {
  return logMetadata({
    ...jobLogInput(job),
    workspace: locations.workspace,
    event_id: `queue:${job.id}:sent`,
    post_status: 'sent',
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

async function requireLock(locations, rawToken) {
  const token = normalizeText(rawToken);
  if (!token) throw new Error('lock_token is required');
  const lock = await readJsonFile(locations.lock).catch(() => null);
  if (!lock || lock.token !== token) throw new Error('Queue lock is missing or owned by another worker');
  if (Date.parse(lock.expires_at) <= Date.now()) throw new Error('Queue lock expired');
  return token;
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
    queue_root: toWorkspaceRelative(locations.workspace, locations.root),
    target_group: normalizeText(job.fb_group),
    route_updated: routeUpdated,
    previous_target_group: routeUpdated ? previousGroup : null,
    post_manifest: job.post_manifest ?? null,
  };
}

function equivalentJobMatch(job, input) {
  const inputUrls = new Set(normalizeStringArray(input.canonical_urls));
  const jobUrls = new Set(normalizeStringArray(job.canonical_urls));
  if ([...inputUrls].some((value) => jobUrls.has(value))) return 'canonical_url';

  const inputHashes = normalizedHashSet(input.attachment_hashes);
  const jobHashes = normalizedHashSet(job.attachment_hashes);
  if ([...inputHashes].some((value) => jobHashes.has(value))) return 'attachment_hash';

  const inputHasAttachment = normalizeAttachments(input).length > 0 || inputHashes.size > 0;
  const jobHasAttachment = normalizeStringArray(job.original_attachment_paths).length > 0 || jobHashes.size > 0;
  if (!inputHasAttachment || !jobHasAttachment) return null;
  const inputMemory = normalizedRoute(input.memory_file);
  const jobMemory = normalizedRoute(job.memory_file);
  if (!inputMemory || !jobMemory || inputMemory !== jobMemory) return null;
  return mediaTitleSimilarity(input.title, job.title).similar ? 'similar_media_title' : null;
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
  const activeMatch = input.existing_queue_match;
  const activeIdentity = normalizeText(activeMatch?.job_id)
    || (Number.isInteger(activeMatch?.queue_number) ? `queue:${activeMatch.queue_number}` : '');
  const urls = normalizeStringArray(input.canonical_urls).sort();
  const hashes = (Array.isArray(input.attachment_hashes) ? input.attachment_hashes : [])
    .flatMap((item) => [
      normalizeText(typeof item === 'string' ? item : item?.sha256),
      normalizeText(typeof item === 'object' ? item?.perceptual_hash : ''),
    ])
    .filter(Boolean)
    .sort();
  const fingerprint = normalizeText(input.content_fingerprint);
  const identity = activeIdentity
    ? `active:${activeIdentity}`
    : urls.length
      ? `urls:${urls.join('|')}`
      : hashes.length
        ? `hashes:${hashes.join('|')}`
        : fingerprint
          ? `fingerprint:${fingerprint}`
          : [
              `memory:${normalizedRoute(input.memory_file)}`,
              `source:${normalizeText(input.source)}`,
              `title:${normalizeText(input.title).toLocaleLowerCase('en-US')}`,
            ].join('|');
  return crypto.createHash('sha256').update(identity).digest('hex');
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
    try {
      const handle = await fs.open(locations.sequenceLock, 'wx');
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, created_at: nowDhaka() })}\n`, 'utf8');
      return handle;
    } catch (error) {
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
      jobs.push({ file, job: await readJsonFile(file) });
    } catch {
      // Leave malformed queue files untouched for manual inspection.
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
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporary, filePath);
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
