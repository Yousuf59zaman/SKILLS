---
name: vue-data-debugger
description: Add debug view to any Vue page showing script-level data (refs, state, API responses) and inline data mapping for template elements. Use when asked to debug, inspect data flow, or understand how data maps to UI in a Vue file.
---

# Vue Data Debugger

Add comprehensive debug visualization to any Vue/Nuxt page to understand data flow from script to template.

## User-Invocable

Invoke this skill by typing `/vue-data-debugger` or by asking to "debug data flow" or "show data mapping" for a Vue file.

## Instructions

### Step 1: Get the Target File

Ask the user for the Vue file to debug:

```
Please provide the Vue file path or page URL you want to debug.
Examples:
- File path: D:\Project\app\pages\search.vue
- URL: http://localhost:3000/kamaina/search (I'll find the corresponding file)
```

### Step 2: Analyze the Script Section

Read the Vue file and identify all reactive data:

1. **Refs**: `const xxx = ref(...)`
2. **Reactive objects**: `const xxx = reactive(...)`
3. **Computed properties**: `const xxx = computed(...)`
4. **API calls**: Look for `$fetch`, `useFetch`, `$fetchCitizen`, etc.
5. **Store state**: Pinia stores, composables
6. **Route data**: `route.query`, `route.params`

### Step 3: Add Debug Instrumentation

#### A. Add rawApiResponse ref (if API calls exist)
Add a ref to capture raw API responses:
```javascript
const rawApiResponse = ref(null); // DEBUG: Store raw API response
```

#### B. Store raw response before processing
Before any `.map()` or data transformation:
```javascript
rawApiResponse.value = response.data; // DEBUG: Store raw response
```

### Step 4: Add Script-Level Debug Section at Top of Template

Add this section at the VERY TOP of the `<template>`:

```vue
<!-- ═══════════════════════════════════════════════════════════════════════════ -->
<!-- 🔧 DEBUG SECTION: SCRIPT-LEVEL DATA (All refs, state, computed values)      -->
<!-- ═══════════════════════════════════════════════════════════════════════════ -->
<div v-if="[CONDITION]" class="bg-slate-900 text-white p-6 mb-6 rounded-xl border-4 border-yellow-400">
    <h2 class="text-2xl font-bold text-yellow-400 mb-4">📜 SCRIPT DATA (from &lt;script setup&gt;)</h2>
    <p class="text-gray-300 mb-4">These are all the reactive variables defined in the script section:</p>
    
    <!-- State Variables Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <!-- Left Column: Simple State -->
        <div class="bg-slate-800 p-4 rounded-lg">
            <h3 class="text-lg font-bold text-green-400 mb-3">📌 Simple State Variables</h3>
            <div class="space-y-3">
                <!-- Add each ref/reactive here -->
                <div class="bg-slate-700 p-2 rounded">
                    <p class="text-xs text-gray-400">[varName] (ref)</p>
                    <pre class="text-sm text-green-300">[varName] = {{ [varName] }}</pre>
                </div>
            </div>
        </div>
        
        <!-- Right Column: Complex Objects -->
        <div class="bg-slate-800 p-4 rounded-lg">
            <h3 class="text-lg font-bold text-cyan-400 mb-3">📄 Complex Objects</h3>
            <pre class="text-xs text-cyan-300 whitespace-pre-wrap overflow-auto max-h-[300px] bg-slate-700 p-2 rounded">{{ JSON.stringify([objectName], null, 2) }}</pre>
        </div>
    </div>
    
    <!-- Raw API Response -->
    <div class="bg-slate-800 p-4 rounded-lg mb-6">
        <h3 class="text-lg font-bold text-orange-400 mb-3">📦 Raw API Response</h3>
        <p class="text-xs text-gray-400 mb-2">From: [API_ENDPOINT]</p>
        <pre class="text-xs text-orange-300 whitespace-pre-wrap overflow-auto max-h-[400px] bg-slate-700 p-3 rounded">{{ JSON.stringify(rawApiResponse, null, 2) }}</pre>
    </div>
    
    <!-- Processed Data Array -->
    <div class="bg-slate-800 p-4 rounded-lg">
        <h3 class="text-lg font-bold text-purple-400 mb-3">🎬 Processed Data Array</h3>
        <div class="bg-slate-700 p-3 rounded mb-3">
            <p class="text-xs text-gray-300 mb-2">Transform Logic:</p>
            <pre class="text-xs text-yellow-200 whitespace-pre-wrap">[PASTE_TRANSFORM_CODE_HERE]</pre>
        </div>
        <pre class="text-xs text-purple-300 whitespace-pre-wrap overflow-auto max-h-[400px] bg-slate-700 p-3 rounded">{{ JSON.stringify([dataArray], null, 2) }}</pre>
    </div>
</div>
<!-- END DEBUG SECTION -->
```

