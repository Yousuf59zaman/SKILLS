---
name: orangebd-workflow
description: Apply OrangeBD project workflow rules to coding, frontend UI, shared reusable field/icon components, utils extraction, Laravel/Vue/Nuxt/API integration, documentation, topic-wise complex-part explanations, review, and testing tasks. Use when working on OrangeBD projects or when the user asks to follow OrangeBD, boss, office, Figma, design, shared fields, reusable components, icons, duplicate functions, utils, hydration, pagination, complex part explanation, or project delivery rules.
---

# OrangeBD Workflow

Use this skill for OrangeBD project tasks. Apply only the rules that fit the current project, stack, and task; not every rule applies to every task. In the final response, include a short "OrangeBD rules followed" note listing the relevant rules applied and any important rules that did not apply.

## Skill file guardrail

- Do not modify this skill file or any other local skill file during normal project work unless the user explicitly asks to update, add to, or edit the skill.

## Baseline workflow

1. Before starting a new task, review the overall project pattern, not only one target file: stack, routes, controllers, layouts, pages, components, data flow, scripts, naming conventions, API patterns, auth flow, and dirty git status.
2. Prefer the existing project structure, coding style, folder structure, component pattern, route/controller pattern, API pattern, and naming style over introducing a new architecture.
3. Keep the change as small as the task allows. Avoid unrelated refactors, over-engineering, metadata churn, and broad rewrites.
4. Understand the requirement clearly, implement clean maintainable code, consider edge cases, remove unused code introduced by the change, and make sure existing features do not break.
5. Keep design/UI implementation self-contained until API integration or shared reuse explicitly requires extraction.
6. When API/backend data is involved, inspect existing response shape, pagination shape, loading/error/empty states, auth/role journey, and service/hook/composable pattern before wiring frontend code.
   - Only integrate an API when matching UI already exists, unless the user explicitly asks to create new UI.
   - If an API response only partially matches the UI, explain the mismatch before coding.
   - If API returns `200` but data is semantically suspicious, such as repeated `Unknown`, all-zero rows, missing IDs, or missing pagination meta, report the exact response problem before changing frontend mapping.
   - If an API returns a backend stack trace or SQL/server error, do not patch the frontend around it; report the exact backend issue and integrate only after a valid response is available.
7. Verify with the narrowest useful tests/build/browser checks, then do a quick developer review and QA review before final delivery.
8. Report what changed, what was verified, and which OrangeBD rules were followed.

## JavaScript and TypeScript

- Use ES6+ style where suitable.
- Prefer arrow functions for local callbacks and component helpers.
- Use `const` and `let`; do not use `var`.
- Prefer modern syntax where readable: destructuring, template literals, spread/rest, optional chaining, nullish coalescing, and modern array/object methods.
- Convert TypeScript modules to CommonJS only when the runtime or project requirement needs it.

## Naming conventions

- Follow the project's existing naming convention exactly where practical: `camelCase`, `PascalCase`, `kebab-case`, route names, controller names, folder names, and component names.
- In monolith apps where backend and frontend live together, keep naming consistent across routes, controllers, pages, components, services/hooks/utils, API names, and folders.
- Do not create different names for the same feature across backend/frontend unless the existing project already does so.
- Example pattern: backend route `claimants`, controller `ClaimantController`, frontend page `ClaimantsPage`, components such as `ClaimantList` or `ClaimantDetails`.

## Self-contained UI implementation

- For Figma or normal design tasks, keep initial design implementation self-contained inside the related page/component until real API integration requires extraction.
- Keep feature-specific constants, enums, static JSON-like objects, and static arrays in the same file or near the related feature/component/page.
- If backend API or database persistence is not ready, keep mock/static demo data in the Vue page/component or a nearby frontend data file. Do not put mock datasets inside Laravel/backend controllers unless the user explicitly asks for a backend API prototype.
- Allow small inner components inside a page/component when it keeps the feature understandable.
- When the user explicitly asks for fields or controls to be reusable across the project, put those reusable field components in the project's shared/common components folder, such as `components/shared`, `shared`, or the existing equivalent. This applies to inputs, selects, date pickers, filters, dropdowns, textareas, checkboxes, radios, and similar form controls.
- Keep shared field components generic and project-wide: expose labels, model value, options, disabled/error/loading states, placeholders, icons, and visual variants through props while preserving the existing design system. Do not hardcode one feature's data or labels inside a shared field.
- When creating or updating reusable icon components, expose `width` and `height` props in addition to any `size` prop, with sensible fallback behavior so icons can be sized uniformly or non-uniformly across modules.
- Keep one-off feature-specific fields local unless the user requests project-wide reuse or the same field pattern is already reused in multiple places.
- After dynamic/API integration grows, refactor shared behavior into existing services, hooks/composables, utils, or constants folders.

