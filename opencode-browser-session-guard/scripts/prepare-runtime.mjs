import { cp, mkdir, mkdtemp } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../assets/runtime/', import.meta.url));
const cacheRoot = join(homedir(), '.cache', 'opencode-browser-session-guard');
await mkdir(cacheRoot, { recursive: true });
const destination = await mkdtemp(join(cacheRoot, 'work-'));
await cp(source, destination, {
  recursive: true,
  dereference: false,
  filter: path => !/(?:^|[\\/])(?:node_modules|artifacts|\.playwright-mcp|\.git)(?:[\\/]|$)/.test(path)
});
await mkdir(join(destination, 'artifacts'), { recursive: true });
console.log(destination);
