# Copay

**Which health plan actually costs less?**

A single-file health insurance cost estimator. Enter the plans you're choosing
between — premium, deductible, out-of-pocket max, visit copays, prescription
tiers — plus what you actually use (your prescriptions and how often you see a
doctor), and Copay shows the true monthly and annual cost of each plan side by
side. It answers the real question: is the plan with the $5-cheaper
prescription still cheaper after its $20-higher premium?

Live: https://dev.rizzo.cc/copay/ · Demo with sample data: add `?demo=1`

## Features (v0.6)

- Compare any number of plans: premium (monthly or per-paycheck), deductible,
  out-of-pocket max, employer HSA/HRA contribution, PCP/specialist/urgent-care
  visits, four prescription tiers, and optional **dental & vision** (premiums
  plus an expected out-of-pocket estimate — so a plan that bundles dental
  competes fairly against one where you'd pay for cleanings in cash)
- Every cost has a **rule**: flat copay or % coinsurance, before or after the
  deductible — so PPOs and high-deductible plans are modeled the way they
  actually work
- **Month-by-month simulation**: "after deductible" costs are charged at full
  price until the deductible is met, then the copay/coinsurance applies, and
  everything stops at the out-of-pocket max
- **Cumulative-cost chart** — one line per plan across the plan year, with a
  hover readout, so you can see exactly where one plan overtakes another
- **What-if slider**: add unexpected billed care (an ER visit, a procedure) and
  watch whether the winner flips; the tipping-point line tells you the exact
  dollar amount where it does
- Prescriptions with per-plan tier assignment (the same drug is often a
  different tier under different insurers), an optional retail price per fill
  (used by deductible/coinsurance rules), or an exact custom cost; fill
  frequency entered per month or per year, whichever is natural
- Winner banner explaining the annual savings and where they come from
- Sortable comparison table, plus a per-prescription cost table by plan
- Worst-case-year column: premiums + out-of-pocket max − employer HSA money
- **History tab** — two ledgers: *saved comparisons* (timestamped snapshots of
  a whole comparison, with an optional "compared with agent" note, loadable
  back into the Compare tab) and *plan years* (what a year you actually lived
  through really cost: premiums paid, medical, prescriptions, deductible used —
  side by side with what the estimate predicted, with the delta called out)
- All data stays in your browser (localStorage). Export/Import JSON for backup;
  a history-only JSON file merges into existing data instead of replacing it
- **Print / PDF** button — a clean, print-formatted report of the whole
  comparison (plans, usage, winner, tables, chart) via the browser's print
  dialog; choose "Save as PDF" there to get a shareable file
- Demo mode (`?demo=1`) with a PPO-vs-HDHP sample — changes aren't saved

## Model notes

Visits and fills are spread evenly across the year (expected-value math), so
the deductible crossover lands where it would on average. Retail prices are
your estimates — GoodRx or a pharmacy receipt for drugs, and rough national
figures for visit prices (defaults provided). The result is a fair comparison
between plans, not a billing-accurate forecast.

## Privacy

No accounts, no server, no analytics. Health and cost data never leaves your
browser unless you export it yourself.

## Changelog

### v0.6.1 - 2026-07-07

Moved house. Copay now lives at dev.rizzo.cc/copay (the dev repo), in one
place and one account - the previous address is
retired. Reminder: data is stored per-site in your browser, so anything
entered at the old address needs a JSON export/import to follow you here.

### v0.6.0 — 2026-07-07

Dental & vision. Real plan decisions are health + dental together — the
monthly bill is one number — so each plan now takes optional dental and
vision premiums (billed the same way as the health premium) plus an expected
yearly out-of-pocket estimate for dental/vision care. It all flows into the
totals, the chart, the worst-case column, and the winner breakdown, and a
Dental column appears in the results whenever any plan has dental costs.

### v0.5.0 — 2026-07-07

The accountability update: a History tab that closes the loop between
"what we predicted" and "what it actually cost." Save a comparison as a
timestamped snapshot (recording whether an agent walked you through it), then
after living with the chosen plan, log the year's real numbers — premiums
paid, medical and pharmacy spending, deductible used — and see the delta
against the prediction. Snapshots can be loaded back into the Compare tab to
re-examine old decisions. Import now merges history-only JSON files, so past
years kept in a spreadsheet can be brought in without touching current plans.

### v0.4.0 — 2026-07-07

Prescriptions can now be entered as fills **per year**, not just per month.
An inhaler you refill twice a year was previously "0.17 fills per month" —
fraction math nobody should have to do. Pick "per year" in the prescription
form and enter the real count; costs are spread evenly across the year either
way. Existing prescriptions keep working unchanged (they carry over as
per-month).

### v0.3.0 — 2026-07-07

Print / PDF export. The JSON export is for backing up your data; this is for
sharing the *answer* — a clean report of the comparison you can save as a PDF
from the browser's print dialog or hand to a spouse/HR. Buttons, sliders, and
tooltips drop out of the printed page; a header line records the date and any
what-if assumption so the numbers can't be misread later. Features header
bumped to v0.2→v0.3 accordingly.

### v0.2.0 — 2026-07-07

The deductible update. v0.1 compared copays directly, which quietly favored
high-deductible plans — it ignored the months where you pay full price before
the deductible is met. v0.2 simulates the whole plan year month by month:
each cost now carries a rule (copay or coinsurance, before or after the
deductible), spending accrues to the deductible and stops at the out-of-pocket
max, and a chart shows each plan's cumulative cost so crossovers are visible.
Also new: a what-if slider for unexpected care with an exact tipping-point
readout, retail prices on prescriptions, and editable full-price assumptions
for visits. Existing saved data upgrades in place (everything defaults to
plain copay rules, matching v0.1 behavior).

### v0.1.0 — 2026-07-07

First release. Built to answer a simple question that plan-comparison sheets
make surprisingly hard: after premiums, prescriptions, and doctor visits, which
plan is actually cheaper per month? Simple mode only for now — copay-based
math with a worst-case column; deductible-aware simulation is next.
