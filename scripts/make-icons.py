#!/usr/bin/env python3
"""Draws the home-screen icons in src/icons/ (run once; needs Pillow).

A red d20 (the same shape as the header logo) with a gold 20 on the app's dark
background. Everything sits inside the centre 80%, so the icons also work as
maskable icons that Android crops to a circle or squircle.
"""
from PIL import Image, ImageDraw, ImageFont

BG, RED, EDGE, GOLD = (14, 15, 18), (229, 56, 59), (120, 18, 22), (240, 200, 96)
FONT = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"


def icon(size):
    scale = 4  # draw big, then shrink, for smooth edges
    s = size * scale
    img = Image.new("RGB", (s, s), BG)
    d = ImageDraw.Draw(img)
    # The header's d20 lives on a 32-unit grid (2..30); map it into the safe zone.
    box = s * 0.70
    off = (s - box) / 2
    p = lambda x, y: (off + (x - 2) / 28 * box, off + (y - 2) / 28 * box)
    d.polygon([p(16, 2), p(29, 9.5), p(29, 22.5), p(16, 30), p(3, 22.5), p(3, 9.5)], fill=RED)
    w = max(2, int(s * 0.012))
    for a, b in [((16, 2), (9, 13)), ((16, 2), (23, 13)), ((9, 13), (23, 13)), ((9, 13), (3, 22.5)),
                 ((23, 13), (29, 22.5)), ((9, 13), (16, 24)), ((23, 13), (16, 24)), ((16, 24), (16, 30)),
                 ((3, 9.5), (9, 13)), ((29, 9.5), (23, 13))]:
        d.line([p(*a), p(*b)], fill=EDGE, width=w)
    font = ImageFont.truetype(FONT, int(s * 0.17))
    cx, cy = p(16, 17.6)
    d.text((cx, cy), "20", font=font, fill=GOLD, anchor="mm", stroke_width=max(1, int(s * 0.006)), stroke_fill=EDGE)
    return img.resize((size, size), Image.LANCZOS)


for size, name in [(192, "icon-192.png"), (512, "icon-512.png"), (180, "apple-touch-icon-180.png")]:
    icon(size).save("src/icons/" + name, optimize=True)
    print("wrote src/icons/" + name)
