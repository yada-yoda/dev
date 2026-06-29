# PawPrints

**Current Version: v0.26.0**

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
3. **Add a Firestore security rule** (Firebase console → Firestore → Rules). Sharing with
   permission levels (v0.13.0) needs a **read/write split** so "view-only" collaborators truly
   can't write. Replace the `pawprints/{uid}` block with:
   ```
   match /pawprints/{ownerUid} {
     allow read: if request.auth != null && (
       request.auth.uid == ownerUid ||
       (resource != null && request.auth.token.email != null && (
         (resource.data.sharedWrite is list && request.auth.token.email.lower() in resource.data.sharedWrite) ||
         (resource.data.sharedRead  is list && request.auth.token.email.lower() in resource.data.sharedRead)
       ))
     );
     allow write: if request.auth != null && (
       request.auth.uid == ownerUid ||
       (resource != null && resource.data.sharedWrite is list
         && request.auth.token.email != null
         && request.auth.token.email.lower() in resource.data.sharedWrite)
     );
   }
   ```
   The owner always has full access. Collaborators in `sharedWrite` (Full or Sitter/Walker
   access) can read+write; collaborators in `sharedRead` (View-only) can read but not write.
   The app derives these two lists from the owner's collaborator settings. Until the rule is
   added, the app works locally (localStorage); the rule turns on cross-device sync + sharing.
4. `dev.rizzo.cc` is already an authorized Firebase domain, so sign-in works as-is.

## Version History

- **v0.26.0** — Supply lifecycle (started/finished). Supplies now have **Started** and **Finished** date
  fields (like the Usage tracker): an item with no start date is on-hand **Inventory**, setting a start date
  marks it **In use**, and a finish date marks it **Finished**. Each item shows its status badge and dates,
  and the spreadsheet export includes the new columns.
- **v0.25.3** — Pre-tax cost labels. The Cost fields on supplies, vet visits, and grooming are now labeled
  **"Cost (pre-tax)"** (with a tip) so spending totals stay consistent.
- **v0.25.2** — UPC field on supplies. The add/edit supply form now has a **UPC / barcode** field, so you can
  record a product's barcode for easy re-ordering. It's included in the spreadsheet export.
- **v0.25.1** — Grooming supplies category. Added a **Grooming** category to the Supplies dropdown (Food ·
  Treats · Grooming · Supplies · Meds) so shampoo, brushes, nail clippers, and the like have a natural home
  instead of the generic Supplies bucket.
- **v0.25.0** — Insights drill-down. Numbers on the Insights page are now clickable: tap the top stat cards
  (Meals today, Walks, Walk time, Avg walk), the Potty breakdown count chips, the avg-between pee/poop boxes,
  or the 💧/💩 chips in Popular spots to see exactly which entries are counted — and tap any of them to edit.
- **v0.24.2** — Sticky modal headers. Every pop-up's title bar and ✕ close button now stay pinned at the top
  while the contents scroll, so on long panels like Settings & Data you can always reach the ✕ without
  scrolling back up.
- **v0.24.1** — Re-check weather. New Settings button overwrites the saved weather on every at-home walk
  and potty break with the **actual reading for that time** — pulling real **NWS station observations** for
  about the last 7 days (Open-Meteo historical for older). Use it to correct entries that were logged with
  the old, less-accurate weather.
