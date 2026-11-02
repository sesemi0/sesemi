# -*- coding: utf-8 -*-
"""Build the sesemi YouTube banner (2560x1440) procedurally.
Brand cluster (logo + wordmark + tagline) stays inside the all-devices safe strip.
"""
import math, os, random, time
from PIL import Image, ImageDraw, ImageFilter, ImageFont

t0 = time.time()
random.seed(11)
S = 2                                # supersample factor
W, H = 2560 * S, 1440 * S
OUT = r"D:\myproject\youtube-banner"
LOGO = r"C:\Users\MERSAD JY\.zcode\cli\image-cache\session_b9284471c39dfffab07f8acae03bf92b\image-932465be17de0c8b372f797d714fa2e1.jpg"
GUIDE = os.path.join(OUT, "safe-area-guide-2560x1440.png")

# safe strip (effective px)
SX0, SY0, SX1, SY1 = 507, 508, 2053, 931
CY = (SY0 + SY1) // 2                # 719

def pick(paths, size):
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            pass
    return ImageFont.load_default()

F_BLACK = [r"C:\Windows\Fonts\seguibl.ttf", r"C:\Windows\Fonts\ariblk.ttf",
           r"C:\Windows\Fonts\segoeuib.ttf", r"C:\Windows\Fonts\arialbd.ttf"]
F_BOLD = [r"C:\Windows\Fonts\segoeuib.ttf", r"C:\Windows\Fonts\arialbd.ttf"]

def vgrad(size, stops):
    w, h = size
    g = Image.new("RGB", (1, h))
    px = g.load()
    for y in range(h):
        t = y / (h - 1)
        for i in range(len(stops) - 1):
            p0, c0 = stops[i]
            p1, c1 = stops[i + 1]
            if p0 <= t <= p1:
                u = (t - p0) / (p1 - p0) if p1 > p0 else 0
                px[0, y] = tuple(int(c0[k] + (c1[k] - c0[k]) * u) for k in range(3))
                break
        else:
            px[0, y] = stops[-1][1]
    return g.resize((w, h))

def radial(size, color, max_alpha, hard=1.4):
    w, h = size
    m = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(m)
    steps = 60
    for i in range(steps, 0, -1):
        a = int(max_alpha * ((steps - i) / steps) ** hard) + 1
        rx, ry = w / 2 * i / steps, h / 2 * i / steps
        d.ellipse([w / 2 - rx, h / 2 - ry, w / 2 + rx, h / 2 + ry], fill=a)
    m = m.filter(ImageFilter.GaussianBlur(max(w, h) // 60))
    layer = Image.new("RGBA", (w, h), color + (0,))
    layer.putalpha(m)
    return layer

def qbez(p0, p1, p2, n=300):
    pts = []
    for i in range(n + 1):
        t = i / n
        x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0]
        y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]
        pts.append((x, y))
    return pts

# ---------- 1. base gradient ----------
base = vgrad((W, H), [
    (0.00, (4, 7, 19)), (0.40, (6, 12, 33)), (0.72, (5, 10, 30)), (1.00, (3, 6, 16)),
]).convert("RGBA")

# ---------- 2. nebula clouds ----------
neb = Image.new("RGBA", (W, H), (0, 0, 0, 0))
nd = ImageDraw.Draw(neb)
def blob(x, y, rx, ry, color, alpha):
    nd.ellipse([x - rx, y - ry, x + rx, y + ry], fill=color + (alpha,))
blob(520, 640, 640, 440, (124, 58, 237), 72)
blob(2180, 470, 620, 430, (37, 99, 235), 84)
blob(1290, 230, 780, 380, (59, 130, 246), 52)
blob(300, 1020, 430, 270, (217, 70, 239), 42)
blob(2380, 980, 430, 270, (217, 70, 239), 38)
blob(1750, 1100, 500, 240, (56, 189, 248), 30)
neb = neb.filter(ImageFilter.GaussianBlur(120 * S))
base = Image.alpha_composite(base, neb)

# ---------- 3. stars ----------
st = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sd = ImageDraw.Draw(st)
for _ in range(560):
    x, y = random.uniform(0, W), random.uniform(0, H)
    if SX0 * S < x < SX1 * S and SY0 * S < y < SY1 * S and random.random() < 0.65:
        continue
    r = random.uniform(1.1, 3.4) * S
    sd.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, random.randint(50, 230)))
