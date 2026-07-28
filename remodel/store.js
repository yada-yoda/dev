// ============================================================
// RemodelHQ — data layer
//
// Everything that touches Firestore lives here; app.js only renders.
//
// Authority model: membership and role are proven by the document
// workspaces/{wsId}/members/{uid}. The users/{uid} document is a pointer
// index used only to list "workspaces I belong to" — it is never trusted
// for access decisions, and the security rules ignore it entirely.
// ============================================================

import { firestore, currentUser } from "./firebase-config.js";

export const SCHEMA_VERSION = 1;
const INVITE_DAYS = 14;

// ---------- roles ----------
// Ordered from most to least privileged. Descriptions are surfaced as
// field tooltips so the person assigning a role can see what it means.
export const ROLES = {
  owner: {
    label: "Owner",
    description: "Full access. Only the owner can delete the workspace or transfer ownership."
  },
  admin: {
    label: "Admin",
    description: "Manages projects, rooms, collaborators and contractor access. Cannot delete the workspace."
  },
  editor: {
    label: "Editor",
    description: "Creates and edits rooms, projects, photos and expenses. Cannot manage people."
  },
  viewer: {
    label: "Viewer",
    description: "Read-only access to everything in the workspace."
  },
  accountant: {
    label: "Accountant",
    description: "Read-only, aimed at budgets and payments. Never sees private notes."
  }
};

/** Roles an invite may confer — 'owner' is deliberately excluded. */
export const INVITABLE_ROLES = ["admin", "editor", "viewer", "accountant"];

export const isOwner = (role) => role === "owner";
export const canManageMembers = (role) => role === "owner" || role === "admin";
export const canEdit = (role) => role === "owner" || role === "admin" || role === "editor";

// ---------- rooms ----------
export const ROOM_TYPES = [
  { value: "kitchen",          label: "Kitchen" },
  { value: "living",           label: "Living room" },
  { value: "dining",           label: "Dining room" },
  { value: "bedroom_primary",  label: "Primary bedroom" },
  { value: "bedroom",          label: "Bedroom" },
  { value: "bathroom_primary", label: "Primary bathroom" },
  { value: "bathroom",         label: "Bathroom" },
  { value: "hallway",          label: "Hallway" },
  { value: "entry",            label: "Entry" },
  { value: "patio",            label: "Patio / balcony" },
  { value: "utility",          label: "Utility / laundry" },
  { value: "storage",          label: "Storage" },
  { value: "whole",            label: "Whole property" },
  { value: "custom",           label: "Other" }
];

export const roomTypeLabel = (value) =>
  ROOM_TYPES.find((t) => t.value === value)?.label || "Other";

/** Starter set offered on an empty workspace — a typical 2 bed / 2 bath condo. */
export const STARTER_ROOMS = [
  { name: "Kitchen",          type: "kitchen" },
  { name: "Living room",      type: "living" },
  { name: "Primary bedroom",  type: "bedroom_primary" },
  { name: "Second bedroom",   type: "bedroom" },
  { name: "Primary bathroom", type: "bathroom_primary" },
  { name: "Second bathroom",  type: "bathroom" },
  { name: "Entry",            type: "entry" },
  { name: "Whole property",   type: "whole" }
];

// ---------- helpers ----------
function requireUser() {
  const user = currentUser();
  if (!user) throw new Error("You are signed out. Sign in again to continue.");
  return user;
}

/** Turns a Firestore error into something worth showing a person. */
export function describeError(err) {
  const code = err?.code || "";
  if (code === "permission-denied") {
    return "You do not have permission to do that.";
  }
  if (code === "unavailable" || code === "failed-precondition") {
    return "Cannot reach the database. Check your connection and try again.";
  }
  if (code === "unauthenticated") {
    return "Your session expired. Sign in again.";
  }
  return err?.message || "Something went wrong.";
}

const trimTo = (value, max) => String(value ?? "").trim().slice(0, max);

/** Firestore Timestamp | Date | null -> Date | null */
export function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

// ============================================================
// Workspaces
// ============================================================

/**
 * Workspaces this account belongs to. The pointer index gives the candidate
 * ids; each one is then confirmed against the authoritative membership doc,
 * and pointers that no longer resolve are pruned.
 */
