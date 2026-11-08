#!/usr/bin/env python3
"""Generates the DisnOff logo images (title, icon, large icon).

Wordmark "disnoff" where the "o" is a power symbol, with an elegant
Disney-style starlight arc sweeping over the word and landing in a glow on the power "o".

Usage: python3 development/make_logo.py   (needs Pillow and DejaVu Sans Bold)
"""
import math
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
SS = 4  # supersampling factor

WHITE = (255, 255, 255, 255)
ICON_BG = (4, 7, 20, 255)  # Disney+ signature deep dark

# Disney+ starlight arc gradient: deep royal blue -> radiant blue -> glowing cyan -> starlight white
DISNEY_ARC = [
    (0.00, (17, 60, 207)),   # Royal Disney blue
    (0.30, (0, 114, 210)),   # Radiant blue
    (0.60, (0, 195, 255)),   # Glowing cyan
    (0.85, (130, 230, 255)), # Pale starlight cyan
    (1.00, (255, 255, 255)), # Pure white star tip
]


def lerp(a, b, t):
    return a + (b - a) * t


def arc_color(t):
    for (t0, c0), (t1, c1) in zip(DISNEY_ARC, DISNEY_ARC[1:]):
        if t <= t1:
            k = (t - t0) / (t1 - t0) if t1 > t0 else 0
            return tuple(int(lerp(c0[i], c1[i], k)) for i in range(3))
    return DISNEY_ARC[-1][1]


def bezier(p0, c, p1, t):
    x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t ** 2 * p1[0]
    y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t ** 2 * p1[1]
    return x, y


def power_symbol(d, cx, cy, r, w, col):
    d.arc([cx - r, cy - r, cx + r, cy + r], start=-58, end=238, fill=col, width=w)
    d.line([cx, cy - r - w * 0.2, cx, cy - r * 0.05], fill=col, width=w)
    for x, y in ((cx, cy - r - w * 0.2), (cx, cy - r * 0.05)):
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=col)


def wordmark(height):
    """Returns an RGBA image of the full logo, height = font size in px."""
    h = height * SS
    font = ImageFont.truetype(FONT, h)
    left, right = "disn", "ff"
    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    w_left = probe.textlength(left, font=font)
    w_right = probe.textlength(right, font=font)
    ascent, descent = font.getmetrics()

    x_height = h * 0.55
    r = int(x_height * 0.5)
    gap = int(h * 0.05)
    stroke = max(2, int(h * 0.115))

    top_pad = int(h * 0.85)  # room for the arc above the letters
    side = int(h * 0.25)
    width = int(side + w_left + gap + 2 * r + gap + w_right + side)
    total_h = top_pad + ascent + descent + int(h * 0.1)
    im = Image.new("RGBA", (width, total_h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    base = top_pad + ascent
    x0 = side
    d.text((x0, top_pad), left, font=font, fill=WHITE)
    cx = x0 + w_left + gap + r
    cy = int(base - x_height / 2)
    power_symbol(d, cx, cy, r, stroke, WHITE)
    d.text((x0 + w_left + gap + 2 * r + gap, top_pad), right, font=font, fill=WHITE)

    # Arc: starts low on the left, sweeps over the word, lands on top of the power "o".
    p0 = (x0 - h * 0.12, base - x_height * 0.15)
    p1 = (cx, cy - r - stroke * 1.4)
    c = (lerp(p0[0], p1[0], 0.42), top_pad - h * 0.95)

    arc = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ad = ImageDraw.Draw(arc)
    steps = 400
    prev = bezier(p0, c, p1, 0)
    for i in range(1, steps + 1):
        t = i / steps
        pt = bezier(p0, c, p1, t)
        wdt = lerp(h * 0.012, h * 0.06, math.sin(min(t, 0.93) / 0.93 * math.pi / 2))
        col = arc_color(t) + (int(lerp(90, 255, min(1, t * 1.6))),)
        ad.line([prev, pt], fill=col, width=max(1, int(wdt)))
        prev = pt

    # Soft glowing tip on the landing point
    glow = Image.new("RGBA", im.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gr = int(h * 0.16)
    gd.ellipse([p1[0] - gr, p1[1] - gr, p1[0] + gr, p1[1] + gr], fill=(130, 230, 255, 170))
    glow = glow.filter(ImageFilter.GaussianBlur(int(h * 0.07)))

    im = Image.alpha_composite(im, arc)
    im = Image.alpha_composite(im, glow)

    # Starlight glint on the tip
    ad2 = ImageDraw.Draw(im)
    ad2.ellipse([p1[0] - stroke * 0.5, p1[1] - stroke * 0.5,
                 p1[0] + stroke * 0.5, p1[1] + stroke * 0.5], fill=WHITE)

    # Downsample
    out = im.resize((width // SS, total_h // SS), Image.Resampling.LANCZOS)
    return out


def make_icon(size, wordmark_img):
    """Square app icon: dark background, wordmark centered with side margins."""
    im = Image.new("RGBA", (size, size), ICON_BG)
    pad = int(size * 0.1)
    target_w = size - 2 * pad
    scale = target_w / wordmark_img.width
    target_h = int(wordmark_img.height * scale)
    scaled = wordmark_img.resize((target_w, target_h), Image.Resampling.LANCZOS)
    y = (size - target_h) // 2
    im.alpha_composite(scaled, (pad, y))
    return im


def main():
    wm = wordmark(height=64)
    # Trim transparent borders for the UI header
    bbox = wm.getbbox()
    trimmed = wm.crop(bbox)
    # Leave a bit of breath room
    pad_y = 10
    pad_x = 14
    title = Image.new("RGBA", (trimmed.width + 2 * pad_x, trimmed.height + 2 * pad_y), (0, 0, 0, 0))
    title.alpha_composite(trimmed, (pad_x, pad_y))

    title_path = os.path.join(ROOT, "assets", "disnoff_title.png")
    title.save(title_path)
    print(f"wrote {title_path} ({title.width}x{title.height})")

    # App icons: 80x80 and 130x130
    icon = make_icon(80, trimmed)
    icon_path = os.path.join(ROOT, "disnoff.png")
    icon.save(icon_path)
    print(f"wrote {icon_path}")

    icon_large = make_icon(130, trimmed)
    large_path = os.path.join(ROOT, "disnoffLarge.png")
    icon_large.save(large_path)
    print(f"wrote {large_path}")


if __name__ == "__main__":
    main()
