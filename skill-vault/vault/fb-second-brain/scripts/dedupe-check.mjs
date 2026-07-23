import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  attachmentHashes,
  canonicalUrlsFrom,
  isMain,
  normalizeAttachments,
  normalizeText,
  normalizeTitle,
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
  const urls = canonicalUrlsFrom(input.source, input.url, input.text, input.summary);
  const hashes = await attachmentHashes(input);
  const title = normalizeTitle(input.title);
  const attachmentPaths = normalizeAttachments(input).map((value) => path.resolve(value).toLocaleLowerCase('en-US'));

  let memoryText = '';
  try {
    memoryText = await fs.readFile(targetPath, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const existingUrls = new Set(canonicalUrlsFrom(memoryText));
  const normalizedMemory = normalizeTitle(memoryText);
  const lowerMemory = memoryText.toLocaleLowerCase('en-US');
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
    if (lowerMemory.includes(attachmentPath)) {
      reasons.push('attachment_path');
      memoryMatches.push({ kind: 'attachment_path', value: attachmentPath, location: targetRelative });
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

    memoryMatches.push(...logMatches);
    if (normalizeText(entry.post_status).toLocaleLowerCase('en-US') === 'sent') {
      deliveryMatches.push(...logMatches.map((match) => ({ ...match, post_status: 'sent' })));
    }
  }

  const uniqueMemoryMatches = uniqueObjects(memoryMatches);
  const uniqueDeliveryMatches = uniqueObjects(deliveryMatches);
  const memoryDuplicate = uniqueMemoryMatches.length > 0;
  const deliveryDuplicate = uniqueDeliveryMatches.length > 0;
  const duplicate = memoryDuplicate || deliveryDuplicate;
  const fingerprintParts = [
    ...urls.map((value) => `url:${value}`),
    ...hashes.filter((item) => item.sha256).map((item) => `sha256:${item.sha256}`),
  ];
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
    content_fingerprint: fingerprintParts.length
      ? crypto.createHash('sha256').update(fingerprintParts.sort().join('\n')).digest('hex')
      : null,
  };
}

function normalizeLoggedHashes(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return new Set(list.map((item) => {
    if (typeof item === 'string') return item;
    return normalizeText(item?.sha256 ?? item?.hash);
  }).filter(Boolean));
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
