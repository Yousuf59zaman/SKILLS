# OrangeBD React and Next.js App Router Pattern

Use this reference for OrangeBD React and Next.js projects. Keep it separate from the Nuxt/Vue reference. Inspect the target repository and installed Next.js version before applying any convention.

## Table Of Contents

1. Source Evidence And Applicability
2. Core Mental Model
3. Recommended Folder Structure
4. Folder Ownership Rules
5. Route And Render Flow
6. Server And Client Component Boundaries
7. Route Groups And Role Layouts
8. Authentication And Session Architecture
9. API Client Architecture
10. Environment Variables
11. Providers And Third-Party Integrations
12. Component, Hook, State, And Type Rules
13. Detailed Admin And Citizen Flows
14. Route Handlers, Server Actions, And Filewise Guards
15. Loading, Error, Validation, And Navigation
16. UI And Asset Rules
17. Testing And QA
18. New Project Build Order
19. Anti-Patterns
20. Compact Flow Diagrams

## Source Evidence And Applicability

Derive this pattern from the inspected Accessimate Next project:

```text
D:\orange-bd\Next-React\next_accessimate-frontend
branch: dev
baseline inspected: f360bbf and earlier architecture commits
stack: Next.js 16 App Router + React 19 + TypeScript + Tailwind CSS 4
```

Observed working architecture:

```text
src/app route groups and route entry files
src/layouts role shell components
src/components reusable and role-specific UI
src/hooks client auth actions and local state
src/lib/api shared request layer and role API wrappers
src/lib/auth cookie names and browser cookie helpers
src/providers root React provider boundary
src/providers/AdminAuthProvider.tsx shared admin user/session state
src/components/AppHeader/Admin.tsx profile, logout, and theme entry
src/components/AppHeader/AdminThemeToggle.tsx admin theme switch
src/components/Sidebar/Admin dynamic recursive admin menu shell
src/types/adminMenu.ts backend-provided admin menu shape
src/lib/env.ts public environment mapping
src/lib/server-env.ts server-only environment mapping
public/images static assets
```

Treat the inspected project as an evolving migration baseline, not a template to copy blindly. Do not copy placeholder pages, default Create Next App metadata, incomplete CMS refresh behavior, client-written production session cookies, missing validation, or temporary shell markup.

Cross-check version-sensitive behavior against the installed Next.js version and current official documentation:

```text
https://nextjs.org/docs/app/getting-started/project-structure
https://nextjs.org/docs/app/getting-started/server-and-client-components
https://nextjs.org/docs/app/guides/environment-variables
https://nextjs.org/docs/app/guides/authentication
```

## Core Mental Model

Use this ownership model:

```text
src/app          = framework routes, route layouts, metadata, loading/error UI, route handlers
src/app/(role)/layout.tsx = filewise role access and redirect guard
src/layouts      = real role/public shell UI
src/components   = reusable presentation and interaction components
src/hooks        = reusable client-side React state and actions
src/lib/api      = fetch/request infrastructure and backend concern wrappers
src/lib/auth     = auth constants, session/cookie helpers, route ownership
src/lib/env.ts   = browser-safe NEXT_PUBLIC_* mapping
src/lib/server-env.ts = server-only secret mapping
src/providers    = React context/provider composition
src/integrations = third-party SDK initialization
src/utils        = pure framework-independent helpers
public           = static assets served from the web root
```

Keep route files small:

```text
page.tsx identifies the route and composes the page
route-group layout.tsx applies role access and selects a shell
src/layouts/* owns header/sidebar/footer/main structure
components own reusable UI
hooks own interactive action state
lib/api owns network mechanics
```

Default to Server Components. Add `"use client"` only where state, effects, event handlers, browser APIs, client hooks, or context are required.

## Recommended Folder Structure

Use this scalable starting structure. Create optional folders only when the feature exists.

