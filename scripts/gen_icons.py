#!/usr/bin/env python3
"""Generate simple PNG icons (no external deps) for the Electron demo.

Creates:
  electron/assets/tray.png         22x22  blurple rounded square
  electron/assets/tray-unread.png  22x22  same + red unread dot
  electron/assets/icon.png        256x256 app icon
"""
import os
import zlib
import struct
import math

OUT = os.path.join(os.path.dirname(__file__), "..", "electron", "assets")
os.makedirs(OUT, exist_ok=True)

BLURPLE = (88, 101, 242)   # #5865F2
WHITE = (255, 255, 255)
RED = (237, 66, 69)        # #ED4245


def blend(dst, src, a):
    return tuple(int(round(d * (1 - a) + s * a)) for d, s in zip(dst, src))


def new_canvas(size):
    # RGBA, transparent
    return [[(0, 0, 0, 0) for _ in range(size)] for _ in range(size)]


def put(px, x, y, rgb, a):
    if a <= 0:
        return
    if x < 0 or y < 0 or x >= len(px) or y >= len(px):
        return
    dr, dg, db, da = px[y][x]
    out_a = a + da * (1 - a)
    if out_a <= 0:
        px[y][x] = (0, 0, 0, 0)
        return
    r = (rgb[0] * a + dr * da * (1 - a)) / out_a
    g = (rgb[1] * a + dg * da * (1 - a)) / out_a
    b = (rgb[2] * a + db * da * (1 - a)) / out_a
    px[y][x] = (int(round(r)), int(round(g)), int(round(b)), int(round(out_a * 255)))


def rounded_rect(px, size, pad, radius, rgb):
    """Anti-aliased filled rounded square."""
    x0, y0 = pad, pad
    x1, y1 = size - pad, size - pad
    ss = 4  # supersample for AA
    for y in range(size):
        for x in range(size):
            hits = 0
            for sy in range(ss):
                for sx in range(ss):
                    fx = x + (sx + 0.5) / ss
                    fy = y + (sy + 0.5) / ss
                    # distance to rounded rect
                    cx = min(max(fx, x0 + radius), x1 - radius)
                    cy = min(max(fy, y0 + radius), y1 - radius)
                    inside_core = (x0 <= fx <= x1) and (y0 <= fy <= y1)
                    d = math.hypot(fx - cx, fy - cy)
                    if inside_core and d <= radius:
                        hits += 1
            a = hits / (ss * ss)
            if a > 0:
                put(px, x, y, rgb, a)


def filled_circle(px, size, cx, cy, r, rgb):
    ss = 4
    for y in range(int(cy - r - 1), int(cy + r + 2)):
        for x in range(int(cx - r - 1), int(cx + r + 2)):
            hits = 0
            for sy in range(ss):
                for sx in range(ss):
                    fx = x + (sx + 0.5) / ss
                    fy = y + (sy + 0.5) / ss
                    if math.hypot(fx - cx, fy - cy) <= r:
                        hits += 1
            a = hits / (ss * ss)
            if a > 0:
                put(px, x, y, rgb, a)


def speech_bubble(px, size, rgb):
    """Simple chat-bubble glyph centered."""
    # rounded rect body
    pad = int(size * 0.30)
    bod_pad = pad
    rounded_rect(px, size, bod_pad, int(size * 0.10), rgb)
    # tail
    tsize = int(size * 0.12)
    ty = size - bod_pad
    tx = int(size * 0.40)
    for i in range(tsize):
        for j in range(tsize - i):
            put(px, tx + j, ty + i, rgb, 1.0)


def png_bytes(px, size):
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter type 0
        for x in range(size):
            r, g, b, a = px[y][x]
            raw += bytes((
                max(0, min(255, r)),
                max(0, min(255, g)),
                max(0, min(255, b)),
                max(0, min(255, a)),
            ))

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    idat = zlib.compress(bytes(raw), 9)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


def write_png(path, px, size):
    with open(path, "wb") as f:
        f.write(png_bytes(px, size))
    print("wrote", path)


def make_tray(unread):
    size = 22
    px = new_canvas(size)
    speech_bubble(px, size, BLURPLE)
    if unread:
        filled_circle(px, size, size - 5, 5, 4.2, RED)
    return px, size


def make_app_icon():
    size = 256
    px = new_canvas(size)
    rounded_rect(px, size, int(size * 0.10), int(size * 0.22), BLURPLE)
    speech_bubble(px, size, WHITE)
    return px, size


t, s = make_tray(False)
write_png(os.path.join(OUT, "tray.png"), t, s)
t, s = make_tray(True)
write_png(os.path.join(OUT, "tray-unread.png"), t, s)
a, s = make_app_icon()
write_png(os.path.join(OUT, "icon.png"), a, s)
print("done")
