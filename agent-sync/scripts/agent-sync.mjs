#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = {
  skills: path.join(DIR, 'sync-agent-skills.mjs'),
  mcp: path.join(DIR, 'sync-codex-antigravity-mcp.mjs'),
  cli: path.join(DIR, 'sync-codex-antigravity-cli.mjs'),
};

const COMMON_FLAGS = new Set(['--apply', '--json']);
const SKILLS_FLAGS = new Set(['--create-missing-roots', '--include-dot', '--no-content-sync', '--push-github']);
const SKILLS_VALUE = new Set(['--max-depth', '--codex-root', '--claude-root', '--antigravity-root', '--root', '--github-repo', '--github-worktree', '--github-source']);
const MCP_ONLY_VALUE = new Set(['--antigravity-mcp', '--startup-timeout']);
const CLI_ONLY_VALUE = new Set(['--antigravity-settings', '--cli', '--path']);
const MCP_CLI_FLAGS = new Set(['--no-backup']);
const MCP_CLI_VALUE = new Set(['--codex-config']);

function usage(exitCode = 0) {
  console.log(`Usage: node scripts/agent-sync.mjs [skills|mcp|cli|all] [options]\n\nModes:\n  skills   Sync AgentSkill folders across Codex, Claude, and Antigravity.\n  mcp      Sync MCP server definitions between Codex and Antigravity.\n  cli      Sync CLI PATH access between Codex and Antigravity terminals.\n  all      Run skills sync, MCP sync, then CLI sync. Default mode.\n\nExamples:\n  node scripts/agent-sync.mjs all\n  node scripts/agent-sync.mjs all --apply --create-missing-roots\n  node scripts/agent-sync.mjs skills --apply --create-missing-roots\n  node scripts/agent-sync.mjs mcp --apply\n  node scripts/agent-sync.mjs cli --apply\n\nOptions are forwarded to the matching underlying script. In all mode, shared flags\n(--apply, --json) go to every script; skill-only flags go to skills; MCP/CLI\nshared flags go to MCP + CLI; mode-specific flags go only to their mode.`);
  process.exit(exitCode);
}

function run(label, script, args) {
  console.log(`\n=== agent-sync: ${label} ===`);
  const child = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' });
  if (child.error) {
    console.error(child.error.message);
    return 1;
  }
  return child.status ?? (child.signal ? 1 : 0);
}

function splitForAll(args) {
  const skills = [];
  const mcp = [];
  const cli = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const takeValue = () => {
      if (i + 1 >= args.length) throw new Error(`${a} needs a value`);
      return args[++i];
    };
    if (COMMON_FLAGS.has(a)) { skills.push(a); mcp.push(a); cli.push(a); }
    else if (SKILLS_FLAGS.has(a)) skills.push(a);
    else if (MCP_CLI_FLAGS.has(a)) { mcp.push(a); cli.push(a); }
    else if (SKILLS_VALUE.has(a)) { const v = takeValue(); skills.push(a, v); }
    else if (MCP_CLI_VALUE.has(a)) { const v = takeValue(); mcp.push(a, v); cli.push(a, v); }
    else if (MCP_ONLY_VALUE.has(a)) { const v = takeValue(); mcp.push(a, v); }
    else if (CLI_ONLY_VALUE.has(a)) { const v = takeValue(); cli.push(a, v); }
    else throw new Error(`Unknown or unsupported option for all mode: ${a}`);
  }
  return { skills, mcp, cli };
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) usage(0);
  let mode = 'all';
  if (argv[0] && !argv[0].startsWith('-')) mode = argv.shift();
  if (!['skills', 'mcp', 'cli', 'all'].includes(mode)) throw new Error(`Unknown mode: ${mode}`);

  if (mode === 'skills') process.exit(run('skills', SCRIPTS.skills, argv));
  if (mode === 'mcp') process.exit(run('mcp', SCRIPTS.mcp, argv));
  if (mode === 'cli') process.exit(run('cli', SCRIPTS.cli, argv));

  const split = splitForAll(argv);
  const skillsCode = run('skills', SCRIPTS.skills, split.skills);
  if (skillsCode !== 0) process.exit(skillsCode);
  const mcpCode = run('mcp', SCRIPTS.mcp, split.mcp);
  if (mcpCode !== 0) process.exit(mcpCode);
  process.exit(run('cli', SCRIPTS.cli, split.cli));
}

try { main(); }
catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
