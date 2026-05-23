# Common OrangeBD Frontend Patterns

Use this reference for architecture, folder structure, naming, UI structure, small conventions, reusable components, and future project defaults.

## Core Mental Model

```text
Page owns workflow state.
Layout owns shell.
Component owns reusable UI.
Composable owns reusable state/action logic.
Utils own API/fetch/helper logic.
Middleware owns route protection.
Backend owns pagination/search/filter/sort for production lists.
```

## Project Roots Used To Derive This Pattern

```text
D:\Orangebd\CPIS
D:\Orangebd\Accessimate_Nuxt-Next\accesimate-fontend
D:\Orangebd\HeyHomex\heyhomex_frontend
```

## Stack Families

CPIS:

```text
Vue 3 + Vite + Vue Router + Pinia + Tailwind + lucide-vue-next
```

Accessimate / HeyHomex:

```text
Nuxt + Vue 3 + Tailwind + PrimeVue + FontAwesome/PrimeIcons/Heroicons + Nuxt auto-imports
```

## Folder Structure Defaults

Nuxt:

```text
components/
  AppHeader/
  AppFooter/
  Sidebar/
  Input/
  Button/
  Loader/
  Common/
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

Vue/Vite:

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

## Layout Pattern

Layout owns shell:

```text
Header
Sidebar
Footer
mobile menu state
sidebar collapse state
slot/page outlet
```

Nuxt pages declare layout:

```ts
definePageMeta({ middleware: ['auth-admin'], layout: 'admin' })
```

CPIS uses route meta and dynamic layout:

```vue
<component :is="currentLayout">
  <RouterView />
