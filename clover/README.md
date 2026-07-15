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

### v1.0.105 — A simpler expense form (especially for transfers)

- **“For which bill?” → “Linked bill (optional)”**, with a clearer hint: it’s
  only for when an expense *is* the payment for one of your recurring bills.
  It’s hidden entirely for savings/investment transfers.
- **“Source (subcategory)” → “Subcategory”** — it was never a “source” on an
  expense. For a transfer it reads **“Type of savings / investment”**.
- **Vendor is hidden for transfers** — moving your own money has no merchant.
- **Picking “Moved to” fills in the rest**: the subcategory follows the
  destination account’s type (a brokerage account → Brokerage, a retirement
  account → Retirement / IRA) and the description writes itself
  (“Transfer to Fidelity Brokerage”). Both stay editable, and anything you
  chose yourself is never overwritten.

### v1.0.104 — Log money moved into savings & investments

- New **Savings & Investments** expense category (added to existing accounts
  automatically) with subcategories for Brokerage, Retirement / IRA, 401(k),
  HSA, Emergency Fund, Crypto, College / 529, and Other savings.
- Pick it on an expense and a **Moved to** field appears for the destination
  account, while “Paid from” becomes **Moved from** — so a $300 move from
  checking into a brokerage is recorded as the transfer it is, with both ends
  traceable. The list shows it as `Checking → Brokerage`.
- It still counts toward the month (the money left your spendable pool, so your
  “left after everything” is right), but it’s labeled as moved, not spent.
- Note: a *pre-tax payroll deduction* (e.g. 401(k) taken before you’re paid)
  belongs on the paycheck as a deduction instead — this is for money you move
  yourself after being paid.

### v1.0.103 — APY column: just the date, and no missing dates

- The APY column now shows **only the date** under the rate (no “as of / recorded”
  word), so the column stays narrow — the full phrasing is in the hover tooltip.
- Accounts whose APY was entered before the date field existed now get a date
  automatically (stamped to today; editable per account), so every rate in the
  column shows one.

### v1.0.102 — One unified APY column for accounts

- The separate **APY**, **CD APY**, and **Savings APY (latest)** account
  columns are now a **single APY column** that shows the right rate for any
  account — a checking/savings/money-market account’s own APY, a CD’s APY, or
  (as a fallback) the latest rate you recorded on the Credit & Rates page.
- Each rate now shows its **date underneath** (“as of …” for a rate you entered
  on the account, or “recorded …” for one pulled from your rate history) — the
  way the old Savings column did. Add/Edit an account now has an **APY as of**
  date next to the APY (defaults to today when you set a rate).
- Fixes the APY you typed on a checking account not appearing — it lives in
  this one column now, which is shown by default. Existing custom column
  layouts are migrated automatically.

### v1.0.101 — Class Actions: durations, paid-by-year, and pay-range stats

- **Paid by year** — a breakdown card showing how much you were paid each
  calendar year (by payout date), with a bar for each year.
- **Duration insights** — new stat cards for **Avg time to pay**, **Fastest
  payout**, and **Slowest payout** (filed → first payout, in days), each naming
  the settlement, plus **Lowest paid** and **Highest paid** amounts.
- **Duration column** on the table: a *completed* duration (filed → first
  payout) for paid claims, or an *ongoing* day count for claims still awaiting
  payout.
- All of these respect the filter bubbles — click a Status/Method/Person to see
  the durations, ranges, and paid-by-year for just that slice.

### v1.0.100 — Clickable filter bubbles on the Class Actions table

- On the Class Actions table, the **Status**, **Method**, and **Person** values
  are now **clickable bubbles** — click one to narrow the list to just those
  entries, click it again (or ✕ Clear filter) to clear. The stat cards update
  to reflect what’s shown, matching how Bills & Subscriptions works.

### v1.0.99 — Class Action CSV import, APY on all accounts, fresh-JS on deploy

- **APY is now editable on (almost) every account.** The Current APY field
  shows for every account type except CDs (which have their own APY) and
  credit cards — so brokerage cash, retirement, sweep, and the rest can hold a
  rate. (If you didn’t see it before, a stale cached copy of the app was the
  culprit — see below.)
- **Class Action Settlements import moved into Import / Export**, working just
  like every other import: pick “Class Action Settlements”, upload a CSV, map
  the columns, preview, and import — with a downloadable **template**. The
  ⬆ Import button on the Class Actions page now takes you there.
