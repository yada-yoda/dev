// SceneSeed — host-side suggestions data layer
//
// This module is the HOST counterpart to submissions.js (which is for the
// audience). Host can list every suggestion under a show, toggle favorite/
// hidden/used flags, and delete. All access is gated by the Firestore rules:
//   - list: requires authed event-owner
//   - update/delete: requires authed event-owner
//
// Suggestions live at /events/{publicCode}/suggestions/{hash}.

import { db } from './firebase-config.js';
import {
  collection, doc, getDocs, onSnapshot, updateDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js';

// Live subscription to all suggestions under a show, sorted newest first
// client-side (avoids needing a composite index).
// Returns an unsubscribe function.
export function listSuggestions(publicCode, callback) {
  const ref = collection(db, 'events', publicCode, 'suggestions');
  return onSnapshot(
    ref,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const aT = a.createdAt?.toMillis?.() ?? 0;
        const bT = b.createdAt?.toMillis?.() ?? 0;
        return bT - aT;
      });
      callback(list);
    },
    (err) => {
      console.error('Failed to load suggestions:', err);
      callback([]);
    }
  );
}

const ALLOWED_FLAGS = new Set(['isFavorite', 'isHidden', 'isUsed']);

export async function setSuggestionFlag(publicCode, hash, flag, value) {
  if (!ALLOWED_FLAGS.has(flag)) {
    throw new Error(`Unknown suggestion flag: ${flag}`);
  }
  await updateDoc(doc(db, 'events', publicCode, 'suggestions', hash), {
    [flag]: !!value
  });
}

export async function deleteSuggestion(publicCode, hash) {
  await deleteDoc(doc(db, 'events', publicCode, 'suggestions', hash));
}

// One-shot fetch of all suggestions for a show, sorted newest-first.
// Used by the dashboard "Download" button on past shows where we don't
// want to set up a live listener.
export async function getAllSuggestions(publicCode) {
  const snap = await getDocs(collection(db, 'events', publicCode, 'suggestions'));
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  list.sort((a, b) => {
    const aT = a.createdAt?.toMillis?.() ?? 0;
    const bT = b.createdAt?.toMillis?.() ?? 0;
    return bT - aT;
  });
  return list;
}

// ────────────────────────── CSV export ──────────────────────────

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildSuggestionsCsv(show, suggestions) {
  // Build a roundId → label lookup so the CSV shows the readable round name.
  // Falls back to the raw roundId for orphaned suggestions whose round was
  // deleted from the show.
  const rounds = Array.isArray(show?.rounds) ? show.rounds : [];
  const roundLabel = (id) => {
    if (!id) return '';
    const r = rounds.find((rr) => rr.id === id);
    return r ? r.label : id;
  };
  const header = ['Time', 'Round', 'Name', 'Suggestion', 'Favorite', 'Hidden', 'Used'];
  const lines = [header.map(csvCell).join(',')];
  for (const s of suggestions) {
    const t = s.createdAt?.toDate?.()?.toISOString() ?? '';
    lines.push([
      t,
      roundLabel(s.roundId),
      s.submitterName || '',
      s.text || '',
      s.isFavorite ? 'yes' : '',
      s.isHidden ? 'yes' : '',
      s.isUsed ? 'yes' : ''
    ].map(csvCell).join(','));
  }
  // BOM + CRLF for Excel-friendly UTF-8 CSV.
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function csvFilenameFor(show) {
  const slug = (show.title || show.publicCode || 'show')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const date = (show.showStartsAt?.toDate?.() || new Date()).toISOString().slice(0, 10);
  return `${show.publicCode || 'show'}-${slug || 'show'}-${date}.csv`;
}

export function triggerCsvDownload(show, suggestions) {
  const csv = buildSuggestionsCsv(show, suggestions);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = csvFilenameFor(show);
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}
