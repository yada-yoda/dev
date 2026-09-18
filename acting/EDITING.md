# Editing rizzo.cc without Claude

This guide is for making content updates to the site directly &mdash; in
GitHub&rsquo;s web editor, on a phone via the GitHub app, or in any text editor
&mdash; without needing AI assistance.

## Two editing paths

Almost all visible content has a **second option**: the Decap CMS at
`https://dev.rizzo.cc/acting/admin/`. Form fields, no HTML required.

| Content | Decap CMS collection | Data file |
|---|---|---|
| Hero photos + quotes | Hero (Slideshow) | `data/hero.yml` |
| Headshot looks (large photo + thumbnail row) and the optional downloadable headshot PDF per look | Headshots | `data/headshots.yml` (PDFs live in `assets/headshots/`; the PDF tile only renders once the file exists) |
| Bio paragraph | Bio | `data/bio.md` |
| RIZZO definition + pull quote | About | `data/about.yml` |
| Film / TV / Theater credits | Credits | `data/credits.yml` |
| Training entries | Training | `data/training.yml` |
| Physical / Languages / Measurements / Licensing / Skills / Favorite Films / Inspirations | Stats, Skills &amp; Influences | `data/panels.yml` |
| Email, socials, contact copy | Contact, Socials | `data/contact.yml` |
| The reel itself (file or YouTube/Vimeo embed, poster, length) &mdash; used by the home page AND `/reel` | Reel | `data/reel.yml` |
| Resources page: copy + SEO, link list, Action Verbs | Resources Page | `data/resources-page.yml`, `data/resources-links.yml`, `data/resources-verbs.yml` |
| Reel page: copy + SEO, facts line, chapter chips, button labels | Reel Page | `data/reel-page.yml` |
| Everything else (CSS, layout, structural HTML) | &mdash; | `index.html`, `resources.html`, `reel.html` |

**When you edit through Decap or the data files**, a GitHub Action
regenerates `index.html` automatically within ~60 seconds. Don&rsquo;t
edit the marked sections in `index.html` directly &mdash; your
change will be overwritten the next time the build runs. Edit the
data file instead.

For STRUCTURAL content not in any data file (version string, GA4 ID,
page meta, JSON-LD schema, layout CSS), keep using the HTML EDIT
markers in `index.html`. Those aren&rsquo;t touched by the build script.

## Adding a film credit (Decap path &mdash; recommended)

1. Visit `https://dev.rizzo.cc/acting/admin/`
2. Log in with GitHub
3. Credits collection &rarr; **+ Add Film credit** at the top of the Film list
4. Fill the fields (Title, Year, Type, Role, Director, optional IMDB tt ID)
5. **Publish** &rarr; GitHub commits the YAML, Action regenerates HTML
6. Note: the JSON-LD `Movie` schema in `index.html` is **not** auto-regenerated;
   it&rsquo;s a small block to keep in sync manually under `EDIT: json-ld`
   if SEO completeness matters.

## How to find the right block

Every editable area in `index.html` is wrapped in a comment marker pair:

```html
<!-- EDIT: bio -->
  ... the content lives here ...
<!-- /EDIT: bio -->
```

To find the block you want, **search the file for `EDIT: <name>`** &mdash;
GitHub&rsquo;s web editor has a search box at the top.

## Marker reference

| Search term | What it edits | Mirror in print resume? |
|---|---|---|
| `EDIT: site-meta` | Page `<title>` and `meta description` (Google search results) | &mdash; |
| `EDIT: og-tags` | Open Graph tags (Slack / iMessage / Twitter link previews) | &mdash; |
| `EDIT: json-ld` | Structured data for search engines &amp; LLMs (advanced) | &mdash; |
| `EDIT: hero-quotes` | Rotating slogans on the home page | &mdash; |
| `EDIT: rizzo-definition` | The &ldquo;Not a Jerky Boy&rdquo; numbered list | &mdash; |
| `EDIT: pull-quote` | The &ldquo;Random Girl, 2023&rdquo; pull quote | &mdash; |
| `EDIT: bio` | Centered short bio paragraph | &mdash; |
| `EDIT: profile-intro` | Paragraph next to the headshot | &mdash; |
| `EDIT: socials` | Instagram / Letterboxd / IMDb / Actors Access / Email links | &mdash; |
| `EDIT: physical` | Age range, height, eyes, hair, vocal range, tattoos, piercings | `EDIT: print-stats` |
| `EDIT: languages` | Spoken languages list | `EDIT: print-languages` |
| `EDIT: measurements` | Shoe / shirt / coat / etc. | `EDIT: print-stats` (Suit cell) |
| `EDIT: licensing` | License, passport, TSA, union, local hire | `EDIT: print-licensing` |
| `EDIT: training` | Acting / improv / school training entries | `EDIT: print-training` |
| `EDIT: skills` | Long Special Skills list | `EDIT: print-skills` |
| `EDIT: favorite-films` | The five favorite films list | &mdash; |
| `EDIT: inspirations` | The director-influences list | &mdash; |
| `EDIT: film-credits` | Film credits table on the website | `EDIT: print-film-credits` |
| `EDIT: tv-credits` | TV credits table on the website | `EDIT: print-tv-credits` |
| `EDIT: theater-credits` | Theater / Sketch / Improv table | `EDIT: print-theater-credits` |
| `EDIT: commercial-credits` | Commercial table (placeholder; PDF skips this) | &mdash; |
| `EDIT: print-header` | Name + ACTOR + Email/Web/Local Hire on PDF | &mdash; |
| `EDIT: resume-year` | Year used in the PDF download filename | &mdash; |
| `EDIT: ga4` | Google Analytics tracking ID | &mdash; |