- **Returning visitors always get the latest app.** The app’s scripts are now
  version-stamped, so a new release busts the browser cache instead of
  occasionally serving yesterday’s code.

### v1.0.98 — Help guide, fee categories, account APY & closing

- **New Help / Guide page** (left nav) explaining, in plain language, what
  every page and tab is for — a starting point for new users. It’s kept in
  step with the app as features change.
- **Bank Fees** and **Investment Fees** are now subcategories under the
  **Other** expense category (added to existing accounts automatically). A
  Chase-style checking monthly fee → Other → Bank Fees. If you had a separate
  “Investment Fees” category, its logged entries move into Other → Investment
  Fees automatically, and broker-fee imports default there too.
- **Current APY** field when adding/editing a checking, savings, money-market,
  or sweep account (plus an optional APY column).
- **Close an account** right from its Edit form: you get a warning of what’s
  tied to it — auto-pay bills, other bills paid from it, and bills that list it
  as a backup — and the close date is recorded. Closed accounts move to a new
  **Closed** tab on the Accounts page and can be reopened anytime.

### v1.0.97 — Class Action Settlements tracker

- New **Class Actions** page (left nav) to track the settlement claims you’ve
  submitted to and their progress — its first job is letting you **search to
  see whether you already submitted** to one.
- Each claim records: name, full case name/number, status (Not submitted →
  Submitted → Approved → Paid, plus Denied/Excluded), date filed, claim
  deadline, claim/confirmation numbers, payout method, estimated payout,
  proof-required flag, URL, notes, and a **payouts** list (a single claim can
  pay out more than once). Stat cards summarize tracked / submitted / awaiting
  payout / paid / total received. Sortable, searchable, customizable columns.
- **+ Income** on any row prefills an income entry (Other → Class Action
  Settlement) from the latest payout — nothing is added to income
  automatically.
- **Class Action Settlement** is now a default subcategory under the **Other**
  income category (added for existing accounts too).
- Import your existing list from a JSON file via **⬆ Import** (adds to this tab
  only; duplicates by name + date are skipped).

### v1.0.96 — Convert between expenses, bills & budget placeholders

- Every expense, bill, and budget placeholder now has a **Convert** button
  that changes what it is and carries all its details over (amount, category,
  account, person, notes):
  - An **Expense** → a **budget placeholder** or a **recurring bill**.
  - A **Bill** → a **budget placeholder** (or back to a regular bill), or a
    **one-off expense**.
  - A **Budget placeholder** → a regular bill, or a one-off expense.
- Budget placeholders and bills are the same kind of record (a recurring item
  flagged as an estimate), so switching between them is instant; converting
  to/from an expense moves the record to the right page and removes the
  original. Available from the Expenses list, Bills & Subscriptions, and the
  Budget page.

### v1.0.95 — IRA / estate distributions as income

- New **Retirement / IRA** income category (added automatically for existing
  data). Pick it on an income entry and a dedicated section appears for
  recording a retirement distribution — including an **inherited IRA from an
  estate**.
- Fields: **Distribution type** (Inherited IRA (Estate), Traditional/Roth IRA,
  401(k), pension, RMD, lump-sum…), **Payer / plan**, **Distributed from**
  (the account the money came out of, e.g. the estate’s IRA), and separate
  **Federal** and **State tax withheld** amounts.
- Enter the gross distribution and the withholdings, and the **net is computed
  for you** (gross − federal − state) — so your take-home is right in both the
  grid and the list. The Account field relabels to **Deposited to** (where the
  money landed), and Taxable defaults to Yes. The income list shows the payer
  and distribution type at a glance.

### v1.0.94 — Budget page for placeholders + monthly reconciliation

- **New Budget page** (in the nav under Bills & Subscriptions) gathers every
  bill you’ve flagged as a **budget placeholder** — the expected/future costs
  you want reflected before they’re real bills. Stat cards up top show the
  count of placeholders, your net monthly income, their estimated monthly and
  annual cost (with share-of-income bars), and how many are reconciled for the
  chosen month.
- **Monthly check-in.** Each placeholder gets a per-month row: **Log actual**
  (opens a pre-filled expense linked to the bill, so its estimate is replaced
  by the real amount for that month) or **Not used** (marks it reconciled
  without an expense — undoable). A month picker lets you reconcile any month
  of the year.
