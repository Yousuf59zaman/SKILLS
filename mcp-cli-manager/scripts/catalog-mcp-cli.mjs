#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const HOME = os.homedir();
const APPDATA = process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming');
const LOCALAPPDATA = process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local');
const CODEX_CONFIG = path.join(HOME, '.codex', 'config.toml');

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'file', 'files', 'from', 'into',
  'not', 'of', 'on', 'to', 'use', 'using', 'task', 'please', 'koro', 'korte',
  'amar', 'amr', 'ami', 'tumi', 'ki', 'na', 'taile', 'jodi', 'hoy', 'way',
  'command', 'commands',
]);

const COMMAND_TOKEN_STOPWORDS = new Set([
  ...STOPWORDS,
  'add', 'all', 'app', 'ask', 'build', 'check', 'clean', 'create', 'debug',
  'delete', 'deploy', 'do', 'docs', 'edit', 'error', 'find', 'fix', 'get',
  'help', 'install', 'list', 'make', 'open', 'pull', 'push', 'read', 'remove',
  'run', 'search', 'setup', 'show', 'start', 'status', 'sync', 'test', 'tool',
  'update', 'verify', 'write',
]);

const TOOLS = [
  {
    id: 'chrome_devtools',
    type: 'mcp',
    label: 'Chrome DevTools MCP',
    mcpName: 'chrome_devtools',
    keywords: ['chrome', 'devtools', 'browser', 'console', 'network', 'performance', 'dom', 'frontend', 'localhost', 'screenshot', 'ui', 'inspect', 'hydration', 'css'],
    use: 'Inspect live Chrome pages, console/network errors, DOM, performance, and local frontend behavior.',
    safeFirst: 'Inspect, screenshot, console/network readout.',
  },
  {
    id: 'playwright',
    type: 'mcp',
    label: 'Playwright MCP',
    mcpName: 'playwright',
    keywords: ['browser', 'playwright', 'e2e', 'test', 'click', 'form', 'screenshot', 'ui', 'localhost', 'automation', 'viewport', 'mobile'],
    use: 'Automate browser workflows and verify local web UI across viewports.',
    safeFirst: 'Open target, screenshot, read visible state before interacting.',
  },
  {
    id: 'context7',
    type: 'mcp',
    label: 'Context7 MCP',
    mcpName: 'context7',
    keywords: ['docs', 'documentation', 'api', 'library', 'package', 'framework', 'version', 'example', 'react', 'vue', 'nuxt', 'laravel', 'openai'],
    use: 'Fetch current library/framework docs and examples.',
    safeFirst: 'Read docs only.',
  },
  {
    id: 'github',
    type: 'mcp',
    label: 'GitHub MCP',
    mcpName: 'github',
    keywords: ['github', 'repo', 'repository', 'pull', 'pr', 'issue', 'actions', 'release', 'branch', 'commit', 'workflow'],
    use: 'Read or manage GitHub repo metadata, issues, PRs, Actions, and releases.',
    safeFirst: 'Read/list/status first. Requires GitHub token for authenticated use.',
  },
  {
    id: 'firecrawl',
    type: 'mcp',
    label: 'Firecrawl MCP',
    mcpName: 'firecrawl',
    keywords: ['crawl', 'scrape', 'website', 'webpage', 'extract', 'site', 'research', 'search', 'url', 'markdown'],
    use: 'Extract structured content from websites when normal browsing/search is not enough.',
    safeFirst: 'Fetch/read public pages only.',
  },
  {
    id: 'sentry',
    type: 'mcp',
    label: 'Sentry MCP',
    mcpName: 'sentry',
    keywords: ['sentry', 'error', 'exception', 'crash', 'stack', 'trace', 'production', 'issue', 'release', 'regression'],
    use: 'Investigate Sentry issues, stack traces, releases, and production errors.',
    safeFirst: 'Read issue details first. Requires Sentry auth for private projects.',
  },
  {
    id: 'mcp_toolbox',
    type: 'mcp',
    label: 'MCP Toolbox',
    mcpName: 'mcp_toolbox',
    keywords: ['database', 'db', 'sql', 'sqlite', 'query', 'schema', 'table', 'row', 'migration'],
    use: 'Inspect SQL databases through MCP, configured safely for local SQLite by default.',
    safeFirst: 'Read schema/list tables/select only.',
  },
  {
    id: 'git',
    type: 'cli',
    label: 'Git',
    commands: ['git'],
    keywords: ['git', 'diff', 'commit', 'branch', 'status', 'log', 'merge', 'rebase', 'stash', 'repo'],
    use: 'Inspect repo state, diffs, history, branches, and commits.',
    safeFirst: '`git status`, `git diff`, `git log`.',
  },
  {
    id: 'gh',
    type: 'cli',
    label: 'GitHub CLI',
    commands: ['gh'],
    keywords: ['github', 'gh', 'pr', 'issue', 'actions', 'workflow', 'release', 'gist'],
    use: 'GitHub operations from CLI when MCP is unavailable or CLI is more direct.',
    safeFirst: '`gh auth status`, `gh repo view`, `gh pr view`, `gh issue view`.',
  },
  {
    id: 'rg',
    type: 'cli',
    label: 'ripgrep',
    commands: ['rg'],
    keywords: ['search', 'find', 'grep', 'code', 'text', 'symbol', 'reference', 'todo', 'usage'],
    use: 'Fast repo/file search.',
    safeFirst: '`rg <pattern>` or `rg --files`.',
  },
  {
    id: 'jq',
    type: 'cli',
    label: 'jq',
    commands: ['jq'],
    keywords: ['json', 'filter', 'parse', 'transform', 'format', 'extract'],
    use: 'Filter, validate, and transform JSON.',
    safeFirst: '`jq . file.json`.',
  },
  {
    id: 'pnpm',
    type: 'cli',
    label: 'pnpm',
    commands: ['pnpm'],
    keywords: ['pnpm', 'node', 'npm', 'package', 'install', 'build', 'test', 'lint', 'dev', 'frontend'],
    use: 'Node package, build, test, and dev-server workflows when repo uses pnpm.',
    safeFirst: '`pnpm --version`, `pnpm test`, `pnpm lint`, repo scripts.',
  },
  {
    id: 'uv',
    type: 'cli',
    label: 'uv',
    commands: ['uv'],
    keywords: ['python', 'uv', 'venv', 'pip', 'package', 'pytest', 'dependency'],
    use: 'Python dependency and environment workflows when repo uses uv.',
    safeFirst: '`uv --version`, `uv run pytest` when configured.',
  },
  {
    id: 'docker',
    type: 'cli',
    label: 'Docker',
    commands: ['docker'],
    keywords: ['docker', 'container', 'compose', 'image', 'volume', 'daemon', 'service'],
    use: 'Inspect or run containerized services.',
    safeFirst: '`docker ps`, `docker compose ps`, `docker logs`.',
  },
  {
    id: 'kubectl',
    type: 'cli',
    label: 'kubectl',
    commands: ['kubectl'],
    keywords: ['kubernetes', 'k8s', 'kubectl', 'pod', 'deployment', 'cluster', 'namespace', 'logs'],
    use: 'Inspect Kubernetes clusters and workloads.',
    safeFirst: '`kubectl config current-context`, `kubectl get ...`.',
  },
  {
    id: 'helm',
    type: 'cli',
    label: 'Helm',
    commands: ['helm'],
    keywords: ['helm', 'chart', 'kubernetes', 'release', 'values'],
    use: 'Inspect and template Helm charts/releases.',
    safeFirst: '`helm list`, `helm template`, `helm diff` if available.',
  },
  {
    id: 'terraform',
    type: 'cli',
    label: 'Terraform',
    commands: ['terraform'],
    keywords: ['terraform', 'iac', 'infra', 'plan', 'state', 'apply', 'provider'],
    use: 'Inspect and plan infrastructure changes.',
    safeFirst: '`terraform fmt -check`, `terraform validate`, `terraform plan` only when context is clear.',
  },
  {
    id: 'vercel',
    type: 'cli',
    label: 'Vercel CLI',
    commands: ['vercel'],
    keywords: ['vercel', 'deploy', 'preview', 'project', 'hosting', 'env'],
    use: 'Inspect or manage Vercel projects and previews.',
    safeFirst: '`vercel whoami`, `vercel env ls`, no deploy unless requested.',
  },
  {
    id: 'supabase',
    type: 'cli',
    label: 'Supabase CLI',
    commands: ['supabase'],
    keywords: ['supabase', 'database', 'edge', 'function', 'migration', 'auth', 'storage'],
    use: 'Supabase local/project workflows.',
    safeFirst: '`supabase status`, `supabase migration list`.',
  },
  {
    id: 'postman',
    type: 'cli',
    label: 'Postman CLI',
    commands: ['postman'],
    keywords: ['postman', 'api', 'collection', 'request', 'test', 'newman'],
    use: 'Run Postman API collections and tests.',
    safeFirst: '`postman --version`, collection dry/test commands.',
  },
  {
    id: 'firecrawl-cli',
    type: 'cli',
    label: 'Firecrawl CLI',
    commands: ['firecrawl'],
    keywords: ['firecrawl', 'crawl', 'scrape', 'website', 'extract', 'markdown'],
    use: 'CLI fallback for web extraction/crawling.',
    safeFirst: 'Public URL reads only.',
  },
  {
    id: 'codex',
    type: 'cli',
    label: 'Codex CLI',
    commands: ['codex'],
    keywords: ['codex', 'mcp', 'doctor', 'agent', 'skill', 'setup'],
    use: 'Inspect Codex setup, MCP list, doctor, or local agent state.',
    safeFirst: '`codex doctor`, `codex mcp list`.',
  },
  {
    id: 'gemini',
    type: 'cli',
    label: 'Gemini CLI',
    commands: ['gemini'],
    keywords: ['gemini', 'google', 'agent', 'model'],
    use: 'Gemini CLI tasks when the user explicitly wants Gemini or cross-agent checks.',
    safeFirst: '`gemini --version`.',
  },
  {
    id: 'claude',
    type: 'cli',
    label: 'Claude CLI',
    commands: ['claude'],
    keywords: ['claude', 'anthropic', 'agent', 'model'],
    use: 'Claude CLI tasks when the user explicitly wants Claude or cross-agent checks.',
    safeFirst: '`claude --version`.',
  },
  {
    id: 'antigravity',
    type: 'cli',
    label: 'Antigravity launcher',
    commands: ['antigravity', 'antigravity-ide'],
    keywords: ['antigravity', 'google', 'agent', 'ide'],
    use: 'Launch or verify Antigravity/Antigravity IDE command access.',
    safeFirst: '`where antigravity`, `where antigravity-ide`.',
  },
];

