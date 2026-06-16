# MCP/CLI Tool Catalog

Generated: 2026-06-16T06:46:57.307Z
Codex config: `C:\Users\This pc\.codex\config.toml`

Use this catalog for routing only. Prefer read-only inspection before write actions.

## MCP Tools

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
- **ok** Sentry MCP (mcp: `sentry`)
  - Use: Investigate Sentry issues, stack traces, releases, and production errors.
  - Safe first: Read issue details first. Requires Sentry auth for private projects.
- **ok** MCP Toolbox (mcp: `mcp_toolbox`)
  - Use: Inspect SQL databases through MCP, configured safely for local SQLite by default.
  - Safe first: Read schema/list tables/select only.

## CLI Tools

- **ok** Git (commands: `git`)
  - Use: Inspect repo state, diffs, history, branches, and commits.
  - Safe first: `git status`, `git diff`, `git log`.
- **ok** GitHub CLI (commands: `gh`)
  - Use: GitHub operations from CLI when MCP is unavailable or CLI is more direct.
  - Safe first: `gh auth status`, `gh repo view`, `gh pr view`, `gh issue view`.
- **ok** ripgrep (commands: `rg`)
  - Use: Fast repo/file search.
  - Safe first: `rg <pattern>` or `rg --files`.
- **ok** jq (commands: `jq`)
  - Use: Filter, validate, and transform JSON.
  - Safe first: `jq . file.json`.
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
