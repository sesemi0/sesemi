"""
SESEMI — GEO service reference board (procedural, brand-consistent).
Builds public/geo/geo-reference.jpg (1600x900): a dark brand-colored
"AI answer constellation" — search queries flowing into chat bubbles where
the brand is the cited answer, orbit rings, SESEMI diamond mark.
Run:  python scripts/build_geo_visual.py
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math, os

W, H = 1600, 900
BG_TOP = (7, 13, 26)      # deep navy (site hero palette)
BG_BOT = (4, 8, 17)
BLUE = (83, 185, 251)     # --blue
CYAN = (97, 231, 255)
PURPLE = (139, 92, 255)
MUTED = (109, 149, 183)

def font(size, bold=False):
    for name in (["segoeui", "arialbd" if bold else "arial"], ["DejaVuSans"]):
        try:
            path = os.path.join(os.environ.get("WINDIR", "C:/Windows"), "Fonts",
                                ("segoeuib.ttf" if bold else "segoeui.ttf") if name == ["segoeui", "arialbd" if bold else "arial"] else "DejaVuSans.ttf")
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()

def main():
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    # vertical gradient
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(BG_TOP, BG_BOT)))
    cx, cy = W // 2, H // 2 + 30

    # radial glow center
    glow = Image.new("RGB", (W, H), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for r in range(320, 0, -8):
        a = int(90 * (1 - r / 320))
        gd.ellipse([cx - r, cy - r * 0.62, cx + r, cy + r * 0.62], fill=(20, 60, 100) if a else (0, 0, 0))
    glow = glow.filter(ImageFilter.GaussianBlur(60))
    img = Image.blend(img, Image.blend(img, Image.new("RGB", (W, H), (40, 90, 140)), 0.0), 0)  # keep base
    img = ImageChops_screen(img, glow)

    d = ImageDraw.Draw(img)

    # orbit rings
    for rx, ry, color, dash in [(420, 300, (83, 185, 251, 60), 9), (560, 400, (83, 185, 251, 36), 4), (300, 210, (97, 231, 255, 48), 6)]:
        for a in range(0, 3600, dash * 10):
            ang = math.radians(a / 10)
            x1, y1 = cx + rx * math.cos(ang), cy + ry * math.sin(ang)
            ang2 = math.radians(a / 10 + dash)
            x2, y2 = cx + rx * math.cos(ang2), cy + ry * math.sin(ang2)
            d.line([(x1, y1), (x2, y2)], fill=color[:3] if len(color) == 4 else color)

    # floating nodes on rings
    nodes = []
    for (rx, ry), color in [((420, 300), BLUE), ((560, 400), PURPLE), ((300, 210), CYAN)]:
        for ang_deg in [30, 120, 210, 320]:
            ang = math.radians(ang_deg)
            nodes.append((cx + rx * math.cos(ang), cy + ry * math.sin(ang), color))
    for x, y, color in nodes:
        for r, a in [(22, 30), (12, 70)]:
            s = Image.new("RGBA", (r * 4, r * 4), (0, 0, 0, 0))
            sd = ImageDraw.Draw(s)
            sd.ellipse([2 * r - r, 2 * r - r, 2 * r + r, 2 * r + r], fill=color + (a,))
            s = s.filter(ImageFilter.GaussianBlur(r * 0.8))
            solid = s.point(lambda p: 255)  # paste with the sprite's own alpha as mask
            img.paste(s, (int(x - 2 * r), int(y - 2 * r)), s.split()[3])
        d = ImageDraw.Draw(img)
        d.ellipse([x - 4, y - 4, x + 4, y + 4], fill=color)

    # connect query nodes to the center answer
    for x, y, color in nodes:
        for t in [i / 40 for i in range(41)]:
            px, py = x + (cx - x) * t, y + (cy - y) * t
            d.ellipse([px - 1, py - 1, px + 1, py + 1], fill=tuple(int(c * (1 - t) * 0.9 + 30 * t) for c in color))

    f_small = font(20)
    f_tiny = font(15)
    f_big = font(54, bold=True)
    f_title = font(26, bold=True)

    # query pills (left and right) — the "prompts" people ask
    queries = [("“best GEO agency for AI visibility?”", -1, 150, 205),
               ("“how do I appear in ChatGPT answers?”", -1, 130, 430),
               ("“top brand cited by Gemini for …”", -1, 170, 640),
               ("“who can optimize our AI search?”", 1, 250, 255),
               ("“is our brand mentioned by AI?”", 1, 230, 540),
               ("“track AI share of voice”", 1, 200, 720)]
    for text, side, wq, yq in queries:
        if side < 0:
            x0, x1 = 70, 70 + wq
        else:
            x0, x1 = W - 70 - wq, W - 70
        pad = 14
        d.rounded_rectangle([x0, yq, x1, yq + 44], radius=22, fill=(11, 24, 42), outline=(83, 185, 251, 120) and (44, 96, 140))
        d.text((x0 + pad, yq + 11), text, font=f_tiny, fill=(159, 196, 230))

    # center: the AI answer bubble where the brand is cited
    bw, bh = 640, 220
    bx0, by0 = cx - bw // 2, cy - bh // 2
    d.rounded_rectangle([bx0, by0, bx0 + bw, by0 + bh], radius=26, fill=(10, 21, 38), outline=(53, 119, 174))
    d.rounded_rectangle([bx0, by0, bx0 + bw, by0 + 56], radius=26, fill=(13, 30, 52))
    d.text((bx0 + 28, by0 + 15), "AI ANSWER", font=f_tiny, fill=(97, 231, 255))
    d.text((bx0 + 170, by0 + 13), "—  sources:  [1]  [2]  [3]", font=f_tiny, fill=(109, 149, 183))
    lines = [("Your brand is", (231, 240, 250)), ("the answer.", BLUE)]
    yy = by0 + 78
    for text, color in lines:
        d.text((bx0 + 32, yy), text, font=f_big, fill=color)
        yy += 62

    # citation chips under the bubble
    chip_y = by0 + bh + 26
    chips = [("CITED [1]", BLUE), ("30%+ AI VISIBILITY", CYAN), ("GEO REPORT", PURPLE)]
    xoff = cx - 380
    for text, color in chips:
        wch = 26 + len(text) * 9.5
        d.rounded_rectangle([xoff, chip_y, xoff + wch, chip_y + 34], radius=17, fill=(9, 20, 36), outline=color)
        d.text((xoff + 13, chip_y + 8), text, font=f_tiny, fill=color)
        xoff += wch + 18

    # SESEMI diamond mark (top-left) + title
    dm = 26
    dx, dy = 78, 86
    d.polygon([(dx, dy - dm), (dx + dm, dy), (dx, dy + dm), (dx - dm, dy)], outline=BLUE, fill=(83, 185, 251, 0) and (12, 27, 47))
    d.polygon([(dx, dy - 12), (dx + 12, dy), (dx, dy + 12), (dx - 12, dy)], fill=BLUE)
    d.text((dx + 40, dy - 18), "SESEMI", font=f_title, fill=(231, 240, 250))
    d.text((dx + 40, dy + 12), "GEO SERVICE — REFERENCE BOARD", font=f_tiny, fill=MUTED)
    # top-right label
    d.text((W - 78, 72), "GENERATIVE ENGINE OPTIMIZATION", font=f_tiny, fill=(83, 185, 251), anchor="ra")
    d.text((W - 78, 98), "CHATGPT · GEMINI · PERPLEXITY", font=f_tiny, fill=MUTED, anchor="ra")
    # bottom strip
    d.text((W // 2, H - 46), "BE THE ANSWER, NOT JUST A BLUE LINK", font=f_small, fill=MUTED, anchor="mm")

    os.makedirs("public/geo", exist_ok=True)
    img.save("public/geo/geo-reference.jpg", quality=88, optimize=True)
    print("saved public/geo/geo-reference.jpg", img.size)

def ImageChops_screen(a, b):
    from PIL import ImageChops
    return ImageChops.screen(a, b)

if __name__ == "__main__":
    main()
