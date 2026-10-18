# Office Commander Integration Contract

Use this contract when creating or auditing the bridge dispatcher. Keep payloads JSON-serializable and return bounded, redacted results.

## Dispatcher

Use one Custom GPT Action operation named `officeIntegration`. Require `integration` and route to the selected adapter.

| Integration | Supported operations | Safe verification |
|---|---|---|
| `windows_apps` | `list`, `launch` | List/filter a known app |
| `windows_processes` | `list`, `stop` | List only |
| `windows_clipboard` | `read`, `write` | Save, round-trip a marker, restore |
| `windows_screenshot` | `capture` | Capture to runtime output, verify, delete |
| `windows_window` | `list`, `activate`, `move`, `resize` | List or resize a disposable window |
| `chrome` | `status`, `start`, `listTabs`, `open`, `navigate`, `readPage`, `click`, `type`, `screenshot` | Status, then a harmless page |
| `google_workspace` | App-specific `open`, `new`, `search`, `compose`, `newEvent`, or `directions` | Open Gmail/Calendar and verify host |
| `github` | `status`, `repo`, `issues`, `pulls`, `api` | Auth status or read-only repo query |
| `figma` | `status`, `file`, `nodes`, `images` | Status; skip when deferred |
| `postman` | `status`, `search`, `runCollection` | Status or one-workspace search |

## Google Apps

Support these `app` values through the dedicated managed Office Chrome profile:

- `gmail`
- `docs`
- `sheets`
- `calendar`
- `slides`
- `maps`
- `drive`

Opening a private app is successful only when the final host remains the app host and the page is not an account rejection/sign-in screen.

## Credential Storage

| Connector | Storage rule |
|---|---|
| Bridge | Bearer token in ignored `.env.local` |
| Google | Dedicated managed Chrome profile; never inspect cookies/storage |
| GitHub | GitHub CLI credential manager/keyring |
| Postman | Browser-authenticated Postman CLI storage |
| Figma | DPAPI-encrypted token in ignored runtime storage; environment variable only as a fallback |

Never place credentials in OpenAPI examples, Custom GPT instructions, audit logs, screenshots, skill resources, commits, or final reports.

## Public Schema

- Serve the schema at `/openapi.json` and a privacy page at `/privacy`.
- Use the stable HTTPS Office tunnel as `servers[0].url`.
- Keep all operation IDs unique and stable.
- Include `officeIntegration` and the integration/app enums above.
- Set `x-openai-isConsequential: false` on every Action operation intended for prompt-free execution.
- Require the bearer security scheme on executable routes.

## Windows Postman Reliability

An npm-generated `postman.ps1` shim can emit `chcp`/PATH errors when the bridge is started by a service or hidden launcher. Resolve the installed CLI entrypoint under the npm directory and invoke it with the currently running Node executable:

```js
const postmanBin = path.join(path.dirname(postmanPs1), 'node_modules', 'postman-cli', 'bin', 'postman.js');
await execFileAsync(process.execPath, [postmanBin, ...args], options);
```

Treat authentication as valid only when a read-only Postman command exits successfully and returns parseable JSON.