- **New-month reminder.** A few days into a new month, a banner on the Budget
  page — and an item on the dashboard’s ⚠ Attention strip — prompts you to
  enter last month’s actuals for any placeholder you haven’t confirmed yet.
- Placeholders are fully **editable from this page** (Edit/Remove), and a
  **+ Add budget placeholder** button creates one with the flag already set.

### v1.0.93 — Paychecks in the Income list + a leaner rewards form

- **Wages finally show in Income → List.** The list only ever showed
  manually-entered income, so paychecks (the source of truth for wages)
  were invisible there. Now they appear as their own rows — with a
  Paycheck/Income "Kind" badge, pay period, employer, method, gross and
  net — and Edit opens the real paycheck editor. The category filter and
  month picker cover them too.
- **The Income list gets the standard table treatment** it was owed:
  sortable headers (asc → desc → reset) and a ⚙ Columns manager with a
  per-user saved layout (Date, Kind, Category, Source, Account, Received
  via, Gross, Net, Person, Status, Notes).
- **Rewards entries only ask what matters.** Picking the Rewards category
  hides "Received via" and the Reinvested/Paid-out flags (they don't
  apply), the program dropdown lists **your** Reward programs from
  Settings (plus Other to type a one-off — the built-in issuer list is
  gone), and Reward type is a real dropdown (Cash back, Statement credit,
  Deposit, Gift card, Points, Miles, Crypto, Referral bonus, Other).
  Choosing **Deposit** reveals a "Deposited to" account picker so you can
  say which account the money landed in.

### v1.0.92 — Account dropdowns grouped by type

Every account dropdown now separates accounts by type — Checking, then
Savings, then Credit Card, and so on (in the account-type order), with
each group alphabetical inside. No more hunting for a card among savings
accounts.

### v1.0.91 — Expenses grew up

- **Templates for every CSV import.** Income, Expenses, Paychecks, and
  Bills & Subscriptions each get a ⬇ Template download in the import
  chooser (the broker/Poshmark imports already had theirs).
- **Expenses can finally say what they were.** New Description and Vendor
  fields ("Parking — Main St Garage" via "SpotHero"), shown as their own
  column in the List view. The account field is now labeled **"Paid
  from"** and its help text says exactly what it means — the account or
  card the money came out of.
- **Parking day / Toll issued day.** Pick a parking- or toll-flavored
  category or subcategory and a date field appears for the day the charge
  was actually *for* — pay today for the 25th's parking, and the list
  shows "for Jul 25" under the paid date. The field name follows the
  category.
- **Duplicate button** in the expense list — starts a new expense
  prefilled from an existing one, dated today.
- **Stat cards on the Expenses page**: Net monthly income, logged expenses
  for the month, recurring bills for the month (with logged payments
  replacing their estimates), and **Left after everything** — your net
  income minus both — each with a share-of-income bar.
