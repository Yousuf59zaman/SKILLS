# Admin CRUD and Pagination Pattern

Use this reference for admin list pages, tables, filters, AddEdit modals, validation, delete/restore, permissions, response modal, and pagination.

## Standard File Structure

```text
pages/admin-panel/{module}/index.vue
pages/admin-panel/{module}/components/AddEdit.vue
```

Examples:

```text
pages/admin-panel/years/index.vue
pages/admin-panel/years/components/AddEdit.vue
pages/admin-panel/country/index.vue
pages/admin-panel/country/components/AddEdit.vue
pages/admin-panel/news/index.vue
pages/admin-panel/news/components/AddEdit.vue
```

## List Page Responsibilities

`index.vue` owns:

```text
definePageMeta
route/query
search/status filters
paginationConfig
isLoading
data rows
permissions
loadData
open create/edit modal
receive saved data
open delete confirm
delete/restore handlers
response_modal
table render
loading skeleton
empty state
pagination render
```

## List Page Skeleton

```vue
<script setup>
const AddEdit = defineAsyncComponent(() => import('./components/AddEdit.vue'))
definePageMeta({ middleware: ['auth-admin'], layout: 'admin' })

const { $optionsList } = useNuxtApp()
const optionsList = $optionsList()
const route = useRoute()

const status = ref(optionsList[0])
const search = ref('')
const paginationConfig = ref({ data: [], lang: 'en', align: 'center', action: '' })
const isLoading = ref(false)
const data = ref([])
const permissions = ref({})

const loadData = async () => {
  isLoading.value = true
  permissions.value = {}
  try {
    const getData = await $fetchAdmin('admin/years/all', {
      method: 'POST',
      body: {
        paginate: true,
        page: route.query.page ? route.query.page : 1,
        length: 10,
        search: search.value,
        status: status.value.key == 'status' ? status.value.value : '',
        trashed: status.value.key == 'trashed' ? 'only' : '',
      },
    })

    data.value = getData.data.data
    permissions.value = getData.data.permissions
    paginationConfig.value.data = getData.data.meta
  } catch (e) {
    console.log('Get Message', e.message)
  } finally {
    isLoading.value = false
  }
}

onMounted(loadData)
watch(() => route.query, () => loadData())
</script>
```

## Pagination Rules

Use route query for page:

```ts
page: route.query.page ? route.query.page : 1
```

Reset page on filter change:

```ts
const resetPagination = () => {
  const query = { ...route.query }
  delete query.page
  navigateTo({ query }, { replace: true })
}

const onChangeHandler = () => {
  loadData()
  resetPagination()
}
```

Required meta:

```ts
{
  current_page: 1,
  last_page: 5,
  from: 1,
  to: 10,
  total: 50,
}
```

Usage:

```vue
<LazyPagination v-if="!isLoading" class="px-4" :config="paginationConfig" />
```

Rules:

- Backend must return pagination meta.
- Do not pass raw rows as pagination data.
- Do not call frontend-only slicing production pagination.

## Permission Rules

Backend response:

```ts
permissions.value = getData.data.permissions
```

Template:

```vue
<Button v-if="permissions?.add" label="Create" @click="addNew" />
<i v-if="permissions.edit" @click="editHandler(item)" />
<i v-if="permissions.delete" @click="openDeleteModal(item.id)" />
```

Rules:

- Do not hardcode permissions in frontend.
- UI only renders actions based on backend permission object.

## Add/Edit Modal State

```ts
const isOpenModal = ref(false)
const item = ref({})
const modalTitle = ref('')

const editHandler = (i) => {
  modalTitle.value = 'Edit'
  isOpenModal.value = true
  item.value = i
}

const addNew = () => {
  item.value = {}
  modalTitle.value = 'Create'
  isOpenModal.value = true
}

const receivedData = (d) => {
  isOpenModal.value = false
  modalTitle.value == 'Create'
    ? data.value.push(d)
    : data.value = data.value.map((item) => item.id == d.id ? d : item)
}

const cancelModal = () => {
  item.value = {}
  isOpenModal.value = false
}
```

Usage:

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

## AddEdit Responsibilities

`AddEdit.vue` owns:

```text
props for open/item/modalTitle/data
local formData
watch item prop for edit
validation errors
create/update API call
submit loading
backend 422 mapping
emit close
emit saved row
```

Validation:

```ts
const validations_errors = ref({})
const skip_validations = ref(['id', 'status'])
const isLoading = ref(false)
const response_modal = ref({})
```

```ts
validations_errors.value = {}
Object.keys(formData.value).forEach((field) => {
  if (!skip_validations.value.includes(field) && !formData.value[field]) {
    validations_errors.value[field] = `${field.replaceAll('_', ' ')} is required`
  }
})
if (Object.keys(validations_errors.value).length > 0) return
```

## Delete and Restore Pattern

```ts
const isOpenConModal = ref(false)
const response_modal = ref({})
const deleteId = ref(null)

const openDeleteModal = (id) => {
  deleteId.value = id
  isOpenConModal.value = true
}

const deleteHandler = async () => {
  response_modal.value = {}
  try {
    const getData = await $fetchAdmin(`admin/years/${deleteId.value}`, {
      method: 'DELETE',
    })
    if (getData.status == true) {
      response_modal.value = getData
      data.value = data.value.filter(item => item.id !== deleteId.value)
    }
  } catch (e) {
    if (e.response?.status === 404 || e.response?.status === 409) {
      response_modal.value = e.response._data
    }
  } finally {
    isOpenConModal.value = false
  }
}

const restoreHandler = async (id) => {
  response_modal.value = {}
  try {
    const getData = await $fetchAdmin(`admin/years/restore/${id}`, {
      method: 'POST',
    })
    if (getData.status == true) {
      response_modal.value = getData
      data.value = data.value.filter(item => item.id !== id)
    }
  } finally {
    isOpenConModal.value = false
  }
}
```

Rules:

- Delete requires confirmation modal.
- Delete success removes row.
- Trashed filter shows restore action.
- 404/409 goes to `ResponseModal`.

## Table UI Pattern

```vue
<div class="mt-4 border border-gray-200 rounded-lg bg-white dark:bg-gray-800">
  <div class="border-b border-gray-200">
    <h4 class="text-lg font-semibold text-gray-800 dark:text-gray-200 py-2 px-4">
      Module Title
    </h4>
  </div>
  <div class="p-4">
    <div class="custom_table overflow-auto border-b border-gray-200">
      <table class="table table-auto">
        <thead class="sticky z-10 top-0">...</thead>
        <tbody v-if="isLoading">...</tbody>
        <tbody v-else-if="data.length">...</tbody>
        <tbody v-else>empty state</tbody>
      </table>
    </div>
  </div>
</div>
```

## Error Rules

```text
422 -> validations_errors
404/409 -> response_modal
500 -> fetch wrapper logs; show generic response modal
network/no response -> response_modal with generic failure
```

Never silently swallow API errors in production flows.
