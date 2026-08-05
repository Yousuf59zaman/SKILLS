import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  attachmentHashes,
  canonicalMediaUrls,
  canonicalUrlsFrom,
  isMain,
  mediaTitleSimilarity,
  normalizeAttachments,
  normalizeText,
  normalizeTitle,
  perceptualHashDistance,
  perceptualImageHash,
  printJson,
  readInput,
  readJsonLines,
  resolveMemoryFile,
  toMemoryRelative,
} from './lib.mjs';

export async function checkDuplicate(input = {}) {
  const workspace = input.workspace;
  const targetPath = resolveMemoryFile(workspace, input.memory_file);
  const targetRelative = toMemoryRelative(workspace, targetPath);
  const logPath = path.join(workspace, 'memory', 'fb_second_brain_log.jsonl');
  const urls = canonicalMediaUrls(input);
  const hashes = await attachmentHashes(input);
  const title = normalizeTitle(input.title);
  const attachmentPaths = normalizeAttachments(input).map((value) => path.resolve(value));

  let memoryText = '';
  try {
    memoryText = await fs.readFile(targetPath, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const existingUrls = new Set(canonicalUrlsFrom(memoryText));
  const normalizedMemory = normalizeTitle(memoryText);
  const lowerMemory = memoryText.toLocaleLowerCase('en-US');
  const memoryHeadings = [...memoryText.matchAll(/^###\s+(?:\d+\)\s*)?(.+)$/gmu)]
    .map((match) => normalizeText(match[1]))
    .filter(Boolean);
  const logEntries = await readJsonLines(logPath);
  const reasons = [];
  const memoryMatches = [];
  const deliveryMatches = [];
  const hasStrongIdentity = urls.length > 0 || hashes.some((item) => item.sha256) || attachmentPaths.length > 0;

  for (const url of urls) {
    if (existingUrls.has(url)) {
      reasons.push('canonical_url');
      memoryMatches.push({ kind: 'canonical_url', value: url, location: targetRelative });
    }
  }

  for (const attachmentPath of attachmentPaths) {
    const matchedPath = attachmentMemoryForms(workspace, attachmentPath)
      .find((value) => lowerMemory.includes(value));
    if (matchedPath) {
      reasons.push('attachment_path');
      memoryMatches.push({ kind: 'attachment_path', value: matchedPath, location: targetRelative });
    }
  }

  for (const hash of hashes) {
    if (hash.sha256 && lowerMemory.includes(hash.sha256.toLocaleLowerCase('en-US'))) {
      reasons.push('attachment_hash');
      memoryMatches.push({ kind: 'sha256', value: hash.sha256, location: targetRelative });
    }
  }

  if (!hasStrongIdentity && title.length >= 12 && normalizedMemory.includes(title)) {
    reasons.push('normalized_title');
    memoryMatches.push({ kind: 'normalized_title', value: title, location: targetRelative });
  }

  if (hasStrongIdentity && title.length >= 12) {
    const similarHeading = bestSimilarTitle(input.title, memoryHeadings);
    if (similarHeading) {
      reasons.push('similar_media_title');
      memoryMatches.push({
        kind: 'similar_media_title',
        value: similarHeading.title,
        similarity: similarHeading.similarity.score,
        location: targetRelative,
      });
    }
  }

  for (const entry of logEntries) {
    if (!entry || entry._invalid_jsonl_line) continue;
    const logMatches = [];
    const entryUrls = new Set([
      ...(Array.isArray(entry.canonical_urls) ? entry.canonical_urls.map(String) : []),
      ...canonicalUrlsFrom(entry.source),
    ].map((value) => canonicalUrlsFrom(value)[0] ?? value));
    for (const url of urls) {
      if (entryUrls.has(url)) {
        reasons.push('logged_canonical_url');
        logMatches.push({ kind: 'canonical_url', value: url, location: 'memory/fb_second_brain_log.jsonl' });
      }
    }

    const entryHashes = normalizeLoggedHashes(entry.attachment_hashes ?? entry.content_hashes);
    for (const hash of hashes) {
      if (hash.sha256 && entryHashes.has(hash.sha256)) {
        reasons.push('logged_attachment_hash');
        logMatches.push({ kind: 'sha256', value: hash.sha256, location: 'memory/fb_second_brain_log.jsonl' });
      }
    }

    const entryTitle = normalizeTitle(entry.title);
    if (!hasStrongIdentity && title.length >= 12 && entryTitle && entryTitle === title) {
      reasons.push('logged_title');
      logMatches.push({ kind: 'normalized_title', value: title, location: 'memory/fb_second_brain_log.jsonl' });
    }
    if (hasStrongIdentity && title.length >= 12 && entryTitle) {
      const similarity = mediaTitleSimilarity(input.title, entry.title);
      if (similarity.similar) {
        reasons.push('logged_similar_media_title');
        logMatches.push({
          kind: 'similar_media_title',
          value: normalizeText(entry.title),
          similarity: similarity.score,
          location: 'memory/fb_second_brain_log.jsonl',
        });
      }
    }

    memoryMatches.push(...logMatches);
    if (normalizeText(entry.post_status).toLocaleLowerCase('en-US') === 'sent') {
      deliveryMatches.push(...logMatches.map((match) => ({ ...match, post_status: 'sent' })));
    }
  }

  const activeQueueMatch = await findActiveQueueMatch(workspace, targetRelative, hashes);
  if (activeQueueMatch) {
    reasons.push(`active_queue_${activeQueueMatch.matched_by}`);
    memoryMatches.push({
      kind: activeQueueMatch.matched_by,
      value: activeQueueMatch.value,
      distance: activeQueueMatch.distance,
      location: `.queue/fb-second-brain/${activeQueueMatch.state}`,
      queue_number: activeQueueMatch.queue_number,
    });
  }

  const uniqueMemoryMatches = uniqueObjects(memoryMatches);
  const uniqueDeliveryMatches = uniqueObjects(deliveryMatches);
  const memoryDuplicate = uniqueMemoryMatches.length > 0;
  const deliveryDuplicate = uniqueDeliveryMatches.length > 0;
  const duplicate = memoryDuplicate || deliveryDuplicate;
  const perceptualHashes = hashes.map((item) => normalizeText(item.perceptual_hash)).filter(Boolean);
  const shaHashes = hashes.map((item) => normalizeText(item.sha256)).filter(Boolean);
  const fingerprintParts = urls.length
    ? urls.map((value) => `url:${value}`)
    : perceptualHashes.length
      ? [
          ...perceptualHashes.map((value) => `phash:${value}`),
          ...shaHashes.map((value) => `sha256:${value}`),
        ]
      : shaHashes.map((value) => `sha256:${value}`);
  if (!fingerprintParts.length && title) fingerprintParts.push(`title:${title}`);

  return {
    duplicate,
    memory_duplicate: memoryDuplicate,
    delivery_duplicate: deliveryDuplicate,
    reasons: [...new Set(reasons)],
    matches: uniqueMemoryMatches,
    delivery_matches: uniqueDeliveryMatches,
    memory_file: targetRelative,
    canonical_urls: urls,
    attachment_hashes: hashes,
    active_queue_match: activeQueueMatch,
    content_fingerprint: fingerprintParts.length
      ? crypto.createHash('sha256').update(fingerprintParts.sort().join('\n')).digest('hex')
      : null,
  };
}

async function findActiveQueueMatch(workspace, targetRelative, incomingHashes) {
  const incomingSha = new Set(incomingHashes.map((item) => normalizeText(item.sha256)).filter(Boolean));
  const incomingPerceptual = incomingHashes.map((item) => normalizeText(item.perceptual_hash)).filter(Boolean);
  if (!incomingSha.size && !incomingPerceptual.length) return null;
  const queueRoot = path.join(workspace, '.queue', 'fb-second-brain');
  for (const state of ['pending', 'processing', 'failed']) {
    const directory = path.join(queueRoot, state);
    let entries = [];
    try {
      entries = (await fs.readdir(directory, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .sort((left, right) => left.name.localeCompare(right.name));
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    for (const entry of entries) {
      let job;
      try {
        job = JSON.parse(await fs.readFile(path.join(directory, entry.name), 'utf8'));
      } catch {
        continue;
      }
      if (normalizeRoute(job.memory_file) !== normalizeRoute(targetRelative)) continue;
      const jobSha = normalizeLoggedHashes(job.attachment_hashes);
      const sharedSha = [...incomingSha].find((value) => jobSha.has(value));
      if (sharedSha) {
        return {
          job_id: job.id,
          queue_number: job.queue_number,
          state,
          matched_by: 'attachment_hash',
          value: sharedSha,
          distance: 0,
        };
      }
      if (!incomingPerceptual.length) continue;
      const jobPerceptual = new Set(normalizeLoggedPerceptualHashes(job.attachment_hashes));
      if (!jobPerceptual.size) {
        const candidatePaths = [
          ...(Array.isArray(job.original_attachment_paths) ? job.original_attachment_paths : []),
          ...(Array.isArray(job.attachment_paths) ? job.attachment_paths : []),
          ...(Array.isArray(job.attachment_hashes)
            ? job.attachment_hashes.map((item) => typeof item === 'object' ? item.path : null)
            : []),
        ].map(normalizeText).filter(Boolean);
        for (const candidatePath of [...new Set(candidatePaths)]) {
          try {
            const value = await perceptualImageHash(candidatePath);
            if (value) jobPerceptual.add(value);
          } catch {}
        }
      }
      for (const incoming of incomingPerceptual) {
        for (const existing of jobPerceptual) {
          const distance = perceptualHashDistance(incoming, existing);
          if (distance <= 6) {
            return {
              job_id: job.id,
              queue_number: job.queue_number,
              state,
              matched_by: 'perceptual_hash',
              value: existing,
              distance,
            };
          }
        }
      }
    }
  }
  return null;
}

function normalizeLoggedHashes(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return new Set(list.map((item) => {
    if (typeof item === 'string') return item;
    return normalizeText(item?.sha256 ?? item?.hash);
  }).filter(Boolean));
}

function normalizeLoggedPerceptualHashes(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.map((item) => normalizeText(
    typeof item === 'object' ? item.perceptual_hash ?? item.phash : null,
  )).filter(Boolean);
}

function normalizeRoute(value) {
  return normalizeText(value).toLocaleLowerCase('en-US').replace(/\\/g, '/');
}

function attachmentMemoryForms(workspace, attachmentPath) {
  const absolute = path.resolve(attachmentPath);
  const forms = new Set([
    absolute.toLocaleLowerCase('en-US'),
    absolute.replace(/\\/g, '/').toLocaleLowerCase('en-US'),
  ]);
  const relative = path.relative(path.resolve(workspace), absolute);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    forms.add(relative.toLocaleLowerCase('en-US'));
    forms.add(relative.replace(/\\/g, '/').toLocaleLowerCase('en-US'));
  }
  return [...forms];
}

function bestSimilarTitle(title, candidates) {
  let best = null;
  for (const candidate of candidates) {
    const similarity = mediaTitleSimilarity(title, candidate);
    if (!similarity.similar) continue;
    if (!best || similarity.score > best.similarity.score) {
      best = { title: candidate, similarity };
    }
  }
  return best;
}

function uniqueObjects(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

if (isMain(import.meta.url)) {
  try {
    printJson(await checkDuplicate(await readInput()));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
