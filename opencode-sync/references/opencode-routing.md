# OpenCode Routing Reference

Use this reference when the automation script reports a manual action or when a future OpenCode/Relay/OpenClaw update changes config shape.

## Codex Desktop With Relay AI

Yousuf wants Codex Desktop to keep using Relay AI for OpenCode Go. Do not remove Relay AI from `C:\Users\User\.codex` when the task is about Codex. The required shape is:

- Relay provider: OpenCode Go.
- Default model in Relay preference/catalog: `glm-5.2`.
- Codex app catalog: `C:\Users\User\.relay-ai\codex\app-models-go.json`.
- `glm-5.2`: text-only, default for normal work.
- `qwen3.7-plus`: text+image, use for vision/image tasks.
- Codex feature flag: `js_repl = true`.
- Browser and Chrome plugin control must discover `node_repl js` using `tool_search` before claiming the tool is unavailable.

The Relay package patch is needed because some Relay AI versions generate Codex app catalog entries as limited sessions:

- `shell_type` must be `shell_command`.
- `apply_patch_tool_type` must be `freeform`.
- `supports_parallel_tool_calls` must be `true`.
- App catalog truncation should use token mode, not byte mode.
- Unknown Go models should not all advertise image input. Keep GLM text-only; advertise image input for Qwen 3.7 models.

Known harmless/independent conditions:

- Zapier MCP may show `Not logged in`; fix with Zapier OAuth, not Relay config.
- Figma Desktop MCP may fail if `http://127.0.0.1:3845/mcp` is not running; start Figma Desktop/local MCP instead of changing model routing.

## OpenClaw Direct OpenCode Go

Yousuf wants OpenClaw to use direct OpenCode Go auth/config, not Relay AI. Do not route OpenClaw through Relay AI unless he explicitly reverses that decision.

Safe OpenClaw rules:

- Keep `main-cron` unchanged unless explicitly requested.
- Set only `clawdbot_agent`, `openclawy_agent`, and `moltbot_agent` by default.
- Primary model for those agents: `opencode-go/glm-5.2`.
- Ensure `opencode-go/qwen3.7-plus` is available and has `input: ["text", "image"]` for vision tasks.
- Do not delete `openai-codex` provider globally if `main-cron` still depends on it.
- Do not print or rewrite secrets unless the JSON write is necessary for non-secret model metadata. Back up first.

Manual direct OpenCode setup path when auth is missing:

```powershell
openclaw configure --section model
```

Choose:

1. `OpenCode`
2. `OpenCode Go catalog`
3. Enter the OpenCode API key from `https://opencode.ai/auth`
4. Select `glm-5.2` and `qwen3.7-plus` in the model picker when available

If the OpenCode Go catalog is blocked by plugin allowlist, fix the OpenClaw plugin allowlist first, then rerun the configure command.

## Do Not Do These

- Do not copy Codex OAuth/OpenAI auth profiles into OpenClaw for this OpenCode setup.
- Do not remove `main-cron` Codex/OpenAI settings during a three-agent OpenCode fix.
- Do not claim Browser or MCP tools are unavailable until `tool_search` has been attempted for the deferred tool family.
- Do not expose `OPENCODE_API_KEY`, Codex OAuth state, cookies, or bearer tokens in logs or final messages.
