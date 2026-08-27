"""Hand-drawn pixel-art icons for every inventory item and fallback action.

Each icon is drawn on a 24x24 logical grid with hard integer edges, then
nearest-upscaled -- same technique as the player sprite. Every icon also gets
a "held" variant with two gloved fists gripping it, which is what gets shown
over the player's chest once an item is picked.

Colours follow the category accents already used by the legend and the HUD,
so an icon's tint tells you which threat family it answers.

Produces assets/img/items/<id>.png and assets/img/items/held/<id>.png
"""
import os

from PIL import Image, ImageDraw

S = 24            # logical icon size
UPSCALE = 5
HELD_W, HELD_H = 34, 32
HELD_UPSCALE = 6

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, "..", "img", "items")
OUT_HELD = os.path.join(OUT, "held")

T = (0, 0, 0, 0)
K = (16, 18, 24, 255)        # outline
DK = (34, 38, 48, 255)       # dark fill
MD = (78, 86, 104, 255)      # mid grey
LT = (150, 160, 180, 255)    # light grey
WT = (240, 244, 252, 255)    # near-white
GL = (196, 202, 216, 255)    # glass / screen

# category accents (match style.css --cat-*)
NET = (29, 78, 216, 255)
MAL = (126, 34, 206, 255)
WEB = (21, 128, 61, 255)
SOC = (194, 65, 12, 255)
ZERO = (220, 38, 38, 255)
UNI = (84, 91, 127, 255)

RED = (198, 54, 54, 255)
ORG = (226, 138, 38, 255)
YEL = (240, 200, 70, 255)
BRN = (150, 74, 52, 255)
BRN2 = (112, 54, 38, 255)
GRN = (72, 176, 96, 255)
CYN = (60, 190, 210, 255)
SKIN = (232, 226, 204, 255)


