# acting

Static site source, edited via a self-hosted CMS and mirrored to a
production repo for deployment.

Three pages: `index.html` (the profile), `resources.html` (links and
an action-verb table for other actors), and `reel.html` (the reel page
for agents). All are regenerated from `data/*.yml` by
`.scripts/build-content.py`; see `EDITING.md`.

## Changelog

### v0.14.0 - 2026-09-13

New `/reel` page - the link to send agents. It shows the same reel the
home page's Selected Work block uses (change it once in the CMS and both
update), with a headshot, name, the key stats, a short credits line, and
four buttons: Email, Resume (PDF), Download MP4, Actors Access.

The Resume button prints the exact same one-page resume as the home page.
Rather than building a second copy, the build lifts the finished resume
out of the home page and drops it into /reel, so the two can never drift.

Sending a personalised link works out of the box: add `?from=bigmouth`
(any short tag) and every view, play, halfway mark, completion, download
and resume print is recorded in Analytics with that tag, so you can see
which agency actually opened it. The page has its own visit counter in the
footer, separate from the home page's.

Four jump-to-clip chips sit under the video, one per scene in the reel
(the cut points were found by scene detection and checked frame by
frame). They are editable in the CMS under Reel Page, and clicking one is
recorded in Analytics too, so you can see which clip an agency skipped
to. The reel now has a poster frame on both pages, and /reel carries
video structured data so Google can show it as a video result.

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
