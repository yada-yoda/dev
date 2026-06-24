# PawPrints

**Current Version: v0.1.0**

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

- **v0.1.0** — Initial release. Single-file app modeled on the Illness Tracker: shared Google
  login (same Firebase project, separate `pawprints/{uid}` doc), multi-dog profiles with inline
  photos, Today dashboard with quick-log + status + reminders, Log tab (feed/water/potty/walk/
  weight), Care tab (vet/grooming/meds/illness), Supplies inventory with YTD spend, Insights
  with weight-trend and spend charts, a Profile health timeline, demo mode, JSON export/import,
  and full PWA/OG kit.
