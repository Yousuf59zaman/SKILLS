# Auth, API, State, SSR, and Hydration Patterns

Use this reference whenever a task touches login/logout, route protection, API integration, cookies, tokens, current user state, CMS auth, SSR, browser-only libraries, media players, maps, or Nuxt hydration.

## Auth Flow

Nuxt apps follow:

```text
app starts
auth plugin runs
fetch current user
save in useState
middleware checks user state
allowed route renders or redirects
```

CPIS follows Vue Router + Pinia:

```ts
router.beforeEach(authMiddleware)
```

## Token Names

```ts
export const $XADM_TOKEN = 'XADM-TOKEN'
export const $XCTN_TOKEN = 'XCTN-TOKEN'
export const $XCMS_TOKEN = 'XCMS-TOKEN'
```

Meaning:

```text
XADM-TOKEN: admin user
XCTN-TOKEN: citizen/customer user
XCMS-TOKEN: CMS machine/client token
```

Use `Authorization: Bearer <token>`.

## API Wrapper Responsibilities

Fetch wrappers must own:

```text
baseURL
token lookup
Authorization header
accept/application headers
server cookie forwarding
401 handling
500 logging
response type support
```

Page code should call:

```ts
const response = await $fetchAdmin('admin/users/all', {
  method: 'POST',
  body: { paginate: true },
})
```

Do not spread raw `fetch()` with token logic across pages.

## Runtime Config Pattern

If admin/citizen API separated:

```text
API_URL_ADMIN
API_URL_CITIZEN
```

If same backend:

```text
API_BASE_URL
```

Secrets should not be in `runtimeConfig.public`. Better future pattern:

```ts
runtimeConfig: {
  CMS_EMAIL: process.env.CMS_EMAIL,
  CMS_PASSWORD: process.env.CMS_PASSWORD,
  public: {
    API_BASE_URL: process.env.API_BASE_URL,
  },
}
```

## Admin Auth Composable Pattern

```ts
const LOGIN = '/admin/login'
const LOGOUT = '/admin/logout'
const CURRENT_USER = '/admin/user'

export const adminUser = () => useState('admin_user', () => undefined)

export const adminAuth = () => {
  const router = useRouter()
  const admin_user = adminUser()
  const isAdminLoggedIn = computed(() => !!admin_user.value)
  const cookie = useCookie($XADM_TOKEN)

  async function login(credentials) {
    if (isAdminLoggedIn.value) return
    const response = await $fetchAdmin(LOGIN, { method: 'POST', body: credentials })
    cookie.value = response.data?.token
    return response
  }

  async function logout() {
    await $fetchAdmin(LOGOUT, { method: 'POST' })
    admin_user.value = null
    cookie.value = null
    await router.push('/')
  }

  return { admin_user, isAdminLoggedIn, login, logout }
}
```

## Citizen Auth Pattern

Citizen/customer auth mirrors admin auth, usually with:

```text
LOGIN
LOGOUT
CURRENT_USER
SSO_LOGIN
googleLogin
facebookLogin
appleLogin when needed
```

Use Firebase/social auth in a plugin/composable, not repeated page code.

## Current User Plugin Pattern

```ts
export default defineNuxtPlugin(async () => {
  const admin_user = adminUser()
  if (admin_user.value !== undefined) return
  admin_user.value = await fetchAdminCurrentUser()
})
```

Rules:

- Plugin runs at app boot.
- It should not repeatedly fetch if state is already initialized.
- Middleware uses this state for route protection.
- Before calling current-user APIs, check whether the matching token exists. If no token exists, set state to `null` and skip the API call.

Token-gated plugin example:

```ts
export default defineNuxtPlugin(async () => {
  const admin_user = adminUser()
  const token = useCookie($XADM_TOKEN)

  if (admin_user.value !== undefined) return

  admin_user.value = token.value
    ? await fetchAdminCurrentUser()
    : null
})
```

Scenario rule:

```text
admin token exists only -> call /admin/user, skip /customer/user
citizen token exists only -> call /customer/user, skip /admin/user
no user token -> set both states null, skip both current-user APIs
both tokens exist -> verify both only if the project intentionally supports dual sessions; otherwise prefer the active route/role and clear stale token
```

## Login Redirect Pattern

Prefer SPA navigation after login:

