import crypto from 'node:crypto';
import path from 'node:path';
import { canonicalMediaUrls, canonicalizeUrl, canonicalUrlsFrom, normalizeAttachments, normalizeText, perceptualHashDistance } from './lib.mjs';

export const BUNDLE_VERSION = 1;
export const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');

export function deliveryUrls(input) {
  const privacyRoute = /(?:office-funny-prompts|friend-group-funny-prompts)\.md$/iu.test(String(input.memory_file || ''));
  if (privacyRoute && input.privacy_reviewed && (typeof input.post_text === 'string' || typeof input.accompanying_text === 'string')) {
    return canonicalMediaUrls({ post_text: input.post_text ?? input.accompanying_text, canonical_urls: input.public_urls });
  }
  if (Array.isArray(input.authoritative_urls)) return canonicalMediaUrls({ canonical_urls: input.authoritative_urls });
  return canonicalMediaUrls(input);
}

// Explicit post_text (including an intentional empty string) is the reviewed
// public caption. Otherwise preserve the original text, never an AI summary.
export function bundleMessageText(input = {}) {
  const explicit = typeof input.post_text === 'string' ? input.post_text
    : typeof input.accompanying_text === 'string' ? input.accompanying_text : null;
  let text = normalizeText(explicit ?? input.text);
  if (explicit === null) {
    text = text.split('\n').filter((line) => !/^\s*\[media attached:.*\]\s*$/iu.test(line))
      .filter((line) => !/^\s*(?:save|save this|save this image|save this video|save this link|সেভ করো|সেভ কর|সংরক্ষণ করো)\s*[.!]?\s*$/iu.test(line)).join('\n').trim();
    text = text.split('\n').filter((line) => !/^\s*(?:please\s+)?save\s+(?:(?:all\s+)?(?:these|this|the)\s+)?(?:images?|photos?|videos?|links?|album|bundle|everything)(?:\s+together)?\s*[.!]?\s*$/iu.test(line)).join('\n').trim();
    text = text.replace(/^(?:save|save koro|সেভ করো)[,:]\s*/iu, '');
    // This strips only a routing prefix immediately before a URL, not prose.
    text = text.replace(/^(?:save|সেভ করো|সংরক্ষণ করো)[, :]+(?=https?:\/\/)/iu, '');
  }
  const urls = deliveryUrls(input);
  // Keep surrounding caption verbatim but remove tracking from its actual URLs.
  text = text.replace(/https?:\/\/[^\s<>"\[\]]+/giu, (value) => {
    const trailing = value.match(/[),.!;]+$/u)?.[0] ?? '';
    const bare = trailing ? value.slice(0, -trailing.length) : value;
    return canonicalizeUrl(bare) + trailing;
  });
  const present = new Set(canonicalUrlsFrom(text));
  const missing = urls.filter((url) => !present.has(url));
  return [text, missing.join('\n')].filter(Boolean).join(text ? '\n\n' : '\n');
}

export function makeBundleManifest(input, hashes) {
  const paths = normalizeAttachments(input);
  if (paths.length !== hashes.length || hashes.some((entry) => !/^[a-f0-9]{64}$/iu.test(entry.sha256 ?? '') || !Number.isSafeInteger(entry.size) || entry.size < 0)) {
    throw new Error('bundle_attachment_integrity_missing');
  }
  if (input.expected_attachment_count !== undefined && Number(input.expected_attachment_count) !== paths.length) throw new Error('bundle_attachment_count_mismatch');
  if (input.inbound_bundle_complete === false) throw new Error('inbound_bundle_incomplete');
  const messageText = bundleMessageText(input);
  const content = {
    version: BUNDLE_VERSION,
    attachments: hashes.map((entry, index) => ({ ordinal: index + 1, sha256: entry.sha256.toLowerCase(), size: entry.size })),
    attachment_count: hashes.length,
    canonical_urls: deliveryUrls(input).sort(),
    message_text_sha256: digest(messageText),
    message_text_length: messageText.length,
  };
  return { ...content, fingerprint: digest(JSON.stringify(content)) };
}

export function bundleMatchesManifest(expected, actual) {
  return Boolean(expected && actual && expected.version === BUNDLE_VERSION
    && expected.fingerprint === actual.fingerprint && JSON.stringify(expected) === JSON.stringify(actual));
}

// No ANY-overlap matching: partial albums, new links, changed order, and new
// captions are different deliveries. Perceptual compatibility is intentionally
// limited to one re-encoded image with identical accompanying content.
export function equivalentBundle(job, input, { allowPerceptual = false } = {}) {
  const incoming = input.bundle;
  const existing = job.bundle;
  if (!incoming || !existing) return null;
  if (bundleMatchesManifest(existing, incoming)) return 'bundle_fingerprint';
  if (existing.attachment_count !== 1 || incoming.attachment_count !== 1
    || existing.message_text_sha256 !== incoming.message_text_sha256
    || JSON.stringify(existing.canonical_urls) !== JSON.stringify(incoming.canonical_urls)) return null;
  if (!allowPerceptual) return null;
  const left = job.attachment_hashes?.[0]?.perceptual_hash;
  const right = input.attachment_hashes?.[0]?.perceptual_hash;
  if (left && right && perceptualHashDistance(left, right) <= 6) return 'perceptual_hash';
  return null;
}

export function attachmentKind(file) {
  const ext = path.extname(file).toLowerCase();
  if (/^\.(?:jpg|jpeg|png|gif|webp|bmp|heic|avif)$/u.test(ext)) return 'image';
  if (/^\.(?:mp4|mov|mkv|webm|avi|m4v)$/u.test(ext)) return 'video';
  if (/^\.(?:mp3|wav|ogg|m4a|aac|flac|opus)$/u.test(ext)) return 'audio';
  return 'file';
}

export function validateDeliveryReceipt(job, receipt) {
  const bundle = job.bundle;
  if (!bundle || !receipt || receipt.version !== BUNDLE_VERSION
    || receipt.bundle_fingerprint !== bundle.fingerprint
    || receipt.target_group !== job.fb_group
    || receipt.attachment_count !== bundle.attachment_count
    || receipt.message_text_sha256 !== bundle.message_text_sha256
    || receipt.link_count !== bundle.canonical_urls.length
    || receipt.all_parts_verified !== true || receipt.composer_empty !== true) {
    throw new Error('complete_requires_full_bundle_receipt');
  }
  return { version: BUNDLE_VERSION, bundle_fingerprint: bundle.fingerprint, target_group: job.fb_group, attachment_count: bundle.attachment_count, message_text_sha256: bundle.message_text_sha256, link_count: bundle.canonical_urls.length, all_parts_verified: true, composer_empty: true };
}