function usage(exitCode = 0) {
  console.log(`Usage: node scripts/catalog-mcp-cli.mjs [options]\n\nCatalog and rank local MCP servers and CLI tools.\n\nOptions:\n  --query <text>    Rank tools for a task.\n  --limit <n>       Max ranked results. Default: 8.\n  --write <path>    Write a markdown catalog.\n  --cwd <path>      Project directory for package-script discovery. Default: current directory.\n  --json            Emit the full catalog as JSON when no query is given.\n  --help            Show help.\n`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const opts = { query: '', limit: 8, write: '', cwd: process.cwd(), json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${arg} needs a value`);
      return argv[++i];
    };
    if (arg === '--help' || arg === '-h') usage(0);
    else if (arg === '--query') opts.query = next();
    else if (arg === '--limit') opts.limit = Number.parseInt(next(), 10);
    else if (arg === '--write') opts.write = next();
    else if (arg === '--cwd') opts.cwd = next();
    else if (arg === '--json') opts.json = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!Number.isFinite(opts.limit) || opts.limit < 1) opts.limit = 8;
  opts.cwd = path.resolve(opts.cwd || process.cwd());
  return opts;
}

function run(command, args) {
  const res = spawnSync(command, args, { encoding: 'utf8', shell: false });
  return { ok: res.status === 0, stdout: (res.stdout || '').trim() };
}

function pathEntries() {
  const entries = [
    ...(process.env.Path || process.env.PATH || '').split(';'),
    path.join(APPDATA, 'npm'),
    path.join(HOME, '.local', 'bin'),
    path.join(LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links'),
    path.join(LOCALAPPDATA, 'Programs', 'antigravity'),
    path.join(LOCALAPPDATA, 'Programs', 'Antigravity IDE', 'bin'),
    path.join(LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'bin'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'cmd'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'GitHub CLI'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Docker', 'Docker', 'resources', 'bin'),
  ];
  const out = [];
  const seen = new Set();
  for (const entry of entries.map(s => String(s || '').trim()).filter(Boolean)) {
    const key = entry.replace(/[\\/]+$/, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

function commandExtensions(command) {
  const exts = ['.cmd', '.exe', '.ps1', '.bat', ''];
  return exts.map(ext => command.toLowerCase().endsWith(ext) ? command : `${command}${ext}`);
}

function findCommand(command) {
  const where = run('where.exe', [command]);
  if (where.ok && where.stdout) return where.stdout.split(/\r?\n/)[0].trim();
  for (const dir of pathEntries()) {
    for (const candidate of commandExtensions(command)) {
      const p = path.join(dir, candidate);
      if (fs.existsSync(p)) return p;
    }
  }
  const winGetPackages = path.join(LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages');
  if (fs.existsSync(winGetPackages)) {
    const hit = findUnder(winGetPackages, commandExtensions(command), 4);
    if (hit) return hit;
  }
  return '';
}

function findUnder(root, basenames, maxDepth) {
  const wanted = new Set(basenames.map(s => s.toLowerCase()));
  function walk(dir, depth) {
    if (depth > maxDepth) return '';
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return ''; }
    for (const ent of entries) {
      const p = path.join(dir, ent.name);
      if (ent.isFile() && wanted.has(ent.name.toLowerCase())) return p;
    }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const found = walk(path.join(dir, ent.name), depth + 1);
      if (found) return found;
    }
    return '';
  }
  return walk(root, 0);
}

function readConfig() {
  try { return fs.readFileSync(CODEX_CONFIG, 'utf8'); } catch { return ''; }
}

function configuredMcpNames(text) {
  const names = new Set();
  const re = /^\s*\[mcp_servers\.(?:"([^"]+)"|'([^']+)'|([^\]\s]+))]\s*$/gm;
  let match;
  while ((match = re.exec(text))) {
    const name = match[1] || match[2] || match[3];
    if (!name || name.endsWith('.env')) continue;
    names.add(name);
  }
  return names;
}

function toolCommandNames(tool) {
  return Array.isArray(tool.commands) ? tool.commands : Object.keys(tool.commands || {});
}

function knownCommandNames(rows) {
  const names = new Set();
  for (const row of rows) {
    for (const command of Object.keys(row.commands || {})) names.add(command.toLowerCase());
    for (const command of toolCommandNames(row)) names.add(String(command).toLowerCase());
  }
  return names;
}

function genericMcpTool(name) {
  const words = String(name).split(/[^a-zA-Z0-9]+/).filter(Boolean);
  return {
    id: `mcp:${name}`,
    type: 'mcp',
    label: `${name} MCP`,
    installed: true,
    configured: true,
    commands: {},
    mcpName: name,
    use: `Configured MCP server named "${name}". Inspect its available tools/resources before using it.`,
    safeFirst: 'List/read/status operations first; avoid write actions unless explicitly requested.',
    keywords: [name, ...words],
    dynamic: true,
  };
}

function dynamicCliTool(command, hit) {
  return {
    id: `cli:${command}`,
    type: 'cli',
    label: `${command} CLI`,
    installed: true,
    configured: null,
    commands: { [command]: hit },
    mcpName: null,
    use: `Installed CLI command named "${command}". Prefer --help/status/read-only commands first.`,
    safeFirst: `\`${command} --help\` or read-only status/list commands before writes.`,
    keywords: [command],
    dynamic: true,
  };
}

function projectTool(cwd) {
  const pkg = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkg)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(pkg, 'utf8'));
    const scripts = Object.keys(data.scripts || {});
    const manager = String(data.packageManager || '').split('@')[0] || (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml')) ? 'pnpm' : fs.existsSync(path.join(cwd, 'yarn.lock')) ? 'yarn' : 'npm');
    const hit = findCommand(manager);
    if (!scripts.length && !hit) return null;
    return {
      id: 'project-scripts',
      type: 'cli',
      label: 'Project package scripts',
      installed: Boolean(hit),
      configured: null,
      commands: hit ? { [manager]: hit } : {},
      mcpName: null,
      use: `Run this repo's package scripts: ${scripts.slice(0, 20).join(', ') || 'none listed'}.`,
      safeFirst: `${manager} run, ${manager} test/lint/build only when relevant; inspect package.json first.`,
      keywords: ['package', 'scripts', 'npm', 'pnpm', 'yarn', manager, ...scripts],
      dynamic: true,
    };
  } catch {
    return null;
  }
}

