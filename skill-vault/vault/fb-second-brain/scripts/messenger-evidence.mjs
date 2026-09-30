// These callbacks run in the owned Messenger tab. Only structural evidence is
// returned; conversation text, source URLs, and screenshots are never logged.
export async function captureConversationEvidence(page, messageText = '') {
  return page.evaluate(({ cue }) => {
    const normalize = (value) => String(value || '').replace(/\s+/gu, ' ').trim();
    const hash = (value) => {
      let current = 2166136261;
      for (const character of String(value || '')) { current ^= character.charCodeAt(0); current = Math.imul(current, 16777619); }
      return (current >>> 0).toString(16).padStart(8, '0');
    };
    const main = document.querySelector('[role="main"]') || document.body;
    const logs = Array.from(main.querySelectorAll('[role="log"]'));
    const log = logs.at(-1);
    const composer = Array.from(main.querySelectorAll('[role="textbox"][contenteditable="true"]'))
      .find((el) => /^Write to\s+/iu.test(el.getAttribute('aria-label') || ''));
    const cueText = normalize(cue);
    let rows = log ? Array.from(log.querySelectorAll('[role="row"]')).filter((el) => !el.querySelector('[role="row"]')) : [];
    if (log && !rows.length) {
      // The actual message article/toolbar exists before a newly sent link's
      // reply narrator is hydrated. That narrator is not a message boundary.
      rows = Array.from(log.querySelectorAll('[role="article"]')).filter((el) =>
        el.querySelectorAll('[role="toolbar"][aria-label="Message actions"]').length === 1
        && !Array.from(el.querySelectorAll('[role="article"]')).some(child => child.querySelector('[role="toolbar"][aria-label="Message actions"]')));
    }
    if (log && !rows.length) {
      // Current Messenger uses presentation DIVs, not ARIA rows. Its per-
      // message reply control identifies "message sent ... by ...". Expand
      // only to the outermost container owning exactly that ONE control.
      const markers = Array.from(log.querySelectorAll('[aria-label]')).filter((el) => /\bmessage sent\b[\s\S]*\bby\b/iu.test(el.getAttribute('aria-label') || ''));
      rows = [...new Set(markers.map((marker) => {
        let row = marker;
        while (row.parentElement && row.parentElement !== log && markers.filter((item) => row.parentElement.contains(item)).length === 1) row = row.parentElement;
        return row;
      }))];
    }
    const evidence = rows.map((row) => {
      const labelList = [row.getAttribute('aria-label') || '', ...Array.from(row.querySelectorAll('[aria-label], [alt], [title]')).flatMap((el) => [el.getAttribute('aria-label') || '', el.getAttribute('alt') || '', el.getAttribute('title') || '']), ...Array.from(row.querySelectorAll('svg title')).map((el) => el.textContent || '')];
      const labels = labelList.join('\n');
      const text = normalize(row.innerText || row.textContent);
      // Caption/link rows can omit "by you" even when the adjacent album has
      // it. Messenger's PRIMARY message toolbar still has the outgoing layout.
      // Do not infer direction from arbitrary nested/quoted content or text.
      const toolbars = Array.from(row.querySelectorAll('[role="toolbar"][aria-label="Message actions"]'));
      const toolbarShell = toolbars.length === 1 ? toolbars[0].parentElement : null;
      const shellStyle = toolbarShell ? getComputedStyle(toolbarShell) : null;
      const knownLayout = toolbarShell?.getAttribute('role') === 'presentation'
        && shellStyle?.display === 'flex' && ['row', 'row-reverse'].includes(shellStyle?.flexDirection);
      const outgoing = knownLayout ? shellStyle.flexDirection === 'row-reverse'
        : /^You (?:sent|said|replied)(?:\b|:)/iu.test(row.getAttribute('aria-label') || '') || labelList.some((label) => /\bmessage sent\b[\s\S]*\bby you(?:$|[\s.,])/iu.test(label));
      const media = Array.from(row.querySelectorAll('img, video, audio')).filter((el) => {
        const rect = el.getBoundingClientRect();
        if (el.tagName !== 'AUDIO' && (rect.width < 48 || rect.height < 48)) return false;
        if (el.tagName === 'IMG' && (!el.complete || el.naturalWidth < 1)) return false;
        const label = (el.getAttribute('alt') || '') + ' ' + (el.getAttribute('aria-label') || '');
        if (/profile picture|avatar|emoji|sticker|seen by/iu.test(label)) return false;
        if (el.tagName === 'IMG' && el.closest('video, audio')) return false;
        const link = el.closest('a[href]');
        // A link preview is not one of the uploaded attachments.
        if (link) {
          try { const url = new URL(link.getAttribute('href'), location.href);
            if (!/(^|\.)facebook\.com$/iu.test(url.hostname)) return false;
            // Facebook reel/share previews also use facebook.com, not l.php.
            // Count linked images only inside Messenger's attachment viewer.
            if (!/^\/messenger_media\/?$/iu.test(url.pathname)) return false;
          } catch { return false; }
        }
        return true;
      });
      const mediaKeys = media.map((el) => {
        const href = el.closest('a[href]')?.getAttribute('href');
        if (href) {
          const url = new URL(href, location.href);
          const attachmentId = url.searchParams.get('attachment_id') || url.searchParams.get('fbid');
          // Signed CDN URLs and client blob URLs are transport details. The
          // attachment/message identity survives a full reload; signatures do not.
          if (attachmentId) return [el.tagName, url.pathname, attachmentId, url.searchParams.get('message_id') || ''].join('|');
        }
        const src = el.getAttribute('src') || el.getAttribute('poster') || '';
        try { const url = new URL(src, location.href); if (/^https?:$/u.test(url.protocol)) return [el.tagName, url.origin, url.pathname].join('|'); } catch {}
        return [el.tagName, src].join('|');
      });
      const textBodies = Array.from(row.querySelectorAll('div[dir="auto"]')).filter(el => !el.querySelector('div[dir="auto"]'));
      // Accessible narration, timestamps and generated preview titles change
      // after Send/reload. Bind text identity to the actual message body.
      const contentText = textBodies.length ? textBodies.map(el => normalize(el.innerText || el.textContent)).join('\n')
        : media.length ? '' : text.replace(/\b(?:Sent|Delivered|Seen|Sending)\b/gu, '').trim();
      const sentLabel = labelList.find((label) => /\bmessage sent\b[\s\S]*\bby\b/iu.test(label)) || '';
      const sentTime = sentLabel.match(/\bmessage sent\b.*?(\d{1,2}):(\d{2})\s*(AM|PM)\b/iu);
      let sentTimeMinutes = null;
      if (sentTime) {
        let hour = Number(sentTime[1]);
        if (sentTime[3].toUpperCase() === 'PM' && hour < 12) hour += 12;
        if (sentTime[3].toUpperCase() === 'AM' && hour === 12) hour = 0;
        sentTimeMinutes = hour * 60 + Number(sentTime[2]);
      }
      return {
        key: hash([row.getAttribute('data-message-id') || row.getAttribute('data-mid') || '', contentText, ...mediaKeys].join('|')),
        outgoing,
        attachmentCount: media.length,
        textMatched: Boolean(cueText && text.includes(cueText)),
        // Minute-of-day only; enough for safe operator reconciliation without
        // returning message text, participant identity, or raw labels.
        sentTimeMinutes,
        // The narrator label "You sent" is NOT a server acknowledgement.
        delivered: labelList.some((label) => /^(?:Sent|Delivered|Seen)(?:$|\s+(?:at|by|on)\b)/iu.test(label)),
        pending: labelList.some((label) => /^(?:sending\b|failed to send\b|not sent\b|couldn't send\b)/iu.test(label)) || Boolean(row.querySelector('[role="progressbar"], [aria-busy="true"]')),
      };
    });
    const removeControls = Array.from(main.querySelectorAll('button[aria-label], [role="button"][aria-label]'))
      .filter((el) => !log?.contains(el) && /^(?:Remove(?: (?:attachment|photo|image|video|audio|file))?)(?:\s|$)/iu.test(el.getAttribute('aria-label') || '') && el.getBoundingClientRect().width > 0);
    return {
      version: 2,
      host: location.hostname,
      path: location.pathname,
      messengerConversation: Boolean(log && /(^|\.)facebook\.com$/iu.test(location.hostname) && /^\/messages\/t\//iu.test(location.pathname)),
      rows: evidence,
      diagnostics: { messageArticles: log?.querySelectorAll('[role="article"]').length || 0,
        messageToolbars: log?.querySelectorAll('[role="toolbar"][aria-label="Message actions"]').length || 0,
        cueInLog: Boolean(cueText && normalize(log?.innerText).includes(cueText)) },
      composerPresent: Boolean(composer),
      composerEmpty: Boolean(composer && !normalize(composer.innerText || composer.textContent) && removeControls.length === 0),
    };
  }, { cue: String(messageText || '') });
}

export function deliveryEvidenceSatisfied(before, after, { messageText = '', attachmentCount = 0 } = {}) {
  const textExpected = Boolean(String(messageText).trim());
  const sameConversation = Boolean(before?.messengerConversation && after?.messengerConversation && before.path === after.path && before.host === after.host);
  if (before?.version !== 2 || after?.version !== 2) return { confirmed: false, sameConversation, reason: 'complete_structural_evidence_required' };
  const known = new Set((before.rows ?? []).map((row) => row.key));
  const beforeTail = before.rows?.at(-1)?.key;
  const boundaryMatches = (after.rows ?? []).map((row, index) => row.key === beforeTail ? index : -1).filter(index => index >= 0);
  if (beforeTail && boundaryMatches.length !== 1) return { confirmed: false, structurallyComplete: false, sameConversation, reason: 'history_boundary_unverified' };
  // History hydration/preview updates ABOVE the last observed message do not
  // belong to this Send. Everything after that boundary must still be a new,
  // complete, uninterrupted outgoing bundle; no incoming row is skipped.
  const fresh = (after.rows ?? []).slice(beforeTail ? boundaryMatches[0] + 1 : 0);
  if (fresh.some(row => known.has(row.key))) return { confirmed: false, structurallyComplete: false, sameConversation, reason: 'history_order_unverified' };
  const outgoing = fresh.filter((row) => row.outgoing);
  const verifiedAttachmentCount = outgoing.reduce((sum, row) => sum + Number(row.attachmentCount || 0), 0);
  const allTextVerified = !textExpected || outgoing.some((row) => row.textMatched === true);
  const allMediaVerified = verifiedAttachmentCount === Number(attachmentCount);
  // Messenger may render a single upload as adjacent rows. Every new row must
  // belong to this outgoing bundle; unrelated/interleaved messages fail closed.
  const contiguousBundle = outgoing.length > 0 && outgoing.length === fresh.length
    && outgoing.every((row) => (row.attachmentCount > 0 || row.textMatched) && row.pending !== true);
  const structurallyComplete = Boolean(sameConversation && after.composerPresent && after.composerEmpty === true
    && contiguousBundle && allTextVerified && allMediaVerified);
  return {
    confirmed: Boolean(structurallyComplete && outgoing.at(-1)?.delivered === true),
    structurallyComplete,
    sameConversation, allTextVerified, allMediaVerified, verifiedAttachmentCount,
    composerCleared: after?.composerEmpty === true,
    candidateRowKeys: structurallyComplete ? outgoing.map((row) => row.key) : [],
  };
}

// Some current Messenger builds omit a Sent/Delivered label on a new outgoing
// row. An optimistic local row is not success. A structurally complete row that
// disappears on reload is also not success. Only the exact post-Send row keys
// surviving a full server-backed reload can replace the missing acknowledgement.
export function deliveryPersistenceSatisfied(observed, persisted, candidate) {
  const keys = Array.isArray(candidate?.candidateRowKeys) ? candidate.candidateRowKeys.filter(Boolean) : [];
  const sameConversation = Boolean(observed?.messengerConversation && persisted?.messengerConversation
    && observed.host === persisted.host && observed.path === persisted.path);
  if (observed?.version !== 2 || persisted?.version !== 2 || candidate?.structurallyComplete !== true || !keys.length) {
    return { confirmed: false, sameConversation, reason: 'complete_persistence_evidence_required' };
  }
  const rowsByKey = new Map((persisted.rows ?? []).map((row) => [row.key, row]));
  const observedByKey = new Map((observed.rows ?? []).map((row) => [row.key, row]));
  const rows = keys.map((key) => rowsByKey.get(key));
  const confirmed = Boolean(sameConversation && persisted.composerPresent && persisted.composerEmpty === true
    && rows.every((row) => row?.outgoing === true && row?.pending !== true
      && Number(row.attachmentCount || 0) === Number(observedByKey.get(row.key)?.attachmentCount || 0)
      && (observedByKey.get(row.key)?.textMatched !== true || row.textMatched === true)));
  return {
    confirmed,
    sameConversation,
    persistedRowCount: rows.filter(Boolean).length,
    candidateRowCount: keys.length,
    composerCleared: persisted?.composerEmpty === true,
  };
}

export async function captureComposerEvidence(page, targetGroup, messageText) {
  return page.evaluate(({ group, expectedText }) => {
    const normalize = (value) => String(value || '').replace(/\s+/gu, ' ').trim();
    const main = document.querySelector('[role="main"]') || document.body;
    const log = Array.from(main.querySelectorAll('[role="log"]')).at(-1);
    const composer = Array.from(main.querySelectorAll('[role="textbox"][contenteditable="true"]')).find((el) => normalize(el.getAttribute('aria-label')).toLowerCase() === `write to ${group}`.toLowerCase());
    const controls = Array.from(main.querySelectorAll('button[aria-label], [role="button"][aria-label]')).filter((el) => !log?.contains(el) && el.getBoundingClientRect().width > 0);
    const removes = controls.filter((el) => /^Remove(?: (?:attachment|photo|image|video|audio|file))?(?:\s|$)/iu.test(el.getAttribute('aria-label') || ''));
    const progress = Array.from(main.querySelectorAll('[role="progressbar"], [aria-busy="true"]')).some((el) => !log?.contains(el) && el.getBoundingClientRect().width > 0);
    const errors = Array.from(main.querySelectorAll('[role="alert"], [role="status"]')).some((el) => !log?.contains(el) && /(?:failed|couldn't|cannot|unable to) upload|file too large|unsupported file/iu.test(el.textContent || ''));
    const files = Array.from(main.querySelectorAll('input[type="file"]')).flatMap((el) => Array.from(el.files || []).map((file) => ({ name: file.name, size: file.size })));
    const composerText = composer?.innerText || composer?.textContent || '';
    return { composerPresent: Boolean(composer), textMatches: Boolean(composer && normalize(composerText) === normalize(expectedText)), textEmpty: Boolean(composer && !normalize(composerText)), attachmentCount: removes.length, files, uploadBusy: progress, uploadFailed: errors };
  }, { group: targetGroup, expectedText: messageText });
}