## Formatting

- Preserve the repository formatter and style config.
- Use 4-space tab/indent size when the project or editor formatting does not specify otherwise.
- After formatting, review the diff and make sure unrelated code did not change unnecessarily.

## Design implementation

- Convert fixed pixel values to Tailwind utilities or rem-based sizing where practical.
- Inspect Figma carefully for spacing, typography, color, states, and responsive behavior when design fidelity matters.
- Prefer Figma Dev Mode, Figma MCP, or copied layer CSS when available.
- Follow the existing project design system, spacing, typography, color, and component patterns first.
- Cover responsive behavior across `xs`, `sm`, `md`, `lg`, and `xl` where the screen supports those breakpoints.
- For browser verification, check at least two meaningful viewport widths for frontend layout changes.
- Use best-practice responsive layout: avoid incoherent overlap, prevent document-level horizontal overflow, keep text inside containers, and keep controls usable on mobile/tablet/desktop.
- When implementing or updating graph/chart UI, make charts fully interactive by default: use the project's chart library or shared chart wrapper, include hover tooltips, clickable legends or filters where relevant, hover/focus emphasis, responsive autoresize behavior, and browser verification of interaction. Avoid static SVG/CSS/bitmap charts unless the user explicitly asks for a static visual.
- Use custom text styling where the design requires it.
- If production CSS drops Tailwind styles, especially in rich/content `p` tags, use scoped stronger selectors or `!important` only when needed and localized.

## Dashboard and report refactor guardrails

- Design Preservation Rule: When refactoring UI components for data/API readiness, preserve existing templates, layout classes, chart options, spacing, and visual behavior unless the user explicitly asks for redesign. Move data/source logic first; do not replace custom-designed panels with generic renderers if the design is panel-specific.
- Panel-Specific Data Migration Rule: For complex dashboard/report panels, keep panel-specific components and migrate only business/static data into a nearby data source. Components may keep presentation-only logic such as ECharts config, color maps, filters, legends, table layout, and derived metric cards.
- Generic Renderer Caution Rule: Do not introduce a generic renderer for custom report panels when each panel has distinct Figma/design behavior. Use shared primitives only for truly repeated UI parts; otherwise keep report panels custom.
- Static API-Ready Data Shape Rule: If backend API is not ready, keep static data in an API-like compact data file with a stable getter/normalizer. Future API responses should replace or normalize into that shape without redesigning components.
- Safe Cleanup Boundary Rule: Cleanup redundancy only when it cannot affect design/data behavior. Do not delete one-off wrappers/components just because they have a single usage if removing them can alter visual output. Prefer removing duplicate data/type fields first.
- Nuxt Component Move Rule: Before reorganizing Nuxt component folders, check auto-import naming impact. If moving files into subfolders can change component names, use explicit imports or update template tags carefully, then run `nuxi prepare` and TypeScript checks.

## Architecture

- Use Atomic Design only when it fits the existing codebase and reduces real complexity; existing project architecture always wins.
- Existing project architecture is first priority. Before creating new files or components, check similar features/pages/API calls/routes/controllers and reuse or mirror the existing pattern.
- For file-based frontend routing, distinguish Nuxt from modern Next.js. Nuxt routes live in `pages/` by default. In new Next.js work, prefer the App Router `app/` structure with `page.tsx`, `layout.tsx`, and route groups; only follow the older `pages/` Pages Router when the existing project already uses it or the task explicitly requires it.
- Structure pages by major sections when the section is substantial or reused. Subsections can also become components when they reduce complexity.
- Tiny one-off elements like a single button/input do not need separate components unless the project already has reusable components for them.
- For reusable form controls, prefer project-level shared components over feature-only shared folders when the component is intended to be used across pages/modules. Feature folders can wrap shared fields with feature-specific labels or options.
- Before adding a new shared component/helper, scan for existing shared field, icon, table, and chart utilities; after migration, remove dead wrappers introduced or made obsolete by the change.
- If the same pure helper/function is used in two or more places, extract it to the project's existing `utils` folder/pattern and import it from there. Keep the util generic, named clearly, and free of feature-specific hardcoded data.
- For API helper organization, scale the folder structure with project size. In small/MVP projects, one compact file such as `src/lib/api.ts` is acceptable when there are only a few endpoints. In scalable projects, avoid one large API file; split by concern, for example `src/lib/api/client.ts` for the base fetch/Axios client and feature files such as `auth.ts`, `bookings.ts`, `services.ts`, plus `index.ts` for exports. For larger data flows, pair API functions with framework-appropriate hooks/composables: React/Next uses `hooks/useFeature.ts`, while Vue/Nuxt uses `composables/useFeature.ts`.
- For unfinished API-backed Inertia/workflow pages, keep Laravel controllers thin: render the page and pass only required route params or real server data. Avoid using controllers as temporary frontend data stores.
- Before adding local formatters, status badge logic, currency helpers, or repeated display helpers, scan existing `utils` and shared workflow components. Reuse existing helpers such as shared currency formatting or status badge components when available.
- In monolith apps, keep backend and frontend feature structure and names aligned enough that route/controller/page/component relationships are easy to follow.