```text
project-root/
  .env
  .gitignore
  next.config.ts
  package.json
  tsconfig.json
  eslint.config.mjs
  postcss.config.mjs

  public/
    images/
      auth/
      header/

  src/
    app/
      layout.tsx
      page.tsx
      globals.css
      favicon.ico

      (public)/
        layout.tsx
        about/page.tsx
        pricing/page.tsx

      (guest)/
        layout.tsx
        login/page.tsx
        admin-login/page.tsx
        registration/page.tsx
        forgot-password/page.tsx

      (admin)/
        layout.tsx
        admin-panel/
          page.tsx
          users/page.tsx
          settings/page.tsx

      (citizen)/
        layout.tsx
        dashboard/page.tsx
        settings/page.tsx
        billing-payments/page.tsx

      api/
        cms-auth/route.ts
        auth/
          login/route.ts
          logout/route.ts

      loading.tsx
      error.tsx
      not-found.tsx

    layouts/
      DefaultLayout.tsx
      GuestLayout.tsx
      GuestAuthLayout.tsx
      AdminLayout.tsx
      CitizenLayout.tsx

    components/
      AppHeader/
        Admin.tsx
        AdminThemeToggle.tsx
        Citizen.tsx
        Guest.tsx
      Sidebar/
        Admin/
          index.tsx
          RecursiveMenuItem.tsx
          menuUtils.ts
        Citizen.tsx
      Auth/
        AdminLogin.tsx
        CitizenLogin.tsx
      Input/
        InputError.tsx
      Button/
        PrimaryButton.tsx
      Loader/
      Common/
      Pagination.tsx
      ConfirmModal.tsx
      ResponseModal.tsx

    hooks/
      useAdminAuth.ts
      useCitizenAuth.ts
      useRegistrationFlow.ts
      useAppKey.ts

    lib/
      api/
        request.ts
        fetchAdmin.ts
        fetchCitizen.ts
        fetchCMS.ts
      auth/
        authConstants.ts
        browserCookies.ts
        session.ts
        routes.ts
      env.ts
      server-env.ts

    providers/
      AppProviders.tsx
      AdminAuthProvider.tsx

    integrations/
      firebase.ts
      stripe.ts

    utils/
      date.ts
      format.ts
      globalFunction.ts

    types/
      api.ts
      auth.ts
      adminMenu.ts
```

Do not create every optional file on day one. Add `integrations`, `types`, route handlers, feature folders, and shared abstractions when actual requirements justify them.

## Folder Ownership Rules

### `src/app`

Keep only Next framework entrypoints and route-local composition:

```text
page.tsx
layout.tsx
loading.tsx
error.tsx
not-found.tsx
route.ts
metadata files
route groups
dynamic segments
```

Do not place large headers, sidebars, fetch wrappers, SDK initialization, cookie parsing, or duplicated business logic in route files.

### `src/layouts`

Own the visual shell:

```text
header
sidebar
footer
main content slot
mobile navigation state
sidebar collapse state
role-specific shell styling
```

Keep role shells separate when markup or behavior differs. Do not build one giant conditional layout for admin, citizen, guest, agent, and advertiser.

For the Accessimate admin shell pattern, keep `AdminLayout.tsx` as the small client owner of shell state:

```text
isSidebarExpanded        -> desktop 280px/68px sidebar and content offset
isMobileSidebarOpen      -> Headless UI mobile overlay open/close
isMobile                 -> synced from window.innerWidth < 768 inside effect
AdminSidebar props       -> expansion/mobile state and toggle callbacks
AdminHeader props        -> mobile open callback
children                 -> page slot only
```

Do not put auth API calls, menu API details, profile dropdown state, or recursive menu rendering directly in `AdminLayout.tsx`; pass state into the role-specific header/sidebar components.

### `src/components`

Own reusable UI. Split by visual/domain responsibility:

```text
AppHeader/*     role headers
Sidebar/*       role navigation
Auth/*          login/register forms
Input/*         reusable fields and errors
Button/*        reusable button primitives
Common/*        truly project-wide display components
```

Keep a one-page-only section local until reuse is real. Extract project-wide fields only when requested or used in multiple features.

### `src/hooks`

Own reusable client behavior requiring React:

```text
useState/useReducer
useEffect/useCallback/useMemo
useRouter/usePathname/useSearchParams
form submission state
client auth actions
interactive feature coordination
```

Do not put pure fetch mechanics, server secrets, or stateless formatters in hooks.

### `src/lib/api`

Own network mechanics and backend concern wrappers:

```text
base URL selection
method and body serialization
headers and bearer tokens
response parsing
typed errors
401/419 behavior
CMS refresh queue when implemented
```

### `src/lib/auth`

Own auth-related constants and session helpers:

```text
token/cookie names
Authorization/Bearer constants
server cookie creation/deletion
session verification
route ownership constants
browser cookie helpers only when the backend contract requires readable client tokens
```