function tokens(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .match(/[a-z0-9][a-z0-9_-]{1,}/g)
      ?.filter(token => !STOPWORDS.has(token)) || []
  );
}

function scoreTool(tool, query) {
  const queryTokens = tokens(query);
  const commandNames = Array.isArray(tool.commands) ? tool.commands : Object.keys(tool.commands || {});
  const haystack = [
    tool.id,
    tool.label,
    tool.type,
    tool.mcpName || '',
    ...commandNames,
    ...(tool.keywords || []),
    tool.use,
  ].join(' ').toLowerCase();
  const haystackTokens = tokens(haystack);
  const keywordSet = new Set((tool.keywords || []).map(s => s.toLowerCase()));
  const matched = [];
  let score = 0;
  for (const token of queryTokens) {
    if (keywordSet.has(token)) {
      score += 9;
      matched.push(token);
    } else if (haystackTokens.has(token)) {
      score += 3;
      matched.push(token);
    }
  }
  for (const name of [tool.id, tool.mcpName, ...commandNames].filter(Boolean)) {
    if (query.toLowerCase().includes(String(name).toLowerCase())) score += 30;
  }
  return { score, matched: [...new Set(matched)].sort() };
}

function confidence(score) {
  if (score >= 30) return 'high';
  if (score >= 14) return 'medium';
  return 'low';
}

