# acting (Rizzo.cc redesign)

Single-file static rebuild of [rizzo.cc](https://rizzo.franktrades.com/) — Frank Rizzo acting site.
Strips out WordPress / TheGem / LayerSlider / WPBakery; keeps the visual DNA close to the
current design but swaps the photo slideshow for a background `<video>` and pushes the
resume info into clean panels at the bottom.

## Status

**Local only.** Not pushed to any remote yet. Future home: `rizzo.franktrades.com`
(same site as `rizzo.cc`).

## Layout

1. **Hero** &mdash; full-viewport `<video>` background, logo + rotating quote overlay.
2. **About** &mdash; RIZZO definition + pull quote.
3. **Profile** &mdash; headshot card + social pills (Instagram / Letterboxd / IMDb / Email).
4. **Resume** &mdash; bottom panels: Physical, Languages, Measurements, Documents, Education, Skills, Favorite Films, Inspirations.
5. **Credits** &mdash; tabbed filmography (Film / TV / Commercial) + reel slot.
6. **Contact** &mdash; `frank@rizzo.cc`.

## Design tokens

| Token       | Value      | Used for                       |
|-------------|------------|--------------------------------|
| `--bg`      | `#2c2e3d`  | Page background (matches live) |
| `--card`    | `#46485c`  | Panel / quote background       |
| `--accent`  | `#00bcd4`  | Cyan accent (matches live)     |
| `--text`    | `#f2f2f2`  | Body text                      |
| Display     | Montserrat | Headings, kickers, tabs        |
| Body        | Source Sans 3 | Paragraphs, lists           |

## TODO before going live

- Drop a real header video at `assets/header.mp4`
  (recommend 1920&times;1080, 10&ndash;20s loop, h.264 faststart, no audio).
- Replace headshot URL if you want to host locally instead of the WP CDN.
- Wire up the reel `<iframe>` (Vimeo or YouTube embed).
- Generate a fresh `og-image.png` (1200&times;630) once branding is finalized.

## Changelog

### v0.1.0 &mdash; 2026-05-01

- Initial scaffold. Single-file `index.html`, no external JS deps.
- Mirrors current site palette (`#2c2e3d` / `#46485c` / `#00bcd4`) and content.
- Replaces 4-slide photo slideshow with looping `<video>` header + faded slogan rotator.
- Resume sections converted from WP shortcodes to a 12-column panel grid.
- Filmography moved into a clean tab control (Film / TV / Commercial).