- The CSV importer maps all the new fields (Description, Vendor, Applies
  to day, Check #).

### v1.0.90 — Collapsible Settings + privacy/terms/disclaimer page

- **Settings is navigable now.** All nine customizable lists (People,
  Income/Expense categories, Institutions, Reward programs, Gift card
  types, Tax forms, Paycheck methods, Check types) live inside one
  "Lists & categories" section — click its header to collapse the whole
  thing, or any inner card's header to collapse just that list. Pay
  schedules, New account defaults, and Years collapse too. What's
  collapsed is remembered per browser.
- **New [privacy page](privacy.html)** covering the privacy policy, terms
  of use, and a disclaimer (Clover is record-keeping, not financial/tax
  advice; verify important figures with a professional). Linked from the
  sign-in screen and the Settings help card — and it satisfies Google's
  privacy-policy requirement if the OAuth app is ever verified.

### v1.0.89 — Click a calendar day for details

Clicking any day with events on the Calendar grid opens a detail popup —
the full date, an event count, and every event with its complete label and
a type tag (Paycheck / Expected paycheck / Bill / CD). No more squinting at
chips that truncate long bill names; the whole cell is clickable, chips
included.

### v1.0.88 — Name your Google calendar

The first Connect now asks what to call the Google calendar Clover pushes
to (default "Clover"), and once connected a ✎ button renames it any time —
both in your Google account and in Clover's settings.

### v1.0.87 — Google Calendar sync (one-way push)

The Calendar page gains **Connect Google Calendar**. One Google sign-in
(client-side Google Identity Services — no server, no secrets; the OAuth
client id is public by design), and Clover creates a dedicated **"Clover"**
calendar in your Google account and pushes this month plus the next two:
paychecks, expected pay dates, bill renewals/due dates, and CD maturities
with their 7-day reminders. Strictly one-way — Clover never reads your
calendar. Every event carries a hidden id, so re-syncing updates and
removes instead of duplicating, and deleting the Clover calendar is always
safe (the next sync recreates it). After connecting, the button becomes
"↻ Sync to Google" with the last-synced time in its tooltip.

First connect shows Google's "unverified app" notice — expected for a
personal app in Testing; click Advanced → continue once.

### v1.0.86 — Expected pay dates on the Calendar

The Calendar now shows your pay schedule's expected pay dates ("TestCo
expected · ~$2,000.00") alongside recorded paychecks, bills, and CD
maturities. An expected marker disappears as soon as a real paycheck is
recorded within 4 days of it — so past dates you've entered show the
actual check, and future ones show what's coming.

### v1.0.85 — Missing paychecks tab + projection sources named

- **New "Missing" tab on Paychecks** (next to Paychecks and Upcoming): one
  place listing every paycheck that's gone missing — expected pay dates
  from your schedule that were never entered, plus recorded paychecks
  still unreceived once their pay date is 3+ days past. Bounced checks are
  excluded (that's a known event, not a missing one), and nothing here
  counts toward totals.
- **The Projected annual income panel says what it counts.** A line under
  the gross/net cards lists the income streams feeding the projection
  ("Wages, Dividends, Interest…"), and explains that net uses each entry's
  recorded net — take-home for paychecks — falling back to gross where no
  net was recorded.

### v1.0.84 — Customizable paycheck Method and Check type lists

Settings gains two new managed lists: **Paycheck methods** (Direct deposit,
Check, Office pickup… plus whatever yours are) and **Paycheck check types**
(Regular, Bonus, Reimbursement…). Add, rename, or remove entries and the
paycheck form's Method and Check type dropdowns — and the bulk-edit bar —
follow along. One caution baked into the card's description: keep
"Regular", since any other check type is treated as a one-time check and
excluded from salary math and raise detection. Existing paychecks keep
whatever value they have even if it's later removed from the list.

### v1.0.83 — Check numbers

Paper checks are traceable now:

- **Paychecks** get a "Check #" field that appears when the method is
  Check, Office pickup, or Other (hidden for direct deposit), plus an
  optional Check # table column and CSV import mapping.
- **Expenses** get an always-available "Check #" field; the list shows it
  under the paying account.
- **One-time bills** get a "Check #" field too (recurring bills don't — a
  new check every cycle wouldn't fit one field), with an optional column
  in Bills & Subscriptions.

### v1.0.82 — Synchrony savings APY updates itself

Synchrony's website exposes a public rates feed (api.syf.com) that allows
browser access, so Clover now reads it directly — no server involved. When
you open Credit & Rates → Rates, it checks once a day whether Synchrony's
High Yield Savings APY changed and logs a new dated entry automatically
(tagged "(auto)" in the toast); there's also a "↻ Sync Synchrony APY"
button to check on demand. It only runs if you actually have Synchrony
(an account or past rate entries), and it logs under whatever institution
name you already use. Built as a registry, so other banks with similar
public feeds can be added the same way.

### v1.0.81 — Zero stat cards say $0.00

"Spending · Jul" showing just a line was the app's grid convention for
zero ("–") leaking onto a big stat card, where it reads like something's
broken. The dashboard Key numbers now show an explicit $0.00 when a value
is zero, and the Spending card explains its scope — logged expenses only;
recurring bills live in the "Recurring / mo" card and both feed the
"Net" math.

### v1.0.80 — Stat-card progress bars, raises panels, cancelable layout edits

- **Progress bars on the Bills & Subscriptions cards.** Total monthly,
  Total annual, Left after subs, and % of net income each get a slim bar
  showing their share of your net income (red for cost, green for what's
  left; hover for the exact figure). Overspending past 100% fills the bar
  red.
- **The raises page's top sections are panels now** — "Since last raise"
  and "Employer profiles" drag, resize (full/half/quarter, half height),
  collapse, and remove/re-add exactly like dashboard panels, with the same
  vertical packing.
- **"✕ Cancel changes" while editing layouts** — on the Dashboard, Reports,
  and Raises, entering Edit layout now snapshots the arrangement; Cancel
  puts everything back the way it was, while "Done editing" keeps it.

### v1.0.79 — Budget placeholders

New "Budget placeholder" checkbox on bills — for a future cost you know is
coming (the $27 utility that becomes $180 once you move in). It counts
toward Total monthly / annual and the expense grid so your budgeting and
income planning reflect reality-to-be, but it can't be mistaken for an
actual bill: its amounts render with a ~ prefix, and it carries a
clickable "Budget est." tag (filter to see all your placeholders at once,
with the stat cards following).

### v1.0.78 — Salary years fill the Year gross / Year net columns

For annual-salary raises and year records, the salary and its net are the
year figures — but the All Raises table's Year gross / Year net columns
only read the hourly-entry fields, so salary years showed "—" there while
the numbers sat under New gross / New net. Those columns now mirror the
salary figures (slightly muted, with a hover note), matching how the YoY
table and the Actual $/hr math already treated them.

### v1.0.77 — Actual $/hr, honest raise cards, and panels that pack tight

- **Actual $/hr columns on All Raises** (default): year gross ÷ hours
  worked and year net ÷ hours worked — for salary years it uses the salary
  itself, for hourly years the recorded totals, so you see what your time
  really earned either way (hover shows the math).
- **Employer profile adds "Reported year totals"** — gross and net summed
  from the Year gross/net figures entered on raises and year records.
- **"Since last raise" cards fixed** — they anchored to the most recent
  *entry*, so a "no new raise" year record reset the counter. They now use
  the most recent real raise.
- **Panels: quarter width, half height, and no more empty space.** The
  width button now cycles Full → Half → Quarter (half of a half). A new
  ⇕ height button caps a panel at half height (content scrolls inside).
  And the panel grid packs vertically — a short panel snaps up under the
  one above it instead of stretching to its tallest neighbor, killing the
  blank stretches in the screenshot. Works on Reports panels too; phones
  keep the single-column layout.

### v1.0.76 — Dashboard expenses donut matches the grid + % on every pie

- **Expenses by category (YTD) on the dashboard now uses the exact same
  numbers as the expense annual grid** — logged payments plus
  recurring-bill estimates, with all the grid's rules honored (linked
  payments overriding estimates, one-time bills in their due month,
  "not paid this year" exclusions). Previously it counted logged payments
  only, so it disagreed with the grid whenever bills were involved.
- **Every pie/doughnut states each slice's share.** The reports doughnuts
  (income by category, expenses by category, expenses by payment method)
  now append the percentage to each legend label — "Streaming · 70.6%" —
  like the dashboard donuts already did.

### v1.0.75 — Cross-basis previous + readable durations

- **Previous bridges bases via annual totals.** A raise whose prior record
  is on a different basis (e.g. a salary raise following an hourly year)
  no longer shows an empty Previous — when both sides have an annual
  figure (the salary itself, or the hourly year's recorded gross annual
  earned), the comparison runs on those totals: Previous shows the prior
  year's annual figure (/yr), and Change $/% is computed against your own
  annual figure, with a hover explaining it.
- **"At this pay" adds a human breakdown** under the day count —
  "797 days (2 yrs, 2 mo, 5 days)" — for both finished and still-counting
  pay levels.

### v1.0.74 — Flat-year records, orphaned-category rescue, inflation verdicts

- **"No new raise — year record only."** A new checkbox on the raise form
  logs a year where pay stayed flat: same gross/net, plus that year's
  hours and totals. These rows render in a lighter grey in both tables
  (data points, not raises), don't break the "At this pay" duration or the
  raise count, and show as +0% against that year's inflation in the YoY
  table — the honest picture of what a flat year cost you in real terms.
- **Bills with a deleted category are visible again.** A bill or logged
  expense pointing at a category that no longer exists (deleted or merged
  in Settings) used to vanish from the expense grid silently — the likely
  cause of streaming bills not showing. They now appear in a
  "⚠ No matching category" row, counted in totals, with a hover explaining
  to edit them and re-pick a category.
- **Verdict column** on the YoY table: a green "Beat inflation" or red
  "Didn't beat inflation" tag next to the Real figure.

### v1.0.73 — Real-vs-inflation now spans the whole stretch at the old pay

Spotted by use: a raise in 2022 after flat pay since 2018 was being
compared against 2022's inflation alone, making it look like it beat
inflation by a mile when prices had actually been climbing for four years.
The inflation column is now **"Inflation since prior raise"** — the CPI-U
annual averages compounded across every year since the previous raise
("16.5% over 4 yrs", hover for the exact span) — and Real uses the proper
ratio adjustment, (1 + raise) ÷ (1 + inflation) − 1. Raises in consecutive
years behave as before (single-year inflation).

### v1.0.72 — Clarify that inflation is already YoY

The YoY-raises footnote now says explicitly that the inflation column is
itself a year-over-year figure (CPI-U annual average % change vs the prior
year) — the same basis as your raise %, which is what makes the "Real"
column a fair comparison. The header stays as-is since inflation rates are
always quoted YoY; only the explanation needed to say so.

### v1.0.71 — Hours worked on any raise basis

The "Hours worked that year" field now shows for every raise basis — not
just Hourly rate. Salaried (and per-paycheck) folks who track their hours
get the same Hours (yr) and Hours-vs-prior-yr columns, and it shows what a
salary really earned per hour. The year's total-paid fields stay
hourly-only, since a salary already implies them.

### v1.0.70 — Bills search + "Paid for this year"

- **Live search** above the Bills & Subscriptions table — type and the
  table filters as you go (name, vendor, category, subcategory, account,
  frequency, priority, status, notes), with the stat cards following what's
  shown.
- **"Paid for this year" checkbox** next to the renewal date, on by
  default. The Total monthly / annual cards are normalized figures — an
  annual bill renewing next year still counts, assuming this year's charge
  happened. When it didn't (nothing due this calendar year), untick the
  box: the bill drops out of the stat cards and the expense grid until
  January, when the flag resets automatically. Skipped bills show an amber
  "Not paid this year" flag (clickable, like the others).

### v1.0.69 — YoY raises: basis & employment tags, hourly-vs-salary math, hours trend

- **New YoY columns**: "Amounts are" (Per paycheck / Annual salary / Hourly
  rate) and Employment (Full-time / Part-time / …) — both clickable tags.
  Click one to filter the YoY table to just those raises, and the raise-%
  chain **recomputes over what's shown** (a chip explains, ✕ clears).
- **Hourly years compare against salaries properly.** Year gross and Year
  net columns show each year's annual figure — the recorded total for an
  hourly year, the salary itself for a salary year — and when the chain
  crosses from hourly to salary (or back), the raise % is computed on
  those annual totals instead of comparing a $17/hr rate to a $52,000
  salary. The % gets a hover note when it's an annualized comparison.
- **Hours trend**: Hours (yr) shows in the table, with a "Hours vs prior
  yr" % column (+20.0% = worked a fifth more hours than the prior recorded
  year).

### v1.0.68 — Raises follow-ups: honest totals, hourly year figures, tidy tables

- **"Total paid (gross)" now says what it counts.** It always summed every
  recorded paycheck for that employer across all titles — but if older
  years were never entered into Clover, they aren't in the number. The
  line now spells that out ("from N recorded paychecks, all titles — years
  not entered in Clover aren't counted") so a low-looking total is
  explainable at a glance.
- **Hourly raises can record the year's reality.** When a raise's basis is
  Hourly rate, three extra fields appear: hours worked that year, and the
  year's total gross and net pay — things a salary implies but hourly work
  doesn't. Optional table columns (Hours (yr) / Year gross / Year net) and
  CSV columns carry them.
- **YoY table sorts newest-first** by default, matching the raises table
  below it — which now has a proper "All raises" title.

### v1.0.67 — Raises: sortable YoY table, inferred previous, duration that reads right

- **The YoY-vs-inflation table caught up to the table standards** — sortable
  headers with the 3-click cycle and its own ⚙ Columns manager.
- **Inflation data extended back to 2010** (2010–2014 CPI-U annual averages
  added), so raises from those years get their Real (vs inflation) figure.
- **Previous is inferred when left blank.** A raise without a Previous
  amount now assumes the same employer's prior recorded raise (same
  per-check/annual/hourly basis) was the previous pay — shown slightly
  muted with an explanation on hover — which also fills in the Change $/%.
  A new "Doesn't follow the prior raise" checkbox on the raise turns the
  inference off when the comparison doesn't apply, and rides along in the
  CSV as a "Standalone" column.
- **"Since prior raise" became "At this pay."** The duration column now
  reads the way you'd expect: how long each pay level lasted, measured to
  the employer's next raise — and the latest raise counts up to today
  ("1,644 days · counting") since nothing has replaced it yet.

### v1.0.66 — Clickable Priority / Status / Flags filters with live stat cards

- The Priority, Status, and Flags badges on Bills & Subscriptions are now
  clickable, like the colored Category/Frequency/Account tags — click
  "Essential", "Trial", or "Auto-pay" to show only those bills (click
  again or hit ✕ Clear filter to undo).
- The stat cards now follow whatever the table is showing: filter to
  Essential and Total monthly / Total annual / Left after subs / % of net
  income all recompute from just the displayed (active) bills, with a
  "filtered view" note so a narrowed total is never mistaken for the full
  picture.

### v1.0.65 — Employment type on raises

Each raise can now state the employment type as of that pay change —
Full-time, Part-time, Seasonal, Contract, Temporary, or Per diem. It shows
as a colored badge column on the Raises table, on the employer profile
(latest known type), and rides along in the CSV import/export/template.

### v1.0.64 — Hourly raises

The raise "Amounts are" choice gains **Hourly rate** alongside Per paycheck
and Annual salary — for hourly jobs, enter the new (and previous) rate
directly. Amounts show /hr in the table, change $ and % work the same, and
the CSV import/export/template carry it.

### v1.0.63 — Raises: position titles + salary-basis amounts + net

- **Position title on every raise.** Record the title that came with a pay
  change — promotions show up properly now. It's a default table column,
  the employer profile shows your current position, and the CSV
  import/export/template all carry it.
- **Per-paycheck or annual salary.** A new "Amounts are" choice on each
  raise: enter amounts per paycheck (as before) or as annual salary
  figures — the form relabels itself, the table shows /check or /yr next
  to amounts, and change $ / % work either way. Older rows keep meaning
  per-check.
- **New net (optional).** Track your take-home after the raise alongside
  gross, on whichever basis you picked.
- Old raise CSVs still import — the previous "New gross per check" header
  is recognized alongside the new one.

### v1.0.62 — Source drill-downs on Expenses (and Income's Other) + projected income panel

- **Expense categories now show where the money came from.** Expanding a
  category adds one row per source account under the existing subcategory
  rows — e.g. Investments → a row per brokerage the fees were charged to.
- **Drill-down rows are a shade lighter** (label and numbers) so it's clear
  they're detail that's already counted in the rows above — applied to the
  new expense source rows and the income grid's source breakdowns
  (Rewards / Interest / Dividends).
- **Income's "Other" category breaks down by source too** — one row per
  type/description (Lawsuit, Gift, Rebate, a case name…), like Rewards and
  Interest already did.
- **New dashboard panel: 📈 Projected annual income** — projected gross and
  net for the year, from the average of the months elapsed so far (avg / mo
  × 12). It appears at the end of your dashboard automatically; drag it
  where you want it.

### v1.0.61 — Broker-import fees on by default

"Import these fees as expenses" is now ticked by default (untick to leave
them out), and the Fee category dropdown gets the same amber attention
glow — it's pre-filled with your investment-fee category as a best guess,
and the glow stays until you've clicked or changed it, so the guess never
slips through unseen.

### v1.0.60 — Import decisions you can't miss + interest gets its own account

- **Unset decision dropdowns now glow.** Selects in the import flow that
  still sit on their empty default ("— no account —") get an amber
  border + soft glow until you make a choice, so they can't be scrolled
  past. The glow clears the moment you pick something.
- **Money-market interest asks for its own account.** The interest section
  of the broker import previously reused the dividends account silently.
  It now has its own "Record interest under" picker — the cash / sweep
  account is often a different Clover account than the brokerage — and
  the automatic already-recorded skip is judged against that account.

### v1.0.59 — One-time bills, smarter bill fields, links & masked account numbers

- **One-time bills.** The Frequency dropdown gains "One-time (not
  recurring)" — for a bill that happens once (a repair, a deposit, an
  annual event you won't repeat). The date field becomes a plain "Due
  date" that never rolls forward, the bill stays out of the monthly/annual
  recurring totals, shows on the Calendar as "due" (not "renews"), and
  lands in the expense grid only in its due month.
