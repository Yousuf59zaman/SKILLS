# Future Nuxt/Vue Project Patterns

Use this reference for future OrangeBD Nuxt, Vue, Laravel Inertia, admin panel, citizen/customer portal, workflow dashboard, CMS, auth, payment, video, map, report, and Figma-to-code frontend work.

## Table Of Contents

1. Source projects and evidence
2. Choose the project family
3. Default architecture
4. Nuxt app flow
5. Auth, roles, and middleware
6. API and runtime config
7. Admin CRUD and CMS features
8. Citizen, agent, advertiser, and role portals
9. Media, maps, payments, and browser-only code
10. Laravel Inertia Vue flow
11. Workflow dashboard and desk screens
12. UI and component conventions
13. Future project guardrails

## Source Projects And Evidence

These rules were derived from the three requested `dev` branches:

```text
Accessimate
path: D:\orange-bd\Nuxt-vue\accesimate-fontend
branch: dev
commit: eef7cbe
remote: https://github.com/Motakabbir/accesimate-fontend.git
key files:
  package.json
  nuxt.config.ts
  app.vue
  utils/$fetchAdmin.ts
  utils/$fetchCitizen.ts
  utils/$fetchCMS.ts
  composables/adminAuth.ts
  composables/citizenAuth.ts
  plugins/authAdmin.ts
  plugins/authCitizen.ts
  pages/admin-panel/years/index.vue
  pages/admin-panel/years/components/AddEdit.vue
  components/Pagination.vue
  layouts/admin.vue
  layouts/citizen.vue
```

```text
HeyHomex
path: D:\orange-bd\Nuxt-vue\heyhomex_frontend
branch: dev
commit: 3928c47
remote: https://github.com/orange-bd/heyhomex_frontend.git
key files:
  package.json
  nuxt.config.ts
  app/app.vue
  app/utils/$fetchAdmin.ts
  app/utils/$fetchCitizen.ts
  app/utils/$fetchCMS.ts
  app/utils/$fetchAdvertiser.ts
  app/composables/adminAuth.ts
  app/composables/citizenAuth.ts
  app/composables/useCitizenLandingPath.ts
  app/composables/useCitizenAnalyzeNavigation.ts
  app/middleware/auth-citizen.ts
  app/middleware/auth-admin.ts
  app/middleware/guest.ts
  app/pages/admin-panel/categories/index.vue
  app/pages/admin-panel/categories/components/AddEdit.vue
  app/layouts/citizen.vue
  app/components/Sidebar/Citizen.vue
```

```text
CPIS
path: D:\orange-bd\Nuxt-vue\cpis
branch: dev
commit: fe0f7e2
remote: https://github.com/orange-bd/cpis.git
key files:
  composer.json
  package.json
  vite.config.js
  routes/web.php
  routes/admin.php
  app/Http/Middleware/HandleInertiaRequests.php
  app/Http/Controllers/Admin/NewsCategoryController.php
  app/Traits/PassesPermissions.php
  app/Http/Middleware/CheckPermission.php
  resources/js/app.js
  resources/js/bootstrap.js
  resources/js/Layouts/AdminLayout.vue
  resources/js/Layouts/ClaimantLayout.vue
  resources/js/Layouts/WorkflowLayout.vue
  resources/js/Pages/Admin/NewsCategory/Index.vue
  resources/js/Pages/Admin/NewsCategory/Create.vue
  resources/js/Pages/Admin/NewsCategory/Edit.vue
  resources/js/Components/Shared/PermissionGate.vue
  resources/js/Components/Shared/Table.vue
  resources/js/Components/Shared/TablePagination.vue
  resources/js/Pages/Workflow/Dashboard/index.vue
  resources/js/Components/Workflow/DeskIndexPage.vue
```

## Choose The Project Family

Use this decision before planning a future project:

```text
New Nuxt public/admin/customer portal -> use HeyHomex Nuxt 4 app-directory shape unless the project is already Nuxt 3 root-directory.
Existing Accessimate-style project -> keep top-level components/pages/layouts/composables/utils folders.
Existing HeyHomex-style project -> keep app/components, app/pages, app/layouts, app/utils.
Laravel backend with Inertia pages -> use CPIS route/controller/Inertia page pattern.
Standalone Vue/Vite SPA -> inspect router/store/component structure first; do not assume CPIS because CPIS is Inertia-backed.
```