### Resources page (`resources.html`)

The `/resources` page is built the same way from three data files. Its
markers are `EDIT: res-meta`, `res-og`, `res-json-ld`, `res-hero`,
`res-rail`, `res-sections`, `res-verbs`, `res-source`, `res-quote`,
plus the shared `menu`, `footer`, and `ga4` blocks. All are regenerated
by the build, so edit the data files (or the Resources Page collection
in Decap), not the HTML.

| Want to... | Edit |
|---|---|
| Add, remove, or reorder a link | `data/resources-links.yml` &rarr; find the section &rarr; group &rarr; add an entry (name, desc, url, kind, private) |
| Add a whole new section or filter chip | Add a section (id, title, chip, groups) to `data/resources-links.yml`. The chip and its count appear automatically. |
| Change the "Updated" date, intro, or closing quote | `data/resources-page.yml` |
| Add a verb to the Action Verbs table | `data/resources-verbs.yml` (keep alphabetical) |
| Add a menu link to the page | `data/menu.yml` &rarr; `url: "resources"` (already there) |

Link `kind` values: `fb`, `web`, `gov`, `school`, `book`. Anything else falls back to the Website pill.

### Reel page (`reel.html`)

The `/reel` page is the link you send agents. It is deliberately bare:
no top bar and no site menu, so the video is the whole page. It is
link-only on purpose: not in `data/menu.yml`, not in `sitemap.xml` or
`llms.txt`, and the build writes a `noindex` robots tag. Don&rsquo;t add
it back to any of those, and don&rsquo;t block it in `robots.txt` either
(a crawler has to fetch the page to see the noindex). Its markers are `EDIT: reel-meta`,
`reel-og`, `reel-json-ld`, `reel-video`, `reel-chapters`, `reel-strip`,
`print-css`, `resume-sheet`, plus the shared `footer` and `ga4` blocks.
All are regenerated by the build.

| Want to... | Edit |
|---|---|
| Swap the reel (new MP4, or a YouTube/Vimeo link) | `data/reel.yml` (Decap: Reel). Changes the home page and `/reel` together. |
| Rename, add, or remove a chapter chip | `data/reel-page.yml` &rarr; `chapters` (label + seconds). Empty list hides the row. |
| Show a credits line under the stats | `data/reel-page.yml` &rarr; `credits_max` (0 hides it; it is off because not every credit is in the reel) |
| Change the facts line, tagline, or button labels | `data/reel-page.yml` |
| Change the printable resume on `/reel` | Don&rsquo;t edit `reel.html`. The build copies the home page&rsquo;s resume in, so edit the home page&rsquo;s data as usual. |
| Send a personalised link | Add `?from=agencyname` to the URL. Views, plays, and button clicks show up in Analytics under that tag. |

When a screen edit has a print-resume mirror, **change both** so the
website and the PDF stay in sync.

## Common edits, copy-paste recipes

### Add a film credit

1. Search for `EDIT: film-credits`
2. Copy any existing `<tr>...</tr>` row inside the table
3. Paste it as a new row and edit the three cells:
   - **Title cell**: `<td class="title">Movie Name <span class="sub" style="color:var(--dim)">(Short, 2026)</span></td>`
   - **Role cell**: `<td class="role">Character Name</td>`
   - **Director cell**: `<td class="dir">dir. Director Name</td>`
4. Then search for `EDIT: print-film-credits` and add the same credit
   in the printed-resume format:
   - `<tr><td class="t">Movie Name <em style="color:#888;font-style:normal">(Short, 2026)</em></td><td class="r">Character Name</td><td class="d">dir. Director Name</td></tr>`
5. **Bump the resume year** (search `EDIT: resume-year`) so the PDF
   filename reflects the update.