- **Category-aware fields.** The new account-number field renames itself to
  match the category — Policy # for Insurance, Member # for Memberships,
  Loan / account # for Loans & Credit Cards — and an "Interest rate
  (APR %)" field appears only for loan/credit categories (with an optional
  APR column in the table).
- **Vendor URL + Payment URL.** Alongside the existing vendor link there's
  now a Payment URL (where you actually go to pay). A new optional Links
  column shows "Site ↗ / Pay ↗", and a bill's vendor name under its title
  is now a clickable link.
- **Masked customer/account number.** The new Account / customer # field
  shows only •••• and the last 4 digits — in the table, click it to
  reveal/hide; in the edit form it unmasks only while you're clicked into
  the field.

### v1.0.58 — Money Market & Cash / Sweep account types + editable tax-forms list

- **Two new account types**: Money Market and Cash / Sweep — for things
  like a broker's insured money market that holds your uninvested cash.
- **Tax forms are now a managed list.** Settings → Tax forms holds the form
  names offered by every tax-history picker (federal form, state form, and
  itemized form costs). It ships seeded with common federal forms and you
  can add, rename, or remove entries if the IRS changes things — see
  irs.gov/forms-instructions-and-publications for the official catalog.

### v1.0.57 — Ameriprise activity import (dividends, money-market interest, fees)