for _ in range(7):  # sparkle crosses
    x, y = random.uniform(80, W - 80), random.uniform(60, H - 200)
    if SX0 * S < x < SX1 * S and SY0 * S < y < SY1 * S:
        continue
    l = random.uniform(10, 18) * S
    sd.line([(x - l, y), (x + l, y)], fill=(220, 240, 255, 170), width=int(1.5 * S))
    sd.line([(x, y - l), (x, y + l)], fill=(220, 240, 255, 170), width=int(1.5 * S))
base = Image.alpha_composite(base, st)

# ---------- 4. earth horizon + sunrise ----------
RC = 2600 * S
CXE, CYE = 1280 * S, (1085 + 2600) * S
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
for wd_, al, col in [(30, 80, (59, 130, 246)), (14, 150, (96, 165, 250)), (6, 230, (191, 219, 254))]:
    gd.arc([CXE - RC, CYE - RC, CXE + RC, CYE + RC], start=196, end=344,
           fill=col + (al,), width=wd_ * S)
glow = glow.filter(ImageFilter.GaussianBlur(11 * S))
earth = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ed = ImageDraw.Draw(earth)
ed.ellipse([CXE - RC, CYE - RC, CXE + RC, CYE + RC], fill=(3, 6, 14, 255))
# faint continents glow inside the planet rim
for cx_, al in [(1000, 32), (1560, 22)]:
    e = radial((900 * S, 260 * S), (250, 160, 90), al)
    earth.alpha_composite(e, (int(cx_ * S - 450 * S), int(1220 * S)))
base = Image.alpha_composite(base, glow)
base = Image.alpha_composite(base, earth)
# sunrise flare
f1 = radial((1100 * S, 560 * S), (255, 196, 128), 215)
base.alpha_composite(f1, (int(1280 * S - 550 * S), int(1075 * S - 280 * S)))
f2 = radial((2000 * S, 480 * S), (255, 238, 214), 150)
base.alpha_composite(f2, (int(1280 * S - 1000 * S), int(1078 * S - 230 * S)))
# crisp rim line
rim = Image.new("RGBA", (W, H), (0, 0, 0, 0))
rd = ImageDraw.Draw(rim)
rd.arc([CXE - RC, CYE - RC, CXE + RC, CYE + RC], start=210, end=330,
       fill=(235, 248, 255, 255), width=4 * S)
rim = rim.filter(ImageFilter.GaussianBlur(1.6 * S))
base = Image.alpha_composite(base, rim)

# ---------- 5. neon waves ----------
waves = Image.new("RGBA", (W, H), (0, 0, 0, 0))
wgd_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
wgd = ImageDraw.Draw(wgd_layer)
wdr = ImageDraw.Draw(waves)
for p0, p1, p2, col, wln in [
    ((-120, 1080), (950, 770), (2750, 1010), (139, 92, 246, 150), 6),
    ((-120, 1190), (1150, 890), (2750, 1150), (34, 211, 238, 120), 4),
    ((-120, 970), (850, 885), (2750, 845), (59, 130, 246, 100), 3),
]:
    pts = qbez((p0[0] * S, p0[1] * S), (p1[0] * S, p1[1] * S), (p2[0] * S, p2[1] * S))
    wgd.line(pts, fill=col, width=wln * 4 * S, joint="curve")
    wdr.line(pts, fill=col, width=wln * S, joint="curve")
wgd_layer = wgd_layer.filter(ImageFilter.GaussianBlur(9 * S))
base = Image.alpha_composite(base, wgd_layer)
base = Image.alpha_composite(base, waves)

# ---------- 6. neural brain hologram (right, mostly outside safe strip) ----------
bx, by = 2365, 700
nodes, tries = [], 0
while len(nodes) < 44 and tries < 6000:
    tries += 1
    if random.random() < 0.5:
        cx_, cy_, rx, ry = bx - 90, by - 15, 175, 195
    else:
        cx_, cy_, rx, ry = bx + 90, by - 15, 175, 195
    a = random.uniform(0, math.tau)
    rr = math.sqrt(random.random())
    x, y = (cx_ + math.cos(a) * rx * rr) * S, (cy_ + math.sin(a) * ry * rr) * S
    if all((x - nx) ** 2 + (y - ny) ** 2 > (34 * S) ** 2 for nx, ny in nodes):
        nodes.append((x, y))
edges = []
for i, (x1, y1) in enumerate(nodes):
    near = sorted(((x1 - nodes[j][0]) ** 2 + (y1 - nodes[j][1]) ** 2, j)
                  for j in range(len(nodes)) if j != i)
    for _, j in near[:3]:
        if (nodes[i][0] - nodes[j][0]) ** 2 + (nodes[i][1] - nodes[j][1]) ** 2 < (118 * S) ** 2:
            e = (min(i, j), max(i, j))
            if e not in edges:
                edges.append(e)
net = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ntd = ImageDraw.Draw(net)
for i, j in edges:
    ntd.line([nodes[i], nodes[j]], fill=(56, 189, 248, 105), width=2 * S)
for (x, y) in nodes:
    col = (103, 232, 249, 225) if random.random() < 0.6 else (232, 121, 249, 225)
    r = random.uniform(4, 9) * S
    ntd.ellipse([x - r, y - r, x + r, y + r], fill=col)
netglow = net.filter(ImageFilter.GaussianBlur(7 * S))
base = Image.alpha_composite(base, netglow)
base = Image.alpha_composite(base, net)
# pedestal rings + soft glow beneath
rings = Image.new("RGBA", (W, H), (0, 0, 0, 0))
rgd = ImageDraw.Draw(rings)
for rx, ry, al in [(305, 56, 150), (215, 40, 105), (135, 25, 70)]:
    rgd.ellipse([(bx - rx) * S, (962 - ry) * S, (bx + rx) * S, (962 + ry) * S],
                outline=(34, 211, 238, al), width=3 * S)
rings = rings.filter(ImageFilter.GaussianBlur(2 * S))
base = Image.alpha_composite(base, rings)
pg = radial((620 * S, 240 * S), (34, 211, 238), 55)
base.alpha_composite(pg, ((bx - 310) * S, (962 - 120) * S))

# ---------- 7. HUD corners ----------
hud = Image.new("RGBA", (W, H), (0, 0, 0, 0))
hd = ImageDraw.Draw(hud)
L, M, wdt = 200 * S, 56 * S, 8 * S
def corner(x, y, sx, sy):
    hd.line([(x, y + sy * L), (x, y), (x + sx * L, y)], fill=(34, 211, 238, 185), width=wdt)
    hd.line([(x, y + sy * (L + 30 * S)), (x, y + sy * L)], fill=(139, 92, 246, 200), width=4 * S)
    hd.line([(x + sx * (L + 30 * S), y), (x + sx * L, y)], fill=(139, 92, 246, 200), width=4 * S)
