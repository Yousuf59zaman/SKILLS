import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
let magickExecutableCache = null;
const PERCEPTUAL_IMAGE_EXTENSIONS = new Set([
  '.avif',
  '.bmp',
  '.gif',
  '.heic',
  '.heif',
  '.jpeg',
  '.jpg',
  '.pgm',
  '.png',
  '.tif',
  '.tiff',
  '.webp',
]);

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
  relationship: {
    fb_group: 'Gift-shopping-biye boi',
    memory_file: 'memory/relationship-lines.md',
  },
  'ghotona-kobita': {
    fb_group: 'Ghotona-Kobita boi',
    memory_file: 'memory/ghotona-boi.md',
  },
  perform: {
    fb_group: 'Perform boi',
    memory_file: 'memory/perform-book.md',
  },
  favorite: {
    fb_group: 'Favorite boi',
    memory_file: 'memory/favorite-posts.md',
  },
  others: {
    fb_group: 'Others boi',
    memory_file: 'memory/others-boi.md',
  },
});

// An active Messenger destination is ultimately chosen by the narrow memory
// home, not by a broad keyword category. This covers every file in the
// authoritative memory/group map, including the narrower homes within a
// category such as punchlines, audio, food-to-try, and marriage rules.
const ACTIVE_MEMORY_FILE_ROUTE_ENTRIES = Object.freeze([
  ['memory/story-boi.md', 'story-post'],
  ['memory/meme-boi.md', 'meme-template'],
  ['memory/funny-posts.md', 'funny'],
  ['memory/punchlines.md', 'funny'],
  ['memory/office-funny-prompts.md', 'funny'],
  ['memory/friend-group-funny-prompts.md', 'funny'],
  ['memory/captions.md', 'caption-song'],
  ['memory/song-boi.md', 'caption-song'],
  ['memory/audio.md', 'caption-song'],
  ['memory/travel.md', 'travel'],
  ['memory/travel-photogenic-places.md', 'travel'],
  ['memory/food.md', 'food-health'],
  ['memory/food-to-try.md', 'food-health'],
  ['memory/gift-boi.md', 'gift-shopping'],
  ['memory/wife-shopping-references.md', 'gift-shopping'],
  ['memory/baby-gift-ideas.md', 'gift-shopping'],
  ['memory/self-clothing-references.md', 'gift-shopping'],
  ['memory/crush-lines.md', 'relationship'],
  ['memory/relationship-lines.md', 'relationship'],
  ['memory/relationship-drama-prompts.md', 'relationship'],
  ['memory/marriage-rules.md', 'relationship'],
  ['memory/ghotona-boi.md', 'ghotona-kobita'],
  ['memory/kobita-boi.md', 'ghotona-kobita'],
  ['memory/perform-book.md', 'perform'],
  ['memory/favorite-posts.md', 'favorite'],
  ['memory/others-boi.md', 'others'],
]);

export const ACTIVE_MEMORY_FILE_ROUTES = Object.freeze(
  Object.fromEntries(ACTIVE_MEMORY_FILE_ROUTE_ENTRIES.map(([memoryFile, category]) => [
    memoryFile,
    Object.freeze({ category, ...ACTIVE_ROUTES[category] }),
  ])),
);

const ACTIVE_MEMORY_PREFIX_ROUTES = Object.freeze([
  Object.freeze({
    prefix: 'memory/health-fitness/',
    category: 'food-health',
    ...ACTIVE_ROUTES['food-health'],
  }),
]);

export const EXACT_FB_GROUPS = Object.freeze(
  [...new Set(Object.values(ACTIVE_ROUTES).map((route) => route.fb_group))],
);

