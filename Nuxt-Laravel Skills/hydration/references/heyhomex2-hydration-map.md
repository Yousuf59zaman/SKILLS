# HeyHomex2 Hydration Map

This map lists where hydration and client-only logic live in D:/Orangebd/HeyHomex2/app. Use it as a source of known-good patterns when porting to another Nuxt project.

## Hydrated gate with skeleton

Pattern: `const hydrated = ref(false)` -> `onMounted(() => hydrated.value = true)` and `v-if="!hydrated"` skeleton.

- app/components/Home/index.vue (hero skeleton + ClientOnly video)
- app/components/Auth/AdminLogin.vue (swap LazyInputText/ButtonPrimary for disabled inputs)
- app/pages/military/index.vue (dashboard skeleton + watch guard)
- app/pages/military/search.vue
- app/pages/military/property/[id].vue
- app/pages/military/watch/[id].vue
- app/pages/kamaina/index.vue
- app/pages/kamaina/search.vue
- app/pages/kamaina/property/[id].vue
- app/pages/kamaina/watch/[id].vue
- app/pages/investor/index.vue
- app/pages/investor/search.vue
- app/pages/investor/property/[id].vue
- app/pages/investor/watch/[id].vue

## ClientOnly wrappers

Pattern: `<ClientOnly>` to avoid SSR rendering for DOM-only components.

- app/layouts/admin.vue (wrap full admin layout, fallback spinner)
- app/components/Home/index.vue (background video)
- app/components/Auth/CitizenAuthModals.vue (auth modal stack)
- app/components/Common/Citizen/VideoGrid.vue (VideoPlayerModal)
- app/pages/*/property/[id].vue (client-only sections near bottom)

## Client-only plugins

Pattern: `*.client.ts` or `*.client.js` plugins to load libraries only on client.

- app/plugins/jwplayer.client.ts
- app/plugins/stripe.client.js

## process.client / import.meta.client guards

Pattern: guard DOM or browser-only APIs in functions.

- app/components/Feature/Display.vue (IntersectionObserver, window checks)
- app/components/Search/Video.vue (Leaflet map init)
- app/components/Search/Property.vue (Leaflet map init)
- app/components/AppHeader/Citizen.vue (window.history)
- app/components/Common/Citizen/ProfileSettings.vue (Cropper, DOM access)
- app/components/Auth/*.vue (OTP/login/register flows)
- app/utils/$fetch*.ts (client redirect on 401)

## SSR-safe fetch utilities

Pattern: handle cookies differently on server vs client.

- app/utils/$fetchCitizen.ts
- app/utils/$fetchAdmin.ts
- app/utils/$fetchAdvertiser.ts
- app/utils/$fetchCMS.ts

Common behavior:
- `process.client` reads cookie from `document`
- `process.server` adds `useRequestHeaders(['cookie'])`
