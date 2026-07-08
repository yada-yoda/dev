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

### v1.0.52 — Columns button shares the filter row

On Paychecks and Bills & Subscriptions, the ⚙ Columns button sat alone on
its own row below the filters, wasting a strip of vertical space. It now
sits on the same row as the filter dropdowns, kept to the right. Pages
without a filter row (Accounts, Taxes, Selling, etc.) keep the button on
its own right-aligned row as before.

### v1.0.51 — Recovered items lost to a usage-limit cutoff

Three requests from earlier in the build got dropped when a session hit its
usage limit; this release closes them out.

- **New dashboard panels now actually show up.** Panels added in later
  releases (like "💳 Best card to use today" and "Taxes") never appeared if
  you had already customized your dashboard layout — the saved layout didn't
  know about them. Saved layouts now surface newly shipped panels at the end
  automatically, and removing a panel is remembered properly, so deliberate
  removals stay removed. Same fix applies to Reports panels. One-time note:
  any panel you removed before this release will reappear once — remove it
  again and it sticks.
- **Reward program is now a real dropdown.** When adding a Rewards income
  entry, the program field previously used a type-ahead suggestion box that
  hid your list too well. It's now a proper dropdown with your reward
  programs from Settings listed first, then common issuers, plus an "Other /
  type manually" option for one-offs.
- **Years, explained and extendable.** The top-bar year dropdown (and every
  year tab strip) always covers 2020 through next year and rolls forward
  automatically every January — nothing to maintain. New Settings → Years
  card lets you add older years (for back-filling pre-2020 history from old
  spreadsheets); added years appear everywhere years are offered, and
  removing one just hides it from the dropdowns without touching its data.

### v1.0.50 — Default subcategories (HOA gets a home) + missing Bills & Subs columns

- Fresh installs now seed useful default subcategories on the expense
  categories (Utility → Electric/Gas/Water/Sewer/Trash, Insurance →
  Auto/Home/Renters/Life/Health/Pet, Auto → Fuel/Maintenance/Registration/
  Parking & Tolls, and so on), so you don't have to build the obvious lists
  by hand. The old "Mortgage / Rent" seed group is now **Housing**, with
  Mortgage, Rent, **HOA**, Property Tax, and Home Maintenance subcategories —
  giving HOA dues a proper home. Existing data is untouched: seeds only apply
  the first time an account is set up, so add any of these you want from
  Settings → Categories (e.g. an "HOA" subcategory under your housing group).
- The Bills & Subscriptions ⚙ Columns manager was missing several fields the
  edit form already captures. Added **Subcategory** (colored clickable tag,
  filters the table like Category), **Vendor**, **Backup account**,
  **Priority**, and **Status** as optional columns — all sortable, all
  hidden by default so nothing shifts until you turn them on.

### v1.0.49 — Colored, clickable tags on Bills & Subscriptions
- The **Category, Frequency, and Account** columns on Bills & Subscriptions now use the
  same colored value tags as Accounts — each column its own color, each value its own
  shade — and **clicking a tag filters the table** to that value (e.g. click "Monthly" or
  "Streaming"), with a clear-filter chip.

### v1.0.48 — Gross / Net toggle on the income grid
- The income **Annual grid** now has a **Gross | Net** toggle: Net shows true take-home
  amounts — paycheck-backed categories (Wages, Acting) switch to their recorded net,
  while dividends, interest, rewards, and sales are already net so they stay put. The
  header total follows ("$X net received").

### v1.0.47 — Dividend import: accounts, specials; per-account grid rows; donut %
- Duplicate checks are now **account-aware**: importing to a *different* "Record under"
  account treats a matching date/stock/amount as a **new payout** (a note says how many
  such rows were recognized), and switching the account re-evaluates the review live.
- **Special dividends** are recognized (e.g. Schwab "Special Dividend"), labeled in the
  preview, and never collide with a regular dividend of the same amount on the same day —
  in the file or against what's already recorded.
- The income grid's **Dividends** row now expands **per account** (each M1 account and
  Schwab on its own row), falling back to the broker name when no account is linked.
- The dashboard **income/expense donuts show each slice's %** in the legend.