### `src/providers`

Own app-wide React providers. Compose them through `AppProviders.tsx` and render the provider boundary as deep as practical inside the root layout.

When login, header, and logout need the same current user, create one role provider and consume it through a hook:

```text
src/app/layout.tsx
-> src/providers/AppProviders.tsx
-> src/providers/AdminAuthProvider.tsx
-> useAdminAuth()
```

Do not make `useAdminAuth()` a standalone local-state hook in both login and header; repeated hook calls would create separate state. The hook should read the provider context.

### `src/integrations`

Own third-party SDK initialization such as Firebase, Stripe, analytics, maps, or media libraries. Keep provider composition and SDK initialization separate.

### `src/utils`

Own pure helpers only. A utility must not depend on React state, router APIs, cookies, or hidden network behavior.

## Route And Render Flow

Use this exact conceptual order:

```text
browser request
-> Next route match
-> src/app/layout.tsx root Server Component
-> src/providers/AppProviders.tsx client provider boundary
-> matching route-group layout.tsx filewise role check
-> src/layouts/* real shell
-> page.tsx
-> child components
-> interactive Client Components hydrate
```

Do not insert a centralized Proxy/middleware step into this OrangeBD Next pattern. Each route-group server layout owns its matching role check, while React providers run inside the render tree.

The actual Accessimate baseline maps routes as follows:

```text
src/app/(guest)/login/page.tsx             -> /login
src/app/(guest)/admin-login/page.tsx       -> /admin-login
src/app/(guest)/registration/page.tsx      -> /registration
src/app/(guest)/forgot-password/page.tsx   -> /forgot-password
src/app/(admin)/admin-panel/page.tsx        -> /admin-panel
src/app/(citizen)/dashboard/page.tsx        -> /dashboard
```

Route-group folder names do not appear in the URL. A route becomes public only when a `page.tsx` or `route.ts` exposes it.

For dynamic routes, use `[id]`, `[slug]`, `[...segments]`, or `[[...segments]]`. In modern App Router code, inspect the installed version because `params` and `searchParams` typing/timing can change.

## Server And Client Component Boundaries

Keep these as Server Components by default:

```text
root layout
route group layout
page without interactivity
metadata generation
server data composition
route access checks using next/headers
static logos, navigation markup, and display components
```

Mark a file with `"use client"` when it needs:

```text
useState/useEffect/useCallback
event handlers such as onClick/onChange/onSubmit
browser APIs such as window/document/localStorage
useRouter/usePathname/useSearchParams
React context creation or consumption
client-only SDKs
custom client hooks
```

Put `"use client"` at the smallest useful boundary. Once a module is client-marked, its imported module graph can enter the client bundle. Never import server secrets or server-only modules from that graph.

Pass serializable props from Server Components to Client Components. Pass server-rendered content through `children` when a client shell needs interactive state around server content.

## Route Groups And Role Layouts

Use route groups to organize roles without changing URLs:

```text
(guest)   login/register/forgot routes
(admin)   admin-only routes
(citizen) citizen-only routes
(public)  normal public marketing routes
```

Keep route-group layouts thin. The Accessimate baseline uses this pattern:

```text
(admin)/layout.tsx
-> await cookies()
-> check ADMIN_TOKEN_COOKIE
-> redirect('/admin-login') when absent
-> render <AdminLayout>{children}</AdminLayout>
```

```text
(citizen)/layout.tsx
-> await cookies()
-> check CITIZEN_TOKEN_COOKIE
-> redirect('/') when absent
-> render <CitizenLayout>{children}</CitizenLayout>
```

```text
(guest)/layout.tsx
-> check admin token first
-> redirect admin to /admin-panel
-> otherwise check citizen token
-> redirect citizen to /dashboard
-> otherwise render GuestLayout
```

A cookie-presence check is optimistic routing, not secure authorization. Re-verify the session/token near protected data, Route Handlers, Server Actions, and backend endpoints.

## Authentication And Session Architecture

Use separate role tokens only when the backend contract genuinely separates sessions:

```text
XADM-TOKEN = admin session/token
XCTN-TOKEN = citizen session/token
XCMS-TOKEN = CMS machine/client token
```

Centralize names and header constants in `src/lib/auth/authConstants.ts`. Do not repeat cookie strings in hooks, layouts, API wrappers, or components.

