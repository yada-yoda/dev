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

- One Firestore document per user: `optionspulse/{uid}` holding `positions[]`, each with its `snapshots[]`, plus `settings.tables` with the saved column layout (names, order, visibility, sort) of each history view.
- A per-account copy lives in localStorage so the page loads fast. Nothing is shown until you sign in.
- Blank values stay blank. The app never copies an earlier price into a later snapshot.
- Re-importing the NVDA history on an account that already has it only adds missing snapshots (matched by date and time) and fills empty fields. Values you entered or edited are left alone.
- A snapshot added from a screenshot keeps `imageHash`, the SHA-256 of the image file, so the same screenshot is flagged as "already imported" next time. The image itself is not stored.

## Screenshot import

In Add snapshot, drop Robinhood option screenshots or press Choose screenshots (on a phone this opens the photo library). Several at once is fine; they are read one after another and shown one form at a time.

- OCR is tesseract.js 7.0.0, loaded from cdnjs only when the first image is chosen. Its worker, engine and English data come from jsdelivr (about 7 MB on first use, then cached by the browser). Everything runs in the browser; the image is never uploaded.
- Each image is upscaled 2x on a canvas and read with automatic page segmentation. If the stock price bar is missed, the bottom quarter is read again on its own. Dark screenshots with few values read get a second, inverted pass.
- `parseRobinhoodText(text)` turns the text into fields by matching Robinhood's label rows (Bid/Ask, Mark/Last trade/IV, Greeks, and the Your position screen). Anything it cannot read stays empty. It never fills in a guess.
- The form opens prefilled. Read values are highlighted; editing one removes the highlight. The time comes from the status-bar clock with AM/PM guessed from market hours. The date is left empty and confidence stays Inferred until you change it. If the image has an EXIF/XMP creation date, it is offered as a suggestion only. The file's modified time is never used.
- Nothing is saved until you press Save and confirm. Warnings show when the screenshot's ticker, strike, type, contracts, average cost or expiration differ from the selected position, when the same image was imported before, and when a snapshot with the same date and time exists.
- Images over 15 MB or not images are left out.

Later option: store the screenshot itself (for example in Firebase Storage) so a snapshot can show its source image. Not done in v0.3.0 to keep account data small and private.

## Risk label rules

Points from the latest snapshot: premium lost (60%+ = 3, 40%+ = 2, 20%+ = 1), days to expiry (7 or less = 3, 21 or less = 2, 45 or less = 1), absolute delta (under 0.10 = 2, under 0.25 = 1), and percent out of the money when the stock price was recorded (20%+ = 2, 10%+ = 1). Total: 0-1 Low, 2-3 Moderate, 4-5 High, 6+ Very High. The same rules are shown in the app.

## Changelog

### v0.3.0 (2026-11-13)

Typing every number from a Robinhood screenshot was slow and easy to get wrong. You can now drop one or more screenshots into Add snapshot, and the values are read for you with free OCR that runs in your browser. No API key, no server, and the image never leaves your device.

Read values arrive highlighted in the normal form, so you check them against the screenshot before saving. Nothing is guessed: anything unreadable stays blank, and the date is left for you to set. The app warns when a screenshot was already imported, when it looks like a different position, or when that date and time already has a snapshot.

This replaces the earlier plan to use Claude vision through a worker. Screenshots themselves are not stored yet.

### v0.2.0 (2026-11-13)

The history table showed fixed columns, so numbers like last price, bid/ask size or P/L % had nowhere to go. Each view now has Table settings: show, hide, rename and reorder any column, and click a header to sort. The layout is saved to your account, so it follows you across devices. The table still never scrolls sideways, and the phone card layout uses the same choices.

The built-in NVDA history was missing values that the Robinhood screenshots did show (last, previous close, high, low, bid and ask sizes), and one row had a price sitting in its evidence note. Those are corrected, and a new Nov 13 3:16 PM snapshot is added; its date and AM/PM are inferred, so please confirm them. If you already imported the history, an "Apply NVDA history updates" button adds what is missing without touching anything you edited.

Snapshots now also record bid size and ask size, including in CSV import and export.

### v0.1.1 (2026-11-13)

The 9:35 AM Nov 13 snapshot had no stock price in its screenshot, so it was filled from a market-data lookup (Yahoo 1-minute close, $159.41) and labelled as looked up, which lets the out-of-the-money distance compute for that row.

### v0.1.0 (2026-11-13)

First version. Tracking was being done by hand in one-off dashboards built from screenshots; this puts the same views in one private, signed-in page that keeps history across devices. Includes positions, manual snapshot entry with a date/time confirmation step, edit and delete, CSV import and export, a one-click import of the NVDA $215 Call history, a trend chart, a three-view history table, loss scenarios and a transparent risk label.
