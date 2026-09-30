#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  WORKSPACE_ROOT,
  connectBrowser,
  ensureBrowser,
  parseArgs,
  parseJsonOutput,
  sleep,
} from "./browser-runtime.mjs";
import {
  beginRun,
  endRun,
  queueStatus,
} from "./queue-worker.mjs";
import { isMain } from "./lib.mjs";
import { deliverBundle, waitForStableHistory } from './bundle-sender.mjs';
import { captureConversationEvidence, captureComposerEvidence, deliveryPersistenceSatisfied } from './messenger-evidence.mjs';
import { drainQueueBatch } from './queue-batch.mjs';
export { deliveryEvidenceSatisfied } from './messenger-evidence.mjs';

const args = parseArgs(process.argv.slice(2));
const profile = String(args.profile || "openclaw");
const requestedTargetId = String(args["target-id"] || "").trim();
const workspace = WORKSPACE_ROOT;
const loginHelper = path.join(workspace, "skills", "fb-second-brain", "scripts", "messenger-login-helper.ps1");
const pinHelper = path.join(workspace, "skills", "fb-second-brain", "scripts", "messenger-pin-helper.ps1");
const TWO_FACTOR_LINE = "Messenger login needs 2-step verification. Queue retained; please complete it in the openclaw browser.";

function emit(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

export function buildQueueSummary({ sent = 0, retryScheduled = 0, manualReviewRequired = 0, permanentlyFailed = 0, pendingRemaining, manualReviewTotal, stopReason } = {}) {
  if (![sent, retryScheduled, manualReviewRequired, permanentlyFailed, pendingRemaining, manualReviewTotal].some((value) => Number(value) > 0)) return 'NO_REPLY';
  let line = `Messenger queue: ${Number(sent)} sent, ${Number(retryScheduled)} retry scheduled, ${Number(manualReviewRequired)} manual review required, ${Number(permanentlyFailed)} permanently failed.`;
  if (Number.isSafeInteger(pendingRemaining)) line += ` ${pendingRemaining} pending remaining.`;
  if (Number.isSafeInteger(manualReviewTotal) && manualReviewTotal > manualReviewRequired) line += ` ${manualReviewTotal} total awaiting manual review.`;
  if (stopReason === 'clean_context_unverified') line += ' Paused: clean browser state could not be verified.';
  if (stopReason === 'repeated_failures') line += ' Paused after repeated failures.';
  return line;
}

export function queueRecoveryCounts(recovered = {}) {
  const count = (value) => Number.isSafeInteger(value) && value > 0 ? value : 0;
  return {
    sent: count(recovered.finalized_verified),
    manualReviewRequired: count(recovered.retained_uncertain),
  };
}

function queueErrorClass(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  if (/^[a-z][a-z0-9_]{2,80}$/.test(message)) return message;
  if (/^E(?:NOENT|ACCES|PERM|NOSPC|BUSY|IO)$/.test(code)) return 'queue_or_attachment_io_error';
  if (/timeout/i.test(message)) return 'browser_timeout';
  // Browser errors may echo filled text or local filenames. Never put those
  // raw errors into queue events, cron summaries, or Telegram notifications.
  return 'browser_or_queue_operation_failed';
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function firstVisible(locator, limit = 20) {
  const count = Math.min(await locator.count().catch(() => 0), limit);
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible({ timeout: 1200 }).catch(() => false)) return candidate;
  }
  return null;
}

function targetComposerLocator(page, targetGroup) {
  return page.getByRole("textbox", {
    name: new RegExp(`^Write to\\s+${escapeRegex(targetGroup)}\\s*$`, "i"),
  });
}

async function waitForTargetComposer(page, targetGroup, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  const locator = targetComposerLocator(page, targetGroup);
  while (Date.now() < deadline) {
    const composer = await firstVisible(locator);
    if (composer) return composer;
    await sleep(500);
  }
  return null;
}