export async function loadMyWorkspaces() {
  const user = requireUser();
  const { db, m } = await firestore();

  const pointerRef = m.doc(db, "users", user.uid);
  const pointerSnap = await m.getDoc(pointerRef);
  const pointers = pointerSnap.exists() ? (pointerSnap.data().workspaces || {}) : {};
  const ids = Object.keys(pointers);
  if (!ids.length) return [];

  const results = await Promise.all(ids.map(async (wsId) => {
    try {
      const [wsSnap, memberSnap] = await Promise.all([
        m.getDoc(m.doc(db, "workspaces", wsId)),
        m.getDoc(m.doc(db, "workspaces", wsId, "members", user.uid))
      ]);
      if (!wsSnap.exists() || !memberSnap.exists()) return { wsId, stale: true };
      return {
        id: wsId,
        name: wsSnap.data().name,
        ownerUid: wsSnap.data().ownerUid,
        role: memberSnap.data().role,
        createdAt: toDate(wsSnap.data().createdAt)
      };
    } catch (err) {
      // Removed from the workspace, or it was deleted out from under us.
      if (err?.code === "permission-denied") return { wsId, stale: true };
      throw err;
    }
  }));

  const stale = results.filter((r) => r.stale).map((r) => r.wsId);
  if (stale.length) {
    const patch = {};
    for (const wsId of stale) patch[`workspaces.${wsId}`] = m.deleteField();
    await m.updateDoc(pointerRef, patch).catch(() => { /* best effort */ });
  }

  return results
    .filter((r) => !r.stale)
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

/**
 * Creates the workspace and the creator's owner row in a single batch, so a
 * half-created workspace can never exist. The rules verify the owner row with
 * getAfter() against the workspace being written in the same commit.
 */
export async function createWorkspace(name) {
  const user = requireUser();
  const clean = trimTo(name, 80);
  if (!clean) throw new Error("Give the workspace a name.");

  const { db, m } = await firestore();
  const wsRef = m.doc(m.collection(db, "workspaces"));
  const batch = m.writeBatch(db);

  batch.set(wsRef, {
    name: clean,
    ownerUid: user.uid,
    createdBy: user.uid,
    createdAt: m.serverTimestamp(),
    updatedAt: m.serverTimestamp(),
    schemaVersion: SCHEMA_VERSION
  });
  batch.set(m.doc(db, "workspaces", wsRef.id, "members", user.uid), {
    uid: user.uid,
    role: "owner",
    displayName: user.displayName || "",
    email: (user.email || "").toLowerCase(),
    joinedAt: m.serverTimestamp()
  });
  batch.set(m.doc(db, "users", user.uid), {
    workspaces: { [wsRef.id]: { name: clean } }
  }, { merge: true });

  await batch.commit();
  return wsRef.id;
}

export async function loadWorkspace(wsId) {
  const user = requireUser();
  const { db, m } = await firestore();
  const [wsSnap, memberSnap] = await Promise.all([
    m.getDoc(m.doc(db, "workspaces", wsId)),
    m.getDoc(m.doc(db, "workspaces", wsId, "members", user.uid))
  ]);
  if (!wsSnap.exists() || !memberSnap.exists()) return null;
  return {
    id: wsId,
    ...wsSnap.data(),
    createdAt: toDate(wsSnap.data().createdAt),
    myRole: memberSnap.data().role
  };
}

export async function renameWorkspace(wsId, name) {
  const clean = trimTo(name, 80);
  if (!clean) throw new Error("Give the workspace a name.");
  const { db, m } = await firestore();
  await m.updateDoc(m.doc(db, "workspaces", wsId), {
    name: clean,
    updatedAt: m.serverTimestamp()
  });
  // Keep this account's pointer label in step; other members refresh their own.
  const user = requireUser();
  await m.setDoc(m.doc(db, "users", user.uid), {
    workspaces: { [wsId]: { name: clean } }
  }, { merge: true }).catch(() => { /* label only */ });
}

/**
 * Owner-only. Removes rooms, invites and other members first, then the
 * workspace document, then the owner's own membership row — the rules permit
 * that last step only once the workspace itself is gone, so a workspace can
 * never be left ownerless while it still exists.
 */
export async function deleteWorkspace(wsId) {
  const user = requireUser();
  const { db, m } = await firestore();

  const [rooms, members, invites] = await Promise.all([
    m.getDocs(m.collection(db, "workspaces", wsId, "rooms")),
    m.getDocs(m.collection(db, "workspaces", wsId, "members")),
    m.getDocs(m.query(m.collection(db, "invites"), m.where("workspaceId", "==", wsId)))
  ]);

  const batch = m.writeBatch(db);
  rooms.forEach((d) => batch.delete(d.ref));
  invites.forEach((d) => batch.delete(d.ref));
  members.forEach((d) => { if (d.id !== user.uid) batch.delete(d.ref); });
  batch.delete(m.doc(db, "workspaces", wsId));
  await batch.commit();

  await m.deleteDoc(m.doc(db, "workspaces", wsId, "members", user.uid));
  await m.updateDoc(m.doc(db, "users", user.uid), {
    [`workspaces.${wsId}`]: m.deleteField()
  }).catch(() => { /* pointer prunes itself on next load */ });
}

// ============================================================
// Members
// ============================================================

export async function loadMembers(wsId) {
  const { db, m } = await firestore();
  const snap = await m.getDocs(m.collection(db, "workspaces", wsId, "members"));
  const order = Object.keys(ROLES);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data(), joinedAt: toDate(d.data().joinedAt) }))
    .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
}

