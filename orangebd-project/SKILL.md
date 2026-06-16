---
name: orangebd-project
description: Strict OrangeBD project workflow and common pattern guardrails. Use whenever working on OrangeBD projects or related codebases such as CPIS, Accessimate, HeyHomex, HeyHomex2, Nuxt, Vue, Laravel, Inertia, admin panels, dashboards, reports, API integration, auth, pagination, hydration, reusable fields/components, Figma-to-code, QA, project documentation, or future projects that should follow OrangeBD common frontend/backend conventions.
---

# OrangeBD Project

This skill is mandatory for OrangeBD project work. Treat it as the strict operating manual before reading, planning, editing, reviewing, documenting, testing, or delivering any OrangeBD-related task.

## Non-Negotiable Rules

1. Inspect the actual project before deciding anything. Do not guess file paths, stack, API shape, routes, layouts, components, or naming.
2. Preserve the existing project architecture. Existing local pattern beats a new abstraction.
3. Keep changes tightly scoped. Do not do unrelated refactors, redesigns, broad rewrites, or metadata churn.
4. Before editing, read the related page/component, layout, route/middleware, API wrapper/composable, shared components, and similar existing implementation.
5. For API work, inspect request keys, response shape, pagination meta, permissions, loading/error/empty state, and auth journey first.
6. For UI work, follow the current design system, spacing, typography, color, component pattern, responsive behavior, and role-specific layout.
7. For admin list/table work, backend owns production pagination, search, filter, sort, and per-page behavior.
8. For Nuxt work, guard browser-only logic with `import.meta.client`, `onMounted`, `.client` plugins, or `ClientOnly`.
9. Never patch frontend around backend stack traces, broken SQL/server errors, missing IDs, all-zero data, repeated `Unknown`, or missing pagination meta. Report the exact backend/API issue.
10. Verify with the narrowest useful build/typecheck/test/browser check. If a check cannot run, say exactly why.

## Mandatory First Pass

Before making any plan or edit:

```text
1. Check current directory and locate the real project root.
2. Check git status.
3. Read package/composer config to identify stack and scripts.
4. Inspect folder structure: pages, layouts, components, composables, middleware, plugins, utils, routes/controllers when present.
5. Inspect related existing feature(s) and shared components.
6. Inspect API/auth/pagination utilities if backend data is involved.
7. Decide implementation by matching the closest existing pattern.
```

Prefer `rg`/`rg --files` for search. Use parallel reads where useful.

## Reference Loading

Load only the references needed for the task:

- `references/common-patterns.md`: architecture, folders, naming, UI structure, small conventions, component rules.
- `references/nuxt-vue-future-patterns.md`: future Nuxt/Vue/Inertia app structure, feature flows, admin/citizen/workflow patterns, and source references from Accessimate, HeyHomex, and CPIS `dev` branches.
- `references/auth-api-state.md`: auth composables, middleware, cookies/tokens, API wrappers, SSR/hydration, server API.
- `references/admin-crud-pagination.md`: admin list pages, AddEdit modal, permissions, delete/restore, pagination, validation.
- `references/qa-delivery.md`: test/build/browser checks, final response, review and documentation rules.

For a new or broad OrangeBD frontend task, read `common-patterns.md`, `nuxt-vue-future-patterns.md`, `auth-api-state.md`, `admin-crud-pagination.md`, and `qa-delivery.md` before planning or editing.

## Project Family Defaults

Use the matching family:

```text
Nuxt apps: Accessimate / HeyHomex pattern
Nuxt 4 app-directory apps: HeyHomex pattern
Nuxt 3 root-directory apps: Accessimate pattern
Laravel + Inertia + Vue apps: CPIS pattern
Standalone Vue + Vite apps: inspect local router/store/components first; do not assume CPIS patterns unless the app is Inertia-backed
```

Nuxt default folders:

```text
app/                # use when the project already uses Nuxt appDir or is a new Nuxt 4-style app
components/
composables/
layouts/
middleware/
pages/
plugins/
server/
utils/
assets/
public/
```

Vue/Vite default folders:

```text
src/components/
src/composables/
src/layouts/
src/middleware/
src/pages/
src/plugins/
src/router/
src/stores/
src/utils/
src/assets/
```

## Implementation Discipline

Use this decision flow:

```text
Can this be done inside the target page/component without duplication?
  yes -> keep it local.
  no -> is the same logic/UI already used in 2+ places?
    yes -> reuse or extract into existing shared component/composable/utils pattern.
    no -> keep it feature-local.
```

Use these ownership rules:

```text
Page owns workflow state.
Layout owns shell.
Component owns reusable UI.
Composable owns reusable reactive state/actions.
Utils own pure helpers and API/fetch wrappers.
Middleware owns route protection.
Backend owns scalable list operations.
```

## API and Backend Integration Rules

Before wiring data:

```text
1. Find existing fetch wrapper: $fetchAdmin, $fetchCitizen, $fetchCMS, axios service, or local $fetch.
2. Confirm base URL/env key.
3. Confirm token/cookie/header behavior.
4. Confirm endpoint, method, request body, and response shape.
5. Confirm pagination shape and permission shape for lists.
6. Confirm loading, error, empty, auth redirect, and validation behavior.
7. For auth/state changes, use `references/auth-api-state.md` scenario rules before choosing `useState` vs Pinia, `router.push` vs hard reload, or page permission/role metadata.
```

Expected admin list response shape:

```ts
{
  status: true,
  data: {
    data: [],
    meta: {
      current_page: 1,
      last_page: 1,
      from: 1,
      to: 10,
      total: 10,
    },
    permissions: {
      add: true,
      edit: true,
      delete: true,
    },
  },
}
```

If the API does not match, report the mismatch before coding around it.

## UI and Component Rules

Follow the app's current design system first.

- Use existing shared `Input`, `Button`, `Loader`, `Pagination`, `ConfirmModal`, `ResponseModal`, `AppHeader`, `AppFooter`, `Sidebar`, and `Common` components when present.
- Keep feature-specific one-off UI local.
- Create shared fields only when reuse is real or explicitly requested.
- Role-specific shells should stay split: `Admin`, `Citizen`, `Guest`, `Agent`, `Advertiser`, etc.
- For responsive UI, check mobile/tablet/desktop where relevant.
- Do not redesign existing screens unless explicitly asked.

## Documentation Rule

When asked to explain complex project logic, create an `.md` file. Use Bangla/Banglish with English technical terms. Explain topic-wise, file-wise, flow-wise, and include:

```text
route/page/component relationships
data flow
state flow
event flow
API flow
auth flow
responsive/design flow
common mistakes
how to rebuild/debug later
```

For API route/request flow documentation, follow the OrangeBD Workflow request-flow style: request-by-request sections with exact route/action order, concrete filenames, clickable line references, request body/params, token/header behavior, wrapper/backend path, response handling, emitted events, parent/coordinator state changes, and next modal/page. If the user asks "aro details e each file by file line e niye bujhaw kono small step baad dibana", expand the selected request into numbered micro-steps and include small state/template/watch/validation/loading/error/timer/dropdown/cookie/useState details instead of giving only a summary.

## Final Delivery Rule

Every final answer for OrangeBD project work must include:

```text
what changed
what was verified
what was not verified and why
OrangeBD project rules followed
```

For code review requests, findings come first with file/line references, then assumptions, then summary.
