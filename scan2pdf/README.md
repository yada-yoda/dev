# Scan2PDF

A static web app that turns iPhone camera shots of paper documents into a
searchable, multi-page PDF — saved straight to Files, iCloud Drive, or
anywhere else iOS' native share sheet can reach. Served at
`dev.rizzo.cc/scan2pdf/`.

Nothing leaves the device. OCR, image processing, and PDF assembly all run
in the browser.

## How to use it on iPhone

1. Open `https://dev.rizzo.cc/scan2pdf/` in Safari.
2. Tap **Scan page** — iOS opens the rear camera. Take a photo of the page.
3. Repeat for as many pages as you need. Reorder with ↑↓ or remove with ×.
4. Set a **filename prefix** (e.g. `Receipt`, `Statement`). Saved between
   visits.
5. Pick an **OCR language**. Leave OCR on if you want the PDF to be
   searchable on your Mac/PC via Spotlight / File Explorer.
6. Tap **Generate PDF** — first run downloads the OCR model (~10 MB per
   language; cached afterwards).
7. Tap **Save / share** — iOS opens the share sheet. Pick *Save to Files*
   (choose iCloud Drive or On My iPhone), AirDrop to your computer, mail it,
   send it to Notes, etc.

For a permanent home-screen icon: in Safari, tap **Share → Add to Home
Screen**.

## How it works

| Step              | What happens                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| Capture           | `<input type="file" capture="environment">` opens the camera and returns a JPEG.                |
| Downscale         | Each image is resized to a max 2000 px long edge at JPEG q=0.88 to keep file size sane.         |
| OCR               | [Tesseract.js](https://tesseract.projectnaptha.com/) runs on each page, returns HOCR word bboxes. |
| PDF build         | [jsPDF](https://github.com/parallax/jsPDF) embeds each image on a Letter page, then writes the OCR'd words at the correct positions with `renderingMode: 'invisible'`. |
| Share             | `navigator.share({ files: [...] })` hands the PDF to iOS' native share sheet. Falls back to a direct download if the browser can't share files. |

The invisible text layer means the page still *looks* like the original
scan, but the text is fully selectable and indexable by your OS — Spotlight
on macOS and Windows Search both index PDF text content.

## Files

| File                    | Purpose                                          |
| ----------------------- | ------------------------------------------------ |
| `index.html`            | App shell + UI                                   |
| `style.css`             | Mobile-first dark theme                          |
| `app.js`                | Capture, OCR orchestration, PDF assembly, share  |
| `manifest.webmanifest`  | PWA metadata so it installs to Home Screen       |
| `favicon.svg`           | App icon                                         |
| `404.html`              | Fallback for unknown URLs under `/scan2pdf/`     |
| `README.md`             | This file                                        |

Tesseract.js and jsPDF are loaded from jsDelivr at runtime — no build
step, no bundler, no server.

## Caveats

- First load on a slow connection is heavy (~12 MB total: Tesseract worker
  + language data + jsPDF). Subsequent loads are cached.
- OCR quality depends on the photo. Good lighting, in focus, paper roughly
  flat, no glare — the basics.
- Web Share API for files needs iOS 15+ Safari. On older iOS the app falls
  back to a tap-to-download link.
- The PDF page format is fixed to US Letter, oriented to match the photo
  aspect ratio. Images are centered with a small white margin.
