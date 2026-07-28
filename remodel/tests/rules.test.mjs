// ============================================================
// RemodelHQ — Firestore rules tests (Milestone 1)
//
// Run:  npm test          (from this folder; starts the emulator for you)
//
// These are the authorization tests the plan requires to land with the
// rules themselves. They deliberately include adversarial cases: direct
// document-id probing, cross-workspace reads, self-promotion, forging an
// owner row, and reusing expired/revoked/other-people's invites.
// ============================================================

import { test, before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where,
  getDocs, writeBatch, serverTimestamp, Timestamp, Bytes
} from 'firebase/firestore';
import { readFileSync } from 'node:fs';

const OWNER = { uid: 'uid_owner', email: 'owner@example.com' };
const ADMIN = { uid: 'uid_admin', email: 'admin@example.com' };
const EDITOR = { uid: 'uid_editor', email: 'editor@example.com' };
const VIEWER = { uid: 'uid_viewer', email: 'viewer@example.com' };
const ACCOUNTANT = { uid: 'uid_acct', email: 'accountant@example.com' };
const OUTSIDER = { uid: 'uid_outsider', email: 'outsider@example.com' };

const WS = 'ws_main';
const OTHER_WS = 'ws_other';

let testEnv;

/** Signed-in Firestore handle whose token carries a verified email. */
function as(user) {
  return testEnv
    .authenticatedContext(user.uid, { email: user.email, email_verified: true })
    .firestore();
}
function asAnon() {
  return testEnv.unauthenticatedContext().firestore();
}

/** Seed data directly, bypassing rules. */
function seed(fn) {
  return testEnv.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
}

function memberDoc(db, wsId, user, role) {
  return setDoc(doc(db, 'workspaces', wsId, 'members', user.uid), {
    uid: user.uid,
    role,
    displayName: role,
    email: user.email,
    joinedAt: Timestamp.now()
  });
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-remodelhq',
    firestore: {
      rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8781
    }
  });
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // A workspace with one member of every role, plus an unrelated second
  // workspace used for isolation checks.
  await seed(async (db) => {
    await setDoc(doc(db, 'workspaces', WS), {
      name: 'Condo remodel',
      ownerUid: OWNER.uid,
      createdBy: OWNER.uid,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      schemaVersion: 1
    });
    await memberDoc(db, WS, OWNER, 'owner');
    await memberDoc(db, WS, ADMIN, 'admin');
    await memberDoc(db, WS, EDITOR, 'editor');
    await memberDoc(db, WS, VIEWER, 'viewer');
    await memberDoc(db, WS, ACCOUNTANT, 'accountant');
    await setDoc(doc(db, 'workspaces', WS, 'rooms', 'room_kitchen'), {
      name: 'Kitchen',
      type: 'kitchen',
      sortOrder: 0,
      createdBy: OWNER.uid,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });

    await setDoc(doc(db, 'workspaces', OTHER_WS), {
      name: 'Someone else',
      ownerUid: OUTSIDER.uid,
      createdBy: OUTSIDER.uid,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      schemaVersion: 1
    });
    await memberDoc(db, OTHER_WS, OUTSIDER, 'owner');
    await setDoc(doc(db, 'workspaces', OTHER_WS, 'rooms', 'room_secret'), {
      name: 'Their kitchen',
      type: 'kitchen',
      sortOrder: 0,
      createdBy: OUTSIDER.uid,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
  });
});

// ============================================================
describe('unauthenticated access', () => {
  test('cannot read a workspace, its rooms, or its members', async () => {
    const db = asAnon();
    await assertFails(getDoc(doc(db, 'workspaces', WS)));
    await assertFails(getDoc(doc(db, 'workspaces', WS, 'rooms', 'room_kitchen')));
    await assertFails(getDoc(doc(db, 'workspaces', WS, 'members', OWNER.uid)));
  });

  test('cannot create a workspace', async () => {
    const db = asAnon();
    await assertFails(setDoc(doc(db, 'workspaces', 'ws_anon'), {
      name: 'Nope', ownerUid: 'x', createdBy: 'x',
      createdAt: serverTimestamp(), schemaVersion: 1
    }));
  });
});

