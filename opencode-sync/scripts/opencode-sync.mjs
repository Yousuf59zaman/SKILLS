#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_MODEL = "glm-5.2";
const DEFAULT_VISION_MODEL = "qwen3.7-plus";
const DEFAULT_AGENTS = ["clawdbot_agent", "openclawy_agent", "moltbot_agent"];
const OPENCODE_GO_BASE_URL = "https://opencode.ai/zen/go/v1";

const options = parseArgs(process.argv.slice(2));
const home = process.env.USERPROFILE || os.homedir();
const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
const defaultModel = options.defaultModel || DEFAULT_MODEL;
const visionModel = options.visionModel || DEFAULT_VISION_MODEL;
const agents = options.agents || DEFAULT_AGENTS;
const actions = [];
const warnings = [];
const failures = [];

function parseArgs(argv) {
  const out = { target: "all", apply: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") out.apply = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--target") out.target = argv[++i] || "all";
    else if (arg.startsWith("--target=")) out.target = arg.slice("--target=".length);
    else if (arg === "--default-model") out.defaultModel = argv[++i];
    else if (arg.startsWith("--default-model=")) out.defaultModel = arg.slice("--default-model=".length);
    else if (arg === "--vision-model") out.visionModel = argv[++i];
    else if (arg.startsWith("--vision-model=")) out.visionModel = arg.slice("--vision-model=".length);
    else if (arg === "--agents") out.agents = splitList(argv[++i]);
    else if (arg.startsWith("--agents=")) out.agents = splitList(arg.slice("--agents=".length));
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      failures.push(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function splitList(value = "") {
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}

function printHelp() {
  console.log(`Usage: node opencode-sync.mjs [--target all|codex|openclaw] [--apply] [--json]

Defaults:
  --default-model ${DEFAULT_MODEL}
  --vision-model  ${DEFAULT_VISION_MODEL}
  --agents        ${DEFAULT_AGENTS.join(",")}
`);
}

function readText(file) {
  return fs.readFileSync(file, "utf8");
}

function writeTextIfChanged(file, next, label) {
  const prev = fs.existsSync(file) ? readText(file) : null;
  if (prev === next) {
    actions.push({ scope: label, status: "ok", detail: "already current" });
    return false;
  }
  actions.push({ scope: label, status: options.apply ? "changed" : "would-change", detail: file });
  if (options.apply) {
    if (prev != null) backupFile(file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, next, "utf8");
  }
  return true;
}

function backupFile(file) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(home, ".openclaw", "workspace", "backups", "opencode-sync", stamp);
  fs.mkdirSync(backupDir, { recursive: true });
  const safeName = file.replace(/^[A-Za-z]:/, "").replace(/[\\/:*?"<>|]/g, "_");
  fs.copyFileSync(file, path.join(backupDir, safeName));
}

function safeJsonStringify(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

function runCodexFixes() {
  ensureCodexConfig();
  patchRelayAiCli();
  generateCodexAppCatalog();
}

function ensureCodexConfig() {
  const file = path.join(home, ".codex", "config.toml");
  if (!fs.existsSync(file)) {
    warnings.push(`Codex config missing: ${file}`);
    return;
  }
  let text = readText(file);
  text = text.replace(/^\s*rmcp_client\s*=\s*.*\r?\n/gm, "");
  text = ensureFeature(text, "js_repl", "true");
  writeTextIfChanged(file, text, "codex-config");
}

function ensureFeature(text, key, value) {
  const header = /^\[features\]\s*$/m.exec(text);
  if (!header) {
    const suffix = text.endsWith("\n") ? "" : "\n";
    return `${text}${suffix}\n[features]\n${key} = ${value}\n`;
  }
  const start = header.index;
  const nextSection = text.slice(start + header[0].length).search(/^\[[^\]]+\]\s*$/m);
  const end = nextSection === -1 ? text.length : start + header[0].length + nextSection;
  let section = text.slice(start, end);
  const line = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*.*$`, "m");
  if (line.test(section)) section = section.replace(line, `${key} = ${value}`);
  else section = section.replace(/^\[features\]\s*$/m, `[features]\n${key} = ${value}`);
  return `${text.slice(0, start)}${section}${text.slice(end)}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function patchRelayAiCli() {
  const file = path.join(appData, "npm", "node_modules", "@jacobbd", "relay-ai", "dist", "cli.js");
  if (!fs.existsSync(file)) {
    warnings.push(`Relay AI CLI package not found: ${file}`);
    return;
  }
  let text = readText(file);
  const before = text;
  const replacements = [
    ["shell_type: appCatalog ? \"default\" : \"shell_command\",", "shell_type: \"shell_command\","],
    ["apply_patch_tool_type: null,", "apply_patch_tool_type: \"freeform\","],
    ["truncation_policy: appCatalog ? { mode: \"bytes\", limit: 1e4 } : { mode: \"tokens\", limit: context },", "truncation_policy: { mode: \"tokens\", limit: appCatalog ? Math.min(context, 1e4) : context },"],
    ["supports_parallel_tool_calls: !appCatalog,", "supports_parallel_tool_calls: true,"],
    ["input_modalities: model.modalities ?? [\"text\", \"image\"],", "input_modalities: model.modalities ?? (wireId.toLowerCase().includes(\"qwen3.7\") ? [\"text\", \"image\"] : [\"text\"]),"]
  ];
  for (const [oldLine, newLine] of replacements) {
    if (text.includes(oldLine)) text = text.replace(oldLine, newLine);
  }
  text = patchCodexWindowsSpawn(text);
  writeTextIfChanged(file, text, "relay-ai-cli");
  if (options.apply && before !== text) {
    const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    if (check.status !== 0) failures.push(`Relay AI CLI syntax check failed: ${check.stderr || check.stdout}`);
    else actions.push({ scope: "relay-ai-cli", status: "ok", detail: "node --check passed" });
  }
}

function patchCodexWindowsSpawn(text) {
  if (text.includes("const codexJs = join13(npmDir")) return text;
  const oldBlock = `function launchCodex(modelId, env, extraArgs) {
  return new Promise((resolve) => {
    const codexPath = findCodexBinary();
    const args = ["--profile", profileName(), "-m", modelId, ...ensureCodexSandboxArgs(extraArgs)];
    const child = spawn4(codexPath, args, {
      stdio: "inherit",
      env,
      shell: isWindows3
    });
`;
  const newBlock = `function launchCodex(modelId, env, extraArgs) {
  return new Promise((resolve) => {
    const codexPath = findCodexBinary();
    const args = ["--profile", profileName(), "-m", modelId, ...ensureCodexSandboxArgs(extraArgs)];
    let command = codexPath;
    let childArgs = args;
    let useShell = isWindows3;
    if (isWindows3 && codexPath?.toLowerCase().endsWith(".cmd")) {
      const npmDir = codexPath.replace(/[\\/]codex\\.cmd$/i, "");
      const codexJs = join13(npmDir, "node_modules", "@openai", "codex", "bin", "codex.js");
      if (existsSync12(codexJs)) {
        command = process.execPath;
        childArgs = [codexJs, ...args];
        useShell = false;
      }
    }
    const child = spawn4(command, childArgs, {
      stdio: "inherit",
      env,
      shell: useShell
    });
`;
  if (!text.includes(oldBlock)) {
    warnings.push("Could not patch Relay Windows Codex spawn block automatically; inspect launchCodex manually.");
    return text;
  }
  return text.replace(oldBlock, newBlock);
}

function generateCodexAppCatalog() {
  const providersFile = path.join(home, ".relay-ai", "providers.json");
  if (!fs.existsSync(providersFile)) {
    warnings.push(`Relay AI providers.json missing: ${providersFile}`);
    return;
  }
  const data = JSON.parse(readText(providersFile));
  const go = (data.providers || []).find((provider) => provider.id === "go");
  const models = go?.modelsCache?.models || [];
  if (!models.length) {
    warnings.push("OpenCode Go provider exists but has no cached models. Run: relay-ai providers refresh-models");
    return;
  }
  const selected = models.find((model) => model.id === defaultModel);
  const ordered = selected ? [selected, ...models.filter((model) => model.id !== defaultModel)] : models;
  const catalog = {
    models: ordered.map((model, index) => catalogEntry(model, index))
  };
  const outFile = path.join(home, ".relay-ai", "codex", "app-models-go.json");
  writeTextIfChanged(outFile, safeJsonStringify(catalog), "codex-app-catalog");
}

function catalogEntry(model, priority) {
  const id = model.id;
  const context = Number(model.contextWindow || 128000);
  const isVision = id.toLowerCase() === visionModel.toLowerCase() || id.toLowerCase().includes("qwen3.7");
  return {
    slug: id,
    display_name: model.name || id,
    supported_reasoning_levels: [{ effort: "none", description: "No extra reasoning effort" }],
    default_reasoning_level: "none",
    supports_reasoning_summaries: false,
    default_reasoning_summary: "none",
    shell_type: "shell_command",
    visibility: "list",
    supported_in_api: true,
    priority,
    availability_nux: null,
    upgrade: null,
    base_instructions: "",
    support_verbosity: false,
    default_verbosity: null,
    apply_patch_tool_type: "freeform",
    truncation_policy: { mode: "tokens", limit: Math.min(context, 10000) },
    supports_parallel_tool_calls: true,
    experimental_supported_tools: [],
    context_window: context,
    max_context_window: context,
    input_modalities: isVision ? ["text", "image"] : ["text"],
    description: `${model.name || id} · OpenCode Go`
  };
}

function runOpenClawFixes() {
  const file = path.join(home, ".openclaw", "openclaw.json");
  if (!fs.existsSync(file)) {
    warnings.push(`OpenClaw config missing: ${file}`);
    return;
  }
  const raw = readText(file);
  const data = JSON.parse(raw);
  const before = safeJsonStringify(data);
  data.models ||= {};
  data.models.providers ||= {};
  data.models.providers["opencode-go"] ||= { models: [], baseUrl: OPENCODE_GO_BASE_URL, api: "openai-completions" };
  const provider = data.models.providers["opencode-go"];
  provider.baseUrl ||= OPENCODE_GO_BASE_URL;
  provider.api ||= "openai-completions";
  provider.models ||= [];
  upsertOpenClawModel(provider.models, {
    id: defaultModel,
    name: modelDisplayName(defaultModel),
    input: ["text"],
    contextWindow: 200000,
    reasoning: false,
    api: "openai-completions",
    baseUrl: OPENCODE_GO_BASE_URL
  });
  upsertOpenClawModel(provider.models, {
    id: visionModel,
    name: modelDisplayName(visionModel),
    input: ["text", "image"],
    contextWindow: 262144,
    reasoning: false,
    api: "openai-completions",
    baseUrl: OPENCODE_GO_BASE_URL
  });
  const configuredAgents = [];
  for (const agent of data.agents?.list || []) {
    if (!agents.includes(agent.id)) continue;
    if (agent.id === "main-cron") continue;
    agent.model = { fallbacks: [], primary: `opencode-go/${defaultModel}` };
    configuredAgents.push(agent.id);
  }
  if (!configuredAgents.length) warnings.push(`No matching OpenClaw agents found for: ${agents.join(",")}`);
  if (/relay-ai|relay_ai|127\.0\.0\.1:6649|127\.0\.0\.1:54321/i.test(raw)) {
    warnings.push("OpenClaw config still contains Relay/proxy-looking text. Audit manually before deleting auth material.");
  }
  const next = safeJsonStringify(data);
  if (before === next) actions.push({ scope: "openclaw-config", status: "ok", detail: "already current" });
  else writeTextIfChanged(file, next, "openclaw-config");
  if ((data.agents?.list || []).some((agent) => agent.id === "main-cron" && agents.includes(agent.id))) {
    warnings.push("main-cron was in the requested agent list but was intentionally left untouched.");
  }
}

function upsertOpenClawModel(models, desired) {
  const existing = models.find((model) => model.id === desired.id);
  if (!existing) models.push(desired);
  else Object.assign(existing, desired);
}

function modelDisplayName(id) {
  if (id === "glm-5.2") return "GLM-5.2";
  if (id === "qwen3.7-plus") return "Qwen3.7 Plus";
  return id;
}

function printResult() {
  const result = {
    mode: options.apply ? "apply" : "audit",
    target: options.target,
    defaultModel,
    visionModel,
    agents,
    actions,
    warnings,
    failures,
    nextChecks: [
      "relay-ai codex-app --config",
      "codex mcp list",
      "node --check %APPDATA%/npm/node_modules/@jacobbd/relay-ai/dist/cli.js",
      "openclaw configure --section model"
    ]
  };
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`OpenCode sync ${result.mode}: target=${result.target}`);
    for (const action of actions) console.log(`- ${action.scope}: ${action.status} (${action.detail})`);
    for (const warning of warnings) console.log(`WARNING: ${warning}`);
    for (const failure of failures) console.log(`ERROR: ${failure}`);
    console.log("Next checks:");
    for (const check of result.nextChecks) console.log(`- ${check}`);
  }
  if (failures.length) process.exitCode = 1;
}

if (!["all", "codex", "openclaw"].includes(options.target)) {
  failures.push(`Invalid --target: ${options.target}`);
}

if (!failures.length && ["all", "codex"].includes(options.target)) runCodexFixes();
if (!failures.length && ["all", "openclaw"].includes(options.target)) runOpenClawFixes();
printResult();
