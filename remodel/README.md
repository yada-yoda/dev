# RemodelHQ

Plan, budget and document a home remodel: rooms, projects, photos, costs,
purchases and contractors in one private workspace.

A static single-page app with no build step and no server of its own. Data
lives in Firebase (free Spark plan), and every access decision is enforced by
Firestore security rules rather than by the interface.

**Status: v0.3.0 — Milestone 3 (photos and ideas).** Sign-in, workspaces,
roles, invitations, rooms, projects with phases and tasks, and now photos and
an idea library. Budgets, the product registry and contractor sharing arrive
in later milestones (see the roadmap below).

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
  one click. Everything else is organized by room.
- **Projects.** Title, room, status, priority, planned dates, completion and
  tags. Twelve statuses from Idea through to Complete, in a **list** view with
  sortable, choosable columns or a **board** grouped into five lanes. Filter
  by room, status, priority or tag, or search across everything.
- **Phases and tasks.** Break a project into phases, add tasks with due dates
  and priorities, tick them off. Overdue tasks are called out.
- **Private notes.** Per project, stored in a separate collection that
  contractor access can never reach and the accountant role cannot read.
- **History.** An append-only activity log — nobody can rewrite or delete it,
  including the owner — shown per project and on the dashboard.
- **Dashboard.** Overall completion, active projects, blocked work needing
  attention, overdue tasks and recent activity.
- **Photos.** Multi-file upload (the camera, on a phone), sorted into before,
  in progress, after, inspiration, damage, receipts and plans. Grid, timeline
  by month, and a side-by-side before/after comparison per room. Filter by
  room, project or type.
- **Ideas.** Products and materials you are considering, with vendor, model or
  SKU, estimated price, a link to where you found it, and a status from Saved
  through Shortlisted to Selected, Purchased or Rejected — so the options you
  turned down stay on record.

## Roadmap

| Milestone | Scope |
|---|---|
| 1 (done) | Foundation: auth, workspaces, roles, invitations, rooms, security rules |
| 2 (done) | Projects, phases, tasks, tags, list and board views, activity log |
| 3 (done) | Photos and ideas: compressed uploads, galleries, before/after comparison |
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

59 tests cover every role plus the adversarial cases: cross-workspace reads,
direct document-id probing, self-promotion, forging an owner row, backdated
timestamps, reusing expired, revoked, replayed or someone else's invitation,
reading private notes as the accountant role, and rewriting or deleting
activity history. Rules changes ship with their tests in the same commit.

### Manual checklist

- Sign in, create a workspace, confirm you are its Owner.
- Add the starter rooms, edit one, delete one.
- Invite a second address as Editor; sign in as that identity and accept.
- As the Editor, confirm the People page offers no role controls.
- As the Owner, change that person's role, then remove them.
- Confirm a phone-width window has no horizontal scrollbar on any page.

## Changelog

### 0.3.0

Photos and ideas — the two things people reach for first and regret not having
later.

Photos are processed entirely in the browser before they are stored: EXIF
orientation is applied and then all EXIF is discarded, which means **GPS
coordinates never reach the database** and cannot leak into a photo shared
with a contractor. Each image is resized and encoded to WebP, stepping quality
down until it fits, and a separate small thumbnail is produced. Galleries load
only thumbnails, so browsing a few hundred photos costs a few hundred small
reads rather than a few hundred full images — which matters on a free tier
with a daily read quota.

Images are stored as native bytes rather than base64. Base64 would inflate
every photo by a third against the 1 GiB the free plan allows, for no benefit.

The idea library records vendor, model or SKU, price and source link against a
status, and keeps rejected options rather than deleting them — the point is to
remember which of four shortlisted faucets you chose, and why the others lost.

The navigation outgrew a phone's bottom bar at seven sections, so the four most
used stay on the bar and the rest moved behind More.

### 0.2.0

Projects, which is what the rest of the app hangs off. A project carries a
room, a status, a priority, dates and tags; it breaks down into phases and
tasks; and it keeps its own history.

Two decisions worth recording. First, the board groups twelve statuses into
five lanes rather than showing a column per status — a twelve-column board
forces sideways scrolling on any normal screen, and sideways scrolling is
exactly what this project refuses to do. Second, there is deliberately no
money on a project yet: costs arrive in the next milestone in their own
collection, so that contractor sharing can later show someone the scope and
schedule of their work without showing them the budget.

Private notes and the activity log both went in now rather than later, for
the same reason: private notes live in a separate collection so contractor
access cannot reach them by guessing an id, and history is append-only so it
cannot be quietly rewritten. Both are far cheaper to build in at the start
than to retrofit.

Also fixed a caching trap: a deploy could previously pair a fresh `app.js`
with a browser-cached `store.js`. All modules now load through one versioned
entry point.

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
