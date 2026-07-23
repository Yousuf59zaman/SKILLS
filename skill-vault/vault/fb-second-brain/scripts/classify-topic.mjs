import path from 'node:path';
import {
  ACTIVE_ROUTES,
  inferContentType,
  isMain,
  isMediaPresent,
  isProtectedMemoryPath,
  normalizeAttachments,
  normalizeCategory,
  normalizeText,
  printJson,
  readInput,
} from './lib.mjs';

const CATEGORY_RULES = Object.freeze({
  private: [
    'password', 'passcode', 'otp', 'token', 'secret', 'api key', 'login', 'credential', 'bank', 'banking',
    'account number', 'nid', 'passport', 'card number', 'cvv', 'private', 'confidential',
  ],
  openclaw: ['openclaw', 'molty', 'clawdbot', 'gateway', 'cron', 'agent routing', 'automation workflow'],
  relationship: ['relationship', 'wife', 'girlfriend', 'boyfriend', 'ex ', 'bou ', 'gf ', 'bf ', 'romantic line'],
  career: ['career', 'job', 'jobs', 'interview', 'resume', 'cv ', 'linkedin', 'freelance', 'startup', 'business idea'],
  learning: ['learn', 'learning', 'course', 'tutorial', 'book', 'research paper', 'roadmap', 'study note'],
  tech: [
    'backend', 'frontend', 'system design', 'database', 'api ', 'react', 'vue', 'nuxt', 'next.js', 'laravel',
    'nestjs', 'node.js', 'javascript', 'typescript', 'mongodb', 'postgres', 'docker', 'devops', 'cloud', 'architecture',
  ],
  'meme-template': ['meme template', 'template meme', 'reaction template', 'blank meme', 'reusable meme screenshot'],
  funny: [
    'funny', 'meme', 'joke', 'roast', 'banter', 'savage', 'punchline', 'one-liner', 'one liner', 'office funny',
    'friend group', 'bakar', 'moja', 'হাসির', 'জোক', 'ট্রল',
  ],
  'story-post': ['story idea', 'story caption', 'facebook story', 'instagram story', 'status idea', 'story te', 'story dibo'],
  'caption-song': [
    'caption', 'pose', 'song', 'lyric', 'lyrics', 'music', 'audio', 'voice note', 'gaan', 'gan ', 'গান', 'গানের',
  ],
  travel: [
    'travel', 'trip', 'tour', 'day trip', 'ghuraghuri', 'ghurbo', 'photogenic', 'place to visit', 'resort',
    'beach', 'mountain', 'purbachal', 'cox', 'ভ্রমণ', 'ঘুরতে',
  ],
  'food-health': [
    'food', 'restaurant', 'cafe', 'recipe', 'meal', 'dish', 'chicken', 'pizza', 'burger', 'biryani', 'kacchi',
    'health', 'fitness', 'gym', 'workout', 'nutrition', 'diet', 'protein', 'vlog', 'খাবার', 'রেস্টুরেন্ট',
  ],
  'gift-shopping': [
    'gift', 'shopping', 'buy later', 'kinbo', 'kine dibo', 'saree', 'dress', 'shirt', 'pajama', 'boxer',
    'baby gift', 'wedding shopping', 'biye', 'wife shopping', 'bou ke', 'উপহার', 'কিনবো',
  ],
  'ghotona-kobita': [
    'ghotona', 'incident', 'real-life story', 'real life story', 'kobita', 'poem', 'poetry', 'handwritten poem',
    'ঘটনা', 'কবিতা',
  ],
  perform: [
    'perform', 'recreate', 'shoot concept', 'reel idea', 'pose reference', 'stage idea', 'dance move', 'practice move',
    'kickup', 'act this', 'make a reel', 'photoshoot',
  ],
});

const MEMORY_ONLY_CATEGORIES = new Set(['private', 'tech', 'learning', 'career', 'openclaw', 'relationship', 'personal', 'unknown']);

export function classifyTopic(input = {}) {
  const type = inferContentType(input);
  const mediaPresent = isMediaPresent(input);
  const attachmentNames = normalizeAttachments(input).map((item) => path.basename(item)).join(' ');
  const haystack = [input.title, input.text, input.summary, input.source, attachmentNames]
    .map(normalizeText)
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('en-US');

  const explicitMemory = normalizeText(input.memory_file);
  let category = normalizeCategory(input.category);
  let confidence = category ? 1 : 0;
  const reasons = [];

  if (explicitMemory && isProtectedMemoryPath(explicitMemory)) {
    category = category || 'private';
    confidence = 1;
    reasons.push('Explicit destination is on the memory-only/protected list.');
  }

  if (!category) {
    const scores = [];
    for (const [candidate, keywords] of Object.entries(CATEGORY_RULES)) {
      const matched = keywords.filter((keyword) => haystack.includes(keyword));
      if (matched.length) scores.push({ category: candidate, score: matched.length, matched });
    }

    scores.sort((a, b) => b.score - a.score || categoryPriority(a.category) - categoryPriority(b.category));
    if (scores.length) {
      category = scores[0].category;
      confidence = Math.min(0.98, 0.58 + scores[0].score * 0.12);
      reasons.push(`Matched: ${scores[0].matched.join(', ')}`);
      if (scores[1] && scores[1].score === scores[0].score && scores[1].category !== scores[0].category) {
        confidence = Math.min(confidence, 0.64);
        reasons.push(`Close alternative: ${scores[1].category}`);
      }
    }
  }

  category ||= 'unknown';
  const route = ACTIVE_ROUTES[category] ?? null;
  const memoryFile = explicitMemory || chooseMemoryFile(category, type, haystack, route?.memory_file);
  const memoryOnly = MEMORY_ONLY_CATEGORIES.has(category) || Boolean(memoryFile && isProtectedMemoryPath(memoryFile));
  const fbGroup = memoryOnly ? null : route?.fb_group ?? null;
  const postAllowed = Boolean(mediaPresent && fbGroup && !memoryOnly);
  const needsReview = !memoryFile || category === 'unknown' || confidence < 0.66;

  if (!mediaPresent) reasons.push('Text-only content must remain memory-only.');
  if (memoryOnly) reasons.push('Category or destination is memory-only.');
  if (postAllowed) reasons.push(`Eligible media route: ${fbGroup}.`);

  return {
    category,
    confidence: Number(confidence.toFixed(2)),
    needs_review: needsReview,
    content_type: type,
    media_present: mediaPresent,
    memory_file: memoryFile,
    fb_group: fbGroup,
    post_allowed: postAllowed,
    reasons,
  };
}

