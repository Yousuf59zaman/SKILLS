import path from 'node:path';
import { digest } from './bundle.mjs';
import { deliveryEvidenceSatisfied, deliveryPersistenceSatisfied } from './messenger-evidence.mjs';

export async function waitForStableHistory(io, initialHistory) {
  const deadline = io.now() + 15000;
  let signature = null, stableSince = null;
  while (io.now() < deadline) {
    const sample = await io.history();
    if (sample?.version !== 2 || !sample.messengerConversation || !sample.composerPresent
      || sample.path !== initialHistory.path || sample.host !== initialHistory.host) throw new Error('conversation_changed_before_submit');
    // A visible composer does not mean history has hydrated. In live Messenger
    // a 1-row skeleton became 15 rows and then 3 real rows within two seconds.
    const next = JSON.stringify(sample.rows.map(row => [row.key, row.outgoing, row.attachmentCount, row.textMatched, row.pending]));
    if (signature !== next) { signature = next; stableSince = io.now(); }
    else if (io.now() - stableSince >= 3000) return sample;
    await io.sleep(500);
  }
  throw new Error('conversation_history_not_stable_no_send');
}

function verifiedResult(handoff, attachmentCount, note) {
  const bundle = handoff.bundle;
  const text = String(handoff.message_text ?? '');
  return {
    verified: true,
    note,
    delivery_receipt: { version: 1, bundle_fingerprint: bundle.fingerprint, target_group: handoff.target_group, attachment_count: attachmentCount, message_text_sha256: digest(text), link_count: bundle.canonical_urls.length, all_parts_verified: true, composer_empty: true },
  };
}

export async function deliverBundle(handoff, io, beforeSubmit) {
  const files = handoff.attachment_paths ?? [];
  const text = String(handoff.message_text ?? '');
  const bundle = handoff.bundle;
  if (!bundle || bundle.attachment_count !== files.length || bundle.message_text_sha256 !== digest(text)) throw new Error('invalid_complete_bundle_handoff');
  if (typeof beforeSubmit !== 'function') throw new Error('durable_submit_guard_required');
  let staged = false;
  let marked = false;
  let verification = null;
  try {
    await io.open();
    const initialDraft = await io.draft();
    if (!initialDraft.composerPresent || !initialDraft.textEmpty || initialDraft.attachmentCount !== 0) throw new Error('existing_messenger_draft_do_not_overwrite');
    const initialHistory = await io.history();
    if (!initialHistory.messengerConversation) throw new Error('messenger_conversation_url_unverified');
    staged = true;
    if (files.length) await io.attach(files);
    if (text) await io.fill(text);
    let ready = false;
    const uploadDeadline = io.now() + 120000;
    while (io.now() < uploadDeadline) {
      const draft = await io.draft();
      if (draft.uploadFailed) throw new Error('bundle_upload_failed_no_send');
      const selectedFiles = draft.files ?? [];
      const allFiles = files.length === 0 || (selectedFiles.length === files.length && files.every((file, index) => selectedFiles[index]?.name === path.basename(file) && selectedFiles[index]?.size === handoff.attachment_sizes[index]));
      if (draft.composerPresent && draft.textMatches && draft.attachmentCount === files.length && !draft.uploadBusy && allFiles && await io.sendReady()) { ready = true; break; }
      await io.sleep(500);
    }
    if (!ready) throw new Error('bundle_upload_or_caption_incomplete_no_send');
    // Take the baseline AFTER staging: lazy-loaded old history must not be
    // mistaken for newly delivered attachments during a long upload.
    const before = await waitForStableHistory(io, initialHistory);
    if (!before.messengerConversation || before.path !== initialHistory.path || before.host !== initialHistory.host) throw new Error('conversation_changed_before_send');
    // A marker failure never falls through to Send. A marker persisted just
    // before a disk/process failure is conservatively treated as uncertain.
    await beforeSubmit();
    marked = true;
    await io.send();
    const deadline = io.now() + 60000;
    let candidate = null;
    let candidateSnapshot = null;
    let candidateSince = null;
    while (io.now() < deadline) {
      await io.sleep(750);
      const after = await io.history();
      const evidence = deliveryEvidenceSatisfied(before, after, { messageText: text, attachmentCount: files.length });
      verification = { reason: evidence.reason || 'bundle_evidence_incomplete', beforeRows: before.rows.length, afterRows: after.rows.length,
        textVerified: evidence.allTextVerified === true, mediaVerified: evidence.allMediaVerified === true,
        actualAttachments: evidence.verifiedAttachmentCount ?? 0, expectedAttachments: files.length,
        composerCleared: after.composerEmpty === true, cueInLog: after.diagnostics?.cueInLog === true,
        messageArticles: after.diagnostics?.messageArticles ?? 0, messageToolbars: after.diagnostics?.messageToolbars ?? 0 };
      if (evidence.confirmed) return verifiedResult(handoff, evidence.verifiedAttachmentCount, `Verified complete bundle: ${files.length} attachments, ${bundle.canonical_urls.length} links, complete caption; one Send.`);
      if (evidence.structurallyComplete) {
        if (JSON.stringify(candidate?.candidateRowKeys) !== JSON.stringify(evidence.candidateRowKeys)) candidateSince = io.now();
        candidate = evidence; candidateSnapshot = after;
        // Once the complete outgoing bundle is stable, a reload is stronger
        // evidence than waiting a minute for a status Messenger may omit.
        if (io.reloadHistory && io.now() - candidateSince >= 3000) break;
      } else { candidate = null; candidateSnapshot = null; candidateSince = null; }
    }
    if (!candidate && typeof io.reloadHistory === 'function') {
      // A newly sent link can remain in optimistic-only markup without a
      // normal message article/toolbar. Reload READ ONLY, compare the complete
      // new bundle against the frozen pre-Send boundary, then require another
      // full reload below. This never clicks Send or bypasses missing evidence.
      const hydrated = await io.reloadHistory(before, null);
      const evidence = deliveryEvidenceSatisfied(before, hydrated, { messageText: text, attachmentCount: files.length });
      if (evidence.structurallyComplete) { candidate = evidence; candidateSnapshot = hydrated; }
      else if (verification) verification.reason = evidence.reason || 'bundle_evidence_incomplete';
    }
    if (candidate && candidateSnapshot && typeof io.reloadHistory === 'function') {
      const persisted = await io.reloadHistory(candidateSnapshot, candidate);
      const evidence = deliveryPersistenceSatisfied(candidateSnapshot, persisted, candidate);
      if (verification) verification.reason = 'reload_persistence_incomplete';
      if (evidence.confirmed) return verifiedResult(handoff, files.length, `Verified server-persisted complete bundle after reload: ${files.length} attachments, ${bundle.canonical_urls.length} links, complete caption; one Send.`);
    }
    throw new Error('delivery_verification_ambiguous');
  } catch (error) {
    if (marked) { error.sendAttempted = true; error.code = 'delivery_verification_ambiguous'; error.verification = verification; }
    else if (staged && io.clearOwnedDraft) {
      try { await io.clearOwnedDraft(); } catch { error.draftRetained = true; }
    }
    throw error;
  }
}
