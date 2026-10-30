#!/usr/bin/env python3
"""生成 PWA 图标（纯标准库，无 Pillow 依赖）。"""
import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'apps/web/public'
TEAL = (15, 118, 110, 255)
WHITE = (255, 255, 255, 255)
SS = 4


def rounded_rect_alpha(x, y, size, radius):
    cx = min(max(x, radius), size - radius)
    cy = min(max(y, radius), size - radius)
    if radius <= x <= size - radius or radius <= y <= size - radius:
        return 255
    d = math.hypot(x - cx, y - cy)
    return 255 if d <= radius else 0


def segment_distance(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    t = 0.0 if vx * vx + vy * vy == 0 else max(0.0, min(1.0, (wx * vx + wy * vy) / (vx * vx + vy * vy)))
    return math.hypot(px - (ax + t * vx), py - (ay + t * vy))


def draw(size, rounded, maskable=False):
    hi = size * SS
    s = hi
    bg = bytearray(s * s * 4)
    radius = 0 if maskable else s * 0.22
    for y in range(s):
        for x in range(s):
            i = (y * s + x) * 4
            a = 255 if maskable else rounded_rect_alpha(x + 0.5, y + 0.5, s, radius)
            bg[i:i + 4] = bytes((*TEAL[:3], a))

    ax, ay = s * 0.27, s * 0.73
    bx, by = s * 0.73, s * 0.27
    width = s * 0.075
    for y in range(s):
        for x in range(s):
            if segment_distance(x, y, ax, ay, bx, by) <= width:
                i = (y * s + x) * 4
                bg[i:i + 4] = bytes(WHITE)

    # 两个站点圆点：白环 + 青芯
    for cx, cy, r in ((s * 0.36, s * 0.64, s * 0.055), (s * 0.64, s * 0.36, s * 0.055)):
        for y in range(max(0, int(cy - r * 2)), min(s, int(cy + r * 2))):
            for x in range(max(0, int(cx - r * 2)), min(s, int(cx + r * 2))):
                d = math.hypot(x - cx, y - cy)
                if d <= r:
                    i = (y * s + x) * 4
                    bg[i:i + 4] = bytes(WHITE)
                elif d <= r * 0.48:
                    i = (y * s + x) * 4
                    bg[i:i + 4] = bytes(TEAL)

    # 降采样
    out = bytearray(size * size * 4)
    for y in range(size):
        for x in range(size):
            r = g = b = a = 0
            for dy in range(SS):
                for dx in range(SS):
                    i = ((y * SS + dy) * s + (x * SS + dx)) * 4
                    r += bg[i]
                    g += bg[i + 1]
                    b += bg[i + 2]
                    a += bg[i + 3]
            n = SS * SS
            o = (y * size + x) * 4
            out[o:o + 4] = bytes((r // n, g // n, b // n, a // n))
    return out


def png(path, size, data):
    raw = b''.join(b'\x00' + bytes(data[y * size * 4:(y + 1) * size * 4]) for y in range(size))

    def chunk(tag, payload):
        return struct.pack('>I', len(payload)) + tag + payload + struct.pack('>I', zlib.crc32(tag + payload) & 0xFFFFFFFF)

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    path.write_bytes(
        b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    )


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        png(OUT / f'icon-{size}.png', size, draw(size, rounded=True))
    png(OUT / 'icon-maskable-512.png', 512, draw(512, rounded=False, maskable=True))
    png(OUT / 'apple-touch-icon.png', 180, draw(180, rounded=False, maskable=True))
    (OUT / 'favicon.svg').write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
        '<rect width="64" height="64" rx="14" fill="#0f766e"/>'
        '<path d="M17 47 L47 17" stroke="#fff" stroke-width="5" stroke-linecap="round"/>'
        '<path d="M41 12 L51 12 L51 22" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'
        '<circle cx="23" cy="41" r="4" fill="#0f766e" stroke="#fff" stroke-width="2.5"/>'
        '<circle cx="41" cy="23" r="4" fill="#0f766e" stroke="#fff" stroke-width="2.5"/>'
        '</svg>\n',
        encoding='utf-8',
    )
    print('icons written to', OUT)
