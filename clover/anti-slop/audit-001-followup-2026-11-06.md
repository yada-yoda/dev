# Clover anti-slop audit 001 — follow-up

Date: 2026-11-06
Shipped in: v1.0.162 (live at dev.rizzo.cc/clover, commit 4f70baa)
Approved for fixing: findings 1, 2, 3, 5, 6, 7. Findings 4 and 8 were folded in
because they are the same mechanism and the same one-line change.

## Fixed

| # | Finding | Before | After |
|---|---|---|---|
| 1 | Filter pills mouse-only (R-32) | 6 helpers, span + click, no focus | `clickableBadge()`: role=button, tabindex, Enter/Space, aria-label, focus ring |
| 2 | Generated shades 5-6 fail AA (R-25) | worst 3.47:1 | ink 24% -> 12% lightness, worst **4.66:1** across all 4 columns |
| 3 | Taxable "Unknown" amber (R-25) | **2.83:1** (failed both bars) | `--warn-ink` **4.62:1** |
| 4 | badge.green / badge.red (R-25) | 4.48 / 4.17 | `--accent-ink` 4.78 / `--expense-ink` 4.69 |
| 5 | Bulk bar count + Remove (R-25) | 4.48 / 4.31 | 4.78 / 4.85 |
| 6 | Notes button with a note (R-25) | 3.30:1 | `--note-ink` 4.61:1 |
| 7 | Tap targets under 44px (R-03) | pills ~16-20px, buttons 28px, checkbox 15px | `@media (pointer: coarse)`: 44px hit areas, 8px between row buttons |
| 8 | Borders under 3:1 (R-25) | bulk edge 1.20, month buttons 1.40 | `--bulk-edge` 3.15, `--border-ctl` 3.09 |

Also shipped alongside (not an audit finding, asked for separately): iOS Add to
Home Screen — `viewport-fit=cover`, the Apple metas, and `env(safe-area-inset-*)`
on topbar, sidebar, view, toasts, modals and the sign-in gate.

## How it was verified

- Every colour solved by search rather than guessed, then **re-swept from the
  patched files**: 33/33 pairings pass. The sweep reads `--*-ink` out of
  `styles.css` and the ink lightness out of `app.js`, so it measures what
  shipped, not what was intended.
- `node --check` on app.js. This caught nothing on its own, but the manual
  review of the patched helpers caught a real defect: `yoyFilterBadge` builds
  its aria-label from `label`, not `text`, and the first version referenced an
  undefined `text` which would have thrown on click.
- Base colours (`--accent`, `--warn`, `--expense`) were deliberately left alone;
  the new ink tokens apply only to text sitting on a tint, so fills, borders and
  chart colours elsewhere are unchanged.

## Deliberate compromise

Finding 7, the CD timeline owner pill: its row is a fixed 40px and must stay
aligned with the SVG beside it, so its hit area is capped at **40px, not 44px**.
Growing it further would desynchronise the rows from the chart. Recorded here
rather than claimed as a pass.

## Still open

- **Finding 10 (R-35) is not closed.** None of this was verified in a browser;
  the local preview is UNC-blocked. Touch targets and the safe-area insets in
  particular need a real iPhone. Until that happens v1.0.162 is "computed
  correct", not "seen working".
- **Finding 9 (em dashes, R-02)** — 642 app-wide and the established voice of
  every tooltip in Clover. Owner decision under R-37: keep as a recorded
  override, fix only the recent strings, or convert app-wide.
- **Findings 11, 12, 13, 14, 15** untouched (mobile `font-size: 0` hack, emoji
  in copy, a pill for the non-state "Unknown", unwritten colour reasons,
  palette growth).
- **Sign-in:** `signInWithPopup` can be blocked inside an iOS standalone app, so
  adding Clover to the Home Screen may open fine but fail to log in. Left alone
  on purpose; the fix is a redirect flow and it changes login for every device.
- Pre-existing and outside this audit's scope: `.table-card { overflow-x: auto }`
  means tables scroll sideways on a phone rather than card-stacking, which is
  not what the house rule asks for. App-wide, every table, long-standing.
