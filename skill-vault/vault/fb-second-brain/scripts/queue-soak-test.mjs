import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  ACTIVE_MEMORY_FILE_ROUTES,
  activeRouteForMemoryFile,
} from './lib.mjs';
import { enqueueMediaJob, queueStatus } from './queue-worker.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fb-second-brain-queue-soak-'));
const workspace = path.join(root, 'workspace');
const routeEntries = Object.entries(ACTIVE_MEMORY_FILE_ROUTES);
let assertions = 0;

function equal(actual, expected, label) {
  assertions += 1;
  assert.equal(actual, expected, label);
}

function ok(value, label) {
  assertions += 1;
  assert.ok(value, label);
}

function inputFor(index) {
  const [memoryFile, route] = routeEntries[index % routeEntries.length];
  const source = `https://example.net/queue-soak/${index}`;
  return {
    workspace,
    type: 'link',
    title: `Queue soak item ${index}`,
    text: `save queue soak item ${index}`,
    summary: `Concurrent route fixture ${index}`,
    source,
    canonical_urls: [source],
    content_fingerprint: crypto.createHash('sha256').update(source).digest('hex'),
    category: 'others',
    memory_file: memoryFile,
    fb_group: 'Others boi',
    post_text: source,
    privacy_reviewed: true,
  };
}

try {
  const concurrentCount = 128;
  const results = await Promise.all(
    Array.from({ length: concurrentCount }, (_, index) => enqueueMediaJob(inputFor(index))),
  );
  const nonQueued = results.filter((result) => !result.queued);
  if (nonQueued.length) {
    console.log(JSON.stringify({
      non_queued: nonQueued.length,
      outcomes: nonQueued.reduce((counts, result) => {
        const key = `${result.skipped || result.status || 'unknown'}:${result.matched_by || 'none'}`;
        counts[key] = (counts[key] || 0) + 1;
        return counts;
      }, {}),
      sample: nonQueued.slice(0, 5),
    }, null, 2));
  }
  equal(results.filter((result) => result.queued).length, concurrentCount, 'all unique jobs enqueue');

  const pendingDir = path.join(workspace, '.queue', 'fb-second-brain', 'pending');
  const pendingFiles = (await fs.readdir(pendingDir)).filter((name) => name.endsWith('.json'));
  equal(pendingFiles.length, concurrentCount, 'unique concurrent pending count');

  const jobs = await Promise.all(pendingFiles.map(async (name) => (
    JSON.parse(await fs.readFile(path.join(pendingDir, name), 'utf8'))
  )));
  const numbers = jobs.map((job) => job.queue_number).sort((a, b) => a - b);
  equal(new Set(numbers).size, concurrentCount, 'concurrent queue numbers are unique');
  equal(numbers[0], 1, 'queue numbering starts at one');
  equal(numbers.at(-1), concurrentCount, 'queue numbering has no gaps');

  for (const job of jobs) {
    const route = activeRouteForMemoryFile(job.memory_file);
    ok(route, `queue #${job.queue_number} has an active memory route`);
    equal(job.category, route.category, `queue #${job.queue_number} category`);
    equal(job.fb_group, route.fb_group, `queue #${job.queue_number} group`);
    equal(job.post_manifest.target_group, route.fb_group, `queue #${job.queue_number} manifest group`);
    equal(job.post_manifest.browser_handoff.target_group, route.fb_group, `queue #${job.queue_number} handoff group`);
  }

  const duplicateSource = 'https://example.net/queue-soak/same-identity';
  const duplicateInput = {
    ...inputFor(concurrentCount),
    title: 'Concurrent duplicate identity',
    source: duplicateSource,
    canonical_urls: [duplicateSource],
    content_fingerprint: crypto.createHash('sha256').update(duplicateSource).digest('hex'),
  };
  const duplicateResults = await Promise.all(
    Array.from({ length: 24 }, () => enqueueMediaJob({ ...duplicateInput })),
  );
  const duplicateNumbers = new Set(duplicateResults.map((result) => result.queue_number));
  equal(duplicateNumbers.size, 1, 'concurrent duplicate calls reuse one queue serial');
  equal(duplicateResults.filter((result) => result.queued).length, 1, 'only one concurrent duplicate call enqueues');

  const status = await queueStatus({ workspace });
  equal(status.pending, concurrentCount + 1, 'dedupe race leaves one additional job');
  equal(status.last_queue_number, concurrentCount + 1, 'dedupe race consumes one serial');

  console.log(`fb-second-brain queue soak tests passed: ${assertions}/${assertions}`);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