### v1.0.46 — Expected tax forms checklist
- The Taxes page now shows **"Expected tax forms"** for a chosen year, derived from what
  you've tracked: a **W-2 or 1099-NEC per employer** (set "Pay reported on" in each pay
  schedule — it also shows on the employer profile), **1099-INT** when banks paid $10+
  interest (banks named), **1099-DIV** per broker, a possible **1099-B** for investment
  sales, **1099-K** for marketplace sales (Poshmark), and **1099-MISC** for settlements
  of $600+. Hover any form for a plain-English explanation. A checklist, not tax advice.

### v1.0.45 — Panel resizing (snap)
- Dashboard and Reports panels can now be **resized** in ✎ Edit layout: a ⇤/⇥ button on
  each panel header snaps it between **half** and **full** width (no freestyle dragging —
  it always stays on the grid). Saved with your layout.

### v1.0.44 — Paycheck-count bubbles
- In the income grid, the Paychecks rows (and each employer row) now show a small **×N
  bubble** next to each month — so 3-paycheck months stand out (highlighted amber at 3+),
  with a total-count bubble on YTD.

### v1.0.43 — Reports: year tabs + customizable panels
- Reports now has **year tabs** (like Paychecks) and the same **✎ Edit layout** panel
  system as the dashboard — drag to reorder, remove/add report panels, collapse by
  header. Layout saved per account.

### v1.0.42 — Raises: CSV, inflation comparison, employer profiles
- Raises can be **imported/exported via CSV** (template included).
- With 3+ raises at an employer, a **YoY vs inflation** table shows each raise's %,
  that year's US inflation (CPI-U annual average), and the **real** gain/loss after
  inflation.
- **Employer profiles** on the Raises page: days/years employed (from a new **hire
  date** on the pay schedule), total gross/net ever paid, estimated **total hours** and
  current **gross/net hourly** (from a new hours-per-check field), and the salary change
  since your first recorded raise.

### v1.0.41 — Tax returns know their state
- Tax returns now record the **state filed in**; picking a state fills the state-form
  suggestions with that state's actual forms (e.g. IL → IL-1040, IL-1040-X, Sch IL-WIT,
  Sch M, Sch ICR), with a heads-up for no-income-tax states. Optional "State filed in"
  column, included in the CSV export/import/template.

### v1.0.40 — Account columns, colored value filters
- Accounts gained **CD APY**, **CD maturity**, and **Savings APY (latest)** columns (the
  savings rate pulls the newest entry you've recorded under Credit & Rates for that
  institution, with its recorded date).
- **Type, Institution, Owner, and Beneficiaries are now colored value badges** — each
  column has its own color, each distinct value its own shade — and **clicking one
  filters the table** to that value (e.g. click "CD" to see all CDs), with a clear-filter
  bar.

### v1.0.39 — Selling page + Poshmark import
- New **Selling** page: import your Poshmark **My Sales Report** CSV (avatar → My Sales →
  My Sales Report → email it to yourself) and every completed sale lands in a detailed,
  customizable table — listing/order dates, SKU, order id, title, department/category,
  brand, color, size, bundle/offer/NWT flags, cost, order price, shipping/label/packaging
  fees, **your earnings**, a computed **Profit** column, buyer info, sales tax, and notes.
- Duplicates (same order id + title + price) are skipped automatically, sales route to
  the right **year**, imports are **undoable**, and a **template** + **CSV export** are
  built in.
- **Earnings roll into your Selling income automatically** (like paychecks → Wages), with
  a "↳ Sales" row in the income grid.

### v1.0.38 — Import fixes, best-card panel, reward polish
- **M1 duplicate fix**: same-day payouts with different **Posted Dates** (e.g. the same
  dividend hitting two of your M1 accounts) are no longer flagged as duplicates — the
  posted date now tells them apart, and review lines show both dates.
- The dividend import's account picker is now "**Record dividends under**" with an
  explanation: it tags the dividends to one of *your* Clover accounts (the broker file
  doesn't say which internal account paid).
- **💳 Best card to use today** is now a dashboard panel (add it via ✎ Edit layout if
  you've customized your dashboard).
- Rewards: the **program** field suggests your reward programs from Settings, a new
  **Order confirmation #** field, and **Gross is greyed out and mirrors Net** (rewards
  are always take-home).
- The income grid's "Avg" column is now labeled **"Avg / mo"** (with an explanation on
  hover), and the template-download row on Import/Export aligns properly.