</component>
```

## Role-Specific Shell Pattern

Use separate files when roles have different shells:

```text
AppHeader/Admin.vue
AppHeader/Citizen.vue
AppHeader/Guest.vue
AppHeader/Agent.vue
AppHeader/Advertiser.vue
Sidebar/Admin/index.vue
Sidebar/Citizen.vue
Sidebar/Agent.vue
layouts/admin.vue
layouts/citizen.vue
layouts/agent.vue
layouts/advertiser.vue
layouts/guest.vue
```

Do not create one giant header/sidebar with many role branches if each role has a different UI.

## Common Component Names

```text
Input/Text.vue
Input/Label.vue
Input/Error.vue
Button/Primary.vue
Button/Secondary.vue
Button/Danger.vue
Loader/DataFetch.vue
Pagination.vue
ConfirmModal.vue
ResponseModal.vue
LoadingLine.vue
PhotoBlock/*
```

## Common State Names

Use these names for consistency:

```ts
const data = ref([])
const item = ref({})
const formData = ref({})
const search = ref('')
const status = ref(optionsList[0])
const isLoading = ref(false)
const isLoadingLogout = ref(false)
const isOpenModal = ref(false)
const isOpenConModal = ref(false)
const modalTitle = ref('')
const deleteId = ref(null)
const response_modal = ref({})
const validations_errors = ref({})
const skip_validations = ref(['id', 'status'])
const permissions = ref({})
const paginationConfig = ref({ data: [], lang: 'en', align: 'center', action: '' })
```

Boolean naming:

```text
isLoading
isOpen
isSidebarOpen
isMobileMenuOpen
isAdminLoggedIn
isCitizenLoggedIn
hasOverflowItems
showingNavigationDropdown
```

## Event Naming

Common emits:

```text
toggle-sidebar
toggle-mobile-menu
close-menu
close
confirm
add_emit
update:modelValue
update:isOpenConModal
loadData
```

Use `update:*` for v-model style events. Use kebab-case for UI events.

## Input Pattern

Reusable inputs must support `v-model`:

```ts
defineProps({
  modelValue: { type: String, required: true },
})

defineEmits(['update:modelValue'])
```

```vue
<input
  :value="modelValue"
  @input="$emit('update:modelValue', $event.target.value)"
/>
```

Expose focus when needed:

```ts
defineExpose({ focus: () => input.value.focus() })
```

## Modal Patterns

Confirm modal:

```vue
<LazyConfirmModal
  :isOpenConModal="isOpenConModal"
  @confirm="deleteHandler"
  @update:isOpenConModal="isOpenConModal = $event"
/>
```

AddEdit modal:

```vue
<AddEdit
  :isOpenModal="isOpenModal"
  :item="item"
  :modalTitle="modalTitle"
  :data="data"
  @close="cancelModal"
  @add_emit="receivedData"
/>
```

Response modal:

```ts
response_modal.value = {
  status: true,
  message: 'Saved successfully',
}
```

## Icon Pattern

Common icon sources:

```text
CPIS: lucide-vue-next
Accessimate: FontAwesome, PrimeIcons, Heroicons
HeyHomex: FontAwesome, PrimeIcons, Heroicons, Nuxt Icon/lucide
```

Common action icons:

```html
<i class="fa-solid fa-pen-to-square"></i>
<i class="fa-solid fa-trash"></i>
<i class="fa-solid fa-trash-restore"></i>
<i class="fa fa-power-off"></i>
<i class="pi pi-check-circle"></i>
<Icon name="lucide:search" class="w-4 h-4" />
```

## Table Action Pattern

```vue
<td v-if="permissions.edit || permissions.delete">
  <div v-if="status.key == 'trashed' && permissions.delete">
    <i class="fa-solid fa-trash-restore text-green-500" @click="restoreHandler(item.id)" />
  </div>
  <div v-else>
    <i v-if="permissions.edit" class="fa-solid fa-pen-to-square" @click="editHandler(item)" />
    <i v-if="permissions.delete" class="fa-solid fa-trash text-red-500" @click="openDeleteModal(item.id)" />
  </div>
</td>
```

## Search and Filter Pattern

```vue
<InputText v-model="search" @input="loadData" @keyup.enter="loadData" />

<Select
  v-model="status"
  :options="optionsList"
  optionLabel="name"
  @change="onChangeHandler"
/>
```

Status filter options:

```ts
[
  { name: 'All', value: '', key: '' },
  { name: 'Active', value: '1', key: 'status' },
  { name: 'Inactive', value: '0', key: 'status' },
  { name: 'Trashed', value: 'only', key: 'trashed' },
]
```

Request mapping:

```ts
status: status.value.key == 'status' ? status.value.value : '',
trashed: status.value.key == 'trashed' ? 'only' : '',
```

## Loading and Empty State Pattern

```vue
<Skeleton v-if="isLoading" width="8rem" height="2.5rem" />
<ProgressSpinner v-if="isLoading" />
<LazyLoaderDataFetch v-if="pending" />
```

Empty table:

```vue
<tr v-if="!isLoading && data.length === 0">
  <td colspan="100%" class="py-6 text-center text-gray-500">No data found</td>
</tr>
```

## Mobile Menu Pattern

```ts
const isMobileMenuOpen = ref(false)
const toggleMobileMenu = () => { isMobileMenuOpen.value = !isMobileMenuOpen.value }
const closeMobileMenu = () => { isMobileMenuOpen.value = false }

onMounted(() => {
  const handleResize = () => {
    if (window.innerWidth >= 1024) isMobileMenuOpen.value = false
  }
  window.addEventListener('resize', handleResize)
  onUnmounted(() => window.removeEventListener('resize', handleResize))
})
```

## Sidebar Collapse Pattern

```ts
const hamburger_button = useState('hamburger_button', () => true)
```

```vue
<div :class="hamburger_button ? 'ml-0 md:ml-[250px]' : 'ml-0 md:ml-[70px]'">
```

## Nuxt Lazy and Async Components

Use `Lazy` for optional/heavy components:

```vue
<LazyPagination />
<LazyConfirmModal />
<LazyResponseModal />
<LazyInputError />
```

Use async component for module-local modal:

```ts
const AddEdit = defineAsyncComponent(() => import('./components/AddEdit.vue'))
```

## Styling Pattern

Use Tailwind utilities first. Use global CSS only for:

```text
font-face
body font/background
scrollbar
PrimeVue/library overrides
shared table/dialog/accordion overrides
```

Use scoped CSS for component-specific animation/modal style.

## Constants and Static Data

For API-not-ready pages, local/static data is allowed if API-like:

```ts
const summaryCards = [...]
const tableData = [...]
const statusOptions = [...]
```

Move repeated static data to `constants`.

## Composable Rules

Create composables for repeated reactive logic:

```text
useSidebar
useDashboardFilters
useAppKey
adminAuth
citizenAuth
useVideoPlayer
useHlsPlayerAds
```

Pure helper -> `utils`. Reactive state/actions -> `composables`.
