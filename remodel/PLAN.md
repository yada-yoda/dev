# RemodelHQ — Build Plan

Name: **RemodelHQ** (decided 2026-07-27; "for now" — a rename before
first release is cheap, after it is not).
A private, mobile-responsive web app to plan, organize, budget, document, and
share a condo remodel. Built by Opus 5 from this plan, one milestone at a
time, after the owner approves a design direction.

This plan supersedes an earlier ChatGPT-generated prompt. The feature goals
from that prompt are all preserved; the stack and phasing are changed to fit
hard constraints below.

---

## Hard constraints (non-negotiable)

1. **$0 forever.** No paid services, no free tiers that require a credit
   card, no trials. Every dependency must be free at this app's scale with
   no card on file. If a feature can't be done for $0, it ships in a reduced
   form or waits.
2. **Hosting:** lives in the `yada-yoda/dev` repo at `remodel/`, served at
   `https://dev.rizzo.cc/remodel/` via GitHub Pages. Static files only —
   no server-side rendering, no server endpoints in the app itself.
3. **Privacy:** the repo is public. No personal data in the repo — no real
   names, emails, addresses, unit numbers, or identifiable photos. README
   and any screenshots use generic demo data only. All real data lives in
   Firebase behind auth. The site stays noindexed (dev.rizzo.cc standard).
4. **Do not hard-code ownership to an email address.** The first
   authenticated Google user to create a workspace becomes its owner. The
   data model supports multiple workspaces so other people could run their
   own remodel in the future.
5. Design and UX must follow the house standards checklist at the bottom of
   this plan.

## Stack

- **Frontend:** static single-page app — vanilla HTML/CSS/JS (ES modules),
  matching the Clover / PawPrints / Ledger pattern in this repo. No build
  step, no framework, relative paths so it works under `/remodel/`.