## Functional and technical checks

- Watch for SSR/Nuxt/Vue hydration problems and use the project's established hydration-safe patterns.
- Use skeleton loaders for async content when the task affects loading UX and the project pattern supports it.
- Consider the user auth journey and route guards when changing pages behind login or role-based flows.
- Optimize/refactor only within the task scope; remove unused imports, dead local state, and obsolete code touched by the task.
- Do not create fake `store`, `update`, `destroy`, validation, or JSON response endpoints only to make a UI demo work. Add write routes/controllers only when real API/database behavior is required or explicitly requested.
- Follow existing backend API pagination patterns. For Laravel APIs, inspect response `meta`, `links`, and collection shape before implementing frontend pagination.
- When a table shows rows-per-page, pagination buttons, or sortable headers, verify whether they are functional or only static UI before calling the feature complete. If backend pagination is required, confirm request keys (`page`, `per_page`, `sort`, `search`) and Laravel response meta/links before implementation.
- For production table/list features, `sort`, `search`, `filter`, `pagination`, `per_page`, and rows-per-page limits must be treated as backend API responsibilities. Frontend-only handling can be used for temporary UI/demo behavior, but it is not final for scalable data. Confirm backend request keys and response pagination metadata before marking the feature complete.
- Handle `jwplayer` or `hlsplayer` requirements with the project's established media-player approach when those features are involved.
- For environment variables, use server-side env access in server files such as `index.js` or `config.js`; use a separate safe browser config approach for browser entry files such as `main.js`.
- In split frontend/backend projects with Docker, keep env ownership separate: root `.env` is for Docker infrastructure such as database container settings, backend `.env` is for backend runtime secrets/config such as database URL and auth secrets, and frontend `.env.local` is for frontend-safe public config such as API base URLs.

## Documentation and explanation tasks

When the user asks for a detailed Antigravity-style explanation or asks to explain the complex parts of any topic, feature, component, flow, API, chart, UI section, bug, or code area, create an `.md` file and explain in Bangla while keeping technical terms in English. Make it very easy to understand, topic-wise, and practical enough that the user can rebuild or debug the same thing later. Cover page by page, feature by feature, file by file, phase by phase, and step by step as relevant. Include:

- dashboard page, claimants page, and all relevant tabs when those are part of the task;
- visual breakdowns that mirror the website sections;
- the full flow for each feature;
- all files each page depends on;
- route/controller/page/component relationships and file dependency flow;
- code snippets for each small part;
- the most complex or easy-to-misunderstand parts first, with simple Bangla explanations and English technical terms;
- data flow, state flow, event flow, API flow, rendering flow, and responsive/design flow where they apply;
- why each important pattern exists, what can break, and common mistakes to avoid;
- how to rebuild, extend, or debug the same feature again from scratch.

When the user asks to understand "kon request kon file theke kothay jay", "file by file each request flow", "request flow", "route/API flow", or similar, create or update a dedicated `.md` file. Match the structure/style of `docs/request-flow-file-by-file.md` when that file exists in the project: start with a short mental model, then main files, request map tables, numbered flow sections for each route/API request, shared fetch/wrapper flow, middleware-vs-provider or framework timing, debug checklist, common mistakes, and a short final summary. Use Banglish/Bangla explanations with English technical terms.