```ts
const response = await login(form)

if (response) {
  admin_user.value = await fetchAdminCurrentUser()
  await router.push('/admin-panel')
}
```

Rules:

- Use `router.push()` / `navigateTo()` for normal internal redirects after login, logout, save, filter, tab, and route-query changes.
- Before pushing to a protected page, update current user state if the target middleware depends on that state.
- Use `window.location.href` only when a real full browser reload is required, such as leaving the app for an external payment/SSO URL, recovering from a corrupted client state, or intentionally reloading all runtime assets after a deployment-critical change.
- Do not use `window.location.href` just to make auth state refresh. Fetch current user and push the route instead.

Scenario rule:

```text
login success + internal dashboard/admin route -> fetch current user, then router.push
logout success + internal public route -> clear state/token, then router.push or navigateTo
payment gateway/external SSO URL -> window.location.href is acceptable
same-app route/query change -> router.push, router.replace, or navigateTo
```

## Middleware Pattern

Admin:

```ts
export default defineNuxtRouteMiddleware(async () => {
  const admin_user = adminUser()
  if (!admin_user.value) return navigateTo('/admin-login', { replace: true })
})
```

Citizen:

```ts
export default defineNuxtRouteMiddleware(async () => {
  const citizen_user = citizenUser()
  if (!citizen_user.value) return navigateTo('/', { replace: true })
})
```

Guest:

```ts
export default defineNuxtRouteMiddleware(async () => {
  const admin_user = adminUser()
  const citizen_user = citizenUser()
  if (admin_user.value) return navigateTo('/admin-panel', { replace: true })
  if (citizen_user.value) return navigateTo('/dashboard', { replace: true })
})
```

Rules:

- Route protection belongs in middleware.
- Page files should not duplicate auth redirects.
- Role-to-route normalization belongs in middleware.
- Basic `auth-admin` only answers "logged in or not". Add page meta when a page needs role or permission access control.
- Confirm the current-user response shape before implementing role/permission checks; normalize backend arrays/objects instead of guessing field names.

Page-level permission example:

```ts
definePageMeta({
  middleware: ['auth-admin'],
  layout: 'admin',
  permission: 'users.view',
})
```

Multiple allowed roles for one page:

```ts
definePageMeta({
  middleware: ['auth-admin'],
  layout: 'admin',
  roles: ['super-admin', 'user-manager'],
})
```

Multiple permission options:

```ts
definePageMeta({
  middleware: ['auth-admin'],
  layout: 'admin',
  permissionsAny: ['users.view', 'users.manage'],
})
```

Strict multiple required permissions:

```ts
definePageMeta({
  middleware: ['auth-admin'],
  layout: 'admin',
  permissionsAll: ['users.view', 'users.export'],
})
```

Permission/role middleware pattern:

```ts
export default defineNuxtRouteMiddleware((to) => {
  const admin_user = adminUser()

  if (!admin_user.value) {
    return navigateTo('/admin-login', { replace: true })
  }

  const userRoles = admin_user.value?.data?.roles || []
  const userPermissions = admin_user.value?.data?.permissions || []

  const roles = to.meta.roles as string[] | undefined
  const permission = to.meta.permission as string | undefined
  const permissionsAny = to.meta.permissionsAny as string[] | undefined
  const permissionsAll = to.meta.permissionsAll as string[] | undefined

  const hasRole = !roles?.length || roles.some((role) => userRoles.includes(role))
  const hasPermission = !permission || userPermissions.includes(permission)
  const hasAnyPermission = !permissionsAny?.length || permissionsAny.some((p) => userPermissions.includes(p))
  const hasAllPermissions = !permissionsAll?.length || permissionsAll.every((p) => userPermissions.includes(p))

  if (!hasRole || !hasPermission || !hasAnyPermission || !hasAllPermissions) {
    return navigateTo('/admin-panel', { replace: true })
  }
})
```

Scenario rule:

```text
any logged-in admin can open page -> only auth-admin
one exact permission required -> permission: 'module.action'
one of many permissions can open page -> permissionsAny: [...]
all listed permissions required -> permissionsAll: [...]
one of many roles can open page -> roles: [...]
roles + permissions both present -> user must satisfy both role and permission checks
action button visibility -> use backend permissions object from list/detail API, not hardcoded route meta
unknown current-user permission shape -> inspect API first, then normalize roles/permissions in auth composable/store
```

