# yada-yoda dev playground

Multi-project deployment hosted at **dev.rizzo.cc**.

## Projects

| Path | URL | Description |
|---|---|---|
| `acting/` | dev.rizzo.cc/acting/ | Rizzo.cc redesign &mdash; Frank Rizzo, actor portfolio |

## Structure

Each project lives in its own self-contained subdirectory. Files at the
repo root serve at the dev.rizzo.cc apex:

- `404.html` &mdash; custom 404 page for any unmatched URL
- `CNAME` &mdash; points GitHub Pages at the `dev.rizzo.cc` domain
- `robots.txt` &mdash; disallows all crawlers (staging only)
- `.nojekyll` &mdash; disables Jekyll processing on Pages

## Adding a new project

1. Add a new top-level subdirectory: `T:\ClaudeCodeRepo\dev\<project>\`
2. Drop in the project&rsquo;s static files
3. `git add` / `commit` / `push`
4. Live at `dev.rizzo.cc/<project>/` within ~30 seconds

No DNS changes needed. No new repos needed.

## Deployment

Auto-deploys via GitHub Pages on every push to `main`. Repo lives at
`github.com/yada-yoda/dev`. Verify Pages status at
[Settings &rarr; Pages](https://github.com/yada-yoda/dev/settings/pages).
