// SceneSeed — auth helpers (email link + Google + profile bootstrap)
// All sign-in flows funnel through here so that ensureProfile() runs once on every new sign-in.

import { auth, db } from './firebase-config.js';
import {
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js';
import {
  doc, getDoc, setDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js';

const EMAIL_LS_KEY = 'sceneseed:signinEmail';

function actionCodeSettings() {
  // Build absolute URL to signin.html relative to current page so it works
  // both at dev.rizzo.cc/sceneseed/ and localhost:8098/.
  const path = window.location.pathname;
  const dir = path.substring(0, path.lastIndexOf('/') + 1);
  return {
    url: window.location.origin + dir + 'signin.html',
    handleCodeInApp: true
  };
}

export async function sendMagicLink(email) {
  await sendSignInLinkToEmail(auth, email, actionCodeSettings());
  localStorage.setItem(EMAIL_LS_KEY, email);
}

export function isMagicLinkReturn() {
  return isSignInWithEmailLink(auth, window.location.href);
}

export async function completeMagicLinkSignIn() {
  if (!isMagicLinkReturn()) return null;
  let email = localStorage.getItem(EMAIL_LS_KEY);
  if (!email) email = window.prompt('Confirm the email you signed in with:');
  if (!email) throw new Error('Email required to complete sign-in');
  const result = await signInWithEmailLink(auth, email, window.location.href);
  localStorage.removeItem(EMAIL_LS_KEY);
  await ensureProfile(result.user);
  return result.user;
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  await ensureProfile(result.user);
  return result.user;
}

export async function signOut() {
  await firebaseSignOut(auth);
}

export async function ensureProfile(user) {
  const ref = doc(db, 'profiles', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      displayName: user.displayName || '',
      email: user.email || '',
      createdAt: serverTimestamp()
    });
  }
}

export function onAuth(callback) {
  return onAuthStateChanged(auth, callback);
}