// ============================================================
describe('workspace creation and bootstrap', () => {
  test('creator can create a workspace and its own owner row in one batch', async () => {
    const db = as(OUTSIDER);
    const wsId = 'ws_new';
    const batch = writeBatch(db);
    batch.set(doc(db, 'workspaces', wsId), {
      name: 'My remodel',
      ownerUid: OUTSIDER.uid,
      createdBy: OUTSIDER.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      schemaVersion: 1
    });
    batch.set(doc(db, 'workspaces', wsId, 'members', OUTSIDER.uid), {
      uid: OUTSIDER.uid,
      role: 'owner',
      displayName: 'Owner',
      email: OUTSIDER.email,
      joinedAt: serverTimestamp()
    });
    await assertSucceeds(batch.commit());
  });

  test('cannot create a workspace owned by someone else', async () => {
    const db = as(OUTSIDER);
    await assertFails(setDoc(doc(db, 'workspaces', 'ws_forged'), {
      name: 'Not mine',
      ownerUid: OWNER.uid,
      createdBy: OUTSIDER.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      schemaVersion: 1
    }));
  });

  test('client-supplied createdAt is rejected (server timestamp required)', async () => {
    const db = as(OUTSIDER);
    await assertFails(setDoc(doc(db, 'workspaces', 'ws_fake_time'), {
      name: 'Backdated',
      ownerUid: OUTSIDER.uid,
      createdBy: OUTSIDER.uid,
      createdAt: Timestamp.fromMillis(0),
      updatedAt: serverTimestamp(),
      schemaVersion: 1
    }));
  });

  test('outsider cannot forge an owner row in an existing workspace', async () => {
    const db = as(OUTSIDER);
    await assertFails(setDoc(doc(db, 'workspaces', WS, 'members', OUTSIDER.uid), {
      uid: OUTSIDER.uid,
      role: 'owner',
      displayName: 'Intruder',
      email: OUTSIDER.email,
      joinedAt: serverTimestamp()
    }));
  });

  test('outsider cannot grant themselves a non-owner role without an invite', async () => {
    const db = as(OUTSIDER);
    await assertFails(setDoc(doc(db, 'workspaces', WS, 'members', OUTSIDER.uid), {
      uid: OUTSIDER.uid,
      role: 'editor',
      displayName: 'Intruder',
      email: OUTSIDER.email,
      joinedAt: serverTimestamp(),
      inviteId: 'no_such_invite'
    }));
  });
});

// ============================================================
describe('workspace isolation', () => {
  test('a member of one workspace cannot read another workspace', async () => {
    const db = as(OWNER);
    await assertFails(getDoc(doc(db, 'workspaces', OTHER_WS)));
  });

  test('direct room-id probing across workspaces is denied', async () => {
    const db = as(OWNER);
    await assertFails(getDoc(doc(db, 'workspaces', OTHER_WS, 'rooms', 'room_secret')));
  });

  test('member roster of another workspace is not readable', async () => {
    const db = as(OWNER);
    await assertFails(getDoc(doc(db, 'workspaces', OTHER_WS, 'members', OUTSIDER.uid)));
  });

  test('workspaces cannot be listed as a directory', async () => {
    const db = as(OWNER);
    await assertFails(getDocs(collection(db, 'workspaces')));
  });

  test('outsider cannot write a room into a workspace they do not belong to', async () => {
    const db = as(OUTSIDER);
    await assertFails(setDoc(doc(db, 'workspaces', WS, 'rooms', 'room_injected'), {
      name: 'Injected', type: 'custom', sortOrder: 9,
      createdBy: OUTSIDER.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    }));
  });
});

