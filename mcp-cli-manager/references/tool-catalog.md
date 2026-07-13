# MCP/CLI Tool Catalog

Generated: 2026-06-28T18:38:58.003Z
Codex config: `C:\Users\User\.codex\config.toml`
OpenClaw config: `C:\Users\User\.openclaw\openclaw.json`

Use this catalog for routing only. Prefer read-only inspection before write actions.

Codex Desktop / Relay AI rule: Browser, Chrome, and node_repl are deferred plugin tools in modern Codex sessions. Use `tool_search` first to expose the callable tool; do not rely on `list_mcp_resources` for these and do not report that browser control is unavailable until `tool_search` has been attempted.

## MCP Tools

- **ok** Filesystem MCP (mcp: `filesystem`)
  - Use: Read, list, and inspect configured local filesystem roots through MCP when a session-aware file tool is available.
  - Safe first: List/read/stat/search only; avoid writes or cleanup unless explicitly requested.
- **ok** Memory MCP (mcp: `memory`)
  - Use: Read or update the configured MCP memory graph when the task needs persistent agent memory.
  - Safe first: Search/read memory first; write memory only when the user clearly asks to remember/update.
- **ok** Chrome DevTools MCP (mcp: `chrome_devtools`)
  - Use: Inspect live Chrome pages, console/network errors, DOM, performance, and local frontend behavior.
  - Safe first: Inspect, screenshot, console/network readout.
- **ok** Playwright MCP (mcp: `playwright`)
  - Use: Automate browser workflows and verify local web UI across viewports.
  - Safe first: Open target, screenshot, read visible state before interacting.
- **ok** Context7 MCP (mcp: `context7`)
  - Use: Fetch current library/framework docs and examples.
  - Safe first: Read docs only.
- **ok** GitHub MCP (mcp: `github`)
  - Use: Read or manage GitHub repo metadata, issues, PRs, Actions, and releases.
  - Safe first: Read/list/status first. Requires GitHub token for authenticated use.
- **ok** Firecrawl MCP (mcp: `firecrawl`)
  - Use: Extract structured content from websites when normal browsing/search is not enough.
  - Safe first: Fetch/read public pages only.
- **ok** Brave Search MCP (mcp: `brave-search`)
  - Use: Search the public web through OpenClaw MCP when current external information is needed.
  - Safe first: Search/read public results only.
- **ok** Sentry MCP (mcp: `sentry`)
  - Use: Investigate Sentry issues, stack traces, releases, and production errors.
  - Safe first: Read issue details first. Requires Sentry auth for private projects.
- **ok** MCP Toolbox (mcp: `mcp_toolbox`)
  - Use: Inspect SQL databases through MCP, configured safely for local SQLite by default.
  - Safe first: Read schema/list tables/select only.
- **ok** Postgres MCP (mcp: `postgres`)
  - Use: Inspect configured Postgres databases through MCP when SQL context is required.
  - Safe first: Read schema/list tables/select only; never migrate or write without explicit request.
- **ok** Notion MCP (mcp: `notion`)
  - Use: Read or manage Notion pages/databases when configured and relevant.
  - Safe first: Read/search first; avoid page/database edits unless explicitly requested.
- **ok** brave_search MCP (mcp: `brave_search`)
  - Use: Configured MCP server named "brave_search". Inspect its available tools/resources before using it.
  - Safe first: List/read/status operations first; avoid write actions unless explicitly requested.
- **ok** chrome-devtools MCP (mcp: `chrome-devtools`)
  - Use: Configured MCP server named "chrome-devtools". Inspect its available tools/resources before using it.
  - Safe first: List/read/status operations first; avoid write actions unless explicitly requested.
- **ok** figma-desktop MCP (mcp: `figma-desktop`)
  - Use: Configured MCP server named "figma-desktop". Inspect its available tools/resources before using it.
  - Safe first: List/read/status operations first; avoid write actions unless explicitly requested.
- **ok** figma_desktop MCP (mcp: `figma_desktop`)
  - Use: Configured MCP server named "figma_desktop". Inspect its available tools/resources before using it.
  - Safe first: List/read/status operations first; avoid write actions unless explicitly requested.
- **ok** gemini MCP (mcp: `gemini`)
  - Use: Configured MCP server named "gemini". Inspect its available tools/resources before using it.
  - Safe first: List/read/status operations first; avoid write actions unless explicitly requested.
- **ok** google-maps MCP (mcp: `google-maps`)
  - Use: Configured MCP server named "google-maps". Inspect its available tools/resources before using it.
  - Safe first: List/read/status operations first; avoid write actions unless explicitly requested.
- **ok** google-stitch MCP (mcp: `google-stitch`)
  - Use: Configured MCP server named "google-stitch". Inspect its available tools/resources before using it.
  - Safe first: List/read/status operations first; avoid write actions unless explicitly requested.
- **ok** google_maps MCP (mcp: `google_maps`)
  - Use: Configured MCP server named "google_maps". Inspect its available tools/resources before using it.
  - Safe first: List/read/status operations first; avoid write actions unless explicitly requested.
