# Architecture reference

## Trust zones

| Zone | May contain | Must not receive |
| --- | --- | --- |
| Admin browser | Sanitized UI models, Mission Control chat text | Bridge secret, gateway token, raw config, session keys, environment values |
| Next.js server | Auth session, server-only deployment secrets, typed route inputs | Arbitrary command strings from the browser |
| HTTPS tunnel | Signed requests to the bridge | An unauthenticated control surface |
| Local bridge | Shared signing secret, allowlisted collectors/actions, local metadata | Non-loopback listener, arbitrary shell execution |
| OpenClaw | Native gateway state, transcripts, tools, agents | Direct internet exposure from this app |

## Request signing

Build the canonical message with newline separators:

```text
UPPERCASE_METHOD
URL_PATH
UNIX_TIMESTAMP_MS
UNIQUE_NONCE
SHA256_HEX(BODY)
```

Sign it with HMAC-SHA256 and the server-only bridge secret. The bridge must:

1. require every field;
2. reject a timestamp outside a short skew window;
3. compute the same canonical signature;
4. compare signatures with a timing-safe function;
5. reject a nonce already seen inside the replay window;
6. expire old nonces.

Do not sign a different path from the path actually requested. Do not include query parameters in one side only.

## Bridge command model

Wrap OpenClaw execution in one bounded runner:

- invoke a known executable directly with an argument array and `shell: false`;
- use hidden child processes on Windows;
- set a strict working/state directory;
- cap concurrent processes with a small queue;
- enforce per-command timeouts and output byte limits;
- parse JSON defensively;
- redact long opaque strings from errors;
- return only typed, sanitized models.

Collectors may run concurrently inside the process bound. Coalesce telemetry refreshes and capability refreshes so multiple browser requests do not multiply expensive OpenClaw processes.

## Native chat lifecycle

```text
create metadata + dedicated session key
  -> chat.send with idempotency key and deliver:false
  -> save run ID privately and show running
  -> agent.wait until terminal status
  -> chat.history reconciliation
  -> sanitize + update preview/count/status
```

On bridge startup, resume monitoring metadata entries that were still running. Cache history only briefly so the UI remains responsive without hiding newly completed output.

Public thread objects must omit the native session key and active run ID. Derive opaque public references with a keyed digest if a control requires a reference to existing OpenClaw state.

## Local metadata

Store Mission Control thread metadata in an ignored local JSON file with atomic writes. The store should:

- validate IDs and schema on read;
- create the data directory when needed;
- serialize mutations to avoid lost updates;
- write a temporary file and rename it into place;
- never store attachment bodies or credentials.

Native OpenClaw history remains the transcript source of truth.

## Capability catalog

Build a separate sanitized catalog:

| Category | Safe fields |
| --- | --- |
| Skills | name, bounded sanitized description, source, ready/bundled/invocable flags, missing requirement names |
| MCP | name, launcher/package label, transport, readiness, environment key names |
| Runtime tools | opaque tool ID, label, sanitized description, source/group |
| CLI | command name, subcommand flag, bounded help description |
| Plugins | ID/name/version, sanitized description, origin, enabled/status, bounded capability labels |

Never expose environment values, configuration bodies, executable local paths, or private links.

## Suggested project boundaries

```text
app/
  api/auth/
  api/control/
  api/chat/
components/
lib/
  bridge-client
  typed browser-safe contracts
bridge/
  server
  signing and sanitizers
  chat service and metadata store
  capability service
scripts/
  local secret setup
  bridge install/run
  tunnel configuration
audit/
  sanitized inventory summary
```

Keep all bridge client modules server-only. Protect both page routes and API routes; do not rely only on hidden navigation.
