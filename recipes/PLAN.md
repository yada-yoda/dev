# Recipes — Implementation Plan

**Plan v1 — 2026-08-08**
Target: `https://dev.rizzo.cc/recipes/` · Repo: `yada-yoda/dev` monorepo, `T:\ClaudeCodeRepo\dev\recipes\`
Builder: Opus 5 agent. This document is the spec; where it is silent, follow PawPrints
(`T:\ClaudeCodeRepo\dev\pawprints\index.html`) conventions, but do not import PawPrints features.

---

## Product summary

Recipes is a personal recipe box: each signed-in user keeps their own collection of recipes,
entered by hand or pasted from anywhere, and then actually *cooks* from them on a phone propped
on the counter or an iPad on a stand. Two modes matter: a low-friction capture/edit mode for
sitting-down entry, and a big-type, greasy-finger-proof Cook Mode that is the reason this app
exists. Sign-in is the same Google login already used by the Illness Tracker and PawPrints
(same Firebase project, same uid), the app works fully offline-ish via localStorage when signed
out, and everything ships as one vanilla `index.html` with no build step.

---

## Design decisions

Each call below is final unless listed under Open Questions.

1. **Single-file vanilla `index.html`, compat-CDN Firebase, lazy Firestore.** House architecture;
   copy the exact loading pattern from PawPrints: `firebase-app-compat.js` + `firebase-auth-compat.js`
   (v10.12.0, `defer`, top of `<body>`), Firestore lazy-loaded via an `ensureFirestore()` clone.
   No other CDN libraries — Recipes needs no jsPDF/xlsx/Chart.js/html2canvas.

2. **Reuse the Illness Tracker Firebase project verbatim.** Same `FIREBASE_CONFIG` as PawPrints
   (project `illnesstracker-8d888`; copy the object from PawPrints line ~696). `dev.rizzo.cc` is
   already an authorized domain, so the only console work is one security rule (below). One Google
   login = same uid across sick / pawprints / recipes.

3. **One Firestore doc per user: `recipes/{uid}`, whole-doc set, merge-by-id on sign-in.**
   Matches the proven PawPrints sync (single `set()` with `updatedAt` serverTimestamp; on sign-in,
   remote wins per-recipe by `id`, local-only recipes appended, then pushed back up). One rule, one
   read on load, zero migration risk. *Consequence:* Firestore's 1MB doc limit becomes the photo
   budget — see decision 6.

4. **Ingredients are stored as raw text lines; structure is parsed at render time, never at entry
   time.** Each ingredient is `{ raw: "1 1/2 cups flour, sifted" }`. A pure function
   `parseIngredient(raw)` extracts `{qty, unit, item}` on the fly for scaling and display.
   Why: forcing qty/unit/item fields is exactly what makes recipe entry miserable on a phone;
   raw lines are typeable, pasteable, and reorderable. Parsing "number + optional fraction +
   known unit + rest" covers the overwhelming majority of real lines; when the parser fails, the
   line simply displays as-is and doesn't scale (marked with a subtle dot, tooltip: "Couldn't read
   a quantity here, so this line won't scale"). We get serving-size scaling without paying the
   structured-entry tax.

5. **Steps are an ordered array of plain strings.** One textarea line-per-step in the editor,
   reordered with up/down arrow buttons (drag-and-drop on touch is fiddly and error-prone with
   wet hands and small handles; arrows always work). No per-step photos, no rich text.

6. **Photos: one optional photo per recipe, canvas-downscaled base64 JPEG inline in the doc —
   512px longest edge, quality 0.78 (~40–70KB), with a doc-size budget guard.** Inherits the
   PawPrints no-Firebase-Storage constraint but bumps the size (256px is a thumbnail; a recipe
   hero photo needs to look appetizing on an iPad). The app tracks estimated doc size
   (`JSON.stringify(data).length`); at >800KB it toasts a warning, and it refuses to attach a new
   photo that would push past ~950KB ("Photo budget is full — remove a photo from another recipe
   first", shown in a modal since it's a real decision). Text-only recipes are effectively
   unlimited. This comfortably covers a personal box with 15–25 photographed recipes; if the
   owner ever wants photos on everything, M3 has the migration path.

7. **Editor is a full view, not a modal.** Recipe entry is long-form (title + tags + times +
   N ingredient lines + N steps + photo); nesting that in a 90vh scrolling modal on iOS invites
   scroll-trap misery. Modals stay for what the house uses them for: confirmations, paste-import,
   Settings. House modal rules apply everywhere (no backdrop-close, X/Cancel/confirm only).

8. **Editor drafts autosave to localStorage.** Every input event debounce-writes the in-progress
   recipe to `recipes_draft`; if the tab dies mid-entry (mobile browsers love doing this), the
   editor offers to restore. Cheap insurance for the exact failure mode phones have.

9. **Paste-to-import (M2) lands in the editor, never straight to save.** One textarea; the parser
   splits on "Ingredients"/"Directions|Instructions|Steps|Method" headers when present, else
   classifies lines heuristically (starts with digit/fraction/bullet → ingredient; sentence-length
   prose → step). Result pre-fills the normal editor for human touch-up. No URL scraping — CORS
   makes fetching arbitrary recipe pages impossible from a static page, and a proxy worker isn't
   worth it yet (Out of scope).

10. **Ingredient section headers via a trailing colon.** A line ending in `:` ("For the sauce:")
    renders as a subheading in both detail and cook mode, and is never parsed or scaled. Free,
    pasteable, no extra UI.

11. **Cards, not tables.** A recipe list is not tabular data; the home view is a responsive card
    grid (`repeat(auto-fill, minmax(min(240px, 100%), 1fr))` — the `min()` guard enforces the
    no-horizontal-scroll rule at any width). Because there are no tables, the sortable-columns /
    Columns-manager standard doesn't apply; sorting is a single dropdown (Recently added · A–Z ·
    Recently cooked).

12. **Search and tags, no folder taxonomy.** Client-side substring search across title,
    ingredients, and tags; free-form tags with autocomplete from tags already in use, rendered as
    filter chips on the home view. A personal corpus is small enough that this always feels
    instant, and folders are where recipes go to be lost.

13. **Serving scaling is presets + a stepper, applied live in detail and cook mode.** Base
    servings stored per recipe; UI offers ×½ · ×1 · ×1.5 · ×2 chips plus a −/+ servings stepper.
    Scaled quantities render as kitchen fractions (¼ ⅓ ½ ⅔ ¾, mixed numbers) with decimal
    fallback to 2 significant digits. Scaling never mutates the stored recipe.

14. **Sharing = "Copy as text" (share sheet where available), not links.** The domain is personal
    and noindexed, and every recipe is behind the owner's uid — a URL would be useless to a
    recipient. `navigator.share` with a cleanly formatted plain-text recipe (title, ingredients,
    numbered steps), clipboard fallback with a toast. Anything fancier is out of scope.

15. **Print via `@media print` stylesheet on the detail view + `window.print()`.** Recipes are
    the canonical print-me artifact. A print stylesheet is ~40 lines of CSS and zero bytes of
    CDN; jsPDF (300KB) buys nothing here. Print layout: title, meta line, two-column
    ingredients, numbered steps, no nav/buttons/photo-optional.

16. **Offline = localStorage mirror, no service worker.** `recipes_data` is written on every
    persist (signed in or not), so data survives and the app works signed-out; the app *shell*
    still needs network on a cold load, same as every sibling app. A SW is deliberately deferred
    (house has never shipped one; getting cache invalidation wrong on a no-build-step site is a
    real footgun). Cook-mode check state also lives in localStorage so a reload mid-cook loses
    nothing.

17. **Theme: light default, dark available.** Kitchens are bright and the propped-phone use case
    is usually daylight; light-on-dark glare loses to dark-on-light legibility at arm's length.
    Same CSS-var + `data-theme` + anti-FOUC mechanism as PawPrints, localStorage key
    `recipes_theme`, theme also mirrored into `settings.theme` for cross-device sync. Palette:
    warm paper white `#faf7f2` background, ink `#221d17` text, terracotta accent `#c2571b`
    (dark theme: `#141210` / warm off-white / same terracotta). Fonts: DM Sans body + JetBrains
    Mono for version stamps, loaded with the house non-blocking trick. Icons: Material Symbols
    Outlined as inline SVG path data (`ICONS` map + `svgIcon()`), no icon font.