### v1.0.37 — Paycheck deductions breakdown
- Pay schedules can hold a **pay-stub sample**: the per-check line items between gross and
  net (Federal Withholding, Social Security, Medicare + the additional Medicare tax, State
  Withholding, 401(k), insurance… plus your own custom items). A **"Where the gross goes"**
  card on Paychecks multiplies the sample by the regular checks received that year, so you
  can see what each deduction cost you per year — and it checks that gross − deductions
  matches your expected net.
- Paychecks now have a **Check type** (Regular / Bonus / Reimbursement / Adjustment /
  one-time) shown as a badge. This assumes a **salary** — every regular check about the
  same — and one-time checks are excluded from the deductions math and raise detection.

### v1.0.36 — Tax history CSV import / export
- The Taxes page can now **export your history to CSV**, **import from CSV** (duplicates
  skipped automatically), and download a **template** showing the exact format — including
  itemized form costs and the extended/amended fields.

### v1.0.35 — Employer rows in the income grid + clearer dividend review
- In the income **Annual grid**, the "↳ Paychecks" row under Wages/Acting now **expands
  to one row per employer**, showing what each employer paid you month by month.
- The dividend import review is much clearer: every flagged duplicate cites its **CSV row
  number** and, for in-file repeats, the row it matches ("open both rows in Excel to
  compare"); the summary says which **date column** is used (M1's "Date", not "Posted
  Date"); and **dividend-related fees are their own labeled section** — listed with row
  numbers and an explanation — so they can't be mistaken for the dividends preview below.

### v1.0.34 — Raises tracker
- New **Raises** page (under Paychecks): log each raise per employer — date, new gross
  per check, previous gross, change in $ and %, **days between raises**, and an ongoing
  **"days since last raise"** counter per employer while you're still employed there.
- **⛏ Detect from paychecks** scans your recorded paychecks for gross-per-check changes
  and proposes them as raises for review — increases pre-checked, decreases (usually a
  one-off bonus reverting) left unchecked.

### v1.0.33 — First-pay-of-year anchor + employer tags
- Pay schedules can record the **first pay date of this year**: period #1 anchors exactly
  there, so the whole year's expected checks, period numbers, and gross/net line up with
  your actual pay year even when the rhythm shifted from last year.
- The **Received** stat card on Paychecks now lists **which employers paid** during the
  selected year (e.g. "Main Job · Acting Gig").

### v1.0.32 — Toolbar, colored priorities, sort reset
- The **⚙ Columns** button now sits directly **above each table, on the right** — same
  spot on every page (Paychecks, Bills & Subscriptions, Accounts, Credit & Rates, Taxes).
  Layouts stay saved per account, and Reset to default is inside the manager.
- **Priority flags are color-coded** on Bills & Subscriptions: Essential red, High amber,
  Low green.
- **Sorting can be reset**: click a column a third time to return to the table's default
  sort (headers say so on hover).

### v1.0.31 — Schwab dividend import + broker templates
- The dividend importer now fully understands **Schwab (ex-TD Ameritrade) transaction
  exports**: all their dividend spellings (Qualified Dividend, Non-Qualified Div, Qual Div
  Reinvest, Pr Yr Cash Div, Special Qual Div…), reinvestment read straight from the action,
  qualified/non-qualified captured, ADR/foreign-tax fees offered as expenses — and interest
  rows deliberately skipped so they can't double-log against your interest history.
- **Template downloads**: the import screen offers sample M1 Finance and Schwab CSVs so
  the expected format is never a mystery.

### v1.0.30 — Taxes dashboard panel, per-form costs, form explanations
- New **Taxes** dashboard panel: your most recent tax year's **net outcome** (refunds
  minus payments, amendments included, with Extended/Amended badges) plus **lifetime
  refunded and paid** totals.
- Tax filings can now record **itemized per-form costs** (e.g. 1040 $150, Schedule C
  $75) when the CPA breaks out the bill — informational, kept separate from the total
  prep cost since they may already be included in it.
- **Every tax form now explains itself**: hover a form name (dotted underline) for a
  plain-English description of what it's for, and the add/edit form shows the meaning
  live as you type.

### v1.0.29 — Import dividends from your broker
- New **⬆ Import dividends** on the Income page: upload a broker **activity export**
  (M1 Finance now; Schwab format supported for when you have one) and Clover pulls out
  just the **dividends** — purchases are never imported, but they're used to tag payouts
  that were **↻ Reinvested** into the same stock.