function inspectTools(cwd = process.cwd()) {
  const configText = readConfig();
  const mcpNames = configuredMcpNames(configText);
  const rows = TOOLS.map(tool => {
    const commandHits = {};
    for (const command of toolCommandNames(tool)) {
      const hit = findCommand(command);
      if (hit) commandHits[command] = hit;
    }
    const configured = tool.type === 'mcp' ? mcpNames.has(tool.mcpName) : null;
    const installed = tool.type === 'mcp' ? Boolean(configured) : Object.keys(commandHits).length > 0;
    return {
      id: tool.id,
      type: tool.type,
      label: tool.label,
      installed,
      configured,
      commands: commandHits,
      mcpName: tool.mcpName || null,
      use: tool.use,
      safeFirst: tool.safeFirst,
      keywords: tool.keywords,
    };
  });
  const knownMcpNames = new Set(TOOLS.map(tool => tool.mcpName).filter(Boolean));
  for (const name of [...mcpNames].sort()) {
    if (!knownMcpNames.has(name)) rows.push(genericMcpTool(name));
  }
  const project = projectTool(cwd);
  if (project) rows.push(project);
  return rows;
}

function dynamicCliToolsForQuery(query, existingRows) {
  const known = knownCommandNames(existingRows);
  const out = [];
  for (const token of tokens(query)) {
    if (token.length < 2 || COMMAND_TOKEN_STOPWORDS.has(token) || known.has(token)) continue;
    if (!/^[a-z0-9][a-z0-9._-]{1,}$/i.test(token)) continue;
    const hit = findCommand(token);
    if (hit) {
      known.add(token);
      out.push(dynamicCliTool(token, hit));
    }
  }
  return out;
}

