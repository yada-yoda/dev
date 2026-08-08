# Recipes

A personal recipe box, live at **https://dev.rizzo.cc/recipes/**.

Two things it does well:

- **Adding recipes** without fighting the form. You type ingredients the way you'd
  write them on a card — `1 1/2 cups flour` — and the app works out the quantities
  behind the scenes.
- **Cooking from them.** Hit **Start cooking** and the recipe turns into a big-type
  checklist: tap a step to cross it off, the screen stays awake, and your place is
  remembered even if the phone locks or the tab reloads.

Single-file vanilla HTML/CSS/JS, no build step. Deployed as part of the
`yada-yoda/dev` GitHub Pages site.

---

## Signing in

Sign-in uses the **same Google account as the Illness Tracker and PawPrints** —
one login covers all three, and your recipes follow you between your phone, iPad
and computer.

You don't have to sign in. Without an account everything is saved on the device
you're using, and signing in later pulls those recipes up into the cloud.

### One-time setup (owner)

Recipes stores its data in its own place in the shared Firebase project
(`illnesstracker-8d888`), so it can never overwrite the Illness Tracker's data.
That needs one security rule added in the Firebase console, **inside** the
existing `match /databases/{database}/documents { ... }` block, alongside the
rules already there:

```
    // Recipes app — each user reads/writes only their own doc
    match /recipes/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
```

Until that rule is added the app still works — it just keeps everything on the
device and says so once, rather than failing.

---

## How things work

**Ingredients** are stored exactly as you type them. A line that starts with an
amount will scale when you change the servings; a line like `salt and pepper to
taste` simply stays as written and gets a small dot to show it isn't scaling.
End a line with a colon (`For the sauce:`) to turn it into a section heading.

**Scaling** never changes the saved recipe — it's a view. Halving `1 1/2 cups
flour` shows `¾ cup flour`, and units follow the amount, so one stick of butter
becomes two sticks rather than "2 stick".

**Photos** are shrunk and stored inside your recipe data rather than in separate
cloud storage, which keeps the whole thing free and portable. That means they
share a fixed budget — roughly 15–25 photos. The app warns you as it fills up and
stops you before anything breaks. Text-only recipes are effectively unlimited.

**Backups** live under the gear icon: Export writes a `.json` file you can keep
anywhere, Import restores one.

---

## Changelog

### v0.1.0 — 2026-08-08

First release.

The point of this one is the cooking, not the filing. Plenty of things store
recipes; almost none of them are pleasant to actually read from a phone propped
against a canister with batter on your hands. So the cook screen came first: big
type you can read at arm's length, whole steps as tap targets, your place held
even if the screen locks, and ingredient amounts staying visible beside the steps
on an iPad instead of making you scroll back up.

Everything else is in service of that — entering a recipe is deliberately plain
text so it's quick on a phone, and serving scaling exists so a recipe written for
four isn't a math problem when you're cooking for two.

Included: your own recipes with photos, tags and search, servings scaling with
proper kitchen fractions, cook mode with wake-lock and saved progress, printing,
JSON backup and restore, light and dark themes, and Google sign-in shared with
the Illness Tracker and PawPrints.

---

## Regenerating icons

`.scripts/build-icons.py` (Pillow + Segoe UI Emoji) writes the favicon set, the
PWA icons and `og-image.png`. Re-run it if the brand colours or the wordmark on
the social card change:

```bash
python .scripts/build-icons.py
```