async function waitForSendControl(page, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  const locator = page.locator([
    'button[aria-label="Send" i]',
    'div[role="button"][aria-label="Send" i]',
    'button[aria-label="Press Enter to send" i]',
    'div[role="button"][aria-label="Press Enter to send" i]',
  ].join(","));
  while (Date.now() < deadline) {
    const candidate = await firstVisible(locator);
    if (candidate && await candidate.isEnabled().catch(() => false)) return candidate;
    await sleep(500);
  }
  return null;
}

function runCredentialHelper(scriptPath, action) {
  const powershell = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const helperArgs = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
    "-Action",
    action,
    "-BrowserProfile",
    profile,
  ];
  if (requestedTargetId) helperArgs.push("-TargetId", requestedTargetId);
  const result = spawnSync(powershell, helperArgs, {
    cwd: workspace,
    encoding: "utf8",
    windowsHide: true,
    timeout: 120000,
    maxBuffer: 1024 * 1024,
  });
  let output = null;
  try {
    output = parseJsonOutput(result.stdout, path.basename(scriptPath));
  } catch {}
  if (result.status === 2 && output?.two_factor_required) return output;
  if (result.status !== 0) throw new Error(`${path.basename(scriptPath)} failed safely`);
  if (!output?.ok) throw new Error(`${path.basename(scriptPath)} did not verify success`);
  return output;
}

export async function findPageByTargetId(context, targetId) {
  if (!targetId) return null;
  for (const candidate of context.pages()) {
    let session = null;
    try {
      session = await context.newCDPSession(candidate);
      const result = await session.send("Target.getTargetInfo");
      if (result?.targetInfo?.targetId === targetId) return candidate;
    } catch {
      // Ignore non-page/closing targets while locating the exact owned tab.
    } finally {
      if (session) await session.detach().catch(() => {});
    }
  }
  return null;
}

export async function openExactConversation(page, targetGroup) {
  await page.bringToFront();
  if (!/facebook\.com\/messages/i.test(page.url())) {
    await page.goto("https://www.facebook.com/messages/", { waitUntil: "domcontentloaded", timeout: 120000 });
    await sleep(2500);
  }

  // The exact accessible composer name is the authority for the active thread.
  // Never accept a generic contenteditable: profileState.lastTargetId is shared
  // and could otherwise make a parallel task act in another conversation.
  let composer = await waitForTargetComposer(page, targetGroup, 2000);
  if (composer) return composer;

  const exactName = new RegExp(`^${escapeRegex(targetGroup)}$`, "i");
  const visibleCandidates = [
    page.getByRole("link", { name: exactName }),
    page.getByRole("button", { name: exactName }),
    page.getByText(exactName, { exact: true }),
  ];
  let candidate = null;
  for (const locator of visibleCandidates) {
    candidate = await firstVisible(locator);
    if (candidate) break;
  }
  if (candidate) {
    await candidate.click({ force: true, timeout: 5000 });
    composer = await waitForTargetComposer(page, targetGroup, 10000);
    if (composer) return composer;
  }

  let search = await firstVisible(page.locator([
    'input[placeholder*="Search Messenger" i]',
    'input[aria-label*="Search Messenger" i]',
    '[role="combobox"][aria-label*="Search Messenger" i]',
    '[contenteditable="true"][aria-label*="Search Messenger" i]',
  ].join(",")));
  if (!search) {
    const backButton = await firstVisible(page.locator([
      'button[aria-label="Back" i]',
      'div[role="button"][aria-label="Back" i]',
      'a[aria-label="Back" i]',
    ].join(",")));
    if (backButton) {
      await backButton.click({ force: true });
      await sleep(1000);
    } else {
      await page.goto("https://www.facebook.com/messages/", { waitUntil: "domcontentloaded", timeout: 120000 });
      await sleep(2500);
    }
    search = await firstVisible(page.locator([
      'input[placeholder*="Search Messenger" i]',
      'input[aria-label*="Search Messenger" i]',
      '[role="combobox"][aria-label*="Search Messenger" i]',
      '[contenteditable="true"][aria-label*="Search Messenger" i]',
    ].join(",")));
  }
  if (!search) throw new Error("messenger_search_missing");

  await search.click({ force: true });
  await search.fill("");
  await search.fill(targetGroup);
  await sleep(1500);

  candidate = null;
  const searchResults = [
    page.getByRole("option", { name: exactName }),
    page.getByRole("link", { name: exactName }),
    page.getByText(exactName, { exact: true }),
  ];
  for (const locator of searchResults) {
    candidate = await firstVisible(locator);
    if (candidate) break;
  }
  if (!candidate) throw new Error("messenger_group_not_found");
  await candidate.click({ force: true, timeout: 5000 });
  composer = await waitForTargetComposer(page, targetGroup, 12000);
  if (!composer) throw new Error("messenger_group_header_unverified");
  return composer;
}