/** Role changes write exactly one field; the rules pin uid and joinedAt. */
export async function setMemberRole(wsId, uid, role) {
  if (!INVITABLE_ROLES.includes(role)) {
    throw new Error("That role cannot be assigned here.");
  }
  const { db, m } = await firestore();
  await m.updateDoc(m.doc(db, "workspaces", wsId, "members", uid), { role });
}

export async function removeMember(wsId, uid) {
  const { db, m } = await firestore();
  await m.deleteDoc(m.doc(db, "workspaces", wsId, "members", uid));
}

export async function leaveWorkspace(wsId) {
  const user = requireUser();
  const { db, m } = await firestore();
  await m.deleteDoc(m.doc(db, "workspaces", wsId, "members", user.uid));
  await m.updateDoc(m.doc(db, "users", user.uid), {
    [`workspaces.${wsId}`]: m.deleteField()
  }).catch(() => {});
}

// ============================================================
// Invites
// ============================================================

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function createInvite(wsId, email, role) {
  const user = requireUser();
  const clean = trimTo(email, 200).toLowerCase();
  if (!EMAIL_RE.test(clean)) throw new Error("Enter a valid email address.");
  if (!INVITABLE_ROLES.includes(role)) throw new Error("Choose a role for this person.");
  if (clean === (user.email || "").toLowerCase()) {
    throw new Error("That is your own address — you are already a member.");
  }

  const { db, m } = await firestore();
  const expires = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);
  const ref = m.doc(m.collection(db, "invites"));
  await m.setDoc(ref, {
    workspaceId: wsId,
    email: clean,
    role,
    status: "pending",
    createdBy: user.uid,
    createdAt: m.serverTimestamp(),
    expiresAt: m.Timestamp.fromDate(expires)
  });
  return { id: ref.id, email: clean, role, expiresAt: expires };
}

export async function loadInvites(wsId) {
  const { db, m } = await firestore();
  const snap = await m.getDocs(
    m.query(m.collection(db, "invites"), m.where("workspaceId", "==", wsId))
  );
  return snap.docs
    .map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: toDate(d.data().createdAt),
      expiresAt: toDate(d.data().expiresAt)
    }))
    .filter((inv) => inv.status === "pending")
    .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
}

export async function revokeInvite(inviteId) {
  const { db, m } = await firestore();
  await m.updateDoc(m.doc(db, "invites", inviteId), { status: "revoked" });
}

/**
 * Pending invites addressed to this account. Filtered by email only — status
 * and expiry are narrowed client-side so no composite index is needed, and
 * the rules re-check both at accept time regardless.
 */
export async function loadMyInvites() {
  const user = requireUser();
  const email = (user.email || "").toLowerCase();
  if (!email) return [];
  const { db, m } = await firestore();
  const snap = await m.getDocs(
    m.query(m.collection(db, "invites"), m.where("email", "==", email))
  );
  const now = Date.now();
  return snap.docs
    .map((d) => ({
      id: d.id,
      ...d.data(),
      expiresAt: toDate(d.data().expiresAt)
    }))
    .filter((inv) => inv.status === "pending" && (inv.expiresAt?.getTime() || 0) > now);
}

