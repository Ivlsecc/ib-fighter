"""Hand-drawn, original pixel-art "glitch entity" for the 0-day boss — a triangular
one-eyed shape with thin limbs, evoking an abstract "geometric anomaly" without copying
any specific copyrighted character's design (no hat/bowtie/cane, different palette).
Procedurally drawn with PIL, not sourced from any external asset."""
import os
from PIL import Image, ImageDraw

OUT = "../img/zeroday"
os.makedirs(OUT, exist_ok=True)

W, H = 48, 48
BODY = (20, 22, 32, 255)
OUTLINE = (230, 60, 60, 255)  # matches --cat-zeroday red
IRIS_CYAN = (34, 211, 238, 255)
IRIS_MAGENTA = (233, 30, 140, 255)
PUPIL = (10, 10, 14, 255)
LIMB = (230, 60, 60, 255)


def triangle_points(apex_y=4, base_y=38, half_base=20, cx=24):
    return [(cx, apex_y), (cx - half_base, base_y), (cx + half_base, base_y)]


def draw_body(d, apex_y=4, base_y=38, half_base=20, cx=24, outline_w=2):
    pts = triangle_points(apex_y, base_y, half_base, cx)
    d.polygon(pts, fill=BODY, outline=OUTLINE)
    for i in range(outline_w - 1):
        d.polygon(pts, outline=OUTLINE)


def draw_eye(d, cx, cy, r, iris_color, pupil_open=1.0, squint=False):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(245, 245, 250, 255), outline=(10, 10, 14, 255))
    if squint:
        d.line([cx - r + 1, cy, cx + r - 1, cy], fill=PUPIL, width=3)
    else:
        pr = max(1, int(r * 0.55 * pupil_open))
        d.ellipse([cx - pr, cy - r * 0.7, cx + pr, cy + r * 0.7], fill=iris_color)
        d.ellipse([cx - pr * 0.4, cy - pr * 0.4, cx + pr * 0.4, cy + pr * 0.4], fill=PUPIL)


def draw_limbs(d, cx, base_y, half_base, lifted=False):
    ly = base_y - 2
    ay = ly - (8 if lifted else 0)
    # thin stick arms
    d.line([(cx - half_base + 4, ly - 6), (cx - half_base - 4, ay - 6)], fill=LIMB, width=2)
    d.line([(cx + half_base - 4, ly - 6), (cx + half_base + 4, ay - 6)], fill=LIMB, width=2)
    # thin stick legs
    d.line([(cx - 8, base_y), (cx - 10, base_y + 8)], fill=LIMB, width=2)
    d.line([(cx + 8, base_y), (cx + 10, base_y + 8)], fill=LIMB, width=2)


def new_canvas():
    return Image.new("RGBA", (W, H), (0, 0, 0, 0))


def save(im, name):
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    scale = max(1, round(320 / im.size[1]))
    im = im.resize((im.size[0] * scale, im.size[1] * scale), Image.NEAREST)
    path = f"{OUT}/{name}.png"
    im.save(path)
    print("saved", path, im.size)


# idle: calm single cyan eye, limbs at rest
im = new_canvas()
d = ImageDraw.Draw(im)
draw_body(d)
draw_limbs(d, 24, 38, 20, lifted=False)
draw_eye(d, 24, 20, 8, IRIS_CYAN)
save(im, "idle")

# attack: eye wide/magenta, limbs raised, jagged glitch spikes off the outline
im = new_canvas()
d = ImageDraw.Draw(im)
draw_body(d, apex_y=2, half_base=22)
draw_limbs(d, 24, 38, 22, lifted=True)
draw_eye(d, 24, 19, 9, IRIS_MAGENTA, pupil_open=1.3)
for gx, gy, gl in [(6, 14, 5), (40, 10, -5), (10, 30, 4), (37, 28, -4)]:
    d.line([(gx, gy), (gx + gl, gy + 3)], fill=IRIS_MAGENTA, width=2)
save(im, "attack")

# hit: squinted eye, tilted body
im = new_canvas()
d = ImageDraw.Draw(im)
draw_body(d, apex_y=6, base_y=36, half_base=18, cx=22)
draw_limbs(d, 22, 36, 18, lifted=False)
draw_eye(d, 22, 20, 7, IRIS_CYAN, squint=True)
im = im.rotate(-6, resample=Image.BICUBIC, expand=True)
save(im, "hit")

print("done")