- **Firebase (Spark plan — free, no card):**
  - **Auth:** Google sign-in for owner and collaborators. **Email-link
    (passwordless) sign-in** for contractors — they never need a Google
    account. (Web email-link auth does not depend on the retired Dynamic
    Links product.)
  - **Firestore:** all data, including photos (see Photo strategy). Spark
    limits: 1 GiB stored, 50K reads / 20K writes per day, ~10 GiB/mo
    egress — far above this app's needs if we're deliberate.
  - **Security rules:** replace Supabase RLS. Rules are written in the same
    milestone as the data they protect, never deferred, and tested with the
    free local Firestore emulator.
  - **New dedicated Firebase project** for this app (own auth surface for
    contractors and future users; don't share the sick/pawprints project).
- **PDF:** client-side. Dedicated print views + print stylesheets
  (browser print-to-PDF) as the primary path; `pdf-lib`/`jsPDF` from a
  vendored copy only if programmatic generation proves necessary.
- **Backup:** client-side ZIP via JSZip (vendored) — versioned JSON
  manifest + all photos as files + human-readable summary.
- **Later, optional:** a `remodel-worker` Cloudflare Worker (free tier) for
  email notifications via Resend on the shared `notify.rizzo.cc` domain,
  mirroring pawprints-worker/clover-worker. Not in scope until the core app
  is done. (Native cron slots are full — use cron-job.org pinger pattern.)
- **Analytics:** GA4 from first release, with the standard per-device
  `?ga=off` / `?ga=on` localStorage opt-out (dynamic-IP household — no IP
  filter). Page/feature usage only; never log personal data, photo
  content, or financial values in events.
- **No Playwright/Vitest harness.** Testing = Firestore rules tests on the
  emulator (critical, see Testing) plus targeted in-browser test pages for
  budget math and expiration logic.

Why not the originally proposed Next.js + Supabase + Vercel: GitHub Pages
can't run Next.js server features; Supabase's free tier pauses the database
after ~1 week of inactivity (fatal for a tracker that goes quiet between
remodel phases); and the whole stack duplicates what Firebase Spark already
provides with zero cost and no card.

## Photo strategy ($0, no card)

Firebase Storage now requires the Blaze plan for new buckets, so photos go
**in Firestore as compressed base64**, behind a small storage-adapter
interface so a real object store (e.g. Cloudflare R2) can be swapped in
later without touching feature code.

- On upload (camera or photo library on mobile, file picker or drag-drop on
  desktop): client-side compress via canvas → WebP, long edge ~1280px,
  quality ~0.8 → typically 100–300 KB. One photo = one Firestore doc
  (docs max 1 MiB; base64 inflates ~33%, so cap binary at ~700 KB; chunk
  across docs only if ever needed).
- Also generate a small thumbnail (~15–25 KB) stored in a **separate** doc;
  galleries read only thumbs. Full image loads on demand. Cache loaded
  images in IndexedDB to conserve the egress quota.
- Strip EXIF (including GPS) during re-encode — this falls out of the
  canvas round-trip automatically. Apply EXIF orientation before encode.
- Budget: 1 GiB ≈ ~4,000 photos at 250 KB. Show a storage meter in
  Settings so the owner can see usage.
- **Originals → the user's own Google Drive (free, their quota).** After
  the compressed copy saves, the original file is uploaded unmodified to
  the signed-in user's Google Drive using the **`drive.file` OAuth scope**
  — the app can only see/manage files and folders it created, nothing
  else in the Drive. Details:
  - On first use, the app creates one app-named folder (subfolders per
    room/project optional) and stores its folder ID in Firestore; each
    media doc stores its Drive file ID.
  - Request the scope via the Google Identity Services token client at
    upload time (Firebase's sign-in token expires ~1 hr and isn't
    refreshed, so mint a fresh Drive token on demand; cache for the
    session). Consent screen ships with only this non-sensitive scope, so
    no Google verification review is needed.
  - Uploads are multipart REST calls direct from the browser. Best-effort:
    if the user declines the scope or is offline, the app still works —
    the compressed Firestore copy is always canonical, and the media doc
    tracks original-backup status (with a retry queue).
  - Originals land in the Drive of whichever member uploaded them; each
    doc records whose Drive holds it. Only that Google account can fetch
    its originals — collaborators and contractors see the compressed
    copies. The owner gets an "open original in Drive" link on their own
    uploads, and the ZIP backup includes originals when the exporting
    user's Drive holds them.
- Multi-file upload with progress, captions, tags, categories (before /
  in-progress / after / inspiration / damage / receipt / plan / document),
  date taken, room, project, phase, visibility, and optional
  before/after comparison grouping. Gallery, timeline, and side-by-side
  compare views; filter by room, project, date, category.

## Data model (Firestore)

Top-level `workspaces/{wsId}` with subcollections. Proposed collections
(adapt as needed, keep the *physical separation* rules below):

- `workspaces` — name, createdAt, ownerUid
- `workspaces/{ws}/members/{uid}` — role, displayName, invitedBy, joinedAt
- `invites` — pending email invites (role, token hash, expiry)
- `properties`, `rooms` — customizable rooms (kitchen, living, bedrooms,
  baths, hallway, entry, patio, utility, whole-property, custom); each room:
  description, dimensions/measurements, notes, budget rollup
- `projects` — title, description, room, owner, contractor, status,
  priority, planned/actual dates, estimated cost, approved budget, actual
  cost, contingency, completion %, tags, dependencies
- `phases`, `tasks`, `taskChecklistItems`
- `ideas` — title, room, project, category, tags, source URL, vendor,
  manufacturer, model/SKU, est. price, images, pros/cons, status
  (Saved / Researching / Shortlisted / Selected / Purchased / Rejected),
  rejection reason, related alternatives
- `moodBoards`, `moodBoardItems` — drag-drop arrangement, captions, source
  links, color/material notes, private-or-shareable flag; responsive
  masonry grid; mobile camera upload
- `media` (photo metadata), `mediaBlobs` (base64 payloads), `mediaThumbs`
- `documents` — contracts, proposals, estimates, invoices, receipts,
  permits, inspection reports, floor plans, manuals, warranties; assignable
  to property/room/project/contractor/job. Same Firestore-blob storage as
  photos; enforce size/MIME limits client-side AND in rules (size caps).
- `products` — **product & purchase registry** (see below)
- `expenses`, `budgets` — see Financials
- `contractors`, `contractorContacts`, `contractorJobs`, `bids`,
  `bidItems`, `invoices`, `payments`, `changeOrders`
- `decisions` — decision log (options considered, selected, date, decided
  by, reason, budget/schedule effect, links)
- `punchLists`, `punchListItems`, `permits`, `inspections`, `warranties`
- `comments` — threaded, on projects/tasks/ideas/expenses/photos/docs/
  change orders/punch items; @mentions
- `notifications` — in-app only for v1
- `accessGrants`, plus scope records (see Sharing)
- `activityLog` — status changes, budget changes, payments, permission
  changes, uploads, deletes/restores
- `trash` — soft delete with owner-controlled restore

Conventions: auto-ID keys, `createdAt`/`updatedAt`/`createdBy` on every
doc, enumerated statuses as string constants in one shared module.

**Physical separation (hard requirement):** anything a contractor must
never see lives in documents contractors' rules can never read — not
hidden fields on shared docs, not CSS. Specifically:

- `privateNotes/{parentId}` — owner/collaborator-only notes, separate from
  contractor-visible notes on the parent doc.
- `financials/…` — amounts, budgets, invoices, payments live apart from
  scope/schedule data so a grant can expose scope without money.

## Roles & permissions

| Capability | Owner | Admin | Editor | Viewer | Accountant | Contractor |
|---|---|---|---|---|---|---|
| View everything | ✔ | ✔ | ✔ | ✔ | financials only | scoped only |
| Create/edit projects, tasks, ideas, photos, expenses | ✔ | ✔ | ✔ | — | — | narrow uploads if granted |
| Manage members & contractor access | ✔ | ✔ | — | — | — | — |
| Export/import, delete workspace, transfer ownership | ✔ | — | — | — | — | — |

- Owner can't demote or remove themselves; ownership transfer and
  workspace deletion are confirmation-protected flows.
- Accountant Viewer sees budgets/expenses/invoices/payments/balances, not
  private notes.
- All checks enforced in Firestore rules — never client-side only.

## Sharing / contractor access (access-grant system)

Each grant doc: recipient email, resolved uid (once they sign in via email
link), display name, preset, start time, **expiration time**, revoked time,
created by, last accessed, optional message, and boolean switches:
download / print / see comments / upload / see financial amounts / see
private notes (always default false, and private notes stay physically
unreadable regardless).

Scopes: normalized records listing the exact rooms, projects, sections,
documents, and photo categories included.

Presets: **Bidder** (scope + drawings + selected inspiration; never
competing bids, budgets, notes, other contractors), **Active Contractor**
(assigned scope, schedule, contractor-visible notes, relevant docs; may
upload progress photos/invoices), **Inspector** (rooms, plans, permits,
punch items), **Read-Only Guest** (explicitly selected content only).

Every read/write under a grant verifies, in rules, at request time:
grant exists → started → not expired (`request.time`) → not revoked →
resource is in scope → action is allowed. Photo/doc payloads for
contractors load only after those checks pass (payload docs carry the same
rules), so there are no permanent public URLs anywhere.

Owner tools: preview-as-contractor, extend/shorten expiry, revoke
immediately, last-access + audit log, duplicate a grant config, export a
contractor-specific PDF packet.

Abuse mitigation without a server: grant creation restricted to
owner/admin; email-link auth throttling is Firebase's; optionally enable
**Firebase App Check** (free) later.

## Financials

Distinguish estimate / approved budget / committed / invoiced / paid /
refund / credit / change order / contingency usage. Never double-count an
invoice and its payment in actuals.

Expense fields: description, room, project, phase, contractor, vendor,
category, cost type, estimated/approved/actual amounts, tax, shipping,
total, invoice #, purchase/due/paid dates, payment method, payment status,
receipt attachment, notes (+ private notes doc).

Dashboards: planned vs actual; committed vs paid; remaining; variance by
project/room/phase/contractor; contingency usage; monthly spend; upcoming
payments. USD, en-US formatting, currency field extensible.

Contractor jobs: original contract, approved change orders, revised
contract, deposit, invoiced, paid, **balance due**, retainage, planned vs
actual dates, status, contacts, contract/insurance docs, punch items.
Approved change orders update the revised contract and rollups without
touching the original contract value.

## Product & purchase registry (new — not in the original prompt)

A first-class registry of everything bought for the remodel, for the
homeowner's records, warranty claims, and repurchase:

- **UPC/barcode scan** via the camera: `BarcodeDetector` API where
  available, vendored zxing-style fallback otherwise (same approach as the
  Usage Tracker scanner). Manual entry always available; no paid lookup
  APIs — UPC lookup is optional/manual-first.
- Fields: UPC, brand, make/model, SKU/serial, category, store/vendor,
  purchase date, unit cost, quantity, total, receipt photo, product photo,
  manual/spec URL, warranty length + expiry, room, project, linked expense,
  notes.
- Views: sortable/filterable table (house table standards), per-room and
  per-project rollups. A purchase can create its linked expense in one
  step. Included in CSV export and ZIP backup.

## Main sections & navigation

Mobile bottom nav: **Dashboard · Projects · Photos · Budget · More**
(More → rooms, ideas/mood boards, contractors, products, documents,
decisions, punch lists, sharing, settings). Desktop: sidebar.

Dashboard cards (each links to its filtered view): completion %, planned /
approved / committed / invoiced / paid / remaining / variance, contingency
used, active + blocked projects, overdue tasks, upcoming contractor visits
and payments, deliveries/inspections, recent photos, **shares expiring
soon**.

Projects get list + board views at launch; calendar and Gantt-style
timeline are post-core options. Default statuses: Idea, Researching,
Planned, Awaiting Bid, Awaiting Approval, Approved, Scheduled, In
Progress, Blocked, On Hold, Complete, Cancelled (customizable). Priorities:
Low / Medium / High / Critical.

Global search, saved filters, clear empty states, confirmations on
destructive actions, undo/restore via trash, loading & error states,
breadcrumbs, consistent room/project/status/priority filters everywhere.

## PDF reports

Owner-configurable, section-selectable reports rendered as print views:
executive summary, project report, room report, contractor scope packet
(grant-filtered), budget report, expense report, photo progress report,
punch-list report, property archive summary. Each: title, generation date,
page numbers, TOC on long reports, captioned photos, budget tables,
optional watermark/"Confidential", and a clear note when content was
excluded by permissions. Contractor packets contain only what that grant
can see — generated from the same scoped queries the portal uses.

## Import / export / backup

- **Full backup:** ZIP = versioned JSON manifest (schema version for
  future migration), all workspace data, photos, thumbnails, documents,
  receipts, human-readable summary, file inventory with checksums.
- **CSV:** projects, tasks, expenses, contractors, jobs, payments, bids,
  change orders, products.
- **Import/restore wizard:** upload → validate manifest + version → show
  what will import → detect conflicts → merge or restore-to-new-workspace →
  explicit confirmation → import report. Never silently overwrites.

## Testing

- **Firestore rules tests on the emulator are mandatory** and land in the
  same milestone as each rules change. Every role and preset gets tests,
  including: expired grant fails, revoked grant fails, out-of-scope
  document ID fails (direct-ID probing), private notes unreadable under
  every contractor preset, cross-workspace access fails.
- In-browser test pages for budget math (variance, rollups, change-order
  arithmetic, no double counting) and date/expiration logic.
- Manual test checklist per milestone in the README's dev section.

## House standards (apply throughout — do not drift)

- Toasts top-center; passive confirmations only — decisions use a modal.
- Form modals never close on backdrop click; only X / Cancel / confirm.
- **No horizontal scrollbars anywhere**: wrap text, card-stack tables
  under ~640px, `minmax(0,1fr)` grids.
- Tables sortable (asc/desc/reset) with a Columns manager (above-right)
  and saved layout.
- Unset decision dropdowns get the amber attention glow until picked.
- Money fields: 2 decimals, `$` prefix inside the field (21 → 21.00 on
  blur); percent fields get no `$`.
- Fields wide enough for their values; dates never truncate; short labels
  with detail in tooltips; tooltips on every non-obvious field explaining
  intent (why, not what).
- Favicon + OG card (real og.png at absolute URL) + semver in the title
  from first release; **no repo link in the UI**.
- Semantic versioning; every release bumps version everywhere it appears
  and adds a human-readable README changelog entry (the "why").
- Docs updated in the same commit as behavior changes. No emojis in code.
- WCAG 2.2 AA where practical: keyboard nav, visible focus, labels,
  semantic HTML, accessible dialogs, contrast, status not by color alone,
  alt text.
- Calm, clean residential aesthetic — project tool + mood board +
  financial tracker + client portal; not corporate.
- Seed a demo mode with realistic generic 2-bed/2-bath condo data (used
  for screenshots and empty-state exploration; clearly fake).

## Milestones

**M0 — Design switcher (before any app code).** One self-contained local
HTML file with 3–4 click-through design directions (palette, type, nav,
sample dashboard + project card + gallery in each). Owner picks; the pick
is recorded here. Opened via `file://` link.

**M1 — Foundation. DONE (v0.1.0, 2026-07-28).** Scaffold under
`dev/remodel/`, Google sign-in, workspaces + membership + roles + email
invitations, rooms CRUD, responsive nav shell, rules v1 with 44 emulator
tests, favicon/OG/semver. Notes for whoever picks up M2:

- Files: `index.html`, `styles.css` (Studio tokens), `firebase-config.js`
  (auth/Firestore bridge), `store.js` (all data access), `app.js`
  (routing + views), `firestore.rules`, `tests/rules.test.mjs`.
- The owner still has to create the Firebase project and paste the web
  config into `firebase-config.js` — see README Setup. Until then the app
  shows a setup card instead of pretending to work.
- `?emu=1` on localhost runs the whole app against the emulators, with
  `&as=email` choosing the identity. That is how the role and invitation
  flows were verified, and it is the fastest way to test M2 too.
- Membership lives at `workspaces/{id}/members/{uid}` and is the only
  thing rules trust. `users/{uid}` is a prunable pointer index.
- Rules helpers already in place for M2: `isMember`, `canEdit`,
  `canManage`, `createStamped`, `creationImmutable`. Reuse them; keep
  writing tests in the same commit as rules.
- Deferred deliberately: the Columns manager on tables (the People table
  sorts asc/desc/reset but has no column chooser — add it in M2 when
  projects and expenses bring real multi-column tables).

**M2 — Projects. DONE (v0.2.0, 2026-07-28).** Projects, phases, tasks, tags,
statuses, priorities, list + board views, filters, sortable table with a
Columns manager (the standard deferred from M1), dashboard v1, append-only
activity log, and per-project private notes. Notes for M3:

- Board deliberately groups the 12 statuses into 5 lanes
  (`BOARD_LANES` in store.js) so it never scrolls sideways.
- No money on project docs — M4 adds a separate financials collection so a
  contractor grant can show scope without amounts. Do not add cost fields
  to `projects`.
- `privateNotes/{parentId}` and the append-only `activity` collection are
  live with rules + tests; reuse the same pattern for ideas and media.
- Module caching: index.html loads only `app.js?v=X`, which imports
  `store.js?v=X` and `firebase-config.js?v=X`. **Bump all three together**
  on every release or a browser can mix fresh and stale modules.
- Deferred: task checklists (sub-items within a task) and drag-to-reorder
  on the board — neither blocks M3.

**M3 — Ideas & media. MOSTLY DONE (v0.3.0, 2026-07-28).** Photo pipeline
(`media.js`: EXIF-orientation applied then stripped, WebP, quality
step-down, separate thumbnail), grid + timeline + before/after compare,
room/project/category filtering, idea library with vendor/model/price/
source/status, mobile More menu. Notes:

- Payloads are Firestore **bytes**, not base64 — base64 would waste a
  third of the 1 GiB free tier. Rules cap thumbs at 80 KB and full
  images at 950 KB (doc limit is 1 MiB).
- Galleries read metadata + thumbnails only; the full image loads on
  open, and object URLs are cached per id to protect the read quota.
- **Still outstanding for M3:** mood boards (drag-drop arrangement,
  colour/material notes), the storage meter in Settings, and Google
  Drive originals backup via the `drive.file` scope. None of them block
  M4; pick them up as M3b.

**M4 — Financials, contractors, products.** Budgets, expenses, receipts,
contractor directory + jobs + invoices + payments + balances, product/UPC
registry, financial dashboards. Financial docs physically separated from
day one.

**M5 — Sharing.** Email-link contractor auth, access grants + scopes +
presets, expiry/revoke, contractor portal, preview-as, audit log, full
rules test suite for every preset (the milestone is not done until the
adversarial tests pass).

**M6 — Reports & backup.** Print/PDF reports, CSV exports, ZIP backup,
import/restore wizard.

**M7 — Advanced.** Bids + comparison, change orders, decision log, punch
lists, permits/inspections/warranties, deliveries, in-app notifications;
optional `remodel-worker` email notifications (share expiring, payments
due, insurance/warranty expiry, budget overruns).

## Workflow rules for the builder (Opus 5)

1. Per milestone: state the goal and user-visible result; list files to
   create/modify; note security implications; write/update rules **with**
   the data model, not after; implement; test; summarize what's done and
   what's left. Small staged commits, one reviewable change each.
2. Do not proceed to the next milestone with failing tests or any known
   authorization bypass.
3. No experimental/prerelease dependencies; vendor third-party libs into
   the repo (no CDN dependency for core function); document any exception.
4. Handle loading, validation, empty, unauthorized, and error states —
   never assume a request succeeded.
5. Small, clearly separated modules (data / rules / validation / UI); no
   giant files; no pseudocode placeholders.
6. Keep this PLAN.md and the memory file accurate at every commit so any
   future session can resume from `git log` + this file.
7. Nothing personal in the public repo — ever. Demo data only in
   screenshots and seeds.

## Design direction (decided 2026-07-28): "Studio"

Chosen from `design-switcher.html`: **Studio's colors, layout, and
details with Ink's typography** (owner preferred Ink's font). The
switcher's theme `c` has been updated to this exact combination and is
the canonical visual reference — keep that file until M1 ships. Minimal,
monochrome, photo-forward "Gallery" base with a single cobalt detail
color. Tokens:

- **Fonts (Google Fonts):** Inter only — headings at 650 weight,
  letter-spacing -.025em; body at 400/500/600. No Space Grotesk. Tabular
  numerals (`font-variant-numeric: tabular-nums`) on all numbers, money,
  and dates.
- **Palette:** background `#ffffff`; panel `#f2f3f5`; ink `#14171b`;
  muted `#6d7278`; border `#e4e6e9` (1px hairlines, no heavy shadows);
  primary actions and active-nav pill = solid ink `#14171b` with white
  text; **cobalt `#2545d3`** reserved for links, progress bars, and small
  accents only; semantic colors good `#2c7a52`, warn `#a06a10`,
  bad `#a03a2a` (chips outlined, not filled); radius 8px.
- **Layout character:** generous whitespace; photos lead their pages
  (galleries above lists); status chips as pills (solid ink for status,
  outlined for priority/semantic); black pill buttons, outlined
  secondaries; cards are white with hairline borders.
- House standards still apply on top (amber attention glow on unset
  decision dropdowns, top-center toasts, card-stacked tables <640px, etc.).

## Decisions log

- **Name (2026-07-27):** RemodelHQ. Folder/URL stays `remodel/` →
  `dev.rizzo.cc/remodel` (cleaner URL; app branding is RemodelHQ).
- **Photo storage (2026-07-27):** compressed WebP in Firestore is
  canonical; originals backed up to the uploader's own Google Drive via
  the `drive.file` scope (app-created folder only). No R2, no card.
- **Analytics (2026-07-27):** GA4 from first release with the standard
  `?ga=off` per-device opt-out.

## Open questions (owner)

None — design direction, name, photo storage, and analytics are all
decided. Opus 5 starts at Milestone 1.
