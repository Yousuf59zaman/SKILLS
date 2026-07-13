# Codex and Relay repair reference

## Preferred repair

Read the sibling skill and its routing reference, then audit before apply:

```powershell
$sync = "$env:USERPROFILE\.codex\skills\opencode-sync"
Get-Content "$sync\SKILL.md"
Get-Content "$sync\references\opencode-routing.md"
node "$sync\scripts\opencode-sync.mjs" --target codex
node "$sync\scripts\opencode-sync.mjs" --target codex --apply
```

Verify:

- `~\.codex\config.toml` has `[features] js_repl = true`.
- Obsolete `rmcp_client` is absent.
- The Go app catalog puts `glm-5.2` first and marks it text-only.
- `qwen3.7-plus` advertises text and image input.
- `shell_type = shell_command`.
- `apply_patch_tool_type = freeform`.
- `supports_parallel_tool_calls = true`.
- App catalog truncation uses token mode.
- `node --check %APPDATA%\npm\node_modules\@jacobbd\relay-ai\dist\cli.js` passes.

## Windows multi-word prompt gate

Run a prompt containing spaces:

```powershell
relay-ai codex --provider go --model glm-5.2 exec --json "Reply with exactly PONG and nothing else."
```

Do not accept `unexpected argument 'with'`. Relay AI 0.4.0 can select `codex.cmd` and spawn it with `shell: true`, allowing `cmd.exe` to split a quoted prompt.

If the sibling skill cannot patch the launcher automatically:

1. Inspect `findCodexBinary`, `canRunCodexBinary`, and `launchCodex` in Relay's installed `dist/cli.js`.
2. Prefer the native `codex.exe` bundled under the installed `@openai/codex` platform package before `codex.cmd`.
3. Use `shell: false` for the native executable. Use shell mode only for `.cmd` or `.bat` fallbacks.
4. Apply the same extension-aware shell selection to the executable probe.
5. Run `node --check` and repeat the exact multi-word prompt.

Keep this as an explicit incomplete gate: the original session detected the bug but did not finish the patch. Never report the launcher as repaired until this test passes.