### Step 5: Add Inline Data to Template Elements

For each data-bound element (v-for loops, cards, etc.), wrap with debug info:

```vue
<div v-for="(item, index) in items" :key="item.id" class="bg-white rounded-lg shadow-lg overflow-hidden">
    
    <!-- Card Header: Full Object -->
    <div class="bg-blue-900 text-white p-2">
        <p class="text-sm font-bold">Item #{{ index + 1 }} - Full Object:</p>
        <pre class="text-xs text-blue-200 whitespace-pre-wrap overflow-auto max-h-[150px]">{{ JSON.stringify(item, null, 2) }}</pre>
    </div>

    <!-- For each property, add a colored box showing the mapping -->
    <div class="p-3 space-y-2">
        <!-- Property Box Template -->
        <div class="bg-[COLOR]-100 p-2 rounded">
            <p class="text-xs text-gray-500">[PROPERTY_NAME]:</p>
            <pre class="text-sm font-mono">item.[prop] = "{{ item.[prop] }}"</pre>
            <p class="mt-1 text-gray-700">→ Displayed: {{ item.[prop] }}</p>
        </div>
    </div>
</div>
```

### Color Guide for Property Boxes

| Property Type | Background Color |
|---------------|------------------|
| ID | `bg-gray-100` |
| Title/Name | `bg-green-100` |
| Image/Thumbnail | `bg-purple-100` (with purple-800 header) |
| Channel/Author | `bg-yellow-100` |
| Views/Stats | `bg-pink-100` |
| Date/Time | `bg-cyan-100` |
| Boolean flags | `bg-red-100` |
| Category/Type | `bg-indigo-100` |
| Location/Coords | `bg-teal-100` |

### Step 6: Provide Instructions

After adding debug code, tell the user:

```
✅ Debug view added to [FILE_PATH]

To see the debug data:
1. Open [URL] in browser
2. [Any tab/condition to trigger data load]
3. You'll see:
   - 📜 SCRIPT DATA section at top with all refs and API response
   - 📦 Each card showing inline data mapping

When done debugging, search for "DEBUG" comments to remove the debug code.
```

## Important Notes

- Always wrap debug sections with `v-if` for conditions (e.g., `v-if="hydrated"`)
- Use `JSON.stringify(data, null, 2)` for readable formatting
- Add `overflow-auto max-h-[300px]` to prevent huge data from breaking layout
- Show the TRANSFORM LOGIC code so user understands the mapping
- Color-code different data types for easy visual scanning
- Comment all debug additions with `// DEBUG:` for easy removal later

---

## Element-Specific Debug Mode

When the user provides a **specific element** (component name, CSS selector, or template snippet) instead of a file path or URL, apply a focused debug approach.

### Detecting Element-Specific Request

User might say:
- "Debug the video cards"
- "Show data for the PropertyCard component"
- "Debug the pagination section"
- "Show me data for `.video-card` elements"
- "Debug the `v-for` loop rendering videos"

### Step 1: Ask for Context

If user provides only an element reference without file context:

```
I'll debug the [ELEMENT_NAME] specifically. Please provide:
1. File path containing this element (or I can search for it)
2. Which data properties are you interested in? (or "all")
```

### Step 2: Trace Element's Data Source

1. **Find the element** in the template
2. **Identify data bindings**:
   - What variables does it use? (e.g., `v-for="video in videos"`)
   - What props does it receive? (e.g., `:property="property"`)
   - What events does it emit?
3. **Trace back to script**:
   - Find where the data comes from (ref, API call, computed, props)
   - Find the transform/mapping logic if any

### Step 3: Add Focused Debug Section

Add a smaller, targeted debug section **only for the specified element's data**:

```vue
<!-- ═══════════════════════════════════════════════════════════════ -->
<!-- 🔍 DEBUG: [ELEMENT_NAME] Data                                   -->
<!-- ═══════════════════════════════════════════════════════════════ -->
<div class="bg-slate-900 text-white p-4 mb-4 rounded-lg border-2 border-cyan-400">
    <h3 class="text-lg font-bold text-cyan-400 mb-2">🔍 Debug: [ELEMENT_NAME]</h3>
    
    <!-- Data Source -->
    <div class="bg-slate-800 p-3 rounded mb-3">
        <p class="text-xs text-gray-400 mb-1">Data Source (from script):</p>
        <pre class="text-xs text-yellow-200">[VARIABLE_NAME] = ref([...])</pre>
        <pre class="text-xs text-yellow-200">// Populated by: [API_ENDPOINT or SOURCE]</pre>
    </div>
    
    <!-- Current Value -->
    <div class="bg-slate-800 p-3 rounded">
        <p class="text-xs text-gray-400 mb-1">Current Value:</p>
        <pre class="text-xs text-cyan-300 whitespace-pre-wrap overflow-auto max-h-[200px]">{{ JSON.stringify([VARIABLE], null, 2) }}</pre>
    </div>
</div>
```

### Step 4: Add Inline Debug to Target Element Only

Wrap ONLY the specified element with debug info, not all elements:

```vue
<!-- DEBUG: [ELEMENT_NAME] wrapper -->
<div class="border-4 border-red-500 p-2 relative">
    <div class="absolute -top-6 left-0 bg-red-500 text-white text-xs px-2 py-1 rounded">
        🔍 Debugging: [ELEMENT_NAME]
    </div>
    
    <!-- Original element with inline data -->
    <div class="[ORIGINAL_CLASSES]">
        <!-- Element-specific data display -->
        <div class="bg-blue-900 text-white p-2 mb-2 rounded">
            <p class="text-xs font-bold">Element Data:</p>
            <pre class="text-xs text-blue-200 whitespace-pre-wrap">{{ JSON.stringify([ELEMENT_DATA], null, 2) }}</pre>
        </div>
        
        <!-- Original element content -->
        [ORIGINAL_ELEMENT_CONTENT]
    </div>
</div>
```

### Step 5: Show Only Related Script Variables

Instead of showing ALL script data, show only:
1. Variables directly used by the element
2. Parent data if element receives props
3. Related computed properties
4. The specific API call that populates the data

Example for "debug video cards":

```vue
<!-- 🔍 DEBUG: VideoCard Data Sources -->
<div class="bg-slate-900 text-white p-4 mb-4 rounded-lg border-2 border-cyan-400">
    <h3 class="text-lg font-bold text-cyan-400 mb-2">🔍 Debug: Video Cards</h3>
    
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <!-- Source Variable -->
        <div class="bg-slate-800 p-3 rounded">
            <p class="text-xs text-gray-400">Source: videos (ref)</p>
            <p class="text-xs text-green-300">Length: {{ videos.length }} items</p>
        </div>
        
        <!-- API Endpoint -->
        <div class="bg-slate-800 p-3 rounded">
            <p class="text-xs text-gray-400">API: $fetchCitizen("/videos/list")</p>
            <p class="text-xs text-orange-300">Params: page={{ route.query.page }}, limit=9</p>
        </div>
    </div>
    
    <!-- Transform Logic -->
    <div class="bg-slate-800 p-3 rounded mt-3">
        <p class="text-xs text-gray-400 mb-1">Transform (maps API → template):</p>
        <pre class="text-xs text-yellow-200">video.id → video.id
video.title → video.title  
video.channel?.name → video.channel
video.video_image → video.thumbnail
...</pre>
    </div>
</div>
```

### Minimal vs Full Debug

| Request Type | Debug Approach |
|--------------|----------------|
| File path / URL | Full page debug (all script data + all template elements) |
| Specific element | Focused debug (only related script data + only that element) |
| Multiple elements | Multiple focused sections (one per element) |

### Example Prompts and Responses

**User**: "Debug the pagination component"
**Action**: Show only `paginationConfig` data and add debug wrapper around `<LazyPagination>`

**User**: "Debug the property cards in the search results"
**Action**: Show only `properties` array data and add debug to each `<PropertyCard>` in the grid

**User**: "Debug the video thumbnail and title"
**Action**: Show only `video.thumbnail` and `video.title` mappings inline, skip other properties