- **Duplicate safety**: anything matching an existing entry's date + stock + amount (or
  repeated inside the file) goes to a review list where you choose **Merge (skip)** or
  **Add as separate** — so overlapping M1 exports can't double-log dividends.
- Optionally imports **dividend-related fees** (e.g. that $0.05 ADR debit) as expenses in
  a category you pick, in the same batch. Everything is one **undoable** import.
- Qualified / non-qualified is captured when the broker provides it (Schwab does); the
  symbol and reinvested tag now show in the income List.

### v1.0.28 — Tax history section
- New **Taxes** page: log each year's filing — the **federal and state forms** used, whether
  each came back as a **refund or owed** (and how much), **who prepared it** (your CPA) and
  **what they charged**, whether you **filed an extension**, and the filed date.
- **Amendments**: an **Amend** button on any year prefills a 1040-X / state-X amendment for
  that year with its own numbers; the original row gets an "Amended" badge.
- Summary cards total refunds, payments, and prep costs across all years; the table is
  sortable with customizable columns like the rest of the app.

### v1.0.27 — Customizable dashboard + Income mix panel
- The **Dashboard is now made of panels** you control: click **✎ Edit layout** to drag
  panels into a new order, remove ones you don't want (✕), and add them back (＋). Click
  any panel header to collapse/expand it. Your layout is saved to your account.
- New **Income mix (YTD)** panel: how much of this year's income comes from **interest,
  dividends, and investments** — in dollars and as a share of both **gross** and
  **take-home (net)** income.

### v1.0.26 — Customizable columns on Credit & Rates and Year overview
- **⚙ Columns** on the Credit scores and Savings rates tables (per-tab), and on the
  **Year overview** table in Reports (choose which yearly metrics to show).

### v1.0.25 — Customizable columns on Accounts
- **⚙ Columns** on the Accounts page too, with optional **Beneficiaries** and **Notes**
  columns.

### v1.0.24 — Customizable columns on Bills & Subscriptions
- The **⚙ Columns** manager (show/hide/reorder) now also works on **Bills & Subscriptions**,
  with optional **Person** and **Notes** columns. Column layouts are saved per table.

### v1.0.23 — Customizable paycheck columns
- New **⚙ Columns** button on Paychecks lets you **show/hide** columns and **reorder** them
  (↑ / ↓). Adds optional columns too: **Period start**, **Period end**, and **Notes**.
- Your column choice is saved to your account and applies everywhere the paychecks table
  shows (current, upcoming, all-years).

### v1.0.22 — Missing paychecks in the table + Upcoming tab
- Missing paychecks (expected but not recorded) now appear as **greyed rows right in the
  paychecks table**, each with a **Record** button — instead of a separate panel. They do
  **not** count toward Gross/Net/Received totals until you record them.
- A new **Upcoming** tab switches the table to your **future** scheduled paychecks (with a
  countdown), so you can see what's coming and record one early if needed.
- The ↻ Refresh moved up next to the tabs.

### v1.0.21 — Fix biweekly pay dates drifting a day
- Fixed a bug where biweekly/weekly pay dates (and weekly/biweekly bill renewals) could
  land a day early after a daylight-saving change — e.g. a Friday payday showing as
  Thursday in the second half of the year. Dates now step by whole calendar days and stay
  on the weekday of your first pay date, so entering that date is all it takes.

### v1.0.20 — Refresh button on missing paychecks
- The Missing-paychecks panel has a **↻ Refresh** button that re-pulls the year's data and
  recomputes against your pay schedule — handy if a change (like merging employers, or a
  paycheck added elsewhere) didn't show up automatically.

### v1.0.19 — Merge / rename employer
- New **⇄ Merge employers** button on Paychecks: relabel every paycheck (and any matching
  pay schedule) from one employer name to another — e.g. rename "Main Job" to "Director of
  Support", or merge two names into one. This fixes a schedule and its paychecks being
  filed under different names, so the missing-paycheck detection lines up.

### v1.0.18 — Bill price-change tracking
- Clover now remembers each bill/subscription's amount over time. When you change an
  amount, it records the new price with the date.
