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

// Keep this ?v in step with index.html and app.js — see the note there.
import { firestore, currentUser } from "./firebase-config.js?v=0.3.1";

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

// ============================================================
// Projects, phases and tasks
//
// Deliberately no money here. Costs, budgets and payments arrive in M4 in
// their own collection so a scoped contractor grant can show scope and
// schedule without exposing amounts.
// ============================================================

/**
 * Statuses in remodel order. `lane` groups them for the board so it shows
 * five readable columns instead of twelve that would need side-scrolling.
 */
export const PROJECT_STATUSES = [
  { value: "idea",              label: "Idea",              lane: "ideas" },
  { value: "researching",       label: "Researching",       lane: "ideas" },
  { value: "planned",           label: "Planned",           lane: "planning" },
  { value: "awaiting_bid",      label: "Awaiting bid",      lane: "planning" },
  { value: "awaiting_approval", label: "Awaiting approval", lane: "planning" },
  { value: "approved",          label: "Approved",          lane: "ready" },
  { value: "scheduled",         label: "Scheduled",         lane: "ready" },
  { value: "in_progress",       label: "In progress",       lane: "active" },
  { value: "blocked",           label: "Blocked",           lane: "active" },
  { value: "on_hold",           label: "On hold",           lane: "active" },
  { value: "complete",          label: "Complete",          lane: "done" },
  { value: "cancelled",         label: "Cancelled",         lane: "done" }
];

export const BOARD_LANES = [
  { id: "ideas",    label: "Ideas" },
  { id: "planning", label: "Planning" },
  { id: "ready",    label: "Ready" },
  { id: "active",   label: "Active" },
  { id: "done",     label: "Done" }
];

export const PRIORITIES = [
  { value: "low",      label: "Low" },
  { value: "medium",   label: "Medium" },
  { value: "high",     label: "High" },
  { value: "critical", label: "Critical" }
];

export const statusLabel = (v) =>
  PROJECT_STATUSES.find((s) => s.value === v)?.label || "Idea";
export const statusLane = (v) =>
  PROJECT_STATUSES.find((s) => s.value === v)?.lane || "ideas";
export const priorityLabel = (v) =>
  PRIORITIES.find((p) => p.value === v)?.label || "Medium";

/** Statuses that mean the work is finished or abandoned. */
export const isClosedStatus = (v) => v === "complete" || v === "cancelled";

const toTimestampOrNull = (m, value) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : m.Timestamp.fromDate(d);
};

function projectPayload(m, data) {
  const title = trimTo(data.title, 120);
  if (!title) throw new Error("Give the project a title.");

  const status = PROJECT_STATUSES.some((s) => s.value === data.status) ? data.status : "idea";
  const priority = PRIORITIES.some((p) => p.value === data.priority) ? data.priority : "medium";

  let pct = Number(data.completionPct);
  if (!Number.isFinite(pct)) pct = 0;
  pct = Math.min(100, Math.max(0, Math.round(pct)));

  const tags = (Array.isArray(data.tags) ? data.tags : String(data.tags || "").split(","))
    .map((t) => trimTo(t, 24).toLowerCase())
    .filter(Boolean)
    .slice(0, 20);

  return {
    title,
    description: trimTo(data.description, 4000),
    roomId: data.roomId ? trimTo(data.roomId, 64) : null,
    status,
    priority,
    completionPct: pct,
    tags: [...new Set(tags)],
    plannedStart: toTimestampOrNull(m, data.plannedStart),
    plannedEnd: toTimestampOrNull(m, data.plannedEnd),
    actualStart: toTimestampOrNull(m, data.actualStart),
    actualEnd: toTimestampOrNull(m, data.actualEnd),
    sortOrder: Number.isFinite(Number(data.sortOrder)) ? Number(data.sortOrder) : 0
  };
}

const hydrateProject = (id, data) => ({
  id,
  ...data,
  plannedStart: toDate(data.plannedStart),
  plannedEnd: toDate(data.plannedEnd),
  actualStart: toDate(data.actualStart),
  actualEnd: toDate(data.actualEnd),
  createdAt: toDate(data.createdAt),
  updatedAt: toDate(data.updatedAt),
  tags: Array.isArray(data.tags) ? data.tags : []
});