18. **House chrome, exactly:** toasts top-center (emoji-prefixed strings, passive only); real
    decisions (delete recipe, photo budget, import-replace) get modals; tooltips on every
    non-obvious field explaining intent; `APP_VERSION` const stamped in header, footer, and
    `document.title`; no GitHub link in the UI; no owner name or location anywhere; per-page
    `<meta name="robots" content="noindex, nofollow">` (dev.rizzo.cc stays out of indexes —
    note PawPrints lacks this meta; Recipes must include it).

19. **v0.1.0 ship kit:** favicon set (32/16/ico/apple-touch/webmanifest), real 1200×630
    `og-image.png` referenced at the absolute URL `https://dev.rizzo.cc/recipes/og-image.png`,
    semver in the page title, README with a human-readable changelog. GA4 (with the standard
    `?ga=off` localStorage opt-out) is M2, not M1 — the domain is noindexed and the only visitor
    is the owner, so analytics is a nice-to-have.

20. **Demo mode (M2):** `?demo=1`, same backup/restore + write-gating pattern as PawPrints, with
    6–8 built-in sample recipes (at least one with sections, one with unparseable ingredient
    lines, one photographed) so the demo doubles as a parser test fixture.

---

## Cook Mode spec

Cook Mode is a distinct full-screen state entered from the recipe detail view via a large
**Start cooking** button. It owns the viewport: nav and footer hidden, chrome minimal. Exit via
a persistent button (below). Entering acquires a Wake Lock; exiting releases it.

