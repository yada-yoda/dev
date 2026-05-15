// SceneSeed — Firebase initialization
// All values here are PUBLIC web config (apiKey, projectId etc.) — safe to ship.
// Real auth is enforced by Firestore security rules + Firebase Auth, not by these values.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDgNQwiAzhj5uvMH59mXFGZVVPRfR5b9wc",
  authDomain: "sceneseed-336c9.firebaseapp.com",
  projectId: "sceneseed-336c9",
  storageBucket: "sceneseed-336c9.firebasestorage.app",
  messagingSenderId: "918277047493",
  appId: "1:918277047493:web:6b0cacdcecad63b0e19cac"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