function categoryPriority(category) {
  const order = ['private', 'openclaw', 'relationship', 'career', 'learning', 'tech'];
  const index = order.indexOf(category);
  return index === -1 ? 100 : index;
}

function chooseMemoryFile(category, type, haystack, fallback) {
  if (category === 'funny') {
    if (/\b(office|boss|colleague|workplace)\b/u.test(haystack)) return 'memory/office-funny-prompts.md';
    if (/\b(friend|friends|group|roast|banter|bakar)\b/u.test(haystack)) return 'memory/friend-group-funny-prompts.md';
    if (/\b(punchline|one[ -]?liner|reply line|short line|savage line)\b/u.test(haystack)) return 'memory/punchlines.md';
    return 'memory/funny-posts.md';
  }

  if (category === 'caption-song') {
    if (type === 'audio' || /\b(audio|voice note|sound effect)\b/u.test(haystack)) return 'memory/audio.md';
    if (/\b(song|lyric|lyrics|music|gaan|gan)\b/u.test(haystack) || /গান/u.test(haystack)) return 'memory/song-boi.md';
    return 'memory/captions.md';
  }

  if (category === 'travel') {
    if (/\b(photogenic|place|cafe|hangout|resort|restaurant|where to go|ghurbo)\b/u.test(haystack)) {
      return 'memory/travel-photogenic-places.md';
    }
    return 'memory/travel.md';
  }

  if (category === 'food-health') {
    if (/\b(health|fitness|gym|workout|nutrition|diet|protein|mental health)\b/u.test(haystack)) {
      return 'memory/health-fitness/health-fitness.md';
    }
    if (/\b(food|restaurant|cafe|recipe|meal|dish|try|chicken|pizza|burger|biryani|kacchi)\b/u.test(haystack)) {
      return 'memory/food-to-try.md';
    }
    return 'memory/food.md';
  }

  if (category === 'gift-shopping') {
    if (/\b(baby|child|kid)\b/u.test(haystack)) return 'memory/baby-gift-ideas.md';
    if (/\b(wife|bou|saree|future wife)\b/u.test(haystack)) return 'memory/wife-shopping-references.md';
    if (/\b(self|myself|shirt|pajama|boxer|clothing)\b/u.test(haystack)) return 'memory/self-clothing-references.md';
    return 'memory/gift-boi.md';
  }

  if (category === 'ghotona-kobita') {
    if (/\b(kobita|poem|poetry|handwritten)\b/u.test(haystack) || /কবিতা/u.test(haystack)) return 'memory/kobita-boi.md';
    return 'memory/ghotona-boi.md';
  }

  if (category === 'private') {
    if (/\b(bank|banking|account number|card number|cvv)\b/u.test(haystack)) return 'memory/banking-details.md';
    if (/\b(password|passcode|otp|token|secret|api key|login|credential)\b/u.test(haystack)) {
      return 'memory/service-login-references.md';
    }
    return 'memory/personal-context.md';
  }

  if (category === 'tech') {
    if (/\b(frontend|react|vue|nuxt|next\.js|css|ui)\b/u.test(haystack)) return 'memory/frontend/frontend-ui.md';
    if (/\b(devops|cloud|docker|kubernetes)\b/u.test(haystack)) return 'memory/devops/devops-cloud.md';
    if (/\b(backend|api|nestjs|node\.js|database|mongodb|postgres)\b/u.test(haystack)) return 'memory/backend/backend-notes.md';
    if (/\b(system design|distributed system|scalability)\b/u.test(haystack)) return 'memory/system-design/system-design.md';
    return 'memory/backend/backend-notes.md';
  }

  if (category === 'learning') return 'memory/learning/learning-notes.md';
  if (category === 'career') {
    if (/\b(startup|business idea)\b/u.test(haystack)) return 'memory/startup-ideas/startup-business-ideas.md';
    return 'memory/jobs/career-notes.md';
  }
  if (category === 'openclaw') return 'memory/openclaw/openclaw-notes.md';
  if (category === 'relationship') return 'memory/relationship-lines.md';
  if (category === 'personal') return 'memory/personal-context.md';
  return fallback || null;
}

if (isMain(import.meta.url)) {
  try {
    printJson(classifyTopic(await readInput()));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
