# acting

Static site source, edited via a self-hosted CMS and mirrored to a
production repo for deployment.

Two pages: `index.html` (the profile) and `resources.html` (links and
an action-verb table for other actors). Both are regenerated from
`data/*.yml` by `.scripts/build-content.py`; see `EDITING.md`.

## Changelog

### v0.13.0 - 2026-09-09

An old-school visit counter now sits next to the version in the footer
of both pages. It reads "46 visits" and ticks up as people arrive.

The count is real, not decorative. It starts from the 46 sessions
analytics already recorded for rizzo.cc, and from here it counts one
visit per person per browser session. Devices that opted out of
analytics with `?ga=off` are not counted, so the number stays in step
with what analytics reports rather than drifting into a second, larger
tally of its own. Only the live site can add to it, so previewing the
staging copy shows the count without inflating it.

If the counter is ever unreachable the footer simply shows the version
on its own, with nothing broken or half-drawn in its place.

### v0.12.0 - 2026-09-08

New `/resources` page for other actors, replacing the old blog post.
It carries the casting, background and stand-in groups, casting
offices, submission sites, classes, and community links, plus the
Action Verbs list as a filterable table. Everything on it is editable
in Decap under "Resources Page" (page copy, links, verbs), and the
build/sync Actions now regenerate and publish it alongside the home
page. The top nav gains a Resources item.