export async function loadProjects(wsId) {
  const { db, m } = await firestore();
  const snap = await m.getDocs(m.collection(db, "workspaces", wsId, "projects"));
  return snap.docs
    .map((d) => hydrateProject(d.id, d.data()))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
      (a.title || "").localeCompare(b.title || ""));
}

export async function loadProject(wsId, projectId) {
  const { db, m } = await firestore();
  const snap = await m.getDoc(m.doc(db, "workspaces", wsId, "projects", projectId));
  return snap.exists() ? hydrateProject(snap.id, snap.data()) : null;
}

export async function createProject(wsId, data) {
  const user = requireUser();
  const { db, m } = await firestore();
  const ref = m.doc(m.collection(db, "workspaces", wsId, "projects"));
  await m.setDoc(ref, {
    ...projectPayload(m, data),
    createdBy: user.uid,
    createdAt: m.serverTimestamp(),
    updatedAt: m.serverTimestamp()
  });
  await logActivity(wsId, "project_create", `Added project "${trimTo(data.title, 80)}"`, ref.id);
  return ref.id;
}

export async function updateProject(wsId, projectId, data, activityNote) {
  const { db, m } = await firestore();
  await m.updateDoc(m.doc(db, "workspaces", wsId, "projects", projectId), {
    ...projectPayload(m, data),
    updatedAt: m.serverTimestamp()
  });
  if (activityNote) await logActivity(wsId, "project_update", activityNote, projectId);
}

/** Removes the project and everything hanging off it, in one batch. */
export async function deleteProject(wsId, projectId) {
  const { db, m } = await firestore();
  const [phases, tasks] = await Promise.all([
    m.getDocs(m.query(m.collection(db, "workspaces", wsId, "phases"),
      m.where("projectId", "==", projectId))),
    m.getDocs(m.query(m.collection(db, "workspaces", wsId, "tasks"),
      m.where("projectId", "==", projectId)))
  ]);
  const batch = m.writeBatch(db);
  phases.forEach((d) => batch.delete(d.ref));
  tasks.forEach((d) => batch.delete(d.ref));
  batch.delete(m.doc(db, "workspaces", wsId, "privateNotes", projectId));
  batch.delete(m.doc(db, "workspaces", wsId, "projects", projectId));
  await batch.commit();
}

// ---------- phases ----------
export async function loadPhases(wsId, projectId) {
  const { db, m } = await firestore();
  const snap = await m.getDocs(m.query(
    m.collection(db, "workspaces", wsId, "phases"),
    m.where("projectId", "==", projectId)
  ));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export async function createPhase(wsId, projectId, name, sortOrder) {
  const user = requireUser();
  const clean = trimTo(name, 120);
  if (!clean) throw new Error("Give the phase a name.");
  const { db, m } = await firestore();
  const ref = m.doc(m.collection(db, "workspaces", wsId, "phases"));
  await m.setDoc(ref, {
    projectId,
    name: clean,
    sortOrder: Number(sortOrder) || 0,
    createdBy: user.uid,
    createdAt: m.serverTimestamp(),
    updatedAt: m.serverTimestamp()
  });
  return ref.id;
}

export async function renamePhase(wsId, phaseId, name) {
  const clean = trimTo(name, 120);
  if (!clean) throw new Error("Give the phase a name.");
  const { db, m } = await firestore();
  await m.updateDoc(m.doc(db, "workspaces", wsId, "phases", phaseId), {
    name: clean,
    updatedAt: m.serverTimestamp()
  });
}

/** Deleting a phase keeps its tasks; they fall back to the project itself. */
export async function deletePhase(wsId, phaseId) {
  const { db, m } = await firestore();
  const tasks = await m.getDocs(m.query(
    m.collection(db, "workspaces", wsId, "tasks"),
    m.where("phaseId", "==", phaseId)
  ));
  const batch = m.writeBatch(db);
  tasks.forEach((d) => batch.update(d.ref, { phaseId: null, updatedAt: m.serverTimestamp() }));
  batch.delete(m.doc(db, "workspaces", wsId, "phases", phaseId));
  await batch.commit();
}

// ---------- tasks ----------
export async function loadTasks(wsId, projectId) {
  const { db, m } = await firestore();
  const snap = await m.getDocs(m.query(
    m.collection(db, "workspaces", wsId, "tasks"),
    m.where("projectId", "==", projectId)
  ));
  return snap.docs
    .map((d) => ({
      id: d.id,
      ...d.data(),
      dueDate: toDate(d.data().dueDate),
      completedAt: toDate(d.data().completedAt)
    }))
    .sort((a, b) => Number(a.done) - Number(b.done) ||
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

/** Every open task in the workspace — used for the overdue count. */
export async function loadOpenTasks(wsId) {
  const { db, m } = await firestore();
  const snap = await m.getDocs(m.query(
    m.collection(db, "workspaces", wsId, "tasks"),
    m.where("done", "==", false)
  ));
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    dueDate: toDate(d.data().dueDate)
  }));
}