### Shared behavior (all form factors)

- **Full scrolling step list, not one-step-at-a-time cards.** Cooks jump back and forth
  ("wait, how much was resting?"); swiping through a card deck with buttery fingers is worse
  than scrolling, and a glanceable list gives context of what's next. Steps are large
  tap-anywhere cards.
- **Tap a step to check it off.** The entire card is the tap target (min height ~64px). Checked
  steps dim to ~45% opacity with a leading check icon — no strikethrough (must stay readable if
  the cook needs to re-read a done step). Tapping again unchecks.
- **The first unchecked step is "current":** accent left border, slightly larger type, faint
  accent background tint. It is *not* auto-scrolled to — the cook controls the scroll; the
  highlight just makes the place findable at a glance from three feet.
- **Check state persists** per recipe in localStorage (`recipes_cook_{recipeId}`:
  `{checkedSteps:[], checkedIngredients:[], servings, startedAt}`). Survives reload, tab kill,
  accidental navigation. A **Reset** control (in the cook header, behind a confirm modal —
  losing mid-cook progress is a real decision) clears it; state auto-expires after 12 hours.
- **When the last step is checked:** toast "Cooked — enjoy!", `lastCookedAt` set to today,
  state cleared on exit.
- **Type scale:** phone base 20px, step text 22px/1.45, current step 24px; iPad/desktop step
  text 24px, current 26px. Ingredient lines 19–20px. High contrast: cook mode pins text to full
  `--text-primary` (no muted grays for content), quantities rendered in semibold accent so
  amounts pop when glancing.
- **Serving scaling** lives in the cook header (stepper + ×½/×1/×1.5/×2 chips) and re-renders
  ingredient quantities live. Chosen scale persists in the cook state.
