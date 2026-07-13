import { createRequire } from "node:module";
import { join } from "node:path";

const action = process.argv[2];
const relayRoot = process.argv[3];

if (!action || !relayRoot) {
  throw new Error("Usage: keyring-helper.mjs <audit|set|cleanup> <relay-root>");
}

const require = createRequire(join(relayRoot, "package.json"));
const { Entry } = require("@napi-rs/keyring");
const current = new Entry("relay-ai", "global:opencode");
const legacy = [
  ["relay-ai", "relay-ai"],
  ["opencode-starter", "opencode-starter"],
];

function read(entry) {
  try {
    return entry.getPassword() ?? null;
  } catch {
    return null;
  }
}

if (action === "audit") {
  const value = read(current);
  const rows = legacy.map(([service, account]) => {
    const legacyValue = read(new Entry(service, account));
    return { service, account, present: Boolean(legacyValue), length: legacyValue?.length ?? 0 };
  });
  console.log(JSON.stringify({
    current: { present: Boolean(value), length: value?.length ?? 0 },
    legacy: rows,
  }));
} else if (action === "set") {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const key = input.trim();
  if (!key.startsWith("sk-") || key.length < 40) {
    throw new Error("Refusing an invalid OpenCode credential");
  }
  current.setPassword(key);
  const verified = read(current) === key;
  console.log(JSON.stringify({ updated: verified, storedLength: read(current)?.length ?? 0 }));
  if (!verified) process.exitCode = 2;
} else if (action === "cleanup") {
  for (const [service, account] of legacy) {
    const entry = new Entry(service, account);
    try {
      if (read(entry)) entry.deletePassword();
    } catch {
      // Absence is already the desired state.
    }
  }
  const legacyPresent = legacy.some(([service, account]) => Boolean(read(new Entry(service, account))));
  console.log(JSON.stringify({ currentPresent: Boolean(read(current)), legacyPresent }));
  if (legacyPresent) process.exitCode = 3;
} else {
  throw new Error(`Unknown action: ${action}`);
}

