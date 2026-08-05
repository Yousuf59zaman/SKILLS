import { checkDuplicate } from './dedupe-check.mjs';
import { isMain, isMediaPresent, normalizeIncomingMedia, printJson, readInput } from './lib.mjs';
import { logMetadata } from './log-metadata.mjs';
import { prepareFbPost } from './post-to-fb-group.mjs';
import { enqueueMediaJob } from './queue-worker.mjs';
import { saveToMemory } from './save-to-memory.mjs';
import { validateAgentRoute } from './validate-agent-route.mjs';

export async function prepareDrop(input = {}) {
  input = normalizeIncomingMedia(input);
  const classification = validateAgentRoute(input);
  if (classification.needs_review) {
    return {
      status: 'needs_review',
      reason: 'The producer does not classify topics. The OpenClaw agent must inspect the content and supply a valid category + memory_file pair.',
      classification,
      wrote_memory: false,
    };
  }

  const enriched = {
    ...input,
    type: classification.content_type,
    category: classification.category,
    memory_file: classification.memory_file,
    fb_group: classification.fb_group,
    // Every accepted route is an intentional OpenClaw-agent decision. The
    // producer only validates it and derives the exact group from the map.
    route_override: true,
  };
  const dedupe = await checkDuplicate(enriched);
  const memoryDuplicate = Boolean(dedupe.memory_duplicate ?? dedupe.duplicate);
  const deliveryDuplicate = Boolean(dedupe.delivery_duplicate);
  const saveResult = await saveToMemory({
    ...enriched,
    duplicate: memoryDuplicate,
    dedupe,
    content_fingerprint: dedupe.content_fingerprint,
  });
  const mediaPresent = isMediaPresent(enriched);
  const logInput = mediaPresent ? {
    ...(saveResult.metadata ?? {}),
    workspace: input.workspace,
    type: classification.content_type,
    title: input.title ?? saveResult.metadata?.title,
    text: input.text,
    source: input.source,
    summary: input.summary,
    category: classification.category,
    memory_file: classification.memory_file,
    fb_group: classification.fb_group,
    date_saved: saveResult.date_saved,
    tags: input.tags,
    attachment_paths: input.attachment_paths ?? input.attachments,
    attachment_hashes: dedupe.attachment_hashes,
    canonical_urls: dedupe.canonical_urls,
    content_fingerprint: dedupe.content_fingerprint,
    duplicate: deliveryDuplicate,
    post_status: deliveryDuplicate
      ? 'skipped_duplicate'
      : classification.post_allowed
        ? null
        : 'memory_only',
  } : null;

  const postManifest = await prepareFbPost({
    ...enriched,
    duplicate: deliveryDuplicate,
    content_fingerprint: dedupe.content_fingerprint,
    browser_profile: 'openclaw',
  });
  let queue = null;
  let metadataLog = null;
  let queueError = null;

  if (mediaPresent && !input.dry_run) {
    if (postManifest.ready) {
      try {
        queue = await enqueueMediaJob({
          ...enriched,
          duplicate: deliveryDuplicate,
          content_fingerprint: dedupe.content_fingerprint,
          canonical_urls: dedupe.canonical_urls,
          attachment_hashes: dedupe.attachment_hashes,
          existing_queue_match: dedupe.active_queue_match,
          browser_profile: 'openclaw',
          log_metadata_input: logInput,
        });
      } catch (error) {
        queueError = error.message;
      }
    } else {
      metadataLog = await logMetadata({
        ...logInput,
        post_status: deliveryDuplicate ? 'skipped_duplicate' : 'memory_only',
      });
    }
  }

  return {
    status: queueError
      ? 'memory_saved_queue_failed'
      : queue?.queued
        ? 'queued'
        : queue?.skipped === 'already_queued'
          ? 'already_queued'
          : deliveryDuplicate && !input.has_new_info
      ? 'duplicate_skipped'
      : input.dry_run
        ? 'dry_run'
        : 'memory_saved',
    classification,
    dedupe,
    memory: saveResult,
    queue,
    queue_number: queue?.queue_number ?? null,
    queue_error: queueError,
    recovered_queue_gap: Boolean(memoryDuplicate && !deliveryDuplicate && queue?.queued),
    post_manifest: queue?.post_manifest ?? postManifest,
    log_metadata_input: logInput,
    metadata_log: metadataLog,
    next_action: queueError
      ? 'report_memory_saved_but_queue_failed'
      : queue?.queued
        ? 'confirm_memory_saved_and_queued_for_cron'
        : queue?.skipped === 'already_queued'
          ? 'confirm_existing_queue_item'
          : !mediaPresent
      ? 'confirm_memory_only'
      : input.dry_run && postManifest.ready
        ? 'dry_run_queue_preview'
        : 'confirm_non_sent_media_result',
  };
}

if (isMain(import.meta.url)) {
  try {
    const result = await prepareDrop(await readInput());
    printJson(result);
    if (result.status === 'needs_review') process.exitCode = 2;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