// ============================================================
describe('rooms — role enforcement', () => {
  const newRoom = (uid) => ({
    name: 'Primary bath',
    type: 'bathroom_primary',
    sortOrder: 1,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  test('every member role can read rooms', async () => {
    for (const u of [OWNER, ADMIN, EDITOR, VIEWER, ACCOUNTANT]) {
      await assertSucceeds(getDoc(doc(as(u), 'workspaces', WS, 'rooms', 'room_kitchen')));
    }
  });

  test('owner, admin and editor can create rooms', async () => {
    let i = 0;
    for (const u of [OWNER, ADMIN, EDITOR]) {
      const db = as(u);
      await assertSucceeds(
        setDoc(doc(db, 'workspaces', WS, 'rooms', 'room_ok_' + i++), newRoom(u.uid))
      );
    }
  });

  test('viewer and accountant cannot create, update or delete rooms', async () => {
    for (const u of [VIEWER, ACCOUNTANT]) {
      const db = as(u);
      await assertFails(setDoc(doc(db, 'workspaces', WS, 'rooms', 'room_nope'), newRoom(u.uid)));
      await assertFails(updateDoc(doc(db, 'workspaces', WS, 'rooms', 'room_kitchen'), {
        name: 'Renamed', type: 'kitchen', sortOrder: 0, updatedAt: serverTimestamp()
      }));
      await assertFails(deleteDoc(doc(db, 'workspaces', WS, 'rooms', 'room_kitchen')));
    }
  });

  test('editor can update and delete rooms', async () => {
    const db = as(EDITOR);
    await assertSucceeds(updateDoc(doc(db, 'workspaces', WS, 'rooms', 'room_kitchen'), {
      name: 'Kitchen (gut)', type: 'kitchen', sortOrder: 0, updatedAt: serverTimestamp()
    }));
    await assertSucceeds(deleteDoc(doc(db, 'workspaces', WS, 'rooms', 'room_kitchen')));
  });

  test('a room update cannot rewrite its creation stamps', async () => {
    const db = as(EDITOR);
    await assertFails(updateDoc(doc(db, 'workspaces', WS, 'rooms', 'room_kitchen'), {
      name: 'Kitchen', type: 'kitchen', sortOrder: 0,
      createdBy: EDITOR.uid, updatedAt: serverTimestamp()
    }));
  });

  test('an empty room name is rejected', async () => {
    const db = as(EDITOR);
    await assertFails(setDoc(doc(db, 'workspaces', WS, 'rooms', 'room_blank'), {
      name: '', type: 'custom', sortOrder: 2,
      createdBy: EDITOR.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    }));
  });
});

// ============================================================
describe('members — role management', () => {
  // A role change writes exactly one field. joinedAt and uid are pinned by
  // the rules, so a client that resends them is rejected (covered below).
  test('admin can change another member role', async () => {
    const db = as(ADMIN);
    await assertSucceeds(
      updateDoc(doc(db, 'workspaces', WS, 'members', VIEWER.uid), { role: 'editor' })
    );
  });

  test('a role change cannot rewrite joinedAt or reassign the row to another uid', async () => {
    const db = as(ADMIN);
    await assertFails(updateDoc(doc(db, 'workspaces', WS, 'members', VIEWER.uid), {
      role: 'editor', joinedAt: Timestamp.fromMillis(0)
    }));
    await assertFails(updateDoc(doc(db, 'workspaces', WS, 'members', VIEWER.uid), {
      role: 'editor', uid: ADMIN.uid
    }));
  });

  test('nobody can promote themselves', async () => {
    const db = as(VIEWER);
    await assertFails(
      updateDoc(doc(db, 'workspaces', WS, 'members', VIEWER.uid), { role: 'admin' })
    );
  });

  test('an admin cannot demote themselves either', async () => {
    const db = as(ADMIN);
    await assertFails(
      updateDoc(doc(db, 'workspaces', WS, 'members', ADMIN.uid), { role: 'viewer' })
    );
  });

  test('editor cannot change anyone else role', async () => {
    const db = as(EDITOR);
    await assertFails(
      updateDoc(doc(db, 'workspaces', WS, 'members', VIEWER.uid), { role: 'admin' })
    );
  });

  test('no second owner can be minted', async () => {
    const db = as(ADMIN);
    await assertFails(
      updateDoc(doc(db, 'workspaces', WS, 'members', EDITOR.uid), { role: 'owner' })
    );
  });

  test('the owner row cannot be demoted or deleted, even by the owner', async () => {
    const db = as(OWNER);
    await assertFails(
      updateDoc(doc(db, 'workspaces', WS, 'members', OWNER.uid), { role: 'admin' })
    );
    await assertFails(deleteDoc(doc(db, 'workspaces', WS, 'members', OWNER.uid)));
  });

  test('admin can remove a non-owner member; viewer cannot', async () => {
    await assertFails(deleteDoc(doc(as(VIEWER), 'workspaces', WS, 'members', EDITOR.uid)));
    await assertSucceeds(deleteDoc(doc(as(ADMIN), 'workspaces', WS, 'members', EDITOR.uid)));
  });

  test('a member can remove themselves', async () => {
    await assertSucceeds(deleteDoc(doc(as(VIEWER), 'workspaces', WS, 'members', VIEWER.uid)));
  });

  test('only the owner can delete the workspace', async () => {
    await assertFails(deleteDoc(doc(as(ADMIN), 'workspaces', WS)));
    await assertSucceeds(deleteDoc(doc(as(OWNER), 'workspaces', WS)));
  });

  test('the owner can clear their own row only after the workspace is gone', async () => {
    // While it exists, the owner row is pinned (covered above). Once the
    // workspace document is deleted, the leftover row may be cleaned up —
    // but still only by that owner, not by anyone else.
    await seed((db) => deleteDoc(doc(db, 'workspaces', WS)));
    await assertFails(deleteDoc(doc(as(ADMIN), 'workspaces', WS, 'members', OWNER.uid)));
    await assertSucceeds(deleteDoc(doc(as(OWNER), 'workspaces', WS, 'members', OWNER.uid)));
  });

  test('admin can rename the workspace but cannot reassign ownership', async () => {
    await assertSucceeds(updateDoc(doc(as(ADMIN), 'workspaces', WS), {
      name: 'Condo remodel 2026', updatedAt: serverTimestamp()
    }));
    await assertFails(updateDoc(doc(as(ADMIN), 'workspaces', WS), {
      name: 'Condo remodel', ownerUid: ADMIN.uid, updatedAt: serverTimestamp()
    }));
  });
});

// ============================================================
describe('invites', () => {
  const future = () => Timestamp.fromMillis(Date.now() + 7 * 24 * 3600 * 1000);
  const past = () => Timestamp.fromMillis(Date.now() - 1000);

  const inviteData = (over = {}) => ({
    workspaceId: WS,
    email: OUTSIDER.email,
    role: 'editor',
    status: 'pending',
    createdBy: ADMIN.uid,
    createdAt: serverTimestamp(),
    expiresAt: future(),
    ...over
  });

  async function seedInvite(id, over = {}) {
    await seed((db) => setDoc(doc(db, 'invites', id), {
      workspaceId: WS,
      email: OUTSIDER.email,
      role: 'editor',
      status: 'pending',
      createdBy: ADMIN.uid,
      createdAt: Timestamp.now(),
      expiresAt: future(),
      ...over
    }));
  }

  test('admin can create an invite; editor and viewer cannot', async () => {
    await assertSucceeds(setDoc(doc(as(ADMIN), 'invites', 'inv_ok'), inviteData()));
    await assertFails(setDoc(doc(as(EDITOR), 'invites', 'inv_bad1'), inviteData({ createdBy: EDITOR.uid })));
    await assertFails(setDoc(doc(as(VIEWER), 'invites', 'inv_bad2'), inviteData({ createdBy: VIEWER.uid })));
  });

  test('an invite cannot confer ownership', async () => {
    await assertFails(setDoc(doc(as(OWNER), 'invites', 'inv_owner'), inviteData({
      role: 'owner', createdBy: OWNER.uid
    })));
  });

  test('an invite email must be stored lower-cased', async () => {
    await assertFails(setDoc(doc(as(ADMIN), 'invites', 'inv_case'), inviteData({
      email: 'Outsider@Example.com'
    })));
  });

  test('an invitee can find their own invite but not other people invites', async () => {
    await seedInvite('inv_mine');
    await seedInvite('inv_theirs', { email: 'someone.else@example.com' });

    const db = as(OUTSIDER);
    const mine = await assertSucceeds(
      getDocs(query(collection(db, 'invites'), where('email', '==', OUTSIDER.email)))
    );
    assert.equal(mine.size, 1);
    await assertFails(getDoc(doc(db, 'invites', 'inv_theirs')));
    await assertFails(getDocs(collection(db, 'invites')));
  });

  test('a valid invite lets the invitee join with exactly the granted role', async () => {
    await seedInvite('inv_join');
    const db = as(OUTSIDER);
    const batch = writeBatch(db);
    batch.set(doc(db, 'workspaces', WS, 'members', OUTSIDER.uid), {
      uid: OUTSIDER.uid,
      role: 'editor',
      displayName: 'Invited',
      email: OUTSIDER.email,
      joinedAt: serverTimestamp(),
      inviteId: 'inv_join'
    });
    batch.update(doc(db, 'invites', 'inv_join'), {
      status: 'accepted',
      acceptedBy: OUTSIDER.uid
    });
    await assertSucceeds(batch.commit());
  });

  test('an invitee cannot upgrade the role the invite granted', async () => {
    await seedInvite('inv_role');
    const db = as(OUTSIDER);
    await assertFails(setDoc(doc(db, 'workspaces', WS, 'members', OUTSIDER.uid), {
      uid: OUTSIDER.uid, role: 'admin', displayName: 'Greedy', email: OUTSIDER.email,
      joinedAt: serverTimestamp(), inviteId: 'inv_role'
    }));
  });

  test('an expired invite cannot be redeemed', async () => {
    await seedInvite('inv_expired', { expiresAt: past() });
    const db = as(OUTSIDER);
    await assertFails(setDoc(doc(db, 'workspaces', WS, 'members', OUTSIDER.uid), {
      uid: OUTSIDER.uid, role: 'editor', displayName: 'Late', email: OUTSIDER.email,
      joinedAt: serverTimestamp(), inviteId: 'inv_expired'
    }));
  });

  test('a revoked invite cannot be redeemed', async () => {
    await seedInvite('inv_revoked', { status: 'revoked' });
    const db = as(OUTSIDER);
    await assertFails(setDoc(doc(db, 'workspaces', WS, 'members', OUTSIDER.uid), {
      uid: OUTSIDER.uid, role: 'editor', displayName: 'Revoked', email: OUTSIDER.email,
      joinedAt: serverTimestamp(), inviteId: 'inv_revoked'
    }));
  });

  test('an already-accepted invite cannot be replayed', async () => {
    await seedInvite('inv_used', { status: 'accepted', acceptedBy: 'someone' });
    const db = as(OUTSIDER);
    await assertFails(setDoc(doc(db, 'workspaces', WS, 'members', OUTSIDER.uid), {
      uid: OUTSIDER.uid, role: 'editor', displayName: 'Replay', email: OUTSIDER.email,
      joinedAt: serverTimestamp(), inviteId: 'inv_used'
    }));
  });

  test('an invite addressed to someone else cannot be redeemed', async () => {
    await seedInvite('inv_other', { email: 'not.you@example.com' });
    const db = as(OUTSIDER);
    await assertFails(setDoc(doc(db, 'workspaces', WS, 'members', OUTSIDER.uid), {
      uid: OUTSIDER.uid, role: 'editor', displayName: 'Wrong person', email: OUTSIDER.email,
      joinedAt: serverTimestamp(), inviteId: 'inv_other'
    }));
  });

  test('an invite for another workspace cannot be redeemed here', async () => {
    await seedInvite('inv_elsewhere', { workspaceId: OTHER_WS });
    const db = as(OUTSIDER);
    await assertFails(setDoc(doc(db, 'workspaces', WS, 'members', OUTSIDER.uid), {
      uid: OUTSIDER.uid, role: 'editor', displayName: 'Wrong ws', email: OUTSIDER.email,
      joinedAt: serverTimestamp(), inviteId: 'inv_elsewhere'
    }));
  });

  test('a manager can revoke an invite; the invitee cannot revoke or rewrite one', async () => {
    await seedInvite('inv_rev');
    await assertSucceeds(updateDoc(doc(as(ADMIN), 'invites', 'inv_rev'), { status: 'revoked' }));

    await seedInvite('inv_rev2');
    await assertFails(updateDoc(doc(as(OUTSIDER), 'invites', 'inv_rev2'), { status: 'revoked' }));
    await assertFails(updateDoc(doc(as(OUTSIDER), 'invites', 'inv_rev2'), {
      role: 'admin', status: 'accepted', acceptedBy: OUTSIDER.uid
    }));
  });
});

// ============================================================
describe('projects, phases and tasks (M2)', () => {
  const project = (uid, over = {}) => ({
    title: 'Cabinet replacement',
    description: 'Replace uppers and lowers',
    roomId: 'room_kitchen',
    status: 'in_progress',
    priority: 'high',
    completionPct: 40,
    tags: ['kitchen', 'carpentry'],
    sortOrder: 0,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...over
  });

  test('every member can read projects; editors and up can create them', async () => {
    await seed((db) => setDoc(doc(db, 'workspaces', WS, 'projects', 'p1'), {
      ...project(OWNER.uid), createdAt: Timestamp.now(), updatedAt: Timestamp.now()
    }));
    for (const u of [OWNER, ADMIN, EDITOR, VIEWER, ACCOUNTANT]) {
      await assertSucceeds(getDoc(doc(as(u), 'workspaces', WS, 'projects', 'p1')));
    }
    await assertSucceeds(
      setDoc(doc(as(EDITOR), 'workspaces', WS, 'projects', 'p2'), project(EDITOR.uid))
    );
  });

  test('viewer and accountant cannot create or delete a project', async () => {
    for (const u of [VIEWER, ACCOUNTANT]) {
      await assertFails(
        setDoc(doc(as(u), 'workspaces', WS, 'projects', 'p_nope'), project(u.uid))
      );
    }
    await seed((db) => setDoc(doc(db, 'workspaces', WS, 'projects', 'p1'), {
      ...project(OWNER.uid), createdAt: Timestamp.now(), updatedAt: Timestamp.now()
    }));
    await assertFails(deleteDoc(doc(as(VIEWER), 'workspaces', WS, 'projects', 'p1')));
  });

  test('an invented status or priority is rejected', async () => {
    await assertFails(setDoc(doc(as(EDITOR), 'workspaces', WS, 'projects', 'p_bad1'),
      project(EDITOR.uid, { status: 'totally_done' })));
    await assertFails(setDoc(doc(as(EDITOR), 'workspaces', WS, 'projects', 'p_bad2'),
      project(EDITOR.uid, { priority: 'urgent' })));
  });

  test('completion percentage must stay within 0-100', async () => {
    await assertFails(setDoc(doc(as(EDITOR), 'workspaces', WS, 'projects', 'p_bad3'),
      project(EDITOR.uid, { completionPct: 140 })));
    await assertFails(setDoc(doc(as(EDITOR), 'workspaces', WS, 'projects', 'p_bad4'),
      project(EDITOR.uid, { completionPct: -1 })));
  });

  test('a project in another workspace is not readable or writable', async () => {
    await seed((db) => setDoc(doc(db, 'workspaces', OTHER_WS, 'projects', 'p_secret'), {
      ...project(OUTSIDER.uid), createdAt: Timestamp.now(), updatedAt: Timestamp.now()
    }));
    await assertFails(getDoc(doc(as(OWNER), 'workspaces', OTHER_WS, 'projects', 'p_secret')));
    await assertFails(setDoc(doc(as(OWNER), 'workspaces', OTHER_WS, 'projects', 'p_inject'),
      project(OWNER.uid)));
  });

  test('phases and tasks follow the same role rules', async () => {
    await assertSucceeds(setDoc(doc(as(EDITOR), 'workspaces', WS, 'phases', 'ph1'), {
      projectId: 'p1', name: 'Demo', sortOrder: 0,
      createdBy: EDITOR.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    }));
    await assertSucceeds(setDoc(doc(as(EDITOR), 'workspaces', WS, 'tasks', 't1'), {
      projectId: 'p1', title: 'Measure the run', done: false, priority: 'medium',
      createdBy: EDITOR.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    }));
    await assertFails(setDoc(doc(as(VIEWER), 'workspaces', WS, 'tasks', 't2'), {
      projectId: 'p1', title: 'Nope', done: false, priority: 'medium',
      createdBy: VIEWER.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    }));
  });

  test('a task cannot be moved to a different project after creation', async () => {
    await seed((db) => setDoc(doc(db, 'workspaces', WS, 'tasks', 't_move'), {
      projectId: 'p1', title: 'Fixed', done: false, priority: 'low',
      createdBy: OWNER.uid, createdAt: Timestamp.now(), updatedAt: Timestamp.now()
    }));
    await assertFails(updateDoc(doc(as(EDITOR), 'workspaces', WS, 'tasks', 't_move'), {
      projectId: 'p_other', title: 'Fixed', done: false, priority: 'low',
      updatedAt: serverTimestamp()
    }));
  });
});

// ============================================================
describe('media and ideas (M3)', () => {
  const mediaDoc = (uid, over = {}) => ({
    category: 'before',
    caption: 'Kitchen as bought',
    roomId: 'room_kitchen',
    projectId: null,
    tags: ['kitchen'],
    bytes: 180000,
    width: 1280,
    height: 960,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...over
  });

  test('editors can add media; viewers cannot', async () => {
    await assertSucceeds(
      setDoc(doc(as(EDITOR), 'workspaces', WS, 'media', 'm1'), mediaDoc(EDITOR.uid))
    );
    await assertFails(
      setDoc(doc(as(VIEWER), 'workspaces', WS, 'media', 'm2'), mediaDoc(VIEWER.uid))
    );
  });

  test('every member can view media metadata', async () => {
    await seed((db) => setDoc(doc(db, 'workspaces', WS, 'media', 'm1'), {
      ...mediaDoc(OWNER.uid), createdAt: Timestamp.now(), updatedAt: Timestamp.now()
    }));
    for (const u of [OWNER, ADMIN, EDITOR, VIEWER, ACCOUNTANT]) {
      await assertSucceeds(getDoc(doc(as(u), 'workspaces', WS, 'media', 'm1')));
    }
  });

  test('an invented photo category is rejected', async () => {
    await assertFails(setDoc(doc(as(EDITOR), 'workspaces', WS, 'media', 'm_bad'),
      mediaDoc(EDITOR.uid, { category: 'blackmail' })));
  });

  const payload = (n) => Bytes.fromUint8Array(new Uint8Array(n));

  test('image payloads are size-capped so a document cannot exceed the 1 MiB limit', async () => {
    await assertSucceeds(setDoc(doc(as(EDITOR), 'workspaces', WS, 'mediaThumbs', 'm1'),
      { data: payload(20000) }));
    await assertFails(setDoc(doc(as(EDITOR), 'workspaces', WS, 'mediaThumbs', 'm2'),
      { data: payload(90000) }));
    await assertSucceeds(setDoc(doc(as(EDITOR), 'workspaces', WS, 'mediaBlobs', 'm1'),
      { data: payload(500000) }));
    await assertFails(setDoc(doc(as(EDITOR), 'workspaces', WS, 'mediaBlobs', 'm2'),
      { data: payload(960000) }));
  });

  test('a payload sent as text rather than bytes is rejected', async () => {
    await assertFails(setDoc(doc(as(EDITOR), 'workspaces', WS, 'mediaBlobs', 'm3'),
      { data: 'x'.repeat(1000) }));
  });

  test('image payloads in another workspace are unreadable by id', async () => {
    await seed((db) => setDoc(doc(db, 'workspaces', OTHER_WS, 'mediaBlobs', 'secret'),
      { data: payload(1000) }));
    await assertFails(getDoc(doc(as(OWNER), 'workspaces', OTHER_WS, 'mediaBlobs', 'secret')));
  });

  const ideaDoc = (uid, over = {}) => ({
    title: 'Shaker cabinet, matte white',
    status: 'shortlisted',
    roomId: 'room_kitchen',
    projectId: null,
    tags: ['cabinets'],
    sourceUrl: 'https://example.com/product',
    vendor: 'Example Cabinets',
    model: 'SHK-100',
    estPrice: 4200,
    notes: '',
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...over
  });

  test('editors can save ideas; viewers cannot', async () => {
    await assertSucceeds(
      setDoc(doc(as(EDITOR), 'workspaces', WS, 'ideas', 'i1'), ideaDoc(EDITOR.uid))
    );
    await assertFails(
      setDoc(doc(as(VIEWER), 'workspaces', WS, 'ideas', 'i2'), ideaDoc(VIEWER.uid))
    );
  });

  test('an invented idea status or a negative price is rejected', async () => {
    await assertFails(setDoc(doc(as(EDITOR), 'workspaces', WS, 'ideas', 'i_bad1'),
      ideaDoc(EDITOR.uid, { status: 'maybe' })));
    await assertFails(setDoc(doc(as(EDITOR), 'workspaces', WS, 'ideas', 'i_bad2'),
      ideaDoc(EDITOR.uid, { estPrice: -5 })));
  });
});

// ============================================================
describe('money (M4)', () => {
  const expense = (uid, over = {}) => ({
    kind: 'payment',
    description: 'Progress payment 2',
    amount: 4200,
    tax: 0,
    shipping: 0,
    total: 4200,
    vendor: 'Example Carpentry',
    invoiceNumber: 'INV-2',
    roomId: 'room_kitchen',
    projectId: 'p1',
    contractorId: null,
    notes: '',
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...over
  });

  test('editors and up can record money; viewers and accountants cannot', async () => {
    await assertSucceeds(
      setDoc(doc(as(EDITOR), 'workspaces', WS, 'expenses', 'e1'), expense(EDITOR.uid))
    );
    await assertFails(
      setDoc(doc(as(VIEWER), 'workspaces', WS, 'expenses', 'e2'), expense(VIEWER.uid))
    );
    await assertFails(
      setDoc(doc(as(ACCOUNTANT), 'workspaces', WS, 'expenses', 'e3'), expense(ACCOUNTANT.uid))
    );
  });

  test('the accountant role can read money but not private notes', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'workspaces', WS, 'expenses', 'e1'), {
        ...expense(OWNER.uid), createdAt: Timestamp.now(), updatedAt: Timestamp.now()
      });
      await setDoc(doc(db, 'workspaces', WS, 'privateNotes', 'p1'), {
        body: 'secret', createdBy: OWNER.uid,
        createdAt: Timestamp.now(), updatedAt: Timestamp.now()
      });
    });
    await assertSucceeds(getDoc(doc(as(ACCOUNTANT), 'workspaces', WS, 'expenses', 'e1')));
    await assertFails(getDoc(doc(as(ACCOUNTANT), 'workspaces', WS, 'privateNotes', 'p1')));
  });

  test('an invented money kind or a negative amount is rejected', async () => {
    await assertFails(setDoc(doc(as(EDITOR), 'workspaces', WS, 'expenses', 'e_bad1'),
      expense(EDITOR.uid, { kind: 'bribe' })));
    await assertFails(setDoc(doc(as(EDITOR), 'workspaces', WS, 'expenses', 'e_bad2'),
      expense(EDITOR.uid, { amount: -100, total: -100 })));
  });

  test('an amount sent as text is rejected', async () => {
    await assertFails(setDoc(doc(as(EDITOR), 'workspaces', WS, 'expenses', 'e_bad3'),
      expense(EDITOR.uid, { amount: '4200' })));
  });

  test('money in another workspace is unreachable by document id', async () => {
    await seed((db) => setDoc(doc(db, 'workspaces', OTHER_WS, 'expenses', 'theirs'), {
      ...expense(OUTSIDER.uid), createdAt: Timestamp.now(), updatedAt: Timestamp.now()
    }));
    await assertFails(getDoc(doc(as(OWNER), 'workspaces', OTHER_WS, 'expenses', 'theirs')));
    await assertFails(getDoc(doc(as(ACCOUNTANT), 'workspaces', OTHER_WS, 'expenses', 'theirs')));
  });

  test('budgets follow the same rules and reject a negative approved amount', async () => {
    await assertSucceeds(setDoc(doc(as(EDITOR), 'workspaces', WS, 'budgets', 'p1'), {
      estimatedCost: 16000, approvedBudget: 16000, contingency: 1500
    }));
    await assertFails(setDoc(doc(as(EDITOR), 'workspaces', WS, 'budgets', 'p2'), {
      approvedBudget: -1
    }));
    await assertFails(setDoc(doc(as(VIEWER), 'workspaces', WS, 'budgets', 'p3'), {
      approvedBudget: 100
    }));
    await assertSucceeds(getDoc(doc(as(VIEWER), 'workspaces', WS, 'budgets', 'p1')));
  });
});