Prefer production session cookies set on the server with:

```text
HttpOnly
Secure in HTTPS environments
SameSite=Lax or stricter as required
Path=/
explicit Max-Age or Expires
```

Do not copy the inspected `document.cookie` helper as the default for a production session. It exists as a migration-compatible baseline for a backend token flow. Client-readable cookies increase XSS exposure and cannot be `HttpOnly`.

When the frontend must call an external backend directly with a bearer token, decide explicitly between:

```text
1. Browser-readable token required by backend contract
   -> minimize lifetime and scope
   -> apply CSP and XSS controls
   -> keep token handling centralized

2. Recommended server-owned session/BFF flow
   -> login through a Route Handler or Server Action
   -> set HttpOnly cookie on the server
   -> call backend from server-side code
   -> return only required DTO data to the browser
```

Do not treat route layouts as the only authorization layer. Use a server-only session/DAL helper for secure checks near data.

### Shared Admin Provider Pattern

For the current Accessimate parity-first admin flow, keep the selected direct backend API and `XADM-TOKEN` flow centralized:

```text
AdminAuthProvider state:
  user
  isLoggedIn
  isHydrated
  loading
  isLoadingLogout
  error
  validationErrors

AdminAuthProvider actions:
  login(credentials)
  logout()
  getCurrentUser()
  clearError(field?)
```

Use this request order:

```text
initial provider mount
-> read ADMIN_TOKEN_COOKIE with browser cookie helper
-> if missing: set user=null, isHydrated=true, skip /admin/user
-> if present: POST /admin/user with Bearer token
-> success: store current user in provider
-> 400/401/419: clear cookie/user and router.replace('/admin-login')
-> other failure: surface normalized ApiRequestError message/validation data
```

Login must set the cookie only after a token exists, hydrate `/admin/user`, then navigate to `/admin-panel`. Logout should call `/admin/logout` when a token exists, but always clear local cookie/user in `finally` and navigate away.

The browser cookie helper for this migration flow must centralize attributes:

```text
Path=/
SameSite=Lax
Secure only when current protocol is HTTPS
```

Keep the security caveat visible: this is a parity path for a direct backend bearer-token contract, not the preferred long-term HttpOnly session/BFF design.

## API Client Architecture

Use one generic request layer and thin concern wrappers.

`request.ts` should own:

```text
URL joining
allowed HTTP methods
body types
JSON serialization
FormData and URLSearchParams passthrough
Accept header
Content-Type only for JSON bodies
Authorization: Bearer <token>
fetch execution
non-2xx error conversion
204 handling
JSON response parsing
```

Use a typed error such as:

```ts
class ApiRequestError extends Error {
  status: number
  data?: unknown
}
```

Thin wrappers select the correct base URL:

```text
fetchAdmin.ts   -> publicEnv.apiUrlAdmin
fetchCitizen.ts -> publicEnv.apiUrlCitizen
fetchCMS.ts     -> CMS backend base URL, currently citizen API in Accessimate
```

Call the concern wrapper from hooks/services, not raw `fetch` from UI components:

```text
component event
-> hook action
-> adminApi/citizenApi/cmsApi
-> apiRequest
-> backend
```

For production CMS requests, implement a single refresh queue:

```text
request receives 401
-> if refresh already running, queue retry
-> otherwise call server-only /api/cms-auth
-> update XCMS-TOKEN/app key
-> release queued requests
-> retry original request once
-> fail and clear invalid CMS state if refresh fails
```

Do not mark CMS integration complete while `fetchCMS.ts` is only a base URL wrapper without refresh behavior.

For direct admin backend calls, keep UI code off raw `fetch`:

```text
AdminLogin/AdminSidebar/AdminAuthProvider action
-> adminApi(path, options)
-> apiRequest(publicEnv.apiUrlAdmin, path, options)
-> Authorization: Bearer <XADM-TOKEN> only when token is passed
-> ApiRequestError for backend message, validation data, non-JSON errors, or network failure
```

## Environment Variables

Use Next's native `.env*` loading. Do not add `dotenv` or duplicate values in `next.config.ts` for normal application use.

Separate browser-safe and server-only variables:

```text
src/lib/env.ts
  NEXT_PUBLIC_SITE_URL
  NEXT_PUBLIC_API_URL_ADMIN
  NEXT_PUBLIC_API_URL_CITIZEN
  NEXT_PUBLIC_SCRIPT_URL
  NEXT_PUBLIC_FIREBASE_*
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  NEXT_PUBLIC_PAYPAL_CLIENT_ID

src/lib/server-env.ts
  CMS_EMAIL
  CMS_PASSWORD
  other private API keys/secrets
```

Only prefix a value with `NEXT_PUBLIC_` when it is safe to place in browser JavaScript. Public variables are inlined at build time and normally remain frozen for that build.

Reference public environment variables directly:

```ts
process.env.NEXT_PUBLIC_API_URL_ADMIN
```

Do not use dynamic lookup for browser variables:

```ts
process.env[name]
const env = process.env
env.NEXT_PUBLIC_API_URL_ADMIN
```

Keep `.env*` ignored. Provide a sanitized `.env.example` only when the repository policy allows tracking it; never commit real credentials.

## Providers And Third-Party Integrations

Use `src/providers/AppProviders.tsx` as the single composition point for React contexts:

```text
theme
query/cache client
auth context when client-global state is required
toast/response system
feature flags
```

Render it from `src/app/layout.tsx`:

```text
html
-> body
-> AppProviders
-> children
```

Keep providers as deep as practical. Do not make `<html>` or static root markup client-rendered just to support one context.

If Font Awesome class names come from the backend menu API, import the package CSS once from `src/app/layout.tsx`:

```text
@fortawesome/fontawesome-free/css/all.min.css
@fortawesome/fontawesome-free/css/v4-shims.min.css
```

Do not dynamically map every API icon into hand-written React icons unless the backend contract changes. The package CSS keeps old `fa`, `fas`, and newer `fa-solid` class names working during migration.

Initialize Firebase, Stripe, analytics, maps, and similar SDKs in `src/integrations`. Import them only from client boundaries when the SDK needs browser APIs. Guard repeated SDK initialization.

## Component, Hook, State, And Type Rules

Use these naming conventions:

```text
React components: PascalCase.tsx
hooks: useFeature.ts
API wrapper files: fetchAdmin.ts, fetchCitizen.ts, fetchCMS.ts
pure helpers: camelCase.ts
route folders: kebab-case
Next route files: page.tsx, layout.tsx, route.ts
types: PascalCase type/interface names
booleans: isLoading, isLoggedIn, isSidebarOpen, hasPermission
```

Use the configured alias for cross-folder imports:

```ts
import { citizenApi } from '@/lib/api/fetchCitizen'
```

Use relative imports for closely related files inside the same small module when clearer.

Choose state ownership carefully:

```text
input/form state used once -> component local state
reusable action loading/error -> hook
shell toggle state -> layout
cross-route client state -> provider/store
authenticated session truth -> server session/DAL/backend
server-fetched display data -> Server Component when practical
```

Calling the same custom hook from multiple components creates separate local hook instances unless the hook consumes shared context/store. Do not assume `useCitizenAuth()` in the header shares state with `useCitizenAuth()` in the login form.

For admin auth in the Accessimate Next pattern, `useAdminAuth()` must consume `AdminAuthProvider` so `AdminLogin`, `AdminHeader`, and logout share the same user/loading/error state.

Move shared API/auth response types into `src/types` once they are reused. Do not leave current-user responses as `unknown` after the backend response contract is known.

## Detailed Admin And Citizen Flows

### Admin Login

Use this action order:

```text
1. /admin-login matches (guest)/admin-login/page.tsx.
2. Guest route layout checks existing role cookies.
3. Page renders Auth/AdminLogin.tsx.
4. Client component owns login_id and password state.
5. Submit prevents default and calls useAdminAuth().login(credentials).
6. Hook clears prior error and sets loading=true.
7. Hook calls adminApi('/admin/login', POST body).
8. fetchAdmin selects admin base URL.
9. request.ts serializes JSON and sends headers.
10. Hook reads response.data.token.
11. Missing token becomes a visible auth error.
12. Successful token is stored through the chosen session strategy.
13. Hook calls POST /admin/user with Bearer token.
14. Hook stores current user and authenticated state.
15. Hook calls router.push('/admin-panel').
16. Admin route layout verifies optimistic session presence.
17. AdminLayout renders header, sidebar, and page slot.
18. Secure backend/DAL checks still protect admin data/actions.
19. finally sets loading=false.
```

