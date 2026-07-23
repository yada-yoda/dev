# PawPrints

**Current Version: v0.54.1**

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
| `privacy.html` | Privacy Policy |
| `terms.html` | Terms of Use + a "not veterinary advice" disclaimer |
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

- **v0.54.1** — **Reorder link on supplies** — a new "Reorder link" field on each supply item. Paste
  the product page URL and a **↗ Reorder** button appears on the item and — most usefully — right in
  the **Restock list** when it's running low, so you can re-buy the exact item in one tap. Included in
  the spreadsheet export. (Only http/https links are accepted, for safety.)
- **v0.54.0** — **Fresh-water reminder** — the Today page and header bell now nudge you when the
  water bowl hasn't been refilled in a while (defaults to 24 hours, tracking your most recent refill
  and its location). A new **Settings → Lists & preferences → Fresh-water reminder** control lets you
  switch it **Off**, **Overall** (last refill anywhere), or **Per bowl / location** (each spot tracked
  separately), and set the number of **hours**. It only nudges once you've logged at least one water
  refill, so it won't bother anyone who doesn't track water.
- **v0.53.2** — **Walk weather now matches the time of the walk** — logging a walk (or home potty
  break) used to save whatever the weather was **at the moment you typed it in**, so back-dating an
  entry recorded the wrong conditions. It now resyncs the reading for the entry's actual time: walks
  logged around now poll a fresh current reading, while back-dated ones pull the real observation for
  that hour (nearest NWS station observation, falling back to Open-Meteo's hourly value).
- **v0.53.1** — **One-time supplies (no lifecycle tracking)** — a new "One-time item — no start /
  finish tracking" checkbox in the supply form for things you buy once and keep (tags, collar,
  license, toys). When on, the item hides the opened/finished dates, shows no Start/Finish button in
  the list, and stays out of the on-hand "Inventory" nudges — while consumables like food and treats
  keep their normal Start/Finish lifecycle.
