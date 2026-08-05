import {
  ACTIVE_ROUTES,
  activeRouteForMemoryFile,
  inferContentType,
  isMain,
  isMediaPresent,
  isProtectedMemoryPath,
  normalizeCategory,
  normalizeMemoryRoute,
  normalizeText,
  printJson,
  readInput,
} from './lib.mjs';

const MEMORY_ONLY_CATEGORIES = new Set([
  'private',
  'tech',
  'learning',
  'career',
  'openclaw',
  'personal',
]);

/**
 * Validate a semantic route already selected by the OpenClaw AI agent.
 *
 * This function deliberately does not inspect titles, captions, OCR, URLs,
 * summaries, attachment names, or keywords. It only enforces the routing-table
 * contract and transport/privacy invariants after the agent has understood the
 * content and supplied both `category` and `memory_file`.
 */
export function validateAgentRoute(input = {}) {
  const contentType = inferContentType(input);
  const mediaPresent = isMediaPresent(input);
  const category = normalizeCategory(input.category);
  const memoryFile = normalizeMemoryRoute(input.memory_file);
  const errors = [];

  if (!category) errors.push('OpenClaw agent must supply category.');
  if (!memoryFile) errors.push('OpenClaw agent must supply memory_file.');

  const activeCategory = Boolean(category && ACTIVE_ROUTES[category]);
  const memoryOnlyCategory = MEMORY_ONLY_CATEGORIES.has(category);
  const memoryRoute = memoryFile ? activeRouteForMemoryFile(memoryFile) : null;
  const protectedMemory = Boolean(memoryFile && isProtectedMemoryPath(memoryFile));

  if (category && !activeCategory && !memoryOnlyCategory) {
    errors.push(`Unsupported agent-selected category: ${category}.`);
  }

  if (memoryRoute && memoryRoute.category !== category) {
    errors.push(
      `Agent-selected category ${category || '(missing)'} does not match ${memoryFile}, `
      + `whose authoritative category is ${memoryRoute.category}.`,
    );
  }

  if (activeCategory && !memoryRoute) {
    errors.push(`Active category ${category} requires a memory_file listed in the Messenger routing map.`);
  }

  if (memoryOnlyCategory && memoryRoute) {
    errors.push(
      `Memory-only category ${category} cannot use active Messenger memory file ${memoryFile}.`,
    );
  }

  if (protectedMemory && activeCategory) {
    errors.push(`Protected memory file ${memoryFile} cannot use active category ${category}.`);
  }

  const memoryOnly = memoryOnlyCategory || protectedMemory;
  const fbGroup = errors.length || memoryOnly ? null : memoryRoute?.fb_group ?? null;
  const postAllowed = Boolean(!errors.length && mediaPresent && fbGroup && !memoryOnly);

  const reasons = errors.length
    ? [...errors]
    : [
      `Semantic route supplied by OpenClaw agent: ${category} → ${memoryFile}.`,
      memoryOnly
        ? 'Validated as memory-only; Messenger queueing is disabled.'
        : `Messenger group derived mechanically from the routing map: ${fbGroup}.`,
      !mediaPresent ? 'Text-only content remains memory-only.' : '',
    ].filter(Boolean);

  return {
    category: category || null,
    content_type: contentType,
    media_present: mediaPresent,
    memory_file: memoryFile || null,
    fb_group: fbGroup,
    post_allowed: postAllowed,
    memory_only: memoryOnly,
    needs_review: errors.length > 0,
    validated: errors.length === 0,
    route_source: 'openclaw-agent',
    semantic_classifier_used: false,
    reasons,
  };
}

if (isMain(import.meta.url)) {
  try {
    const result = validateAgentRoute(await readInput());
    printJson(result);
    if (result.needs_review) process.exitCode = 2;
  } catch (error) {
    console.error(normalizeText(error?.message || error));
    process.exitCode = 1;
  }
}