export async function sendAndVerify(page, handoff, { pinPreverified = false, beforeSubmit } = {}) {
  const targetGroup = String(handoff?.target_group || "").trim();
  const attachments = Array.isArray(handoff?.attachment_paths)
    ? handoff.attachment_paths.map((value) => path.resolve(String(value))).filter(Boolean)
    : [];
  const messageText = String(handoff?.message_text || "").trim();
  if (!targetGroup) throw new Error("missing_target_group");
  if (!attachments.length && !messageText) throw new Error("empty_messenger_payload");
  for (const filePath of attachments) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) throw new Error("queued_attachment_missing");
  }

  let composer = await openExactConversation(page, targetGroup);

  const hasPinPrompt = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('[role="textbox"], input'));
    return inputs.some(el => {
      const label = (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('placeholder') || '') + ' ' + (el.getAttribute('name') || '');
      return /\bPIN\b/i.test(label) && !/shopping/i.test(label);
    });
  });

  if (hasPinPrompt || !pinPreverified) {
    const pinResult = runCredentialHelper(pinHelper, "Submit");
    if (pinResult?.needed) await sleep(1200);
    composer = await waitForTargetComposer(page, targetGroup, 12000);
    if (!composer) throw new Error("messenger_group_header_unverified_after_pin");
  }

  return deliverBundle(handoff, createMessengerIO(page, handoff, composer), beforeSubmit);
}

