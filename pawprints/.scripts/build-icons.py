"""
Generate the full favicon + PWA icon set + OG social image for PawPrints.

Output (written to repo root, T:\ClaudeCodeRepo\dev\pawprints):
  favicon.ico         (16+32+48 multi-res)
  favicon-16.png
  favicon-32.png
  apple-touch-icon.png  (180x180, iOS home-screen)
  icon-192.png        (PWA)
  icon-512.png        (PWA)
  icon-maskable.png   (512x512 with safe-zone padding for Android adaptive icons)
  og-image.png        (1200x630 social preview)

Design: amber -> teal brand gradient (matches the in-app --accent / --accent-2)
with the paw-prints emoji rendered via Segoe UI Emoji (Windows) for parity with
the running app's header logo.
"""
from PIL import Image, ImageDraw, ImageFont
import os

OUT = r"T:\ClaudeCodeRepo\dev\pawprints"
EMOJI_FONT = r"C:\Windows\Fonts\seguiemj.ttf"
TEXT_FONT = r"C:\Windows\Fonts\segoeui.ttf"
TEXT_FONT_BOLD = r"C:\Windows\Fonts\segoeuib.ttf"

# Brand colors
COLOR_A = (244, 162, 97)    # #f4a261 amber
COLOR_B = (45, 212, 191)    # #2dd4bf teal
BG_DARK = (13, 17, 23)      # #0d1117
PAW = "\U0001F43E"          # paw prints


def _grad_pixels(size, pix):
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            r = int(COLOR_A[0] * (1 - t) + COLOR_B[0] * t)
            g = int(COLOR_A[1] * (1 - t) + COLOR_B[1] * t)
            b = int(COLOR_A[2] * (1 - t) + COLOR_B[2] * t)
            pix[x, y] = (r, g, b, 255)


def gradient_square(size, radius_ratio=0.22):
    grad = Image.new("RGBA", (size, size), 0)
    _grad_pixels(size, grad.load())
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * radius_ratio), fill=255)
    img.paste(grad, (0, 0), mask)
    return img


def stamp_emoji(img, emoji, size_ratio=0.6, y_ratio=0.54):
    size = img.size[0]
    try:
        font = ImageFont.truetype(EMOJI_FONT, int(size * size_ratio))
    except OSError:
        return img
    draw = ImageDraw.Draw(img)
    bbox = draw.textbbox((0, 0), emoji, font=font, embedded_color=True)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - w) // 2 - bbox[0]
    y = int(size * y_ratio) - h // 2 - bbox[1]
    draw.text((x, y), emoji, font=font, embedded_color=True)
    return img


def make_icon(size, *, maskable=False):
    if maskable:
        full = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        bg = Image.new("RGBA", (size, size))
        _grad_pixels(size, bg.load())
        full.paste(bg, (0, 0))
        layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        stamp_emoji(layer, PAW, size_ratio=0.55 * 0.6, y_ratio=0.54)
        full.alpha_composite(layer)
        return full
    img = gradient_square(size)
    stamp_emoji(img, PAW)
    return img


def make_og():
    W, H = 1200, 630
    img = Image.new("RGBA", (W, H), BG_DARK + (255,))
    draw = ImageDraw.Draw(img)
    # subtle gradient bar down the left
    bar = Image.new("RGBA", (16, H))
    bp = bar.load()
    for y in range(H):
        t = y / (H - 1)
        bp_col = (int(COLOR_A[0]*(1-t)+COLOR_B[0]*t), int(COLOR_A[1]*(1-t)+COLOR_B[1]*t), int(COLOR_A[2]*(1-t)+COLOR_B[2]*t), 255)
        for x in range(16):
            bp[x, y] = bp_col
    img.paste(bar, (0, 0))
    # logo tile
    tile = gradient_square(150, radius_ratio=0.24)
    stamp_emoji(tile, PAW, size_ratio=0.6, y_ratio=0.54)
    img.alpha_composite(tile, (90, 120))
    # text
    try:
        f_title = ImageFont.truetype(TEXT_FONT_BOLD, 88)
        f_sub = ImageFont.truetype(TEXT_FONT, 40)
        f_feat = ImageFont.truetype(TEXT_FONT, 32)
    except OSError:
        f_title = f_sub = f_feat = ImageFont.load_default()
    draw.text((90, 300), "PawPrints", font=f_title, fill=(230, 237, 243, 255))
    draw.text((92, 408), "Feed · Walk · Care", font=f_sub, fill=(244, 162, 97, 255))
    feats = "Feeding  ·  Walks  ·  Potty  ·  Vet  ·  Grooming  ·  Meds  ·  Weight"
    draw.text((92, 482), feats, font=f_feat, fill=(139, 148, 158, 255))
    img.convert("RGB").save(os.path.join(OUT, "og-image.png"), "PNG", optimize=True)
    print(f"  wrote og-image.png (1200x630, {os.path.getsize(os.path.join(OUT, 'og-image.png'))} bytes)")


def main():
    for name, size, maskable in [
        ("favicon-16.png", 16, False), ("favicon-32.png", 32, False),
        ("apple-touch-icon.png", 180, False), ("icon-192.png", 192, False),
        ("icon-512.png", 512, False), ("icon-maskable.png", 512, True),
    ]:
        img = make_icon(size, maskable=maskable)
        path = os.path.join(OUT, name)
        img.save(path, "PNG", optimize=True)
        print(f"  wrote {name} ({size}x{size}, maskable={maskable}, {os.path.getsize(path)} bytes)")
    ico_layers = [make_icon(s) for s in (16, 32, 48)]
    ico_path = os.path.join(OUT, "favicon.ico")
    ico_layers[0].save(ico_path, format="ICO", sizes=[(s, s) for s in (16, 32, 48)])
    print(f"  wrote favicon.ico ({os.path.getsize(ico_path)} bytes)")
    make_og()


if __name__ == "__main__":
    main()