export async function createTask(wsId, projectId, data) {
  const user = requireUser();
  const title = trimTo(data.title, 200);
  if (!title) throw new Error("Give the task a title.");
  const { db, m } = await firestore();
  const ref = m.doc(m.collection(db, "workspaces", wsId, "tasks"));
  await m.setDoc(ref, {
    projectId,
    phaseId: data.phaseId || null,
    title,
    done: false,
    priority: PRIORITIES.some((p) => p.value === data.priority) ? data.priority : "medium",
    dueDate: toTimestampOrNull(m, data.dueDate),
    assigneeUid: data.assigneeUid || null,
    sortOrder: Number(data.sortOrder) || 0,
    createdBy: user.uid,
    createdAt: m.serverTimestamp(),
    updatedAt: m.serverTimestamp()
  });
  return ref.id;
}

export async function updateTask(wsId, taskId, patch) {
  const { db, m } = await firestore();
  const clean = { updatedAt: m.serverTimestamp() };
  if ("title" in patch) {
    const t = trimTo(patch.title, 200);
    if (!t) throw new Error("Give the task a title.");
    clean.title = t;
  }
  if ("done" in patch) {
    clean.done = !!patch.done;
    clean.completedAt = patch.done ? m.serverTimestamp() : null;
  }
  if ("priority" in patch) {
    clean.priority = PRIORITIES.some((p) => p.value === patch.priority) ? patch.priority : "medium";
  }
  if ("dueDate" in patch) clean.dueDate = toTimestampOrNull(m, patch.dueDate);
  if ("phaseId" in patch) clean.phaseId = patch.phaseId || null;
  await m.updateDoc(m.doc(db, "workspaces", wsId, "tasks", taskId), clean);
}

export async function deleteTask(wsId, taskId) {
  const { db, m } = await firestore();
  await m.deleteDoc(m.doc(db, "workspaces", wsId, "tasks", taskId));
}

// ---------- private notes ----------
// Stored under the parent's id in a separate collection, never as a field on
// the record itself, so contractor scoping in M5 cannot reach them.
export async function loadPrivateNote(wsId, parentId) {
  const { db, m } = await firestore();
  try {
    const snap = await m.getDoc(m.doc(db, "workspaces", wsId, "privateNotes", parentId));
    return snap.exists() ? snap.data().body || "" : "";
  } catch (err) {
    if (err?.code === "permission-denied") return null;   // accountant role
    throw err;
  }
}

export async function savePrivateNote(wsId, parentId, body) {
  const user = requireUser();
  const { db, m } = await firestore();
  await m.setDoc(m.doc(db, "workspaces", wsId, "privateNotes", parentId), {
    body: trimTo(body, 8000),
    createdBy: user.uid,
    createdAt: m.serverTimestamp(),
    updatedAt: m.serverTimestamp()
  }, { merge: true });
}

// ============================================================
// Media
//
// Three documents per photo: metadata, thumbnail, full image. Galleries
// read metadata + thumbnails only; the full image loads when opened.
// ============================================================