const PROTECTED_BASENAMES = new Set([
  'banking-details.md',
  'service-login-references.md',
  'spam-messages.md',
  'freelance-practice-routine.md',
  'freelance-profile-audit.md',
  'freelancing-agency-positioning.md',
  'office-moments.md',
  'banglish chat.md',
  'share-koro.md',
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

export function activeRouteForMemoryFile(memoryFile) {
  const normalized = normalizeMemoryRoute(memoryFile);
  if (!normalized) return null;
  if (ACTIVE_MEMORY_FILE_ROUTES[normalized]) return ACTIVE_MEMORY_FILE_ROUTES[normalized];
  return ACTIVE_MEMORY_PREFIX_ROUTES.find((route) => normalized.startsWith(route.prefix)) ?? null;
}

export function normalizeMemoryRoute(memoryFile) {
  let normalized = normalizeText(memoryFile).replace(/\\/g, '/').replace(/^\.\//, '');
  const memoryIndex = normalized.toLocaleLowerCase('en-US').lastIndexOf('/memory/');
  if (memoryIndex >= 0) normalized = normalized.slice(memoryIndex + 1);
  if (normalized && !normalized.toLocaleLowerCase('en-US').startsWith('memory/')) {
    normalized = `memory/${normalized}`;
  }
  return normalized.toLocaleLowerCase('en-US');
}

export function normalizeTitle(value) {
  return normalizeText(value)
    .toLocaleLowerCase('en-US')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const TITLE_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'been',
  'being',
  'but',
  'by',
  'for',
  'from',
  'image',
  'in',
  'is',
  'of',
  'on',
  'or',
  'photo',
  'post',
  'saved',
  'that',
  'the',
  'these',
  'this',
  'those',
  'to',
  'versus',
  'video',
  'vs',
  'was',
  'were',
  'while',
  'with',
]);

export function mediaTitleTokens(value) {
  return [...new Set(normalizeTitle(value)
    .split(' ')
    .map(stemTitleToken)
    .filter((token) => token && !TITLE_STOP_WORDS.has(token) && !/^\d+$/.test(token)))];
}

export function mediaTitleSimilarity(left, right) {
  const leftTokens = mediaTitleTokens(left);
  const rightTokens = mediaTitleTokens(right);
  const rightSet = new Set(rightTokens);
  const shared = leftTokens.filter((token) => rightSet.has(token));
  const smaller = Math.min(leftTokens.length, rightTokens.length);
  const dice = leftTokens.length + rightTokens.length
    ? (2 * shared.length) / (leftTokens.length + rightTokens.length)
    : 0;
  const containment = smaller ? shared.length / smaller : 0;
  return {
    similar: leftTokens.length >= 6
      && rightTokens.length >= 6
      && shared.length >= 5
      && (
        (dice >= 0.82 && containment >= 0.85)
        || (shared.length >= 7 && containment >= 0.9)
      ),
    score: Number(dice.toFixed(4)),
    containment: Number(containment.toFixed(4)),
    shared: shared.length,
    left_tokens: leftTokens,
    right_tokens: rightTokens,
  };
}

function stemTitleToken(token) {
  if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
  if (token.length > 5 && token.endsWith('ied')) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith('ed')) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
  return token;
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
    wife: 'relationship',
    husband: 'relationship',
    marriage: 'relationship',
    married: 'relationship',
    spouse: 'relationship',
    couple: 'relationship',
    romantic: 'relationship',
    'marriage-rule': 'relationship',
    'relationship-drama': 'relationship',
    ghotona: 'ghotona-kobita',
    kobita: 'ghotona-kobita',
    performance: 'perform',
    fav: 'favorite',
    favorites: 'favorite',
    favourite: 'favorite',
    favourites: 'favorite',
    'favorite-boi': 'favorite',
    'favourite-boi': 'favorite',
    other: 'others',
    misc: 'others',
    miscellaneous: 'others',
    'others-boi': 'others',
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

export function canonicalMediaUrls(input = {}) {
  const urls = canonicalUrlsFrom(
    input.url,
    input.post_text,
    input.accompanying_text,
    input.text,
    input.summary,
    input.title,
    input.source,
    input.canonical_urls,
  );
  return urls.filter((value) => !isTransportMediaPlaceholder(value));
}

export function normalizeIncomingMedia(input = {}) {
  const attachments = normalizeAttachments(input);
  const urls = canonicalMediaUrls(input);
  if (attachments.length || !urls.length) return input;

  const sourceUrl = canonicalizeUrl(input.source);
  const source = isTransportMediaPlaceholder(sourceUrl) && urls[0] !== sourceUrl
    ? urls[0]
    : input.source;
  return {
    ...input,
    type: 'link',
    url: urls[0],
    source: source || urls[0],
    canonical_urls: urls,
  };
}

export function inferContentType(input = {}) {
  const explicit = normalizeText(input.type ?? input.content_type).toLocaleLowerCase('en-US');
  const attachments = normalizeAttachments(input);
  const urls = canonicalMediaUrls(input);

  // A URL without a local payload is a link job even when an upstream adapter
  // mislabeled its preview as image/video/audio.
  if (attachments.length === 0 && urls.length) return 'link';
  if (['image', 'video', 'audio', 'link'].includes(explicit)) return explicit;

  for (const attachment of attachments) {
    const extension = path.extname(attachment).toLocaleLowerCase('en-US');
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic'].includes(extension)) return 'image';
    if (['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v'].includes(extension)) return 'video';
    if (['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.opus'].includes(extension)) return 'audio';
  }

  if (urls.length) return 'link';
  if (explicit === 'text') return 'text';
  return 'text';
}

export function isMediaPresent(input = {}) {
  const type = inferContentType(input);
  return type !== 'text' || normalizeAttachments(input).length > 0 || canonicalMediaUrls(input).length > 0;
}

function isTransportMediaPlaceholder(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return /^(www\.)?example\.com$/iu.test(url.hostname)
      && /^\/(?:image|video|audio)(?:\.[a-z0-9]{2,5})?$/iu.test(url.pathname);
  } catch {
    return false;
  }
}

export function normalizeAttachments(input = {}) {
  const values = input.attachment_paths ?? input.attachments ?? input.attachment ?? [];
  const list = Array.isArray(values) ? values : [values];
  return [...new Set(list.map((item) => normalizeText(
    typeof item === 'string' ? item : item?.path ?? item?.file ?? item?.file_path,
  )).filter(Boolean))];
}

export function isProtectedMemoryPath(memoryFile) {
  const normalized = normalizeText(memoryFile).replace(/\\/g, '/').toLocaleLowerCase('en-US');
  const basename = path.posix.basename(normalized);
  return (
    PROTECTED_BASENAMES.has(basename) ||
    /^(daily_report_|automation_|fb_funny_)/i.test(basename) ||
    /\/(personal|banking|auth|credentials?|secrets?|private)(\/|$)/i.test(normalized)
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

export async function perceptualImageHash(filePath) {
  if (!PERCEPTUAL_IMAGE_EXTENSIONS.has(path.extname(filePath).toLocaleLowerCase('en-US'))) return null;
  const { stdout } = await execMagick([
    `${filePath}[0]`,
    '-auto-orient',
    '-colorspace',
    'Gray',
    '-resize',
    '9x8!',
    '-depth',
    '8',
    'gray:-',
  ], {
    encoding: 'buffer',
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  if (!Buffer.isBuffer(stdout) || stdout.length < 72) throw new Error(`Unable to read perceptual pixels: ${filePath}`);
  let bits = '';
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const offset = row * 9 + column;
      bits += stdout[offset] > stdout[offset + 1] ? '1' : '0';
    }
  }
  return BigInt(`0b${bits}`).toString(16).padStart(16, '0');
}

async function execMagick(args, options) {
  let lastMissingError = null;
  for (const executable of await magickExecutableCandidates()) {
    try {
      const result = await execFileAsync(executable, args, options);
      magickExecutableCache = executable;
      return result;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      lastMissingError = error;
    }
  }
  throw lastMissingError ?? new Error('ImageMagick executable was not found');
}

async function magickExecutableCandidates() {
  const candidates = new Set([
    magickExecutableCache,
    normalizeText(process.env.MAGICK_BINARY),
    'magick',
  ].filter(Boolean));
  if (process.platform !== 'win32') return [...candidates];

  for (const programFiles of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean)) {
    try {
      const entries = (await fs.readdir(programFiles, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && /^ImageMagick-/iu.test(entry.name))
        .sort((left, right) => right.name.localeCompare(left.name));
      for (const entry of entries) {
        candidates.add(path.join(programFiles, entry.name, 'magick.exe'));
      }
    } catch {}
  }
  return [...candidates];
}

export function perceptualHashDistance(left, right) {
  if (!/^[0-9a-f]{16}$/iu.test(String(left || '')) || !/^[0-9a-f]{16}$/iu.test(String(right || ''))) {
    return Number.POSITIVE_INFINITY;
  }
  let value = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let distance = 0;
  while (value) {
    distance += Number(value & 1n);
    value >>= 1n;
  }
  return distance;
}

export async function attachmentHashes(input = {}) {
  const results = [];
  for (const attachment of normalizeAttachments(input)) {
    try {
      const stat = await fs.stat(attachment);
      if (!stat.isFile()) continue;
      const result = { path: attachment, sha256: await sha256File(attachment), size: stat.size };
      try {
        const perceptualHash = await perceptualImageHash(attachment);
        if (perceptualHash) result.perceptual_hash = perceptualHash;
      } catch (error) {
        result.perceptual_hash_error = normalizeText(error?.message) || 'unknown perceptual hash error';
      }
      results.push(result);
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