export function createMessengerIO(page, handoff, initialComposer) {
  const targetGroup = String(handoff.target_group);
  const attachments = handoff.attachment_paths ?? [];
  const messageText = String(handoff.message_text ?? '');
  let composer = initialComposer;
  let sendButton = null;
  let selectedFiles = null;
  const io = {
    open: async () => {}, // Exact group and credential checks already passed.
    now: () => Date.now(),
    sleep,
    draft: async () => { const draft = await captureComposerEvidence(page, targetGroup, messageText); return { ...draft, files: selectedFiles ?? draft.files }; },
    history: () => captureConversationEvidence(page, messageText),
    reloadHistory: async (observed, candidate) => {
      // A full reload removes any optimistic-only DOM row. If the exact row
      // survives and the group composer returns, Messenger's server persisted it.
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
      composer = await waitForTargetComposer(page, targetGroup, 15000);
      if (!composer) throw new Error('reload_conversation_unverified');
      if (!candidate) return waitForStableHistory(io, observed);
      const deadline = Date.now() + 20000;
      let evidence;
      do {
        evidence = await captureConversationEvidence(page, messageText);
        if (deliveryPersistenceSatisfied(observed, evidence, candidate).confirmed) return evidence;
        await sleep(500);
      } while (Date.now() < deadline);
      return evidence;
    },
    attach: async () => {
    if (!attachments.length) { selectedFiles = []; return; }
    let fileInput = page.locator('input[type="file"]');
    if ((await fileInput.count()) === 0) {
      const attachBtn = await firstVisible(page.locator([
        'div[aria-label*="Attach a file" i]',
        'button[aria-label*="Attach a file" i]',
        '[aria-label*="Attach a file" i]',
        '[aria-label*="Attach" i]',
      ].join(',')));
      if (attachBtn) {
        await attachBtn.hover().catch(() => {});
        await sleep(500);
      }
      fileInput = page.locator('input[type="file"]');
    }

    if (!(await fileInput.count())) throw new Error("messenger_file_input_missing");
    if (attachments.length > 1 && !(await fileInput.last().getAttribute('multiple') !== null)) throw new Error('messenger_multi_file_input_missing');
    const element = await fileInput.last().elementHandle();
    // React may clear/remount its file input synchronously. Capture the exact
    // selection BEFORE app handlers, then retain only name/size in this job.
    await element.evaluate((el) => {
      const key = Symbol.for('openclaw.bundle.selection');
      const record = { files: null };
      const listener = (event) => {
        if (event.target !== el || record.files) return;
        record.files = Array.from(el.files || []).map((file) => ({ name: file.name, size: file.size }));
      };
      record.cleanup = () => { window.removeEventListener('input', listener, true); window.removeEventListener('change', listener, true); };
      el[key] = record;
      window.addEventListener('input', listener, true); window.addEventListener('change', listener, true);
    });
    try {
      await element.setInputFiles(attachments);
      selectedFiles = await element.evaluate((el) => el[Symbol.for('openclaw.bundle.selection')]?.files ?? null);
      if (!selectedFiles) throw new Error('browser_file_selection_unverified');
    } finally {
      await element.evaluate((el) => { const key=Symbol.for('openclaw.bundle.selection'); el[key]?.cleanup(); delete el[key]; }).catch(()=>{});
      await element.dispose();
    }
    },
    fill: async () => {
      composer = await waitForTargetComposer(page, targetGroup, 5000);
      if (!composer) throw new Error('messenger_composer_missing');
    await composer.click({ force: true });
    await composer.fill(messageText);
    },
    sendReady: async () => { sendButton = await waitForSendControl(page, 750); return Boolean(sendButton); },
    send: async () => {
      if (!(await waitForTargetComposer(page, targetGroup, 500))) throw new Error('conversation_changed_before_send');
      await sendButton.click({ timeout: 10000 });
    },
    clearOwnedDraft: async () => {
      const current = await captureComposerEvidence(page, targetGroup, messageText);
      if (!current.composerPresent || (!current.textEmpty && !current.textMatches) || current.attachmentCount > attachments.length) throw new Error('draft_ownership_uncertain');
      const removals = page.getByRole('button', { name: /^Remove(?: (?:attachment|photo|image|video|audio|file))?(?:\s|$)/i });
      for (let index = 0; index < current.attachmentCount; index++) {
        const button = await firstVisible(removals);
        if (!button) throw new Error('owned_draft_cleanup_incomplete');
        await button.click({ timeout: 3000 });
      }
      await composer.fill('');
      const cleaned = await captureComposerEvidence(page, targetGroup, '');
      if (!cleaned.textEmpty || cleaned.attachmentCount) throw new Error('owned_draft_cleanup_incomplete');
    },
  };
  return io;
}

export async function recoverCleanMessengerContext(page, targetGroup) {
  if (!targetGroup || page.isClosed()) return false;
  // This is read-only recovery, not a second Send or draft cleanup. Reload only
  // the wrapper-owned tab. A retained draft, PIN/login prompt or pending bubble
  // prevents continuation to the next job.
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await openExactConversation(page, targetGroup);
  for (let sample = 0; sample < 2; sample++) {
    await sleep(1500);
    const draft = await captureComposerEvidence(page, targetGroup, '');
    const history = await captureConversationEvidence(page, '');
    if (!draft.composerPresent || !draft.textEmpty || draft.attachmentCount || draft.uploadBusy || draft.uploadFailed
      || !history.messengerConversation || !history.composerEmpty || history.rows.some((row) => row.pending)) return false;
  }
  return true;
}

