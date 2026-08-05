import fs from 'node:fs/promises';
import path from 'node:path';

import {
  ACTIVE_MEMORY_FILE_ROUTES,
  DEFAULT_WORKSPACE,
  activeRouteForMemoryFile,
} from './lib.mjs';

const workspace = path.resolve(process.argv[2] || DEFAULT_WORKSPACE);
const issues = [];
const warnings = [];
const memoryAudit = [];
const queueAudit = [];

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function listJsonFiles(directory) {
  if (!(await exists(directory))) return [];
  return (await fs.readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(directory, entry.name));
}

function operationalMarkers(text) {
  const checks = [
    ['cron prompt', /\[cron:/iu],
    ['idempotency instruction', /IDEMPOTENCY_KEY=/iu],
    ['browser policy instruction', /BROWSER_POLICY=/iu],
    ['transport placeholder', /To send an image back,[\s\S]*?Keep caption in the text body\./iu],
    ['transport example URL', /MEDIA:https:\/\/example\.com\/(?:image|video|audio)/iu],
    ['untrusted conversation metadata', /(?:Conversation info|Sender) \(untrusted metadata\):/iu],
    ['untrusted conversation history', /Conversation context \(untrusted,/iu],
    ['malformed inbound media path', /[\\/]media:[\\/]inbound[\\/]/iu],
    ['missing attachment metadata', /"missing"\s*:\s*true/iu],
  ];
  return checks.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

const routingDocPath = path.join(workspace, 'memory', 'fb-messenger-groups.md');
const routingDoc = await fs.readFile(routingDocPath, 'utf8');
const routingRows = routingDoc.split(/\r?\n/).filter((line) => line.startsWith('|'));

for (const [memoryFile, route] of Object.entries(ACTIVE_MEMORY_FILE_ROUTES)) {
  const row = routingRows.find((line) => line.includes(`\`${memoryFile}\``));
  if (!row) {
    issues.push(`Authoritative routing table is missing ${memoryFile}.`);
  } else if (!row.includes(`\`${route.fb_group}\``)) {
    issues.push(`Routing table maps ${memoryFile} to a group other than ${route.fb_group}.`);
  }

  const filePath = path.join(workspace, memoryFile.replaceAll('/', path.sep));
  if (!(await exists(filePath))) {
    memoryAudit.push({ memory_file: memoryFile, expected_group: route.fb_group, exists: false, entries: 0 });
    continue;
  }

  const content = await fs.readFile(filePath, 'utf8');
  const groups = [...content.matchAll(/"fb_group"\s*:\s*"([^"]+)"/giu)].map((match) => match[1]);
  const mismatches = groups.filter((group) => group !== route.fb_group);
  const markers = operationalMarkers(content);
  memoryAudit.push({
    memory_file: memoryFile,
    expected_group: route.fb_group,
    exists: true,
    entries: groups.length,
    mismatched_groups: [...new Set(mismatches)],
    operational_markers: markers,
  });
  if (mismatches.length) {
    issues.push(`${memoryFile} contains ${mismatches.length} metadata route(s) outside ${route.fb_group}: ${[...new Set(mismatches)].join(', ')}.`);
  }
  if (markers.length) {
    issues.push(`${memoryFile} contains operational/transport pollution: ${markers.join(', ')}.`);
  }
}

const healthRoot = path.join(workspace, 'memory', 'health-fitness');
if (await exists(healthRoot)) {
  for (const entry of await fs.readdir(healthRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const memoryFile = `memory/health-fitness/${entry.name}`;
    const content = await fs.readFile(path.join(healthRoot, entry.name), 'utf8');
    const groups = [...content.matchAll(/"fb_group"\s*:\s*"([^"]+)"/giu)].map((match) => match[1]);
    const mismatches = groups.filter((group) => group !== 'Food-Health-vlog');
    if (mismatches.length) {
      issues.push(`${memoryFile} contains ${mismatches.length} metadata route(s) outside Food-Health-vlog.`);
    }
  }
}

const queueRoot = path.join(workspace, '.queue', 'fb-second-brain');
for (const state of ['pending', 'processing', 'failed']) {
  for (const filePath of await listJsonFiles(path.join(queueRoot, state))) {
    const job = await readJson(filePath);
    const route = activeRouteForMemoryFile(job.memory_file);
    const record = {
      queue_number: job.queue_number,
      state,
      memory_file: job.memory_file,
      group: job.fb_group,
      expected_group: route?.fb_group ?? null,
    };
    queueAudit.push(record);

    if (!route) {
      issues.push(`Queue item #${job.queue_number} has an unmapped memory file: ${job.memory_file}.`);
      continue;
    }
    if (job.fb_group !== route.fb_group) {
      issues.push(`Queue item #${job.queue_number} job group ${job.fb_group} does not match ${route.fb_group}.`);
    }
    if (job.post_manifest?.target_group !== route.fb_group) {
      issues.push(`Queue item #${job.queue_number} manifest group does not match ${route.fb_group}.`);
    }
    if (job.post_manifest?.browser_handoff?.target_group !== route.fb_group) {
      issues.push(`Queue item #${job.queue_number} browser handoff group does not match ${route.fb_group}.`);
    }
    if (job.post_manifest?.browser_handoff?.profile !== 'openclaw') {
      issues.push(`Queue item #${job.queue_number} does not use the required openclaw browser profile.`);
    }
    const handoffSteps = (job.post_manifest?.browser_handoff?.steps ?? []).join('\n');
    if (!/messenger-pin-helper\.ps1/iu.test(handoffSteps) || !/never expose or ask Yousuf for the PIN/iu.test(handoffSteps)) {
      issues.push(`Queue item #${job.queue_number} is missing the automatic Messenger chat-history PIN helper contract.`);
    }
    const markers = operationalMarkers([job.title, job.text, job.summary].filter(Boolean).join('\n'));
    if (markers.length) {
      issues.push(`Queue item #${job.queue_number} contains operational/transport pollution: ${markers.join(', ')}.`);
    }
    for (const attachment of job.attachment_paths ?? []) {
      if (!(await exists(attachment))) {
        issues.push(`Queue item #${job.queue_number} is missing queued payload ${attachment}.`);
      }
    }
  }
}

const queueNumbers = queueAudit.map((job) => job.queue_number).filter(Number.isInteger);
if (new Set(queueNumbers).size !== queueNumbers.length) {
  issues.push('Active queue states contain duplicate queue numbers.');
}

const quarantineRoot = path.join(queueRoot, 'quarantine');
let quarantineCount = 0;
if (await exists(quarantineRoot)) {
  const pendingDirectories = [quarantineRoot];
  while (pendingDirectories.length) {
    const directory = pendingDirectories.pop();
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) pendingDirectories.push(path.join(directory, entry.name));
      else if (entry.isFile() && entry.name.endsWith('.json')) quarantineCount += 1;
    }
  }
}

if (!routingDoc.includes('`memory/crush-lines.md`')) {
  issues.push('Authoritative routing table does not include memory/crush-lines.md.');
}
if (!routingDoc.match(/`Gift-shopping-biye boi`[^\n]*`memory\/crush-lines\.md`/u)) {
  issues.push('Crush memory is not documented on the Gift-shopping-biye boi row.');
}

const result = {
  ok: issues.length === 0,
  workspace,
  active_memory_files: Object.keys(ACTIVE_MEMORY_FILE_ROUTES).length,
  existing_active_memory_files: memoryAudit.filter((item) => item.exists).length,
  memory_metadata_entries: memoryAudit.reduce((sum, item) => sum + item.entries, 0),
  active_queue_items: queueAudit.length,
  quarantined_items: quarantineCount,
  issues,
  warnings,
  queue: queueAudit.sort((a, b) => a.queue_number - b.queue_number),
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