- **v0.53.0** — **Insights PNG export, badge-toast fix, PDF refresh:**
  - **Save any Insights panel as a PNG** — each panel (Walking milestones, Weight trend, Trends,
    Spending, Potty breakdown) now has a **camera button** that downloads a crisp image of just that
    panel (html2canvas, loaded on first use).
  - **Fixed badge notifications for real this time** — the "🎉 Badge unlocked" / "🌟 Prestige" toast
    was being **instantly overwritten** by the "🦮 Walk logged" confirmation (toasts don't stack), so
    you never saw it. The walk-logged confirmation now steps aside whenever a badge or prestige is
    crossed, so the celebration actually shows.
  - **PDF report brought up to date** — the exported PDF now includes **who paid / payment method /
    card** on vet visits, grooming, and supplies; a supply's **status** (in-use / finished / low);
    package **size**; and a **walking-milestones** line (miles walked, badges earned, prestige).
- **v0.52.2** — **Date-sort toggle on all Care lists** — Vet visits, Grooming, and Illness now have the
  same "Date ↑/↓" sort toggle the medical Records list already had, so you can flip any of them between
  newest-first and oldest-first. (Meds still sorts by soonest-due, and Grooming's "Last groomed" stat
  always shows the true most-recent date regardless of the chosen order.)
- **v0.52.1** — **Non-identifying contact wording** — the Privacy and Terms pages no longer link a
  personal GitHub profile for contact; they now simply state it's a personal, non-commercial project
  with no dedicated support channel (policy changes are signalled by the "last updated" date).
- **v0.52.0** — **Terms of Use + disclaimer page** — added `terms.html`, linked in the footer next to
  Privacy. It leads with a prominent **"not veterinary advice"** disclaimer (PawPrints is a care log,
  not a substitute for a vet — see your vet for medical decisions and emergencies), followed by plain-
  language terms: as-is with no warranty, your data/backups are your responsibility, acceptable use, and
  a liability limit. (The Privacy Policy already existed at `privacy.html`.)
- **v0.51.1** — **Fixed Trends "Lifetime" start date** — Lifetime now spans from the first entry of
  the metric you're charting (e.g. the walk trend starts at your first walk), instead of the
  earliest of *any* activity — so it no longer began weeks early on an unrelated weigh-in or feeding.
  Also fixed a 1-day rounding issue that could clip the earliest entry off the chart.
- **v0.51.0** — **Lifetime range + date spans on Insights** — every range selector (Spending, Potty
  breakdown, and the Trends chart) now has a **Lifetime** option for all-time data, and shows the
  exact **date span** (from → to) of the selected range underneath — so it's always clear what
  window you're looking at. The Trends chart's Lifetime spans from your earliest logged entry.
- **v0.50.0** — **Custom supply categories** — supplies now include an **Other** category, and you
  can add your own categories under **Settings → Lists & preferences → Supply categories** (e.g.
  Toys, Health, Apparel). Custom categories appear in the Add-supply dropdown and as filter tabs on
  the Supplies list, and any category on an item always shows as a filter even if later removed.
- **v0.49.2** — **7d & 14d ranges on Insights** — the Spending and Potty breakdown range toggles
  now offer 7d and 14d in addition to 30d / 90d / YTD.
- **v0.49.1** — **Fixed walking-badge notifications** — the "🎉 Badge unlocked" / "🌟 Prestige"
  toasts weren't firing: the very first walk you logged silently seeded the badge tracker and
  swallowed that crossing. The tracker is now seeded once at load (existing miles marked seen with
  no spam), so every badge and prestige you cross from a logged walk now pops a toast.
- **v0.49.0** — **30d / 90d / YTD range toggle on Insights** — the Spending and Potty breakdown
  cards each get a range selector so you can view them over the last 30 days, last 90 days, or
  year-to-date. Spending totals and the vet/grooming/supplies split, and the potty counts, average
  gaps, and popular spots (plus their tap-through lists) all follow the selected range.
- **v0.48.3** — **Clear a supply's date** — a small "↺ Clear" link now appears under the Started
  and Finished date fields when they have a value, since native date inputs (especially on iOS)
  are hard to blank. Clearing the Finished date marks the item **still in use** again; clearing
  Started puts it back in inventory — handy for fixing a date set by mistake.
- **v0.48.2** — **One-tap Start / Finish on supplies** — each item in the Supplies list now has a
  quick action button: **Start** for items still in inventory (stamps today as the opened date and
  moves it to "In use"), and **Finish** for in-use items (stamps today as the finished date). No
  need to open the item and pick a date just to mark it opened or used up.
- **v0.48.1** — **Duplicate a supply** — editing an item now has a Duplicate button that opens
  a fresh Add form pre-filled with everything from that item (brand, name, qty, size, cost,
  card details, cost-tracking flag), with the purchase date reset to today and the open/finished
  dates cleared — so buying another of the same item is a couple of taps.
- **v0.48.0** — Two supply/weather touches:
  - **Weather panel refresh + timestamp** — the weather popover now has a refresh button to
    pull the current conditions on demand (it spins while loading), and shows a "Updated Xm
    ago · h:mm" line at the bottom so you know how fresh the reading is — matching the Lights
    dashboard's weather panel.
  - **Cost breakdown for supplies** — an opt-in "Show cost breakdown" toggle when adding or
    editing a supply. When on, the item shows **cost per day** and **cost per unit** (per
    oz / ct / lb from the Package size, or per Qty if there's no size) right next to its name
    in the Supplies list — handy for comparing value between brands or pack sizes.
- **v0.47.5** — Supplies now track **who paid and how** — the same Paid by / Payment method /
  card brand + last-4 fields as vet visits and grooming (card fields appear only for card
  payments). Included in the spreadsheet export.
- **v0.47.4** — Connecting Google Calendar now does an **initial full sync automatically** — right
  after you create (or pick) the calendar, all existing past and future events are pushed, so you
  don't have to hit "Sync schedule" yourself the first time. Re-syncs still update the same events
  (no duplicates), and new/edited items keep auto-syncing on save.
- **v0.47.3** — Two small polish touches: the dog's **latest walking badge** now shows as a small
  medallion next to their name on the Profile tab, and on Today the **"Fed today" progress and the
  "next walking badge" bar sit side by side** instead of stacked.
- **v0.47.2** — The Insights Trends chart can now graph walks by **distance** — a new "Walk miles"
  metric (miles walked per day) alongside the existing "Walk time" (minutes).
- **v0.47.1** — The "Last potty" status card now ignores trips where the dog did **nothing** — a
  potty break with no result no longer resets the timer, so the card reflects the last time your
  dog actually went.
- **v0.47.0** — Feeding-goal redesign + badge prestige:
  - The daily feeding progress moved out of the "Last fed" card (which was stretching the other
    status cards) into a **clean full-width strip under the status row** — "Fed today · 1 / 2 cups"
    with a bar, and a tooltip pointing you to set the goal in Settings.
  - **Prestige** — every 1,000 miles walked earns a prestige level. Past 1,000, badges gain an
    escalating shine: a coloured glow and a ★-level star, a gentle pulse at higher levels, and an
    aura beyond that. Colours cycle through the tiers, so it scales indefinitely. Shown on Insights
    (banner + next-prestige progress) and Today, with a "Prestige N reached" toast.
- **v0.46.0** — **Walking milestone badges.** Every mile you log on walks now earns your dog
  badges across five tiers (bronze → silver → gold → teal → legendary purple) — 17 milestones
  from "First Steps" (1 mi) to "Legend of the Leash" (1,000 mi), denser in the early range.
  A full badge grid with next-milestone progress lives on **Insights**, a compact next-badge
  card sits on **Today**, and crossing a threshold pops a celebration toast. Tracked per dog.
- **v0.45.0** — **Daily feeding goal.** Set a goal (e.g. 2 cups) in Settings, and the "Last fed"
  box on the Today page now also shows how much has been fed today against it — "1.5 / 2 cups"
  with a progress bar that turns green when the goal is met. With no goal set, it just shows the
  day's total.
- **v0.44.10** — Records sorting + mobile fixes:
  - **Sort records by date** — a toggle on the Records tab flips between newest-first and
    oldest-first.
  - **No more sideways scroll on mobile** — the Settings page (and pages generally) no longer
    scroll horizontally; a hidden tooltip near the edge was leaking width. Fixed with
    `overflow-x: clip`, which also keeps the top nav properly pinned.
  - **Date/time fields fit on mobile** — the vet-visit (and other) date & time inputs no longer
    run off the edge on iOS; their values are left-aligned and constrained to the field.
- **v0.44.9** — Review pass — closed two gaps: the exported PDF report now includes a **Medical
  records** section (vaccinations, surgeries, tests, etc., with type/detail/provider/cost/next-due),
  and a line item tagged 💊 on a **grooming** visit (not just vet) now shows in Care → Meds too.
- **v0.44.8** — Changing an option on the Trends chart no longer re-renders (and flickers) the
  Weight trend chart above it. The Trends controls and chart now refresh on their own.
- **v0.44.7** — Fixed clinic autofill for contacts saved without a street address. Picking a
  saved clinic/vet/groomer that has only a city/state/zip (or only a phone) now fills those
  fields — previously the autofill required a street address and would fill nothing at all,
  not even the phone.
- **v0.44.6** — **Tag a vet-bill line item as medication.** Each itemized charge on a vet visit
  (and grooming) now has a 💊 toggle. Tagged items appear under Care → Meds in a "From vet visits"
  section with their cost, so meds you bought at the vet show up alongside your scheduled ones.
  The tag also flags the item (💊) in the spreadsheet export.
- **v0.44.5** — Insights + clinic-dropdown improvements:
  - The **Weight trend** chart is back on Insights, above the selectable Trends chart, exactly as
    it was.
  - The Trends chart gains a **7-day** range and now **defaults to 7 days** (the shortest) instead
    of 30.
  - **Reliable clinic/vet/groomer dropdowns.** Because a plain autocomplete list hides its options
    once a field is filled, each vet/clinic/groomer field now has a real "Pick a saved…" dropdown
    beside it — so you can always choose a saved one, and still type a new name. Applies to medical
    records, vet visits, and grooming.
- **v0.44.4** — **Time zone setting.** A new Time zone picker in Settings (defaults to Central —
  Chicago) labels the times you log. Exported PDFs now footer every page with "Times shown in
  &lt;zone&gt;" so records are unambiguous, and Google Calendar events use the chosen zone.
- **v0.44.3** — Richer Med / Preventative form: **Dose**, **Given by** (you or a saved vet),
  **Time**, and an optional **Record #** (for a vet-given dose), alongside the existing repeat
  schedule. "Gave it" now stamps the time. These show on the med row, health timeline, calendar
  reminder, and export. A note in the form clarifies the split: recurring items live here; a
  one-time vet-given treatment or vaccine belongs under Care → Records.
- **v0.44.2** — Medical-record form polish:
  - **Test / Lab work** now reveals **Tested for / condition** and **Result** fields (e.g.
    "Heartworm → Negative"), shown on the record row, calendar, timeline, and export.
  - **Roomier, aligned layout** — the record form is wider and uses two-per-row fields instead
    of a cramped three-across Type/Date/Time, so values are readable and labels no longer wrap
    out of alignment.
- **v0.44.1** — Fixed vet clinic autofill from contacts. A clinic saved as a contact now shows
  up in the clinic dropdown and fills its address/phone whether you stored the name in the
  contact's **Name** or **Organization** field (previously only Organization worked). Applies to
  medical records and vet visits; a vet's personal name no longer clutters the clinic list.
- **v0.44.0** — **Interactive Trends chart on Insights.** A new chart you can steer: pick a
  **metric** (Feeding, Potty as pee/poop, Walks, Weight), a **style** (Auto, Line, Bar, Area),
  and a **range** (14 / 30 / 90 days). "Auto" chooses the best fit per metric — bars for
  feeding/potty, area for walks, a line for weight. Built on your real logged data.
- **v0.43.0** — Medical-record improvements + calendar sync:
  - **Vaccine type** — when the record type is *Vaccination*, a Vaccine type field appears
    (Modified Live, Killed/Inactivated, Recombinant… or type your own, e.g. "Modified Live").
  - **Time** — records now have an optional time (like vet visits), so timed entries become a
    1-hour block on the calendar instead of all-day.
  - **Change history in the Log tab** — a new button opens the full activity log, so you can see
    when each record, vet visit, etc. was added or edited, and by whom.
  - **Auto-sync to Google Calendar** — saving a medical record, vet visit, or grooming now pushes
    it (and its reminders) to Google Calendar automatically when connected, the same way custom
    reminders already did. Past and future records + their "next due" dates all sync.
- **v0.42.2** — Fixed clinic/vet autofill. Picking a saved **clinic** (or groomer) from the
  dropdown now fills in its address and phone — and **switching** to a different one updates
  the fields instead of keeping the first one's details. Manual edits you make afterward are
  preserved. Applies to medical records, vet visits, and grooming. Groomers saved under a
  business name (not a person's name) now autofill too.
- **v0.42.1** — Medical records gain a **Record #** field (chart / invoice / certificate number)
  next to the name. It shows on the record row, the calendar event details, and the spreadsheet
  export.
- **v0.42.0** — More profile detail for adopted & chipped dogs:
  - **Shelter / rescue details.** When "Adopted (shelter / rescue)" is the origin, the profile
    reveals extra fields — **ARN #** (Animal Record Number), **Animal ID**, **Intake date**, and
    **Rescue / transferred from**. They appear on the profile card, PDF, and spreadsheet.
  - **Microchip type / registry.** Next to the microchip number, record the brand/registry
    (HomeAgain, AVID, 24Petwatch, ISO…) so you know where to keep your contact info current.
  - **Estimated birthday.** A checkbox by Birthday marks the date as estimated (common for
    shelter dogs) — the age then shows with a "~" (e.g. "~1y 1mo") everywhere it appears.
- **v0.41.0** — Three profile & insights improvements:
  - **Origin now has a full address.** The "where you got your dog" section gained Address,
    City, State, ZIP and Phone fields (same structure as vet/grooming/contacts), replacing the
    old single "Where" line. Existing entries still display via a fallback.
  - **Export a dog's PDF from the profile card.** A new **Export PDF** button next to "Share
    info card" saves a one-dog report (profile, weight history, vet visits, grooming, meds,
    records, supplies, recent activity) — the same polished layout as the full export, scoped
    to that dog.
  - **Insights "Popular spots" now line up.** The pee/poop counts are set in a fixed-width
    monospace column so both icon groups align cleanly down the list, on desktop and mobile,
    even with long spot names or double-digit counts.
- **v0.40.1** — **ZIP code everywhere.** Every address that had City + State now also has a
  **ZIP** field — vet visits, grooming, medical records, and contacts. ZIP flows into the
  saved-provider autocomplete/autofill, the full address shown on cards, the Google Calendar
  event location, contact vCards (`.vcf` postal code), and the spreadsheet/PDF exports. The
  City/State/ZIP row sits on one line on desktop and stacks on mobile.
- **v0.40.0** — **Medical records now capture the full provider,** matching vet visits.
  A record has **Vet / doctor** and **Clinic** fields (each with autocomplete from your saved
  vet contacts and past records), an **Address / City / State**, and a **Phone** — pick a saved
  vet and the clinic, address and phone fill in automatically. Each record row gets a one-tap
  **Call** button, the address flows into the Google Calendar event location (tappable in Maps),
  and the spreadsheet export gains Vet / Clinic / Address / Phone columns. Older records that
  only had a single provider name still display correctly.
- **v0.39.1** — Mobile fix: in Insights → **Popular spots**, a long location name (e.g.
  "Near Garage Rear Service Door") no longer pushes the pee/poop counts onto their own line.
  The name now wraps within its column and the 💧/💩 chips stay pinned to the right, aligned
  across every row.
- **v0.39.0** — **Medical records.** New **Records** tab under Care for the dog's history —
  vaccinations, surgery, lab work, dental, microchip, deworming, exams, injuries and more.
  Each record has a type, date, provider, cost, notes, and an optional **"next due"** date
  (e.g. a booster) that surfaces in **reminders** and on the **calendar**. Records also flow
  into the Profile **health timeline** and the spreadsheet export (new *Records* sheet).
- **v0.38.0** — Mobile + chart fixes. Fixed the **Insights weight chart** (it was blank because Profile and
  Insights shared a canvas id — now scoped to the visible view). Fixed the **settings cog wrapping to a
  second line** on mobile (header stays one row). Stopped modals/pages from **shifting left-right** on mobile
  (killed stray horizontal overflow; grid columns can now shrink).
- **v0.37.0** — Reminder types. The "Add reminder / event" form now has a **Type** dropdown (General, Vet,
  Grooming, Medication, Feeding, Walk, Supplies, Appointment, Birthday, etc.) that sets the **icon** shown for
  that reminder on the calendar grid and in the Upcoming list.
- **v0.36.0** — Contacts city/state + fuller drafts. Contacts now have **City** and **State** fields (flow into
  the vCard and the vet/groomer autofill). Drafts now also **capture line items and tag selections** (service
  tags, symptoms), so resuming a vet/grooming/illness draft restores those too.
- **v0.35.0** — Form refinements. (1) **Line items now have a quantity** — each row is Qty × unit price, and
  the pre-tax total updates live (vet + grooming). (2) Vet/clinic and grooming addresses gained **City** and
  **State** fields (autofilled from saved records, and combined into the Google Calendar event location). (3)
  Grooming lets you **add custom services** on the spot (managed in Settings too). (4) **Health-timeline
  entries are now clickable** and open the exact record they came from (vet/grooming/illness/med) to edit.
  (5) The **Edit-dog form is wider** on desktop (stays full-width on mobile).
- **v0.34.0** — Auto-saved drafts. If you start a new record (vet, grooming, med, illness, supply, contact,
  note, reminder, or dog) and enter something, it's auto-saved as a **draft** — snapshotted every ~60s and
  again if you close the form without saving. Drafts appear in a "📝 Unsaved drafts" strip at the top of the
  matching section (Care, Supplies, Profile, Calendar) with **Resume** and discard (×). Saving the record
  clears its draft. (Note: line items and tag selections aren't captured in a draft yet — the main fields are.)
- **v0.33.0** — Settings is now a full page. The ⚙️ gear opens Settings & Data as its own wider, scrollable
  page (with a ← Back button) instead of a cramped pop-up, with each area in its own card — easier to read
  and navigate.
- **v0.32.1** — Weather panel tune-up. The hourly forecast is now a 6-across grid (bigger cells, no
  horizontal scrolling), the panel sits toward the center of the screen instead of jammed to the right, and
  it has a close ✕.
- **v0.32.0** — Supply units dropdown + package size. The supply **Unit** is now a dropdown of common units
  (bag, box, can, lb, oz, count…), and you can add your own in **Settings → Lists & preferences**. New
  **Package size** field handles things like a 5-lb bag (Qty 1 · Unit bag · Size 5 lb) instead of cramming
  "lb bag" into the unit. Both show on the item and in the export.
- **v0.31.0** — Emergency contact + dog notes. Added an **"Emergency Contact"** type to Contacts (for a
  person to call, distinct from the emergency vet). New **Notes** section on the Profile tab — jot down
  timestamped observations about your dog (e.g. "we think he's about 4 years old"), each with an editable
  date/time; included in the spreadsheet export.
- **v0.30.3** — Trimmed the signed-out prompt to just "Sign in to sync across devices" (dropped the Illness
  Tracker mention).
- **v0.30.2** — Prefill from saved contacts + reminder fix. A new vet visit or grooming entry now auto-fills
  the vet/groomer, clinic, and address from a matching saved **contact** on the dog's profile (still editable).
  Also fixed the Today reminders so a vet visit dated **today** no longer shows as upcoming after it's
  happened — a visit only reminds if it's a future date (same rule now for grooming).
- **v0.30.1** — Calendar "Upcoming" fix + vet icon. A vet visit or grooming session dated **today** no
  longer lingers in the calendar's Upcoming list once it's happened — record-type events only appear there
  if they're genuinely in the future (due/follow-up items still show for today). Swapped the vet icon from
  the box-with-plus to a proper first-aid-kit icon.
- **v0.30.0** — Grooming parity + clearer Insights periods. Grooming now matches vet visits: a **time** field,
  **groomer/salon suggestions** with an **address** (autofills, becomes the Google Calendar location),
  **itemized line items** with an auto-total, and **payment** fields (paid by, method, card brand/last 4).
  Grooming appointments (past and future) sync to Google Calendar, and an **upcoming grooming appointment
  within 30 days now shows in Reminders**. Insights: "Avg walk" is now labeled **(7d)**, and the potty
  averages state they're over the **last 30 days** (with the pee/poop counts used).
- **v0.29.1** — Upcoming vet visits now remind. Fixed reminders so a scheduled vet visit within the next 30
  days shows up (e.g. "Vet visit in 7d · Annual checkup"), not just its follow-up date.
- **v0.29.0** — Custom calendar reminders + vet address. The Calendar tab has a new **"+ Add reminder /
  event"** button — set a title, date, optional time, location, and notes; it shows on the calendar and, if
  Google Calendar is connected, is added there automatically on save. Vet visits gained a **Vet / clinic
  address** field (autofills from saved clinics), which becomes the Google Calendar event's location.
- **v0.28.0** — Itemized vet bills + payment. Vet visits can now break the bill into **line items** (add a
  row per charge); their total auto-fills the Cost. New fields for **Paid by** and **Payment method** — and
  when it's a credit/debit card, the **card brand** and **last 4**. Shown on the visit card and in the
  spreadsheet export. (Only the last 4 digits are stored — never a full card number.)
- **v0.27.1** — Tidied the quick-log note. Removed the explainer under the quick-log buttons (now redundant
  since every button opens a form); the "water = you refilled the bowl, not the dog drinking" clarification
  moved into the water form itself.
- **v0.27.0** — Water gets a form. The Water quick-log now opens a form like Fed instead of logging
  instantly, so you can set the date/time and pick where you refilled the bowl (same place list as feeding).
  The location is shown in the entry and editable afterward.
- **v0.26.2** — Where purchased. Supplies now have a **Where purchased** field (store/retailer), shown in the
  item row and included in the spreadsheet export.
- **v0.26.1** — Supply duration. Items in use now show how many **days in use** (start → today), and finished
  items show how many **days they were used** (start → finish), right in the row. Added a Days column to the
  spreadsheet export.
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