function rankedCatalog(query, limit, cwd = process.cwd()) {
  const base = inspectTools(cwd);
  const catalog = [...base, ...dynamicCliToolsForQuery(query, base)];
  return catalog
    .map(tool => {
      const { score, matched } = scoreTool(tool, query);
      return { ...tool, score, confidence: confidence(score), matchedTerms: matched };
    })
    .filter(tool => tool.score >= 5 && tool.installed)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function markdownCatalog(rows) {
  const lines = [
    '# MCP/CLI Tool Catalog',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Codex config: \`${CODEX_CONFIG}\``,
    '',
    'Use this catalog for routing only. Prefer read-only inspection before write actions.',
    '',
  ];
  for (const type of ['mcp', 'cli']) {
    lines.push(`## ${type.toUpperCase()} Tools`, '');
    for (const tool of rows.filter(row => row.type === type)) {
      const status = tool.installed ? 'ok' : 'missing';
      const target = tool.type === 'mcp'
        ? `mcp: \`${tool.mcpName}\``
        : `commands: ${Object.keys(tool.commands).map(c => `\`${c}\``).join(', ') || 'none'}`;
      lines.push(`- **${status}** ${tool.label} (${target})`);
      lines.push(`  - Use: ${tool.use}`);
      lines.push(`  - Safe first: ${tool.safeFirst}`);
    }
    lines.push('');
  }
  return `${lines.join('\n').trim()}\n`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const catalog = inspectTools(opts.cwd);
  if (opts.write) {
    const out = path.resolve(opts.write);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, markdownCatalog(catalog), 'utf8');
  }
  if (opts.query) {
    console.log(JSON.stringify(rankedCatalog(opts.query, opts.limit, opts.cwd), null, 2));
    return;
  }
  if (opts.json) {
    console.log(JSON.stringify(catalog, null, 2));
    return;
  }
  process.stdout.write(markdownCatalog(catalog));
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
