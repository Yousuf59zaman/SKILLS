# OpenCode shared browser: conversation isolation

This rule applies only inside OpenCode. Other agents have their own browser configuration.

## Using the browser

- Use the configured `playwright` or `chrome-devtools` MCP tools. They run through the local session guard.
- OpenCode supplies the real conversation ID automatically. Never invent, copy, or manually set `__opencodeSessionId`.
- Each conversation gets its own MCP state and its own view of tabs in the existing shared Chrome profile. The first browser action creates an owned tab if needed.
- Only tabs created by this conversation/backend, including their popups, appear in its tool results. Other conversations and manually opened tabs stay outside that view.
- Tab numbers/page IDs belong to one backend connection. Do not copy them between conversations or between Playwright and DevTools. Prefer one backend for the life of a browser task.
- Before acting, inspect this conversation's current page. Close only owned tabs with the tab/page tool.
- `chrome_devtools` is a disabled compatibility alias for `chrome-devtools`; do not enable a second copy just to retry an error.

## Shared login and site data

- The existing persistent Chrome profile and its login are shared. Do not launch another browser profile, incognito context, or Chrome process to work around a tool error.
- Cookies and localStorage are shared by design. sessionStorage and normal in-page draft fields belong to their individual tabs.
- Login/logout, shared localStorage changes, service workers and server-side data can still affect every session on the same site. Do not clear profile data, change the account, or log out while parallel work is active.
- For Upwork or another shared account, assign a particular proposal/job's editable form to one conversation. Separate tabs do not isolate a server-side draft or prevent duplicate submissions.
- Check actual draft persistence instead of assuming navigation saves it. Follow the user's approval requirements for submitting anything.

## Startup and recovery

- The existing Windows startup shortcut starts shared Chrome through `browser-shared-chrome.ps1` in this config directory. `browser-shared-chrome.bat` remains the manual launcher.
- The launcher serializes concurrent starts, checks readiness and verifies that the debugging port belongs to the intended profile. It never terminates an existing browser to resolve a conflict.
- The guard starts Chrome when needed. Chrome remains open when an MCP client disconnects. Inactive backend processes are released after 20 minutes, retaining in-memory tab ownership while OpenCode remains running.
- If a tab closes or an operation loses its connection, inspect/list owned tabs first. A click or submission may already have happened; do not replay it blindly.
- Cancelling a dispatched action cannot undo its effects. That conversation waits for its backend to settle before executing another action; other conversations continue independently.
- Restarting OpenCode loses the guard's in-memory ownership. Existing tabs remain open, and new conversations start with new owned tabs. Do not reclaim a tab by URL/title alone.
- After installing or updating the guard, restart all OpenCode windows once so both the global plugin and MCP config reload. A missing-identity error means the plugin is not loaded; restart instead of bypassing the guard.

## Scope

- The raw endpoint `http://127.0.0.1:9222/json/list` lists all Chrome targets. Agents must use guarded MCP tools instead of raw CDP/Chrome launch commands.
- Browser-wide shutdown, cookie clearing, window resizing, global tracing and profile mutations are restricted. Downloads use the shared browser's existing download settings.
- This prevents accidental browser-tool interference. It is not a sandbox for unrestricted shell commands or arbitrary server-side JavaScript.
- Parallelism is bounded by CPU, RAM and the site's own limits; no unlimited-session or site-level isolation guarantee is possible with a shared account.
