import assert from 'node:assert/strict';

import { ACTIVE_MEMORY_FILE_ROUTES } from './lib.mjs';
import { validateAgentRoute } from './validate-agent-route.mjs';

const adversarialFragments = [
  'wife husband crush flirty dating marriage biye relationship',
  'funny meme roast joke caption song audio story',
  'travel trip restaurant food health gym gift shopping',
  'kobita poem incident perform recreate favorite others',
  'backend frontend openclaw cron automation private',
  'বউ বিয়ে সম্পর্ক প্রেম ক্রাশ গান খাবার কবিতা',
];
const mediaCases = [
  { type: 'link', source: 'https://example.com/opaque-route' },
  { type: 'image', attachment_paths: ['C:\\fixtures\\route.jpg'] },
  { type: 'video', attachment_paths: ['C:\\fixtures\\route.mp4'] },
  { type: 'audio', attachment_paths: ['C:\\fixtures\\route.mp3'] },
];

let assertions = 0;
function equal(actual, expected, message) {
  assertions += 1;
  assert.equal(actual, expected, message);
}

for (const [memoryFile, route] of Object.entries(ACTIVE_MEMORY_FILE_ROUTES)) {
  for (const media of mediaCases) {
    for (let index = 0; index < adversarialFragments.length; index += 1) {
      const rotated = [
        ...adversarialFragments.slice(index),
        ...adversarialFragments.slice(0, index),
      ].join(' | ');
      const result = validateAgentRoute({
        ...media,
        category: route.category,
        memory_file: memoryFile,
        title: rotated,
        text: rotated,
        summary: rotated,
      });
      equal(result.validated, true, `${memoryFile} must validate`);
      equal(result.semantic_classifier_used, false, `${memoryFile} must never invoke semantic classification`);
      equal(result.route_source, 'openclaw-agent', `${memoryFile} route owner`);
      equal(result.category, route.category, `${memoryFile} category`);
      equal(result.memory_file, memoryFile, `${memoryFile} destination`);
      equal(result.fb_group, route.fb_group, `${memoryFile} group`);
      equal(result.post_allowed, true, `${memoryFile} media post eligibility`);
    }
  }
}

for (const [memoryFile, route] of Object.entries(ACTIVE_MEMORY_FILE_ROUTES)) {
  for (const wrongCategory of Object.keys(
    Object.fromEntries(Object.values(ACTIVE_MEMORY_FILE_ROUTES).map((item) => [item.category, true])),
  )) {
    if (wrongCategory === route.category) continue;
    const result = validateAgentRoute({
      type: 'link',
      source: 'https://example.com/mismatch',
      category: wrongCategory,
      memory_file: memoryFile,
    });
    equal(result.validated, false, `${wrongCategory} must not silently claim ${memoryFile}`);
    equal(result.fb_group, null, `${wrongCategory}/${memoryFile} mismatch must not queue`);
  }
}

for (const text of adversarialFragments) {
  const result = validateAgentRoute({
    type: 'link',
    source: 'https://example.com/no-agent-route',
    title: text,
    text,
    summary: text,
  });
  equal(result.validated, false, 'missing agent route must fail');
  equal(result.category, null, 'keywords must not infer category');
  equal(result.memory_file, null, 'keywords must not infer memory file');
  equal(result.fb_group, null, 'keywords must not infer group');
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  assertions,
  active_routes_checked: Object.keys(ACTIVE_MEMORY_FILE_ROUTES).length,
  semantic_classifier_used: false,
  routing_owner: 'openclaw-agent',
}, null, 2)}\n`);
