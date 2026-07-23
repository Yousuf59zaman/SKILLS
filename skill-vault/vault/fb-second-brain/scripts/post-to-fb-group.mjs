import fs from 'node:fs/promises';
import {
  EXACT_FB_GROUPS,
  canonicalUrlsFrom,
  inferContentType,
  isMain,
  isMediaPresent,
  isProtectedMemoryPath,
  normalizeAttachments,
  normalizeText,
  printJson,
  readInput,
} from './lib.mjs';

const MAX_MESSENGER_FILE_BYTES = 25 * 1024 * 1024;

export async function prepareFbPost(input = {}) {
  const fbGroup = normalizeText(input.fb_group);
  const contentType = inferContentType(input);
  const attachments = normalizeAttachments(input);
  const urls = canonicalUrlsFrom(input.source, input.text, input.summary);

  if (input.duplicate) return blocked('duplicate', 'Duplicate content must not be reposted.', fbGroup);
  if (!isMediaPresent(input)) return blocked('text_only', 'Text-only notes are memory-only.', fbGroup);
  if (['image', 'video', 'audio'].includes(contentType) && attachments.length === 0) {
    return blocked('attachment_missing', `${contentType} content requires a local attachment path.`, fbGroup);
  }
  if (contentType === 'link' && urls.length === 0) {
    return blocked('link_missing_url', 'Link content requires a valid http(s) URL.', fbGroup);
  }
  if (!fbGroup || !EXACT_FB_GROUPS.includes(fbGroup)) {
    return blocked('memory_only_or_unknown_group', 'No eligible active Messenger group was selected.', fbGroup || null);
  }
  if (input.memory_file && isProtectedMemoryPath(input.memory_file)) {
    return blocked('protected_memory', 'Protected/private memory destinations can never be posted.', fbGroup);
  }
  if (requiresPrivacyReview(input) && !input.privacy_reviewed) {
    return blocked('privacy_review_required', 'Office/friend banter requires a privacy pass before posting.', fbGroup);
  }

  const inspectedAttachments = [];
  for (const attachment of attachments) {
    try {
      const stat = await fs.stat(attachment);
      if (!stat.isFile()) throw new Error('not a file');
      if (stat.size > MAX_MESSENGER_FILE_BYTES) {
        return blocked('attachment_too_large', `${attachment} exceeds Messenger's 25 MB upload limit.`, fbGroup);
      }
      inspectedAttachments.push({ path: attachment, size: stat.size });
    } catch (error) {
      if (error?.code === 'ENOENT') return blocked('attachment_missing', `Attachment not found: ${attachment}`, fbGroup);
      throw error;
    }
  }

  const messageText = chooseMessageText(input, contentType, urls);
  return {
    ready: true,
    target_group: fbGroup,
    browser_handoff: {
      tool: 'OpenClaw browser',
      profile: normalizeText(input.browser_profile) || 'openclaw2',
      visible: true,
      start_url: 'https://www.facebook.com/messages/',
      target_group: fbGroup,
      attachment_paths: inspectedAttachments.map((item) => item.path),
      message_text: messageText,
      verification: verificationCue(contentType, messageText, inspectedAttachments, urls),
      steps: [
        'Snapshot the visible page and verify Facebook is already logged in.',
        'If an optional chat-history restore PIN dialog appears, do not enter or request the PIN and do not choose a destructive no-restore option; dismiss only with a normal safe close, otherwise stop and notify Yousuf.',
        `Search Messenger for the exact group name: ${fbGroup}.`,
        'Open the unique matching group conversation and take a fresh snapshot.',
        'Attach each local file, if any, and wait until every upload is visibly ready.',
        'Type only message_text when it is non-empty.',
        'Send once.',
        'Take a fresh snapshot and verify the sent message or attachment appears in the conversation.',
      ],
    },
  };
}

function blocked(code, message, group) {
  return {
    ready: false,
    blocked: code,
    reason: message,
    target_group: group,
  };
}

function requiresPrivacyReview(input) {
  const memoryFile = normalizeText(input.memory_file).replace(/\\/g, '/').toLocaleLowerCase('en-US');
  const category = normalizeText(input.category).toLocaleLowerCase('en-US');
  return category === 'funny' && (
    memoryFile.endsWith('/office-funny-prompts.md') ||
    memoryFile.endsWith('/friend-group-funny-prompts.md')
  );
}

function chooseMessageText(input, contentType, urls) {
  const explicit = normalizeText(input.post_text ?? input.accompanying_text);
  if (explicit) return explicit;
  if (contentType === 'link') return urls[0] ?? normalizeText(input.source);
  return '';
}

function verificationCue(contentType, messageText, attachments, urls) {
  if (messageText) return { kind: 'text', value: messageText.slice(0, 120) };
  if (urls[0]) return { kind: 'url', value: urls[0] };
  if (attachments[0]) return { kind: contentType, value: attachments[0].path };
  return { kind: contentType, value: null };
}

if (isMain(import.meta.url)) {
  try {
    printJson(await prepareFbPost(await readInput()));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
