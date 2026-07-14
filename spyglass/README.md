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

### JavaScript-built pages — "Render in a browser"
Pages that build their content with JavaScript (bank rates, prices) look empty to a plain fetch,
and some sites block datacenter IPs. Tick **Render in a browser** on the monitor and Spyglass loads
the page in its own Cloudflare headless browser — rendering the JS natively — then extracts from the
result. It waits for the *watched* content (the pattern/keyword/selector) to actually appear before
reading, so it doesn't catch a page mid-render. **Test it now** and the pattern builder turn this
toggle on automatically when a value only shows up after scripts run. (This replaced an earlier
dependency on the external `r.jina.ai` reader, which began rate-limiting.)

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
   wrangler secret put JINA_API_KEY                    # optional: free r.jina.ai key — lifts the anonymous rate/IP block so sites whose rate API blocks Cloudflare IPs (e.g. Synchrony) can be read
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

### v0.9.1 (worker v0.9.1)
Added longer check-frequency options (every 2 days, 3 days, weekly, every 2 weeks, monthly) for
slow-changing pages. `freqLabel` renders multi-day/week/month intervals cleanly. After an *error*,
a monitor retries within `min(interval, 6h)` (`errorRetryMs`) so a monthly monitor doesn't sit
broken for a month on a transient failure.

### v0.9.0 (worker v0.9.0)
**Guaranteed change screenshots.** A detected change always captures a screenshot for the alert
email (retried), taken with the method that shows the page's real content — jina's own screenshot
for jina monitors (whose rate API blocks our IPs, so our browser renders a blank value), our
browser otherwise. The email always carries the full image; it's stored in the snapshot/thumbnail
only if it fits Firestore's ~1MB doc limit (jina PNGs can exceed it).

**Safe fallback.** Each monitor has a primary method (plain / browser / jina). If it fails or reads
empty, Spyglass tries the *other* methods — but ONLY to **confirm the value is unchanged**, never
to declare a change. Different methods can legitimately read different values for the same page
(Synchrony: our browser sees a 2.85% calculator, jina the real 3.30%), so a change is only ever
trusted from the monitor's own primary method. Result: availability when a method is briefly down,
without false-alarm risk. Verified: fallback confirms unchanged when it matches the baseline, and
refuses to alert (errors + retries) when it reads a different value.

### v0.8.4 (worker v0.8.4)
Some sites (Synchrony's HYS/CD pages) inject their rate from an API (`api.syf.com`) that **blocks
Cloudflare's IPs** — so both a plain fetch (403) and our own headless browser (the API call fails
inside the page) come up blank; only r.jina.ai, which renders from its own IPs, can read the real
value. But anonymous jina now 429s Cloudflare's shared egress. Fix: an optional **`JINA_API_KEY`**
worker secret (free key from jina.ai) — authenticated jina requests bypass the anonymous
rate/IP-reputation block. When set, r.jina.ai URLs (and the jina fallback) send it. jina URLs are
plain-fetched (not routed to our browser) so they actually use jina. Synchrony's monitor was
corrected back to jina + its real **3.30%** rate (an earlier build had mis-read a calculator
example as 2.85%).

### v0.8.2 (worker v0.8.2)
Monitor cards show the current extracted value at a glance (short values only — rates, prices,
keyword state) and a screenshot thumbnail of the page; the worker stores the latest screenshot as
`lastShot` on the monitor doc whenever one is captured (baseline, change, or a manual ↻ refresh —
the cron doesn't re-shoot on unchanged, to spare the browser-minutes budget).

**Reliability:** an *empty* extraction (page didn't finish rendering, JS value hadn't painted,
selector briefly missing, fetch blocked) is now treated as a transient **error and retried next
cycle — never a change**. You can't "change into nothing", so this eliminates false "it changed"
alerts when a render is slow. The browser render also retries once on an empty pattern/element
result. Plus a resilience fallback: if browser rendering fails outright, extraction falls back to
r.jina.ai's rendered text (text/keyword/pattern only — element selectors need a real DOM). r.jina.ai
is now a backup, not the primary path.

### v0.7.2 (worker v0.7.0)
Own-browser rendering replaces the external r.jina.ai dependency (which started returning 429s).
A monitor `render: true` (new "Render in a browser" toggle) routes extraction through Cloudflare
Browser Rendering — shared `withRenderedPage` navigation with screenshots — and waits for the
watched pattern/keyword/selector to render before reading, so JS-loaded values are captured
reliably. Test-it-now and the pattern builder auto-enable render + auto-retry when a value is
JS-built. The two bank monitors were migrated off jina URLs to `render:true` with re-tuned,
anchored patterns (Ally "buckets and boosters" → 3.00%; Synchrony "HYS APY" → its real current
2.85%, not the stale 3.30% jina had cached); verified unchanged across repeated live checks.

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
