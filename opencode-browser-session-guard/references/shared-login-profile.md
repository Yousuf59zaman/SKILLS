# Shared Google login and Chrome profile

The intended setup uses one existing Chrome profile signed in with the Google account selected by the user. All parallel OpenCode conversations, through both guarded browser backends, reuse that profile and its login. The guard separates tab ownership and MCP state; it does not give each conversation a separate account.

## Resolve the account on this device

The private binding lives at `%USERPROFILE%\.config\opencode\browser-profile-identity.local.json`, outside all synced skill folders and the public Git repository. It records `expectedAccountEmail`, `profilePath`, `profileDirectory`, `debuggingEndpoint`, and the time of the local metadata check. Read these values into variables without printing the file. Every agent on this Windows user account can resolve the same binding from that path.

`browser-shared-chrome.settings.json` in the same directory supplies the launcher's `profilePath`. Compare its normalized absolute path with the binding before changing configuration. `profilePath` is the Chrome user-data directory; `profileDirectory` is the inner profile, such as `Default`. Do not substitute the inner directory for `--user-data-dir` or select a different everyday Chrome profile by its display name alone.

Verify the requested account by comparing the binding internally with `profile.info_cache[profileDirectory].user_name` in the selected user-data directory's `Local State` and the relevant `account_info[].email` in that profile's `Preferences`. Report match/mismatch only. Profile metadata can be stale and does not prove that Google or any website still has a valid authenticated session. For a task requiring sign-in, inspect the account shown in that conversation's guarded tab before acting.

If the binding is absent on another device, obtain the intended account from the current request or private context, locate the existing configured profile, and save the binding only after confirming the mapping. If the binding and current configuration disagree, resolve which profile the user intends before changing it. Skill sync transfers these instructions and the runtime source; profile folders, private bindings, cookies and login state stay on their own device.

## Preserve the complete setup

- Keep one persistent shared profile and the loopback CDP endpoint at `http://127.0.0.1:9222`. The launcher validates that the listener belongs to the configured Chrome profile. A matching account label alone does not establish listener identity.
- Use `browser-shared-chrome.bat` in the OpenCode config directory for a manual start. The existing login helper also delegates to this shared launcher. The hidden Windows startup shortcut and on-demand MCP startup use the same profile settings; ordinary browser work uses the guarded MCP tools.
- Keep the OpenCode session plugin, the per-conversation MCP wrapper, and the CDP target guard described in the runtime contract. Directly attaching every session to port 9222 restores the original tab-interference problem.
- Reuse the existing default browser context and logged-in profile. Keep login/logout and account changes coordinated across sessions. Google authentication does not automatically establish a valid Upwork or other website session; inspect the website's actual account when it matters.
- If login expires, use the existing profile's normal sign-in flow and let the user complete credentials, MFA or account selection when needed. Never solve expiry by cloning a profile, copying cookie databases, silently switching accounts or launching a second profile for another conversation.
- On a new PC, locate or establish the user's intended profile and sign in there normally before adapting the installer. The bundled installer currently expects an existing shared-browser configuration; it is not a Chrome-account migration tool.

Keep the private binding outside installation backups destined for sharing and outside skill commits. Routine guard repair preserves this separate file; if the user intentionally changes the account/profile, update its mapping from fresh evidence. Follow the skill's existing install, startup, verification and rollback steps for the rest of the runtime.
