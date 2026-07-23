import fs from 'node:fs/promises';
import path from 'node:path';
import {
  attachmentHashes,
  canonicalUrlsFrom,
  dateDhaka,
  ensureParent,
  humanDhaka,
  inferContentType,
  isMain,
  isMediaPresent,
  isProtectedMemoryPath,
  jsonBlock,
  normalizeAttachments,
  normalizeText,
  nowDhaka,
  printJson,
  quoteMarkdown,
  readInput,
  resolveMemoryFile,
  toMemoryRelative,
} from './lib.mjs';

export async function saveToMemory(input = {}) {
  const workspace = input.workspace;
  const filePath = resolveMemoryFile(workspace, input.memory_file);
  const relativeFile = toMemoryRelative(workspace, filePath);
  const mediaPresent = isMediaPresent(input);
  const contentType = inferContentType(input);
  const title = normalizeText(input.title) || fallbackTitle(input, contentType);
  const dateSaved = normalizeText(input.date_saved) || nowDhaka();
  const fbGroup = normalizeText(input.fb_group) || null;
  const protectedPath = isProtectedMemoryPath(relativeFile);
  const duplicate = Boolean(input.duplicate ?? input.dedupe?.duplicate);
  const hasNewInfo = Boolean(input.has_new_info);

  if (!title) throw new Error('title is required for a durable memory entry');
  if (protectedPath && fbGroup) throw new Error('Protected memory destinations cannot have an FB group');

  if (duplicate && !hasNewInfo) {
    return {
      saved: false,
      skipped: 'duplicate_without_new_information',
      memory_file: relativeFile,
      date_saved: dateSaved,
      metadata: mediaPresent ? createMetadata(input, {
        title,
        dateSaved,
        fbGroup: null,
        attachmentHashEntries: await attachmentHashes(input),
      }) : null,
    };
  }

  const hashEntries = mediaPresent ? await attachmentHashes(input) : [];
  const metadata = mediaPresent
    ? createMetadata(input, { title, dateSaved, fbGroup, attachmentHashEntries: hashEntries })
    : null;
  const block = buildMemoryBlock(input, {
    contentType,
    dateSaved,
    duplicate,
    fbGroup,
    mediaPresent,
    metadata,
    title,
  });

  let existing = '';
  try {
    existing = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const heading = existing.trim() ? '' : `# ${titleFromFilename(filePath)}\n\n`;
  const dayHeading = existing.slice(-5000).includes(`## ${dateDhaka(new Date(dateSaved))}`)
    ? ''
    : `## ${dateDhaka(new Date(dateSaved))}\n\n`;
  const appendText = `${existing.endsWith('\n') || !existing ? '' : '\n'}${heading}${dayHeading}${block}\n`;

  if (!input.dry_run) {
    await ensureParent(filePath);
    await fs.appendFile(filePath, appendText, 'utf8');
  }

  return {
    saved: !input.dry_run,
    dry_run: Boolean(input.dry_run),
    memory_file: relativeFile,
    date_saved: dateSaved,
    entry_preview: block,
    metadata,
  };
}

function createMetadata(input, { title, dateSaved, fbGroup, attachmentHashEntries }) {
  return {
    title,
    category: normalizeText(input.category) || 'unknown',
    source: normalizeText(input.source) || 'Telegram',
    date_saved: dateSaved,
    tags: normalizeTags(input.tags),
    fb_group: fbGroup,
    summary: normalizeText(input.summary) || normalizeText(input.text) || title,
    attachment_paths: normalizeAttachments(input),
    attachment_hashes: attachmentHashEntries,
    canonical_urls: canonicalUrlsFrom(input.source, input.text, input.summary),
    content_fingerprint: input.content_fingerprint ?? input.dedupe?.content_fingerprint ?? null,
  };
}

function buildMemoryBlock(input, values) {
  const lines = [];
  lines.push(`### ${values.duplicate ? 'Update: ' : ''}${values.title}`);
  lines.push(`- **Saved at:** ${humanDhaka(new Date(values.dateSaved))}`);
  lines.push('- **Shared by:** Yousuf');
  lines.push(`- **Type:** ${values.contentType}${values.duplicate ? ' / duplicate with new context' : ''}`);

  const exactText = normalizeText(input.text);
  if (exactText) {
    lines.push('- **Exact user wording/context:**');
    lines.push(quoteMarkdown(exactText));
  }

  const source = normalizeText(input.source);
  if (source) lines.push(`- **Source:** ${source}`);

  const summary = normalizeText(input.summary);
  if (summary) lines.push(`- **Summary:** ${summary}`);

  const why = normalizeText(input.why_saved ?? input.why);
  if (why) lines.push(`- **Why save it:** ${why}`);

  for (const attachment of normalizeAttachments(input)) {
    lines.push(`- **Attachment:** \`${attachment}\``);
  }

  const reminder = normalizeText(input.reminder_use ?? input.reminder);
  if (reminder) lines.push(`- **Reminder use:** ${reminder}`);

  if (values.mediaPresent) {
    lines.push('- **Second-brain metadata:**');
    lines.push(jsonBlock(values.metadata));
  }

  return lines.join('\n');
}

function normalizeTags(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(list.map(normalizeText).filter(Boolean))];
}

function fallbackTitle(input, contentType) {
  const summary = normalizeText(input.summary);
  if (summary) return summary.split(/\r?\n/)[0].slice(0, 100);
  const text = normalizeText(input.text);
  if (text) return text.split(/\r?\n/)[0].slice(0, 100);
  const source = normalizeText(input.source);
  if (source) return `${contentType} reference`;
  const attachment = normalizeAttachments(input)[0];
  return attachment ? path.basename(attachment) : '';
}

function titleFromFilename(filePath) {
  return path.basename(filePath, path.extname(filePath))
    .split(/[-_]+/)
    .map((part) => part ? `${part[0].toLocaleUpperCase('en-US')}${part.slice(1)}` : part)
    .join(' ');
}

if (isMain(import.meta.url)) {
  try {
    printJson(await saveToMemory(await readInput()));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
