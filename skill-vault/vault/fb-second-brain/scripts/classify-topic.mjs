// Compatibility entry point only.
//
// Semantic topic classification belongs exclusively to the OpenClaw AI agent.
// Historical callers may still import `classifyTopic`, so keep the export name
// while delegating only to the non-semantic route-contract validator. This file
// never examines keywords, captions, OCR, titles, summaries, URLs, or filenames
// to choose a destination.

import { isMain, printJson, readInput } from './lib.mjs';
import { validateAgentRoute } from './validate-agent-route.mjs';

export function classifyTopic(input = {}) {
  return validateAgentRoute(input);
}

if (isMain(import.meta.url)) {
  try {
    const result = classifyTopic(await readInput());
    printJson(result);
    if (result.needs_review) process.exitCode = 2;
  } catch (error) {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  }
}