- **Ingredients are checkable too** (shopping-style), same persistence.
- **Wake Lock:** `navigator.wakeLock.request('screen')` on entry; re-acquire on
  `visibilitychange` (the lock is released whenever the tab backgrounds); passive toast once —
  "Screen will stay awake while you cook". On unsupported browsers, fail silently (no nag).
- **Timer chips (M2):** durations in step text matched by
  `/(\d+(?:[–-]\d+)?(?:\s*(?:to|or)\s*\d+)?)\s*(?:hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/i`
  render as inline tappable chips; tapping starts a countdown shown as a floating pill,
  bottom-right thumb zone, with pause/dismiss; completion = vibration (`navigator.vibrate`) +
  short WebAudio beep + the pill flashing until dismissed. One active timer at a time in M2;
  multiple timers only if trivially easy.

### Phone portrait (≤ ~640px)

- **Header (sticky, slim, ~52px):** recipe title (truncates with ellipsis — the one place
  truncation is allowed, full title is one scroll away), Reset, Exit.
- **Body:** the step list, edge-to-edge cards, generous 16px gutters.
- **Bottom bar (fixed, ~64px, thumb zone):** left — **Ingredients** pill with a badge showing
  `remaining/total` unchecked; center — servings control (compact `− 4 +`); right — Exit (and
  the timer pill floats just above this bar). All targets ≥48px.
- **Ingredients pill opens a bottom half-sheet** (~55% viewport, drag-handle visual, scrolls
  internally) listing checkable ingredients at 20px. It overlays the steps rather than
  navigating away — close via the pill again or its X (never by tapping the dimmed area, per
  house modal rules). Why a sheet and not a split screen: a phone portrait doesn't have the
  width for two panes, and cooks consult ingredients in bursts, not continuously.

### iPad landscape / desktop (≥ ~900px)

- **Two panes:** fixed left column (~320–360px) = ingredients (checkable, scaled, sections
  honored) with the servings control pinned at its top; right pane = the step list, each pane
  scrolling independently (`minmax(0,1fr)` on the grid so nothing ever forces horizontal
  scroll). This is the on-a-stand layout: quantities stay visible while reading steps —
  the single biggest cooking-experience win.
- Header spans both panes: title (no truncation needed at this width), Reset, Exit.
- iPad portrait (~641–899px) uses the phone layout with the larger type scale.

---

## Data model

Top-level Firestore doc `recipes/{uid}` (single doc, whole-doc `set()`):

```json
{
  "recipes": [
    {
      "id": "r_1723140000000",
      "title": "Weeknight Chicken Piccata",
      "tags": ["dinner", "chicken", "quick"],
      "servings": 4,
      "prepMin": 15,
      "cookMin": 20,
      "source": "https://example.com/piccata or 'Grandma's card'",
      "photo": "data:image/jpeg;base64,... or null",
      "ingredients": [
        { "raw": "For the chicken:" },
        { "raw": "2 boneless chicken breasts, halved" },
        { "raw": "1/2 cup all-purpose flour" },
        { "raw": "For the sauce:" },
        { "raw": "1/4 cup lemon juice" },
        { "raw": "2 tbsp capers, drained" },
        { "raw": "salt and pepper to taste" }
      ],
      "steps": [
        "Pound chicken to even 1/2-inch thickness and season.",
        "Dredge in flour, shaking off excess.",
        "Sear 3-4 minutes per side until golden; remove.",
        "Deglaze with lemon juice, add capers, simmer 2 minutes.",
        "Return chicken, spoon sauce over, serve."
      ],
      "notes": "Double the sauce. Serve over angel hair.",
      "createdAt": "2026-08-08",
      "updatedAt": "2026-08-08",
      "lastCookedAt": null
    }
  ],
  "settings": { "theme": "light" },
  "updatedAt": "<serverTimestamp>"
}
```

Notes for the builder:

- `id`: `'r_' + Date.now()` (house style). Dates are ISO `YYYY-MM-DD` strings except the
  top-level `updatedAt` serverTimestamp.