// ============================================================
describe('private notes are physically separated', () => {
  beforeEach(async () => {
    await seed((db) => setDoc(doc(db, 'workspaces', WS, 'privateNotes', 'p1'), {
      body: 'Contractor quoted high; do not share.',
      createdBy: OWNER.uid, createdAt: Timestamp.now(), updatedAt: Timestamp.now()
    }));
  });

  test('owner, admin, editor and viewer can read them', async () => {
    for (const u of [OWNER, ADMIN, EDITOR, VIEWER]) {
      await assertSucceeds(getDoc(doc(as(u), 'workspaces', WS, 'privateNotes', 'p1')));
    }
  });

  test('the accountant role cannot read them', async () => {
    await assertFails(getDoc(doc(as(ACCOUNTANT), 'workspaces', WS, 'privateNotes', 'p1')));
  });

  test('a non-member cannot read them by guessing the document id', async () => {
    await assertFails(getDoc(doc(as(OUTSIDER), 'workspaces', WS, 'privateNotes', 'p1')));
  });

  test('only editors and up can write them', async () => {
    await assertSucceeds(updateDoc(doc(as(EDITOR), 'workspaces', WS, 'privateNotes', 'p1'), {
      body: 'Updated', updatedAt: serverTimestamp()
    }));
    await assertFails(updateDoc(doc(as(VIEWER), 'workspaces', WS, 'privateNotes', 'p1'), {
      body: 'Nope', updatedAt: serverTimestamp()
    }));
  });
});