## CMS Auth and Refresh Queue

CMS token refresh pattern:

```ts
let isRefreshing = false
let failedQueue = []
```

Flow:

```text
CMS request gets 401
if refresh already running -> queue request
else call /api/auth
save new token
process queued requests
retry original request
```

Use this for CMS/machine tokens. For normal user tokens, logout/redirect may be enough.

## Server API Auth Endpoint Pattern

Nuxt server route:

```text
server/api/auth.js
```

Purpose:

```text
login CMS from server route
avoid repeating CMS login in browser code
return CMS login payload to app
```

Use server-side runtime config for secrets.

## Nuxt State vs Pinia

Nuxt:

```ts
useState('admin_user', () => undefined)
useState('citizen_user', () => undefined)
```

Vue/Vite:

```ts
export const useUserStore = defineStore('user', () => {
  const user = ref(null)
  function setUser(userData) { user.value = userData }
  function clearUser() { user.value = null }
  const isLoggedIn = () => user.value !== null
  return { user, setUser, clearUser, isLoggedIn }
})
```

Rules:

- Nuxt app-wide state -> `useState`.
- Vue/Vite app-wide state -> Pinia.
- Page state -> local refs.

Nuxt scenario rules:

```text
useState is enough -> small app-wide state, current user, theme-ish value, one or two auth actions, no complex mutations
Pinia is better -> many auth actions, roles/permissions, loading/error history, refresh token flow, profile update, impersonation, multi-role switching, or cross-module business state
local ref is better -> state only used by one page/component and does not need to survive route-level sharing
composable is better -> reusable actions/state pattern without needing full store structure
```

Use `useState` for simple Accessimate/HeyHomex Nuxt auth unless the existing project already uses Pinia or the auth module grows past basic login/logout/current-user.

Pinia auth shape when justified:

```ts
export const useAdminAuthStore = defineStore('adminAuth', () => {
  const user = ref(null)
  const roles = ref<string[]>([])
  const permissions = ref<string[]>([])
  const isLoading = ref(false)
  const error = ref(null)

  const isLoggedIn = computed(() => !!user.value)

  async function fetchCurrentUser() {
    try {
      isLoading.value = true
      const response = await $fetchAdmin('/admin/user', { method: 'POST' })
      user.value = response
      roles.value = response?.data?.roles || []
      permissions.value = response?.data?.permissions || []
    } finally {
      isLoading.value = false
    }
  }

  return { user, roles, permissions, isLoading, error, isLoggedIn, fetchCurrentUser }
})
```

## SSR and Hydration Safety

Guard:

```text
window
document
localStorage
document.cookie
map libraries
video players
jwplayer
hls.js
DOM measurement
third-party animation
```

Safe patterns:

```ts
if (import.meta.client) {
  // browser-only logic
}
```

```ts
onMounted(() => {
  // browser-only logic
})
```

```vue
<ClientOnly>
  <VideoPlayer />
</ClientOnly>
```

Use `.client` plugin suffix for browser-only SDKs:

```text
aos.client.js
swiper.client.js
stripe.client.js
jwplayer.client.ts
```

## Route Segment Role Redirect

For role route segments:

```ts
const pathSegment = to.path.split('/')[1]
const protectedSegments = ['kamaina', 'military', 'investor', 'agent', 'advertisers']
```

Rules:

- Normalize route access in middleware.
- Keep slug mismatch mapping explicit.
- Do not duplicate segment redirect per page.

## `useHead` and `useAsyncData`

Page title:

```ts
useHead({ title: 'Settings - Citizen Panel' })
```

SSR data:

```ts
const { data } = await useAsyncData(
  'key',
  async () => await $fetchCMS(`cms/metas/${slug.value}`, { method: 'POST' }),
  { pick: ['data'], watch: [slug] }
)
```

Rules:

- Use `useAsyncData` for SSR-friendly page data.
- Use `onMounted` for client-only data/actions.
- Public pages should set SEO title/meta.

## API Red Flags

Stop and report if API returns:

```text
backend stack trace
SQL/server error
200 with semantically invalid data
repeated Unknown values
all-zero rows
missing IDs
missing pagination meta for paginated UI
unexpected response path
permissions missing for permission-gated admin page
```