For request-flow docs, accuracy of order is mandatory:

- Before writing tables, inspect the actual framework files that determine order: route/page files, `definePageMeta`, middleware, layouts, plugins/providers, root app file, headers/sidebars, modal coordinator files, composables/hooks, fetch wrappers, server/API proxy files, and small helper files. Do not infer order from folder names.
- Separate **route/render order** from **action/API request order**. Route/render order means browser route -> app/root -> route match/page meta -> middleware/guard -> layout -> shared layout components such as header/sidebar/footer -> page component -> child components. Action/API order means user event -> component/modal coordinator -> child form/modal -> composable/hook -> fetch wrapper -> backend/server endpoint -> state/cookie/redirect handling.
- In route tables, never put page render before route middleware when the framework runs middleware first. For Nuxt, show `app.vue`/root, route match, `definePageMeta` middleware, route middleware, selected layout, layout components, then page content. For Next.js, show request-time `middleware.ts` before route component/provider rendering when applicable.
- Include route requests and API requests separately. Label table columns precisely, such as `File/render order` for route rows and `Action/request order` for button/API rows. Do not use one generic "file order" column when it mixes different lifecycle types.
- For every request row, include the smallest relevant files in order with clickable links: pages/routes, middleware/guards, layouts, headers/sidebars/footers, modal coordinator, exact modal/form component, composable/hook/service, fetch wrapper/client, server proxy route, backend endpoint, and helper used for redirect/state. If a tiny file is part of the flow, do not omit it just because it has little code.
- If the exact file is dynamic or many pages share the same flow, say `target page component` only after listing the shared concrete files that always run first. Prefer concrete filenames over broad labels.
- For each request show: request name/method, starts from, frontend files in the verified order, backend endpoint, request body/params, state/cookie/header behavior, redirects, provider/layout/middleware timing, and common debug checks.
- For each API request section, use a precise request-by-request format: `Request N: METHOD /path`, previous hidden state/setup, exact user trigger, parent/coordinator event, child component state, template binding/click, validation, fetch wrapper, backend URL/body/headers/token/refresh, success/failure handling, emitted event, parent handler, and next modal/page/state. Use clickable file links with exact line numbers whenever the user is studying a concrete codebase.
- After drafting, do a consistency pass over every table and numbered flow: verify no row contradicts the framework timing, no middleware/layout/provider is missing, and no API/action flow is accidentally described as route render order.

For Next.js, explicitly separate `middleware.ts` request-time behavior from React provider/context client-side behavior. For Nuxt, explicitly separate plugins, `app.vue`, route match/page meta, route middleware, layouts, layout components, pages/components, composables, and `$fetch` wrappers.

Additional deep-dive prompt: keep this separate from the base request-flow-doc prompt. When the user says "aro details e each file by file line e niye bujhaw kono small step baad dibana" or asks for more detail about a specific request/route from an existing flow doc, expand only that selected request unless they ask for the full doc. Use numbered micro-steps and include every small step: prior state from the previous request, props/defaults, refs/computed/watchers, condition checks, v-if/v-model/event bindings, button/input handlers, validation, loading/error flags, timers/focus behavior, dropdown mapping/selection, `useState`/cookies/localStorage, fetch wrapper base URL/header/token refresh, request body, response mapping, emitted events, parent handlers, and the next visible modal/page. End with a short text flow diagram and an important-note section for branch caveats such as "only agent/advertiser", "only registration source", or "normal citizen path skips this request".

## Testing and review

- Use Codex-style code review for review requests: findings first, ordered by severity, with file/line references.
- Add or run unit tests where appropriate for logic-heavy, shared, or regression-prone changes.
- For frontend tasks, run the project build or typecheck when practical and use browser checks for visual/layout behavior. Do not use the user's Codex in-app browser unless they explicitly allow it for the task.
- If a submit/save/release/approve/generate button is not connected to real persistence, keep the handler clearly stubbed or local-demo only, and report it as not API-integrated. Do not mark the flow as production-complete.
- For each task, verify with a QA mindset before final delivery:
  - requirement is completed;
  - format changed files with the project formatter when available;
  - existing pattern and naming convention are followed;
  - UI is responsive where relevant;
  - API integration, loading, error, and empty states are handled where relevant;
  - auth/user journey is not broken;
  - browser console has no relevant new errors when checked;
  - unused imports/code are removed;
  - formatting is clean;
  - minimum-change approach was maintained.