- **v0.24.0** — Better weather (NWS). Current conditions + the hourly forecast now come from the **U.S.
  National Weather Service** (api.weather.gov), which is station-backed and more accurate for "right now"
  than a model — fixing cases where it showed rain on a clear day. Open-Meteo is kept as an automatic
  fallback (and still powers historical backfill, which NWS doesn't offer). The weather panel now shows the
  condition + precip chance and notes its source; new walk/potty entries use NWS too.
- **v0.23.0** — Reminders in the header + potty "Home" tied to your ZIP. The reminders that used to live only
  on the Today tab now also have a **bell pill in the top toolbar** (with a count, red if anything's overdue)
  that opens a panel from any tab — meds due, vet follow-ups, grooming due, low supplies. The potty
  **Location** dropdown's "Home" now shows your settings location (e.g. "Home — Chicago, IL") so it's clear
  weather is pulled from your home ZIP, with a hint to set one if you haven't; each at-home potty break still
  records the current weather.
- **v0.22.0** — Weather in the header. A current-weather pill now sits in the top toolbar (just left of the
  dog switcher) showing the temperature + condition for your home ZIP; tap it for a panel with "feels like"
  and the next 12 hours, hour by hour. Powered by Open-Meteo (no key, same source as the walk/potty
  weather); refreshes every 30 minutes. Hidden until a home ZIP is set in Settings.
- **v0.21.0** — Potty weather. Potty breaks are now assumed to be at home, so each one records the current
  weather (from your home ZIP) just like walks. A new **Location** dropdown on the potty form (Home / Other)
  lets you mark a break as away — no weather is saved then. Weather shows in the potty entry, and the
  Settings backfill button now fills past **walks and potty breaks** at home (was walks only).
- **v0.20.0** — Icons everywhere. Finished the Material Symbols sweep across all the remaining tabs:
  section headings (Reminders, Weight trend, Health timeline, Your dogs, Contacts, Google Calendar,
  Follow-ups, Restock list, Spending, Potty breakdown), the Care sub-tabs (Vet/Grooming/Meds/Illness),
  every empty-state icon, the Health timeline and calendar-event entries, spending bars, and the action
  buttons (Connect, Call, Edit, Rename, Download, Share, New calendar). All inline SVG, theme-colored.
- **v0.19.1** — Activity icons too. Extended the Material Symbols set to the activity entries — the Today
  status cards (Last fed/Water/Potty/Walk), every timeline row, the per-day activity summaries, the Log
  sub-tabs, and empty states — all now use inline-SVG icons (including a new weight icon) instead of emoji,
  keeping each log type's accent color via `currentColor`.
- **v0.19.0** — New icons. Replaced the emoji in the tab bar and the Today quick-log buttons (Fed/Water/
  Potty/Walk) with clean **Material Symbols (Outlined)** icons, embedded as inline SVG (no font dependency,
  works offline, follows the theme color). Pulls in the icon's color via `currentColor`, so the active tab
  still highlights teal.
- **v0.18.1** — Analytics opt-out. Visit with `?noga=1` to stop counting your own visits on that device
  (stored locally, survives IP changes); `?noga=0` re-enables. Documented in the privacy page. The GA-side
  alternative is an Internal Traffic filter by IP (Admin → Data settings → Data filters).
- **v0.18.0** — Privacy page. Added a plain-English `privacy.html` (linked from the footer) covering Google
  sign-in, Firebase storage, optional Calendar and weather lookups, and the anonymous analytics — what's
  collected, what isn't, and how to export or delete it. (No custom 404 page needed — the dev.rizzo.cc site
  already serves a root 404, and the app navigates by hash so there are no sub-paths to miss.)
- **v0.17.1** — Analytics turned on. Set the dedicated GA4 measurement ID (`G-5R71TRBEQW`), so anonymous
  pageview + per-tab tracking is now live (still skipped in demo mode, still no personal data).
- **v0.17.0** — Optional Google Analytics. Added anonymous, privacy-respecting GA4 support: a single
  `GA_ID` constant near the top of `index.html` turns it on (paste your dedicated property's
  `G-XXXXXXXXXX`; empty = fully off). When set, it records a pageview plus a virtual pageview each time
  you switch tabs (Today, Log, Care, etc.), with `anonymize_ip` on and **no personal data** ever sent.
  Tracking is skipped entirely in demo mode (`?demo=1`).
- **v0.16.1** — Pick a saved vet. On a vet visit, the **Vet** and **Clinic** fields now show a dropdown
  of vets/clinics you've used before (pulled from past visits and your vet contacts) — choose one or
  type a new name. Picking a saved vet auto-fills its clinic, so repeat visits take two taps.
- **v0.16.0** — Sticky tab bar + backfill past walk weather. The tab menu bar now **stays pinned to the
  top** as you scroll. New in **Settings → Lists & preferences**: once a home ZIP is set, a **"Add
  weather to past Home walks"** button looks up the *historical* weather (closest hour) for any past
  walk whose From or To is "Home" but has no weather yet — so older walks get the same temp/condition
  the new ones record automatically.
- **v0.15.5** — Smoother Settings saves. Saving a ZIP, custom location, or walk favorite (and adding/
  removing a shared person) no longer re-opens the whole Settings panel with a flash — only that
  section updates in place, the modal stays open, and your scroll position is kept. Adding a custom
  location also re-focuses the input so you can add several in a row.
- **v0.15.4** — Clearer potty title + stool only when relevant. The timeline now separates the potty
  type from the rest with an em-dash ("Pee — Backyard · Normal stool"). The **Stool** dropdown only
  appears when the result is **Poop** or **Both** (hidden for Pee/Nothing, and cleared if you switch
  away), so you can't accidentally tag a pee with a stool.
- **v0.15.3** — Potty entry separator + smarter poop counting. The timeline now reads
  "Pee · Backyard · Normal stool" (dot separators instead of run-together words). In Insights, an
  entry where a **stool was noted counts as a poop** even if it was tagged "Pee" — so the popular-spots
  and intervals reflect reality (this is why a "Pee + Normal stool" entry showed 0 poops before).
- **v0.15.2** — Sync-failure warning + privacy + clearer lists. Cloud-save failures (usually a missing
  Firestore rule) are no longer silent — a one-time toast and a persistent Today banner warn that data
  is only on this device, so apparent "missing data" across devices is explained. The ZIP field's
  example no longer uses a real-area ZIP. The Lists & preferences section now explains what the
  custom Potty/Food location lists do.
- **v0.15.1** — Insights: Potty breakdown now lists the dog's **popular spots** ranked by visits, each
  split into pee (💧) and poop (💩) counts.
- **v0.15.0** — Custom lists, food location, walk favorites & weather, potty intervals. **Settings →
  Lists & preferences** lets you add **custom Potty and Food locations**, a **home ZIP** (for weather),
  and manage **favorite walk routes**. The feed form gained a **Where** dropdown. The walk form shows
  **favorite-route chips** (tap to fill From/To) and a "★ save as favorite" option, and — if a home ZIP
  is set — records the **current weather** (temp + condition via Open-Meteo, ZIP geocoded by
  Zippopotam) on each walk. Insights' Potty breakdown now shows the **average time between pees and
  between poops**.
- **v0.14.2** — Clarified that the **Water** log means *you gave/refilled fresh water* (not the dog
  drinking): status card now reads "Water refilled", the toast says "Fresh water given", the timeline
  entry reads "Refilled fresh water", and the Today note spells it out.
- **v0.14.1** — Mobile fix: Contact cards no longer crowd. The name/details and the action buttons
  (Call / vCard / Share / Edit) now stack — full-width text on top, buttons wrapping on their own row
  below — instead of the buttons floating over a one-word-per-line name on narrow screens.
- **v0.14.0** — Vet appointment times. Vet visits now take an optional **time** (and follow-up time)
  — works for past or future appointments. When a time is set, the **Google Calendar** sync and
  **.ics** export create a **timed 1-hour event** instead of an all-day one, and the time shows on the
  vet card, the calendar's Upcoming list, and in the PDF / spreadsheet exports.
- **v0.13.1** — All-activity page. Today's activity card now has a **"View all activity by day →"**
  button (and the Log tab has an "All activity by day" link) opening a full sub-page of every
  activity entry grouped by day (Today / Yesterday / dates), newest first, with a per-day type
  summary and inline edit/delete. Fills the gap where past days' activity wasn't viewable together.
- **v0.13.0** — Sharing roles, permission levels & expiry. When inviting a helper you now set a
  **relationship** (Family/Partner/Helper/Sitter/Dog walker/Friend/Other), an **access level**, and
  an optional **end date** (access auto-revokes after it). Three access levels: **Full** (view+edit
  everything), **Sitter / Walker** (log daily activity, view the rest, can't edit the profile or care
  records), and **View only** (read everything, change nothing). View-only is hard-enforced by the
  Firestore rule (new read/write split — see Setup); the sitter/walker restrictions are enforced in
  the app (edit/add buttons hidden, actions blocked). A banner tells the helper their access level.
  Legacy collaborators migrate to Full automatically.
- **v0.12.1** — Edit activity entries. Each row in Today's timeline and the Log tab now has an **Edit**
  button (next to the delete ×) that opens a pre-filled form for that entry — feed/water/potty/walk/
  weight — so you can fix the time, amount, result, etc. without deleting and re-adding.
- **v0.12.0** — Spayed / Neutered. Added a dedicated **Spayed / Neutered** field (+ optional date) to
  the dog profile — one field covers both (spayed = female, neutered = male). Sex options simplified to
  Male / Female / Unknown, and any existing "Male (neutered)" / "Female (spayed)" dogs are migrated
  automatically to plain sex + the new fixed status. Shown on the profile, in the PDF, and exported in
  the spreadsheet.
- **v0.11.1** — Backfill vet contacts. Dogs added *before* the vet→Contacts sync (v0.11.0) never got
  a contact, since it only ran on save. Now a one-time idempotent backfill runs on load, so existing
  dogs' vet(s) appear in Contacts automatically.
- **v0.11.0** — Profile/log polish. Profile vet(s) now auto-mirror into **Contacts** (kept in sync,
  no duplicates) and show as a quick-reference **panel on the Care › Vet tab** with call/email links.
  The feed form's Food dropdown now includes your **Food & Treats from Supplies** (your actual brands
  first). Added **"Front yard"** to potty places, a note that the **Water** quick button logs
  instantly (no form), and confirmed owners can **remove** a shared collaborator anytime
  (Settings → Sharing → Remove).
- **v0.10.0** — Sharing with sitters / family. Settings → **Sharing & access** lets an owner invite
  helpers by **email**; each helper signs in with **their own** Google account and, using the owner's
  **share code**, opens the owner's dogs to **view and add** entries (a banner shows whose dogs you're
  viewing; the history records who logged what). Owners manage/remove access anytime. Shared data is
  read/written to the owner's doc and never touches the helper's own local data. **Requires a one-time
  Firestore rules update** (see Setup) so allow-listed emails can access `pawprints/{ownerUid}`.
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