// ============================================================
describe('activity log is append-only', () => {
  const event = (uid) => ({
    kind: 'project_status',
    summary: 'Cabinets moved to In Progress',
    entityId: 'p1',
    byUid: uid,
    at: serverTimestamp()
  });

  test('a member can append an event attributed to themselves', async () => {
    await assertSucceeds(
      setDoc(doc(as(EDITOR), 'workspaces', WS, 'activity', 'a1'), event(EDITOR.uid))
    );
  });

  test('an event cannot be attributed to somebody else', async () => {
    await assertFails(
      setDoc(doc(as(EDITOR), 'workspaces', WS, 'activity', 'a2'), event(OWNER.uid))
    );
  });

  test('history cannot be rewritten or erased, even by the owner', async () => {
    await seed((db) => setDoc(doc(db, 'workspaces', WS, 'activity', 'a3'), {
      ...event(EDITOR.uid), at: Timestamp.now()
    }));
    await assertFails(updateDoc(doc(as(OWNER), 'workspaces', WS, 'activity', 'a3'), {
      summary: 'Never happened'
    }));
    await assertFails(deleteDoc(doc(as(OWNER), 'workspaces', WS, 'activity', 'a3')));
  });

  test('a viewer cannot write activity at all', async () => {
    await assertFails(
      setDoc(doc(as(VIEWER), 'workspaces', WS, 'activity', 'a4'), event(VIEWER.uid))
    );
  });
});

// ============================================================
describe('user pointer index', () => {
  test('a user can read and write only their own pointer document', async () => {
    const db = as(VIEWER);
    await assertSucceeds(setDoc(doc(db, 'users', VIEWER.uid), { workspaces: { [WS]: { name: 'Condo remodel' } } }));
    await assertSucceeds(getDoc(doc(db, 'users', VIEWER.uid)));
    await assertFails(getDoc(doc(db, 'users', OWNER.uid)));
    await assertFails(setDoc(doc(db, 'users', OWNER.uid), { workspaces: {} }));
  });

  test('forging a pointer grants no access to the workspace itself', async () => {
    const db = as(OUTSIDER);
    await assertSucceeds(setDoc(doc(db, 'users', OUTSIDER.uid), {
      workspaces: { [WS]: { name: 'Condo remodel' } }
    }));
    await assertFails(getDoc(doc(db, 'workspaces', WS)));
    await assertFails(getDoc(doc(db, 'workspaces', WS, 'rooms', 'room_kitchen')));
  });
});
