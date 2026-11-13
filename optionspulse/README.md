# OptionsPulse

A private options-position tracker at dev.rizzo.cc/optionspulse. You record snapshots of a position (mark, bid/ask, IV, volume, open interest, Greeks, notes), and it shows P/L, a trend chart, a snapshot history table and a rule-based holding-risk label.

Single file: `index.html`, plain HTML/CSS/JS, no build step. No analytics. Marked `noindex`.

## Setup

1. Sign-in uses the same Firebase project as Illness Tracker and PawPrints (`illnesstracker-8d888`), so the same Google login works. `dev.rizzo.cc` is already an authorized domain there.
2. **Required:** add this rule to the Firestore rules of `illnesstracker-8d888` (Firebase console > Firestore > Rules), inside the existing `match /databases/{database}/documents { ... }` block, then Publish:

   ```
   match /optionspulse/{uid} {
     allow read, write: if request.auth != null && request.auth.uid == uid;
   }
   ```

   Without it the app still works on one device (it keeps a per-account copy in the browser) but shows "Cloud sync blocked".
3. Deploy by pushing the `dev` repo as usual.

## How data is stored

- One Firestore document per user: `optionspulse/{uid}` holding `positions[]`, each with its `snapshots[]`.
- A per-account copy lives in localStorage so the page loads fast. Nothing is shown until you sign in.
- Blank values stay blank. The app never copies an earlier price into a later snapshot.

## Risk label rules

Points from the latest snapshot: premium lost (60%+ = 3, 40%+ = 2, 20%+ = 1), days to expiry (7 or less = 3, 21 or less = 2, 45 or less = 1), absolute delta (under 0.10 = 2, under 0.25 = 1), and percent out of the money when the stock price was recorded (20%+ = 2, 10%+ = 1). Total: 0-1 Low, 2-3 Moderate, 4-5 High, 6+ Very High. The same rules are shown in the app.

## Phase 2 (not built)

Screenshot upload with automatic value extraction using Claude vision. The API key must not live in the page, so this needs a Cloudflare worker that holds the key and does the extraction, the same pattern as pawprints-worker. The upload area is shown as "coming soon" for now.

## Changelog

### v0.1.1 (2026-11-13)

The 9:35 AM Nov 13 snapshot had no stock price in its screenshot, so it was filled from a market-data lookup (Yahoo 1-minute close, $159.41) and labelled as looked up, which lets the out-of-the-money distance compute for that row.

### v0.1.0 (2026-11-13)

First version. Tracking was being done by hand in one-off dashboards built from screenshots; this puts the same views in one private, signed-in page that keeps history across devices. Includes positions, manual snapshot entry with a date/time confirmation step, edit and delete, CSV import and export, a one-click import of the NVDA $215 Call history, a trend chart, a three-view history table, loss scenarios and a transparent risk label.