- **ok** google_stitch MCP (mcp: `google_stitch`)
  - Use: Configured MCP server named "google_stitch". Inspect its available tools/resources before using it.
  - Safe first: List/read/status operations first; avoid write actions unless explicitly requested.
- **ok** mcp-toolbox MCP (mcp: `mcp-toolbox`)
  - Use: Configured MCP server named "mcp-toolbox". Inspect its available tools/resources before using it.
  - Safe first: List/read/status operations first; avoid write actions unless explicitly requested.
- **ok** node-repl MCP (mcp: `node-repl`)
  - Use: Configured MCP server named "node-repl". Inspect its available tools/resources before using it.
  - Safe first: List/read/status operations first; avoid write actions unless explicitly requested.
- **ok** node_repl MCP (mcp: `node_repl`)
  - Use: Browser/Chrome automation helper and JavaScript execution kernel for Codex plugin sessions. Discover the callable `js` tool via `tool_search` before claiming it is missing.
  - Safe first: inspect current page/session state before clicking/typing; avoid write actions unless explicitly requested.
- **ok** notebooklm MCP (mcp: `notebooklm`)
  - Use: Configured MCP server named "notebooklm". Inspect its available tools/resources before using it.
  - Safe first: List/read/status operations first; avoid write actions unless explicitly requested.
- **ok** zapier MCP (mcp: `zapier`)
  - Use: Configured MCP server named "zapier". Inspect its available tools/resources before using it.
  - Safe first: List/read/status operations first; avoid write actions unless explicitly requested.

## CLI Tools

- **ok** Git (commands: `git`)
  - Use: Inspect repo state, diffs, history, branches, and commits.
  - Safe first: `git status`, `git diff`, `git log`.
- **missing** GitHub CLI (commands: none)
  - Use: GitHub operations from CLI when MCP is unavailable or CLI is more direct.
  - Safe first: `gh auth status`, `gh repo view`, `gh pr view`, `gh issue view`.
- **ok** ripgrep (commands: `rg`)
  - Use: Fast repo/file search.
  - Safe first: `rg <pattern>` or `rg --files`.
- **ok** jq (commands: `jq`)
  - Use: Filter, validate, and transform JSON.
  - Safe first: `jq . file.json`.
- **ok** PowerShell (commands: `pwsh`, `powershell`)
  - Use: Run deterministic Windows inspection and automation commands.
  - Safe first: `Get-ChildItem`, `Get-Content`, `Get-Process`, and other read-only inspection first.
- **ok** pnpm (commands: `pnpm`)
  - Use: Node package, build, test, and dev-server workflows when repo uses pnpm.
  - Safe first: `pnpm --version`, `pnpm test`, `pnpm lint`, repo scripts.
- **ok** uv (commands: `uv`)
  - Use: Python dependency and environment workflows when repo uses uv.
  - Safe first: `uv --version`, `uv run pytest` when configured.
- **ok** Docker (commands: `docker`)
  - Use: Inspect or run containerized services.
  - Safe first: `docker ps`, `docker compose ps`, `docker logs`.
- **ok** kubectl (commands: `kubectl`)
  - Use: Inspect Kubernetes clusters and workloads.
  - Safe first: `kubectl config current-context`, `kubectl get ...`.
- **ok** Helm (commands: `helm`)
  - Use: Inspect and template Helm charts/releases.
  - Safe first: `helm list`, `helm template`, `helm diff` if available.
- **ok** Terraform (commands: `terraform`)
  - Use: Inspect and plan infrastructure changes.
  - Safe first: `terraform fmt -check`, `terraform validate`, `terraform plan` only when context is clear.
- **ok** Vercel CLI (commands: `vercel`)
  - Use: Inspect or manage Vercel projects and previews.
  - Safe first: `vercel whoami`, `vercel env ls`, no deploy unless requested.
- **ok** Supabase CLI (commands: `supabase`)
  - Use: Supabase local/project workflows.
  - Safe first: `supabase status`, `supabase migration list`.
- **ok** Postman CLI (commands: `postman`)
  - Use: Run Postman API collections and tests.
  - Safe first: `postman --version`, collection dry/test commands.
- **ok** Firecrawl CLI (commands: `firecrawl`)
  - Use: CLI fallback for web extraction/crawling.
  - Safe first: Public URL reads only.
- **ok** Codex CLI (commands: `codex`)
  - Use: Inspect Codex setup, MCP list, doctor, or local agent state.
  - Safe first: `codex doctor`, `codex mcp list`.
- **ok** Gemini CLI (commands: `gemini`)
  - Use: Gemini CLI tasks when the user explicitly wants Gemini or cross-agent checks.
  - Safe first: `gemini --version`.
- **ok** Claude CLI (commands: `claude`)
  - Use: Claude CLI tasks when the user explicitly wants Claude or cross-agent checks.
  - Safe first: `claude --version`.
- **ok** Antigravity launcher (commands: `antigravity`, `antigravity-ide`)
  - Use: Launch or verify Antigravity/Antigravity IDE command access.
  - Safe first: `where antigravity`, `where antigravity-ide`.
