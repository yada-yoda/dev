// SceneSeed — shows data layer + public-code generator
//
// Shows live at /events/{publicCode} where the publicCode is the doc ID.
// publicCode format: {color}-{decade}{NNN}, e.g. "coral-2042".
//   - decade: '2' for 2026–2029, '3' for 2030–2039, etc.
//   - NNN: zero-padded 3-digit number 000–999
//   - color pool grows by year-tier:
//       2026 only short colors (3–4 char)
//       2027 unlocks 5-char colors
//       2028 unlocks 6-char
//       2029 unlocks 7-char
// Older shows therefore tend to have shorter color names — a vintage signal.

import { auth, db } from './firebase-config.js';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, onSnapshot, serverTimestamp, Timestamp
} from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js';

// ────────────────────────── Public-code generator ──────────────────────────

const COLORS_3_4 = [
  'red', 'tan',
  'aqua', 'blue', 'cyan', 'gold', 'gray', 'jade', 'lime', 'mint',
  'navy', 'pink', 'plum', 'rose', 'ruby', 'rust', 'sand', 'snow', 'teal'
];
const COLORS_5 = [
  'amber', 'azure', 'beige', 'black', 'brown', 'coral', 'ebony', 'green',
  'ivory', 'khaki', 'lemon', 'lilac', 'mauve', 'ochre', 'olive', 'peach',
  'pearl', 'slate', 'wheat', 'white'
];
const COLORS_6 = [
  'bronze', 'cherry', 'cobalt', 'copper', 'denim', 'ginger', 'indigo',
  'maroon', 'orange', 'purple', 'salmon', 'sienna', 'silver', 'tomato',
  'violet', 'yellow'
];
const COLORS_7 = [
  'crimson', 'emerald', 'magenta', 'mustard', 'saffron', 'scarlet'
];

function colorPool() {
  const offset = new Date().getFullYear() - 2026;
  if (offset >= 3) return [...COLORS_3_4, ...COLORS_5, ...COLORS_6, ...COLORS_7];
  if (offset >= 2) return [...COLORS_3_4, ...COLORS_5, ...COLORS_6];
  if (offset >= 1) return [...COLORS_3_4, ...COLORS_5];
  return COLORS_3_4;
}

function decadeDigit() {
  // 2026–2029 → "2", 2030–2039 → "3", 2040–2049 → "4", …
  return String(Math.floor(new Date().getFullYear() / 10) - 200);
}

function rollPublicCode() {
  const pool = colorPool();
  const color = pool[Math.floor(Math.random() * pool.length)];
  const seq = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `${color}-${decadeDigit()}${seq}`;
}

export async function generateUniquePublicCode(maxAttempts = 12) {
  for (let i = 0; i < maxAttempts; i++) {
    const code = rollPublicCode();
    const snap = await getDoc(doc(db, 'events', code));
    if (!snap.exists()) return code;
  }
  throw new Error('Could not generate a unique public code. Try again.');
}

// ────────────────────────── Helpers ──────────────────────────

function requireUser() {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return user;
}

function userTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

const VALID_NAME_MODES = new Set(['off', 'optional', 'required']);
function validNameMode(v) {
  return VALID_NAME_MODES.has(v) ? v : 'off';
}

function toTimestamp(input) {
  if (!input) return null;
  if (input instanceof Timestamp) return input;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return Timestamp.fromDate(d);
}

// ────────────────────────── Shows CRUD ──────────────────────────

