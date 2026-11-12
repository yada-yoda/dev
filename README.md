Static-site host for `dev`. Each subfolder is served at the
corresponding URL path on that domain.

The domain root serves DASH (index.html, v0.2.2 — added a Spyglass
card and refreshed the og.png), a retro terminal-style dashboard of
the active projects — it reads each project's live version at load,
so its cards stay current without manual edits. It lived at `/dash`
in v0.1.0; that path now redirects to the root.

`/projects/` (v0.2.1) is the fuller, modern-dark project index —
now including Clover, PawPrints, PlanMath, and Spyglass. It lists
only visitable dev-hub apps; DASH itself and the public /acting
site are intentionally excluded.
