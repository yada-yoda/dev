# acting

Static site source, edited via a self-hosted CMS and mirrored to a
production repo for deployment.

Two pages: `index.html` (the profile) and `resources.html` (links and
an action-verb table for other actors). Both are regenerated from
`data/*.yml` by `.scripts/build-content.py`; see `EDITING.md`.

## Changelog

### v0.12.0 - 2026-09-08

New `/resources` page for other actors, replacing the old blog post.
It carries the casting, background and stand-in groups, casting
offices, submission sites, classes, and community links, plus the
Action Verbs list as a filterable table. Everything on it is editable
in Decap under "Resources Page" (page copy, links, verbs), and the
build/sync Actions now regenerate and publish it alongside the home
page. The top nav gains a Resources item.