export async function createShow(groupId, fields) {
  const user = requireUser();
  const title = (fields.title || '').trim();
  if (!title) throw new Error('Show title required');

  const showStartsAt = toTimestamp(fields.showStartsAt);
  const showEndsAt = toTimestamp(fields.showEndsAt);
  const submissionOpenAt = toTimestamp(fields.submissionOpenAt);
  const submissionCloseAt = toTimestamp(fields.submissionCloseAt);
  if (!showStartsAt || !showEndsAt || !submissionOpenAt || !submissionCloseAt) {
    throw new Error('All show times are required');
  }

  const publicCode = await generateUniquePublicCode();

  const data = {
    ownerId: user.uid,
    groupId,
    title,
    venueName: (fields.venueName || '').trim(),
    showStartsAt,
    showEndsAt,
    submissionOpenAt,
    submissionCloseAt,
    timezone: fields.timezone || userTimezone(),
    promptText: (fields.promptText || '').trim(),
    publicCode,
    manualStatus: 'auto',
    maxSuggestionLength: Number(fields.maxSuggestionLength) || 140,
    profanityFilterEnabled: fields.profanityFilterEnabled !== false,
    duplicateDetectionEnabled: fields.duplicateDetectionEnabled !== false,
    nameCollection: validNameMode(fields.nameCollection),
    shareEnabled: false,
    shareExpiresAt: null,
    createdAt: serverTimestamp()
  };

  await setDoc(doc(db, 'events', publicCode), data);
  return publicCode;
}

// Live subscription to all shows under a given group, sorted by showStartsAt asc client-side.
export function listShowsByGroup(groupId, callback) {
  const user = requireUser();
  const q = query(
    collection(db, 'events'),
    where('ownerId', '==', user.uid),
    where('groupId', '==', groupId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const shows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      shows.sort((a, b) => {
        const aT = a.showStartsAt?.toMillis?.() ?? 0;
        const bT = b.showStartsAt?.toMillis?.() ?? 0;
        return aT - bT;
      });
      callback(shows);
    },
    (err) => {
      console.error('Failed to load shows:', err);
      callback([]);
    }
  );
}