Map API validation errors to field/general errors instead of displaying only a generic status message.

### Citizen Login

Use this action order:

```text
1. /login matches (guest)/login/page.tsx.
2. Page renders Auth/CitizenLogin.tsx inside GuestAuthLayout.
3. Component owns login_id/password and links to forgot/register routes.
4. Submit calls useCitizenAuth().login(credentials).
5. Hook sets error=null and loading=true.
6. citizenApi POSTs /customer/login.
7. Hook validates response.data.token.
8. Session strategy stores the citizen token/session.
9. hydrateUser(token) POSTs /customer/user.
10. Hook stores current user and isLoggedIn=true.
11. router.push('/dashboard') navigates internally.
12. Citizen route layout applies optimistic access check.
13. CitizenLayout renders header/sidebar/main.
14. finally sets loading=false.
```

### Citizen SSO

Keep provider SDK work in `src/integrations/firebase.ts` and pass only the provider ID token into the auth hook:

```text
SSO button
-> Firebase provider popup/redirect
-> receive idToken
-> useCitizenAuth().ssoLogin({ idToken })
-> POST /customer/sso-login
-> store session
-> hydrate current user
-> router.push('/dashboard')
```

Handle popup cancellation, provider errors, missing ID token, backend rejection, and loading reset.

### Current User Hydration

Use this order:

```text
read matching role session
-> if absent, set unauthenticated and skip API
-> call role current-user endpoint
-> set user and logged-in state
-> on 400/401/419 clear invalid local session
-> on other errors preserve diagnostics and surface failure
-> always clear loading
```

For a scalable app, centralize current-user hydration in a provider/store or server session flow. Do not trigger duplicate current-user calls from every component.

### Logout

Use `finally` for local cleanup:

```text
read token/session
-> call backend logout when token exists
-> regardless of network result, clear local invalid session
-> clear user/auth/error state
-> router.push('/')
```

Decide whether a backend logout failure should be logged or shown, but do not leave the browser stuck in an apparently authenticated state with an invalid session.

### Admin Shell And Dynamic Menu

Use this admin route/render flow:

```text
/admin-panel request
-> src/app/layout.tsx root layout imports global CSS, Font Awesome CSS, and AppProviders
-> AppProviders mounts AdminAuthProvider for shared client admin state
-> src/app/(admin)/layout.tsx reads ADMIN_TOKEN_COOKIE server-side
-> missing cookie redirects to /admin-login
-> present cookie renders src/layouts/AdminLayout.tsx
-> AdminLayout owns shell responsive state
-> AdminSidebar loads backend menu and renders recursive navigation
-> AdminHeader reads shared admin user and renders profile/theme/logout
-> page.tsx renders in the main slot
```

Use this admin menu request flow:

```text
AdminSidebar mount
-> getCookie(ADMIN_TOKEN_COOKIE)
-> if missing, skip menu request
-> POST admin/tree-entity/main-menu through adminApi
-> Authorization: Bearer <admin token>
-> response.data array becomes menuList
-> ApiRequestError.message becomes sidebar error text
-> loading shows sidebar skeleton
-> empty array shows "No menu items found"
```

Keep admin menu types in `src/types/adminMenu.ts`:

```ts
type AdminMenuItem = {
  id?: number | string
  name?: string
  route?: string
  icon?: string
  child?: AdminMenuItem[]
  is_open?: boolean
}
```

Keep recursive menu behavior split:

```text
Sidebar/Admin/index.tsx
  fetch menu
  own loading/error/menuList/openKeys
  pass current menu item into RecursiveMenuItem
  use Headless UI Dialog for mobile overlay

Sidebar/Admin/RecursiveMenuItem.tsx
  normalize href
  render Font Awesome icon class from API
  render Link for leaf route
  render button for parent-only item
  recursively render child items
  show nested active state
  show collapsed tooltip/flyout

Sidebar/Admin/menuUtils.ts
  get stable menu key
  normalize route path matching
  detect active descendants
  collect active parent keys
```

Responsive admin shell requirements:

```text
desktop expanded width: 280px
desktop collapsed width: 68px
desktop content offset follows sidebar width
mobile breakpoint: below md / 768px
mobile sidebar: Headless UI Dialog overlay at 280px
collapsed desktop parent menu: flyout panel positioned beside 68px rail
internal routes: next/link only
```

