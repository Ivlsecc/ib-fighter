"""One-off extraction: pull single representative pose frames out of each downloaded
asset pack (mixed formats: per-frame files, horizontal sheets, grid sheets) and save
them as trimmed, upscaled PNGs the game can <img> directly. Run once from this dir."""
import os
from PIL import Image

OUT_H = 320  # target height after upscale, aspect preserved


def save_trimmed(im, out_path, target_h=OUT_H):
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    w, h = im.size
    scale = max(1, round(target_h / h))
    im = im.resize((w * scale, h * scale), Image.NEAREST)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    im.save(out_path)
    print("saved", out_path, im.size)


def sheet_cell(path, cell_w, cell_h, col, row):
    im = Image.open(path).convert("RGBA")
    return im.crop((col * cell_w, row * cell_h, col * cell_w + cell_w, row * cell_h + cell_h))


OUT = "../../assets/img"  # -> ib-fighter/assets/img/<id>/<pose>.png

# The player is NOT extracted here any more — he is drawn from scratch by
# generate_player_pixel.py. This script used to pull him out of a boxer sprite
# pack, and running it would silently overwrite the hand-drawn sprites.

# --- worm: horizontal sheets, 90x90 cells ---
WORM = "worm/extracted/Fire Worm/Sprites/Worm"
save_trimmed(sheet_cell(f"{WORM}/Idle.png", 90, 90, 0, 0), f"{OUT}/worm/idle.png")
save_trimmed(sheet_cell(f"{WORM}/Attack.png", 90, 90, 10, 0), f"{OUT}/worm/attack.png")
save_trimmed(sheet_cell(f"{WORM}/Get Hit.png", 90, 90, 1, 0), f"{OUT}/worm/hit.png")

# --- malware: side-view crawling beetle (clearer silhouette than the front-on wings pose) ---
INSECT = "malware/extracted"
save_trimmed(sheet_cell(f"{INSECT}/BeetleMove.png", 32, 32, 1, 2), f"{OUT}/malware/idle.png")
save_trimmed(sheet_cell(f"{INSECT}/BeetleAttack.png", 32, 32, 3, 2), f"{OUT}/malware/attack.png")

# --- phishing: clownfish (Fishie Sprite, AshenThrone), 64x64 grid ---
FISH = "phishing_v2/extracted/Animations"
save_trimmed(sheet_cell(f"{FISH}/Idling Actions/normalidle.png", 64, 64, 0, 0), f"{OUT}/phishing/idle.png")
save_trimmed(sheet_cell(f"{FISH}/Normal Actions/normaltiltupchomp.png", 64, 64, 1, 0), f"{OUT}/phishing/attack.png")
save_trimmed(sheet_cell(f"{FISH}/Normal Actions/Fishieouch.png", 64, 64, 0, 0), f"{OUT}/phishing/hit.png")

# 0-day boss art is hand-drawn (see generate_zeroday.py) — the ankousse26 robot pack
# downloaded earlier is no longer used for it (kept under zeroday/ for provenance only).

# --- trojan: Farm horse FREE (ToffeeCraft), 32x32 grid ---
HORSE = "trojan/extracted/FarmHorsePack"
save_trimmed(sheet_cell(f"{HORSE}/Idle.png", 32, 32, 0, 0), f"{OUT}/trojan/idle.png")
save_trimmed(sheet_cell(f"{HORSE}/Eating.png", 32, 32, 5, 0), f"{OUT}/trojan/attack.png")

print("done")