export async function getShow(publicCode) {
  const snap = await getDoc(doc(db, 'events', publicCode));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function updateShow(publicCode, fields) {
  const updates = {};
  if (fields.title !== undefined) {
    const t = fields.title.trim();
    if (!t) throw new Error('Show title required');
    updates.title = t;
  }
  if (fields.venueName !== undefined) updates.venueName = fields.venueName.trim();
  if (fields.promptText !== undefined) updates.promptText = fields.promptText.trim();
  if (fields.showStartsAt !== undefined) updates.showStartsAt = toTimestamp(fields.showStartsAt);
  if (fields.showEndsAt !== undefined) updates.showEndsAt = toTimestamp(fields.showEndsAt);
  if (fields.submissionOpenAt !== undefined) updates.submissionOpenAt = toTimestamp(fields.submissionOpenAt);
  if (fields.submissionCloseAt !== undefined) updates.submissionCloseAt = toTimestamp(fields.submissionCloseAt);
  if (fields.timezone !== undefined) updates.timezone = fields.timezone;
  if (fields.manualStatus !== undefined) updates.manualStatus = fields.manualStatus;
  if (fields.maxSuggestionLength !== undefined) updates.maxSuggestionLength = Number(fields.maxSuggestionLength) || 140;
  if (fields.profanityFilterEnabled !== undefined) updates.profanityFilterEnabled = !!fields.profanityFilterEnabled;
  if (fields.duplicateDetectionEnabled !== undefined) updates.duplicateDetectionEnabled = !!fields.duplicateDetectionEnabled;
  if (fields.nameCollection !== undefined) updates.nameCollection = validNameMode(fields.nameCollection);
  if (fields.shareEnabled !== undefined) updates.shareEnabled = !!fields.shareEnabled;
  if (fields.shareExpiresAt !== undefined) updates.shareExpiresAt = toTimestamp(fields.shareExpiresAt);
  await updateDoc(doc(db, 'events', publicCode), updates);
}

export async function deleteShow(publicCode) {
  // v0.6.0+: also cascade-delete suggestions subcollection (or rely on admin tooling).
  await deleteDoc(doc(db, 'events', publicCode));
}

// One-shot fetch of every show owned by the current user (across groups).
// Used by the dashboard "Past shows" section. Sort applied by caller.
export async function getAllShowsForUser() {
  const user = requireUser();
  const q = query(
    collection(db, 'events'),
    where('ownerId', '==', user.uid)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ────────────────────────── Rounds (v0.10.0) ──────────────────────────
//
// A "round" is one of multiple prompts a host can cycle through during a
// single show ("Round 1: Location", "Round 2: Relationship", etc.). Rounds
// live as an array on the event doc. Only one round is "active" at a time;
// audience submissions are tagged with the activeRoundId and dedup'd per
// round (so the same text can be valid in different rounds).
//
// Round shape: { id: 'rXXXX', label: 'Round 1', promptText: '…' }
// Event fields: rounds: array, activeRoundId: string (empty = no round open)
//
// All round mutations use read-modify-write — the host is the only writer
// so the race window is tiny in practice.

function newRoundId() {
  // 6 random hex chars; collision odds within one show are negligible.
  return 'r' + Math.random().toString(16).slice(2, 8);
}

export async function addRound(publicCode, label, promptText) {
  const trimmedLabel = (label || '').trim() || 'Round';
  const trimmedPrompt = (promptText || '').trim();
  if (!trimmedPrompt) throw new Error('Round prompt required');
  const show = await getShow(publicCode);
  if (!show) throw new Error('Show not found');
  const rounds = Array.isArray(show.rounds) ? show.rounds.slice() : [];
  // Default label "Round N" if user left it blank
  const finalLabel = label && label.trim() ? trimmedLabel : `Round ${rounds.length + 1}`;
  const round = { id: newRoundId(), label: finalLabel, promptText: trimmedPrompt };
  rounds.push(round);
  await updateDoc(doc(db, 'events', publicCode), { rounds });
  return round;
}

export async function updateRound(publicCode, roundId, fields) {
  const show = await getShow(publicCode);
  if (!show) throw new Error('Show not found');
  const rounds = Array.isArray(show.rounds) ? show.rounds.slice() : [];
  const idx = rounds.findIndex((r) => r.id === roundId);
  if (idx < 0) throw new Error('Round not found');
  const next = { ...rounds[idx] };
  if (fields.label !== undefined) {
    const t = fields.label.trim();
    if (!t) throw new Error('Round label required');
    next.label = t;
  }
  if (fields.promptText !== undefined) {
    const t = fields.promptText.trim();
    if (!t) throw new Error('Round prompt required');
    next.promptText = t;
  }
  rounds[idx] = next;
  await updateDoc(doc(db, 'events', publicCode), { rounds });
}

export async function deleteRound(publicCode, roundId) {
  const show = await getShow(publicCode);
  if (!show) throw new Error('Show not found');
  const rounds = (Array.isArray(show.rounds) ? show.rounds : []).filter((r) => r.id !== roundId);
  const updates = { rounds };
  // If the deleted round was the active one, also clear activeRoundId.
  if (show.activeRoundId === roundId) updates.activeRoundId = '';
  await updateDoc(doc(db, 'events', publicCode), updates);
}

export async function setActiveRound(publicCode, roundId) {
  await updateDoc(doc(db, 'events', publicCode), { activeRoundId: roundId });
}

export async function closeAllRounds(publicCode) {
  await updateDoc(doc(db, 'events', publicCode), { activeRoundId: '' });
}

// ────────────────────────── UI helpers (exported for views) ──────────────────────────

// Round a Date to the next 15-minute mark.
export function roundUpToNext15(date = new Date()) {
  const d = new Date(date);
  const m = d.getMinutes();
  d.setMinutes(m + (15 - (m % 15)) % 15, 0, 0);
  return d;
}

// Format a Date for <input type="datetime-local"> (local time, no offset).
export function toInputValue(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : (date.toDate ? date.toDate() : new Date(date));
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Compute submission window state given a show doc.
// Returns { state: 'open'|'closed'|'before'|'after', reason: string }
export function windowState(show, now = new Date()) {
  if (show.manualStatus === 'force_open') return { state: 'open', reason: 'Force open' };
  if (show.manualStatus === 'force_closed') return { state: 'closed', reason: 'Force closed' };
  const open = show.submissionOpenAt?.toDate?.();
  const close = show.submissionCloseAt?.toDate?.();
  if (!open || !close) return { state: 'closed', reason: 'No window set' };
  if (now < open) return { state: 'before', reason: 'Window opens soon' };
  if (now > close) return { state: 'after', reason: 'Window closed' };
  return { state: 'open', reason: 'Open now' };
}
