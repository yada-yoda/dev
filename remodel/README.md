# RemodelHQ

Plan, budget and document a home remodel: rooms, projects, photos, costs,
purchases and contractors in one private workspace.

A static single-page app with no build step and no server of its own. Data
lives in Firebase (free Spark plan), and every access decision is enforced by
Firestore security rules rather than by the interface.

**Status: v0.1.0 — Milestone 1 (foundation).** Sign-in, workspaces, roles,
invitations and rooms work. Projects, photos, budgets, the product registry
and contractor sharing arrive in later milestones (see the roadmap below).

---

## What it does today

- **Google sign-in.** Whoever creates a workspace owns it — no account is
  hard-coded anywhere, so anyone can run their own remodel in their own copy.
- **Workspaces.** One workspace holds one property. A person can belong to
  several and switch between them.
- **Roles.** Owner, Admin, Editor, Viewer and Accountant, each with a
  described set of powers. The owner cannot be demoted or removed, and no
  second owner can be created by accident.
- **Invitations.** Invite a collaborator by email address with a role and a
  14-day expiry. They sign in with that Google account and the invitation is
  waiting for them. Invitations can be revoked at any time.
- **Rooms.** Add the areas of the property, with type, dimensions, ceiling
  height and notes. A starter layout for a two-bedroom, two-bathroom condo is
  one click. Everything in later milestones is organized by room.

## Roadmap

| Milestone | Scope |
|---|---|
| 1 (done) | Foundation: auth, workspaces, roles, invitations, rooms, security rules |
| 2 | Projects, phases, tasks, tags, list and board views, activity log |
| 3 | Photos and ideas: compressed uploads, before/after galleries, mood boards |
| 4 | Budget, expenses, contractors, contractor jobs, product and purchase registry |
| 5 | Scoped contractor sharing with start and expiry dates, contractor portal |
| 6 | PDF reports, CSV exports, full ZIP backup, import and restore |
| 7 | Bids, change orders, decision log, punch lists, permits, warranties |

## Design

Minimal and photo-forward: white, hairline borders, generous whitespace,
Inter throughout, solid-ink primary actions, and a single cobalt accent
reserved for links and progress. Fully responsive — a sidebar on desktop, a
bottom bar on phones, and tables that become cards rather than scrolling
sideways.

---

## Setup

Everything below is free and needs no payment method.

1. **Create a Firebase project** at console.firebase.google.com (Spark plan).
2. **Firestore:** Build > Firestore Database > Create database, production mode.
3. **Auth:** Build > Authentication > Sign-in method > enable **Google**.
4. **Web app:** Project settings > General > Your apps > Web. Copy the config
   object into `firebaseConfig` in `firebase-config.js`. Those values are
   public by design and safe to commit — the security boundary is
   `firestore.rules`.
5. **Authorized domains:** Authentication > Settings > Authorized domains —
   add the domain you serve from (`localhost` is already allowed).
6. **Deploy the rules** — the app is not safe to use until this is done:

   ```
   npx firebase login
   npx firebase deploy --only firestore:rules --project YOUR_PROJECT_ID
   ```

7. **Analytics (optional):** replace the placeholder measurement id in
   `index.html`. Any device can opt out permanently with `?ga=off`, and back
   in with `?ga=on`. Analytics records section views only — never personal
   details, photos or amounts.

## Security model

- Membership is a document, `workspaces/{id}/members/{uid}`. Its existence is
  what proves access; the interface never decides.
- `users/{uid}` is only a pointer index for "which workspaces am I in". It is
  writable by its own account and is deliberately not trusted — forging it
  grants nothing.
- A workspace and its owner row are written in one batch, and the rules verify
  the owner row against the workspace being created in that same commit, so a
  workspace can never exist without exactly one owner.
- Invitations are re-verified server-side at the moment they are redeemed:
  right email, right workspace, right role, still pending, not expired.
- Timestamps must come from the server, so records cannot be backdated.
- Later milestones keep private notes and financial amounts in physically
  separate collections, so a contractor's scoped access cannot select them
  even by guessing document ids.

## Development

Serve the folder over http (module scripts do not work from `file://`):

```
python -m http.server 8745
```

Then open `http://localhost:8745/remodel/`.

### Running the app without a Firebase project

Start the emulators, then load the page with `?emu=1`. Add
`&as=someone@example.com` to choose which identity signs in, which is how the
role and invitation flows are exercised locally. This mode only engages on
localhost.

```
cd tests
npm install
npx firebase emulators:start --only firestore,auth --project demo-remodelhq --config ../firebase.json
```

### Security rules tests

The rules are the security boundary, so they have their own test suite. It
runs against the local emulator and needs Java installed.

```
cd tests
npm install
npm test
```

44 tests cover every role plus the adversarial cases: cross-workspace reads,
direct document-id probing, self-promotion, forging an owner row, backdated
timestamps, and reusing expired, revoked, replayed or someone else's
invitation. Rules changes ship with their tests in the same commit.

### Manual checklist

- Sign in, create a workspace, confirm you are its Owner.
- Add the starter rooms, edit one, delete one.
- Invite a second address as Editor; sign in as that identity and accept.
- As the Editor, confirm the People page offers no role controls.
- As the Owner, change that person's role, then remove them.
- Confirm a phone-width window has no horizontal scrollbar on any page.

## Changelog

### 0.1.0

The foundation release. The goal was to get the parts that are painful to
change later right the first time: who owns a workspace, who can do what, and
how that is enforced.

Access is decided by security rules on the database rather than by the
interface, and the rules ship with a 44-test suite that actively tries to
break in — because an authorization mistake found after there are photos,
budgets and contractors in the system is a much more expensive mistake.

Ownership is deliberately not tied to any particular email address: the
account that creates a workspace owns it. That keeps the door open for other
people to use this for their own remodel later without a rewrite.
