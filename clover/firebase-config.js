// ============================================================
// Clover — Firebase auth + data bridge  (modular SDK v12)
//
// Loading strategy mirrors the sibling apps in this repo:
//   * Auth loaded eagerly so onAuthStateChanged fires for
//     returning users on page load.
//   * Firestore dynamic-imported lazily on first data call.
//
// ┌── SETUP (Phase 0, one-time) ───────────────────────────┐
// │ 1. Create a NEW dedicated Firebase project (do NOT reuse│
// │    another app's project). Suggested id: clover-finance │
// │ 2. Add a Web App, enable Google as a sign-in provider.  │
// │ 3. Paste that project's web config into firebaseConfig  │
// │    below (these values are public by design — safe to   │
// │    commit; the security boundary is firestore.rules).   │
// │ 4. Authorize your domain: Authentication → Settings →   │
// │    Authorized domains → add  dev.rizzo.cc               │
// │ 5. Sign in once; copy the account ID shown in the app's │
// │    setup banner into firestore.rules (OWNER allowlist).  │
// │ 6. (Optional) One Tap: paste the Web OAuth client ID    │
// │    into ONE_TAP_CLIENT_ID to enable one-tap sign-in.    │
// └────────────────────────────────────────────────────────┘
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

// Public web config for the dedicated clover-finance project. These values
// are public by design (safe to commit); the security boundary is
// firestore.rules, which allowlists the owner's UID.
const firebaseConfig = {
  apiKey:            "AIzaSyCbjY9mvIMKNKseHQXW3kfgDgWlWRrNTzY",
  authDomain:        "clover-finance.firebaseapp.com",
  projectId:         "clover-finance",
  storageBucket:     "clover-finance.firebasestorage.app",
  messagingSenderId: "102155680656",
  appId:             "1:102155680656:web:28f833d7ee9d1cf4b9d115"
};

// Optional — Web OAuth client ID for Google One Tap (leave "" to disable).
const ONE_TAP_CLIENT_ID = "";

const CONFIGURED = !firebaseConfig.apiKey.startsWith("PASTE_");
window.cloverConfigured = CONFIGURED;

let app = null, auth = null, googleProvider = null;
let _readyPromise = null;
let _fsMod = null, _db = null;
let _lastUser = null;

function emitAuth(user) {
  _lastUser = user;
  window.dispatchEvent(new CustomEvent('cloverAuthChanged', { detail: user }));
}

function ensureAuth() {
  if (_readyPromise) return _readyPromise;
  _readyPromise = new Promise((resolve) => {
    if (!CONFIGURED) {
      // No project wired yet — surface the setup state without crashing.
      // Deferred so listeners registered by later module scripts (app.js)
      // are attached before this initial event fires.
      setTimeout(() => emitAuth(null), 0);
      return resolve();
    }
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    auth.useDeviceLanguage();
    googleProvider = new GoogleAuthProvider();
    onAuthStateChanged(auth, (user) => {
      emitAuth(user);
      if (!user && ONE_TAP_CLIENT_ID) maybePromptOneTap();
    });
    resolve();
  });
  return _readyPromise;
}

async function ensureFirestore() {
  if (_db) return { db: _db, m: _fsMod };
  await ensureAuth();
  _fsMod = await import("https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js");
  _db = _fsMod.getFirestore(app);
  return { db: _db, m: _fsMod };
}

// ---------- Google One Tap (auto-select) ----------
// Loads Google Identity Services and, if the user is already signed into
// Google in this browser, offers one-tap sign-in. No-ops until a client ID
// is configured. This is the "feels like PawPrints auto-login" convenience;
// Firebase sessions still persist per-project after the first sign-in.
let _gisLoaded = false;
function maybePromptOneTap() {
  if (!ONE_TAP_CLIENT_ID) return;
  const prompt = () => {
    google.accounts.id.initialize({
      client_id: ONE_TAP_CLIENT_ID,
      auto_select: true,
      callback: async (resp) => {
        try {
          const cred = GoogleAuthProvider.credential(resp.credential);
          await signInWithCredential(auth, cred);
        } catch (e) { console.warn('One Tap sign-in failed:', e); }
      }
    });
    google.accounts.id.prompt();
  };
  if (_gisLoaded && window.google?.accounts?.id) return prompt();
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client';
  s.async = true; s.defer = true;
  s.onload = () => { _gisLoaded = true; if (window.google?.accounts?.id) prompt(); };
  document.head.appendChild(s);
}

// ============================================================
// Public auth surface
// ============================================================
window.cloverAuth = {
  init: ensureAuth,
  currentUser: () => _lastUser,
  signIn: async () => {
    await ensureAuth();
    if (!CONFIGURED) { alert('Firebase project not configured yet — see SETUP in firebase-config.js'); return null; }
    const res = await signInWithPopup(auth, googleProvider);
    return res.user;
  },
  signOut: async () => { await ensureAuth(); if (auth) await signOut(auth); }
};

// ============================================================
// Data surface — scaffold for Phase 1. Model:
//   finance/{uid}                     ← meta doc
//   finance/{uid}/years/{yyyy}        ← per-year doc
// ============================================================
window.cloverData = {
  getMeta: async (uid) => {
    const { db, m } = await ensureFirestore();
    const snap = await m.getDoc(m.doc(db, 'finance', uid));
    return snap.exists() ? snap.data() : null;
  },
  saveMeta: async (uid, data) => {
    const { db, m } = await ensureFirestore();
    return m.setDoc(m.doc(db, 'finance', uid), data, { merge: true });
  },
  getYear: async (uid, year) => {
    const { db, m } = await ensureFirestore();
    const snap = await m.getDoc(m.doc(db, 'finance', uid, 'years', String(year)));
    return snap.exists() ? snap.data() : null;
  },
  saveYear: async (uid, year, data) => {
    const { db, m } = await ensureFirestore();
    return m.setDoc(m.doc(db, 'finance', uid, 'years', String(year)), data, { merge: true });
  }
};

ensureAuth();
