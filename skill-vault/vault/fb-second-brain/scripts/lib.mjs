import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_WORKSPACE = 'C:\\Users\\User\\.openclaw\\workspace';

export const ACTIVE_ROUTES = Object.freeze({
  'story-post': {
    fb_group: 'Story-Post boi',
    memory_file: 'memory/story-boi.md',
  },
  'meme-template': {
    fb_group: 'Meme-template boi',
    memory_file: 'memory/meme-boi.md',
  },
  funny: {
    fb_group: 'meme boi',
    memory_file: 'memory/funny-posts.md',
  },
  'caption-song': {
    fb_group: 'caption-pose-song boi',
    memory_file: 'memory/captions.md',
  },
  travel: {
    fb_group: 'Travel-Ghuraghuri boi',
    memory_file: 'memory/travel.md',
  },
  'food-health': {
    fb_group: 'Food-Health-vlog',
    memory_file: 'memory/food.md',
  },
  'gift-shopping': {
    fb_group: 'Gift-shopping-biye boi',
    memory_file: 'memory/gift-boi.md',
  },
  'ghotona-kobita': {
    fb_group: 'Ghotona-Kobita boi',
    memory_file: 'memory/ghotona-boi.md',
  },
  perform: {
    fb_group: 'Perform boi',
    memory_file: 'memory/perform-book.md',
  },
});

export const EXACT_FB_GROUPS = Object.freeze(
  Object.values(ACTIVE_ROUTES).map((route) => route.fb_group),
);

const PROTECTED_BASENAMES = new Set([
  'banking-details.md',
  'service-login-references.md',
  'spam-messages.md',
  'freelance-practice-routine.md',
  'freelance-profile-audit.md',
  'freelancing-agency-positioning.md',
  'office-moments.md',
  'relationship-lines.md',
  'relationship-drama-prompts.md',
  'banglish chat.md',
  'share-koro.md',
  'favorite-posts.md',
  'fb-commented-posts.md',
  'automation_draft.md',
]);

const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'igsh',
  'mibextid',
  'si',
  'feature',
  'ref',
  'ref_src',
  'source',
]);

export function normalizeText(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim();
}

export function normalizeTitle(value) {
  return normalizeText(value)
    .toLocaleLowerCase('en-US')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeCategory(value) {
  const raw = normalizeText(value).toLocaleLowerCase('en-US');
  const aliases = {
    story: 'story-post',
    'story-boi': 'story-post',
    meme: 'funny',
    memes: 'funny',
    'meme-boi': 'funny',
    'meme-template-boi': 'meme-template',
    caption: 'caption-song',
    captions: 'caption-song',
    song: 'caption-song',
    audio: 'caption-song',
    food: 'food-health',
    health: 'food-health',
    fitness: 'food-health',
    gift: 'gift-shopping',
    shopping: 'gift-shopping',
    biye: 'gift-shopping',
    ghotona: 'ghotona-kobita',
    kobita: 'ghotona-kobita',
    performance: 'perform',
  };
  return aliases[raw] ?? raw;
}

export function extractUrls(...values) {
  const urls = [];
  for (const value of values.flat(Infinity)) {
    const text = normalizeText(value);
    const matches = text.match(/https?:\/\/[^\s<>()\[\]{}"']+/giu) ?? [];
    for (const match of matches) {
      urls.push(match.replace(/[.,;!?]+$/u, ''));
    }
  }
  return [...new Set(urls)];
}

export function canonicalizeUrl(value) {
  const raw = normalizeText(value);
  if (!raw) return '';

  try {
    let url = new URL(raw);
    if (/^(l\.)?messenger\.com$/i.test(url.hostname) && url.searchParams.get('u')) {
      url = new URL(url.searchParams.get('u'));
    }

    url.hash = '';
    url.hostname = url.hostname.toLocaleLowerCase('en-US').replace(/^m\./, 'www.');

    const youtubeId = (() => {
      if (/^(www\.)?youtu\.be$/i.test(url.hostname)) return url.pathname.split('/').filter(Boolean)[0];
      if (/^(www\.)?youtube\.com$/i.test(url.hostname)) {
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts[0] === 'shorts' || parts[0] === 'embed') return parts[1];
        if (url.pathname === '/watch') return url.searchParams.get('v');
      }
      return null;
    })();

    if (youtubeId) return `https://www.youtube.com/watch?v=${youtubeId}`;

    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLocaleLowerCase('en-US')) || key.toLocaleLowerCase('en-US').startsWith('utm_')) {
        url.searchParams.delete(key);
      }
    }

    url.searchParams.sort();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\?$/, '');
  } catch {
    return raw;
  }
}

export function canonicalUrlsFrom(...values) {
  return [...new Set(extractUrls(...values).map(canonicalizeUrl).filter(Boolean))];
}

export function inferContentType(input = {}) {
  const explicit = normalizeText(input.type ?? input.content_type).toLocaleLowerCase('en-US');
  if (['image', 'video', 'audio', 'link'].includes(explicit)) return explicit;

  const attachments = normalizeAttachments(input);
  for (const attachment of attachments) {
    const extension = path.extname(attachment).toLocaleLowerCase('en-US');
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic'].includes(extension)) return 'image';
    if (['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v'].includes(extension)) return 'video';
    if (['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.opus'].includes(extension)) return 'audio';
  }

  if (canonicalUrlsFrom(input.source, input.text, input.summary).length) return 'link';
  if (explicit === 'text') return 'text';
  return 'text';
}

