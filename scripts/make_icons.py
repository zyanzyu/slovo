import math
import struct
import zlib
from pathlib import Path

BG = (24, 35, 29)
CREAM = (244, 240, 232)
SS = 4


def png_bytes(width, height, pixels):
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)
        raw.extend(pixels[y * stride:(y + 1) * stride])

    def chunk(tag, data):
        return (
            struct.pack('>I', len(data))
            + tag
            + data
            + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    header = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b'')


def render(size):
    big = size * SS
    center = big / 2
    outer = big * 0.322
    inner = big * 0.207
    gap = 38.0

    hi = bytearray(big * big * 4)
    for y in range(big):
        dy = y + 0.5 - center
        row = y * big * 4
        for x in range(big):
            dx = x + 0.5 - center
            d = math.hypot(dx, dy)
            color = BG
            if inner <= d <= outer:
                angle = math.degrees(math.atan2(dy, dx))
                if angle < 0:
                    angle += 360
                if angle > gap and angle < 360 - gap:
                    color = CREAM
            i = row + x * 4
            hi[i] = color[0]
            hi[i + 1] = color[1]
            hi[i + 2] = color[2]
            hi[i + 3] = 255

    out = bytearray(size * size * 4)
    area = SS * SS
    for y in range(size):
        for x in range(size):
            r = g = b = 0
            for sy in range(SS):
                base = ((y * SS + sy) * big + x * SS) * 4
                for sx in range(SS):
                    i = base + sx * 4
                    r += hi[i]
                    g += hi[i + 1]
                    b += hi[i + 2]
            i = (y * size + x) * 4
            out[i] = round(r / area)
            out[i + 1] = round(g / area)
            out[i + 2] = round(b / area)
            out[i + 3] = 255
    return bytes(out)


def main():
    out_dir = Path('public/icons')
    out_dir.mkdir(parents=True, exist_ok=True)
    for size in (192, 180, 512):
        data = render(size)
        (out_dir / f'icon-{size}.png').write_bytes(png_bytes(size, size, data))
        print('wrote', size)


if __name__ == '__main__':
    main()