class Pad:
    """Tiny drawing surface: every helper takes integer pixel coordinates."""

    def __init__(self, w=S, h=S):
        self.im = Image.new("RGBA", (w, h), T)
        self.d = ImageDraw.Draw(self.im)
        self.px = self.im.load()
        self.w, self.h = w, h

    def dot(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[x, y] = c

    def run(self, y, x0, x1, c):
        for x in range(x0, x1 + 1):
            self.dot(x, y, c)

    def col(self, x, y0, y1, c):
        for y in range(y0, y1 + 1):
            self.dot(x, y, c)

    def rect(self, x0, y0, x1, y1, c):
        self.d.rectangle([x0, y0, x1, y1], fill=c)

    def frame(self, x0, y0, x1, y1, c):
        self.d.rectangle([x0, y0, x1, y1], outline=c)

    def ellipse(self, x0, y0, x1, y1, c, outline=None):
        self.d.ellipse([x0, y0, x1, y1], fill=c, outline=outline)

    def poly(self, pts, c, outline=None):
        self.d.polygon(pts, fill=c, outline=outline)

    def line(self, pts, c):
        self.d.line(pts, fill=c)


def shield(p, accent, x0=3, y0=2, x1=20, y1=21):
    """Common shield silhouette used by several of the defensive items."""
    mid = (x0 + x1) // 2
    p.poly([(x0, y0), (x1, y0), (x1, y1 - 7), (mid, y1), (x0, y1 - 7)],
           accent, outline=K)
    # inner bevel: lit on the left, shaded on the right
    p.poly([(x0 + 2, y0 + 2), (mid, y0 + 2), (mid, y1 - 3), (x0 + 2, y1 - 8)],
           tuple(min(255, int(v * 1.35)) for v in accent[:3]) + (255,))
    p.poly([(mid, y0 + 2), (x1 - 2, y0 + 2), (x1 - 2, y1 - 8), (mid, y1 - 3)],
           tuple(int(v * 0.72) for v in accent[:3]) + (255,))


# --------------------------------------------------------------- icons

def icon_firewall():
    """Brick wall taking flame -- the wall holds, the fire does not pass."""
    p = Pad()
    p.rect(2, 9, 21, 21, BRN2)
    for i, y in enumerate(range(10, 21, 3)):
        p.run(y + 2, 2, 21, BRN2)
        offset = 0 if i % 2 == 0 else 3
        for x in range(2 + offset, 22, 6):
            p.rect(x, y, min(21, x + 4), y + 1, BRN)
    p.frame(2, 9, 21, 21, K)
    # flame licking over the top
    p.poly([(9, 8), (11, 2), (13, 5), (15, 1), (16, 8)], ORG, outline=K)
    p.poly([(11, 8), (12, 4), (14, 8)], YEL)
    p.col(6, 6, 8, ORG)
    p.col(18, 5, 8, ORG)
    return p.im


def icon_waf():
    """Browser window with a shield standing in front of it."""
    p = Pad()
    p.rect(1, 3, 22, 19, DK)
    p.frame(1, 3, 22, 19, K)
    p.rect(2, 4, 21, 7, MD)          # title bar
    for x in (4, 7, 10):
        p.dot(x, 5, LT)
    p.rect(2, 8, 21, 18, GL)         # page area
    for y in (10, 12, 14):
        p.run(y, 4, 19, MD)
    shield(p, WEB, x0=6, y0=8, x1=18, y1=22)
    return p.im


def icon_sql():
    """Database cylinder draining through a funnel -- the filter."""
    p = Pad()
    light = tuple(min(255, int(v * 1.45)) for v in WEB[:3]) + (255,)
    # cylinder body with two banding lines so it reads as stacked discs
    p.rect(3, 4, 20, 13, WEB)
    p.col(3, 4, 13, K)
    p.col(20, 4, 13, K)
    for y in (7, 10):
        p.ellipse(3, y, 20, y + 3, WEB, outline=K)
    p.ellipse(3, 11, 20, 15, WEB, outline=K)     # bottom cap
    p.ellipse(3, 1, 20, 6, light, outline=K)     # top cap catches the light
    # funnel in grey so it separates from the green drum above it
    p.poly([(5, 16), (18, 16), (13, 20), (13, 23), (10, 23), (10, 20)],
           LT, outline=K)
    p.run(17, 7, 16, WT)
    return p.im


def icon_edr():
    """Monitor with a bug on screen and a magnifier held clear of it, so the
    two shapes stay separable at 24 px."""
    p = Pad()
    p.rect(0, 2, 18, 16, DK)
    p.frame(0, 2, 18, 16, K)
    p.rect(2, 4, 16, 14, GL)
    p.rect(7, 17, 11, 19, MD)        # stand
    p.run(20, 5, 13, K)
    # bug, kept on the left half of the screen
    p.ellipse(4, 6, 10, 12, MAL, outline=K)
    p.run(9, 5, 9, K)
    p.line([(4, 7), (2, 5)], K)
    p.line([(10, 7), (12, 5)], K)
    p.line([(4, 11), (2, 13)], K)
    p.line([(10, 11), (12, 13)], K)
    # magnifier over the lower-right corner, overlapping the bezel not the bug
    p.ellipse(11, 9, 21, 19, GL, outline=K)
    p.ellipse(13, 11, 19, 17, WT)
    p.line([(20, 18), (23, 22)], K)
    p.line([(19, 19), (22, 23)], K)
    return p.im


def icon_antivirus():
    """Shield with a virus struck through."""
    p = Pad()
    shield(p, MAL)
    p.ellipse(8, 7, 15, 14, WT, outline=K)
    for dx, dy in ((0, -3), (0, 3), (-3, 0), (3, 0)):
        p.dot(11 + dx, 10 + dy, K)
        p.dot(12 + dx, 11 + dy, K)
    p.line([(6, 5), (17, 16)], RED)
    p.line([(6, 6), (17, 17)], RED)
    return p.im


def icon_cookies():
    """Cookie with a padlock clipped to it."""
    p = Pad()
    p.ellipse(2, 4, 17, 19, BRN, outline=K)
    p.ellipse(4, 6, 15, 17,
              tuple(min(255, int(v * 1.18)) for v in BRN[:3]) + (255,))
    for x, y in ((6, 8), (11, 7), (8, 13), (13, 12), (5, 15)):
        p.rect(x, y, x + 1, y + 1, BRN2)
    # padlock
    p.rect(13, 13, 21, 20, SOC)
    p.frame(13, 13, 21, 20, K)
    p.ellipse(15, 9, 19, 15, T, outline=K)
    p.col(17, 16, 18, K)
    return p.im


def icon_mfa():
    """Phone showing a one-time code, with a key beside it."""
    p = Pad()
    p.rect(3, 1, 14, 22, DK)
    p.frame(3, 1, 14, 22, K)
    p.rect(4, 4, 13, 18, GL)
    p.run(2, 7, 10, MD)
    p.run(20, 7, 10, MD)
    for y in (7, 11, 15):            # code digits
        for x in range(5, 13, 3):
            p.rect(x, y, x + 1, y + 2, SOC)
    # key
    p.ellipse(15, 6, 21, 12, YEL, outline=K)
    p.ellipse(17, 8, 19, 10, T, outline=K)
    p.rect(17, 12, 19, 20, YEL)
    p.frame(17, 12, 19, 20, K)
    p.rect(20, 15, 22, 16, YEL)
    p.rect(20, 18, 22, 19, YEL)
    return p.im


def icon_ids():
    """Radar sweep with a contact -- it sees, it does not block."""
    p = Pad()
    p.ellipse(1, 1, 22, 22, (16, 30, 24, 255), outline=K)
    for r in (4, 8):
        p.ellipse(11 - r, 11 - r, 12 + r, 12 + r, T, outline=GRN)
    p.line([(2, 11), (21, 11)], (34, 82, 56, 255))
    p.line([(11, 2), (11, 21)], (34, 82, 56, 255))
    p.poly([(11, 11), (21, 4), (22, 11)], (72, 176, 96, 110))
    p.line([(11, 11), (21, 4)], WT)
    p.rect(15, 15, 17, 17, RED)      # contact blip
    p.dot(14, 14, (255, 140, 140, 255))
    p.dot(11, 11, WT)
    return p.im


def icon_patch():
    """Sticking plaster over a crack."""
    p = Pad()
    p.line([(4, 20), (8, 13), (6, 11), (11, 4)], ZERO)
    p.line([(5, 20), (9, 13), (7, 11), (12, 4)], ZERO)
    p.poly([(4, 10), (10, 3), (20, 12), (13, 19)], SKIN, outline=K)
    p.poly([(8, 7), (12, 4), (19, 11), (15, 15)],
           tuple(min(255, int(v * 1.06)) for v in SKIN[:3]) + (255,))
    for dx, dy in ((0, 0), (3, 3), (-3, -3), (3, -3), (-3, 3)):
        p.dot(12 + dx, 11 + dy, BRN2)
    return p.im


def icon_reboot():
    """Power symbol: a broken ring with a bar through the gap."""
    p = Pad()
    for inset in (0, 1):
        p.ellipse(3 + inset, 3 + inset, 20 - inset, 20 - inset, T, outline=UNI)
    p.rect(9, 2, 14, 8, T)           # clear the gap at the top of the ring
    p.rect(10, 2, 13, 11, UNI)       # power bar
    p.frame(10, 2, 13, 11, K)
    p.run(11, 10, 13, WT)
    return p.im


def icon_avast():
    """Generic consumer-antivirus badge -- deliberately not any real logo."""
    p = Pad()
    shield(p, ORG)
    p.poly([(7, 11), (10, 15), (16, 7), (17, 9), (10, 18), (6, 12)],
           WT, outline=K)
    return p.im


ICONS = {
    "firewall": icon_firewall,
    "waf": icon_waf,
    "param_queries": icon_sql,
    "edr": icon_edr,
    "antivirus": icon_antivirus,
    "httponly_cookies": icon_cookies,
    "mfa": icon_mfa,
    "ids": icon_ids,
    "patch": icon_patch,
    "reboot": icon_reboot,
    "avast": icon_avast,
}


# ----------------------------------------------------------------- held

def held(icon):
    """Icon gripped by two gloved hands, sized to sit over the player's chest.

    The fingers are drawn ON TOP of the icon's lower corners -- hands set
    beside the icon just read as two dark blocks, and the item looks like it
    is floating rather than being held.
    """
    p = Pad(HELD_W, HELD_H)
    p.im.paste(icon, (5, 0), icon)

    # gloves are mid-grey, not the suit's near-black: held over the player's
    # own dark jacket, black-on-black hands simply vanish
    GLOVE = MD
    GLOVE_LT = LT

    def hand(x0, mirror=False):
        sign = -1 if mirror else 1

        def rx(dx):
            return x0 + sign * dx

        top = HELD_H - 11
        # palm
        a, b = sorted((rx(0), rx(6)))
        p.rect(a, top + 2, b, top + 10, GLOVE)
        p.frame(a, top + 2, b, top + 10, K)
        # cuff
        c, e = sorted((rx(-1), rx(1)))
        p.rect(c, top + 7, e, top + 10, DK)
        p.frame(c, top + 7, e, top + 10, K)
        # fingers curling over the front face of the item
        for dy in (0, 3):
            f0, f1 = sorted((rx(3), rx(9)))
            p.rect(f0, top + dy, f1, top + dy + 1, GLOVE)
            p.frame(f0, top + dy, f1, top + dy + 1, K)
            p.dot(rx(8), top + dy, GLOVE_LT)
        # thumb hooked under
        t0, t1 = sorted((rx(4), rx(8)))
        p.rect(t0, top + 7, t1, top + 8, GLOVE)
        p.frame(t0, top + 7, t1, top + 8, K)

    hand(1)
    hand(HELD_W - 2, mirror=True)
    return p.im


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(OUT_HELD, exist_ok=True)
    for name, fn in ICONS.items():
        icon = fn()
        icon.resize((S * UPSCALE, S * UPSCALE), Image.NEAREST).save(
            os.path.join(OUT, f"{name}.png"))
        h = held(icon)
        h.resize((HELD_W * HELD_UPSCALE, HELD_H * HELD_UPSCALE),
                 Image.NEAREST).save(os.path.join(OUT_HELD, f"{name}.png"))
        print("saved", name)

    # contact sheet for eyeballing them side by side
    cols = len(ICONS)
    sheet = Image.new("RGBA", (cols * (S + 2) * UPSCALE, (S + 2) * UPSCALE),
                      (238, 241, 250, 255))
    for i, (name, fn) in enumerate(ICONS.items()):
        big = fn().resize((S * UPSCALE, S * UPSCALE), Image.NEAREST)
        sheet.paste(big, (i * (S + 2) * UPSCALE + UPSCALE, UPSCALE), big)
    sheet.convert("RGB").save(os.path.join(OUT, "_sheet.png"))


if __name__ == "__main__":
    main()