For new OrangeBD Nuxt work, prefer:

```text
Nuxt + Vue 3 + Tailwind + PrimeVue + Nuxt Icon
app/ directory for Nuxt 4-style projects
server/api/ only for server-owned proxy/auth/secret work
utils/$fetch*.ts for API wrappers
composables/ for reusable reactive state/actions
role-specific layouts and shells
```

## Default Architecture

Use this ownership split:

```text
app.vue owns app boot concerns only: CMS bootstrap, head defaults, global wrappers.
layouts own shell: header, sidebar, footer, mobile overlay, slot.
pages own workflow state: filters, route query, pagination, modals, API calls for that screen.
components own reusable UI: fields, tables, cards, modals, sidebars, player widgets.
composables own reusable reactive logic: auth, subscriptions, role path, report limits, video player state.
utils own pure helpers and API wrappers: $fetchAdmin, $fetchCitizen, $fetchCMS, $fetchAdvertiser.
middleware owns route protection and role/segment redirect.
server/api owns server-side secret calls and backend proxy routes.
```

Keep feature files close together:

```text
pages/admin-panel/{module}/index.vue
pages/admin-panel/{module}/components/AddEdit.vue
```

For a new feature, first inspect the closest existing module:

```text
admin CRUD -> years, country, cms-auth-client, categories, news
citizen portal -> dashboard, search, report, subscription, favorites
agent/advertiser portal -> leads, listings, advertisements, subscription
workflow -> Dashboard, DeskIndexPage, DeskJobTable, module-specific step components
```

## Nuxt App Flow

Use the Accessimate/HeyHomex flow:

```text
nuxt.config sets modules, PrimeVue theme, runtime config, CSS, devServer.
app.vue bootstraps CMS token when CMS data is required.
auth plugins fetch current users into useState.
middleware checks useState and route role/segment rules.
layout renders role shell.
page loads feature data through $fetch* wrapper.
shared components render fields, tables, modal, pagination, loader.
```

For SEO/public pages:

```text
useHead for simple title/meta.
useAsyncData for SSR-friendly CMS/meta data.
Exclude admin/private pages from CMS meta fetches and sitemap/static rules.
Inject third-party scripts only in onMounted/import.meta.client and skip admin/auth pages when needed.
```

Do not block the whole app on CMS auth unless the current project already does that and the page depends on CMS data. A better future pattern is to let public shell render with local loading/error states for CMS-backed sections.

## Auth, Roles, And Middleware

Nuxt auth defaults:

```text
admin_user -> useState('admin_user', () => undefined)
citizen_user -> useState('citizen_user', () => undefined)
simple app-wide auth state -> useState
larger auth with many mutations/history/impersonation -> Pinia only if the project already uses it or the feature complexity justifies it
```

Token names:

```text
XADM-TOKEN -> admin
XCTN-TOKEN -> citizen/customer/user
XCMS-TOKEN -> CMS machine/client token
XADV-TOKEN -> advertiser, when advertiser has a separate token
```

Middleware rules from HeyHomex:

```text
auth-admin checks admin_user and confirmed admin role shape.
auth-citizen checks citizen_user, onboarding/subscription gates, and route segment.
guest redirects logged-in admins/citizens to their right landing route.
role route segments stay centralized in middleware.
```

For role paths, normalize once:

```text
kamaaina -> kamaina
kamaina/military/investor -> citizen layout
agent -> agent layout
advertisers -> advertiser layout
```

Do not duplicate role redirects per page. Use a composable like `useCitizenLandingPath` for post-login and homepage-search redirects.

## API And Runtime Config

Use API wrappers, not raw repeated fetch calls:

```text
$fetchAdmin
$fetchCitizen
$fetchCMS
$fetchAdvertiser when advertiser auth is separate
```

Wrapper responsibilities:

```text
baseURL from runtimeConfig
token cookie lookup
Authorization header
accept/application headers
server cookie forwarding with useRequestHeaders(['cookie'])
referer/host forwarding when existing project expects it
401 behavior
500 logging
response type support
```

Runtime config:

```text
Accessimate style: API_URL_ADMIN and API_URL_CITIZEN when admin/citizen APIs are split.
HeyHomex style: API_BASE_URL when backend is shared.
Future better pattern: keep CMS_EMAIL/CMS_PASSWORD/server secrets outside runtimeConfig.public.
```

CMS auth:

```text
server/api/auth.js calls cms/login with server-side config.
$fetchCMS owns 401 refresh queue with isRefreshing and failedQueue.
app.vue may store CMS token in XCMS-TOKEN and app_key only when the project needs CMS boot data.
```

Stop and report API issues when response shape is wrong. Do not hide backend stack traces, missing IDs, missing pagination meta, all-zero rows, or repeated Unknown values with frontend mapping.

## Admin CRUD And CMS Features

Use the Nuxt admin CRUD shape from Accessimate and HeyHomex:

```text
index.vue:
  definePageMeta({ middleware: ['auth-admin'], layout: 'admin' })
  route/query
  search/status filters
  paginationConfig
  permissions
  loadData
  AddEdit modal state
  ConfirmModal state
  ResponseModal state
  table/loading/empty/pagination render

components/AddEdit.vue:
  props: isOpenModal, modalTitle, item, data
  local formData
  watch item and open state
  validations_errors and skip_validations
  create/update handlers
  backend 422 mapping
  emit close and add_emit
```

Pagination:

```text
Use route.query.page.
Reset page when search/status/filter changes.
Pass backend meta to Pagination.
Backend owns real search/filter/sort/pagination.
```

Permissions:

```text
Nuxt admin pages use permissions from list/detail API.
Create/Edit/Delete/Restore UI renders only if backend permissions allow it.
Do not hardcode permissions in the page.
```

File/image forms:

```text
Use FormData for upload fields.
Use _method='PATCH' with POST if backend expects Laravel method spoofing.
Keep imagePreview and fileInput local to AddEdit.
Auto-generate slug from name only for create unless edit explicitly wants it.
Map 422 errors from errors or data depending real backend response shape.
```

## Citizen, Agent, Advertiser, And Role Portals

Use role-specific layouts and sidebars:

```text
layouts/citizen.vue
layouts/agent.vue
layouts/advertiser.vue
layouts/admin.vue
components/AppHeader/{Role}.vue
components/Sidebar/{Role}.vue
```

Role portal flow:

```text
login/social login -> set token -> fetch current user -> choose landing path
middleware validates role segment -> layout shell -> page data load
subscription/profile gates live in composables or middleware, not scattered buttons
```

HeyHomex-specific reusable concepts for future similar apps:

```text
useCitizenLandingPath -> role slug to landing route and pending homepage search query.
useCitizenAnalyzeNavigation -> subscription gate, report modal, daily report count, report route navigation.
useSubscription/useAgentSubscription -> reusable subscription state.
```

If a feature depends on the current role type, derive base path from route segment first, then from current user. This keeps copied pages working under `kamaina`, `military`, and `investor`.

## Media, Maps, Payments, And Browser-Only Code

Guard browser-only work:

```text
ClientOnly for video player modals and DOM-heavy widgets.
.client plugins for Stripe, JWPlayer, Swiper, AOS, Firebase browser SDKs.
onMounted/import.meta.client for window, document, localStorage, sessionStorage, maps, DOM measurement, and third-party scripts.
```

Media/video:

```text
Keep player state in composables such as useVideoPlayer, useHlsPlayerCore, useHlsPlayerAds.
Keep ad impression/click API calls inside player/ad composables when reused.
Use local public assets for fixed icons/images and backend URLs for uploaded content.
```

Payments/subscriptions:

```text
Keep payment SDK initialization in a client plugin.
Keep subscribe/unsubscribe/payment-history API calls in page or subscription composable depending reuse.
Use full page redirects only for external payment/SSO providers.
Use router/navigateTo for internal route changes.
```

Maps/location:

```text
Keep Leaflet/Google Places setup browser-only.
Use composables such as useGooglePlaces for repeated location behavior.
Use public marker assets when the library expects static URLs.
```

## Laravel Inertia Vue Flow

Use CPIS for Laravel + Inertia + Vue projects:

```text
routes/web.php splits auth/landing and includes admin.php, claimant.php, workflow.php.
controller checks permission, queries models, paginates, returns Inertia::render.
HandleInertiaRequests shares auth, settings, flash, session_id, ziggy.
resources/js/app.js registers Inertia, ZiggyVue, Link, Head.
resources/js/bootstrap.js owns Axios and CSRF header setup.
page receives props from controller.
page uses Head, Link, router, useForm, route().
layout owns shell.
shared components own table/input/card/permission UI.
```

For Inertia admin CRUD:

```text
Index.vue:
  props: data, filters, permissions
  router.on start/finish for loading
  SearchFilter or form refs
  watch + throttle + router.get with preserveState/replace
  PermissionGate for actions
  Link to create/edit
  router.delete/router.put for delete/restore
  Pagination from backend paginator links

Create/Edit.vue:
  useForm initial data
  form.post/put/delete to named route
  form.errors and form.processing drive UI
  back/cancel uses Link to index route
```

For permissions:

```text
Backend: PassesPermissions::getPermissionsForEntity('entity-name')
Backend: abort if permission is missing.
Frontend: PermissionGate entity="entity-name" permission="add|edit|delete"
Ownership: edit/delete can consider edit_other/delete_other when resource.created_by exists.
```

## Workflow Dashboard And Desk Screens

Use CPIS workflow pattern for complex operational flows:

```text
Laravel controller/service prepares all dashboard/desk props.
Page composes many small domain components instead of one huge template.
Filters submit through router.get with preserveState/preserveScroll/replace.
Generic desk index/table components are OK when real workflow repetition exists.
Bulk action forms use useForm and clear selected state on success.
Status, phase, step, deskConfig, jobs, and routes come from backend/controller.
```

For workflow screens, document and preserve:

```text
route -> controller -> service/resource -> Inertia props -> layout -> page -> child components -> action route
```

Do not replace a workflow-specific panel with a generic renderer unless the current feature already uses that pattern.

## UI And Component Conventions

Nuxt apps:

```text
PrimeVue components for Dialog, Button, Select, InputText, InputNumber, ToggleSwitch, Skeleton, ProgressSpinner.
FontAwesome/PrimeIcons/Nuxt Icon depending existing project.
Tailwind for layout, spacing, responsive behavior, and dark mode.
Lazy components for optional modals/loaders/pagination.
```

Inertia apps:

```text
Shared components from resources/js/Components/Shared first.
AdminLayout, ClaimantLayout, WorkflowLayout are not interchangeable.
Use Head title through layout/page.
Use Link for internal navigation.
Use route() names from Ziggy.
```

Responsive shells:

```text
Desktop sidebar and mobile overlay state belong in layout/sidebar.
Resize listeners must be in onMounted and cleaned up on unmount.
Do not make one giant role shell when roles have different navigation and colors.
```

Shared input rules:

```text
Inputs support v-model via modelValue/update:modelValue.
Expose focus only when needed.
Validation errors render through InputError or project equivalent.
```

## Future Project Guardrails

Do:

```text
Start from the closest real feature in the same project.
Keep page/component/composable/utils ownership clean.
Use API wrappers and backend response shapes.
Keep role-specific layouts separate.
Use backend pagination/permissions for production admin lists.
Guard browser-only libraries.
Run the narrowest useful script from package.json/composer.json.
```

Do not:

```text
Assume CPIS is Pinia/Vue Router; current CPIS dev branch is Laravel Inertia.
Move Nuxt files between root and app/ directory without checking the existing project convention.
Duplicate token/header logic in pages.
Hardcode permissions or role IDs without checking current-user/backend shape.
Patch frontend around backend semantic errors.
Use local slicing for production pagination.
Use window.location.href for normal internal auth redirects.
Scatter subscription/report/onboarding checks across pages when a composable/middleware owns them.
```
