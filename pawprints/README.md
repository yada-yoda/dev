# PawPrints

**Current Version: v0.9.0**

Live: [dev.rizzo.cc/pawprints](https://dev.rizzo.cc/pawprints/)

A private dog care tracker — keep your pup's routine honest. Log feeding, water,
potty trips, walks, vet visits, grooming, meds, weight, and supplies, all in one place.
Sister site to the Illness Tracker: it uses the **same Google login**, so one sign-in
covers both.

## Files

| File | Description |
|------|-------------|
| `index.html` | The whole app — single-file, served by the dev.rizzo.cc deployment |
| `og-image.png` | 1200×630 social preview (Open Graph + Twitter) |
| `site.webmanifest` | PWA manifest — installable to home screen |
| `favicon.ico` / `favicon-16.png` / `favicon-32.png` / `apple-touch-icon.png` / `icon-192.png` / `icon-512.png` / `icon-maskable.png` | Favicon + PWA + Android adaptive icon set |
| `.scripts/build-icons.py` | Regenerates the icon set + OG image from the brand gradient + 🐾 |
| `README.md` | This file |

## Features

- **Multi-dog** — a pet switcher in the header; full profile per dog (photo, breed, sex,
  birthday → auto age, adoption/"gotcha" day, color, microchip, license, your vet's info)
- **Quick log** — one tap to record Fed, Water, Potty, or Walk; detailed forms on the Log tab
- **Potty tracking** — what they did (pee/poop/both/nothing), where, and stool quality as a
  health signal
- **Walks** — duration and optional distance
- **Today dashboard** — last-fed / water / last-potty / last-walk status with overdue nudges,
  plus a reminders strip and today's activity timeline
- **Care** — vet visits (past + upcoming, reason, vet, cost, follow-up, and a weight recorded
  at the visit), grooming (groomer, services, cost, next-due), meds & preventatives
  (heartworm, flea & tick, vaccines) with next-due reminders, and an illness log
- **Profile** — current weight + a weight-trend chart, and a merged Health Timeline of vet
  visits, grooming, illnesses, and meds
- **Contacts** — save your vet, emergency vet, groomer, sitter, boarding, trainer and more;
  each downloads or shares as a phone contact card (**vCard / .vcf**). Plus a "share your dog's
  info card" vCard for handing off to a sitter
- **Calendar** — a month view of every dated item (vet, follow-ups, grooming + next-due, med
  due-dates); **two-way Google Calendar sync** writes the schedule to a calendar you pick (re-sync
  updates the same events, no duplicates), plus a no-account `.ics` download
- **Supplies** — inventory of food/treats/supplies/meds with purchase history, a running-low
  restock list, and year-to-date spend
- **Insights** — meals today, walks & walk-time, weight trend, and a vet/grooming/supplies
  spend breakdown
- **Photos stored inline** — uploads are canvas-downscaled to a small thumbnail, so they sync
  with everything else (no separate storage bucket)
- **Cloud sync** — Google Sign-In + Firestore, with graceful offline fallback to localStorage
- **Demo mode** at `?demo=1` (meet Biscuit), JSON export/import, installable PWA

## Setup

1. Deploy `index.html` (served under `/pawprints/`).
2. Firebase: reuses the Illness Tracker project (`illnesstracker-8d888`) so the Google login
   is shared. Dog data lives in a separate `pawprints/{uid}` Firestore doc.
3. **Add one Firestore security rule** (Firebase console → Firestore → Rules):
   ```
   match /pawprints/{uid} {
     allow read, write: if request.auth != null && request.auth.uid == uid;
   }
   ```
   Until it's added, the app works locally (localStorage); the rule turns on cross-device sync.
4. `dev.rizzo.cc` is already an authorized Firebase domain, so sign-in works as-is.

## Version History

- **v0.9.0** — Origin details. The dog profile now has an **Origin** section: how you got them
  (adopted / breeder / pet store / rehomed / found / gift / bred / other), the source (shelter,
  rescue, breeder, seller), location, adoption fee or purchase price, source contact, previous
  name, and registration # / registered (papered) name. All optional, shown on the profile and in
  the PDF, and exported in the spreadsheet's Dogs sheet.
- **v0.8.1** — Calendar default. On first connect, instead of defaulting to your Primary calendar,
  PawPrints now prompts to **create a dedicated calendar named after the dog** (e.g. "🐾 Cartier —
  PawPrints"), with the name **editable before creating** and a **✏️ Rename** button to change it
  later. "Choose an existing calendar" and "use my Primary calendar" remain one-tap escape hatches.
- **v0.8.0** — Spreadsheet export, history page, calendar picker fix. Added **Export spreadsheet
  (.xlsx)** in Settings (SheetJS, one tab per category) plus a **CSV export** on the history view.
  **Activity & history** is now its own full sub-page (with Back) instead of a modal. Fixed the
  Google Calendar **"Loading your calendars…" hang** — the picker now defaults to your **Primary
  calendar** so sync works immediately, populates the full list when it loads (with a retry link),
  and adds **➕ Create a calendar for [dog]** (a dedicated Google calendar named after the dog, which
  you can then share from Google Calendar). The worker OAuth scope was widened to full Calendar to
  allow listing + creating calendars — **existing users must Disconnect then Connect once** to grant it.
- **v0.7.0** — Secondary vet + walk routes. The dog profile now has a **vet email** for the primary
  vet and a full **Secondary vet** section (clinic, doctor, phone, email) — both shown on the profile
  and in the PDF; the primary vet's email also pre-fills into the first Vet contact. Walk logging
  gained optional **From** / **To** fields and a **Round trip** checkbox, so a walk reads like
  "Home ↔ the park" (↔ = round trip, → = one-way) in the timeline and reports.
- **v0.6.1** — Add/Edit-dog form improvements. Added a **Current weight** field (it asked for the
  unit but never the weight) that seeds the weight history — and adds a new weigh-in if you change it
  on edit. Added an optional **Vet (doctor)** field separate from the clinic, shown on the profile and
  pre-filled into the first Vet contact. Added **info tooltips** (tap/hover the ⓘ) on confusing fields
  (Microchip #, License #, weight, etc.). Modals now **only close via the X (top-right), Cancel, or the
  confirming action** — a stray outside click or paste can no longer discard a half-filled form; every
  modal got a top-right ✕.
- **v0.6.0** — Activity & change history. **⚙️ Settings & Data → Activity & change history** opens a
  full audit log of every change — adding/editing/deleting a dog, logging feeding/water/potty/walks/
  weight, and every vet/grooming/med/illness/supply/contact create-edit-delete — each stamped with
  the time and **who made it** (the signed-in account, or "Local" when offline). The log syncs with
  your account and is capped at the most recent 500 entries, with a Clear option. (Editing a dog's
  info was already available via Profile → Edit; this adds the history of those edits.)
- **v0.5.1** — Changed the PDF report's accent color from amber to **teal** (`#0d9488`, matching
  the app's brand) for the section headers, table headers, and top band.
- **v0.5.0** — Backup + PDF report. A new **⚙️ Settings & Data** panel (header gear) consolidates
  data tools: **Export backup (.json)** — one file with everything (all dogs, logs, care records,
  contacts, photos, settings); **Import / restore** (with a confirm guard); and a new **Export full
  report (PDF)** — a nicely formatted, multi-page, printable document covering every dog's profile,
  weight history, vet visits, grooming, meds, illnesses, supplies, recent activity, and contacts
  (lazy-loaded jsPDF + autotable, brand-styled tables, page numbers). The header's old Export/Import
  buttons moved into this panel.
- **v0.4.1** — Onboarding + toast polish. With no dog added yet, tapping a feature tab
  (Calendar, Care, etc.) previously just showed a generic card that looked identical on every
  tab — now it pops a clear **"Add your dog first"** modal that starts the add-dog flow (or
  offers the demo). The same modal replaces the old "add a dog first" toast on quick-log
  actions. Toast notifications now appear **top-center** instead of bottom.
- **v0.4.0** — Light / dark mode + mobile polish. A theme toggle (🌙/☀️) in the header
  switches between the dark default and a clean light palette, remembered per-device
  (localStorage) and synced across devices (Firestore); first-load respects your system
  preference with no flash. All colors run through CSS variables (including the chart and a
  new `--on-accent` token) so both themes stay legible. Also fixed the dog-switcher "Add a
  dog…" option (it no longer briefly clears the active pet) and tidied mobile button layout.
- **v0.3.0** — "Connect Google Calendar once, forever." When the companion
  `pawprints-worker` is deployed, the Calendar tab connects through a proper
  server-side OAuth flow (refresh token stored server-side), so signing in on any
  device silently reconnects — no re-consent each session — with a Disconnect button.
  If the worker isn't configured, it gracefully falls back to the per-session popup.
- **v0.2.0** — Contacts + Calendar. New **Contacts** section on the Profile tab for the care
  team (vet, emergency vet, groomer, sitter, boarding, trainer, pharmacy, walker), each with a
  one-tap Call link and **downloadable / shareable vCard (.vcf)** so they drop straight into a
  phone's contacts — plus a "share [dog]'s info card" vCard for sitters. New **Calendar** tab
  with a month grid of all dated items (vet visits, follow-ups, grooming + next-due, med
  due-dates) and **Google Calendar sync**: connect via the existing Google sign-in, pick which
  calendar to write to, and push the schedule (re-syncing updates the same events instead of
  duplicating, tracked via stored event ids). Also a no-account `.ics` export. Reuses the
  Illness Tracker's Calendar API enablement on the shared Firebase project.
- **v0.1.0** — Initial release. Single-file app modeled on the Illness Tracker: shared Google
  login (same Firebase project, separate `pawprints/{uid}` doc), multi-dog profiles with inline
  photos, Today dashboard with quick-log + status + reminders, Log tab (feed/water/potty/walk/
  weight), Care tab (vet/grooming/meds/illness), Supplies inventory with YTD spend, Insights
  with weight-trend and spend charts, a Profile health timeline, demo mode, JSON export/import,
  and full PWA/OG kit.