- Each bill row shows a small **trend arrow** — ▲ (up, red), ▼ (down, green), or – (no
  change) — with a tooltip of the last change.
- A **Price history** chart at the bottom of Bills & Subscriptions lets you pick a bill
  and see its amount over time, with a summary: how many times it rose, when it last
  rose, and the net change since the first recorded price.

### v1.0.17 — Pay-schedule employer picker + nicer missing section
- The pay-schedule **Employer** is now a **dropdown of your existing paycheck employers**
  (with counts), so a schedule pairs to the right job instead of every period showing as
  "missing" from a name mismatch. A schedule pointed at an employer with no paychecks is
  flagged ("no matching paychecks"); switch it to the real one to reconcile. New jobs can
  still add a fresh employer.
- The **Missing paychecks** section was redesigned as a clean card grid (period, date,
  amount, Record) instead of a cramped chip list.

### v1.0.16 — Pay schedules & missing-paycheck detection
- New **pay schedules** (Settings, and a "Pay schedule" button on Paychecks): tell Clover
  how a job pays — **weekly, biweekly (26/yr), semimonthly (24/yr), or monthly** — with a
  known pay date to anchor from.
- Paychecks then shows a **"Missing paychecks"** strip: expected pay dates you haven't
  recorded yet, each with its period number and expected amount and a one-click **Record**
  that prefills the paycheck form (date, period #, period start/end, gross, net, employer).
- **Period numbers are never blank** — if a paycheck has none, the number is derived from
  your pay schedule and shown (subtly) so periods stay consistent.

### v1.0.15 — Renewal dates auto-advance
- A recurring bill's **renewal/due date now rolls forward automatically**. Set the day
  once (e.g. the 8th) and an active monthly bill always shows next month's 8th, an annual
  one shows next year's date, etc. — so an active bill is never overdue or blank and you
  never have to reset it. (Inactive/canceled bills keep their last date, shown muted.)
- The **Calendar** now shows recurring bills on every month they land, not just the one
  month the stored date happened to fall in.

### v1.0.14 — Net monthly income is annualized
- The **Net monthly income** figure now sums your net pay over the trailing 12 months
  and divides by 12, so the occasional "extra" biweekly paycheck is spread evenly and
  the number doesn't jump around month to month. (With under a year of pay history it
  divides by the months you have.)