export const MEDIA_CATEGORIES = [
  { value: "before",      label: "Before" },
  { value: "progress",    label: "In progress" },
  { value: "after",       label: "After" },
  { value: "inspiration", label: "Inspiration" },
  { value: "damage",      label: "Damage or issue" },
  { value: "receipt",     label: "Receipt" },
  { value: "plan",        label: "Plan or drawing" },
  { value: "document",    label: "Document" }
];

export const mediaCategoryLabel = (v) =>
  MEDIA_CATEGORIES.find((c) => c.value === v)?.label || "Photo";

export async function loadMedia(wsId) {
  const { db, m } = await firestore();
  const snap = await m.getDocs(m.collection(db, "workspaces", wsId, "media"));
  return snap.docs
    .map((d) => ({
      id: d.id,
      ...d.data(),
      takenAt: toDate(d.data().takenAt),
      createdAt: toDate(d.data().createdAt),
      tags: Array.isArray(d.data().tags) ? d.data().tags : []
    }))
    .sort((a, b) => (b.takenAt?.getTime() || b.createdAt?.getTime() || 0) -
      (a.takenAt?.getTime() || a.createdAt?.getTime() || 0));
}

export async function loadThumb(wsId, mediaId) {
  const { db, m } = await firestore();
  const snap = await m.getDoc(m.doc(db, "workspaces", wsId, "mediaThumbs", mediaId));
  return snap.exists() ? snap.data().data : null;
}

export async function loadFullImage(wsId, mediaId) {
  const { db, m } = await firestore();
  const snap = await m.getDoc(m.doc(db, "workspaces", wsId, "mediaBlobs", mediaId));
  return snap.exists() ? snap.data().data : null;
}

/**
 * Writes the three documents in one batch, so a photo can never end up as
 * metadata pointing at an image that is not there.
 */
export async function saveMedia(wsId, processed, meta) {
  const user = requireUser();
  const { db, m } = await firestore();
  const ref = m.doc(m.collection(db, "workspaces", wsId, "media"));

  const batch = m.writeBatch(db);
  batch.set(ref, {
    category: MEDIA_CATEGORIES.some((c) => c.value === meta.category) ? meta.category : "progress",
    caption: trimTo(meta.caption, 500),
    roomId: meta.roomId || null,
    projectId: meta.projectId || null,
    tags: (Array.isArray(meta.tags) ? meta.tags : [])
      .map((t) => trimTo(t, 24).toLowerCase()).filter(Boolean).slice(0, 20),
    fileName: trimTo(meta.fileName, 200),
    contentType: processed.type,
    width: processed.width,
    height: processed.height,
    bytes: processed.bytes,
    takenAt: meta.takenAt ? m.Timestamp.fromDate(new Date(meta.takenAt)) : m.serverTimestamp(),
    createdBy: user.uid,
    createdAt: m.serverTimestamp(),
    updatedAt: m.serverTimestamp()
  });
  batch.set(m.doc(db, "workspaces", wsId, "mediaThumbs", ref.id), {
    data: m.Bytes.fromUint8Array(processed.thumb)
  });
  batch.set(m.doc(db, "workspaces", wsId, "mediaBlobs", ref.id), {
    data: m.Bytes.fromUint8Array(processed.full)
  });
  await batch.commit();
  return ref.id;
}

export async function updateMediaMeta(wsId, mediaId, meta) {
  const { db, m } = await firestore();
  await m.updateDoc(m.doc(db, "workspaces", wsId, "media", mediaId), {
    category: MEDIA_CATEGORIES.some((c) => c.value === meta.category) ? meta.category : "progress",
    caption: trimTo(meta.caption, 500),
    roomId: meta.roomId || null,
    projectId: meta.projectId || null,
    tags: (Array.isArray(meta.tags) ? meta.tags : [])
      .map((t) => trimTo(t, 24).toLowerCase()).filter(Boolean).slice(0, 20),
    updatedAt: m.serverTimestamp()
  });
}