corner(M, M, 1, 1)
corner(W - M, M, -1, 1)
corner(M, H - M, 1, -1)
corner(W - M, H - M, -1, -1)
for (x, y, dx) in [(M, H // 2, 1), (W - M, H // 2, -1)]:
    hd.line([(x, y - 32 * S), (x, y + 32 * S)], fill=(34, 211, 238, 160), width=4 * S)
    hd.line([(x, y), (x + dx * 44 * S, y)], fill=(34, 211, 238, 160), width=4 * S)
hud = hud.filter(ImageFilter.GaussianBlur(1 * S))
base = Image.alpha_composite(base, hud)

# ---------- 8. vignette ----------
vm = Image.new("L", (W, H), 0)
vd = ImageDraw.Draw(vm)
vd.rectangle([0, 0, W, H], fill=105)
vd.ellipse([-W * 0.28, -H * 0.38, W * 1.28, H * 1.38], fill=0)
vm = vm.filter(ImageFilter.GaussianBlur(110 * S))
vig = Image.new("RGBA", (W, H), (0, 0, 0, 255))
vig.putalpha(vm)
base = Image.alpha_composite(base, vig)

# ---------- 9. darken safe strip so branding pops ----------
dm = Image.new("L", (W, H), 0)
dd = ImageDraw.Draw(dm)
dd.rectangle([(SX0 - 40) * S, (SY0 - 40) * S, (SX1 + 40) * S, (SY1 + 40) * S], fill=92)
dm = dm.filter(ImageFilter.GaussianBlur(50 * S))
dark = Image.new("RGBA", (W, H), (2, 4, 12, 255))
dark.putalpha(dm)
base = Image.alpha_composite(base, dark)

# ---------- 10. logo ----------
logo = Image.open(LOGO).convert("RGBA")
print("logo corner color:", logo.getpixel((6, 6)))
LS = 520 * S
lg = logo.resize((LS, LS), Image.Resampling.LANCZOS)
fm = Image.new("L", (LS, LS), 0)
fd = ImageDraw.Draw(fm)
fd.ellipse([LS * 0.05, LS * 0.05, LS * 0.95, LS * 0.95], fill=255)
fm = fm.filter(ImageFilter.GaussianBlur(LS * 0.055))
lg.putalpha(fm)

# ---------- 11. wordmark "sesemi" (chrome) ----------
dummy = ImageDraw.Draw(Image.new("L", (8, 8)))
fsize = 340
while True:
    fnt = pick(F_BLACK, fsize)
    bb = dummy.textbbox((0, 0), "sesemi", font=fnt)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    cluster_w = LS + 70 * S + tw
    if cluster_w <= (SX1 - SX0 - 130) * S or fsize <= 240:
        break
    fsize -= 8
pad = 44
tmask = Image.new("L", (tw + pad * 2, th + pad * 2), 0)
tmd = ImageDraw.Draw(tmask)
tmd.text((pad - bb[0], pad - bb[1]), "sesemi", font=fnt, fill=255)
chrome = vgrad(tmask.size, [
    (0.00, (253, 254, 255)), (0.28, (228, 236, 249)), (0.46, (143, 163, 196)),
    (0.54, (100, 120, 155)), (0.66, (201, 214, 236)), (0.82, (244, 248, 255)),
    (1.00, (213, 225, 243)),
]).convert("RGBA")
chrome.putalpha(tmask)
wglow = tmask.filter(ImageFilter.GaussianBlur(24))
glowl = Image.new("RGBA", tmask.size, (103, 232, 249, 0))
glowl.putalpha(wglow.point(lambda v: int(v * 0.55)))

text_left = W // 2 - cluster_w // 2 + LS + 70 * S
word_cy = 688
base.alpha_composite(lg, (W // 2 - cluster_w // 2, CY * S - LS // 2))
base.alpha_composite(glowl, (text_left - pad, word_cy * S - tmask.height // 2))
base.alpha_composite(chrome, (text_left - pad, word_cy * S - tmask.height // 2))

# ---------- 12. tagline ----------
tag = "AI NEWS  •  TOOLS  •  FUTURE"
tfnt = pick(F_BOLD, 96)
track = 30
widths = [dummy.textlength(ch, font=tfnt) for ch in tag]
tagw = int(sum(widths) + track * (len(tag) - 1))
tagmask = Image.new("L", (tagw + 40, 200), 0)
tgtd = ImageDraw.Draw(tagmask)
x = 20
for ch, cw in zip(tag, widths):
    tgtd.text((x, 40), ch, font=tfnt, fill=255)
    x += cw + track
tcol = Image.new("RGBA", tagmask.size, (168, 235, 255, 0))
tcol.putalpha(tagmask)
tglow = tagmask.filter(ImageFilter.GaussianBlur(9))
tgl = Image.new("RGBA", tagmask.size, (56, 189, 248, 0))
tgl.putalpha(tglow.point(lambda v: int(v * 0.45)))
tag_cy = 838
base.alpha_composite(tgl, (W // 2 - tagmask.width // 2, tag_cy * S - 100))
base.alpha_composite(tcol, (W // 2 - tagmask.width // 2, tag_cy * S - 100))
print("cluster:", "logo box w", LS // S, "| text w", tw // S, "| font", fsize,
      "| left", (W // 2 - cluster_w // 2) // S, "| right", (W // 2 + cluster_w // 2) // S,
      "| tagw", tagw // S)

# ---------- 13. downscale + save ----------
final = base.convert("RGB").resize((2560, 1440), Image.Resampling.LANCZOS)
final = final.filter(ImageFilter.UnsharpMask(radius=2, percent=55, threshold=3))
png = os.path.join(OUT, "sesemi-youtube-banner.png")
jpg = os.path.join(OUT, "sesemi-youtube-banner.jpg")
final.save(png, optimize=True)
final.save(jpg, quality=92, subsampling=1, optimize=True)
final.crop((SX0, SY0, SX1, SY1)).save(os.path.join(OUT, "preview-mobile-1546x423.jpg"), quality=90)
final.crop((0, SY0, 2560, SY1)).save(os.path.join(OUT, "preview-desktop-2560x423.jpg"), quality=90)
if os.path.exists(GUIDE):
    gu = Image.open(GUIDE).convert("RGBA")
    Image.blend(final.convert("RGBA"), gu, 0.45).convert("RGB").save(
        os.path.join(OUT, "preview-safe-overlay.jpg"), quality=90)
for f in ["sesemi-youtube-banner.png", "sesemi-youtube-banner.jpg",
          "preview-mobile-1546x423.jpg", "preview-desktop-2560x423.jpg", "preview-safe-overlay.jpg"]:
    p = os.path.join(OUT, f)
    if os.path.exists(p):
        print(f, round(os.path.getsize(p) / 1024), "KB")
print("done in", round(time.time() - t0, 1), "s")
