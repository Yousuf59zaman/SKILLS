---
name: vue-data-debugger
description: Diagnose Vue and Nuxt data-flow bugs by tracing refs, reactive state, computed values, props, stores, route params, API responses, transforms, and template bindings. Use when asked to debug missing or wrong UI data, add a debug view, inspect v-for cards, map API fields to template output, investigate hydration or client/server mismatches, or explain how data reaches a Vue component.
---

# Vue Data Debugger

Make Vue/Nuxt data flow visible from source to rendered UI. Prefer a reversible, gated debug layer over broad rewrites.

## Workflow

1. Resolve the target.
   - Accept a `.vue` path, component name, route URL, CSS selector, template snippet, or symptom.
   - If given a Nuxt URL, map likely files before asking: `/foo/bar` -> `pages/foo/bar.vue`, `pages/foo/bar/index.vue`, `app/pages/foo/bar.vue`, route middleware/layouts, and referenced child components.
   - If given an element only, search with `rg` for component tags, class names, `v-for` aliases, and visible labels.

2. Run the analyzer when a Vue file is available:

```bash
python "$SKILL_DIR/scripts/analyze-vue-data.py" path/to/file.vue
```

Use the JSON to seed the investigation, then read the relevant script/template sections yourself.

3. Build a data lineage map before editing:
   - Sources: props, route params/query, stores, composables, API calls, SSR payloads, local refs/reactive state.
   - Transforms: computed values, watchers, `.map`, `.filter`, `.reduce`, normalization helpers, default/fallback logic.
   - Sinks: `v-for`, props passed into child components, `v-model`, `v-if`/`v-show`, text interpolation, class/style bindings, event handlers.
   - Risks: async timing, missing loading/error/empty states, stale keys, optional fields, SSR/client-only differences, casing mismatches, array/object shape drift.

4. Choose the least noisy debug mode that answers the question.
   - **Report mode**: no code edits; explain the lineage and likely breakpoints.
   - **Focused element mode**: instrument only the requested card, table, component, prop, or `v-for`.
   - **Page snapshot mode**: add a collapsible top-of-page debug panel for all relevant state.
   - **Runtime probe mode**: add temporary `watch` or `console.table` probes only when visual output is not enough.

## Editing Rules

- Keep all debug edits reversible. Mark them with `DATA_DEBUG` comments.
- Gate visual debug UI behind development mode plus `?debugData=1` or an existing local debug flag.
- Preserve business logic unless the user asked for a fix and the root cause is clear.
- Do not expose secrets, tokens, full auth payloads, or unnecessary personal data in debug panels.
- Keep overlays compact with `<details>`, `max-height`, and scrollable `<pre>` blocks.
- Match the project style: Composition API vs Options API, Tailwind vs CSS modules, Nuxt auto-imports vs explicit imports.
- If adding imports, merge with existing imports instead of creating duplicate `vue` imports.

## Debug Gate Patterns

Use an existing route object when available:

```ts
// DATA_DEBUG: enable with ?debugData=1 in development only.
const dataDebugEnabled = computed(() => {
  return import.meta.env.DEV && route.query.debugData === '1'
})
```

If there is no route object, avoid SSR `window` access:

```ts
// DATA_DEBUG: enable with ?debugData=1 in development only.
const dataDebugEnabled = ref(false)
onMounted(() => {
  dataDebugEnabled.value =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get('debugData') === '1'
})
```

Add a safe serializer when showing complex state:

```ts
// DATA_DEBUG: stringify Vue refs/reactive values safely for the debug panel.
const dataDebugJson = (value: unknown) => {
  try {
    return JSON.stringify(toRaw(unref(value)), null, 2)
  } catch (error) {
    return String(error)
  }
}
```

For API responses, capture raw and normalized shapes near the existing fetch logic:

```ts
// DATA_DEBUG: raw payload before normalization.
const dataDebugApi = reactive<Record<string, unknown>>({})

// inside the fetch path
dataDebugApi.searchRaw = response
dataDebugApi.searchItems = items
```

Adapt TypeScript annotations to the file. In plain JavaScript, remove `: unknown` and `Record<string, unknown>`.

## Visual Panel Pattern

Place page-level panels near the top of the template. Keep focused panels next to the target element.

```vue
<!-- DATA_DEBUG: page data snapshot, visible only with ?debugData=1 -->
<details
  v-if="dataDebugEnabled"
  class="mb-4 rounded border border-amber-400 bg-slate-950 p-3 text-xs text-slate-100"
  open
>
  <summary class="cursor-pointer font-semibold text-amber-300">
    Data debug: sources, transforms, and template sinks
  </summary>

  <div class="mt-3 grid gap-3 md:grid-cols-2">
    <section class="rounded bg-slate-900 p-3">
      <h3 class="mb-2 font-semibold text-cyan-300">Sources</h3>
      <pre class="max-h-72 overflow-auto whitespace-pre-wrap">{{ dataDebugJson({
        route: route.query,
        rawApi: dataDebugApi,
        state: {
          items,
          loading,
          error
        }
      }) }}</pre>
    </section>

    <section class="rounded bg-slate-900 p-3">
      <h3 class="mb-2 font-semibold text-emerald-300">Rendered collection</h3>
      <pre class="max-h-72 overflow-auto whitespace-pre-wrap">{{ dataDebugJson(items) }}</pre>
    </section>
  </div>
</details>
```

For focused `v-for` debugging, instrument only the relevant loop:

```vue
<!-- DATA_DEBUG: focused item mapping -->
<article v-for="(item, index) in items" :key="item.id ?? index">
  <details
    v-if="dataDebugEnabled"
    class="mb-2 rounded border border-cyan-300 bg-cyan-50 p-2 text-xs text-slate-900"
  >
    <summary>Item {{ index }} data mapping</summary>
    <pre class="max-h-48 overflow-auto whitespace-pre-wrap">{{ dataDebugJson(item) }}</pre>
    <div class="mt-2 grid gap-1">
      <div>title -> {{ item.title }}</div>
      <div>image -> {{ item.image || item.thumbnail }}</div>
      <div>id -> {{ item.id }}</div>
    </div>
  </details>

  <!-- original card content stays here -->
</article>
```

## Fix Heuristics

When the debug pass reveals the root cause, prefer the smallest durable fix:

- API shape mismatch: normalize once near the fetch/composable boundary; keep template fields stable.
- Missing optional fields: use defaults in normalization, not repeated template fallbacks.
- Async race: add loading/error/empty states and guard computed values against `undefined`.
- Broken `v-for`: use stable unique keys and avoid indexes unless there is no identity.
- Prop mismatch: align parent prop names and child `defineProps`; verify casing in templates.
- Store/composable stale state: reset on route key changes or watch the specific params that affect data.
- Hydration mismatch: keep SSR and client initial values consistent; move browser-only data to `onMounted` or `<ClientOnly>` when appropriate.

## Verification

- Run the analyzer again after edits if files changed.
- Run available project checks from `package.json`: typecheck, lint, unit tests, or build.
- For UI edits, open the page normally and with `?debugData=1`; verify normal mode is unchanged and debug mode shows the intended data.
- If using Browser/Playwright, capture the debug panel and inspect console errors.
- Report the target file, enabled URL/query, the lineage summary, and how to remove debug code (`DATA_DEBUG` comments).
