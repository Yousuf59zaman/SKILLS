import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  EXACT_FB_GROUPS,
  attachmentHashes,
  canonicalUrlsFrom,
  ensureParent,
  isMain,
  isMediaPresent,
  isProtectedMemoryPath,
  normalizeAttachments,
  normalizeText,
  nowDhaka,
  printJson,
  readInput,
  readJsonLines,
} from './lib.mjs';

const POST_STATUSES = new Set(['sent', 'failed', 'skipped_duplicate', 'memory_only']);

export async function logMetadata(input = {}) {
  if (!isMediaPresent(input)) throw new Error('fb_second_brain_log.jsonl is for media/link drops, not text-only notes');

  const workspace = input.workspace;
  const logPath = path.join(workspace, 'memory', 'fb_second_brain_log.jsonl');
  const postStatus = normalizeText(input.post_status) || inferStatus(input);
  const fbGroup = normalizeText(input.fb_group) || null;
  const memoryFile = normalizeText(input.memory_file) || null;
  if (!POST_STATUSES.has(postStatus)) throw new Error(`Invalid post_status: ${postStatus}`);
  if (fbGroup && !EXACT_FB_GROUPS.includes(fbGroup)) throw new Error(`Unknown FB group: ${fbGroup}`);
  if (memoryFile && isProtectedMemoryPath(memoryFile) && fbGroup) {
    throw new Error('Protected memory destinations cannot be logged with an FB group');
  }

  const calculatedAttachmentHashes = Array.isArray(input.attachment_hashes) && input.attachment_hashes.length
    ? input.attachment_hashes
    : await attachmentHashes(input);
  const entry = {
    title: normalizeText(input.title) || 'Untitled media drop',
    category: normalizeText(input.category) || 'unknown',
    source: normalizeText(input.source) || 'Telegram',
    date_saved: normalizeText(input.date_saved) || nowDhaka(),
    tags: normalizeTags(input.tags),
    fb_group: fbGroup,
    summary: normalizeText(input.summary) || normalizeText(input.text) || normalizeText(input.title),
    attachment_paths: normalizeAttachments(input),
    memory_file: memoryFile,
    canonical_urls: normalizeStringArray(input.canonical_urls).length
      ? normalizeStringArray(input.canonical_urls)
      : canonicalUrlsFrom(input.source, input.text, input.summary),
    attachment_hashes: calculatedAttachmentHashes,
    content_fingerprint: normalizeText(input.content_fingerprint) || null,
    duplicate: Boolean(input.duplicate),
    post_status: postStatus,
    post_error: postStatus === 'failed' ? normalizeText(input.post_error).slice(0, 500) || null : null,
    logged_at: nowDhaka(),
  };
  entry.event_id = normalizeText(input.event_id) || makeEventId(entry);

  const existing = await readJsonLines(logPath);
  if (existing.some((item) => item?.event_id === entry.event_id)) {
    return { logged: false, skipped: 'event_already_logged', event_id: entry.event_id, entry };
  }

  if (!input.dry_run) {
    await ensureParent(logPath);
    await fs.appendFile(logPath, `${JSON.stringify(entry)}\n`, 'utf8');
  }

  return {
    logged: !input.dry_run,
    dry_run: Boolean(input.dry_run),
    event_id: entry.event_id,
    log_file: 'memory/fb_second_brain_log.jsonl',
    entry,
  };
}

function inferStatus(input) {
  if (input.duplicate) return 'skipped_duplicate';
  if (!input.fb_group) return 'memory_only';
  return 'failed';
}

function normalizeTags(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(list.map(normalizeText).filter(Boolean))];
}

function normalizeStringArray(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(list.map(normalizeText).filter(Boolean))];
}

function makeEventId(entry) {
  const basis = [
    entry.date_saved,
    entry.content_fingerprint,
    entry.source,
    entry.memory_file,
    entry.post_status,
  ].filter(Boolean).join('\n');
  return crypto.createHash('sha256').update(basis).digest('hex').slice(0, 24);
}

if (isMain(import.meta.url)) {
  try {
    printJson(await logMetadata(await readInput()));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