async function main() {
  let lockToken = null;
  let sent = 0;
  let retryScheduled = 0;
  let manualReviewRequired = 0;
  let permanentlyFailed = 0;
  let browserConnection = null;

  try {
  if (profile !== 'openclaw') throw new Error('cron_requires_owned_openclaw_profile');
  const initial = await queueStatus({ workspace });
  if (args.preflight || args["dry-run"]) {
    emit({
      ok: true,
      mode: "preflight",
      profile,
      pending: initial.pending,
      processing: initial.processing,
      failed: initial.failed,
      lock: initial.lock,
      encryptedLoginStorePresent: fs.existsSync(path.join(workspace, "..", "secrets", "messenger-login.dpapi.json")),
      encryptedPinStorePresent: fs.existsSync(path.join(workspace, "..", "secrets", "messenger-chat-history-pin.dpapi")),
      credentialVerification: args["credentials-preverified"] ? "verified_by_powershell_wrapper" : "not_attempted",
      externalActions: false,
    });
    process.exit(0);
  }
  if (Number(initial.pending || 0) + Number(initial.processing || 0) === 0) {
    emit({ ok: true, status: "empty", finalLine: "NO_REPLY" });
    process.exit(0);
  }

  if (!requestedTargetId) throw new Error('dedicated_messenger_tab_required');
  const lock = await beginRun({ workspace, owner: "main-cron" });
  if (!lock.acquired) {
    emit({ ok: true, status: "busy", finalLine: "NO_REPLY" });
    process.exit(0);
  }
  lockToken = lock.lock_token;
  const recoveredCounts = queueRecoveryCounts(lock.recovered);
  sent += recoveredCounts.sent;
  manualReviewRequired += recoveredCounts.manualReviewRequired;

  const browserStatus = await ensureBrowser(profile, { start: true, timeoutMs: 120000 });
  const { context, browser } = await connectBrowser(browserStatus.cdpUrl);
  browserConnection = browser;
  let page = await findPageByTargetId(context, requestedTargetId);
  if (!page) throw new Error("dedicated_messenger_tab_unavailable");
  await page.bringToFront();
  await page.goto("https://www.facebook.com/messages/", { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(2000);

  if (!args["login-preverified"]) {
    const login = runCredentialHelper(loginHelper, "Login");
    if (login?.two_factor_required) {
      await endRun({ workspace, lock_token: lockToken });
      lockToken = null;
      emit({ ok: false, status: "two_factor_required", finalLine: TWO_FACTOR_LINE });
      return;
    }
  }

  const batch = await drainQueueBatch({
    workspace, lockToken, profile,
    send: (handoff, beforeSubmit) => sendAndVerify(page, handoff, { pinPreverified: args['pin-preverified'] === true, beforeSubmit }),
    recoverCleanContext: (targetGroup) => recoverCleanMessengerContext(page, targetGroup),
    errorClass: queueErrorClass,
    onProgress: (counts) => {
      sent = recoveredCounts.sent + counts.sent;
      retryScheduled = counts.retryScheduled;
      manualReviewRequired = recoveredCounts.manualReviewRequired + counts.manualReviewRequired;
      permanentlyFailed = counts.permanentlyFailed;
    },
  });

  const finalStatus = await queueStatus({ workspace });
  await endRun({ workspace, lock_token: lockToken });
  lockToken = null;
  const pendingRemaining = finalStatus.pending;
  const manualReviewTotal = finalStatus.manual_review_required;
  const stopReason = batch.stopReason;
  const finalLine = buildQueueSummary({ sent, retryScheduled, manualReviewRequired, permanentlyFailed, pendingRemaining, manualReviewTotal, stopReason });
  emit({ ok: permanentlyFailed === 0 && manualReviewRequired === 0 && !stopReason, status: stopReason ? 'paused' : 'finished', sent, retryScheduled, manualReviewRequired, permanentlyFailed, pendingRemaining, manualReviewTotal, stopReason, finalLine });
  } catch (error) {
    if (lockToken) {
      try {
        await endRun({ workspace, lock_token: lockToken });
      } catch {}
    }
    emit({
      ok: false,
      status: "failed",
      sent,
      retryScheduled,
      manualReviewRequired,
      permanentlyFailed,
      error: queueErrorClass(error),
      queueRetained: true,
      finalLine: "Messenger queue runner failed before completion; queue retained for safe retry.",
    });
    process.exitCode = 1;
  } finally {
    // connectOverCDP creates a client connection; closing it disconnects this
    // client only. The wrapper closes its owned tab; managed Chrome stays up.
    if (browserConnection) await browserConnection.close().catch(() => {});
  }
}

if (isMain(import.meta.url)) {
  await main();
}