### v1.0.13 — Net monthly income = paychecks only
- The **Net monthly income** figure (Bills & Subscriptions, and the dashboard "Should
  be left" basis) now comes **only from paycheck take-home**, averaged over the months
  you were paid. Interest, rewards, and other one-off income no longer distort it, so it
  reflects your regular pay.

### v1.0.12 — Rewards net = gross
- Reward income has no tax withheld, so its **Net now auto-fills to equal the Gross**
  whenever net is left blank — on both CSV import and manual entry. Reward rows in the
  List now show a Net figure instead of a dash.

### v1.0.11 — Fix net-income average, add Received-via column
- Fixed the **Net monthly income** figure (Bills & Subscriptions, and the dashboard
  "Should be left"): it now averages over the months that actually had a **paycheck**,
  so a month with only a small reward or interest deposit no longer drags the average
  down. It reads as a normal month's take-home again.
- The income **List** now has a proper **Received via** column (Venmo, PayPal, check…),
  visible for every category including Other.

### v1.0.10 — Grid breakdowns, "via" in list, rewards Person, paychecks All view
- **Annual grid**: expanding **Interest** now breaks it down by bank/institution, and
  **Rewards** by reward source — one row per source with its monthly totals (instead of
  by subcategory).
- The income **List** now shows how money arrived ("via Venmo/PayPal/check…") under the
  account, so imported Received-via data is visible.
- The rewards import CSV now includes a **Person** column.
- **Paychecks** has an **All** tab next to the years that shows every year's paychecks
  together (sorted, with combined totals) for cross-year review.

### v1.0.9 — Auto net income, sortable paycheck timing, Period alignment
- **Bills & Subscriptions** no longer asks you to type your net monthly income — it's
  now computed automatically as your average take-home per month (averaged over the
  months that have income, falling back to the most recent prior year so a new month
  or new year never reads as $0). The dashboard "Should be left" uses the same basis.
- **Paychecks**: the days-early/on-time/late tag is now its own **Timing** column —
  cleaner than sharing the Received cell, and sortable (earliest to latest).
- Fixed the **Period** column so the number lines up under its header.

### v1.0.8 — Other-income detail, net-based "left over", fuller import preview, button polish
- **Other income** now has dedicated **Type** (Lawsuit, Gift, Stimulus, Rebate, Winnings…)
  and **Description** (e.g. the class-action case name) fields, shown in the add/edit form
  when the category is Other, and importable as their own CSV columns. Income import also
  gained a **Received via** column (Venmo, PayPal, check…).
- The dashboard **"Should be left / mo"** and monthly **"Net"** cards now calculate from
  **take-home (net) income**, not gross — so the number reflects money left after taxes.
- The **CSV import preview** now shows every column you mapped (up to 8 sample rows), not
  just date/amount/category, so you can sanity-check the whole row before importing.
- Buttons no longer wrap or vary in size — the **+ Add** buttons in Settings (and all
  primary/ghost buttons) are now uniform.

### v1.0.7 — Reward source & type
- Reward income entries now have dedicated **Reward source** (Chase, Amex, Coinbase,
  Fetch, Ebates, ReceiptPal, Microsoft…) and **Reward type** (cash back, statement
  credit, gift card, crypto…) fields, shown in the add/edit form when the category is
  Rewards. Both are importable as their own CSV columns and appear in the income List.

### v1.0.6 — Chart date range on Credit & Rates
- The credit-score and savings-rate charts now have a "Chart range" selector: view
  all time, a single year, or a custom From/To date window. The table below stays
  full so you can still edit any entry; only the chart narrows to the chosen range.

### v1.0.5 — Bulk-edit paychecks
- Paychecks table now has a checkbox column with select-all/clear, so you can pick
  several pay dates at once and apply a Method (Direct deposit, Office pickup, Other…)
  or Status to all of them in one action — handy for fixing a batch of pickup methods
  without editing each row.
- The selection bar updates in place as you check rows, so the table doesn't jump or
  lose your scroll position.

### v1.0.4 — Per-year tabs
- Income, Expenses, and Paychecks now show a row of year tabs when you have data in
  more than one year — click to jump between years (kept in sync with the top-bar
  year selector).
- Coalesced store change-notifications into one render, fixing a duplicate-render
  glitch when several years load at once.

### v1.0.3 — Fuller paycheck import + multi-year CSVs
- Paycheck CSV import now maps Person, Period #, Period start/end, Status, and
  payment Method (previously only date/gross/net/employer/notes).
- A CSV can span multiple years — each row is routed to the correct year
  automatically on import, and one Undo removes the whole multi-year batch.

### v1.0.2 — CSV import for Bills & Subscriptions
- The importer now supports Bills & Subscriptions as a target, and that page has
  its own "Import CSV" button. Frequency, priority, and status text are normalized;
  category text is matched to your categories; monthly/annual equivalents compute
  automatically. Imports are batched and undoable like the others.

### v1.0.1 — Per-page CSV import
- Added an "Import CSV" button to the Income, Expenses, and Paychecks pages that
  jumps straight into the importer pre-set to that dataset — no need to pick the
  target manually.

### v1.0.0 — Phase 9: polish & first stable release
- Added an in-app "How Clover works" guide (Settings) covering paycheck→income and
  bill→expense roll-ups, backups, and privacy.
- Security review: rules locked to the owner's account ID (anonymous access is
  denied), noindex, no secrets or financial amounts in client logs, no debug pages.
- All nine build phases complete — the app is feature-complete and stable.

### v0.9.2 — "Should be left / month" stat card
- Added a Dashboard card estimating the money that should be left over in a typical
  month: your take-home (or average income) minus recurring bills minus average
  spending — the "unallocated income" figure from the spreadsheets.

### v0.9.1 — Phase 8 (part 2): CSV import
- Import transaction CSVs (income, expenses, or paychecks) into the selected year:
  upload → columns auto-map to Clover fields (adjustable) → preview → import.
- Category/account/person text is matched to your existing records; unmatched rows
  fall back to a category you choose. Dates and amounts are parsed from common
  formats; likely duplicates are detected and skipped.
- Every import is a batch shown in an import history, with one-click **Undo**.
- CSV parsing via PapaParse (lazy-loaded from CDN).

_Why:_ completes import/export — your prior-year spreadsheets can now come in, and
any mistake is one Undo away.

