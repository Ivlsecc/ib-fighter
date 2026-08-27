"""Hand-drawn pixel-art player sprite: a suited figure in a Guy Fawkes /
Anonymous mask. Nothing is traced or cut out of a photo -- the figure is
drawn shape by shape on a 64x80 logical grid with hard integer edges (no
anti-aliasing), then nearest-upscaled.

Two things are deliberate:

* The mask features are plotted pixel by pixel rather than as polygons. At
  ~18 px of face width a polygon edge lands a pixel wide of where it should
  and the brows, eyes and moustache smear into one dark blob.
* Head and body are drawn as separate layers and composed with per-state
  offsets, and leaning is done with an integer-per-row shear rather than a
  rotation. Rotating by an arbitrary angle resamples and blurs the pixel
  grid; shearing by whole pixels keeps every edge crisp. The one rotation
  used is KO's 90 degrees, which is lossless.

Produces assets/img/player/{idle,punch,block,hurt,ko}.png
"""
import os

from PIL import Image, ImageDraw

W, H = 64, 80
UPSCALE = 7

HERE = os.path.dirname(__file__)
OUT_DIR = os.path.join(HERE, "..", "img", "player")

T = (0, 0, 0, 0)

# suit ramp (cool charcoal)
SU0 = (12, 14, 19, 255)
SU1 = (22, 26, 34, 255)
SU2 = (34, 39, 50, 255)
SU3 = (49, 56, 70, 255)
SU4 = (69, 79, 97, 255)

# hat ramp (a touch darker and bluer than the suit)
HA0 = (8, 9, 13, 255)
HA1 = (17, 19, 26, 255)
HA2 = (28, 32, 42, 255)
HA3 = (45, 51, 65, 255)

# mask cream ramp
M0 = (247, 243, 228, 255)
M1 = (234, 228, 206, 255)
M2 = (212, 205, 181, 255)
M3 = (184, 176, 151, 255)

IN = (16, 14, 18, 255)      # mask ink
IN2 = (44, 40, 48, 255)     # softened ink edge

P1 = (208, 116, 112, 255)   # cheek
P2 = (176, 84, 84, 255)

W0 = (246, 249, 255, 255)   # shirt
W1 = (221, 228, 241, 255)
W2 = (186, 195, 214, 255)

R0 = (196, 52, 58, 255)     # tie
R1 = (168, 34, 44, 255)
R2 = (128, 24, 32, 255)
R3 = (88, 16, 24, 255)

GD = (168, 115, 10, 255)    # gold accents
RIM = (18, 92, 112, 255)    # dim cyan sheen along the lit contour


def _layer():
    im = Image.new("RGBA", (W, H), T)
    return im, ImageDraw.Draw(im), im.load()


