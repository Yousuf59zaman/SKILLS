---
name: Laravel Vue Pagination Standard
description: Implement server-driven pagination using Laravel's meta.links and Vue
---

# Laravel Vue Pagination Standard

This skill guides the refactoring of a Vue frontend to use "Server-Driven" pagination provided by a Laravel API.

## 🎯 Objective

Replace complex client-side pagination logic (calculating page numbers, ellipses) with a "dumb" component that blindly renders the `links` array provided by Laravel's `meta` object.

## 📋 Prerequisites

The Laravel API response must be wrapped in a resource or returning a paginated response that includes a `meta` object with a `links` array:

```json
{
  "data": [...],
  "meta": {
    "current_page": 1,
    "links": [
       { "url": null, "label": "&laquo; Previous", "active": false },
       { "url": "...?page=1", "label": "1", "active": true },
       ...
    ]
  }
}
```

## 🛠️ Implementation Steps

### 1. The Pagination Component

Ensure your `Pagination.vue` (or equivalent) does **not** calculate pages. It should iterate over `config.data.links`.

**Key Template Logic:**

```html
<template v-for="(link, index) in config.data.links">
  <button
    @click="changePage(link.url)"
    :class="{ 'active': link.active, 'disabled': !link.url }"
    v-html="link.label"
  ></button>
</template>
```

**Key Script Logic:**

```javascript
const changePage = (url) => {
  if (!url) return;
  const page = url.split("page=")[1]; // Simple extraction
  navigateTo({ query: { ...route.query, page: page } });
};
```

### 2. The Parent Component (Page)

**Step A: Configuration**
Define a simplified config object.

```javascript
const paginationConfig = ref({
  data: {}, // Will hold the 'meta' object
  align: "center",
});
```

**Step B: Fetching Data**
When loading data, pass the **entire meta object** to the config. Standardize on the query parameter `page`.

```javascript
const loadData = async () => {
  const params = {
    page: route.query.page || 1, // Standardize on 'page'
    limit: 9,
  };

  const response = await $fetch("/api/resource", { params });

  // Assign the meta object containing 'links'
  // Note: Verify if 'meta' is nested or at the root depending on your API resource wrapping
  paginationConfig.value.data = response.data.meta || response.data;
};
```

**Step C: Watcher**
Watch the standard `page` parameter to reload data.

```javascript
watch(
  () => route.query.page,
  () => loadData(),
);
```

## ⚠️ Common Pitfalls

1.  **Query Parameter Names**: Avoid custom names like `videoPage` unless absolutely necessary (e.g., multiple lists on one page). Standardize on `page`.
2.  **API Structure**: Some Laravel Resources put `meta` inside `response.data.meta`, others merge it into `response.data`. Always console log or inspect the API response to check where `links` resides.
3.  **Route Replacement**: When switching tabs or filters, ensure you reset the `page` to 1.