- `ingredients[].raw` is the only stored ingredient field. `parseIngredient(raw)` →
  `{qty:Number|null, unit:String|null, item:String, isHeading:Boolean}`; heading = trailing
  `:`. Parser handles integers, decimals, ASCII fractions (`1/2`), mixed (`1 1/2`), unicode
  fractions (`½` etc.), and ranges (`2-3`, scaled as a range). Unit dictionary: cup(s), tbsp,
  tablespoon(s), tsp, teaspoon(s), oz, ounce(s), lb(s), pound(s), g, gram(s), kg, ml, l,
  liter(s), clove(s), can(s), stick(s), pinch, dash, slice(s), piece(s). Unknown unit → unit
  null, qty still scales.
- `servings` is the scaling base; if 0/absent, scaling controls are hidden for that recipe.
- localStorage keys: `recipes_data`, `recipes_theme`, `recipes_draft`,
  `recipes_cook_{recipeId}`, (M2: `recipes_noga`).
- Sync: clone PawPrints' `saveLocal`/`loadLocal`/`persist`/`saveToFirestore`/
  `loadFromFirestore` shape, with the merge-by-id array being `recipes` only and
  `settings` merged `Object.assign` (local wins). If the Firestore write is denied (rule not
  pasted yet), set `cloudSaveOk=false` and toast once: "Cloud sync is off — data is saved on
  this device only."

---

## Firestore rule

Paste **inside** the existing `match /databases/{database}/documents { ... }` block in the
`illnesstracker-8d888` console (alongside the existing Illness Tracker / PawPrints rules —
do not touch those):

```
    // Recipes app — each user reads/writes only their own doc
    match /recipes/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
```

Until this is pasted, the app runs in localStorage-only mode with the one-time toast above.
The README must include this rule block and the one-sentence paste instruction.

---

## Screens / views

