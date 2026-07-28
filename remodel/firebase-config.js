// ============================================================
// RemodelHQ — Firebase bridge (modular SDK v12)
//
// Auth loads eagerly so a returning user is restored on page load;
// Firestore is dynamic-imported on the first data call.
//
// ┌── ONE-TIME SETUP ──────────────────────────────────────────┐
// │ 1. Create a NEW Firebase project (Spark / free plan — no   │
// │    card required). Suggested id: remodelhq                 │
// │ 2. Build > Firestore Database > Create database            │
// │    (production mode; the rules in firestore.rules replace  │
// │    the defaults).                                          │
// │ 3. Build > Authentication > Sign-in method > enable Google.│
// │ 4. Project settings > General > Your apps > Web app.       │
// │    Copy that config into firebaseConfig below. These values│
// │    are public by design and safe to commit — the security  │
// │    boundary is firestore.rules, not this file.             │
// │ 5. Authentication > Settings > Authorized domains > add    │
// │    dev.rizzo.cc (localhost is authorized by default).      │
// │ 6. Deploy the rules:                                       │
// │      npx firebase deploy --only firestore:rules            │
// │    (run from this folder, after `npx firebase login`)      │
// │                                                            │
// │ No email address is hard-coded anywhere: whoever signs in  │
// │ and creates the first workspace becomes its owner.         │
// └────────────────────────────────────────────────────────────┘
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  connectAuthEmulator,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

// Public web config for the dedicated remodelhq project. These values are
// public by design and safe to commit — the security boundary is
// firestore.rules, not this file.
const firebaseConfig = {
  apiKey:            "AIzaSyArlIVfq0JrO-5Ggst0KMwBTQ17-2W7y8Q",
  authDomain:        "remodelhq-78a8a.firebaseapp.com",
  projectId:         "remodelhq-78a8a",
  storageBucket:     "remodelhq-78a8a.firebasestorage.app",
  messagingSenderId: "894337092701",
  appId:             "1:894337092701:web:ae6e8fdde77774750851b4"
};

// ---------- local emulator mode (development only) ----------
// Exercising the signed-in app without a real Firebase project: start the
// emulators (see tests/README notes) and load the page with ?emu=1, plus an
// optional &as=someone@example.com to choose the signed-in identity.
// Guarded by hostname, so this can never engage on the deployed site.
const EMU_PORTS = { auth: 9781, firestore: 8781 };
const _params = new URLSearchParams(location.search);
const _localHost = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
export const EMULATED = _localHost && _params.get("emu") === "1";

const EMU_CONFIG = { apiKey: "emulator-key", projectId: "demo-remodelhq", appId: "1:0:web:emulator" };

/** False until a real project is pasted in above (or the emulator is in use). */
export const CONFIGURED = EMULATED || !firebaseConfig.apiKey.startsWith("PASTE_");

const SDK_VERSION = "12.15.0";

let _app = null;
let _auth = null;
let _provider = null;
let _authReady = null;
let _fsMod = null;
let _db = null;
let _user = null;
const _authListeners = new Set();

function emit(user) {
  _user = user;
  for (const fn of _authListeners) {
    try { fn(user); } catch (err) { console.error("auth listener failed", err); }
  }
}

function ensureAuth() {
  if (_authReady) return _authReady;
  _authReady = new Promise((resolve) => {
    if (!CONFIGURED) {
      // Surface the unconfigured state instead of throwing, so the app can
      // render its setup instructions. Deferred so listeners registered by
      // later module scripts are attached before the first emit.
      setTimeout(() => { emit(null); resolve(); }, 0);
      return;
    }
    _app = initializeApp(EMULATED ? EMU_CONFIG : firebaseConfig);
    _auth = getAuth(_app);
    _auth.useDeviceLanguage();
    _provider = new GoogleAuthProvider();
    if (EMULATED) {
      connectAuthEmulator(_auth, `http://127.0.0.1:${EMU_PORTS.auth}`, { disableWarnings: true });
    }
    setPersistence(_auth, browserLocalPersistence).catch(() => { /* falls back to in-memory */ });
    let settled = false;
    onAuthStateChanged(_auth, (user) => {
      emit(user);
      if (!settled) { settled = true; resolve(); }
    });
  });
  return _authReady;
}

/** Firestore handle plus the SDK module, loaded on first use. */
export async function firestore() {
  if (!CONFIGURED) throw new Error("Firebase is not configured yet.");
  await ensureAuth();
  if (!_db) {
    _fsMod = await import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore.js`);
    _db = _fsMod.getFirestore(_app);
    if (EMULATED) _fsMod.connectFirestoreEmulator(_db, "127.0.0.1", EMU_PORTS.firestore);
  }
  return { db: _db, m: _fsMod };
}

/** Subscribe to auth changes; fires immediately with the current user. */
export function onAuth(fn) {
  _authListeners.add(fn);
  ensureAuth().then(() => fn(_user));
  return () => _authListeners.delete(fn);
}

export function currentUser() {
  return _user;
}

export async function signIn() {
  await ensureAuth();
  if (!CONFIGURED) throw new Error("Firebase is not configured yet.");
  if (EMULATED) {
    // The Auth emulator accepts an unsigned JSON identity in place of a real
    // Google ID token, so the popup flow is unnecessary locally.
    const email = (_params.get("as") || "owner@example.com").toLowerCase();
    const identity = JSON.stringify({
      sub: "emu_" + email.replace(/[^a-z0-9]/g, "_"),
      email,
      email_verified: true,
      name: email.split("@")[0]
    });
    const res = await signInWithCredential(_auth, GoogleAuthProvider.credential(identity));
    return res.user;
  }
  const res = await signInWithPopup(_auth, _provider);
  return res.user;
}

export async function signOutNow() {
  await ensureAuth();
  if (_auth) await signOut(_auth);
}

ensureAuth();
