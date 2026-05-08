# Editing rizzo.cc without Claude

This guide is for making content updates to the site directly &mdash; in
GitHub&rsquo;s web editor, on a phone via the GitHub app, or in any text editor
&mdash; without needing AI assistance.

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
| `EDIT: physical` | Age range, height, eyes, hair, tattoos, piercings | `EDIT: print-stats` |
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

### Update the bio paragraph

1. Search for `EDIT: bio`
2. Edit the text inside the `<p>...</p>`.
3. Inline emphasis: `<strong>bold</strong>` for school names,
   `<em>italics</em>` for film titles.

### Add a training entry

1. Search for `EDIT: training`
2. Pattern: `<li><span class="label">Course Name</span><span class="sub">Teacher &middot; School</span></li>`
3. Mirror in `EDIT: print-training`. The print version uses a slightly
   different markup:
   `<div><strong>Course Name</strong><em>Teacher &middot; School, City</em></div>`
4. Bump the resume year.

### Change a social link

1. Search for `EDIT: socials`
2. Update the `href="..."` value of the appropriate `<a>` tag.
3. Don&rsquo;t change the `<svg>` or the visible label unless you also
   want to swap the icon and the pill text.
4. Also update `sameAs` in `EDIT: json-ld` so the structured data
   stays in sync.
5. Update `llms.txt` Links section to match.

### Update the headshot

1. Replace the file at `assets/headshot.jpg` (use a 1:1 square crop
   with breathing room above the crown; ~800&times;800 is ideal).
2. The HTML doesn&rsquo;t need to change &mdash; everything points at the
   same path.

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
