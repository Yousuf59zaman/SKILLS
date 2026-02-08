---
name: nuxt-hydration-logic
description: Identify, document, and implement Nuxt/Vue SSR hydration patterns (ClientOnly, hydrated gating, client-only plugins, process.client/import.meta.client guards, SSR-safe fetch utilities). Use when investigating hydration/SSR mismatch, DOM-only dependencies, or porting HeyHomex2-style hydration logic to another Nuxt project.
---

# Nuxt Hydration Logic

## Overview
Apply HeyHomex2-style hydration control in Nuxt to prevent SSR/CSR mismatch and safely run DOM-only code. Use this skill to inventory hydration-sensitive areas, choose the correct pattern, and implement consistent skeletons and fallbacks.

## Workflow

### 1) Inventory hydration-sensitive areas

Run focused searches in the target project to locate existing or missing hydration logic:

```bash
rg -n "hydrated|hydrate|ClientOnly|client-only|\.client\.(ts|js)" app
rg -n "process\.client|process\.server|import\.meta\.client" app
rg -n "window|document|localStorage|sessionStorage|IntersectionObserver|navigator" app
```

Then read `references/heyhomex2-hydration-map.md` to see concrete patterns from HeyHomex2 and choose the closest match.

### 2) Classify each area and choose a pattern

Pick the smallest pattern that fixes the mismatch:

- **Hydrated gate with skeleton**: Use when SSR output does not match client output (dynamic inputs, async data, or heavy UI that changes on mount). This is the main pattern in HeyHomex2.
- **ClientOnly wrapper**: Use when a subtree must never render on the server (video players, modals, map widgets, or admin layout that depends on DOM).
- **Client guard**: Use when only a function needs DOM APIs (IntersectionObserver, window, document). Keep the component SSR-safe and guard the DOM call.
- **Client-only plugin**: Use when a library must be loaded only on the client (JW Player, Stripe). Name the plugin `*.client.ts` or `*.client.js`.
- **SSR-safe fetch utility**: Use when requests need cookies/headers that differ between server and client. Add `process.server` and `process.client` handling.

### 3) Implement the pattern

#### Hydrated gate (skeleton -> real content)
Use the same structure across pages to keep SSR stable.

```vue
<script setup>
const hydrated = ref(false)

onMounted(() => {
  hydrated.value = true
  // load client-only data here if needed
})
</script>

<template>
  <div v-if="!hydrated" class="animate-pulse">
    <!-- skeleton that matches layout -->
  </div>
  <div v-else>
    <!-- real interactive content -->
  </div>
</template>
```

#### Hydrated gate for form inputs
Use non-interactive fallbacks to avoid SSR mismatch with custom inputs.

```vue
<template>
  <template v-if="hydrated">
    <LazyInputText v-model="form.email" />
  </template>
  <template v-else>
    <input disabled class="input-skeleton" />
  </template>
</template>
```

#### Guard watchers that should only run after hydration

```ts
watch(
  () => route.query,
  () => {
    if (hydrated.value) {
      loadData()
    }
  }
)
```

#### ClientOnly wrapper with fallback

```vue
<ClientOnly>
  <VideoPlayerModal />
  <template #fallback>
    <div class="animate-pulse">Loading...</div>
  </template>
</ClientOnly>
```

#### Client guard for DOM-only logic

```ts
const setupObserver = () => {
  if (!process.client) return
  observer.value = new IntersectionObserver(...)
}
```

#### Client-only plugin

```ts
// plugins/jwplayer.client.ts
export default defineNuxtPlugin(() => {
  // load DOM-only libraries here
})
```

#### SSR-safe fetch utility
Keep cookies and redirects SSR-safe.

```ts
if (process.client) {
  token = getCookie('TOKEN')
}
if (process.server) {
  headers = { ...headers, ...useRequestHeaders(['cookie']) }
}
if (status === 401 && import.meta.client) {
  window.location.href = '/'
}
```

### 4) Validate

- Run the app and watch the console for hydration warnings.
- Verify skeleton renders on first SSR paint and switches to real content after hydration.
- Confirm ClientOnly sections do not render on server.
- Check that DOM-only code never runs on the server.

## HeyHomex2 reference

Read `references/heyhomex2-hydration-map.md` to see where each pattern lives in D:/Orangebd/HeyHomex2/app.