def draw_body():
    im, d, px = _layer()

    def dot(x, y, c):
        if 0 <= x < W and 0 <= y < H:
            px[x, y] = c

    def run(y, x0, x1, c):
        for x in range(x0, x1 + 1):
            dot(x, y, c)

    def col(x, y0, y1, c):
        for y in range(y0, y1 + 1):
            dot(x, y, c)

    d.polygon([(3, 79), (3, 63), (5, 55), (11, 51), (21, 50), (26, 48),
               (37, 48), (42, 50), (52, 51), (58, 55), (60, 63), (60, 79)],
              fill=SU2)
    d.polygon([(3, 79), (3, 63), (5, 55), (11, 51), (15, 51), (12, 63),
               (11, 79)], fill=SU1)
    d.polygon([(60, 79), (60, 63), (58, 55), (52, 51), (48, 51), (51, 63),
               (52, 79)], fill=SU1)
    d.line([(12, 52), (21, 51), (25, 49)], fill=SU3)
    d.line([(51, 52), (42, 51), (38, 49)], fill=SU3)
    d.line([(15, 53), (13, 66), (13, 79)], fill=SU0)
    d.line([(48, 53), (50, 66), (50, 79)], fill=SU0)
    d.line([(8, 62), (9, 71)], fill=SU1)
    d.line([(55, 62), (54, 71)], fill=SU1)

    # shirt panel
    d.polygon([(24, 49), (39, 49), (38, 70), (32, 77), (25, 70)], fill=W0)
    d.polygon([(33, 52), (38, 63), (35, 73), (32, 77)], fill=W1)
    col(31, 56, 76, W2)

    # waistcoat
    d.polygon([(26, 64), (38, 64), (37, 79), (27, 79)], fill=SU1)
    d.line([(26, 64), (38, 64)], fill=SU0)
    for y in (69, 74, 79):
        dot(32, y, GD)
        dot(32, y - 1, SU0)

    # lapels (collar and tie go on top of these)
    d.polygon([(24, 48), (29, 51), (26, 60), (20, 72), (16, 55)], fill=SU2)
    d.polygon([(39, 48), (34, 51), (37, 60), (43, 72), (47, 55)], fill=SU2)
    d.polygon([(24, 48), (29, 51), (26, 60), (23, 60), (21, 52)], fill=SU3)
    d.polygon([(39, 48), (34, 51), (37, 60), (40, 60), (42, 52)], fill=SU3)
    d.line([(29, 51), (26, 60), (21, 71)], fill=SU0)
    d.line([(34, 51), (37, 60), (42, 71)], fill=SU0)
    d.line([(24, 48), (16, 55)], fill=SU0)
    d.line([(39, 48), (47, 55)], fill=SU0)
    d.line([(27, 53), (25, 60)], fill=SU4)
    d.line([(36, 53), (38, 60)], fill=SU4)

    # collar wings
    d.polygon([(28, 47), (32, 53), (29, 57), (26, 50)], fill=W0)
    d.polygon([(36, 47), (32, 53), (35, 57), (38, 50)], fill=W0)
    d.line([(26, 50), (29, 57)], fill=W2)
    d.line([(38, 50), (35, 57)], fill=W2)
    d.line([(28, 47), (32, 53)], fill=W1)
    d.line([(36, 47), (32, 53)], fill=W1)

    # tie
    d.polygon([(29, 51), (34, 51), (34, 56), (29, 56)], fill=R1)
    d.line([(29, 51), (34, 51)], fill=R0)
    d.polygon([(30, 56), (33, 56), (34, 64), (33, 77), (31, 77), (29, 64)],
              fill=R1)
    d.polygon([(32, 57), (34, 64), (33, 77), (32, 77)], fill=R2)
    d.line([(30, 56), (33, 56)], fill=R3)
    col(30, 57, 74, R0)
    for y in (60, 65, 70):
        d.line([(29, y), (33, y + 2)], fill=R2)
    run(63, 30, 33, GD)
    run(64, 30, 33, SU0)

    # breast pocket + square
    d.line([(41, 62), (46, 63)], fill=SU0)
    run(61, 42, 45, W0)
    dot(43, 60, W1)

    # jacket buttons
    dot(26, 70, SU4)
    dot(37, 70, SU4)

    # neck: drawn with the body so the head can shift without tearing a gap
    d.polygon([(29, 44), (35, 44), (35, 51), (29, 51)], fill=SU1)
    col(29, 44, 51, SU0)
    col(35, 44, 51, SU0)
    col(30, 45, 50, SU2)

    return im


def draw_head():
    im, d, px = _layer()

    def dot(x, y, c):
        if 0 <= x < W and 0 <= y < H:
            px[x, y] = c

    def run(y, x0, x1, c):
        for x in range(x0, x1 + 1):
            dot(x, y, c)

    def col(x, y0, y1, c):
        for y in range(y0, y1 + 1):
            dot(x, y, c)

    # ---------------- face (drawn first; the brim overlaps its top) --------
    d.polygon([(23, 24), (41, 24), (42, 30), (41, 36), (39, 41), (36, 44),
               (32, 47), (28, 44), (25, 41), (23, 36), (22, 30)], fill=M1)

    for y in range(25, 42):
        dot(23, y, M3)
        dot(41, y, M3)
        dot(24, y, M2)
        dot(40, y, M2)
    run(25, 25, 39, M0)
    run(26, 26, 38, M0)
    run(34, 25, 28, M0)
    run(34, 36, 39, M0)
    for y, x0, x1 in ((43, 27, 37), (44, 28, 36), (45, 29, 35), (46, 30, 34)):
        run(y, x0, x1, M2)
    run(45, 30, 34, M3)

    # brows: 2 px, rising toward the temples, cream row kept beneath
    for x, y in ((30, 29), (29, 29), (28, 28), (27, 28), (26, 27), (25, 27)):
        dot(x, y, IN)
        dot(x, y + 1, IN)
    for x, y in ((34, 29), (35, 29), (36, 28), (37, 28), (38, 27), (39, 27)):
        dot(x, y, IN)
        dot(x, y + 1, IN)
    dot(24, 27, IN2)
    dot(40, 27, IN2)

    # eyes
    run(32, 27, 30, IN)
    run(33, 25, 29, IN)
    run(32, 34, 37, IN)
    run(33, 35, 39, IN)
    run(34, 25, 28, IN2)
    run(34, 36, 39, IN2)

    # cheeks
    run(36, 23, 26, P1)
    run(37, 24, 26, P2)
    run(36, 38, 41, P1)
    run(37, 38, 40, P2)

    # nose: lit on the left, shaded on the right
    col(31, 31, 37, M0)
    col(32, 31, 37, M2)
    dot(33, 36, M3)
    run(38, 30, 33, M3)
    dot(30, 37, M3)

    # moustache
    run(39, 30, 33, IN)
    for x, y in ((29, 40), (28, 40), (27, 40), (26, 39), (25, 38)):
        dot(x, y, IN)
    for x, y in ((34, 40), (35, 40), (36, 40), (37, 39), (38, 38)):
        dot(x, y, IN)
    dot(24, 37, IN2)
    dot(40, 37, IN2)

    # smile
    run(42, 29, 34, IN)
    dot(28, 41, IN)
    dot(35, 41, IN)

    # goatee
    run(44, 31, 33, IN)
    dot(32, 45, IN)

    # ---------------- hat ----------------
    d.rectangle([22, 5, 41, 19], fill=HA1)
    d.rectangle([22, 3, 41, 5], fill=HA1)
    d.line([(23, 3), (40, 3)], fill=HA3)
    d.line([(24, 4), (24, 14)], fill=HA2)
    d.line([(25, 4), (25, 13)], fill=HA3)
    d.line([(39, 4), (39, 14)], fill=HA0)
    d.line([(30, 4), (33, 6)], fill=HA0)
    d.rectangle([22, 15, 41, 19], fill=HA0)
    d.line([(22, 15), (41, 15)], fill=HA2)
    d.line([(22, 19), (41, 19)], fill=HA2)
    d.rectangle([36, 16, 38, 18], fill=GD)
    d.rectangle([37, 17, 37, 17], fill=HA0)
    d.ellipse([13, 18, 50, 25], fill=HA1)
    d.ellipse([13, 18, 50, 23], fill=HA2)
    d.line([(17, 21), (46, 21)], fill=HA3)
    d.ellipse([15, 22, 48, 26], fill=HA0)

    return im


