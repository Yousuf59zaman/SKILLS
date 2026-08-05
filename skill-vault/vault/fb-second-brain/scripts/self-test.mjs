import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { classifyTopic } from './classify-topic.mjs';
import { checkDuplicate } from './dedupe-check.mjs';
import {
  ACTIVE_MEMORY_FILE_ROUTES,
  ACTIVE_ROUTES,
  EXACT_FB_GROUPS,
  activeRouteForMemoryFile,
  canonicalMediaUrls,
  canonicalizeUrl,
  inferContentType,
  isProtectedMemoryPath,
  normalizeCategory,
  normalizeIncomingMedia,
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
import { validateAgentRoute } from './validate-agent-route.mjs';

function registerAgentRouteTests() {
  for (const [memoryFile, route] of Object.entries(ACTIVE_MEMORY_FILE_ROUTES)) {
    test(`agent-selected route validates without semantic rerouting: ${memoryFile}`, async () => {
      const result = validateAgentRoute({
        category: route.category,
        memory_file: memoryFile,
        type: 'link',
        source: 'https://example.com/agent-route',
        title: 'Adversarial wife crush travel funny food caption words must be ignored',
      });
      assert.equal(result.validated, true);
      assert.equal(result.semantic_classifier_used, false);
      assert.equal(result.route_source, 'openclaw-agent');
      assert.equal(result.category, route.category);
      assert.equal(result.memory_file, memoryFile);
      assert.equal(result.fb_group, route.fb_group);
      assert.equal(result.post_allowed, true);
    });
  }

  test('producer contract rejects a missing agent route without writes', async () => {
    const workspace = await freshWorkspace('agent-route-missing');
    const result = await prepareDrop({
      workspace,
      type: 'image',
      title: 'Obvious funny meme that a keyword classifier would have guessed',
      attachment_paths: [fixtures.imageA],
    });
    assert.equal(result.status, 'needs_review');
    assert.equal(result.wrote_memory, false);
    assert.equal(result.classification.semantic_classifier_used, false);
    assert.equal((await fs.readdir(path.join(workspace, 'memory'))).length, 0);
  });

  test('producer contract rejects a mismatched category and memory file', async () => {
    const result = validateAgentRoute({
      category: 'relationship',
      memory_file: 'memory/funny-posts.md',
      type: 'image',
      attachment_paths: [fixtures.imageA],
    });
    assert.equal(result.validated, false);
    assert.equal(result.needs_review, true);
    assert.equal(result.fb_group, null);
    assert.match(result.reasons.join(' '), /does not match/i);
  });

  test('memory-only agent route is accepted but cannot queue', async () => {
    const result = validateAgentRoute({
      category: 'tech',
      memory_file: 'memory/backend/architecture.md',
      type: 'link',
      source: 'https://example.com/backend',
    });
    assert.equal(result.validated, true);
    assert.equal(result.memory_only, true);
    assert.equal(result.fb_group, null);
    assert.equal(result.post_allowed, false);
  });
}

const DEFAULT_OPENCLAW_ROOT = 'C:\\Users\\User\\.openclaw';
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);
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
  for (const [memoryFile, route] of Object.entries(ACTIVE_MEMORY_FILE_ROUTES)) {
    test(`memory file route is authoritative: ${memoryFile}`, async () => {
      const result = classifyTopic({
        category: 'relationship',
        memory_file: memoryFile,
        type: 'link',
        source: 'https://example.com/memory-route-fixture',
        title: 'Neutral routing fixture',
      });
      assert.equal(result.category, route.category);
      assert.equal(result.memory_file, memoryFile);
      assert.equal(result.fb_group, route.fb_group);
      assert.equal(result.post_allowed, true);
    });
  }
  test('health-fitness memory subfiles map to Food-Health-vlog', async () => {
    const route = activeRouteForMemoryFile('C:\\temp\\workspace\\memory\\health-fitness\\gym-notes.md');
    assert.equal(route?.category, 'food-health');
    assert.equal(route?.fb_group, 'Food-Health-vlog');
  });
  test('funny-posts memory overrides relationship keywords to meme boi', async () => {
    const result = classifyTopic({
      category: 'relationship',
      memory_file: 'memory/funny-posts.md',
      type: 'image',
      title: 'Brazil fan wedding roast',
      text: 'jar biye tar khobor nai, erai brazil fans',
      source: 'Telegram',
      attachment_paths: ['fixture.jpg'],
    });
    assert.equal(result.category, 'funny');
    assert.equal(result.memory_file, 'memory/funny-posts.md');
    assert.equal(result.fb_group, 'meme boi');
    assert.equal(result.post_allowed, true);
  });
  test('crush media uses the narrow crush-lines home and Gift-shopping-biye boi', async () => {
    const result = classifyTopic({
      type: 'link',
      source: 'https://example.com/crush-line',
      text: 'save, amio amar crush ke 2 bacchar ma holeo mene nibo',
    });
    assert.equal(result.category, 'relationship');
    assert.equal(result.memory_file, 'memory/crush-lines.md');
    assert.equal(result.fb_group, 'Gift-shopping-biye boi');
    assert.equal(result.post_allowed, true);
  });
  test('relationship/crush outranks broad funny and caption keywords automatically', async () => {
    const result = classifyTopic({
      type: 'image',
      attachment_paths: [fixtures.imageA],
      text: 'funny meme caption about my flirty crush and dating proposal',
    });
    assert.equal(result.category, 'relationship');
    assert.equal(result.memory_file, 'memory/crush-lines.md');
    assert.equal(result.fb_group, 'Gift-shopping-biye boi');
  });
  test('explicit funny-posts destination still overrides crush words by file authority', async () => {
    const result = classifyTopic({
      type: 'link',
      source: 'https://example.com/explicit-funny-crush',
      text: 'funny crush relationship meme',
      memory_file: 'memory/funny-posts.md',
    });
    assert.equal(result.category, 'funny');
    assert.equal(result.memory_file, 'memory/funny-posts.md');
    assert.equal(result.fb_group, 'meme boi');
  });
  test('operational cron prompt can never fall through to a public funny route', async () => {
    const result = classifyTopic({
      type: 'link',
      source: 'https://www.facebook.com/',
      text: '[cron:collector] IDEMPOTENCY_KEY=x BROWSER_POLICY=LOCAL TARGET_FILE=memory/fb_funny.json FINAL_OUTPUT_GUARD: save funny posts',
      category: 'funny',
      memory_file: 'memory/funny-posts.md',
    });
    assert.equal(result.category, 'openclaw');
    assert.equal(result.fb_group, null);
    assert.equal(result.post_allowed, false);
  });
  test('active group inventory has eleven unique exact names in routing order', async () => {
    assert.deepEqual(EXACT_FB_GROUPS, [
      'Story-Post boi',
      'Meme-template boi',
      'meme boi',
      'caption-pose-song boi',
      'Travel-Ghuraghuri boi',
      'Food-Health-vlog',
      'Gift-shopping-biye boi',
      'Ghotona-Kobita boi',
      'Perform boi',
      'Favorite boi',
      'Others boi',
    ]);
    assert.equal(new Set(EXACT_FB_GROUPS).size, 11);
  });

  const automaticSpecificRoutes = [
    ['story-post', 'story idea for a facebook story and status idea'],
    ['meme-template', 'reaction template'],
    ['funny', 'funny joke roast banter'],
    ['caption-song', 'song lyric music hook'],
    ['travel', 'mountain trip travel destination'],
    ['food-health', 'restaurant recipe nutrition'],
    ['gift-shopping', 'baby gift shopping idea'],
    ['relationship', 'marriage rule wife first couple'],
    ['ghotona-kobita', 'handwritten kobita poem poetry'],
    ['perform', 'recreate shoot concept stage idea'],
  ];
  for (const [expectedCategory, title] of automaticSpecificRoutes) {
    for (const type of ['image', 'video', 'link']) {
      test(`automatic ${type} route beats fallbacks: ${expectedCategory}`, async () => {
        const result = classifyTopic({
          type,
          title,
          source: type === 'link' ? 'https://example.com/routing-fixture' : 'Telegram',
          attachment_paths: type === 'link' ? [] : [`fixture.${type === 'image' ? 'jpg' : 'mp4'}`],
        });
        assert.equal(result.category, expectedCategory);
        assert.equal(result.fb_group, ACTIVE_ROUTES[expectedCategory].fb_group);
        assert.equal(result.post_allowed, true);
        assert.equal(result.needs_review, false);
      });
    }
  }

  for (const signal of [
    'This is one of my favorites',
    'I love this abstract object',
    'I really like this unusual visual',
    'amar favorite, eta rekho',
    'amar khub pochondo eta',
    'eta amar khub bhalo lagse',
    'এটা আমার খুব পছন্দ',
    'mesmerizing object ❤️',
  ]) {
    test(`favorite fallback recognizes explicit affection: ${signal}`, async () => {
      const result = classifyTopic({
        type: 'image',
        title: signal,
        source: 'Telegram',
        attachment_paths: ['fixture.jpg'],
      });
      assert.equal(result.category, 'favorite');
      assert.equal(result.memory_file, 'memory/favorite-posts.md');
      assert.equal(result.fb_group, 'Favorite boi');
      assert.equal(result.post_allowed, true);
      assert.equal(result.needs_review, false);
    });
  }

  const favoriteSpecificityCases = [
    ['story-post', 'This is my favorite story idea for a Facebook story'],
    ['meme-template', 'I love this reaction template'],
    ['funny', 'Favorite funny joke roast'],
    ['caption-song', 'I love this song lyric music clip'],
    ['travel', 'Favorite mountain travel trip'],
    ['food-health', 'I love this restaurant recipe'],
    ['gift-shopping', 'Favorite baby gift shopping idea'],
    ['ghotona-kobita', 'I love this handwritten poem kobita'],
    ['perform', 'Favorite recreate shoot concept'],
  ];
  for (const [expectedCategory, title] of favoriteSpecificityCases) {
    test(`specific topic outranks Favorite boi: ${expectedCategory}`, async () => {
      const result = classifyTopic({
        type: 'image',
        title,
        source: 'Telegram',
        attachment_paths: ['fixture.jpg'],
      });
      assert.equal(result.category, expectedCategory);
      assert.equal(result.fb_group, ACTIVE_ROUTES[expectedCategory].fb_group);
      assert.notEqual(result.fb_group, 'Favorite boi');
    });
  }

  const otherMediaCases = [
    ['image', { title: 'Mesmerizing kinetic sculpture', attachment_paths: ['neutral.jpg'] }],
    ['video', { title: 'Slow motion color experiment', attachment_paths: ['neutral.mp4'] }],
    ['link', { title: 'Uncategorized visual reference', source: 'https://example.com/abstract-object' }],
  ];
  for (const [type, input] of otherMediaCases) {
    test(`unmatched eligible ${type} uses Others boi`, async () => {
      const result = classifyTopic({ type, ...input });
      assert.equal(result.category, 'others');
      assert.equal(result.memory_file, 'memory/others-boi.md');
      assert.equal(result.fb_group, 'Others boi');
      assert.equal(result.post_allowed, true);
      assert.equal(result.needs_review, false);
    });
  }

  test('unlabeled audio uses the specific caption-pose-song group, not a fallback', async () => {
    const result = classifyTopic({
      type: 'audio',
      title: 'Ambient field recording',
      attachment_paths: ['neutral.mp3'],
    });
    assert.equal(result.category, 'caption-song');
    assert.equal(result.fb_group, 'caption-pose-song boi');
  });

  test('favorite audio still uses the specific caption-pose-song group', async () => {
    const result = classifyTopic({
      type: 'audio',
      title: 'I love this unusual sound',
      attachment_paths: ['neutral.mp3'],
    });
    assert.equal(result.category, 'caption-song');
    assert.equal(result.fb_group, 'caption-pose-song boi');
  });

  const keywordBoundaryCases = [
    ['gifted artist portrait', 'others'],
    ['tripod camera setup', 'others'],
    ['cloudy sunset reference', 'others'],
    ['tokenized artwork', 'others'],
    ['secretary giving a speech', 'others'],
    ['captioned archival photograph', 'others'],
    ['reaction template', 'meme-template'],
  ];
  for (const [title, expectedCategory] of keywordBoundaryCases) {
    test(`keyword boundaries prevent substring misrouting: ${title}`, async () => {
      const result = classifyTopic({
        type: 'image',
        title,
        attachment_paths: ['fixture.jpg'],
      });
      assert.equal(result.category, expectedCategory);
    });
  }

  const memoryOnlyFallbackSafety = [
    ['private', 'I love this secret password'],
    ['openclaw', 'favorite OpenClaw gateway workflow'],
    ['career', 'favorite job interview career advice'],
    ['learning', 'favorite course tutorial roadmap'],
    ['tech', 'favorite Docker backend architecture'],
  ];
  for (const [expectedCategory, title] of memoryOnlyFallbackSafety) {
    test(`memory-only topic never falls into Favorite or Others: ${expectedCategory}`, async () => {
      const result = classifyTopic({
        type: 'image',
        title,
        source: 'Telegram',
        attachment_paths: ['fixture.jpg'],
      });
      assert.equal(result.category, expectedCategory);
      assert.equal(result.fb_group, null);
      assert.equal(result.post_allowed, false);
    });
  }

  test('explicit private wording still blocks relationship media', async () => {
    const result = classifyTopic({
      type: 'image',
      title: 'Wife surprise dinner note',
      text: 'wife er jonno surprise dinner plan ta private vabe save kore rakho',
      attachment_paths: ['fixture.jpg'],
    });
    assert.equal(result.category, 'private');
    assert.equal(result.fb_group, null);
    assert.equal(result.post_allowed, false);
  });

  test('relationship media uses Gift-shopping-biye boi instead of a fallback', async () => {
    const result = classifyTopic({
      type: 'image',
      title: 'favorite wife relationship reflection',
      attachment_paths: ['fixture.jpg'],
    });
    assert.equal(result.category, 'relationship');
    assert.equal(result.memory_file, 'memory/relationship-lines.md');
    assert.equal(result.fb_group, 'Gift-shopping-biye boi');
    assert.equal(result.post_allowed, true);
  });

  test('generic private wording still blocks an otherwise postable lifestyle route', async () => {
    const result = classifyTopic({
      type: 'image',
      title: 'private travel photo',
      attachment_paths: ['fixture.jpg'],
    });
    assert.equal(result.category, 'private');
    assert.equal(result.fb_group, null);
    assert.equal(result.post_allowed, false);
  });

  test('explicit Favorite fallback is demoted when travel is a specific match', async () => {
    const result = classifyTopic({
      category: 'favorite',
      type: 'image',
      title: 'mountain travel trip',
      attachment_paths: ['fixture.jpg'],
    });
    assert.equal(result.category, 'travel');
    assert.equal(result.fb_group, 'Travel-Ghuraghuri boi');
  });

  test('explicit Others fallback is demoted when food is a specific match', async () => {
    const result = classifyTopic({
      category: 'others',
      type: 'image',
      title: 'restaurant recipe dish',
      attachment_paths: ['fixture.jpg'],
    });
    assert.equal(result.category, 'food-health');
    assert.equal(result.fb_group, 'Food-Health-vlog');
  });

  test('sensitive signals override even an explicit active route', async () => {
    const result = classifyTopic({
      category: 'travel',
      type: 'image',
      title: 'bank account number screenshot',
      attachment_paths: ['fixture.jpg'],
    });
    assert.equal(result.category, 'private');
    assert.equal(result.fb_group, null);
    assert.equal(result.post_allowed, false);
  });

  test('ambiguous specific-topic tie requires review and cannot post', async () => {
    const result = classifyTopic({
      type: 'image',
      title: 'travel restaurant',
      attachment_paths: ['fixture.jpg'],
    });
    assert.equal(result.needs_review, true);
    assert.equal(result.post_allowed, false);
  });

  test('explicit Favorite memory home infers Favorite boi', async () => {
    const result = classifyTopic({
      type: 'image',
      title: 'Neutral visual reference',
      memory_file: 'memory/favorite-posts.md',
      attachment_paths: ['fixture.jpg'],
    });
    assert.equal(result.category, 'favorite');
    assert.equal(result.fb_group, 'Favorite boi');
  });

  test('explicit Others memory home infers Others boi', async () => {
    const result = classifyTopic({
      type: 'image',
      title: 'Neutral visual reference',
      memory_file: 'memory/others-boi.md',
      attachment_paths: ['fixture.jpg'],
    });
    assert.equal(result.category, 'others');
    assert.equal(result.fb_group, 'Others boi');
  });

  test('favorite text is filed as Favorite but remains non-postable', async () => {
    const result = classifyTopic({ type: 'text', title: 'I love this unusual thought' });
    assert.equal(result.category, 'favorite');
    assert.equal(result.memory_file, 'memory/favorite-posts.md');
    assert.equal(result.fb_group, 'Favorite boi');
    assert.equal(result.post_allowed, false);
  });
  test('explicit meme-template wording overrides a broader funny category', async () => {
    const result = classifyTopic({
      type: 'image',
      title: 'Ronaldo World Cup meme template',
      text: 'save to meme template',
      category: 'funny',
      memory_file: 'memory/meme-boi.md',
      attachment_paths: ['fixture.jpg'],
    });
    assert.equal(result.category, 'meme-template');
    assert.equal(result.fb_group, ACTIVE_ROUTES['meme-template'].fb_group);
  });

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
    ['relationship line', { category: 'relationship', title: 'romantic line for wife' }, 'memory/relationship-lines.md'],
    ['relationship drama', { category: 'relationship', title: 'relationship drama prompt love triangle' }, 'memory/relationship-drama-prompts.md'],
    ['marriage rule', { category: 'relationship', title: 'marriage rule wife first' }, 'memory/marriage-rules.md'],
    ['wife pose', { category: 'relationship', title: 'wife pose photo reference' }, 'memory/wife-shopping-references.md'],
    ['kobita', { category: 'ghotona-kobita', title: 'handwritten kobita poem' }, 'memory/kobita-boi.md'],
    ['ghotona', { category: 'ghotona-kobita', title: 'real-life incident' }, 'memory/ghotona-boi.md'],
  ];
  for (const [name, input, expected] of narrowCases) {
    test(`narrow memory: ${name}`, async () => {
      assert.equal(classifyTopic({ type: 'link', source: 'https://example.com/x', ...input }).memory_file, expected);
    });
  }

  for (const category of ['private', 'tech', 'learning', 'career', 'openclaw', 'personal']) {
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
    ['explicit image without attachment containing URL becomes link', { type: 'image', text: 'see https://example.com/a' }, 'link'],
    ['explicit image with attachment containing URL remains image', {
      type: 'image',
      attachment_paths: [fixtures.imageA],
      text: 'see https://example.com/a',
    }, 'image'],
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
  test('transport image placeholder is removed when a real user URL is present', async () => {
    const input = {
      type: 'image',
      source: 'https://example.com/image.jpg',
      title: 'MEDIA:https://example.com/image.jpg save https://youtu.be/b2AOa8BHTPw?si=tracking',
    };
    assert.deepEqual(canonicalMediaUrls(input), ['https://www.youtube.com/watch?v=b2AOa8BHTPw']);
    assert.deepEqual(normalizeIncomingMedia(input), {
      ...input,
      type: 'link',
      url: 'https://www.youtube.com/watch?v=b2AOa8BHTPw',
      source: 'https://www.youtube.com/watch?v=b2AOa8BHTPw',
      canonical_urls: ['https://www.youtube.com/watch?v=b2AOa8BHTPw'],
    });
  });
  test('transport image placeholder alone is never treated as a real link', async () => {
    const input = { type: 'image', source: 'https://example.com/image.jpg' };
    assert.deepEqual(canonicalMediaUrls(input), []);
    assert.equal(inferContentType(input), 'image');
    assert.deepEqual(normalizeIncomingMedia(input), input);
  });

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
  test('Favorite and Others memory homes are active and not protected', async () => {
    assert.equal(isProtectedMemoryPath('memory/favorite-posts.md'), false);
    assert.equal(isProtectedMemoryPath('memory/others-boi.md'), false);
  });
  test('all direct relationship memory homes are active and not protected', async () => {
    for (const memoryFile of [
      'memory/relationship-lines.md',
      'memory/relationship-drama-prompts.md',
      'memory/marriage-rules.md',
      'memory/wife-shopping-references.md',
      'memory/relationship/new-reference.md',
    ]) {
      assert.equal(isProtectedMemoryPath(memoryFile), false);
    }
  });
  test('legacy personal tracking homes remain protected', async () => {
    assert.equal(isProtectedMemoryPath('memory/share-koro.md'), true);
    assert.equal(isProtectedMemoryPath('memory/fb-commented-posts.md'), true);
  });
  for (const [input, expected] of [
    ['fav', 'favorite'],
    ['favourite-boi', 'favorite'],
    ['other', 'others'],
    ['miscellaneous', 'others'],
    ['others-boi', 'others'],
    ['wife', 'relationship'],
    ['marriage', 'relationship'],
    ['marriage-rule', 'relationship'],
    ['relationship-drama', 'relationship'],
  ]) {
    test(`category alias ${input} -> ${expected}`, async () => assert.equal(normalizeCategory(input), expected));
  }
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
  test('post guard turns a mislabeled transport preview into the real link handoff', async () => {
    const result = await prepareFbPost(linkInput({
      type: 'image',
      source: 'https://example.com/image.jpg',
      title: 'MEDIA:https://example.com/image.jpg save https://youtu.be/b2AOa8BHTPw?si=tracking',
    }));
    assert.equal(result.ready, true);
    assert.equal(result.browser_handoff.message_text, 'https://www.youtube.com/watch?v=b2AOa8BHTPw');
    assert.doesNotMatch(result.browser_handoff.message_text, /example\.com\/image\.jpg/iu);
  });
  test('post guard corrects a supplied group to the active memory-file group', async () => {
    const result = await prepareFbPost(linkInput({
      category: 'relationship',
      memory_file: 'memory/funny-posts.md',
      fb_group: 'Gift-shopping-biye boi',
    }));
    assert.equal(result.ready, true);
    assert.equal(result.target_group, 'meme boi');
    assert.equal(result.browser_handoff.target_group, 'meme boi');
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
    const result = await prepareFbPost(linkInput({
      memory_file: 'memory/unmapped-reference.md',
      fb_group: 'Not A Real Group',
    }));
    assert.equal(result.blocked, 'memory_only_or_unknown_group');
  });
  test('post guard preserves exact group capitalization', async () => {
    const result = await prepareFbPost(linkInput({
      memory_file: 'memory/unmapped-reference.md',
      fb_group: 'travel-ghuraghuri boi',
    }));
    assert.equal(result.blocked, 'memory_only_or_unknown_group');
  });
  for (const wrongCase of ['favorite boi', 'others boi']) {
    test(`post guard rejects wrong fallback capitalization: ${wrongCase}`, async () => {
      const result = await prepareFbPost(linkInput({
        memory_file: 'memory/unmapped-reference.md',
        fb_group: wrongCase,
      }));
      assert.equal(result.blocked, 'memory_only_or_unknown_group');
    });
  }
  test('post guard blocks protected memory', async () => {
    const result = await prepareFbPost(linkInput({ memory_file: 'memory/banking-details.md' }));
    assert.equal(result.blocked, 'protected_memory');
  });
  test('post guard accepts every relationship memory home for Gift-shopping-biye boi', async () => {
    for (const memoryFile of [
      'memory/relationship-lines.md',
      'memory/relationship-drama-prompts.md',
      'memory/marriage-rules.md',
      'memory/wife-shopping-references.md',
    ]) {
      const result = await prepareFbPost(linkInput({
        category: memoryFile === 'memory/wife-shopping-references.md' ? 'gift-shopping' : 'relationship',
        memory_file: memoryFile,
        fb_group: 'Gift-shopping-biye boi',
        source: `https://example.com/${path.basename(memoryFile, '.md')}`,
      }));
      assert.equal(result.ready, true);
    }
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
    assert.equal(result.memory_duplicate, true);
    assert.equal(result.delivery_duplicate, false);
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
    assert.equal(result.memory_duplicate, true);
    assert.equal(result.delivery_duplicate, false);
    assert.ok(result.reasons.includes('attachment_hash'));
  });
  test('dedupe finds a legacy workspace-relative attachment path in memory', async () => {
    const workspace = await freshWorkspace('dedupe-relative-path');
    const attachment = path.join(workspace, 'downloads', 'reference_images', 'meme-boi', 'legacy.jpg');
    await fs.mkdir(path.dirname(attachment), { recursive: true });
    await fs.copyFile(fixtures.imageA, attachment);
    await fs.writeFile(
      path.join(workspace, 'memory', 'travel.md'),
      '- **Saved image copy:** `downloads/reference_images/meme-boi/legacy.jpg`\n',
    );
    const result = await checkDuplicate({
      workspace,
      memory_file: 'memory/travel.md',
      attachment_paths: [attachment],
    });
    assert.equal(result.memory_duplicate, true);
    assert.equal(result.delivery_duplicate, false);
    assert.ok(result.reasons.includes('attachment_path'));
  });
  test('dedupe does not treat a reused title as the same image when a strong hash differs', async () => {
    const workspace = await freshWorkspace('dedupe-title-image');
    await fs.writeFile(path.join(workspace, 'memory', 'travel.md'), '### Reused media title\n');
    const result = await checkDuplicate({
      workspace,
      memory_file: 'memory/travel.md',
      title: 'Reused media title',
      attachment_paths: [fixtures.imageDifferent],
    });
    assert.equal(result.duplicate, false);
    assert.equal(result.memory_duplicate, false);
  });
  test('dedupe recognizes a richly described re-encoded media title despite a different byte hash', async () => {
    const workspace = await freshWorkspace('dedupe-reencoded-title');
    await fs.writeFile(
      path.join(workspace, 'memory', 'meme-boi.md'),
      '### 25) Ronaldo crying vs Yamal & Messi sleeping with World Cup trophy meme\n',
    );
    const result = await checkDuplicate({
      workspace,
      memory_file: 'memory/meme-boi.md',
      title: 'Ronaldo crying while Yamal and Messi sleep with World Cup trophy - meme template',
      attachment_paths: [fixtures.imageDifferent],
    });
    assert.equal(result.duplicate, true);
    assert.equal(result.memory_duplicate, true);
    assert.ok(result.reasons.includes('similar_media_title'));
  });
  test('dedupe finds URL in metadata log', async () => {
    const workspace = await freshWorkspace('dedupe-log-url');
    await fs.writeFile(path.join(workspace, 'memory', 'fb_second_brain_log.jsonl'), `${JSON.stringify({ canonical_urls: ['https://example.com/logged'] })}\n`);
    const result = await checkDuplicate({ workspace, memory_file: 'memory/travel.md', source: 'https://example.com/logged?utm_source=x' });
    assert.equal(result.duplicate, true);
    assert.equal(result.memory_duplicate, true);
    assert.equal(result.delivery_duplicate, false);
    assert.ok(result.reasons.includes('logged_canonical_url'));
  });
  test('only a verified sent log is a delivery duplicate', async () => {
    const workspace = await freshWorkspace('dedupe-sent-log');
    const logFile = path.join(workspace, 'memory', 'fb_second_brain_log.jsonl');
    await fs.writeFile(logFile, [
      JSON.stringify({ canonical_urls: ['https://example.com/not-sent'], post_status: 'skipped_duplicate' }),
      JSON.stringify({ canonical_urls: ['https://example.com/sent'], post_status: 'sent' }),
      '',
    ].join('\n'));
    const notSent = await checkDuplicate({
      workspace,
      memory_file: 'memory/travel.md',
      source: 'https://example.com/not-sent',
    });
    const sent = await checkDuplicate({
      workspace,
      memory_file: 'memory/travel.md',
      source: 'https://example.com/sent',
    });
    assert.equal(notSent.memory_duplicate, true);
    assert.equal(notSent.delivery_duplicate, false);
    assert.equal(sent.memory_duplicate, true);
    assert.equal(sent.delivery_duplicate, true);
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
    await expectReject(() => logMetadata({
      workspace,
      ...linkInput({ memory_file: 'memory/unmapped-reference.md', fb_group: 'Unknown Group' }),
      post_status: 'sent',
    }), /Unknown FB group/);
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
    assert.equal(result.queue_number, 1);
    assert.equal(result.post_manifest.browser_handoff.profile, 'openclaw');
    assert.equal(await exists(result.post_manifest.browser_handoff.attachment_paths[0]), true);
    assert.deepEqual(await fs.readFile(result.post_manifest.browser_handoff.attachment_paths[0]), await fs.readFile(fixtures.imageA));
    const job = JSON.parse(await fs.readFile(path.join(workspace, result.queue_file), 'utf8'));
    assert.equal(job.queue_number, 1);
  });
  test('queue stores links without payload files', async () => {
    const workspace = await freshWorkspace('queue-link');
    const result = await enqueueMediaJob({ workspace, ...linkInput() });
    const status = await queueStatus({ workspace });
    assert.equal(result.queued, true);
    assert.deepEqual(result.payload_paths, []);
    assert.equal(status.pending, 1);
    assert.equal(status.last_queue_number, 1);
    assert.equal(status.next_queue_number, 2);
  });
  test('queue records the active memory-file group instead of a conflicting caller group', async () => {
    const workspace = await freshWorkspace('queue-memory-route-authority');
    const result = await enqueueMediaJob({
      workspace,
      ...mediaInput({
        category: 'relationship',
        memory_file: 'memory/funny-posts.md',
        fb_group: 'Gift-shopping-biye boi',
      }),
    });
    const job = JSON.parse(await fs.readFile(path.join(workspace, result.queue_file), 'utf8'));
    assert.equal(result.queued, true);
    assert.equal(result.target_group, 'meme boi');
    assert.equal(job.category, 'funny');
    assert.equal(job.memory_file, 'memory/funny-posts.md');
    assert.equal(job.fb_group, 'meme boi');
    assert.equal(job.post_manifest.browser_handoff.target_group, 'meme boi');
  });
  test('queue automatically upgrades an equivalent Others job to a specific crush route', async () => {
    const workspace = await freshWorkspace('queue-specificity-upgrade');
    const url = 'https://example.com/same-crush-media';
    const fingerprint = crypto.createHash('sha256').update(url).digest('hex');
    const first = await enqueueMediaJob({
      workspace,
      ...linkInput({
        source: url,
        category: 'others',
        memory_file: 'memory/others-boi.md',
        fb_group: 'Others boi',
        canonical_urls: [url],
        content_fingerprint: fingerprint,
      }),
    });
    const second = await enqueueMediaJob({
      workspace,
      ...linkInput({
        source: url,
        category: 'relationship',
        memory_file: 'memory/crush-lines.md',
        fb_group: 'Gift-shopping-biye boi',
        canonical_urls: [url],
        content_fingerprint: fingerprint,
        route_override: false,
      }),
    });
    const pendingFiles = await fs.readdir(path.join(workspace, '.queue', 'fb-second-brain', 'pending'));
    const job = JSON.parse(await fs.readFile(
      path.join(workspace, '.queue', 'fb-second-brain', 'pending', pendingFiles[0]),
      'utf8',
    ));
    assert.equal(first.target_group, 'Others boi');
    assert.equal(second.skipped, 'already_queued');
    assert.equal(second.route_updated, true);
    assert.equal(second.previous_target_group, 'Others boi');
    assert.equal(second.target_group, 'Gift-shopping-biye boi');
    assert.equal(job.memory_file, 'memory/crush-lines.md');
    assert.equal(job.category, 'relationship');
    assert.equal(job.fb_group, 'Gift-shopping-biye boi');
  });
  test('queue does not downgrade a specific crush route to Others without authority', async () => {
    const workspace = await freshWorkspace('queue-no-specificity-downgrade');
    const url = 'https://example.com/specific-crush-media';
    const fingerprint = crypto.createHash('sha256').update(url).digest('hex');
    const first = await enqueueMediaJob({
      workspace,
      ...linkInput({
        source: url,
        category: 'relationship',
        memory_file: 'memory/crush-lines.md',
        fb_group: 'Gift-shopping-biye boi',
        canonical_urls: [url],
        content_fingerprint: fingerprint,
      }),
    });
    const second = await enqueueMediaJob({
      workspace,
      ...linkInput({
        source: url,
        category: 'others',
        memory_file: 'memory/others-boi.md',
        fb_group: 'Others boi',
        canonical_urls: [url],
        content_fingerprint: fingerprint,
        route_override: false,
      }),
    });
    assert.equal(first.target_group, 'Gift-shopping-biye boi');
    assert.equal(second.route_updated, false);
    assert.equal(second.target_group, 'Gift-shopping-biye boi');
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
    assert.equal(first.queue_number, 1);
    assert.equal(second.queue_number, 1);
    assert.equal((await queueStatus({ workspace })).pending, 1);
  });
  test('queue reuses a semantically equivalent rich-title media job after re-encoding', async () => {
    const workspace = await freshWorkspace('queue-reencoded-title');
    const route = {
      category: 'meme-template',
      memory_file: 'memory/meme-boi.md',
      fb_group: ACTIVE_ROUTES['meme-template'].fb_group,
    };
    const first = await enqueueMediaJob({
      workspace,
      ...mediaInput({
        ...route,
        title: 'Ronaldo crying vs Yamal & Messi sleeping with World Cup trophy meme',
        attachment_paths: [fixtures.imageA],
        content_fingerprint: 'reencoded-first',
      }),
    });
    const second = await enqueueMediaJob({
      workspace,
      ...mediaInput({
        ...route,
        category: 'funny',
        fb_group: ACTIVE_ROUTES.funny.fb_group,
        title: 'Ronaldo crying while Yamal and Messi sleep with World Cup trophy - meme template',
        attachment_paths: [fixtures.imageDifferent],
        content_fingerprint: 'reencoded-second',
      }),
    });
    assert.equal(first.queued, true);
    assert.equal(second.skipped, 'already_queued');
    assert.equal(second.matched_by, 'similar_media_title');
    assert.equal(second.queue_number, first.queue_number);
    assert.equal((await queueStatus({ workspace })).pending, 1);
  });
  test('queue numbers remain monotonic after a completed job is removed', async () => {
    const workspace = await freshWorkspace('queue-number-monotonic');
    const first = await enqueueMediaJob({ workspace, ...linkInput() });
    const run = await beginRun({ workspace });
    const claim = await claimNext({ workspace, lock_token: run.lock_token });
    await completeJob({
      workspace,
      lock_token: run.lock_token,
      job_id: claim.job.id,
      verified: true,
      verification_note: 'isolated sequence test',
    });
    await endRun({ workspace, lock_token: run.lock_token });
    const second = await enqueueMediaJob({ workspace, ...linkInput() });
    const status = await queueStatus({ workspace });
    assert.equal(first.queue_number, 1);
    assert.equal(second.queue_number, 2);
    assert.equal(status.last_queue_number, 2);
    assert.equal(status.next_queue_number, 3);
  });
  test('queue status migrates a legacy unnumbered pending job', async () => {
    const workspace = await freshWorkspace('queue-number-migration');
    const queued = await enqueueMediaJob({ workspace, ...linkInput() });
    const jobPath = path.join(workspace, queued.queue_file);
    const job = JSON.parse(await fs.readFile(jobPath, 'utf8'));
    delete job.queue_number;
    job.schema_version = 1;
    await fs.writeFile(jobPath, `${JSON.stringify(job, null, 2)}\n`, 'utf8');
    const queueRoot = path.join(workspace, '.queue', 'fb-second-brain');
    await fs.rm(path.join(queueRoot, 'queue-sequence.json'), { force: true });
    const events = await readJsonLines(path.join(queueRoot, 'events.jsonl'));
    await fs.writeFile(
      path.join(queueRoot, 'events.jsonl'),
      `${events.map((event) => {
        const copy = { ...event };
        delete copy.queue_number;
        return JSON.stringify(copy);
      }).join('\n')}\n`,
      'utf8',
    );
    const status = await queueStatus({ workspace });
    const migrated = JSON.parse(await fs.readFile(jobPath, 'utf8'));
    assert.equal(migrated.queue_number, 1);
    assert.equal(status.last_queue_number, 1);
    assert.equal(status.next_queue_number, 2);
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
    assert.equal(result.queue_number, 1);
    assert.equal(result.queue.queue_number, 1);
    assert.equal((await queueStatus({ workspace })).pending, 1);
    assert.equal(result.post_manifest.browser_handoff.profile, 'openclaw');
  });
  test('producer preserves the agent-selected funny route despite relationship wording', async () => {
    const workspace = await freshWorkspace('producer-funny-posts-group');
    const result = await prepareDrop({
      workspace,
      type: 'image',
      title: 'Brazil fan wedding roast',
      text: 'save, jar biye tar khobor nai, erai brazil fans',
      source: 'Telegram',
      category: 'funny',
      memory_file: 'memory/funny-posts.md',
      attachment_paths: [fixtures.imageA],
    });
    const job = JSON.parse(await fs.readFile(path.join(workspace, result.queue.queue_file), 'utf8'));
    assert.equal(result.status, 'queued');
    assert.equal(result.classification.category, 'funny');
    assert.equal(result.classification.memory_file, 'memory/funny-posts.md');
    assert.equal(result.classification.fb_group, 'meme boi');
    assert.equal(result.queue.target_group, 'meme boi');
    assert.equal(job.fb_group, 'meme boi');
  });
  test('producer queues the agent-selected unmatched loved media to Favorite boi', async () => {
    const workspace = await freshWorkspace('producer-favorite-fallback');
    const result = await prepareDrop({
      workspace,
      type: 'image',
      title: 'I love this mesmerizing kinetic sculpture',
      text: 'save this, I love this',
      source: 'Telegram',
      category: 'favorite',
      memory_file: 'memory/favorite-posts.md',
      attachment_paths: [fixtures.imageA],
    });
    const job = JSON.parse(await fs.readFile(path.join(workspace, result.queue.queue_file), 'utf8'));
    assert.equal(result.status, 'queued');
    assert.equal(result.classification.category, 'favorite');
    assert.equal(result.classification.memory_file, 'memory/favorite-posts.md');
    assert.equal(result.classification.fb_group, 'Favorite boi');
    assert.equal(job.category, 'favorite');
    assert.equal(job.memory_file, 'memory/favorite-posts.md');
    assert.equal(job.fb_group, 'Favorite boi');
    assert.equal(job.post_manifest.browser_handoff.target_group, 'Favorite boi');
    assert.equal((await queueStatus({ workspace })).pending, 1);
  });

  test('producer queues the agent-selected unmatched neutral media to Others boi', async () => {
    const workspace = await freshWorkspace('producer-others-fallback');
    const result = await prepareDrop({
      workspace,
      type: 'video',
      title: 'Slow motion color experiment',
      text: 'save this reference',
      source: 'Telegram',
      category: 'others',
      memory_file: 'memory/others-boi.md',
      attachment_paths: [fixtures.video],
    });
    const job = JSON.parse(await fs.readFile(path.join(workspace, result.queue.queue_file), 'utf8'));
    assert.equal(result.status, 'queued');
    assert.equal(result.classification.category, 'others');
    assert.equal(result.classification.memory_file, 'memory/others-boi.md');
    assert.equal(result.classification.fb_group, 'Others boi');
    assert.equal(job.category, 'others');
    assert.equal(job.memory_file, 'memory/others-boi.md');
    assert.equal(job.fb_group, 'Others boi');
    assert.equal(job.post_manifest.browser_handoff.target_group, 'Others boi');
    assert.equal((await queueStatus({ workspace })).pending, 1);
  });

  for (const [name, title, expectedCategory, expectedGroup, expectedMemory] of [
    [
      'Favorite',
      'I love this mesmerizing kinetic sculpture',
      'favorite',
      'Favorite boi',
      'memory/favorite-posts.md',
    ],
    [
      'Others',
      'Mesmerizing kinetic sculpture',
      'others',
      'Others boi',
      'memory/others-boi.md',
    ],
  ]) {
    test(`prepare-drop CLI routes ${name} in an isolated workspace`, async () => {
      const workspace = await freshWorkspace(`producer-cli-${expectedCategory}`);
      const inputPath = path.join(testRoot, `cli-${expectedCategory}.json`);
      await fs.writeFile(inputPath, `${JSON.stringify({
        workspace,
        type: 'image',
        title,
        source: 'Telegram',
        category: expectedCategory,
        memory_file: expectedMemory,
        attachment_paths: [fixtures.imageDifferent],
      }, null, 2)}\n`);
      const { stdout } = await execFileAsync(process.execPath, [
        path.join(SCRIPT_DIR, 'prepare-drop.mjs'),
        '--input',
        inputPath,
      ], { windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
      const result = JSON.parse(stdout);
      assert.equal(result.status, 'queued');
      assert.equal(result.classification.category, expectedCategory);
      assert.equal(result.classification.fb_group, expectedGroup);
      assert.equal(result.classification.memory_file, expectedMemory);
      assert.equal(result.queue.target_group, expectedGroup);
      assert.equal((await queueStatus({ workspace })).pending, 1);
    });
  }

  test('producer sends loved travel media to Travel, not Favorite', async () => {
    const workspace = await freshWorkspace('producer-specific-over-favorite');
    const result = await prepareDrop({
      workspace,
      type: 'image',
      title: 'I love this mountain travel trip',
      source: 'Telegram',
      category: 'travel',
      memory_file: 'memory/travel.md',
      attachment_paths: [fixtures.imageA],
    });
    assert.equal(result.status, 'queued');
    assert.equal(result.classification.category, 'travel');
    assert.equal(result.classification.fb_group, 'Travel-Ghuraghuri boi');
    assert.equal(result.queue.target_group, 'Travel-Ghuraghuri boi');
  });

  test('producer sends unlabeled audio to caption-pose-song, not Others', async () => {
    const workspace = await freshWorkspace('producer-audio-specific');
    const result = await prepareDrop({
      workspace,
      type: 'audio',
      title: 'Ambient field recording',
      source: 'Telegram',
      category: 'caption-song',
      memory_file: 'memory/audio.md',
      attachment_paths: [fixtures.audio],
    });
    assert.equal(result.status, 'queued');
    assert.equal(result.classification.category, 'caption-song');
    assert.equal(result.classification.fb_group, 'caption-pose-song boi');
    assert.equal(result.queue.target_group, 'caption-pose-song boi');
  });

  test('producer keeps loved Tech media memory-only instead of using a fallback group', async () => {
    const workspace = await freshWorkspace('producer-favorite-tech-safe');
    const result = await prepareDrop({
      workspace,
      type: 'image',
      title: 'I love this Docker backend architecture tutorial',
      source: 'Telegram',
      category: 'tech',
      memory_file: 'memory/backend/docker.md',
      attachment_paths: [fixtures.imageA],
    });
    assert.equal(result.status, 'memory_saved');
    assert.equal(result.classification.category, 'tech');
    assert.equal(result.classification.fb_group, null);
    assert.equal(result.post_manifest.blocked, 'memory_only_or_unknown_group');
    assert.equal((await queueStatus({ workspace })).pending, 0);
  });

  for (const [name, title, memoryFile, expectedCategory] of [
    ['relationship lines', 'romantic line for wife', 'memory/relationship-lines.md', 'relationship'],
    ['relationship drama', 'relationship drama prompt love triangle', 'memory/relationship-drama-prompts.md', 'relationship'],
    ['marriage rules', 'marriage rule wife first', 'memory/marriage-rules.md', 'relationship'],
    ['wife shopping', 'wife saree shopping reference', 'memory/wife-shopping-references.md', 'gift-shopping'],
  ]) {
    test(`producer queues ${name} media to Gift-shopping-biye boi`, async () => {
      const workspace = await freshWorkspace(`producer-${name.replace(/\s+/g, '-')}`);
      const result = await prepareDrop({
        workspace,
        type: 'image',
        title,
        source: 'Telegram',
        category: expectedCategory,
        memory_file: memoryFile,
        attachment_paths: [fixtures.imageA],
      });
      assert.equal(result.status, 'queued');
      assert.equal(result.classification.category, expectedCategory);
      assert.equal(result.classification.memory_file, memoryFile);
      assert.equal(result.classification.fb_group, 'Gift-shopping-biye boi');
      assert.equal(result.memory.saved, true);
      assert.equal(result.queue.target_group, 'Gift-shopping-biye boi');
      const queueJob = JSON.parse(await fs.readFile(path.join(workspace, result.queue.queue_file), 'utf8'));
      assert.equal(queueJob.memory_file, memoryFile);
      assert.equal(queueJob.fb_group, 'Gift-shopping-biye boi');
      assert.equal((await queueStatus({ workspace })).pending, 1);
    });
  }

  test('producer accepts the agent-routed marriage-rule screenshot and queues it', async () => {
    const workspace = await freshWorkspace('producer-marriage-rule-auto');
    const result = await prepareDrop({
      workspace,
      type: 'image',
      title: 'Marriage rule #1: Wife always first',
      text: 'save, marriage rule no 1 Wife always first!',
      source: 'Telegram reel screenshot',
      category: 'relationship',
      memory_file: 'memory/marriage-rules.md',
      attachment_paths: [fixtures.imageA],
    });
    assert.equal(result.status, 'queued');
    assert.equal(result.classification.category, 'relationship');
    assert.equal(result.classification.memory_file, 'memory/marriage-rules.md');
    assert.equal(result.classification.fb_group, 'Gift-shopping-biye boi');
    assert.equal(result.queue.target_group, 'Gift-shopping-biye boi');
  });

  test('producer keeps relationship text-only in memory without a queue item', async () => {
    const workspace = await freshWorkspace('producer-relationship-text');
    const result = await prepareDrop({
      workspace,
      type: 'text',
      title: 'Romantic line for wife',
      text: 'Ei romantic line-ta save kore rakho',
      category: 'relationship',
      memory_file: 'memory/relationship-lines.md',
      source: 'Telegram',
    });
    assert.equal(result.status, 'memory_saved');
    assert.equal(result.classification.fb_group, 'Gift-shopping-biye boi');
    assert.equal(result.classification.post_allowed, false);
    assert.equal(result.post_manifest.blocked, 'text_only');
    assert.equal((await queueStatus({ workspace })).pending, 0);
  });

  test('producer saves favorite text without creating a Messenger queue item', async () => {
    const workspace = await freshWorkspace('producer-favorite-text');
    const result = await prepareDrop({
      workspace,
      type: 'text',
      title: 'I love this unusual thought',
      text: 'I love this unusual thought',
      source: 'Telegram',
      category: 'favorite',
      memory_file: 'memory/favorite-posts.md',
    });
    assert.equal(result.status, 'memory_saved');
    assert.equal(result.classification.category, 'favorite');
    assert.equal(result.classification.fb_group, 'Favorite boi');
    assert.equal(result.post_manifest.blocked, 'text_only');
    assert.equal((await queueStatus({ workspace })).pending, 0);
  });

  test('producer refuses to write or queue an ambiguous specific-topic tie', async () => {
    const workspace = await freshWorkspace('producer-ambiguous-route');
    const result = await prepareDrop({
      workspace,
      type: 'image',
      title: 'travel restaurant',
      source: 'Telegram',
      attachment_paths: [fixtures.imageA],
    });
    assert.equal(result.status, 'needs_review');
    assert.equal(result.wrote_memory, false);
    assert.equal(result.classification.post_allowed, false);
    assert.equal((await queueStatus({ workspace })).pending, 0);
  });

  test('producer queues an unmatched link to Others with its canonical URL', async () => {
    const workspace = await freshWorkspace('producer-others-link');
    const result = await prepareDrop({
      workspace,
      type: 'link',
      title: 'Uncategorized visual reference',
      source: 'https://example.com/abstract-object?utm_source=test',
      category: 'others',
      memory_file: 'memory/others-boi.md',
    });
    const job = JSON.parse(await fs.readFile(path.join(workspace, result.queue.queue_file), 'utf8'));
    assert.equal(result.status, 'queued');
    assert.equal(result.classification.category, 'others');
    assert.equal(result.queue.target_group, 'Others boi');
    assert.deepEqual(job.canonical_urls, ['https://example.com/abstract-object']);
    assert.equal(job.post_manifest.browser_handoff.message_text, 'https://example.com/abstract-object');
  });

  test('producer retargets the same pending queue item from Others to Favorite after clarification', async () => {
    const workspace = await freshWorkspace('producer-fallback-retarget');
    const first = await prepareDrop({
      workspace,
      type: 'image',
      title: 'Mesmerizing kinetic sculpture',
      source: 'Telegram',
      category: 'others',
      memory_file: 'memory/others-boi.md',
      attachment_paths: [fixtures.imageA],
    });
    const second = await prepareDrop({
      workspace,
      type: 'image',
      title: 'I love this mesmerizing kinetic sculpture',
      source: 'Telegram',
      category: 'favorite',
      memory_file: 'memory/favorite-posts.md',
      attachment_paths: [fixtures.imageCopy],
      route_override: true,
    });
    const queue = await queueStatus({ workspace });
    const pendingFiles = await fs.readdir(path.join(workspace, '.queue', 'fb-second-brain', 'pending'));
    const job = JSON.parse(await fs.readFile(
      path.join(workspace, '.queue', 'fb-second-brain', 'pending', pendingFiles[0]),
      'utf8',
    ));
    const events = await readJsonLines(path.join(workspace, '.queue', 'fb-second-brain', 'events.jsonl'));
    assert.equal(first.status, 'queued');
    assert.equal(first.queue.target_group, 'Others boi');
    assert.equal(second.status, 'already_queued');
    assert.equal(second.queue_number, first.queue_number);
    assert.equal(second.queue.route_updated, true);
    assert.equal(second.queue.previous_target_group, 'Others boi');
    assert.equal(second.queue.target_group, 'Favorite boi');
    assert.equal(queue.pending, 1);
    assert.equal(job.fb_group, 'Favorite boi');
    assert.equal(job.memory_file, 'memory/favorite-posts.md');
    assert.equal(job.post_manifest.browser_handoff.target_group, 'Favorite boi');
    assert.ok(events.some((entry) => (
      entry.event === 'route_updated'
      && entry.from_group === 'Others boi'
      && entry.to_group === 'Favorite boi'
    )));
  });
  test('producer retargets the screenshot crush link from captions to crush-lines and Gift-shopping', async () => {
    const workspace = await freshWorkspace('producer-crush-route-repair');
    const source = 'https://www.facebook.com/share/v/19GxVt2tBb/?mibextid=wwXIfr';
    const first = await prepareDrop({
      workspace,
      type: 'link',
      title: 'Generic caption wrapper',
      text: 'save this caption',
      summary: 'Old broad caption summary',
      source,
      tags: ['old-caption'],
      category: 'caption-song',
      memory_file: 'memory/captions.md',
    });
    const second = await prepareDrop({
      workspace,
      type: 'link',
      title: 'Crush acceptance line',
      text: 'save, amio amar crush ke 2 bacchar ma holeo mene nibo',
      summary: 'Clean narrow crush summary',
      source,
      tags: ['crush', 'relationship'],
      category: 'relationship',
      memory_file: 'memory/crush-lines.md',
    });
    const pendingFiles = await fs.readdir(path.join(workspace, '.queue', 'fb-second-brain', 'pending'));
    const job = JSON.parse(await fs.readFile(
      path.join(workspace, '.queue', 'fb-second-brain', 'pending', pendingFiles[0]),
      'utf8',
    ));
    assert.equal(first.queue.target_group, 'caption-pose-song boi');
    assert.equal(second.status, 'already_queued');
    assert.equal(second.queue_number, first.queue_number);
    assert.equal(second.queue.route_updated, true);
    assert.equal(second.queue.previous_target_group, 'caption-pose-song boi');
    assert.equal(second.queue.target_group, 'Gift-shopping-biye boi');
    assert.equal(job.memory_file, 'memory/crush-lines.md');
    assert.equal(job.fb_group, 'Gift-shopping-biye boi');
    assert.equal(job.title, 'Crush acceptance line');
    assert.equal(job.text, 'save, amio amar crush ke 2 bacchar ma holeo mene nibo');
    assert.equal(job.summary, 'Clean narrow crush summary');
    assert.deepEqual(job.tags, ['crush', 'relationship']);
    assert.equal(job.post_manifest.browser_handoff.target_group, 'Gift-shopping-biye boi');
  });
  test('producer retargets an existing Others image job when funny-posts is selected', async () => {
    const workspace = await freshWorkspace('producer-funny-route-repair');
    const first = await prepareDrop({
      workspace,
      type: 'image',
      title: 'Unclassified image',
      text: 'save',
      source: 'Telegram',
      category: 'others',
      memory_file: 'memory/others-boi.md',
      attachment_paths: [fixtures.imageA],
    });
    const second = await prepareDrop({
      workspace,
      type: 'image',
      title: 'KID classic funny meme',
      text: 'funny meme',
      source: 'Telegram',
      category: 'funny',
      memory_file: 'memory/funny-posts.md',
      attachment_paths: [fixtures.imageCopy],
    });
    const pendingFiles = await fs.readdir(path.join(workspace, '.queue', 'fb-second-brain', 'pending'));
    const job = JSON.parse(await fs.readFile(
      path.join(workspace, '.queue', 'fb-second-brain', 'pending', pendingFiles[0]),
      'utf8',
    ));
    assert.equal(first.queue.target_group, 'Others boi');
    assert.equal(second.status, 'already_queued');
    assert.equal(second.queue_number, first.queue_number);
    assert.equal(second.queue.route_updated, true);
    assert.equal(second.queue.previous_target_group, 'Others boi');
    assert.equal(second.queue.target_group, 'meme boi');
    assert.equal(job.memory_file, 'memory/funny-posts.md');
    assert.equal(job.fb_group, 'meme boi');
  });
  test('producer keeps the original pending route unless clarification explicitly overrides it', async () => {
    const workspace = await freshWorkspace('producer-route-lock');
    const first = await prepareDrop({
      workspace,
      type: 'image',
      title: 'Unmatched kinetic sculpture',
      source: 'Telegram',
      category: 'others',
      memory_file: 'memory/others-boi.md',
      attachment_paths: [fixtures.imageA],
    });
    const second = await prepareDrop({
      workspace,
      type: 'image',
      title: 'I love this unmatched kinetic sculpture',
      source: 'Telegram',
      category: 'others',
      memory_file: 'memory/others-boi.md',
      attachment_paths: [fixtures.imageCopy],
    });
    const queue = await queueStatus({ workspace });
    const pendingFiles = await fs.readdir(path.join(workspace, '.queue', 'fb-second-brain', 'pending'));
    const job = JSON.parse(await fs.readFile(
      path.join(workspace, '.queue', 'fb-second-brain', 'pending', pendingFiles[0]),
      'utf8',
    ));
    assert.equal(first.status, 'queued');
    assert.equal(first.queue.target_group, 'Others boi');
    assert.equal(second.status, 'already_queued');
    assert.equal(second.queue_number, first.queue_number);
    assert.equal(second.queue.route_updated, false);
    assert.equal(second.queue.target_group, 'Others boi');
    assert.equal(queue.pending, 1);
    assert.equal(job.fb_group, 'Others boi');
  });
  test('producer preserves optional media text in memory and the queue handoff', async () => {
    const workspace = await freshWorkspace('producer-media-text');
    const result = await prepareDrop({
      workspace,
      ...mediaInput({
        text: 'save this football image',
        post_text: 'World Cup mood 😂',
      }),
    });
    const job = JSON.parse(await fs.readFile(path.join(workspace, result.queue.queue_file), 'utf8'));
    assert.equal(result.status, 'queued');
    assert.equal(job.text, 'save this football image');
    assert.equal(job.post_text, 'World Cup mood 😂');
    assert.equal(job.post_manifest.browser_handoff.message_text, 'World Cup mood 😂');
    assert.match(await fs.readFile(path.join(workspace, 'memory', 'travel.md'), 'utf8'), /save this football image/);
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
  test('producer canonical duplicate reuses the active queue job', async () => {
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
    assert.equal(second.status, 'already_queued');
    assert.equal(second.queue_number, first.queue_number);
    assert.equal(second.memory.saved, false);
    assert.equal((await queueStatus({ workspace })).pending, 1);
    assert.equal(second.metadata_log, null);
  });
  test('producer skips a second memory entry and reuses the queue for re-encoded rich-title media', async () => {
    const workspace = await freshWorkspace('producer-reencoded-title');
    const route = {
      category: 'meme-template',
      memory_file: 'memory/meme-boi.md',
      fb_group: ACTIVE_ROUTES['meme-template'].fb_group,
      privacy_reviewed: true,
    };
    const first = await prepareDrop({
      workspace,
      ...mediaInput({
        ...route,
        title: 'Ronaldo crying vs Yamal & Messi sleeping with World Cup trophy meme',
        attachment_paths: [fixtures.imageA],
      }),
    });
    const second = await prepareDrop({
      workspace,
      ...mediaInput({
        ...route,
        category: 'meme-template',
        title: 'Ronaldo crying while Yamal and Messi sleep with World Cup trophy - meme template',
        attachment_paths: undefined,
        attachments: [{ path: fixtures.imageDifferent, mimeType: 'image/png' }],
      }),
    });
    const memory = await fs.readFile(path.join(workspace, 'memory', 'meme-boi.md'), 'utf8');
    assert.equal(first.status, 'queued');
    assert.equal(second.status, 'already_queued');
    assert.equal(second.queue_number, first.queue_number);
    assert.equal(second.memory.saved, false);
    assert.equal(second.classification.category, 'meme-template');
    assert.equal((memory.match(/^### /gmu) ?? []).length, 1);
    assert.equal((await queueStatus({ workspace })).pending, 1);
  });
  test('producer uses perceptual image identity when Telegram changes the file bytes and title', async () => {
    const workspace = await freshWorkspace('producer-perceptual-image');
    const route = {
      category: 'meme-template',
      memory_file: 'memory/meme-boi.md',
      fb_group: ACTIVE_ROUTES['meme-template'].fb_group,
      privacy_reviewed: true,
    };
    const first = await prepareDrop({
      workspace,
      ...mediaInput({
        ...route,
        title: 'Ronaldo crying vs Yamal and Messi World Cup trophy meme',
        attachment_paths: [fixtures.perceptualAscii],
      }),
    });
    const second = await prepareDrop({
      workspace,
      ...mediaInput({
        ...route,
        title: 'save to meme template in queue and for memory into the right topic file',
        text: 'save to meme template in queue and for memory into the right topic file',
        attachment_paths: [fixtures.perceptualBinary],
      }),
    });
    const memory = await fs.readFile(path.join(workspace, 'memory', 'meme-boi.md'), 'utf8');
    assert.notEqual(
      crypto.createHash('sha256').update(await fs.readFile(fixtures.perceptualAscii)).digest('hex'),
      crypto.createHash('sha256').update(await fs.readFile(fixtures.perceptualBinary)).digest('hex'),
    );
    assert.equal(first.status, 'queued');
    assert.equal(second.status, 'already_queued');
    assert.equal(second.queue_number, first.queue_number);
    assert.equal(second.queue.matched_by, 'perceptual_hash');
    assert.equal(second.memory.saved, false);
    assert.equal((memory.match(/^### /gmu) ?? []).length, 1);
    assert.equal((await queueStatus({ workspace })).pending, 1);
  });
  test('producer does not merge different images when a flat-color perceptual hash collides across routes', async () => {
    const workspace = await freshWorkspace('producer-perceptual-collision');
    const first = await prepareDrop({
      workspace,
      ...mediaInput({
        category: 'meme-template',
        memory_file: 'memory/meme-boi.md',
        fb_group: ACTIVE_ROUTES['meme-template'].fb_group,
        title: 'Dark reaction meme template',
        text: 'save to meme template',
        attachment_paths: [fixtures.perceptualFlatDark],
        privacy_reviewed: true,
      }),
    });
    const second = await prepareDrop({
      workspace,
      ...mediaInput({
        category: 'story-post',
        memory_file: 'memory/story-boi.md',
        fb_group: ACTIVE_ROUTES['story-post'].fb_group,
        title: 'Light movie-night story card',
        text: 'save, story dibo',
        attachment_paths: [fixtures.perceptualFlatLight],
        privacy_reviewed: true,
      }),
    });
    assert.notEqual(first.dedupe.attachment_hashes[0].sha256, second.dedupe.attachment_hashes[0].sha256);
    assert.equal(
      first.dedupe.attachment_hashes[0].perceptual_hash,
      second.dedupe.attachment_hashes[0].perceptual_hash,
    );
    assert.notEqual(first.dedupe.content_fingerprint, second.dedupe.content_fingerprint);
    assert.equal(first.status, 'queued');
    assert.equal(second.status, 'queued');
    assert.equal(first.queue_number, 1);
    assert.equal(second.queue_number, 2);
    assert.equal(second.queue.target_group, 'Story-Post boi');
    assert.equal((await queueStatus({ workspace })).pending, 2);
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
    assert.equal(second.status, 'already_queued');
    assert.equal(second.post_manifest.ready, true);
  });
  test('producer backfills queue when memory and a skipped-duplicate log exist without delivery', async () => {
    const workspace = await freshWorkspace('producer-queue-gap');
    const input = {
      workspace,
      ...mediaInput({
        title: 'Legacy memory-first media fixture',
        source: 'Telegram',
      }),
    };
    await saveToMemory(input);
    await logMetadata({
      ...input,
      duplicate: true,
      post_status: 'skipped_duplicate',
    });
    const before = await fs.readFile(path.join(workspace, 'memory', 'travel.md'), 'utf8');
    const result = await prepareDrop(input);
    const after = await fs.readFile(path.join(workspace, 'memory', 'travel.md'), 'utf8');
    assert.equal(result.status, 'queued');
    assert.equal(result.memory.saved, false);
    assert.equal(result.recovered_queue_gap, true);
    assert.equal(after, before);
    assert.equal((await queueStatus({ workspace })).pending, 1);
  });
  test('producer backfills a legacy relative-path memory entry without appending it again', async () => {
    const workspace = await freshWorkspace('producer-legacy-relative-path');
    const attachment = path.join(workspace, 'downloads', 'reference_images', 'meme-boi', 'legacy.jpg');
    const memoryPath = path.join(workspace, 'memory', 'meme-boi.md');
    await fs.mkdir(path.dirname(attachment), { recursive: true });
    await fs.copyFile(fixtures.imageA, attachment);
    await fs.writeFile(
      memoryPath,
      '### Legacy meme fixture\n- **Saved image copy:** `downloads/reference_images/meme-boi/legacy.jpg`\n',
    );
    const before = await fs.readFile(memoryPath, 'utf8');
    const result = await prepareDrop({
      workspace,
      ...mediaInput({
        title: 'Legacy meme fixture',
        category: 'meme-template',
        memory_file: 'memory/meme-boi.md',
        fb_group: ACTIVE_ROUTES['meme-template'].fb_group,
        attachment_paths: [attachment],
        privacy_reviewed: true,
      }),
    });
    const after = await fs.readFile(memoryPath, 'utf8');
    assert.equal(result.status, 'queued');
    assert.equal(result.memory.saved, false);
    assert.equal(result.recovered_queue_gap, true);
    assert.equal(after, before);
    assert.equal((await queueStatus({ workspace })).pending, 1);
  });
  test('producer blocks a new queue job after a verified prior send', async () => {
    const workspace = await freshWorkspace('producer-sent-duplicate');
    const input = {
      workspace,
      type: 'link',
      title: 'Verified send duplicate fixture',
      text: 'funny link',
      category: 'funny',
      memory_file: 'memory/funny-posts.md',
      source: 'https://example.com/already-sent',
    };
    await prepareDrop(input);
    const run = await beginRun({ workspace });
    const claim = await claimNext({ workspace, lock_token: run.lock_token });
    await completeJob({
      workspace,
      lock_token: run.lock_token,
      job_id: claim.job.id,
      verified: true,
      verification_note: 'isolated test verification',
    });
    await endRun({ workspace, lock_token: run.lock_token });
    const result = await prepareDrop(input);
    assert.equal(result.status, 'duplicate_skipped');
    assert.equal(result.post_manifest.blocked, 'duplicate');
    assert.equal(result.metadata_log.entry.post_status, 'skipped_duplicate');
    assert.equal((await queueStatus({ workspace })).pending, 0);
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
  test('producer always queues a real link when an adapter mislabeled its preview as image', async () => {
    const workspace = await freshWorkspace('producer-adapter-link-preview');
    const transportText = [
      'To send an image back, prefer the message tool.',
      'MEDIA:https://example.com/image.jpg',
      'save, brazil futsal wc ei parbe real fifa wc e to final eo jaite parena,',
      'https://youtu.be/b2AOa8BHTPw?si=tracking',
    ].join(' ');
    const result = await prepareDrop({
      workspace,
      type: 'image',
      title: transportText,
      summary: transportText,
      source: 'https://example.com/image.jpg',
      category: 'caption-song',
      memory_file: 'memory/captions.md',
    });
    const job = JSON.parse(await fs.readFile(path.join(workspace, result.queue.queue_file), 'utf8'));
    assert.equal(result.classification.content_type, 'link');
    assert.equal(result.status, 'queued');
    assert.equal(result.queue.target_group, 'caption-pose-song boi');
    assert.deepEqual(result.dedupe.canonical_urls, ['https://www.youtube.com/watch?v=b2AOa8BHTPw']);
    assert.equal(result.post_manifest.browser_handoff.message_text, 'https://www.youtube.com/watch?v=b2AOa8BHTPw');
    assert.deepEqual(job.canonical_urls, ['https://www.youtube.com/watch?v=b2AOa8BHTPw']);
    assert.doesNotMatch(JSON.stringify(job.canonical_urls), /example\.com\/image\.jpg/iu);
  });
}

function registerIntegrationConfigTests() {
  test('authoritative group map documents both fallbacks and strict priority', async () => {
    const routing = await fs.readFile(
      path.join(DEFAULT_OPENCLAW_ROOT, 'workspace', 'memory', 'fb-messenger-groups.md'),
      'utf8',
    );
    assert.match(routing, /\*\*11 groups\*\*/);
    assert.match(routing, /\| 10 \| `Favorite boi` \| `memory\/favorite-posts\.md` \|/);
    assert.match(routing, /\| 11 \| `Others boi` \| `memory\/others-boi\.md` \|/);
    assert.match(routing, /Specific topic always beats a fallback/i);
    assert.match(routing, /Others boi` is not a privacy bypass/i);
    assert.match(routing, /Relationship, wife, marriage, couple, and biye media share the existing `Gift-shopping-biye boi` route/i);
    assert.match(routing, /Any real `http:\/\/` or `https:\/\/` URL counts as link media/i);
    assert.match(routing, /Never call an eligible URL “memory-only because there is no reel\/video/i);
    for (const memoryFile of [
      'crush-lines.md',
      'relationship-lines.md',
      'relationship-drama-prompts.md',
      'marriage-rules.md',
      'wife-shopping-references.md',
    ]) {
      assert.match(routing, new RegExp(memoryFile.replace('.', '\\.')));
    }
    assert.doesNotMatch(
      routing,
      /`memory\/share-koro\.md` \+ `memory\/favorite-posts\.md` \+ `memory\/fb-commented-posts\.md`/,
    );
  });

  test('root build prompt and topical-routing reference are synchronized to eleven groups', async () => {
    const prompt = await fs.readFile(
      path.join(DEFAULT_OPENCLAW_ROOT, 'workspace', 'codex-prompt-fb-second-brain.md'),
      'utf8',
    );
    const topical = await fs.readFile(
      path.join(DEFAULT_OPENCLAW_ROOT, 'workspace', 'references', 'topical-routing.md'),
      'utf8',
    );
    assert.match(prompt, /The 11 FB Messenger Groups/);
    assert.match(prompt, /\| 10 \| `Favorite boi`/);
    assert.match(prompt, /\| 11 \| `Others boi`/);
    assert.doesNotMatch(prompt, /The 9 FB Messenger Groups/);
    assert.doesNotMatch(prompt, /`share-koro\.md`, `favorite-posts\.md`, `fb-commented-posts\.md`/);
    assert.match(prompt, /Relationship\/crush\/marriage media uses group 7/i);
    assert.match(prompt, /Any real `http:\/\/` or `https:\/\/` URL is link media/i);
    assert.match(prompt, /never report “memory-only because there is no reel\/video/i);
    assert.doesNotMatch(prompt, /relationship-lines\.md`, `relationship-drama-prompts\.md`.*NEVER go to FB/i);
    assert.match(topical, /Favorite boi/);
    assert.match(topical, /Others boi/);
  });

  test('Others memory home exists and describes the safety boundary', async () => {
    const file = await fs.readFile(
      path.join(DEFAULT_OPENCLAW_ROOT, 'workspace', 'memory', 'others-boi.md'),
      'utf8',
    );
    assert.match(file, /^# Others Boi/m);
    assert.match(file, /final routing fallback/i);
    assert.match(file, /never a bypass/i);
  });

  test('skill reply contract requires the human-facing queue item number', async () => {
    const skill = await fs.readFile(
      path.join(DEFAULT_OPENCLAW_ROOT, 'workspace', 'skills', 'fb-second-brain', 'SKILL.md'),
      'utf8',
    );
    assert.match(skill, /queue item #N/);
    assert.match(skill, /returned `queue_number`/);
    assert.match(skill, /no queue item was created/);
    assert.match(skill, /Never classify an eligible URL as text-only/i);
    assert.match(skill, /normalize the item to `link`/i);
  });
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
  test('Messenger login helper uses encrypted fields and exposes only safe status flags', async () => {
    const helperFile = path.join(DEFAULT_OPENCLAW_ROOT, 'workspace', 'skills', 'fb-second-brain', 'scripts', 'messenger-login-helper.ps1');
    const helper = await fs.readFile(helperFile, 'utf8');
    assert.match(helper, /ConvertTo-SecureString/);
    assert.match(helper, /SecureStringToBSTR/);
    assert.match(helper, /ZeroFreeBSTR/);
    assert.match(helper, /email_dpapi/);
    assert.match(helper, /password_dpapi/);
    assert.match(helper, /two_factor_required/);
    assert.match(helper, /notify_yousuf/);
    assert.match(helper, /snapshot --efficient/);
    assert.doesNotMatch(helper, /AsPlainText/);
    assert.doesNotMatch(helper, /@[a-z0-9.-]+\.[a-z]{2,}/i);
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
    assert.match(job.payload.message, /messenger-login-helper\.ps1/);
    assert.match(job.payload.message, /two_factor_required/);
    assert.match(job.payload.message, /2-step verification/);
    assert.ok(job.payload.message.indexOf('messenger-login-helper.ps1') < job.payload.message.indexOf('Claim and process'));
    assert.match(job.payload.message, /messenger-pin-helper\.ps1/);
    assert.match(job.payload.message, /never ask Yousuf/i);
    assert.doesNotMatch(job.payload.message, /\b\d{6}\b/);
    assert.match(job.payload.message, /exactly NO_REPLY/);
    assert.match(job.payload.message, /FINAL_OUTPUT_GATE \(ABSOLUTE\)/);
    assert.doesNotMatch(job.payload.message, /@[a-z0-9.-]+\.[a-z]{2,}/i);
  });
  test('queue contract leaves pending jobs untouched for a 2-step challenge', async () => {
    const contract = await fs.readFile(
      path.join(DEFAULT_OPENCLAW_ROOT, 'workspace', 'skills', 'fb-second-brain', 'references', 'queue-contract.md'),
      'utf8',
    );
    assert.match(contract, /messenger-login-helper\.ps1/);
    assert.match(contract, /leave every job pending/);
    assert.match(contract, /do not claim or increment any job attempt/);
    assert.match(contract, /2-step verification/);
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
    perceptualAscii: path.join(testRoot, 'fixtures', 'perceptual-ascii.pgm'),
    perceptualBinary: path.join(testRoot, 'fixtures', 'perceptual-binary.pgm'),
    perceptualFlatDark: path.join(testRoot, 'fixtures', 'perceptual-flat-dark.pgm'),
    perceptualFlatLight: path.join(testRoot, 'fixtures', 'perceptual-flat-light.pgm'),
    video: path.join(testRoot, 'fixtures', 'clip.mp4'),
    audio: path.join(testRoot, 'fixtures', 'sound.mp3'),
    hugeVideo: path.join(testRoot, 'fixtures', 'huge.mp4'),
    exactLimitVideo: path.join(testRoot, 'fixtures', 'exact-limit.mp4'),
  };
  await fs.mkdir(path.dirname(fixtures.imageA), { recursive: true });
  await fs.writeFile(fixtures.imageA, 'same-image-bytes');
  await fs.writeFile(fixtures.imageCopy, 'same-image-bytes');
  await fs.writeFile(fixtures.imageDifferent, 'different-image-bytes');
  const perceptualPixels = Buffer.from(Array.from({ length: 72 }, (_, index) => (
    (index * 31 + Math.floor(index / 9) * 17) % 256
  )));
  await fs.writeFile(
    fixtures.perceptualAscii,
    `P2\n9 8\n255\n${[...perceptualPixels].join(' ')}\n`,
  );
  await fs.writeFile(
    fixtures.perceptualBinary,
    Buffer.concat([Buffer.from('P5\n9 8\n255\n'), perceptualPixels]),
  );
  await fs.writeFile(
    fixtures.perceptualFlatDark,
    `P2\n9 8\n255\n${Array.from({ length: 72 }, () => 0).join(' ')}\n`,
  );
  await fs.writeFile(
    fixtures.perceptualFlatLight,
    `P2\n9 8\n255\n${Array.from({ length: 72 }, () => 255).join(' ')}\n`,
  );
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
    registerAgentRouteTests();
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
