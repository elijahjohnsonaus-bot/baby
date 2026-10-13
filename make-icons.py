"""Draws the Pip icon set. Run with: python3 make-icons.py"""
from PIL import Image, ImageDraw

INK = (21, 22, 26)
AMBER = (232, 180, 92)

def seed(size, inset, bg):
    """A seed shape: pointed at the top, round at the base."""
    ss = 8  # supersample for clean edges
    img = Image.new("RGB", (size * ss, size * ss), bg)
    d = ImageDraw.Draw(img)
    S = size * ss
    pad = int(S * inset)
    box = S - pad * 2

    cx = S / 2
    r = box * 0.33                      # radius of the round base
    cy = pad + box * 0.62               # centre of that base
    tip = (cx, pad + box * 0.04)        # the point at the top

    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=AMBER)
    # Two curves from the tip down to the widest points of the circle.
    left, right = (cx - r, cy), (cx + r, cy)
    pts = [tip]
    steps = 90
    for i in range(steps + 1):          # right side, tip -> right
        t = i / steps
        ctrl = (cx + r * 0.95, pad + box * 0.30)
        x = (1 - t) ** 2 * tip[0] + 2 * (1 - t) * t * ctrl[0] + t ** 2 * right[0]
        y = (1 - t) ** 2 * tip[1] + 2 * (1 - t) * t * ctrl[1] + t ** 2 * right[1]
        pts.append((x, y))
    for i in range(steps + 1):          # left side, left -> tip
        t = i / steps
        ctrl = (cx - r * 0.95, pad + box * 0.30)
        x = (1 - t) ** 2 * left[0] + 2 * (1 - t) * t * ctrl[0] + t ** 2 * tip[0]
        y = (1 - t) ** 2 * left[1] + 2 * (1 - t) * t * ctrl[1] + t ** 2 * tip[1]
        pts.append((x, y))
    d.polygon(pts, fill=AMBER)

    return img.resize((size, size), Image.LANCZOS)

for size, name in [(180, "icon-180.png"), (192, "icon-192.png"), (512, "icon-512.png")]:
    seed(size, 0.17, INK).save(name)
# Maskable icons get cropped to a circle by the launcher, so pull the shape in.
seed(512, 0.28, INK).save("icon-maskable.png")
print("wrote icon-180.png icon-192.png icon-512.png icon-maskable.png")
