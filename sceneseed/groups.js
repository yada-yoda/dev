// SceneSeed — groups data layer
// Owner-scoped CRUD on /groups, all guarded by Firestore rules in firestore.rules.

import { auth, db } from './firebase-config.js';
import {
  collection, doc, addDoc, getDoc, updateDoc, deleteDoc,
  query, where, onSnapshot, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js';

function requireUser() {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return user;
}

export async function createGroup({ name, description = '' }) {
  const user = requireUser();
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Group name required');
  const ref = await addDoc(collection(db, 'groups'), {
    ownerId: user.uid,
    name: trimmed,
    description: description.trim(),
    createdAt: serverTimestamp()
  });
  return ref.id;
}

// Live subscription to the user's groups, sorted newest first.
// We sort client-side instead of using Firestore orderBy so we don't require
// a composite index on (ownerId, createdAt). Group counts per user are small
// enough that client sort is trivial.
// Returns an unsubscribe function.
export function listGroups(callback) {
  const user = requireUser();
  const q = query(
    collection(db, 'groups'),
    where('ownerId', '==', user.uid)
  );
  return onSnapshot(
    q,
    (snap) => {
      const groups = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      groups.sort((a, b) => {
        const aT = a.createdAt?.toMillis?.() ?? 0;
        const bT = b.createdAt?.toMillis?.() ?? 0;
        return bT - aT;
      });
      callback(groups);
    },
    (err) => {
      console.error('Failed to load groups:', err);
      callback([]);
    }
  );
}

export async function getGroup(groupId) {
  const snap = await getDoc(doc(db, 'groups', groupId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function updateGroup(groupId, { name, description }) {
  const updates = {};
  if (name !== undefined) {
    const t = name.trim();
    if (!t) throw new Error('Group name required');
    updates.name = t;
  }
  if (description !== undefined) updates.description = description.trim();
  await updateDoc(doc(db, 'groups', groupId), updates);
}

export async function deleteGroup(groupId) {
  // v0.4.0+: also cascade-delete shows + suggestions under this group.
  await deleteDoc(doc(db, 'groups', groupId));
}
