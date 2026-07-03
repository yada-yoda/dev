# Clover

A private, single-user personal finance dashboard — income, expenses,
subscriptions & renewals, paychecks, dividends, interest, rewards, credit
scores, and savings rates — replacing a stack of spreadsheets with one clean
web app.

- **Live:** https://dev.rizzo.cc/clover (part of the `yada-yoda/dev` static host)
- **Stack:** vanilla HTML/CSS/JS, no build step; Firebase (Google Auth + Firestore)
- **Design:** light theme, white canvas with green accents; desktop-first, mobile-usable

## Privacy

This folder lives in a public repo, so it contains **no real financial data
and no personal account/institution names** — only a generic catalog of common
banks, brokers, cards, and reward programs to pick from. Your actual accounts,
amounts, and history live only in your private Firestore database, behind
Firestore rules that allowlist your Firebase account ID (never your email).

## Setup (one-time)

1. Create a **new, dedicated** Firebase project (suggested id: `clover-finance`).
   Do not reuse another app's project — this keeps finance data fully isolated.
2. Add a **Web App**; enable **Google** as a sign-in provider.
3. Paste the web config into `firebaseConfig` in `firebase-config.js`
   (these values are public by design; safe to commit).
4. **Authentication → Settings → Authorized domains** → add `dev.rizzo.cc`.
5. Open the app, sign in once, and copy the **account ID** from the setup banner
   into both `firestore.rules` (OWNERS) and `OWNER_UIDS` in `app.js`.
6. Deploy rules: `firebase deploy --only firestore:rules`.
7. *(Optional)* Google One Tap: paste the Web OAuth client ID into
   `ONE_TAP_CLIENT_ID` in `firebase-config.js` for one-tap sign-in.

## Data model

```
finance/{uid}                 meta doc — settings, persons, categories,
                              accounts, subscriptions, credit scores, APY history
finance/{uid}/years/{yyyy}    per-year doc — income, paychecks, expense payments,
                              import batches
```

All monthly/annual/average totals and normalized monthly-equivalents are
computed client-side; nothing derived is stored.

## Changelog

### v0.3.0 — Phase 2: Income tracker + Annual Grid
- Per-year data documents (`finance/{uid}/years/{yyyy}`) loaded on demand and
  persisted (debounced), with the year driven by the top-bar year selector.
- **Annual Grid** — the spreadsheet-style view: income category groups × Jan–Dec
  plus Total YTD and Average, collapsible to per-subcategory rows, with a grand
  total row. Averages divide by months that have data (matching the sheets).
- **List view** — sortable transaction table filtered by month (top-bar) and
  category, with gross/net, account, person, and status.
- **Add/edit income** modal: date, category → dependent subcategory, account,
  person, gross/net, status (received or pending/expected), expected date,
  received-via, taxable, reinvested/paid-out flags, notes, and optional
  symbol-level dividend detail (symbol/action/qty/price) shown for dividends.
- Pending/expected income is tracked but excluded from grid totals (actuals only).

_Why:_ this is the first section that directly replaces a spreadsheet — the
Annual Grid mirrors the income sheet while the entry form captures every field
the sheets tracked.

### v0.2.0 — Phase 1: data layer, Settings & Accounts
- Client data store with Firestore persistence (debounced) and forward-compatible
  seeding of sensible defaults on first run.
- **Settings**: manage people (you/joint/others), income & expense category groups
  with subcategories, and catalogs of institutions, reward programs, and gift-card
  types — all pre-seeded with generic options and fully user-extensible.
- **Accounts**: full add/edit/remove with institution (autocomplete from catalog),
  type (incl. CD/brokerage/retirement), last-4, owner, active/auto-pay/rewards
  flags, notes, and CD term/APY/maturity fields shown for CD accounts.
- Shared modal (no backdrop-close, top-right ✕) and top-center toast system.
- SemVer now shown in the browser tab title alongside the sidebar.

_Why:_ establishes the data foundation and the two setup screens every later phase
depends on (categories and accounts are referenced by income, expenses, and more).

### v0.1.2 — Owner lock
- Locked access to the owner's Firebase UID in both `firestore.rules` and the
  client gate. The setup banner clears once the signed-in user is the owner.

_Why:_ finishes the private single-user security boundary — only the owner can
read or write finance data; everyone else is denied at the rules layer.

### v0.1.1 — Branding assets & setup fix
- Added a Clover-branded 404 page (wired into the site-root 404 redirect map).
- Added full favicon set (SVG, 16/32 PNG, ICO), apple-touch and PWA icons, and a
  1200×630 social preview image with OpenGraph/Twitter meta.
- Fixed the account-ID banner: it now shows whenever the app isn't yet locked to
  an owner (with a copy button), instead of only when Firebase was unconfigured.
- Added a "not authorized" screen for non-owner sign-ins.

_Why:_ the account ID is needed to lock down access, and it stopped showing once
the real Firebase config was added; also gives Clover its own identity assets.

### v0.1.0 — Phase 0: auth & app shell
- Initial scaffold at `dev/clover/`.
- Light white + green theme with CSS design tokens (dark-theme-ready).
- Left sidebar navigation, top bar with year/month selectors and search.
- Google sign-in gate with One Tap hook (activates once configured).
- Firestore security rules with owner-UID allowlist; deploy config.
- Navigable placeholder pages for every planned section.

_Why:_ establishes a real, testable foundation and the auth boundary before
any financial data or features are built.

## Roadmap

| Phase | Focus |
|------:|-------|
| 0 | Auth & app shell ✅ |
| 1 | Data layer, Settings, categories, accounts ✅ |
| 2 | Income tracker + Annual Grid ✅ |
| 3 | Expenses & subscriptions |
| 4 | Paychecks |
| 5 | Credit scores & savings rates |
| 6 | Dashboard |
| 7 | Reports & calendar |
| 8 | Import / export |
| 9 | Polish, mobile, security review → v1.0.0 |