### v0.9.0 — Phase 8 (part 1): Export & backup
- New Import / Export page. **Full backup**: download everything (settings,
  categories, accounts, bills, and every year of income/expenses/paychecks) as one
  JSON file, and **restore** it from that file.
- **CSV export** for income, expenses, and paychecks (selected year), plus your
  full bills and accounts lists.
- CSV *import* (mapping/preview/dedup for old spreadsheets) is the next piece.

_Why:_ data safety and portability first — your data is never trapped.

### v0.8.1 — Phase 7 (part 2): Calendar
- New Calendar view: a month grid plus an agenda list showing paychecks, bill/
  subscription renewals, and CD maturities, colour-coded, with month navigation
  and a "Today" jump. Today is highlighted; on mobile, days show compact dots.

### v0.8.0 — Phase 7 (part 1): Reports
- New Reports page with a chart gallery for the selected year: income vs expenses
  by month, net cashflow, wages gross vs net, and doughnuts for income by category,
  expenses by category, and expenses by payment method.
- Year-overview table: income, expenses, net, dividends, interest, and rewards
  per year across all your years (loads each year on demand).

_Why:_ turns the raw entries into the trends and year-over-year comparisons the
spreadsheets were really for. (Calendar view comes next.)

### v0.7.3 — Savings rates tracked by institution
- The Savings Rates tracker now records APY per **bank/institution** (Ally,
  Synchrony, …) instead of per individual account — matching how rates actually
  work. Pick from your institutions list (or type one); each bank is charted as
  its own line. Any older account-based entries are read via the account's
  institution.

### v0.7.2 — Bills roll into Expenses
- Renamed "Subscriptions" to **Bills & Subscriptions** (utility bills like ComEd
  belong here alongside streaming, etc.).
- Active recurring bills now roll into the **Expenses** annual grid automatically
  at their normalized monthly cost — no double entry — shown as a "↻ Recurring
  bills" row per category, with an **Include bills** toggle to hide them.
- Expenses can be **linked to a bill** (e.g. the actual ComEd amount for a month);
  the logged actual overrides that bill's estimate for that month, so nothing is
  double-counted.

_Why:_ recurring bills and one-off spending now live in one clear picture, mirroring
how paychecks roll into Income.

### v0.7.1 — "Last day" statement dates & field alignment
- Credit-card statement/due days can be set to "Last day" for cards that cut on
  the last day of the month (handles months without 31 days). The float estimate
  resolves it to each month's real last day.
- Fixed vertical misalignment of the account modal's day-field inputs (labels that
  wrapped to different line counts pushed their boxes out of line); inputs now line
  up consistently.

### v0.7.0 — Phase 6: Dashboard
- New Dashboard (the default view): KPI cards for this month's income, spending,
  recurring/month, net, and projected annual income & expenses (annualized from
  YTD + subscriptions).
- Attention strip: subscriptions renewing within your warning windows and
  late/missing paychecks.
- Two doughnut charts — income by category and expenses by category (YTD) — plus
  an upcoming-renewals list and a recent-activity feed across income, paychecks,
  and expenses.

_Why:_ pulls every section together into one at-a-glance snapshot of the month
and the year.

### v0.6.0 — Phase 5: Credit scores & savings rates (first charts)
- New Credit & Rates page with two tabs:
  - **Credit scores** — log date/score/provider; charted as a line per provider
    (Credit Karma, Chase, Amex, bureaus…) over time, plus a sortable table.
  - **Savings rates** — log date/account/APY; charted as a line per account so you
    can compare how each bank's rate moves, plus a sortable table.
- Introduces charts via Chart.js (lazy-loaded from CDN on first use); charts are
  responsive and fall back gracefully if the library can't load.

_Why:_ recreates the credit-score history and APY-tracking sheets, and adds the
charting foundation the Reports phase will build on.

### v0.5.0 — Phase 4: Paychecks
- New Paychecks page: expected vs. received dates with automatic days-early/late,
  gross/net, employer/source (main job and acting/side gigs), person, pay-period
  number and start/end, status (Received/Expected/Late/Missing/Bounced/Manual),
  and payment method. Sortable table, status filter, and an "upcoming / outstanding"
  strip highlighting unpaid checks.
