// ============================================================
// Firebase configuration + auth/data bridge
// Modular SDK (v12). Loaded as <script type="module">.
//
// Loading strategy (v0.8.2):
//   * Auth module loaded eagerly so onAuthStateChanged can fire
//     for returning-signed-in users on page load.
//   * App init + auth state subscription wrapped in
//     requestIdleCallback so they yield to first paint.
//   * Firestore + Storage modules are dynamic-imported lazily —
//     only fetched on the first call into firestoreApi /
//     firebaseStorageApi. Cuts ~190 KiB of unused JS off the
//     critical path for the demo / guest flow.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAzKrob4KDq_BNe-cz7-9pI2Zib7yvTvKs",
  authDomain: "inventorysys-f80aa.firebaseapp.com",
  projectId: "inventorysys-f80aa",
  storageBucket: "inventorysys-f80aa.firebasestorage.app",
  messagingSenderId: "592655196273",
  appId: "1:592655196273:web:8042049aab5917b7f9fbd0"
};

let app = null;
let auth = null;
let googleProvider = null;
let _firebaseReadyPromise = null;
let _firestoreMod = null, _db = null;
let _storageMod = null, _storage = null;

function ensureAuth() {
  if (_firebaseReadyPromise) return _firebaseReadyPromise;
  _firebaseReadyPromise = new Promise(resolve => {
    const start = () => {
      app = initializeApp(firebaseConfig);
      auth = getAuth(app);
      googleProvider = new GoogleAuthProvider();
      window.firebaseAuth = auth;
      onAuthStateChanged(auth, (user) => {
        window.dispatchEvent(new CustomEvent('firebaseAuthChanged', { detail: user }));
      });
      resolve();
    };
    if ('requestIdleCallback' in window) {
      requestIdleCallback(start, { timeout: 1500 });
    } else {
      setTimeout(start, 0);
    }
  });
  return _firebaseReadyPromise;
}

async function ensureFirestore() {
  if (_db) return { db: _db, m: _firestoreMod };
  await ensureAuth();
  _firestoreMod = await import("https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js");
  _db = _firestoreMod.getFirestore(app);
  return { db: _db, m: _firestoreMod };
}

async function ensureStorage() {
  if (_storage) return { storage: _storage, m: _storageMod };
  await ensureAuth();
  _storageMod = await import("https://www.gstatic.com/firebasejs/12.12.1/firebase-storage.js");
  _storage = _storageMod.getStorage(app);
  return { storage: _storage, m: _storageMod };
}

// Photos in items are either base64 data URLs (newly added, awaiting
// upload) or https download URLs (already uploaded to Cloud Storage).
// Base64 strings can blow past Firestore's 1 MiB document cap, so we drop
// them before any Firestore write. URLs are tiny and pass through.
function stripForCloud(item) {
  const photos = Array.isArray(item.photos)
    ? item.photos.filter(p => typeof p === 'string' && !p.startsWith('data:'))
    : [];
  return { ...item, photos };
}

// ============================================================
// Auth surface
// ============================================================

window.firebaseSignIn = async function() {
  await ensureAuth();
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (err) {
    console.error('Sign-in failed:', err);
    window.dispatchEvent(new CustomEvent('firebaseAuthError', {
      detail: { code: err.code, message: err.message }
    }));
    throw err;
  }
};

window.firebaseSignOut = async function() {
  await ensureAuth();
  try {
    await signOut(auth);
  } catch (err) {
    console.error('Sign-out failed:', err);
    throw err;
  }
};

// ============================================================
// Firestore API — calls lazy-load the firestore module on first use
// ============================================================

window.firestoreApi = {
  saveItem: async (uid, item) => {
    const { db, m } = await ensureFirestore();
    return m.setDoc(m.doc(db, 'users', uid, 'items', item.id), stripForCloud(item));
  },
  deleteItem: async (uid, itemId) => {
    const { db, m } = await ensureFirestore();
    return m.deleteDoc(m.doc(db, 'users', uid, 'items', itemId));
  },
  saveBeanie: async (uid, key, entry) => {
    const { db, m } = await ensureFirestore();
    return m.setDoc(m.doc(db, 'users', uid, 'beanieDb', key), entry);
  },
  deleteBeanie: async (uid, key) => {
    const { db, m } = await ensureFirestore();
    return m.deleteDoc(m.doc(db, 'users', uid, 'beanieDb', key));
  },
  fetchAllItems: async (uid) => {
    const { db, m } = await ensureFirestore();
    const snap = await m.getDocs(m.collection(db, 'users', uid, 'items'));
    return snap.docs.map(d => d.data());
  },
  // subscribeItems / subscribeBeanies return a sync unsubscribe function
  // (matching the previous Firestore-native signature), but the actual
  // listener is attached asynchronously after the firestore module loads.
  // Cancelling before attach short-circuits cleanly.
  subscribeItems: (uid, cb, errCb) => {
    let realUnsub = null;
    let cancelled = false;
    ensureFirestore().then(({ db, m }) => {
      if (cancelled) return;
      realUnsub = m.onSnapshot(
        m.query(m.collection(db, 'users', uid, 'items'), m.orderBy('created_at', 'desc')),
        (snap) => cb(snap.docs.map(d => d.data())),
        (err) => { if (errCb) errCb(err); else console.error('items snapshot error:', err); }
      );
    }).catch(err => { if (errCb) errCb(err); });
    return () => {
      cancelled = true;
      if (realUnsub) realUnsub();
    };
  },
  subscribeBeanies: (uid, cb, errCb) => {
    let realUnsub = null;
    let cancelled = false;
    ensureFirestore().then(({ db, m }) => {
      if (cancelled) return;
      realUnsub = m.onSnapshot(
        m.collection(db, 'users', uid, 'beanieDb'),
        (snap) => cb(snap.docs.map(d => d.data())),
        (err) => { if (errCb) errCb(err); else console.error('beanies snapshot error:', err); }
      );
    }).catch(err => { if (errCb) errCb(err); });
    return () => {
      cancelled = true;
      if (realUnsub) realUnsub();
    };
  }
};

// ============================================================
// Storage API — same lazy pattern
// ============================================================

window.firebaseStorageApi = {
  uploadPhoto: async (uid, itemId, dataUrl) => {
    const { storage, m } = await ensureStorage();
    const photoId = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    const path = `users/${uid}/items/${itemId}/${photoId}`;
    const r = m.ref(storage, path);
    const snap = await m.uploadString(r, dataUrl, 'data_url');
    return m.getDownloadURL(snap.ref);
  },
  deleteItemPhotos: async (uid, itemId) => {
    const { storage, m } = await ensureStorage();
    const folderRef = m.ref(storage, `users/${uid}/items/${itemId}`);
    try {
      const list = await m.listAll(folderRef);
      await Promise.all(list.items.map(item =>
        m.deleteObject(item).catch(err => console.warn('delete photo failed:', err))
      ));
    } catch (err) {
      console.warn('listAll for item photos failed:', err);
    }
  },
  deletePhotoByUrl: async (url) => {
    try {
      const match = url.match(/\/o\/([^?]+)/);
      if (!match) return;
      const path = decodeURIComponent(match[1]);
      const { storage, m } = await ensureStorage();
      await m.deleteObject(m.ref(storage, path));
    } catch (err) {
      console.warn('deletePhotoByUrl failed:', err);
    }
  }
};

// Kick off auth init via requestIdleCallback right away — but the page
// keeps rendering while this fires.
ensureAuth();
window.dispatchEvent(new CustomEvent('firebaseReady'));