Header requirements:

```text
useAdminAuth() provides user/logout/isLoadingLogout
profile name from user_info first/middle/last name, fallback "Admin User"
email fallback "admin"
Headless UI Menu handles accessible dropdown behavior
logout button calls shared logout()
mobile hamburger opens AdminLayout mobile sidebar state
```

Theme toggle requirements:

```text
Headless UI Switch
localStorage key for admin theme
document.documentElement.classList toggles "dark"
fallback to prefers-color-scheme when no stored value exists
Tailwind dark variant must match html.dark
```

For accessible interactive shell pieces, prefer Headless UI React primitives:

```text
Dialog       -> mobile sidebar overlay
Menu         -> admin profile dropdown
Switch       -> theme toggle
```

Do not add a centralized `proxy.ts` or `middleware.ts` for this shell. The route-group `layout.tsx` remains the filewise guard, and the shell components handle only UI/state/API loading.

## Route Handlers, Server Actions, And Filewise Guards

Use `src/app/api/**/route.ts` for server endpoints such as CMS machine login, webhooks, secret-bearing backend calls, or a frontend BFF boundary.

Use Server Actions for mutations tightly coupled to a rendered form when they fit the existing architecture. Re-check authorization inside every action; route-layout coverage is not sufficient.

Keep route checks filewise in the matching route-group layout:

```text
src/app/(guest)/layout.tsx   -> guest-only admin/citizen redirect decisions
src/app/(admin)/layout.tsx   -> admin cookie/session presence and admin-login redirect
src/app/(citizen)/layout.tsx -> citizen cookie/session presence and public/login redirect
```

Do not create `src/proxy.ts`, `middleware.ts`, or another centralized route guard for this pattern unless the user explicitly changes the architecture. Keep each role decision beside the files it protects so future developers can trace access from route group to layout to page.

Do not call backend current-user, database, or permission APIs from every layout merely to render a shell. Use the route layout for the lightweight redirect gate and enforce secure authorization near protected data/actions.

## Loading, Error, Validation, And Navigation

Every async action must handle:

```text
initial state
loading state
success state
validation failure
authentication failure
network/server failure
finally cleanup
```

Use route-level `loading.tsx` for streamed route loading. Use component skeletons/spinners for local actions. Preserve layout stability with reserved error/loading space where helpful.

Use `router.push` or `router.replace` for internal navigation after state/session updates. Use `Link` for internal navigation markup. Use a full browser navigation only for an external URL or intentional full reload.

Use `error.tsx` for route-segment render failures and user-facing recovery. Log enough context for developers without exposing secrets or raw backend stack traces.

Validate forms before requests and map backend 422-style validation data to fields. Disable duplicate submits while loading.

For admin menu and shell actions, keep loading/error branches visible:

```text
AdminAuthProvider loading -> form/button/header logout state
AdminSidebar loading      -> skeleton list
AdminSidebar error        -> compact sidebar error when expanded
AdminSidebar empty        -> compact empty-state text when expanded
Recursive menu parent     -> aria-expanded on buttons
Profile dropdown/logout   -> disabled state while logout is running
Theme toggle              -> aria-label and title from current mode
```

## UI And Asset Rules

Use `next/image` for project images when optimization is appropriate and `next/link` for internal links. Store static assets under `public` and reference them from `/images/...`.

Keep global CSS for Tailwind import, root theme variables, fonts, and truly global overrides. Use CSS Modules for component-specific animations or selectors that are awkward in utilities.

Respect `prefers-reduced-motion` for animated login/marketing UI.

Keep responsive role shells usable across mobile, tablet, and desktop. Test sidebar/header behavior, overflow, focus states, and keyboard navigation.

For the Accessimate admin shell, match the Nuxt visual behavior while using React/Next primitives:

```text
Headless UI for accessible overlay/dropdown/switch behavior
Tailwind utilities for custom shell styling
Font Awesome CSS for backend-provided icon class names
next/link for internal admin navigation
no raw <a href> for internal menu routes unless an external URL is intentional
```

## Testing And QA

Inspect `package.json` and run available scripts. For the Accessimate baseline use:

```text
TypeScript: npx tsc --noEmit
Lint:       npm run lint
Build:      npm run build
Dev:        npm run dev
```

Verify route behavior:

```text
guest without token can open login/register/forgot
admin token redirects guest routes to /admin-panel
citizen token redirects guest routes to /dashboard
missing admin token redirects protected admin route
missing citizen token redirects protected citizen route
invalid/expired token is rejected near data and cleared
```

Verify API behavior:

```text
correct base URL per role
method/body/header mapping
JSON vs FormData behavior
Bearer token behavior
204 response
non-JSON error response
400/401/419 cleanup
422 field validation
500/network failure
CMS refresh concurrency when implemented
```

Verify environment safety:

```text
.env loaded from the project root
required values present without printing secrets
CMS/private values have no NEXT_PUBLIC_ prefix
private values are absent from client bundles
public values use direct process.env.NEXT_PUBLIC_* access
```

For UI changes, test at least two meaningful viewport widths and check the browser console. Authenticated browser tests require non-production test credentials.

Admin shell QA checklist:

```text
desktop expanded sidebar is 280px and content offset matches
desktop collapsed sidebar is 68px and content offset matches
collapsed parent item opens usable flyout
nested active route opens parent chain
mobile hamburger opens Headless UI Dialog overlay
mobile close/backdrop/link click closes overlay
POST admin/tree-entity/main-menu runs only when admin cookie exists
profile dropdown shows hydrated admin info
logout clears cookie/user and redirects
theme toggle persists and toggles html.dark
keyboard focus is visible on menu/dialog/switch controls
browser console has no new relevant errors
```

## New Project Build Order

Build a new OrangeBD Next project in this order:

```text
1. Confirm Next version, App Router, TypeScript, lint, Tailwind, and scripts.
2. Create root layout, global CSS, metadata, and public asset conventions.
3. Create role route groups and small page/layout entrypoints.
4. Create role shell components under src/layouts.
5. Create headers, sidebars, buttons, inputs, loaders, and error UI.
6. Define env.ts and server-env.ts with strict public/private separation.
7. Define auth constants and choose the production session strategy.
8. Build request.ts with typed request options and errors.
9. Add thin admin/citizen/CMS API wrappers.
10. Add shared role auth providers when header/login/logout need common state.
11. Add login/current-user/logout hooks or server actions.
12. Add AppProviders only for actual shared client state.
13. Build role shell components: layout state first, then header/sidebar internals.
14. Add dynamic admin menu with recursive rendering only after backend endpoint shape is known.
15. Add Firebase/Stripe/etc. under integrations when needed.
16. Add filewise guest/admin/citizen guards in their matching route-group layouts.
17. Add secure authorization near data and backend actions.
18. Add loading/error/not-found states and form validation.
19. Run typecheck, lint, build, route checks, API checks, and browser QA.
```

## Anti-Patterns

Do not:

```text
put full application logic in page.tsx
mark the root layout client-side for one interactive child
assume route-group names appear in URLs
introduce centralized Proxy/middleware when the project uses filewise route-group guards
put admin, citizen, and guest redirect branches into one unrelated role layout
use a route-layout cookie check as the only authorization layer
write production session cookies with plain document.cookie by default
expose CMS credentials with NEXT_PUBLIC_
use dynamic process.env lookup for public browser variables
spread raw fetch/token logic across components
assume repeated hook calls share state
duplicate admin user state separately in login and header
fetch admin menu before the admin cookie/token exists
hardcode a migrated admin menu when the backend `admin/tree-entity/main-menu` endpoint is available
mix admin shell state into route-group guard layouts
use window.location for normal internal navigation
put SDK initialization inside providers or page components
put network calls in pure utils
copy placeholder pages or default metadata into production
mark CMS auth complete without refresh/failure behavior
ship auth flows without credentials-based browser QA when credentials exist
```

## Compact Flow Diagrams

Route/render:

```text
Request
-> root layout (server)
-> AppProviders (client boundary)
-> matching route-group layout (filewise server access check)
-> role layout shell
-> page
-> reusable components
-> interactive client hydration
```

Client API action:

```text
User event
-> Client Component
-> hook action
-> role API wrapper
-> request.ts
-> backend
-> typed response/error
-> state/session update
-> router navigation or UI feedback
```

Secure server action:

```text
Form/Client Component
-> Server Action or Route Handler
-> server-only session verification
-> authorization near data
-> backend/database mutation
-> safe DTO/response
-> revalidate/redirect/UI update
```