export async function deleteMedia(wsId, mediaId) {
  const { db, m } = await firestore();
  const batch = m.writeBatch(db);
  batch.delete(m.doc(db, "workspaces", wsId, "mediaBlobs", mediaId));
  batch.delete(m.doc(db, "workspaces", wsId, "mediaThumbs", mediaId));
  batch.delete(m.doc(db, "workspaces", wsId, "media", mediaId));
  await batch.commit();
}

/** Total stored image bytes, for the storage meter in Settings. */
export function totalMediaBytes(media) {
  return media.reduce((sum, item) => sum + (item.bytes || 0), 0);
}

// ============================================================
// Ideas
// ============================================================

export const IDEA_STATUSES = [
  { value: "saved",       label: "Saved" },
  { value: "researching", label: "Researching" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "selected",    label: "Selected" },
  { value: "purchased",   label: "Purchased" },
  { value: "rejected",    label: "Rejected" }
];

export const ideaStatusLabel = (v) =>
  IDEA_STATUSES.find((s) => s.value === v)?.label || "Saved";

function ideaPayload(data) {
  const title = trimTo(data.title, 160);
  if (!title) throw new Error("Give the idea a title.");

  let price = Number(data.estPrice);
  if (!Number.isFinite(price) || price < 0) price = null;
  else price = Math.round(price * 100) / 100;

  let url = trimTo(data.sourceUrl, 500);
  if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;

  return {
    title,
    status: IDEA_STATUSES.some((s) => s.value === data.status) ? data.status : "saved",
    roomId: data.roomId || null,
    projectId: data.projectId || null,
    tags: (Array.isArray(data.tags) ? data.tags : String(data.tags || "").split(","))
      .map((t) => trimTo(t, 24).toLowerCase()).filter(Boolean).slice(0, 20),
    sourceUrl: url,
    vendor: trimTo(data.vendor, 120),
    model: trimTo(data.model, 120),
    estPrice: price,
    notes: trimTo(data.notes, 4000),
    mediaId: data.mediaId || null
  };
}

export async function loadIdeas(wsId) {
  const { db, m } = await firestore();
  const snap = await m.getDocs(m.collection(db, "workspaces", wsId, "ideas"));
  const order = IDEA_STATUSES.map((s) => s.value);
  return snap.docs
    .map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: toDate(d.data().createdAt),
      tags: Array.isArray(d.data().tags) ? d.data().tags : []
    }))
    .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) ||
      (a.title || "").localeCompare(b.title || ""));
}

export async function createIdea(wsId, data) {
  const user = requireUser();
  const { db, m } = await firestore();
  const ref = m.doc(m.collection(db, "workspaces", wsId, "ideas"));
  await m.setDoc(ref, {
    ...ideaPayload(data),
    createdBy: user.uid,
    createdAt: m.serverTimestamp(),
    updatedAt: m.serverTimestamp()
  });
  return ref.id;
}

export async function updateIdea(wsId, ideaId, data) {
  const { db, m } = await firestore();
  await m.updateDoc(m.doc(db, "workspaces", wsId, "ideas", ideaId), {
    ...ideaPayload(data),
    updatedAt: m.serverTimestamp()
  });
}

export async function deleteIdea(wsId, ideaId) {
  const { db, m } = await firestore();
  await m.deleteDoc(m.doc(db, "workspaces", wsId, "ideas", ideaId));
}

// ---------- activity ----------
export async function logActivity(wsId, kind, summary, entityId) {
  const user = requireUser();
  const { db, m } = await firestore();
  try {
    await m.setDoc(m.doc(m.collection(db, "workspaces", wsId, "activity")), {
      kind: trimTo(kind, 40),
      summary: trimTo(summary, 300),
      entityId: entityId || null,
      byUid: user.uid,
      byName: user.displayName || user.email || "",
      at: m.serverTimestamp()
    });
  } catch (err) {
    // History is a nice-to-have; never fail the user's actual edit over it.
    console.warn("activity not recorded:", err?.code || err);
  }
}

export async function loadActivity(wsId, max = 20) {
  const { db, m } = await firestore();
  const snap = await m.getDocs(m.query(
    m.collection(db, "workspaces", wsId, "activity"),
    m.orderBy("at", "desc"),
    m.limit(max)
  ));
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), at: toDate(d.data().at) }));
}