/** Joins the workspace and marks the invite accepted in one batch. */
export async function acceptInvite(invite) {
  const user = requireUser();
  const { db, m } = await firestore();
  const batch = m.writeBatch(db);

  batch.set(m.doc(db, "workspaces", invite.workspaceId, "members", user.uid), {
    uid: user.uid,
    role: invite.role,
    displayName: user.displayName || "",
    email: (user.email || "").toLowerCase(),
    joinedAt: m.serverTimestamp(),
    inviteId: invite.id
  });
  batch.update(m.doc(db, "invites", invite.id), {
    status: "accepted",
    acceptedBy: user.uid
  });
  batch.set(m.doc(db, "users", user.uid), {
    workspaces: { [invite.workspaceId]: { name: invite.workspaceName || "Remodel" } }
  }, { merge: true });

  await batch.commit();
}

export async function declineInvite(inviteId) {
  // Declining is local: the invite simply stops being offered on this device.
  // Revoking is the manager's action; nothing is written here.
  const declined = new Set(JSON.parse(localStorage.getItem("rhq_declined") || "[]"));
  declined.add(inviteId);
  localStorage.setItem("rhq_declined", JSON.stringify([...declined]));
}

export function isDeclined(inviteId) {
  try {
    return JSON.parse(localStorage.getItem("rhq_declined") || "[]").includes(inviteId);
  } catch {
    return false;
  }
}

// ============================================================
// Rooms
// ============================================================

function roomPayload(data) {
  const name = trimTo(data.name, 80);
  if (!name) throw new Error("Give the room a name.");
  const type = ROOM_TYPES.some((t) => t.value === data.type) ? data.type : "custom";

  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
  };

  return {
    name,
    type,
    description: trimTo(data.description, 2000),
    notes: trimTo(data.notes, 4000),
    lengthFt: num(data.lengthFt),
    widthFt: num(data.widthFt),
    ceilingFt: num(data.ceilingFt),
    sortOrder: Number.isFinite(Number(data.sortOrder)) ? Number(data.sortOrder) : 0
  };
}

export async function loadRooms(wsId) {
  const { db, m } = await firestore();
  const snap = await m.getDocs(m.collection(db, "workspaces", wsId, "rooms"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data(), createdAt: toDate(d.data().createdAt) }))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.name || "").localeCompare(b.name || ""));
}

export async function createRoom(wsId, data) {
  const user = requireUser();
  const { db, m } = await firestore();
  const ref = m.doc(m.collection(db, "workspaces", wsId, "rooms"));
  await m.setDoc(ref, {
    ...roomPayload(data),
    createdBy: user.uid,
    createdAt: m.serverTimestamp(),
    updatedAt: m.serverTimestamp()
  });
  return ref.id;
}

/** Adds several rooms at once (the starter set on an empty workspace). */
export async function createRooms(wsId, rooms) {
  const user = requireUser();
  const { db, m } = await firestore();
  const batch = m.writeBatch(db);
  rooms.forEach((room, i) => {
    const ref = m.doc(m.collection(db, "workspaces", wsId, "rooms"));
    batch.set(ref, {
      ...roomPayload({ ...room, sortOrder: i }),
      createdBy: user.uid,
      createdAt: m.serverTimestamp(),
      updatedAt: m.serverTimestamp()
    });
  });
  await batch.commit();
}

export async function updateRoom(wsId, roomId, data) {
  const { db, m } = await firestore();
  await m.updateDoc(m.doc(db, "workspaces", wsId, "rooms", roomId), {
    ...roomPayload(data),
    updatedAt: m.serverTimestamp()
  });
}

export async function deleteRoom(wsId, roomId) {
  const { db, m } = await firestore();
  await m.deleteDoc(m.doc(db, "workspaces", wsId, "rooms", roomId));
}

/** Floor area in square feet, or null when dimensions are incomplete. */
export function roomArea(room) {
  if (!room?.lengthFt || !room?.widthFt) return null;
  return Math.round(room.lengthFt * room.widthFt);
}
