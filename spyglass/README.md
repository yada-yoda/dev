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
- **A keyword** — alerts when a word/phrase appears or disappears.

The first check of a monitor just records a baseline; you only get emailed on later *changes*.

### Phase 1 limitations
- Pages that render their content **only via JavaScript** can look empty to the server-side fetch.
  Visual screenshot monitoring (Phase 2) handles those with a real headless browser.
- Sites behind strong anti-bot protection may block the fetch; those monitors show an `Error` state.

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

### v0.1.0
First release. Dashboard front end (Google sign-in, create/edit/pause/delete monitors, status
filters, change-history + before/after diff view, demo mode) and the Phase 1 worker (whole-page /
CSS-element / keyword monitoring, server-side fetch + word-level diff, Firestore snapshots, Resend
email alerts on change, 5-minute cron). Wired to the `spyglass-f0de2` Firebase project; ships with
an OG share card and version-driven title. Visual screenshot diffing is planned for Phase 2.
