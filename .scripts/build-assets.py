"""
Generate QR code (assets/qr-rizzo-cc.svg) and Open Graph card
(assets/og-image.png, 1200x630) for rizzo.cc.

Run from project root:
    python .scripts/build-assets.py
"""
from pathlib import Path
import qrcode
import qrcode.image.svg
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

NAVY  = (44, 46, 61)        # #2c2e3d
CARD  = (70, 72, 92)        # #46485c
CYAN  = (0, 188, 212)       # #00bcd4
WHITE = (255, 255, 255)
DIM   = (190, 195, 210)

# ---------- 1. QR code SVG -> https://rizzo.cc ----------
def build_qr():
    factory = qrcode.image.svg.SvgPathImage
    img = qrcode.make(
        "https://rizzo.cc",
        image_factory=factory,
        box_size=10,
        border=2,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
    )
    out = ASSETS / "qr-rizzo-cc.svg"
    img.save(str(out))
    print(f"  wrote {out.relative_to(ROOT)}")

# ---------- 2. Open Graph card (1200x630) ----------
def build_og():
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img)

    # Subtle radial accent in upper-right
    accent = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ad = ImageDraw.Draw(accent)
    for r in range(600, 0, -20):
        alpha = max(0, int(28 * (1 - r / 600)))
        ad.ellipse(
            [W - 200 - r, -200 - r, W - 200 + r, -200 + r],
            fill=(0, 188, 212, alpha),
        )
    img.paste(accent, (0, 0), accent)

    # Logo (use the dark-on-white version, recolor white for the dark bg)
    logo_src = ASSETS / "rizzo_logo_dark.png"
    if logo_src.exists():
        logo = Image.open(logo_src).convert("RGBA")
        # Recolor: replace dark pixels with white
        px = logo.load()
        for y in range(logo.height):
            for x in range(logo.width):
                r, g, b, a = px[x, y]
                if a > 30:
                    # treat as opaque mark; force white
                    px[x, y] = (255, 255, 255, a)
        # Scale to ~640px wide
        target_w = 640
        ratio = target_w / logo.width
        logo = logo.resize(
            (target_w, int(logo.height * ratio)),
            Image.LANCZOS,
        )
        lx = (W - logo.width) // 2
        ly = (H - logo.height) // 2 - 30
        img.paste(logo, (lx, ly), logo)

    # ".cc" accent next to logo
    try:
        font_tld = ImageFont.truetype("arialbd.ttf", 64)
        font_tag = ImageFont.truetype("arial.ttf", 28)
        font_name = ImageFont.truetype("arialbd.ttf", 22)
    except OSError:
        font_tld = ImageFont.load_default()
        font_tag = ImageFont.load_default()
        font_name = ImageFont.load_default()

    # Tagline
    tag = "Frank Rizzo  —  Actor"
    bbox = d.textbbox((0, 0), tag, font=font_tag)
    tw = bbox[2] - bbox[0]
    d.text(
        ((W - tw) // 2, H // 2 + 95),
        tag,
        fill=DIM,
        font=font_tag,
    )

    # Domain footer
    domain = "rizzo.cc"
    bbox = d.textbbox((0, 0), domain, font=font_name)
    tw = bbox[2] - bbox[0]
    d.text(
        ((W - tw) // 2, H - 70),
        domain,
        fill=CYAN,
        font=font_name,
    )

    # Top thin accent rule
    d.rectangle([0, 0, W, 4], fill=CYAN)

    out = ASSETS / "og-image.png"
    img.save(str(out), "PNG", optimize=True)
    print(f"  wrote {out.relative_to(ROOT)} ({W}x{H})")


if __name__ == "__main__":
    print("Building rizzo.cc assets:")
    build_qr()
    build_og()
    print("Done.")
