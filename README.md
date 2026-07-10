Static-site host for `dev`. Each subfolder is served at the
corresponding URL path on that domain.

The domain root serves DASH (index.html, v0.2.0), a retro
terminal-style dashboard of the active projects — it reads each
project's live version at load, so its cards stay current without
manual edits. It lived at `/dash` in v0.1.0; that path now redirects
to the root.