6. **Optional: add a JSON-LD Movie node** (search `EDIT: json-ld`).
   Copy an existing Movie object inside the `@graph` array, give it a
   unique `@id` like `#movie-your-title`, and add the title /
   datePublished / director / actor + characterName.
   Skip this if you&rsquo;re not comfortable with JSON.

### Add a TV credit

1. Search for `EDIT: tv-credits`
2. Copy any `<tr>` and edit
3. Mirror in `EDIT: print-tv-credits`
4. Bump the resume year

### Add a theater credit

1. Search for `EDIT: theater-credits`
2. Copy any `<tr>`. The third cell has a special pattern:
   `<td class="dir">Stage Name<span class="venue-sub">Venue, City</span></td>`
   The `<span class="venue-sub">` is the dimmed second-line under the
   stage name.
3. Mirror in `EDIT: print-theater-credits` (uses `rs-venue-sub` instead
   of `venue-sub`).
4. Bump the resume year.
5. Optional: in `data/theater.yml`, add `url:` to an entry to make the
   production name a link on the website (e.g. a show page with
   tickets). The printed resume ignores it.

### Update the bio paragraph

1. Search for `EDIT: bio`
2. Edit the text inside the `<p>...</p>`.
3. Inline emphasis: `<strong>bold</strong>` for school names,
   `<em>italics</em>` for film titles.

### Add a training entry

1. Search for `EDIT: training`
2. Pattern: `<li><span class="label">Course Name</span><span class="sub">Teacher &middot; School</span></li>`
3. **Insert the new entry at the TOP of the list.** Convention: newest
   classes go first.
4. Mirror in `EDIT: print-training`. Same newest-at-top order; the
   markup is slightly different:
   `<div><strong>Course Name</strong><em>Teacher &middot; School, City</em></div>`
5. Bump the resume year.

### Change a social link

1. Search for `EDIT: socials`
2. Update the `href="..."` value of the appropriate `<a>` tag.
3. Don&rsquo;t change the `<svg>` or the visible label unless you also
   want to swap the icon and the pill text.
4. Also update `sameAs` in `EDIT: json-ld` so the structured data
   stays in sync.
5. Update `llms.txt` Links section to match.

### Update the headshot

1. Decap &rarr; **Headshots**. Add a look (square-ish, ~800&times;800 or
   larger) or pick an existing one.
2. **Drag the look you want to the top of the list.** The first entry is
   the large photo on the page, the photo on the printed resume, and the
   small thumb on `/reel` &mdash; all three follow it.
3. Optional: attach a print-ready **Headshot PDF** to a look; it shows up
   as a PDF tile at the end of the thumbnail row once uploaded.
4. Publish. The build regenerates `EDIT: headshot-main`,
   `EDIT: headshot-gallery`, and `EDIT: print-headshot`.

### Update the OG share image

1. Replace `assets/og-image.png` (must be 1200&times;630).
2. Or run `python .scripts/build-assets.py` to regenerate from the
   current logo files.

### Bump the resume year

1. Search for `EDIT: resume-year`
2. Change `const RESUME_LAST_UPDATED = 2026;` to the current year.
3. Do this whenever you make any visible resume change &mdash; the
   downloaded PDF filename uses this year.

### Update the page title or meta description

1. Search for `EDIT: site-meta`
2. Edit the `<title>` text and the `meta description` content.
3. Keep title under ~60 characters, description under ~155 characters
   so they don&rsquo;t get truncated in Google search results.
4. Also update `EDIT: og-tags` so social previews match.

## Things to avoid

- **Don&rsquo;t delete an `EDIT:` or `/EDIT:` comment marker.** They&rsquo;re
  invisible to visitors but they&rsquo;re your map.
- **Match every opening tag with a closing tag.** `<tr>` needs `</tr>`,
  `<td>` needs `</td>`. If the page looks broken after an edit, you
  probably have an unclosed tag.
- **Don&rsquo;t change `class=` or `id=` values.** They&rsquo;re tied to CSS
  styling. If you remove them, the layout breaks.
- **Always preview in GitHub before committing.** The preview tab shows
  what your edit looks like.

## Workflow tips

- **GitHub web editor**: click the file in your repo &rarr; pencil icon
  in the top-right &rarr; edit &rarr; commit at the bottom of the page.
  Add a meaningful commit message like `add Deli Boys S02 credit` so
  your history reads clearly later.
- **Roll back a bad edit**: in the repo, click the file &rarr; History
  &rarr; find the previous good version &rarr; copy its contents into
  a new edit, OR use the &ldquo;Revert&rdquo; button on a specific commit.
- **Test on your phone first**: GitHub Pages serves the live site
  within ~30 seconds of a commit. Check rizzo.cc on your phone to
  confirm everything looks right.
- **For dramatic changes** (new sections, redesigns, new features),
  come back to Claude. The cheatsheet handles content updates &mdash;
  not architectural changes.
