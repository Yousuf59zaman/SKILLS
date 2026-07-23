import { classifyTopic } from './classify-topic.mjs';
import { checkDuplicate } from './dedupe-check.mjs';
import { isMain, isMediaPresent, printJson, readInput } from './lib.mjs';
import { logMetadata } from './log-metadata.mjs';
import { prepareFbPost } from './post-to-fb-group.mjs';
import { enqueueMediaJob } from './queue-worker.mjs';
import { saveToMemory } from './save-to-memory.mjs';

export async function prepareDrop(input = {}) {
  const classification = classifyTopic(input);
  if (classification.needs_review && !input.memory_file && !input.category) {
    return {
      status: 'needs_review',
      reason: 'The deterministic classifier could not select a sufficiently reliable narrow destination.',
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
  };
  const dedupe = await checkDuplicate(enriched);
  const saveResult = await saveToMemory({
    ...enriched,
    duplicate: dedupe.duplicate,
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
    duplicate: dedupe.duplicate,
    post_status: dedupe.duplicate
      ? 'skipped_duplicate'
      : classification.post_allowed
        ? null
        : 'memory_only',
  } : null;

  const postManifest = await prepareFbPost({
    ...enriched,
    duplicate: dedupe.duplicate,
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
          duplicate: dedupe.duplicate,
          content_fingerprint: dedupe.content_fingerprint,
          canonical_urls: dedupe.canonical_urls,
          attachment_hashes: dedupe.attachment_hashes,
          browser_profile: 'openclaw',
          log_metadata_input: logInput,
        });
      } catch (error) {
        queueError = error.message;
      }
    } else {
      metadataLog = await logMetadata({
        ...logInput,
        post_status: dedupe.duplicate ? 'skipped_duplicate' : 'memory_only',
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
          : dedupe.duplicate && !input.has_new_info
      ? 'duplicate_skipped'
      : input.dry_run
        ? 'dry_run'
        : 'memory_saved',
    classification,
    dedupe,
    memory: saveResult,
    queue,
    queue_error: queueError,
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