export function isMediaPresent(input = {}) {
  const type = inferContentType(input);
  return type !== 'text' || normalizeAttachments(input).length > 0 || canonicalUrlsFrom(input.source, input.text).length > 0;
}

export function normalizeAttachments(input = {}) {
  const values = input.attachment_paths ?? input.attachments ?? input.attachment ?? [];
  const list = Array.isArray(values) ? values : [values];
  return [...new Set(list.map((item) => normalizeText(item)).filter(Boolean))];
}

export function isProtectedMemoryPath(memoryFile) {
  const normalized = normalizeText(memoryFile).replace(/\\/g, '/').toLocaleLowerCase('en-US');
  const basename = path.posix.basename(normalized);
  return (
    PROTECTED_BASENAMES.has(basename) ||
    /^(daily_report_|automation_|fb_funny_)/i.test(basename) ||
    /\/(personal|relationship|banking|auth|credentials?|secrets?|private)(\/|$)/i.test(normalized)
  );
}

export function resolveMemoryFile(workspace, memoryFile) {
  const workspaceRoot = path.resolve(workspace || DEFAULT_WORKSPACE);
  const memoryRoot = path.resolve(workspaceRoot, 'memory');
  const raw = normalizeText(memoryFile).replace(/\\/g, path.sep).replace(/\//g, path.sep);
  if (!raw) throw new Error('memory_file is required');

  const candidate = path.isAbsolute(raw)
    ? path.resolve(raw)
    : path.resolve(workspaceRoot, raw.replace(new RegExp(`^memory[${escapeForCharClass(path.sep)}/]+`, 'i'), `memory${path.sep}`));
  const relative = path.relative(memoryRoot, candidate);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    if (candidate !== memoryRoot) throw new Error('memory_file must stay inside the workspace memory directory');
  }
  return candidate;
}

function escapeForCharClass(value) {
  return value.replace(/[\\\]\-^]/g, '\\$&');
}

export function toMemoryRelative(workspace, filePath) {
  const relative = path.relative(path.resolve(workspace || DEFAULT_WORKSPACE), path.resolve(filePath));
  return relative.replace(/\\/g, '/');
}

export function nowDhaka(date = new Date()) {
  const shifted = new Date(date.getTime() + 6 * 60 * 60 * 1000);
  return shifted.toISOString().replace('Z', '+06:00');
}

export function dateDhaka(date = new Date()) {
  return nowDhaka(date).slice(0, 10);
}

export function humanDhaka(date = new Date()) {
  return `${nowDhaka(date).slice(0, 16).replace('T', ' ')} Asia/Dhaka`;
}

export async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const stream = fsSync.createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

export async function attachmentHashes(input = {}) {
  const results = [];
  for (const attachment of normalizeAttachments(input)) {
    try {
      const stat = await fs.stat(attachment);
      if (!stat.isFile()) continue;
      results.push({ path: attachment, sha256: await sha256File(attachment), size: stat.size });
    } catch {
      results.push({ path: attachment, missing: true });
    }
  }
  return results;
}

export async function readJsonLines(filePath) {
  let content;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }

  const entries = [];
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      entries.push({ _invalid_jsonl_line: index + 1 });
    }
  }
  return entries;
}

export async function readInput(argv = process.argv.slice(2)) {
  const result = {};
  const listKeys = new Set(['attachment', 'attachment-path', 'attachment_paths', 'tag', 'tags']);

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--input') {
      const inputPath = argv[++index];
      if (!inputPath) throw new Error('--input requires a JSON file path');
      Object.assign(result, JSON.parse(await fs.readFile(inputPath, 'utf8')));
      continue;
    }
    if (token === '--json') {
      const json = argv[++index];
      if (!json) throw new Error('--json requires a JSON object');
      Object.assign(result, JSON.parse(json));
      continue;
    }
    if (token === '--stdin') {
      Object.assign(result, JSON.parse(await readStdin()));
      continue;
    }
    if (!token.startsWith('--')) continue;

    const rawKey = token.slice(2);
    const key = rawKey.replace(/-/g, '_');
    const next = argv[index + 1];
    const value = next && !next.startsWith('--') ? argv[++index] : true;
    if (listKeys.has(rawKey) || listKeys.has(key)) {
      const normalizedKey = key.startsWith('attachment') ? 'attachment_paths' : 'tags';
      result[normalizedKey] = [...(result[normalizedKey] ?? []), value];
    } else {
      result[key] = coerce(value);
    }
  }

  result.workspace ??= DEFAULT_WORKSPACE;
  return result;
}

function coerce(value) {
  if (value === true) return true;
  if (/^(true|false)$/i.test(value)) return value.toLocaleLowerCase('en-US') === 'true';
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export function quoteMarkdown(value) {
  const text = normalizeText(value);
  if (!text) return '';
  return text.split('\n').map((line) => `  > ${line}`).join('\n');
}

export function jsonBlock(value) {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

export function isMain(metaUrl) {
  return path.resolve(fileURLToPath(metaUrl)) === path.resolve(process.argv[1] ?? '');
}

export function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export async function ensureParent(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