Nav tabs: **Recipes · Add · Settings** (Settings may be a header gear opening the house
Settings modal instead of a tab — builder's choice; everything else below is fixed).
View switching = PawPrints `switchView()` pattern (`#view-*` divs, `.hidden` toggle).

1. **Recipes (home).** Search input (debounced substring over title/ingredients/tags), tag
   filter chips (from tags in use, multi-select AND), sort dropdown (Recently added · A–Z ·
   Recently cooked), card grid. Card: photo (or a flat accent placeholder with the recipe's
   initials — no stock art), title (wraps, never truncates), tag chips, "⏱ 35 min total" line,
   subtle "cooked Aug 2" if `lastCookedAt`. Tap card → Detail. Empty state: friendly prompt
   with Add and (M2) Paste buttons.

2. **Detail.** Title; meta row (servings, prep/cook/total time, source — URLs render as a
   domain-labeled link); photo; serving scaler (chips + stepper, live); ingredients (scaled,
   sections honored, unparsed-line dot markers with tooltip); numbered steps; notes. Actions:
   **Start cooking** (primary, large), Edit, Print, Copy as text (M2), Delete (confirm modal:
   "Delete 'X'? This can't be undone." — Cancel / Delete).

3. **Editor (Add / Edit) — full view.** Fields: Title; Tags (chip input with autocomplete);
   Servings (number); Prep min / Cook min (numbers); Source (tooltip: "Where this came from —
   a URL or just 'Mom'. So future-you knows which version this is."); Photo (file input →
   512px/0.78 canvas downscale, preview, Remove); Ingredients — one input per line with
   add-line-on-Enter, up/down reorder arrows, × remove, placeholder "2 cups flour — or end
   with : for a section header" (tooltip explains headers and that quantities enable scaling);
   Steps — one textarea per step, auto-grow, same reorder/remove controls; Notes textarea.
   Save / Cancel sticky at bottom. Draft autosave + restore offer. All grids `minmax(0,1fr)`;
   inputs full-width on mobile; no field ever narrower than its value.

4. **Paste-import modal (M2).** Wide modal: one big textarea, "Parse" → closes into the Editor
   pre-filled, with a passive toast reporting what it found ("Found 9 ingredients and 6 steps —
   check them over"). Never saves directly.

5. **Settings (modal).** Account (Google sign-in/out, house `updateAuthUI` pattern); theme
   toggle; Export JSON / Import JSON (import = confirm modal, full replace over defaults, house
   pattern); demo link (M2); version + changelog link to README on the Pages site? — no repo
   link, so version text only; photo-budget meter ("Photos: 412KB of ~950KB used") once any
   photo exists.

6. **Cook Mode.** As specced above. Not a nav tab — entered from Detail only.

---

## Milestones

### M1 — v0.1.0, shippable
- Shell: head/meta (noindex, OG absolute URL, canonical, theme-color), favicon set, webmanifest,
  og-image.png, fonts, `ICONS`/`svgIcon`, CSS vars + light/dark + anti-FOUC, `APP_VERSION`
  stamped in header/footer/title.
- Auth + sync: FIREBASE_CONFIG reuse, deferred compat scripts, `ensureFirestore()`, popup
  Google sign-in, `recipes/{uid}` whole-doc sync with merge-by-id, localStorage fallback +
  one-time "device only" toast, export/import JSON.
- Recipes home: card grid, search, tag chips, sort dropdown, empty state.
- Editor view: all fields, line editors with reorder arrows, photo pipeline + budget guard,
  draft autosave/restore.
- Detail view: full render, serving scaler, ingredient parser + fraction formatting, print
  stylesheet + Print button, delete confirm.
- Cook Mode: full spec above minus timer chips — big-type checklist, current-step highlight,
  persistent check state + Reset, Wake Lock, phone bottom bar + ingredients half-sheet,
  iPad/desktop two-pane, serving scaling.
- README with changelog entry (the "why": first release of the personal recipe box with a
  counter-ready cook mode) + Firestore rule paste instructions.

### M2
- Paste-to-import parser + modal.
- Timer chips + floating countdown (vibration + beep).
- Copy as text / `navigator.share`.
- Demo mode (`?demo=1`, sample recipes as parser fixtures).
- `lastCookedAt` surfacing (Recently cooked sort + card hint) — set logic ships in M1.
- Tag autocomplete polish; GA4 with `?ga=off` opt-out.

### M3 (only if appetite proves out)
- Per-recipe subcollection migration (`recipes/{uid}/items/{id}`) if the photo budget actually
  gets hit in practice — removes the 1MB ceiling at the cost of N reads + a rules change.
- Household sharing (pending Open Question 2).
- Service worker for true offline app-shell, if cook-mode-without-signal turns out to be real.

---

## Out of scope for now

- **Recipe URL scraping/import** — CORS blocks fetching third-party pages from a static site; a
  proxy worker is a whole project. Paste-import covers 90% of the value.
- **Meal planning, grocery lists, nutrition, ratings** — different products; the ask is a
  readable recipe box.
- **Firebase Storage for photos** — house constraint; inline base64 with a budget is enough for
  a personal collection.
- **Multi-user collaboration / share links** — noindexed personal domain makes links useless;
  Copy-as-text covers sending Mom a recipe.
- **PDF export** — print CSS does the job with zero CDN weight.
- **Voice control / step read-aloud** — tempting for wet hands, but speech APIs are flaky in
  exactly the noisy-kitchen conditions that matter; tap-anywhere cards are the reliable answer.

---

## Open questions — RESOLVED 2026-08-08

1. **Photos: "some recipes, not all."** Confirmed — inline base64 with the doc-size budget guard
   stays as specced (decision 6). Per-recipe subcollection migration remains parked in M3.
2. **Private per account.** Confirmed — each Google account gets its own `recipes/{uid}`
   collection. No share-code model in M1. Household sharing stays in M3 if appetite appears.
