# Spyglass

A personal, self-hosted [VisualPing](https://visualping.io/) — watch any web page and get an
email when it changes.

- **Front end** (`dev/spyglass/`) — a single static `index.html`: Google sign-in, a dashboard to
  create page monitors, and a change-history view with before/after diffs. A subfolder of the
  `yada-yoda/dev` monorepo, served at `https://dev.rizzo.cc/spyglass/`.
- **Worker** (`../../spyglass-worker/`) — a Cloudflare Worker (on the **sevendwarfs** account) on a
  5-minute cron that does the actual
  checking server-side (the browser can't, because of CORS and because it isn't running when a
  check is due), then emails alerts via Resend.

## How it works

```
Browser (dev.rizzo.cc)  ──auth/data──▶  Firebase (Auth + Firestore)  ◀──admin──  Cloudflare Worker (cron)
   create / manage monitors                 /users/{uid}/monitors            fetch each due page,
   view change history + diffs              /users/{uid}/.../snapshots        diff, snapshot, email
```

Each monitor watches one of:
- **Whole page text** — all visible text on the page.
- **A specific element** — the text inside a CSS selector (e.g. `#price`, `.status`).
- **A keyword / exact phrase** — alerts when any exact text (a word or a whole sentence) appears
  or disappears. A direction filter can restrict alerts to *added only* or *removed only* (e.g.
  alert when "Back soon!" disappears — a restock — but not when it shows up). One-shot by nature
  for value-tracking: after it fires you usually update the phrase; use a pattern for values.
- **A pattern (regex)** — extracts whatever the pattern matches (capture group 1 if present, up to
  10 **distinct** matches — duplicates are collapsed, so a rate a page repeats in four places shows
  once) and tracks *that*. The self-maintaining choice for values that change — a rate or
  price monitor alerts with old → new and keeps working without edits.
  E.g. `(\d+\.\d{2}%)\s*APY` on a bank page.
  Don't know regex? The **✨ Build it for me** helper asks for the value currently on the page
  (e.g. `3.10%`) and an optional nearby word (e.g. `APY`), then generates candidate patterns,
  tests them against the live page via `/preview`, and fills in the first one that captures your
  value — trying the `r.jina.ai` rendered version automatically when the plain fetch can't see it.

The first check of a monitor just records a baseline; you only get emailed on later *changes*.

### Region cropping, schedule windows & extra channels
- **Region picker**: in the monitor form, load a live screenshot and drag/resize a box over the
  part of the page you care about — that monitor's screenshots (history + email) crop to it.
  Coordinates are stored in the worker's 1280×800 viewport space (`region: {x,y,w,h}`).
- **Schedule windows**: optionally limit a monitor's checks to certain weekdays and/or hours
  (`checkDays`, `checkStartHour/End`, evaluated in the monitor's own `tz`). Outside the window a
  due check waits ~30 min and retries; the manual ↻ check always runs.
- **Extra alert channels** (⚙ Settings): a Discord webhook URL (changes post as embeds) and/or a
  custom webhook URL (JSON POST with `{event, monitor, summary, before, after}`), alongside email.

### Screenshots
When a change is detected (and on each monitor's first baseline), the worker photographs the real
rendered page with Cloudflare Browser Rendering (free tier: 10 browser-minutes/day account-wide —
plenty, since captures happen only on actual changes) and stores a viewport JPEG inside the
snapshot document. Screenshots appear in the change-history timeline and are attached to alert
emails. Per-user toggle in ⚙ Settings (`prefs.screenshotsEnabled`, default on). For
`r.jina.ai/…`-proxied monitors the *underlying* page is photographed.

### Sign-up gating
Sign-ups are invite-only by default. Google sign-in itself can't be blocked, so the gate lives in
Firestore rules: all data access requires an `/allowedUsers/{uid}` doc. When the admin flips
"Allow new sign-ups" in ⚙ Settings (`/config/app.signupsOpen`), first-time users self-register
automatically; when closed, they see a "sign-ups are closed" screen and are signed back out.
Existing accounts are never affected.

### 404
`404.html` in this folder is the Spyglass-branded not-found page; the dev.rizzo.cc root
`404.html` bounces `/spyglass/*` misses here (GitHub Pages only supports one site-wide 404).

### Phase 1 limitations & the rendered-page trick
- Pages that render their content **only via JavaScript** look empty to the server-side fetch, and
  some sites (banks especially) block datacenter IPs outright. The **Test it now** button in the
  monitor form shows you exactly what Spyglass can see before you save.
- **Workaround that usually fixes both:** prefix the URL with `https://r.jina.ai/` — a free public
  reader that loads the page in a real browser and returns its rendered text. Pair it with a
  *keyword* monitor on the exact value you care about (e.g. keyword `3.00%` on a bank's rates page:
  the alert fires the moment that rate changes). Visual screenshot monitoring (Phase 2) will handle
  these natively.

### Worker endpoints
- `POST /trigger` — run a sweep immediately (`x-trigger-key` header).
- `POST /preview` — powers *Test it now*: `{url, type, selector?, keyword?, pattern?}` returns
  `{matched, length, preview}`. Auth: Firebase ID token (Bearer) or `x-trigger-key`.
- `POST /check` — powers the per-monitor ↻ button: `{monitorId}` runs that monitor's check right
  now (baselines, snapshots, and emails exactly like the cron; ignores schedule windows). Auth:
  the owner's Firebase ID token — monitors are looked up under the caller's own user subtree only.
- `POST /screenshot` — powers the region picker: `{url, region?}` returns
  `{imageB64, width, height}`. Same auth as `/preview`. Browser sessions are reused across
  captures (free tier rate-limits *new* browser launches per minute).

## One-time setup

### 1. Firebase
1. Create a Firebase project (free Spark plan).
2. **Authentication** → enable **Google** sign-in.
3. **Firestore** → create database (production mode).
4. Project settings → add a **Web app**; copy the config into `FIREBASE_CONFIG` in `index.html`.
5. Deploy the rules: paste `firestore.rules` in the console (Firestore → Rules → Publish) or run
   `firebase deploy --only firestore:rules` from this folder. No indexes are needed — the worker
   deliberately queries per-user with single-field filters so Firestore's automatic indexes cover
   everything.

### 2. Hosting (yada-yoda/dev monorepo)
This folder lives at `dev/spyglass/` in the `yada-yoda/dev` repo, which already serves
`dev.rizzo.cc` — so just commit the folder and push; no separate Pages setup. Add `dev.rizzo.cc`
under Firebase Auth → Settings → Authorized domains so Google sign-in works on the live URL.

### 3. Worker (`spyglass-worker/`)
1. Set `FIREBASE_PROJECT_ID` in `wrangler.toml`.
2. Set secrets (never commit these):
   ```
   wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON   # service-account JSON for this project
   wrangler secret put RESEND_API_KEY                  # your Resend API key
   wrangler secret put MANUAL_TRIGGER_KEY              # optional: random string for POST /trigger
   ```
3. Give the service account Firestore access (IAM role **Cloud Datastore User**).
4. `cf sevendwarfs` then `wrangler deploy`.

Test without waiting for the cron:
```
curl -X POST https://spyglass-worker.sevendwarfs.workers.dev/trigger -H "x-trigger-key: <MANUAL_TRIGGER_KEY>"
```

## Demo

`index.html?demo=1` shows a populated dashboard with sample monitors — no sign-in, nothing saved.

## Changelog

### v0.7.1 (worker v0.6.1)
Faster, reliable screenshots. The capture waited on `networkidle2`, which never settles on
tracker-heavy sites (banks) — so it stalled the full 25s timeout and then shot a blank pre-paint
page. Now it loads on `domcontentloaded`, waits (capped) for real text to render, sets a desktop
UA, and nudges lazy content: ~3-6s instead of ~25s, and no more white screenshots. Verified
against the live Synchrony/M1/Ally pages.

### v0.7.0 (worker v0.6.0)
Four VisualPing-inspired upgrades. Screenshot region picker: drag/resize a box over a live
screenshot in the monitor form and that monitor's screenshots crop to just that area (worker
`/screenshot` endpoint + puppeteer clip; browser sessions now reused across captures to respect
the free tier's launch rate limit). Keyword direction: alert only on *added* or only on *removed*
transitions — the other direction re-baselines silently. Discord + custom webhook alert channels
configured in Settings, firing alongside email with per-channel status in check results. Schedule
windows: restrict a monitor's checks to chosen weekdays/hours in your own timezone (manual ↻
bypasses). All verified live: direction suppression, webhook 200 via echo service, schedule skip,
and full-vs-cropped screenshot captures.

### v0.6.2 (worker v0.5.1)
Pattern monitors now collapse duplicate matches: pages that display the same value in several
places (Ally shows its savings rate 4×) read as one clean value instead of "3.00% | 3.00% |
3.00% | 3.00%" — in the dashboard, history, and alert emails. The Synchrony monitor's pattern was
re-anchored to Synchrony's own rate so the "National Average" comparison stat (0.33%) no longer
tags along or triggers alerts. All monitors were rebased in place — no false alerts from the
transition.

### v0.6.1
Added `legal.html` — Privacy Policy, Terms of Use, and Disclaimer on one page, linked from a new
site footer. The privacy section documents the real data flow (Firebase, Cloudflare Workers,
Resend, r.jina.ai for rendered pages) and commits to no analytics, ads, tracking, or data sale;
the disclaimer covers best-effort monitoring and the not-financial-advice caveat for rate monitors.

### v0.6.0
Page screenshots (Phase 2, and it turned out free): on every change and first baseline the worker
photographs the real rendered page via Cloudflare Browser Rendering and stores it in the snapshot —
visible in the change history and attached to alert emails, with a per-user toggle in the new
⚙ Settings panel. Sign-ups became invite-only, enforced by Firestore rules (an admin switch in
Settings reopens them; new users then self-register on first sign-in). Added a Spyglass-branded
404 page, and the add/edit form no longer closes on a stray backdrop click.

### v0.5.0
"✨ Build it for me" pattern assistant: type the value currently shown on the page and an optional
nearby word, and Spyglass generates the regex for you — generalizing numbers so the pattern
survives value changes, testing candidates against the live page, and auto-switching the URL to
the r.jina.ai rendered version when the site builds its content with JavaScript. No regex
knowledge needed for rate/price monitors anymore.

### v0.4.0
Change history became a real look-back log. The first check of a monitor now records a baseline
snapshot ("started watching — value was X"), so every monitor's timeline has a dated starting
point, and the first real change diffs against it properly. Timeline rows in the detail view show
the captured value with date & time (e.g. "Jul 10, 6:20 AM — 3.30%") instead of just +N/-N counts;
click a row for the full before/after diff. Alert emails inherit the same benefit via their
Recent-changes section.

### v0.3.0
Pattern (regex) monitors: extract a value (rate, price) with a regex and Spyglass tracks whatever
it matches — when the value changes you get an old → new diff email and the monitor keeps working,
unlike keyword monitors which need re-arming after each change. Every monitor card gains a
↻ Check-now button (new worker `POST /check` endpoint), and alert emails include a Recent-changes
history of the last few snapshots.

### v0.2.0
"Test it now" button in the monitor form — the worker's new `/preview` endpoint fetches the page
and returns exactly what the selector/keyword would extract, so you know a monitor works before
saving it. DevTools class lists pasted as selectors are auto-converted to real CSS selectors
(`a b c` → `.a.b.c`). Empty or blocked fetches now explain themselves and suggest the
`r.jina.ai` rendered-page prefix for JavaScript-built pages. Worker fetches send fuller
browser-like headers and allow slower renders (25s timeout).

### v0.1.0
First release. Dashboard front end (Google sign-in, create/edit/pause/delete monitors, status
filters, change-history + before/after diff view, demo mode) and the Phase 1 worker (whole-page /
CSS-element / keyword monitoring, server-side fetch + word-level diff, Firestore snapshots, Resend
email alerts on change, 5-minute cron). Wired to the `spyglass-f0de2` Firebase project; ships with
an OG share card and version-driven title. Visual screenshot diffing is planned for Phase 2.
