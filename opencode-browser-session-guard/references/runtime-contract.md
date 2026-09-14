# Runtime contract

The global plugin injects the real OpenCode conversation identity into MCP arguments. The wrapper routes each conversation to its own backend process and CDP guard. Different OpenCode conversations can otherwise share one MCP process and its current-page pointer. The identity argument is an internal routing field, not a secret or authorization mechanism for arbitrary external clients.

The CDP guard connects to the existing Chrome's default browser context. It filters target discovery, attachment and events; records targets created by that guard; and allows child targets/popups only through owned parents/openers. It retains ownership across backend reconnection while the wrapper lives, and clears it when the Chrome generation changes. An OpenCode restart leaves tabs open and starts fresh ownership; it never reclaims pages by matching their URLs.

Background tab creation and suppressed activation calls reduce focus interference. Browser-wide shutdown, profile clearing, tracing, service worker operations and global window changes are restricted. Initial download configuration is ignored so it does not overwrite another conversation's settings; actual downloads use the current shared browser settings. A new requirement involving these restricted features needs its own design, not removal of the guard.

The wrapper serializes tools per conversation, including calls waiting behind an in-flight action that the host cancelled. It allows different conversations to proceed independently. Backend processes idle for 20 minutes disconnect while the wrapper retains in-memory ownership. Shutdown closes backend connections and leaves Chrome running.

The launcher uses a Windows named mutex derived from the normalized profile path. It checks that the loopback listening process owns the configured profile and exposes valid CDP metadata. Port conflicts or an already-open profile without a healthy endpoint yield an error without terminating anything. Startup runs through a hidden VBS launcher; browser calls also recover a stopped Chrome before dispatching a new action.

The browser context and website account remain shared. Cookies, localStorage, permissions and server-side resources are not conversation-isolated. The guard does not defeat direct shell access, arbitrary server-process code or a website's own cross-tab communication.

Version baseline: OpenCode 1.18.18, Chrome 146.0.7680.80, Playwright MCP 0.0.80 and Chrome DevTools MCP 1.9.0. These are tested versions, not claims of current latest versions. Retest protocol changes before updating the pinned dependencies.

The host hook was verified against [OpenCode's plugin interface](https://opencode.ai/docs/plugins/) and [its MCP tool dispatch source](https://github.com/anomalyco/opencode/blob/v1.18.18/packages/opencode/src/session/tools.ts). Attachment semantics are documented by [Playwright MCP](https://github.com/microsoft/playwright-mcp) and [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp).
