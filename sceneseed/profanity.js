// SceneSeed — content filter for audience submissions.
//
// Two lists:
//   PROFANITY — common four-letter words. Controlled by the per-show
//               profanityFilterEnabled toggle. Some shows are fine letting
//               this through; some venues aren't.
//   HATE      — slurs and clear hate-speech terms. Always blocked,
//               regardless of the show's filter setting. Stored base64-
//               encoded so the file isn't itself unpleasant to read.
//
// Detection is substring-against-a-deobfuscated copy of the input — we
// lowercase, undo common leetspeak (4→a, 3→e, 0→o, $→s, etc.), and strip
// whitespace/punctuation so "s h i t" or "5h1t" don't slip through.
//
// This runs CLIENT-SIDE only (in the audience submission flow). A truly
// determined attacker could bypass by hitting Firestore directly. For an
// improv-show context the surface area is tiny — accept the trade-off for
// v1.0.0; server-side enforcement via a Cloud Function is a possible v1.1.

// ─── Common profanity (toggle-controlled) ────────────────────────────
// Plain text — these are mild enough to read at a glance.
const PROFANITY = [
  'fuck', 'shit', 'piss', 'cock', 'dick', 'pussy', 'asshole', 'bitch',
  'bastard', 'cunt', 'twat', 'prick', 'wanker', 'bollocks', 'bullshit',
  'motherfucker', 'fucker', 'jackass', 'dumbass', 'slut', 'whore', 'tits',
  'titty', 'boobs', 'crap', 'fag', 'douche', 'jizz', 'wank', 'arse'
];

// ─── Hate terms (always blocked, regardless of toggle) ──────────────
// Base64-encoded to keep the source readable. These are the categories of
// terms we never want crossing the stage: racial slurs, anti-LGBTQ slurs,
// anti-disability slurs, anti-religious slurs.
const HATE_B64 = [
  // racial
  'bmlnZ2Vy', 'bmlnZ2E=', 'Y2hpbms=', 'Z29vaw==', 'amFw',
  'c3BpYw==', 'd2V0YmFjaw==', 'YmVhbmVy', 'a2lrZQ==', 'aGVlYg==',
  'cmFnaGVhZA==', 'dG93ZWxoZWFk', 'cmVkc2tpbg==',
  // anti-LGBTQ
  'ZmFnZ290', 'dHJhbm55', 'ZHlrZQ==',
  // anti-disability
  'cmV0YXJk', 'cmV0YXJkZWQ=',
  // anti-religious
  'cGFraQ=='
];
const HATE = HATE_B64.map((b) => atob(b));

// ─── Leetspeak / whitespace deobfuscation ───────────────────────────
function deobfuscate(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[4@]/g, 'a')
    .replace(/3/g, 'e')
    .replace(/[1!|]/g, 'i')
    .replace(/0/g, 'o')
    .replace(/[5$]/g, 's')
    .replace(/7/g, 't')
    .replace(/[\s\-_.,;:'"`*~/\\]/g, ''); // strip whitespace + common separators
}

// Substring match; the deobfuscation step handles most variants.
function containsAny(haystack, list) {
  for (const term of list) {
    if (term && haystack.includes(term)) return term;
  }
  return null;
}

// Public API. Returns { ok: true } or { ok: false, reason }.
//   reason === 'hate'      → always blocked, regardless of allowProfanity
//   reason === 'profanity' → blocked only when allowProfanity is false
export function checkProfanity(text, { allowProfanity = false } = {}) {
  const norm = deobfuscate(text);
  if (!norm) return { ok: true };
  if (containsAny(norm, HATE)) return { ok: false, reason: 'hate' };
  if (!allowProfanity && containsAny(norm, PROFANITY)) {
    return { ok: false, reason: 'profanity' };
  }
  return { ok: true };
}