# ------------------------------------------------------------------ poses

def shear(im, top_shift):
    """Lean the sprite by shifting each row an integer number of pixels --
    a rotation would resample and soften every edge."""
    out = Image.new("RGBA", im.size, T)
    src = im.load()
    dst = out.load()
    for y in range(H):
        offset = round(top_shift * (1 - y / (H - 1)))
        for x in range(W):
            c = src[x, y]
            if c[3] and 0 <= x + offset < W:
                dst[x + offset, y] = c
    return out


def compose(head_off=(0, 0), body_off=(0, 0), lean=0):
    canvas = Image.new("RGBA", (W, H), T)
    body = Image.new("RGBA", (W, H), T)
    body.paste(draw_body(), body_off)
    head = Image.new("RGBA", (W, H), T)
    head.paste(draw_head(), head_off)
    canvas = Image.alpha_composite(canvas, body)
    canvas = Image.alpha_composite(canvas, head)
    if lean:
        canvas = shear(canvas, lean)
    return canvas


def add_rim(im):
    """One dim cyan pixel down the left-hand contour of the torso. Starts
    below the jaw -- higher up the leftmost opaque pixel is the cheek, and
    the sheen lands on the mask instead of the shoulder."""
    px = im.load()
    for y in range(54, H):
        for x in range(W):
            if px[x, y][3]:
                px[x, y] = RIM
                break
    return im


def recolor(im, mix=None, strength=0.0, scale=1.0):
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if not a:
                continue
            r, g, b = (min(255, int(v * scale)) for v in (r, g, b))
            if mix:
                r = int(r * (1 - strength) + mix[0] * strength)
                g = int(g * (1 - strength) + mix[1] * strength)
                b = int(b * (1 - strength) + mix[2] * strength)
            px[x, y] = (r, g, b, a)
    return out


def build_states():
    idle = add_rim(compose())
    # squares up and leans in at the boss on the right
    punch = add_rim(compose(head_off=(2, 1), body_off=(1, 0), lean=3))
    # sinks the head down between raised shoulders
    block = add_rim(compose(head_off=(0, 3), body_off=(0, -2)))
    # snapped back and to the left, with only a light red flush -- the stage
    # already flashes red and shakes on a hit, so a heavy tint here just
    # turns the whole suit maroon
    hurt = recolor(add_rim(compose(head_off=(-2, -1), lean=-4)),
                   mix=(196, 46, 46), strength=0.12)
    # beaten: head hangs, shoulders drop, colour drains out. A 90-degree
    # rotation would be pixel-exact but the sprite is a bust -- laid on its
    # side the mask stops reading as a face at all.
    ko = recolor(compose(head_off=(-1, 7), body_off=(0, 5), lean=-2),
                 mix=(70, 80, 110), strength=0.28, scale=0.72)
    return {"idle.png": idle, "punch.png": punch, "block.png": block,
            "hurt.png": hurt, "ko.png": ko}


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, im in build_states().items():
        big = im.resize((im.width * UPSCALE, im.height * UPSCALE),
                        Image.NEAREST)
        big.save(os.path.join(OUT_DIR, name))
        print("saved", name, big.size)


if __name__ == "__main__":
    main()
