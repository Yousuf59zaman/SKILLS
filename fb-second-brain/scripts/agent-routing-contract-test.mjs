import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ACTIVE_MEMORY_FILE_ROUTES } from './lib.mjs';
import { prepareDrop } from './prepare-drop.mjs';
import { validateAgentRoute } from './validate-agent-route.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, '..', '..', '..');
const pluginPath = path.join(workspaceRoot, 'plugins', 'tool-result-verifier', 'index.js');
const preparePath = path.join(scriptDir, 'prepare-drop.mjs');
let assertions = 0;

function check(condition, message) {
  assertions += 1;
  assert.ok(condition, message);
}

function equal(actual, expected, message) {
  assertions += 1;
  assert.equal(actual, expected, message);
}

async function main() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'fb-agent-routing-contract-'));
  try {
    const adversarialText = [
      'wife crush marriage funny meme caption song travel restaurant gift',
      'poem perform favorite private backend cron automation',
    ].join(' ');

    for (const [memoryFile, route] of Object.entries(ACTIVE_MEMORY_FILE_ROUTES)) {
      const validation = validateAgentRoute({
        type: 'link',
        title: adversarialText,
        text: adversarialText,
        summary: adversarialText,
        source: `https://example.com/${encodeURIComponent(memoryFile)}`,
        category: route.category,
        memory_file: memoryFile,
      });
      equal(validation.validated, true, `${memoryFile} must validate`);
      equal(validation.semantic_classifier_used, false, `${memoryFile} must not use a semantic classifier`);
      equal(validation.route_source, 'openclaw-agent', `${memoryFile} must retain agent ownership`);
      equal(validation.category, route.category, `${memoryFile} category must remain unchanged`);
      equal(validation.memory_file, memoryFile, `${memoryFile} destination must remain unchanged`);
      equal(validation.fb_group, route.fb_group, `${memoryFile} group must come from the map`);
    }

    const mismatch = validateAgentRoute({
      type: 'image',
      category: 'relationship',
      memory_file: 'memory/funny-posts.md',
      attachment_paths: [path.join(tempRoot, 'fixture.jpg')],
    });
    equal(mismatch.validated, false, 'mismatched agent route must fail');
    equal(mismatch.fb_group, null, 'mismatched agent route must never derive a group');

    const missing = validateAgentRoute({
      type: 'link',
      source: 'https://example.com/obvious-funny-meme',
      title: 'obvious funny meme',
    });
    equal(missing.validated, false, 'missing agent route must fail');
    equal(missing.category, null, 'validator must not infer a category');
    equal(missing.memory_file, null, 'validator must not infer a memory file');
    equal(missing.fb_group, null, 'validator must not infer a group');

    const isolatedWorkspace = path.join(tempRoot, 'workspace');
    await fs.mkdir(path.join(isolatedWorkspace, 'memory'), { recursive: true });
    const producerResult = await prepareDrop({
      workspace: isolatedWorkspace,
      type: 'link',
      source: 'https://example.com/obvious-travel-video',
      title: 'obvious travel video',
    });
    equal(producerResult.status, 'needs_review', 'producer must refuse missing AI route');
    equal(producerResult.wrote_memory, false, 'producer must not write on a missing AI route');
    equal(producerResult.classification.semantic_classifier_used, false, 'producer result must prove no classifier ran');
    equal((await fs.readdir(path.join(isolatedWorkspace, 'memory'))).length, 0, 'producer refusal must leave memory untouched');

    const [prepareSource, pluginSource] = await Promise.all([
      fs.readFile(preparePath, 'utf8'),
      fs.readFile(pluginPath, 'utf8'),
    ]);
    check(!/from ['"]\.\/classify-topic\.mjs['"]/.test(prepareSource), 'prepare-drop must not import classify-topic');
    check(!/\bclassifyTopic\s*\(/.test(prepareSource), 'prepare-drop must not call classifyTopic');
    check(!/EXPLICIT_ROUTE_CUES|explicitUserRoute|explicitRouteMemoryFile/.test(pluginSource), 'plugin must contain no semantic route cue engine');
    check(!/autoRunSecondBrainProducer|ensureAutoSecondBrainProducer/.test(pluginSource), 'plugin must not auto-produce before agent routing');
    check(/Never claim a save before model dispatch/.test(pluginSource), 'plugin must explicitly allow model inspection');
    check(/validateAgentRouteInput/.test(pluginSource), 'plugin must require the agent-selected route fields');

    process.stdout.write(`${JSON.stringify({
      ok: true,
      assertions,
      active_routes_checked: Object.keys(ACTIVE_MEMORY_FILE_ROUTES).length,
      semantic_classifier_used: false,
      routing_owner: 'openclaw-agent',
    }, null, 2)}\n`);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

await main();
