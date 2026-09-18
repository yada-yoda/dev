# acting

Static site source, edited via a self-hosted CMS and mirrored to a
production repo for deployment.

Three pages: `index.html` (the profile), `resources.html` (links and
an action-verb table for other actors), and `reel.html` (the reel page
for agents). All are regenerated from `data/*.yml` by
`.scripts/build-content.py`; see `EDITING.md`.

## Changelog

### v0.15.1 - 2026-09-18

Vocal range added (CMS: Key Skills > Vocal range). It leads the Special
Skills list on the site and the printed resume as "Vocal Range: B♭2–E4",
which is where an on-camera resume carries it - the header stats stay
what the camera sees. Notes only, no voice type: that is for a voice
teacher to assign, not to infer from the notes. The printed stats row
also now sizes its columns to however many cells it has, so any stat
added later widens the row instead of wrapping onto a second line.

### v0.15.0 - 2026-09-15

A headshot can now be downloaded as a print-ready PDF. A PDF tile sits at
the end of the thumbnail row under the headshot - same size as the
thumbnails, with a document icon - and clicking it downloads the file, so
an agent who wants the headshot for a submission has it in one click
instead of asking. Each look can have its own PDF (CMS: Headshots > Look
> Headshot PDF); the tile only appears once the file is actually there,
so a half-finished CMS edit can never leave a broken link on the page.
Downloads are recorded in Analytics as `headshot_download`.

The navy dress shirt is now the main headshot. The printed resume used to
carry its own hard-coded photo; it now takes whichever look is first in
the Headshots list, the same as the page and the /reel thumb, so changing
the main photo once in the CMS changes it everywhere.

Key Skills now ends on a light closer - one true, specific line so the
list finishes on a human note - on the site and the printed resume alike;
it is the last item in the skills paragraph. There is also an optional
site-only tail (CMS: Key Skills > Site-only closer) for anything that
should show on the page but stay off the PDF; it is empty for now.

### v0.14.0 - 2026-09-13

New `/reel` page - the link to send agents. It shows the same reel the
home page's Selected Work block uses (change it once in the CMS and both
update), with a headshot, name, the key stats, and four buttons: Email,
Resume (PDF), Download MP4, Actors Access. A credits line under the stats
is available but switched off, since not every recent credit is in the
reel.

The page is deliberately bare: no top navigation, just the video and
what an agent needs next. It is link-only: not in the site menu, not in
the sitemap, and marked noindex, so the only way anyone reaches it is
the link you send. That also keeps the view counter honest - every view
is someone you sent there.

Training entries now name the school in full, "The Second City Training
Center", on the site and the printed resume.

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
