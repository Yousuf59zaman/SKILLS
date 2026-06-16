# QA, Review, Documentation, and Delivery Rules

Use this reference before final delivery, code review, documentation tasks, frontend UI tasks, and API integration tasks.

## Pre-Edit Checklist

Before editing:

```text
1. git status --short
2. identify project root
3. inspect package/composer scripts
4. inspect relevant routes/pages/layouts/components
5. inspect API/fetch/auth utilities if needed
6. inspect similar feature implementation
7. decide smallest matching change
```

Do not revert unrelated dirty changes.

## Build and Test Checks

Use project scripts. Do not assume scripts.

CPIS `dev` branch frontend scripts currently include:

```json
{
  "dev": "vite",
  "build": "vite build"
}
```

CPIS Laravel scripts commonly include:

```json
{
  "dev": "concurrently runs php artisan serve, queue listener, pail logs, and npm run dev",
  "test": "php artisan test"
}
```

Nuxt scripts commonly include:

```json
{
  "dev": "nuxt dev",
  "build": "nuxt build",
  "generate": "nuxt generate",
  "preview": "nuxt preview",
  "postinstall": "nuxt prepare"
}
```

Run the narrowest useful check:

```text
typecheck for TS logic
build for integration
lint only when relevant and safe
browser check for UI/layout
API/manual check for interactive flows when credentials/server available
```

## Frontend QA Checklist

For UI changes check:

```text
desktop layout
mobile layout
tablet if relevant
no horizontal overflow
text fits containers
header/sidebar behavior
modal open/close
loading state
empty state
error state
dark mode if project supports it
console errors if browser-tested
```

For admin tables check:

```text
loadData runs
search works
filter works
page query pagination works
Create button respects permissions
Edit action respects permissions
Delete action opens confirm
delete success removes row
restore action appears in trashed view
response modal appears
validation errors display
```

For API integration check:

```text
request URL/baseURL
method
request body keys
auth token header
response data path
pagination meta
permissions object
422 mapping
401 behavior
404/409 behavior
500 behavior
```

## Code Review Mode

When user asks for review:

1. Findings first, ordered by severity.
2. Include file/line references.
3. Prioritize bugs, regressions, missing tests, API mismatch, hydration risk, auth risk, pagination risk.
4. Put open questions/assumptions after findings.
5. Keep summary brief.
6. If no issues, say that clearly and mention residual test gaps.

## Documentation Tasks

When user asks for explanation/docs:

```text
create .md file
use Bangla/Banglish with English technical terms
explain topic-wise
explain file-wise
explain route/page/component relationships
explain data/state/event/API/auth/rendering/responsive flow
include code snippets where useful
include common mistakes
include how to rebuild/debug later
```

For complex dashboard/report/claimant/admin flows, cover all relevant tabs and panels.

## Delivery Response

Final response must include:

```text
changed files
what changed
what was verified
what could not be verified and why
OrangeBD project rules followed
```

For docs-only tasks, say no build was needed.

For code tasks, mention exact command(s) run and result.

## Strict Do Not

Do not:

```text
change architecture without need
move Nuxt components without checking auto-import naming impact
replace custom dashboard panels with generic renderers unless explicitly requested
fake backend endpoints for UI demos
hardcode permissions in frontend
call production-complete when pagination/search/filter is frontend-only
hide API/backend semantic problems with frontend mapping
leave loading stuck on error paths
ship without checking responsive layout for frontend changes
```

## Useful Escalation Language

If API is invalid:

```text
I cannot safely map this response yet because the API is missing <field/meta/ID>. The frontend pattern expects <expected shape>. Backend should return <exact required shape> before this is production-complete.
```

If credentials/server unavailable:

```text
I verified build/typecheck/static behavior. I could not verify the authenticated browser flow because credentials/server were not available.
```
