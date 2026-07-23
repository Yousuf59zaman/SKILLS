import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { classifyTopic } from './classify-topic.mjs';
import { checkDuplicate } from './dedupe-check.mjs';
import {
  ACTIVE_ROUTES,
  canonicalizeUrl,
  inferContentType,
  isProtectedMemoryPath,
  resolveMemoryFile,
} from './lib.mjs';
import { logMetadata } from './log-metadata.mjs';
import { prepareFbPost } from './post-to-fb-group.mjs';
import { prepareDrop } from './prepare-drop.mjs';
import {
  beginRun,
  claimNext,
  completeJob,
  endRun,
  enqueueMediaJob,
  failJob,
  queueStatus,
} from './queue-worker.mjs';
import { saveToMemory } from './save-to-memory.mjs';

const DEFAULT_OPENCLAW_ROOT = 'C:\\Users\\User\\.openclaw';
const tests = [];
let workspaceCounter = 0;
let testRoot;
let fixtures;

function test(name, run) {
  tests.push({ name, run });
}

async function freshWorkspace(label = 'case') {
  workspaceCounter += 1;
  const workspace = path.join(testRoot, 'workspaces', `${String(workspaceCounter).padStart(3, '0')}-${label}`);
  await fs.mkdir(path.join(workspace, 'memory'), { recursive: true });
  return workspace;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonLines(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  return content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

async function expectReject(run, pattern) {
  await assert.rejects(run, pattern);
}

function mediaInput(overrides = {}) {
  return {
    type: 'image',
    title: 'Isolated media fixture',
    text: 'travel fixture',
    source: 'Telegram',
    category: 'travel',
    memory_file: 'memory/travel.md',
    fb_group: ACTIVE_ROUTES.travel.fb_group,
    attachment_paths: [fixtures.imageA],
    content_fingerprint: crypto.randomUUID(),
    ...overrides,
  };
}

function linkInput(overrides = {}) {
  return {
    type: 'link',
    title: 'Isolated link fixture',
    text: 'funny link fixture',
    source: `https://example.com/${crypto.randomUUID()}`,
    category: 'funny',
    memory_file: 'memory/funny-posts.md',
    fb_group: ACTIVE_ROUTES.funny.fb_group,
    content_fingerprint: crypto.randomUUID(),
    ...overrides,
  };
}

function registerClassificationTests() {
  for (const [category, route] of Object.entries(ACTIVE_ROUTES)) {
    test(`route: ${category} maps to exact group and memory`, async () => {
      const result = classifyTopic({
        category,
        type: 'link',
        source: 'https://example.com/routing-fixture',
        title: 'Neutral routing fixture',
      });
      assert.equal(result.memory_file, route.memory_file);
      assert.equal(result.fb_group, route.fb_group);
      assert.equal(result.post_allowed, true);
      assert.equal(result.needs_review, false);
    });
  }

  const narrowCases = [
    ['funny office', { category: 'funny', title: 'office funny boss' }, 'memory/office-funny-prompts.md'],
    ['funny friends', { category: 'funny', title: 'friend group roast' }, 'memory/friend-group-funny-prompts.md'],
    ['funny punchline', { category: 'funny', title: 'short savage one-liner' }, 'memory/punchlines.md'],
    ['caption audio', { category: 'caption-song', type: 'audio', attachment_paths: ['voice.mp3'] }, 'memory/audio.md'],
    ['caption song', { category: 'caption-song', title: 'song lyric hook' }, 'memory/song-boi.md'],
    ['travel photogenic', { category: 'travel', title: 'photogenic resort place' }, 'memory/travel-photogenic-places.md'],
    ['food health', { category: 'food-health', title: 'gym workout nutrition' }, 'memory/health-fitness/health-fitness.md'],
    ['food restaurant', { category: 'food-health', title: 'restaurant dish to try' }, 'memory/food-to-try.md'],
    ['gift baby', { category: 'gift-shopping', title: 'baby gift idea' }, 'memory/baby-gift-ideas.md'],
    ['gift wife', { category: 'gift-shopping', title: 'wife saree shopping' }, 'memory/wife-shopping-references.md'],
    ['gift self', { category: 'gift-shopping', title: 'shirt for myself' }, 'memory/self-clothing-references.md'],
    ['kobita', { category: 'ghotona-kobita', title: 'handwritten kobita poem' }, 'memory/kobita-boi.md'],
    ['ghotona', { category: 'ghotona-kobita', title: 'real-life incident' }, 'memory/ghotona-boi.md'],
  ];
  for (const [name, input, expected] of narrowCases) {
    test(`narrow memory: ${name}`, async () => {
      assert.equal(classifyTopic({ type: 'link', source: 'https://example.com/x', ...input }).memory_file, expected);
    });
  }

  for (const category of ['private', 'tech', 'learning', 'career', 'openclaw', 'relationship', 'personal']) {
    test(`memory-only category: ${category}`, async () => {
      const result = classifyTopic({ category, type: 'link', source: 'https://example.com/private' });
      assert.equal(result.fb_group, null);
      assert.equal(result.post_allowed, false);
      assert.ok(result.memory_file);
    });
  }

  test('private keyword wins an equal-score tie', async () => {
    const result = classifyTopic({ type: 'link', source: 'https://example.com', text: 'secret travel' });
    assert.equal(result.category, 'private');
    assert.equal(result.fb_group, null);
  });

  test('unknown content requires review', async () => {
    const result = classifyTopic({ type: 'text', title: 'xyzzy plugh' });
    assert.equal(result.category, 'unknown');
    assert.equal(result.needs_review, true);
    assert.equal(result.post_allowed, false);
  });

  test('text-only active category is never post-allowed', async () => {
    const result = classifyTopic({ category: 'travel', type: 'text', text: 'travel note without a URL' });
    assert.equal(result.fb_group, ACTIVE_ROUTES.travel.fb_group);
    assert.equal(result.post_allowed, false);
  });

  test('protected explicit memory overrides active posting', async () => {
    const result = classifyTopic({
      category: 'travel',
      type: 'link',
      source: 'https://example.com',
      memory_file: 'memory/banking-details.md',
    });
    assert.equal(result.fb_group, null);
    assert.equal(result.post_allowed, false);
  });
}

function registerLibraryTests() {
  const typeCases = [
    ['explicit image', { type: 'image' }, 'image'],
    ['jpg extension', { attachment_paths: ['x.JPG'] }, 'image'],
    ['video extension', { attachment_paths: ['x.webm'] }, 'video'],
    ['audio extension', { attachment_paths: ['x.opus'] }, 'audio'],
    ['URL', { text: 'see https://example.com/a' }, 'link'],
    ['plain text', { text: 'nothing linked' }, 'text'],
    ['explicit text containing URL upgrades to link', { type: 'text', text: 'see https://example.com/a' }, 'link'],
    ['explicit image containing URL remains image', { type: 'image', text: 'see https://example.com/a' }, 'image'],
  ];
  for (const [name, input, expected] of typeCases) {
    test(`content type: ${name}`, async () => assert.equal(inferContentType(input), expected));
  }

  const urlCases = [
    ['tracking removal', 'https://Example.com/a/?utm_source=x&fbclid=1&b=2', 'https://example.com/a?b=2'],
    ['YouTube short', 'https://youtu.be/abc123?si=track', 'https://www.youtube.com/watch?v=abc123'],
    ['YouTube shorts', 'https://www.youtube.com/shorts/abc123?feature=share', 'https://www.youtube.com/watch?v=abc123'],
    ['fragment removal', 'https://example.com/a/#section', 'https://example.com/a'],
    ['trailing slash removal', 'https://example.com/a/', 'https://example.com/a'],
    ['query sorting', 'https://example.com/a?z=2&a=1', 'https://example.com/a?a=1&z=2'],
  ];
  for (const [name, input, expected] of urlCases) {
    test(`canonical URL: ${name}`, async () => assert.equal(canonicalizeUrl(input), expected));
  }

  for (const protectedPath of [
    'memory/banking-details.md',
    'memory/service-login-references.md',
    'memory/office-moments.md',
    'memory/automation_draft.md',
    'memory/daily_report_2026-07-23.md',
    'memory/private/notes.md',
  ]) {
    test(`protected path: ${protectedPath}`, async () => assert.equal(isProtectedMemoryPath(protectedPath), true));
  }
  test('normal route path is not protected', async () => assert.equal(isProtectedMemoryPath('memory/travel.md'), false));
  test('memory path traversal is rejected', async () => {
    const workspace = await freshWorkspace('path-traversal');
    assert.throws(() => resolveMemoryFile(workspace, '../outside.md'), /inside the workspace memory directory/);
  });
}

function registerPostGuardTests() {
  test('post guard blocks text only', async () => {
    const result = await prepareFbPost({ type: 'text', text: 'plain note', fb_group: ACTIVE_ROUTES.travel.fb_group });
    assert.equal(result.blocked, 'text_only');
  });
  test('post guard blocks duplicates', async () => {
    const result = await prepareFbPost({ ...linkInput(), duplicate: true });
    assert.equal(result.blocked, 'duplicate');
  });
  for (const type of ['image', 'video', 'audio']) {
    test(`post guard blocks missing ${type} attachment`, async () => {
      const result = await prepareFbPost(mediaInput({ type, attachment_paths: [] }));
      assert.equal(result.blocked, 'attachment_missing');
    });
  }
  test('post guard blocks missing link URL', async () => {
    const result = await prepareFbPost(linkInput({ source: 'Telegram', text: 'no URL' }));
    assert.equal(result.blocked, 'link_missing_url');
  });
  test('post guard blocks unknown group', async () => {
    const result = await prepareFbPost(linkInput({ fb_group: 'Not A Real Group' }));
    assert.equal(result.blocked, 'memory_only_or_unknown_group');
  });
  test('post guard preserves exact group capitalization', async () => {
    const result = await prepareFbPost(linkInput({ fb_group: 'travel-ghuraghuri boi' }));
    assert.equal(result.blocked, 'memory_only_or_unknown_group');
  });
  test('post guard blocks protected memory', async () => {
    const result = await prepareFbPost(linkInput({ memory_file: 'memory/banking-details.md' }));
    assert.equal(result.blocked, 'protected_memory');
  });
  test('post guard requires office privacy review', async () => {
    const result = await prepareFbPost(mediaInput({
      category: 'funny',
      memory_file: 'memory/office-funny-prompts.md',
      fb_group: ACTIVE_ROUTES.funny.fb_group,
    }));
    assert.equal(result.blocked, 'privacy_review_required');
  });
  test('post guard requires friend-group privacy review', async () => {
    const result = await prepareFbPost(mediaInput({
      category: 'funny',
      memory_file: 'memory/friend-group-funny-prompts.md',
      fb_group: ACTIVE_ROUTES.funny.fb_group,
    }));
    assert.equal(result.blocked, 'privacy_review_required');
  });
  test('post guard allows reviewed office media', async () => {
    const result = await prepareFbPost(mediaInput({
      category: 'funny',
      memory_file: 'memory/office-funny-prompts.md',
      fb_group: ACTIVE_ROUTES.funny.fb_group,
      privacy_reviewed: true,
    }));
    assert.equal(result.ready, true);
  });
  test('post guard blocks missing local file', async () => {
    const result = await prepareFbPost(mediaInput({ attachment_paths: [path.join(testRoot, 'missing.jpg')] }));
    assert.equal(result.blocked, 'attachment_missing');
  });
  test('post guard blocks attachment over 25 MB', async () => {
    const result = await prepareFbPost(mediaInput({ type: 'video', attachment_paths: [fixtures.hugeVideo] }));
    assert.equal(result.blocked, 'attachment_too_large');
  });
  test('post guard allows attachment exactly 25 MB', async () => {
    const result = await prepareFbPost(mediaInput({ type: 'video', attachment_paths: [fixtures.exactLimitVideo] }));
    assert.equal(result.ready, true);
  });
  test('link handoff canonicalizes message and honors cron profile', async () => {
    const result = await prepareFbPost(linkInput({
      source: 'https://example.com/post?utm_source=test',
      browser_profile: 'openclaw',
    }));
    assert.equal(result.ready, true);
    assert.equal(result.browser_handoff.message_text, 'https://example.com/post');
    assert.equal(result.browser_handoff.profile, 'openclaw');
    assert.equal(result.browser_handoff.visible, true);
  });
  test('explicit accompanying text is preserved', async () => {
    const result = await prepareFbPost(mediaInput({ post_text: 'Exact caption' }));
    assert.equal(result.browser_handoff.message_text, 'Exact caption');
    assert.deepEqual(result.browser_handoff.verification, { kind: 'text', value: 'Exact caption' });
  });
  for (const route of Object.values(ACTIVE_ROUTES)) {
    test(`post guard accepts exact group: ${route.fb_group}`, async () => {
      const result = await prepareFbPost(linkInput({ fb_group: route.fb_group, memory_file: route.memory_file }));
      assert.equal(result.ready, true);
      assert.equal(result.target_group, route.fb_group);
    });
  }
}

function registerDedupeTests() {
  test('dedupe finds canonical URL in memory', async () => {
    const workspace = await freshWorkspace('dedupe-url');
    await fs.writeFile(path.join(workspace, 'memory', 'travel.md'), 'https://example.com/place?utm_source=old\n');
    const result = await checkDuplicate({ workspace, memory_file: 'memory/travel.md', source: 'https://example.com/place?fbclid=1' });
    assert.equal(result.duplicate, true);
    assert.ok(result.reasons.includes('canonical_url'));
  });
  test('dedupe finds normalized title in memory', async () => {
    const workspace = await freshWorkspace('dedupe-title');
    await fs.writeFile(path.join(workspace, 'memory', 'travel.md'), '### BEAUTIFUL — BANDARBAN trip!!!\n');
    const result = await checkDuplicate({ workspace, memory_file: 'memory/travel.md', title: 'Beautiful Bandarban Trip' });
    assert.equal(result.duplicate, true);
    assert.ok(result.reasons.includes('normalized_title'));
  });
  test('dedupe ignores short title alone', async () => {
    const workspace = await freshWorkspace('dedupe-short-title');
    await fs.writeFile(path.join(workspace, 'memory', 'travel.md'), 'Trip idea\n');
    const result = await checkDuplicate({ workspace, memory_file: 'memory/travel.md', title: 'Trip idea' });
    assert.equal(result.duplicate, false);
  });
  test('dedupe finds identical attachment hash in memory', async () => {
    const workspace = await freshWorkspace('dedupe-hash');
    const hash = crypto.createHash('sha256').update(await fs.readFile(fixtures.imageA)).digest('hex');
    await fs.writeFile(path.join(workspace, 'memory', 'travel.md'), `sha256: ${hash}\n`);
    const result = await checkDuplicate({ workspace, memory_file: 'memory/travel.md', attachment_paths: [fixtures.imageCopy] });
    assert.equal(result.duplicate, true);
    assert.ok(result.reasons.includes('attachment_hash'));
  });
  test('dedupe finds URL in metadata log', async () => {
    const workspace = await freshWorkspace('dedupe-log-url');
    await fs.writeFile(path.join(workspace, 'memory', 'fb_second_brain_log.jsonl'), `${JSON.stringify({ canonical_urls: ['https://example.com/logged'] })}\n`);
    const result = await checkDuplicate({ workspace, memory_file: 'memory/travel.md', source: 'https://example.com/logged?utm_source=x' });
    assert.equal(result.duplicate, true);
    assert.ok(result.reasons.includes('logged_canonical_url'));
  });
  test('dedupe tolerates missing attachment and invalid JSONL', async () => {
    const workspace = await freshWorkspace('dedupe-invalid');
    await fs.writeFile(path.join(workspace, 'memory', 'fb_second_brain_log.jsonl'), '{invalid}\n');
    const result = await checkDuplicate({
      workspace,
      memory_file: 'memory/travel.md',
      attachment_paths: [path.join(workspace, 'missing.jpg')],
      title: 'A sufficiently unique title',
    });
    assert.equal(result.duplicate, false);
    assert.equal(result.attachment_hashes[0].missing, true);
    assert.ok(result.content_fingerprint);
  });
}

function registerMemoryAndLogTests() {
  test('text save writes exact wording without media metadata', async () => {
    const workspace = await freshWorkspace('save-text');
    const result = await saveToMemory({ workspace, memory_file: 'memory/travel.md', type: 'text', title: 'Plain note', text: 'Exact wording' });
    const content = await fs.readFile(path.join(workspace, 'memory', 'travel.md'), 'utf8');
    assert.equal(result.saved, true);
    assert.match(content, /Exact wording/);
    assert.doesNotMatch(content, /Second-brain metadata/);
  });
  test('media save writes hashes and metadata block', async () => {
    const workspace = await freshWorkspace('save-media');
    const result = await saveToMemory({ workspace, ...mediaInput() });
    const content = await fs.readFile(path.join(workspace, 'memory', 'travel.md'), 'utf8');
    assert.equal(result.saved, true);
    assert.match(content, /Second-brain metadata/);
    assert.match(content, /sha256/);
    assert.match(content, /Travel-Ghuraghuri boi/);
  });
  test('duplicate without new information is not appended', async () => {
    const workspace = await freshWorkspace('save-duplicate');
    const input = { workspace, ...mediaInput() };
    await saveToMemory(input);
    const before = await fs.readFile(path.join(workspace, 'memory', 'travel.md'), 'utf8');
    const result = await saveToMemory({ ...input, duplicate: true });
    const after = await fs.readFile(path.join(workspace, 'memory', 'travel.md'), 'utf8');
    assert.equal(result.saved, false);
    assert.equal(after, before);
  });
  test('duplicate with new information writes labeled update', async () => {
    const workspace = await freshWorkspace('save-update');
    const input = { workspace, ...mediaInput() };
    await saveToMemory(input);
    await saveToMemory({ ...input, duplicate: true, has_new_info: true, text: 'New context' });
    const content = await fs.readFile(path.join(workspace, 'memory', 'travel.md'), 'utf8');
    assert.match(content, /### Update:/);
    assert.match(content, /New context/);
  });
  test('dry-run save creates no memory file', async () => {
    const workspace = await freshWorkspace('save-dry');
    const result = await saveToMemory({ workspace, ...mediaInput(), dry_run: true });
    assert.equal(result.saved, false);
    assert.equal(await exists(path.join(workspace, 'memory', 'travel.md')), false);
  });
  test('memory save writes one date heading for multiple same-day entries', async () => {
    const workspace = await freshWorkspace('save-heading');
    await saveToMemory({ workspace, memory_file: 'memory/travel.md', type: 'text', title: 'First note', text: 'One' });
    await saveToMemory({ workspace, memory_file: 'memory/travel.md', type: 'text', title: 'Second note', text: 'Two' });
    const content = await fs.readFile(path.join(workspace, 'memory', 'travel.md'), 'utf8');
    assert.equal((content.match(/^## \d{4}-\d{2}-\d{2}$/gm) ?? []).length, 1);
  });
  test('memory save rejects traversal outside memory root', async () => {
    const workspace = await freshWorkspace('save-traversal');
    await expectReject(() => saveToMemory({ workspace, memory_file: '../outside.md', type: 'text', title: 'Bad path' }), /inside the workspace memory directory/);
  });
  test('protected memory cannot carry a public group', async () => {
    const workspace = await freshWorkspace('save-protected');
    await expectReject(() => saveToMemory({ workspace, ...mediaInput(), memory_file: 'memory/banking-details.md' }), /cannot have an FB group/);
  });
  test('metadata log is idempotent by event ID', async () => {
    const workspace = await freshWorkspace('log-idempotent');
    const input = { workspace, ...linkInput(), post_status: 'sent', event_id: 'fixed-event' };
    const first = await logMetadata(input);
    const second = await logMetadata(input);
    const lines = await readJsonLines(path.join(workspace, 'memory', 'fb_second_brain_log.jsonl'));
    assert.equal(first.logged, true);
    assert.equal(second.skipped, 'event_already_logged');
    assert.equal(lines.length, 1);
  });
  test('metadata log rejects text-only input', async () => {
    const workspace = await freshWorkspace('log-text');
    await expectReject(() => logMetadata({ workspace, type: 'text', text: 'plain', post_status: 'memory_only' }), /not text-only/);
  });
  test('metadata log rejects invalid status', async () => {
    const workspace = await freshWorkspace('log-status');
    await expectReject(() => logMetadata({ workspace, ...linkInput(), post_status: 'queued' }), /Invalid post_status/);
  });
  test('metadata log rejects unknown group', async () => {
    const workspace = await freshWorkspace('log-group');
    await expectReject(() => logMetadata({ workspace, ...linkInput({ fb_group: 'Unknown Group' }), post_status: 'sent' }), /Unknown FB group/);
  });
  test('metadata log rejects protected memory paired with group', async () => {
    const workspace = await freshWorkspace('log-protected');
    await expectReject(() => logMetadata({ workspace, ...linkInput({ memory_file: 'memory/banking-details.md' }), post_status: 'sent' }), /Protected memory destinations/);
  });
  test('metadata dry run does not create log file', async () => {
    const workspace = await freshWorkspace('log-dry');
    const result = await logMetadata({ workspace, ...linkInput(), post_status: 'sent', dry_run: true });
    assert.equal(result.logged, false);
    assert.equal(await exists(path.join(workspace, 'memory', 'fb_second_brain_log.jsonl')), false);
  });
  test('failed metadata log truncates long errors', async () => {
    const workspace = await freshWorkspace('log-error');
    const result = await logMetadata({ workspace, ...linkInput(), post_status: 'failed', post_error: 'x'.repeat(900) });
    assert.equal(result.entry.post_error.length, 500);
  });
}

function registerQueueTests() {
  test('queue copies image payload and stores cron handoff', async () => {
    const workspace = await freshWorkspace('queue-copy');
    const result = await enqueueMediaJob({ workspace, ...mediaInput() });
    assert.equal(result.queued, true);
    assert.equal(result.post_manifest.browser_handoff.profile, 'openclaw');
    assert.equal(await exists(result.post_manifest.browser_handoff.attachment_paths[0]), true);
    assert.deepEqual(await fs.readFile(result.post_manifest.browser_handoff.attachment_paths[0]), await fs.readFile(fixtures.imageA));
  });
  test('queue stores links without payload files', async () => {
    const workspace = await freshWorkspace('queue-link');
    const result = await enqueueMediaJob({ workspace, ...linkInput() });
    const status = await queueStatus({ workspace });
    assert.equal(result.queued, true);
    assert.deepEqual(result.payload_paths, []);
    assert.equal(status.pending, 1);
  });
  for (const [type, fixture] of [['video', 'video'], ['audio', 'audio']]) {
    test(`queue copies ${type} payload`, async () => {
      const workspace = await freshWorkspace(`queue-${type}`);
      const result = await enqueueMediaJob({ workspace, ...mediaInput({ type, attachment_paths: [fixtures[fixture]] }) });
      const queuedPath = result.post_manifest.browser_handoff.attachment_paths[0];
      assert.equal(result.queued, true);
      assert.equal(await exists(queuedPath), true);
      assert.deepEqual(await fs.readFile(queuedPath), await fs.readFile(fixtures[fixture]));
    });
  }
  test('queue copies multiple attachments in stable order', async () => {
    const workspace = await freshWorkspace('queue-multiple');
    const result = await enqueueMediaJob({ workspace, ...mediaInput({ attachment_paths: [fixtures.imageA, fixtures.imageDifferent] }) });
    const queued = result.post_manifest.browser_handoff.attachment_paths;
    assert.equal(queued.length, 2);
    assert.match(path.basename(queued[0]), /^01-/);
    assert.match(path.basename(queued[1]), /^02-/);
    assert.deepEqual(await fs.readFile(queued[1]), await fs.readFile(fixtures.imageDifferent));
  });
  test('queue deduplicates a pending fingerprint', async () => {
    const workspace = await freshWorkspace('queue-dedupe');
    const fingerprint = 'same-fingerprint';
    const first = await enqueueMediaJob({ workspace, ...linkInput({ content_fingerprint: fingerprint }) });
    const second = await enqueueMediaJob({ workspace, ...linkInput({ content_fingerprint: fingerprint }) });
    assert.equal(first.queued, true);
    assert.equal(second.skipped, 'already_queued');
    assert.equal((await queueStatus({ workspace })).pending, 1);
  });
  test('queue lock excludes overlapping workers', async () => {
    const workspace = await freshWorkspace('queue-lock');
    const first = await beginRun({ workspace, owner: 'one' });
    const second = await beginRun({ workspace, owner: 'two' });
    assert.equal(first.acquired, true);
    assert.equal(second.busy, true);
    await endRun({ workspace, lock_token: first.lock_token });
  });
  test('queue rejects wrong lock token', async () => {
    const workspace = await freshWorkspace('queue-token');
    const run = await beginRun({ workspace });
    await expectReject(() => claimNext({ workspace, lock_token: 'wrong' }), /owned by another worker/);
    await endRun({ workspace, lock_token: run.lock_token });
  });
  test('queue rejects a root outside its workspace', async () => {
    const workspace = await freshWorkspace('queue-root');
    await expectReject(() => queueStatus({ workspace, queue_root: path.join(testRoot, 'outside-queue') }), /child directory inside/);
  });
  test('queue rejects path-like job IDs', async () => {
    const workspace = await freshWorkspace('queue-job-id');
    const run = await beginRun({ workspace });
    await expectReject(() => completeJob({
      workspace,
      lock_token: run.lock_token,
      job_id: '../escape',
      verified: true,
      verification_note: 'fixture',
    }), /valid job_id/);
    await endRun({ workspace, lock_token: run.lock_token });
  });
  test('queue claims jobs sequentially in FIFO order', async () => {
    const workspace = await freshWorkspace('queue-fifo');
    const first = await enqueueMediaJob({ workspace, ...linkInput({ title: 'First FIFO job' }) });
    const second = await enqueueMediaJob({ workspace, ...linkInput({ title: 'Second FIFO job' }) });
    const run = await beginRun({ workspace });
    const claim1 = await claimNext({ workspace, lock_token: run.lock_token });
    assert.equal(claim1.job.id, first.job_id);
    await failJob({ workspace, lock_token: run.lock_token, job_id: claim1.job.id, retryable: false, error: 'fixture' });
    const claim2 = await claimNext({ workspace, lock_token: run.lock_token });
    assert.equal(claim2.job.id, second.job_id);
    await failJob({ workspace, lock_token: run.lock_token, job_id: claim2.job.id, retryable: false, error: 'fixture' });
    await endRun({ workspace, lock_token: run.lock_token });
  });
  test('completion requires verified=true and a note', async () => {
    const workspace = await freshWorkspace('queue-complete-guard');
    await enqueueMediaJob({ workspace, ...linkInput() });
    const run = await beginRun({ workspace });
    const claim = await claimNext({ workspace, lock_token: run.lock_token });
    await expectReject(() => completeJob({ workspace, lock_token: run.lock_token, job_id: claim.job.id }), /verified=true/);
    await expectReject(() => completeJob({ workspace, lock_token: run.lock_token, job_id: claim.job.id, verified: true }), /verification_note/);
    await failJob({ workspace, lock_token: run.lock_token, job_id: claim.job.id, retryable: false, error: 'fixture' });
    await endRun({ workspace, lock_token: run.lock_token });
  });
  test('verified completion removes job and payload and logs sent', async () => {
    const workspace = await freshWorkspace('queue-complete');
    await enqueueMediaJob({ workspace, ...mediaInput() });
    const run = await beginRun({ workspace });
    const claim = await claimNext({ workspace, lock_token: run.lock_token });
    const payload = claim.job.payload_dir;
    const result = await completeJob({
      workspace,
      lock_token: run.lock_token,
      job_id: claim.job.id,
      verified: true,
      verification_note: 'Fresh isolated fixture snapshot',
    });
    await endRun({ workspace, lock_token: run.lock_token });
    const status = await queueStatus({ workspace });
    const log = await readJsonLines(path.join(workspace, 'memory', 'fb_second_brain_log.jsonl'));
    assert.equal(result.completed, true);
    assert.equal(status.pending + status.processing + status.failed, 0);
    assert.equal(await exists(payload), false);
    assert.equal(log[0].post_status, 'sent');
  });
  test('retry uses backoff while later eligible job continues', async () => {
    const workspace = await freshWorkspace('queue-backoff');
    const first = await enqueueMediaJob({ workspace, ...linkInput({ title: 'Retry first', max_attempts: 3 }) });
    const second = await enqueueMediaJob({ workspace, ...linkInput({ title: 'Eligible second' }) });
    const run = await beginRun({ workspace });
    const claim1 = await claimNext({ workspace, lock_token: run.lock_token });
    assert.equal(claim1.job.id, first.job_id);
    const failed = await failJob({ workspace, lock_token: run.lock_token, job_id: claim1.job.id, error: 'transient' });
    assert.equal(failed.retry_scheduled, true);
    assert.ok(Date.parse(failed.available_at) > Date.now());
    const claim2 = await claimNext({ workspace, lock_token: run.lock_token });
    assert.equal(claim2.job.id, second.job_id);
    await failJob({ workspace, lock_token: run.lock_token, job_id: claim2.job.id, retryable: false, error: 'fixture' });
    const noMore = await claimNext({ workspace, lock_token: run.lock_token });
    assert.equal(noMore.claimed, false);
    assert.equal(noMore.deferred, true);
    await endRun({ workspace, lock_token: run.lock_token });
  });
  test('max attempts retains failed job and payload and logs failed', async () => {
    const workspace = await freshWorkspace('queue-permanent');
    await enqueueMediaJob({ workspace, ...mediaInput({ max_attempts: 1 }) });
    const run = await beginRun({ workspace });
    const claim = await claimNext({ workspace, lock_token: run.lock_token });
    const payload = claim.job.payload_dir;
    const failed = await failJob({ workspace, lock_token: run.lock_token, job_id: claim.job.id, error: 'permanent fixture' });
    await endRun({ workspace, lock_token: run.lock_token });
    const status = await queueStatus({ workspace });
    const log = await readJsonLines(path.join(workspace, 'memory', 'fb_second_brain_log.jsonl'));
    assert.equal(failed.retry_scheduled, false);
    assert.equal(status.failed, 1);
    assert.equal(await exists(payload), true);
    assert.equal(log[0].post_status, 'failed');
  });
  test('failed fingerprint remains deduplicated', async () => {
    const workspace = await freshWorkspace('queue-failed-dedupe');
    const fingerprint = 'failed-fingerprint';
    await enqueueMediaJob({ workspace, ...linkInput({ content_fingerprint: fingerprint, max_attempts: 1 }) });
    const run = await beginRun({ workspace });
    const claim = await claimNext({ workspace, lock_token: run.lock_token });
    await failJob({ workspace, lock_token: run.lock_token, job_id: claim.job.id, error: 'fixture' });
    await endRun({ workspace, lock_token: run.lock_token });
    const duplicate = await enqueueMediaJob({ workspace, ...linkInput({ content_fingerprint: fingerprint }) });
    assert.equal(duplicate.skipped, 'already_queued');
    assert.equal(duplicate.queue_state, 'failed');
  });
  test('queue emits audit events for enqueue, claim, complete, and run boundaries', async () => {
    const workspace = await freshWorkspace('queue-events');
    await enqueueMediaJob({ workspace, ...linkInput() });
    const run = await beginRun({ workspace });
    const claim = await claimNext({ workspace, lock_token: run.lock_token });
    await completeJob({ workspace, lock_token: run.lock_token, job_id: claim.job.id, verified: true, verification_note: 'fixture' });
    await endRun({ workspace, lock_token: run.lock_token });
    const events = await readJsonLines(path.join(workspace, '.queue', 'fb-second-brain', 'events.jsonl'));
    for (const name of ['enqueued', 'run_started', 'claimed', 'completed', 'run_ended']) {
      assert.ok(events.some((event) => event.event === name));
    }
  });
  test('expired worker lock recovers unverified processing job', async () => {
    const workspace = await freshWorkspace('queue-recover');
    await enqueueMediaJob({ workspace, ...linkInput() });
    const first = await beginRun({ workspace, lock_ttl_ms: 100 });
    const claim = await claimNext({ workspace, lock_token: first.lock_token });
    assert.equal(claim.claimed, true);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const second = await beginRun({ workspace });
    assert.equal(second.recovered.requeued, 1);
    const status = await queueStatus({ workspace });
    assert.equal(status.pending, 1);
    assert.equal(status.processing, 0);
    await endRun({ workspace, lock_token: second.lock_token });
  });
  test('expired worker finalizes verified processing job without repost', async () => {
    const workspace = await freshWorkspace('queue-recover-verified');
    await enqueueMediaJob({ workspace, ...mediaInput() });
    const first = await beginRun({ workspace, lock_ttl_ms: 100 });
    const claim = await claimNext({ workspace, lock_token: first.lock_token });
    const processingPath = path.join(workspace, '.queue', 'fb-second-brain', 'processing', `${claim.job.id}.json`);
    await fs.writeFile(processingPath, `${JSON.stringify({ ...claim.job, verified_sent: true, verification_note: 'fixture' }, null, 2)}\n`);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const second = await beginRun({ workspace });
    assert.equal(second.recovered.finalized_verified, 1);
    assert.equal((await queueStatus({ workspace })).processing, 0);
    assert.equal(await exists(claim.job.payload_dir), false);
    const log = await readJsonLines(path.join(workspace, 'memory', 'fb_second_brain_log.jsonl'));
    assert.equal(log[0].post_status, 'sent');
    await endRun({ workspace, lock_token: second.lock_token });
  });
}

function registerProducerTests() {
  test('producer saves eligible image and queues durable copy', async () => {
    const workspace = await freshWorkspace('producer-image');
    const result = await prepareDrop({ workspace, ...mediaInput() });
    assert.equal(result.status, 'queued');
    assert.equal(result.memory.saved, true);
    assert.equal((await queueStatus({ workspace })).pending, 1);
    assert.equal(result.post_manifest.browser_handoff.profile, 'openclaw');
  });
  test('producer keeps text-only active content in memory', async () => {
    const workspace = await freshWorkspace('producer-text');
    const result = await prepareDrop({
      workspace,
      type: 'text',
      title: 'Travel note only',
      text: 'A travel note with no link',
      category: 'travel',
      memory_file: 'memory/travel.md',
    });
    assert.equal(result.status, 'memory_saved');
    assert.equal((await queueStatus({ workspace })).pending, 0);
    assert.equal(await exists(path.join(workspace, 'memory', 'fb_second_brain_log.jsonl')), false);
  });
  test('producer logs tech link as memory-only', async () => {
    const workspace = await freshWorkspace('producer-tech');
    const result = await prepareDrop({
      workspace,
      type: 'link',
      title: 'TypeScript article',
      source: 'https://example.com/typescript',
      category: 'tech',
      memory_file: 'memory/frontend/typescript.md',
    });
    assert.equal(result.status, 'memory_saved');
    assert.equal((await queueStatus({ workspace })).pending, 0);
    assert.equal(result.metadata_log.entry.post_status, 'memory_only');
  });
  test('producer blocks unreviewed office media from queue', async () => {
    const workspace = await freshWorkspace('producer-privacy');
    const result = await prepareDrop({
      workspace,
      ...mediaInput({
        category: 'funny',
        text: 'office funny boss',
        memory_file: 'memory/office-funny-prompts.md',
        fb_group: ACTIVE_ROUTES.funny.fb_group,
      }),
    });
    assert.equal(result.post_manifest.blocked, 'privacy_review_required');
    assert.equal((await queueStatus({ workspace })).pending, 0);
    assert.equal(result.metadata_log.entry.post_status, 'memory_only');
  });
  test('producer queues office media after explicit privacy pass', async () => {
    const workspace = await freshWorkspace('producer-privacy-pass');
    const result = await prepareDrop({
      workspace,
      ...mediaInput({
        category: 'funny',
        text: 'office funny boss',
        memory_file: 'memory/office-funny-prompts.md',
        fb_group: ACTIVE_ROUTES.funny.fb_group,
        privacy_reviewed: true,
      }),
    });
    assert.equal(result.status, 'queued');
    assert.equal((await queueStatus({ workspace })).pending, 1);
  });
  test('producer canonical duplicate makes one queue job', async () => {
    const workspace = await freshWorkspace('producer-duplicate');
    const base = {
      workspace,
      type: 'link',
      title: 'Canonical duplicate fixture',
      text: 'funny link',
      category: 'funny',
      memory_file: 'memory/funny-posts.md',
    };
    const first = await prepareDrop({ ...base, source: 'https://example.com/same?utm_source=one' });
    const second = await prepareDrop({ ...base, source: 'https://example.com/same?fbclid=two' });
    assert.equal(first.status, 'queued');
    assert.equal(second.status, 'duplicate_skipped');
    assert.equal((await queueStatus({ workspace })).pending, 1);
    assert.equal(second.metadata_log.entry.post_status, 'skipped_duplicate');
  });
  test('producer duplicate with new context updates memory but does not requeue', async () => {
    const workspace = await freshWorkspace('producer-update');
    const base = {
      workspace,
      type: 'link',
      title: 'Context update fixture',
      category: 'travel',
      memory_file: 'memory/travel.md',
      source: 'https://example.com/context',
    };
    await prepareDrop({ ...base, text: 'travel first' });
    const second = await prepareDrop({ ...base, text: 'travel new useful context', has_new_info: true });
    const memory = await fs.readFile(path.join(workspace, 'memory', 'travel.md'), 'utf8');
    assert.equal((await queueStatus({ workspace })).pending, 1);
    assert.match(memory, /### Update:/);
    assert.equal(second.post_manifest.blocked, 'duplicate');
  });
  test('producer dry-run writes neither memory nor queue', async () => {
    const workspace = await freshWorkspace('producer-dry');
    const result = await prepareDrop({ workspace, ...mediaInput(), dry_run: true });
    assert.equal(result.status, 'dry_run');
    assert.equal(await exists(path.join(workspace, 'memory', 'travel.md')), false);
    assert.equal(await exists(path.join(workspace, '.queue')), false);
  });
  test('producer unknown content stops at review without writing', async () => {
    const workspace = await freshWorkspace('producer-review');
    const result = await prepareDrop({ workspace, type: 'text', title: 'xyzzy plugh' });
    assert.equal(result.status, 'needs_review');
    assert.equal(result.wrote_memory, false);
    assert.equal((await fs.readdir(path.join(workspace, 'memory'))).length, 0);
  });
  test('producer saves missing-attachment metadata but never queues it', async () => {
    const workspace = await freshWorkspace('producer-missing');
    const result = await prepareDrop({
      workspace,
      ...mediaInput({ attachment_paths: [path.join(testRoot, 'missing-producer.jpg')] }),
    });
    assert.equal(result.memory.saved, true);
    assert.equal(result.post_manifest.blocked, 'attachment_missing');
    assert.equal((await queueStatus({ workspace })).pending, 0);
    assert.equal(result.metadata_log.entry.post_status, 'memory_only');
  });
  test('producer treats explicit text with URL as a link and queues it', async () => {
    const workspace = await freshWorkspace('producer-text-url');
    const result = await prepareDrop({
      workspace,
      type: 'text',
      title: 'Text wrapper around a travel URL',
      text: 'save https://example.com/text-url?utm_source=telegram',
      category: 'travel',
      memory_file: 'memory/travel.md',
    });
    assert.equal(result.classification.content_type, 'link');
    assert.equal(result.status, 'queued');
    assert.equal(result.post_manifest.browser_handoff.message_text, 'https://example.com/text-url');
  });
}

function registerIntegrationConfigTests() {
  test('Messenger PIN helper uses the encrypted local store without embedding a credential', async () => {
    const helperFile = path.join(DEFAULT_OPENCLAW_ROOT, 'workspace', 'skills', 'fb-second-brain', 'scripts', 'messenger-pin-helper.ps1');
    const helper = await fs.readFile(helperFile, 'utf8');
    assert.match(helper, /ConvertTo-SecureString/);
    assert.match(helper, /SecureStringToBSTR/);
    assert.match(helper, /ZeroFreeBSTR/);
    assert.match(helper, /snapshot --efficient/);
    assert.match(helper, /type \$pinRef \$plainPin --submit/);
    assert.doesNotMatch(helper, /\b\d{6}\b/);
  });
  test('production cron job has required model, cadence, and isolation', async () => {
    const cronFile = path.join(DEFAULT_OPENCLAW_ROOT, 'cron', 'jobs.json');
    const config = JSON.parse(await fs.readFile(cronFile, 'utf8'));
    const matches = config.jobs.filter((job) => job.name === 'FB Second Brain Messenger Queue');
    assert.equal(matches.length, 1);
    const job = matches[0];
    assert.equal(job.enabled, true);
    assert.equal(job.agentId, 'main-cron');
    assert.equal(job.schedule.kind, 'cron');
    assert.equal(job.schedule.expr, '30 18 * * *');
    assert.equal(job.schedule.tz, 'Asia/Dhaka');
    assert.equal(job.schedule.staggerMs, 0);
    assert.equal(job.sessionTarget, 'isolated');
    assert.equal(job.payload.model, 'opencode-go/minimax-m3');
    assert.equal(job.payload.thinking, 'high');
    assert.equal(job.payload.lightContext, true);
    assert.match(job.payload.message, /complete --verified true/);
    assert.match(job.payload.message, /messenger-pin-helper\.ps1/);
    assert.match(job.payload.message, /never ask Yousuf/i);
    assert.doesNotMatch(job.payload.message, /\b\d{6}\b/);
    assert.match(job.payload.message, /exactly NO_REPLY/);
    assert.match(job.payload.message, /FINAL_OUTPUT_GATE \(ABSOLUTE\)/);
  });
  test('main-cron allowlist contains fb-second-brain', async () => {
    const config = JSON.parse(await fs.readFile(path.join(DEFAULT_OPENCLAW_ROOT, 'openclaw.json'), 'utf8'));
    const agent = config.agents.list.find((item) => item.id === 'main-cron');
    assert.ok(agent.skills.includes('fb-second-brain'));
  });
}

async function createFixtures() {
  fixtures = {
    imageA: path.join(testRoot, 'fixtures', 'image-a.jpg'),
    imageCopy: path.join(testRoot, 'fixtures', 'image-copy.jpg'),
    imageDifferent: path.join(testRoot, 'fixtures', 'image-different.png'),
    video: path.join(testRoot, 'fixtures', 'clip.mp4'),
    audio: path.join(testRoot, 'fixtures', 'sound.mp3'),
    hugeVideo: path.join(testRoot, 'fixtures', 'huge.mp4'),
    exactLimitVideo: path.join(testRoot, 'fixtures', 'exact-limit.mp4'),
  };
  await fs.mkdir(path.dirname(fixtures.imageA), { recursive: true });
  await fs.writeFile(fixtures.imageA, 'same-image-bytes');
  await fs.writeFile(fixtures.imageCopy, 'same-image-bytes');
  await fs.writeFile(fixtures.imageDifferent, 'different-image-bytes');
  await fs.writeFile(fixtures.video, 'small-video-fixture');
  await fs.writeFile(fixtures.audio, 'small-audio-fixture');
  const huge = await fs.open(fixtures.hugeVideo, 'w');
  await huge.truncate(25 * 1024 * 1024 + 1);
  await huge.close();
  const exact = await fs.open(fixtures.exactLimitVideo, 'w');
  await exact.truncate(25 * 1024 * 1024);
  await exact.close();
}

async function main() {
  testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'fb-second-brain-self-test-'));
  const started = Date.now();
  const failures = [];
  try {
    await createFixtures();
    registerClassificationTests();
    registerLibraryTests();
    registerPostGuardTests();
    registerDedupeTests();
    registerMemoryAndLogTests();
    registerQueueTests();
    registerProducerTests();
    registerIntegrationConfigTests();

    for (const item of tests) {
      try {
        await item.run();
      } catch (error) {
        failures.push({ name: item.name, error: error.message, stack: error.stack });
      }
    }
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true });
  }

  const result = {
    ok: failures.length === 0,
    total: tests.length,
    passed: tests.length - failures.length,
    failed: failures.length,
    duration_ms: Date.now() - started,
    failures: failures.map(({ name, error }) => ({ name, error })),
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (failures.length) process.exitCode = 1;
}

await main();