- Summary cards: Gross YTD, Net YTD, received count, outstanding count.
- Paychecks are the source of truth for wages: each paycheck's gross rolls into
  its mapped income category (Wages, Acting, …) on the Income grid automatically —
  so wages are never entered twice. Received/Manual-deposit checks count; unpaid
  ones don't.

_Why:_ recreates the paycheck spreadsheet (expected-vs-received tracking) and ties
earnings into the income view without double entry.

### v0.4.1 — Phase 3 (part 2): Expenses annual grid
- New Expenses page with an Annual Grid (expense category × Jan–Dec + Total YTD +
  Average, collapsible to subcategories, grand-total row) plus a List view for
  one-off/actual expense payments, filterable by month and category.
- Add/edit expense modal (date, category → subcategory, account, person, amount,
  notes), all fields tooltip'd. Recurring bills stay on the Subscriptions page;
  this is the cash-basis actuals side.

_Why:_ completes the expense picture — normalized recurring costs on Subscriptions,
and actual month-by-month spending here, both in the spreadsheet-style grid.

### v0.4.0 — Phase 3 (part 1): Subscriptions & recurring bills
- New Subscriptions page for recurring bills and subscriptions, with a
  frequency→monthly-equivalent engine: weekly/biweekly/monthly/quarterly/
  semiannual/annual plus every-N-months and every-N-years (so a $120/yr sub shows
  as $10/mo, a bi-monthly $220 bill as $110/mo).
- Each row shows amount, frequency, monthly-equivalent, annual cost, % of net
  income, next-renewal with 7/14/30/60-day warning badges, payment account, and
  priority/status/auto-pay flags. Sortable columns; filter by status and category.
- Summary cards: editable net monthly income, total monthly, total annual, and
  "left after subs" — mirroring the expense spreadsheet's unallocated-income line.
- Add/edit modal with every field tooltip'd, including backup payment account.

_Why:_ this reproduces the recurring-expense spreadsheet as a live, sortable view
with normalized monthly costs and renewal alerts. (Part 2 — the expense annual
grid and one-off expense payments — comes next.)

### v0.3.6 — Account beneficiaries & credit-card float
- Accounts now capture beneficiaries; savings/CD/brokerage/retirement accounts
  without one are flagged "No beneficiary" so you can spot gaps.
- Credit cards can store static statement-open/close and due days. From these,
  Clover estimates each card's "float" — days until a purchase made today would
  be due — and highlights the best card to use today for the longest interest-free
  window.

### v0.3.5 — Field tooltips & personalized "Me" tag
- Added ⓘ tooltips to every field in the income and account forms explaining
  what each is for (e.g. why income asks which account: to see income by
  account, like dividends per broker).
- The default "you" person is now labeled "Me (<your first name>)", taken from
  your Google account. Rename it (or any person/institution/reward) by clicking
  its name in Settings; the label updates everywhere it's used.

### v0.3.4 — Sortable tables, flag tooltips & configurable defaults
- Account table columns are now sortable by clicking the header (toggles asc/desc,
  with a caret on the active column) — via a reusable sortable-table helper.
- Added tooltips (ⓘ) to the account flags explaining each one, especially the
  difference between "Used for income" (money in) and "Used for expenses" (money
  out).
- New Settings card "New account defaults" controls which flags start checked when
  adding an account; "Used for expenses" no longer defaults on.

### v0.3.3 — Account rollover linking
- Accounts can now link to the older account they replaced — for CDs that get a
  new account number each time they mature and roll over. Set "Continues account
  (rollover)" on the new account and it ties the history together.
- The predecessor is automatically marked inactive and badged "Rolled over"; the
  successor shows a "↳ rollover of …" note so the chain is clear.

### v0.3.2 — Fix modal horizontal scroll
- Fixed the account modal overflowing horizontally (scrollbar) when the CD type
  was selected. Form field rows now shrink to fit; modals never scroll sideways.

### v0.3.1 — Alphabetized institution picker
- The bank/broker list in the account form is now sorted alphabetically so it's
  easier to scan.

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
| 3 | Subscriptions & expenses ✅ |
| 4 | Paychecks ✅ |
| 5 | Credit scores & savings rates ✅ |
| 6 | Dashboard ✅ |
| 7 | Reports & calendar ✅ |
| 8 | Import / export ✅ |
| 9 | Polish, security review → v1.0.0 ✅ |