The broker import now recognizes Ameriprise portfolio-activity CSVs
alongside M1 Finance and Schwab. To get the file: ameriprise.com →
Portfolio → Activity → All transactions, set your date range, download —
the import screen says this too, and has an Ameriprise template download.
What it does with the rows:

- **Dividend payments** import as Dividends income with their ticker, with
  the same duplicate review as other brokers.
- **Money-market interest** (the insured money market / cash sweep) gets
  its own section and imports as Interest income — payments already
  recorded under the chosen account are skipped automatically.
- **Charges** (e.g. quarterly maintenance fees) can come along as expenses,
  defaulting to your investment-fee category.
- **Journals** (transfers between accounts) are never imported.

PDF statements aren't supported — reliably reading numbers out of PDF
layouts isn't something a client-side app can do safely, and the activity
CSV covers the same data for any date range, including past years.

### v1.0.56 — CD maturity reminders a week ahead

CD maturity dates were already on the Calendar; now each CD also gets an
amber reminder event 7 days before it matures ("… matures in 7 days
(Jul 20, 2026)") — enough lead time to decide on rolling over vs.
withdrawing before the bank's auto-renew window closes. Reminders cross
month boundaries correctly (an Aug 3 maturity reminds on Jul 27).

### v1.0.55 — Account dropdowns are always alphabetical

Every account dropdown — Add income, Add expense, a bill's payment and
backup accounts, and the dividend import's "record under" picker — now
sorts accounts A→Z automatically, no matter what order they were added in.
(The institution picker has been alphabetical since v0.3.1; accounts had
been left in insertion order.)

### v1.0.54 — Deduction amounts obviously auto-subtract + Year overview wage deductions

- **Deduction amounts are entered as positive numbers** — Clover subtracts
  them from gross automatically. That was always true but nothing said so;
  now each deduction amount field has a − sign in front of it, an
  "e.g. 150.00" placeholder, and a tooltip spelling it out. If a minus was
  typed (or imported) anyway, it's normalized to positive so the math never
  doubles up.
- **Year overview gains a "Wage deductions" column** — what your paycheck
  jobs withheld each year (taxes, 401(k), insurance…), computed as gross −
  net across recorded paychecks where both amounts are known.

### v1.0.53 — Expense grid: subcategories, honest past years, and Housing for everyone

- **Recurring bills now land on their subcategory rows.** In the expense
  annual grid, a bill assigned to a subcategory (e.g. HOA dues under
  Housing → HOA) shows its monthly estimate on that subcategory's row
  instead of a lump "Recurring bills" line. Bills without a subcategory
  stay in a "↻ Recurring bills (no subcategory)" row. Every amount that
  includes a recurring estimate gets a small ↻ marker (hover it for the
  explanation), so estimates and logged actuals are distinguishable at a
  glance.
- **Year switching on Expenses actually changes the numbers now.** Bills
  have no start/end history, so their estimates were being projected into
  past years identically — switching from 2026 to 2023 looked like nothing
  happened. Recurring estimates now apply from the current year forward;
  past years show logged expenses only, with a note explaining why. Reports
  charts follow the same rule.
- **"Mortgage / Rent" is now "Housing" for existing data too.** v1.0.50's
  seed rename and default subcategories only applied to brand-new accounts.
  A one-time migration now renames your "Mortgage / Rent" group to Housing
  (skipped if you already made your own Housing group) and adds the missing
  default subcategories (HOA, Property Tax, etc.) to seed-named categories —
  purely additive, never touching or renaming anything you created.

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
