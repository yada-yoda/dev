# Scan Card

A tiny static web app that turns a business-card photo into a `.vcf` you can
add to iPhone Contacts. Served at `dev.rizzo.cc/scancard/`.

## How it works

1. Tap **Front** to open the iPhone camera and capture the card.
2. Optionally tap **Back** for the reverse side.
3. Tap **Extract text** — OCR runs entirely in your browser via
   [Tesseract.js](https://tesseract.projectnaptha.com/). No images leave the
   device.
4. Review and edit the parsed fields (name, title, company, email,
   phones, website, address, notes).
5. Tap **Download vCard**. On iPhone, opening the downloaded `.vcf`
   prompts iOS to add the contact, with the card photo embedded.

## Files

| File                    | Purpose                                          |
| ----------------------- | ------------------------------------------------ |
| `index.html`            | Capture UI, edit form, download button           |
| `style.css`             | Mobile-first dark styling                        |
| `app.js`                | Camera handling, OCR orchestration, vCard build  |
| `manifest.webmanifest`  | PWA metadata so it installs to Home Screen       |
| `favicon.svg`           | App icon                                         |
| `404.html`              | Fallback for unknown URLs under `/scancard/`     |

Tesseract.js is loaded from jsDelivr at runtime — no build step, no bundler.

## Local preview

Any static HTTP server works, for example:

```sh
python -m http.server --directory dev/scancard 8080
```

Then open `http://localhost:8080/` on the same Wi-Fi from your iPhone
(swap `localhost` for the desktop's LAN IP).

## Changelog

### v0.2.0 — 2026-05-22
- OCR overhaul: real-world business cards were returning gibberish. Three
  fixes together: bumped the OCR image cap from 1600px to 2400px so small
  print survives the downscale; ran every image through a grayscale +
  histogram-stretch pass before handing it to Tesseract; and switched
  Tesseract to PSM 6 ("single uniform block") with a 300 DPI hint, which
  empirically reads card layouts better than the default auto mode.
- Added an opt-in "High contrast (B&W)" toggle in the capture section that
  applies Otsu binarization on top of the stretch. Off by default — it
  helps clean printed cards but can destroy stylized ones, so it's per-scan.

### v0.1.0 — 2026-05-17
- Initial release. Front + optional back capture, in-browser Tesseract OCR,
  heuristic field parser, editable form, vCard 3.0 download with embedded
  front photo (downscaled to ~600px wide, JPEG q=0.82).
